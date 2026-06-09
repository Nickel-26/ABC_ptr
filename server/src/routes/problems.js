const express = require('express');
const router = express.Router();
const prisma = require('../db');
const codeforces = require('../services/codeforces');
const leetcode = require('../services/leetcode');

const batch = (items, size = 500) => {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
};

async function ensureTags(tagNames) {
  const names = [...new Set(tagNames.filter(Boolean))];
  for (const chunk of batch(names, 1000)) {
    await prisma.tag.createMany({
      data: chunk.map(name => ({ name })),
      skipDuplicates: true
    });
  }

  const tags = await prisma.tag.findMany({ where: { name: { in: names } } });
  return new Map(tags.map(tag => [tag.name, tag.id]));
}

async function importCodeforcesCatalog() {
  const existingCount = await prisma.problem.count({ where: { platform: 'CODEFORCES' } });
  if (existingCount >= 1000) return;

  const result = await codeforces.getProblemset();
  const solvedCounts = new Map(
    (result.problemStatistics || []).map(stat => [
      `${stat.contestId}${stat.index}`,
      stat.solvedCount || 0
    ])
  );

  const problems = (result.problems || [])
    .filter(problem => problem.contestId && problem.index)
    .map(problem => {
      const problemId = `${problem.contestId}${problem.index}`;
      return {
        platform: 'CODEFORCES',
        problemId,
        name: problem.name,
        rating: problem.rating || null,
        url: `https://codeforces.com/contest/${problem.contestId}/problem/${problem.index}`,
        popularity: solvedCounts.get(problemId) || 0,
        tags: problem.tags || []
      };
    });

  for (const chunk of batch(problems, 1000)) {
    await prisma.problem.createMany({
      data: chunk.map(({ tags, ...problem }) => problem),
      skipDuplicates: true
    });
  }

  const tagIdByName = await ensureTags(problems.flatMap(problem => problem.tags));
  const storedProblems = await prisma.problem.findMany({
    where: {
      platform: 'CODEFORCES',
      problemId: { in: problems.map(problem => problem.problemId) }
    },
    select: { id: true, problemId: true }
  });
  const problemIdByExternalId = new Map(storedProblems.map(problem => [problem.problemId, problem.id]));

  const relations = [];
  for (const problem of problems) {
    const storedProblemId = problemIdByExternalId.get(problem.problemId);
    if (!storedProblemId) continue;
    for (const tagName of problem.tags) {
      const tagId = tagIdByName.get(tagName);
      if (tagId) relations.push({ problemId: storedProblemId, tagId });
    }
  }

  for (const chunk of batch(relations, 1000)) {
    await prisma.problemTag.createMany({ data: chunk, skipDuplicates: true });
  }
}

async function importLeetCodeCatalog() {
  const existingCount = await prisma.problem.count({ where: { platform: 'LEETCODE' } });
  if (existingCount >= 500) return;

  const questions = [];
  const limit = 100;
  let skip = 0;
  let total = 1;

  while (skip < total) {
    const result = await leetcode.getProblemsetQuestions({ limit, skip });
    total = result.totalLength || 0;
    questions.push(...(result.questions || []));
    skip += limit;
  }

  const problems = questions.map(question => ({
    platform: 'LEETCODE',
    problemId: question.titleSlug,
    name: `${question.questionFrontendId}. ${question.title}`,
    difficulty: question.difficulty
      ? question.difficulty.charAt(0).toUpperCase() + question.difficulty.slice(1).toLowerCase()
      : null,
    url: `https://leetcode.com/problems/${question.titleSlug}/`,
    popularity: Math.round((question.acRate || 0) * 100),
    tags: (question.topicTags || []).map(tag => tag.name)
  }));

  for (const chunk of batch(problems, 1000)) {
    await prisma.problem.createMany({
      data: chunk.map(({ tags, ...problem }) => problem),
      skipDuplicates: true
    });
  }

  const tagIdByName = await ensureTags(problems.flatMap(problem => problem.tags));
  const storedProblems = await prisma.problem.findMany({
    where: {
      platform: 'LEETCODE',
      problemId: { in: problems.map(problem => problem.problemId) }
    },
    select: { id: true, problemId: true }
  });
  const problemIdByExternalId = new Map(storedProblems.map(problem => [problem.problemId, problem.id]));

  const relations = [];
  for (const problem of problems) {
    const storedProblemId = problemIdByExternalId.get(problem.problemId);
    if (!storedProblemId) continue;
    for (const tagName of problem.tags) {
      const tagId = tagIdByName.get(tagName);
      if (tagId) relations.push({ problemId: storedProblemId, tagId });
    }
  }

  for (const chunk of batch(relations, 1000)) {
    await prisma.problemTag.createMany({ data: chunk, skipDuplicates: true });
  }
}

