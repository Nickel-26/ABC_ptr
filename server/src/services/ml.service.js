const { spawn } = require('child_process');
const fsSync = require('fs');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const prisma = require('../db');

const rootDir = path.resolve(__dirname, '..', '..', '..');
const mlDir = path.join(rootDir, 'ml');
const modelPath = path.join(mlDir, 'models', 'solve_model.joblib');
const metricsPath = path.join(mlDir, 'models', 'solve_model_metrics.json');
const metadataPath = path.join(mlDir, 'data', 'cf_problem_metadata.json');
const libompPath = path.join(rootDir, 'server', 'libomp', '22.1.4', 'lib');
const CANDIDATE_POOL_LIMIT = 3000;

function getPythonCommand() {
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;

  const bundledPython = path.join(
    os.homedir(),
    '.cache',
    'codex-runtimes',
    'codex-primary-runtime',
    'dependencies',
    'python',
    process.platform === 'win32' ? 'python.exe' : 'bin/python'
  );

  if (fsSync.existsSync(bundledPython)) return bundledPython;
  return process.platform === 'win32' ? 'python' : 'python3';
}

function runPythonScript(scriptName, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(getPythonCommand(), [path.join(mlDir, scriptName), ...args], {
      cwd: rootDir,
      windowsHide: true,
      env: {
        ...process.env,
        DYLD_LIBRARY_PATH: [
          process.env.DYLD_LIBRARY_PATH,
          libompPath,
          path.join(os.homedir(), 'lib')
        ].filter(Boolean).join(path.delimiter),
      },
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) {
        reject(new Error(stderr || stdout || `Python script exited with code ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`Could not parse ML script output: ${error.message}\n${stdout}`));
      }
    });
  });
}

async function getUserByHandle(handle) {
  const user = await prisma.user.findFirst({
    where: { OR: [{ cfHandle: handle }, { lcUsername: handle }] }
  });
  if (!user) {
    const error = new Error('User not found. Sync the profile before running AI analysis.');
    error.status = 404;
    throw error;
  }
  return user;
}

async function buildCodeforcesPayload(handle) {
  const user = await getUserByHandle(handle);
  const userRating = user.cfRating || user.cfMaxRating || 1200;
  const minRecommendedRating = Math.max(800, Math.floor(userRating / 100) * 100);
  const maxRecommendedRating = userRating + 500;

  const submissions = await prisma.submission.findMany({
    where: { userId: user.id },
    include: {
      problem: {
        include: { tags: { include: { tag: true } } }
      }
    },
    orderBy: { submittedAt: 'asc' }
  });

  const solvedProblemIds = submissions
    .filter(submission => submission.verdict === 'OK')
    .map(submission => submission.problemId);
  const solvedExternalProblemIds = new Set(
    submissions
      .filter(submission => submission.verdict === 'OK')
      .map(submission => submission.problem.problemId)
  );

  let serializedCandidates = [];

  if (fsSync.existsSync(metadataPath)) {
    const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
    serializedCandidates = (metadata.problems || metadata || [])
      .filter(problem => {
        return problem.problem_id
          && !solvedExternalProblemIds.has(problem.problem_id)
          && Array.isArray(problem.tags)
          && problem.tags.length > 0;
      })
      .sort((a, b) => {
        const aRating = a.rating || userRating;
        const bRating = b.rating || userRating;
        const ratingDistance = Math.abs(aRating - userRating) - Math.abs(bRating - userRating);
        if (ratingDistance !== 0) return ratingDistance;
        return (b.solved_count || 0) - (a.solved_count || 0);
      })
      .slice(0, CANDIDATE_POOL_LIMIT)
      .map(problem => ({
        problemId: problem.problem_id,
        name: problem.name,
        rating: problem.rating || userRating,
        popularity: problem.solved_count,
        url: problem.url,
        tags: problem.tags || [],
      }));
  }

  if (serializedCandidates.length < 50) {
    const candidateProblems = await prisma.problem.findMany({
      where: {
        platform: 'CODEFORCES',
        rating: {
          gte: minRecommendedRating,
          lte: maxRecommendedRating
        },
        id: { notIn: solvedProblemIds }
      },
      include: { tags: { include: { tag: true } } },
      orderBy: [{ rating: 'asc' }, { popularity: 'desc' }],
      take: CANDIDATE_POOL_LIMIT
    });

    serializedCandidates = candidateProblems.map(problem => ({
      problemId: problem.problemId,
      name: problem.name,
      rating: problem.rating || userRating,
      popularity: problem.popularity,
      url: problem.url,
      tags: problem.tags.map(problemTag => problemTag.tag.name),
    }));
  }

  return {
    handle,
    userRating,
    candidatePoolSize: serializedCandidates.length,
    submissions: submissions.map(submission => {
      let rating = submission.problem.rating;
      if (rating === null && submission.problem.platform === 'LEETCODE') {
        if (submission.problem.difficulty === 'Easy') rating = 1200;
        else if (submission.problem.difficulty === 'Medium') rating = 1500;
        else if (submission.problem.difficulty === 'Hard') rating = 1900;
      }
      return {
        verdict: submission.verdict,
        submittedAt: submission.submittedAt,
        problemId: submission.problem.problemId,
        problem: {
          problemId: submission.problem.problemId,
          name: submission.problem.name,
          rating: rating,
          tags: submission.problem.tags.map(problemTag => problemTag.tag.name),
        }
      };
    }),
    candidateProblems: serializedCandidates
  };
}

async function runAiAnalysis(handle, scriptName, extraArgs = []) {
  const payload = await buildCodeforcesPayload(handle);
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cp-ml-'));
  const inputPath = path.join(tmpDir, 'input.json');
  await fs.writeFile(inputPath, JSON.stringify(payload), 'utf-8');

  try {
    return await runPythonScript(scriptName, ['--input', inputPath, '--model', modelPath, ...extraArgs]);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

async function getTopicMastery(handle) {
  return runAiAnalysis(handle, 'predict_mastery.py');
}

async function getRecommendations(handle, limit = 20) {
  return runAiAnalysis(handle, 'recommend_problems.py', ['--limit', String(limit)]);
}

async function getModelMetrics() {
  const metrics = JSON.parse(await fs.readFile(metricsPath, 'utf-8'));
  return {
    ...metrics,
    modelPath,
  };
}

module.exports = {
  getTopicMastery,
  getRecommendations,
  getModelMetrics,
};