async function ensureCatalog(platform) {
  if (platform === 'CODEFORCES') {
    await importCodeforcesCatalog();
    return;
  }
  if (platform === 'LEETCODE') {
    await importLeetCodeCatalog();
    return;
  }
}

// Get all problems with pagination and filters
router.get('/explorer', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      platform,
      search,
      tag,
      difficulty,
      cfRatingMin,
      cfRatingMax,
      status,
      handle
    } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    const activePlatform = platform === 'CODEFORCES' || platform === 'LEETCODE' ? platform : undefined;

    if (activePlatform) await ensureCatalog(activePlatform);

    const where = {};
    if (activePlatform) where.platform = activePlatform;
    if (search) where.name = { contains: search, mode: 'insensitive' };
    if (difficulty && activePlatform === 'LEETCODE') where.difficulty = difficulty;
    
    if (activePlatform === 'CODEFORCES') {
        if (cfRatingMin || cfRatingMax) {
            where.rating = {};
            if (cfRatingMin) where.rating.gte = parseInt(cfRatingMin);
            if (cfRatingMax) where.rating.lte = parseInt(cfRatingMax);
        }
    }

    if (tag) {
        where.tags = {
            some: {
                tag: { name: tag }
            }
        };
    }

    let user = null;
    if (handle) {
      user = await prisma.user.findFirst({
        where: { OR: [{ cfHandle: handle }, { lcUsername: handle }] }
      });
    }

    if (user && activePlatform && (status === 'SOLVED' || status === 'UNSOLVED')) {
      const submissionFilter = {
        userId: user.id,
        platform: activePlatform,
        verdict: activePlatform === 'CODEFORCES' ? 'OK' : 'ACCEPTED'
      };

      where.submissions = status === 'SOLVED'
        ? { some: submissionFilter }
        : { none: submissionFilter };
    }

    const problems = await prisma.problem.findMany({
      where,
      skip,
      take: limitNum,
      include: {
          tags: {
              include: { tag: true }
          }
      },
      orderBy: { id: 'asc' } // Or by popularity if we track it
    });

    const totalCount = await prisma.problem.count({ where });

    // Format the response
    const formattedProblems = problems.map(p => ({
        ...p,
        tags: p.tags.map(pt => pt.tag.name)
    }));

    res.json({
        data: formattedProblems,
        meta: {
            total: totalCount,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(totalCount / limitNum),
            userMatched: Boolean(user)
        }
    });

  } catch (error) {
    console.error('Error fetching problems:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/tags', async (req, res) => {
  try {
    const { platform } = req.query;
    const activePlatform = platform === 'CODEFORCES' || platform === 'LEETCODE' ? platform : undefined;
    if (activePlatform) await ensureCatalog(activePlatform);

    const tags = await prisma.tag.findMany({
      where: activePlatform ? { problems: { some: { problem: { platform: activePlatform } } } } : {},
      orderBy: { name: 'asc' }
    });

    res.json(tags.map(tag => tag.name));
  } catch (error) {
    console.error('Error fetching tags:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
