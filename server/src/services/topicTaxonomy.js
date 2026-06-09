const TOPICS = [
  'Implementation',
  'Math',
  'Greedy',
  'Dynamic Programming (DP)',
  'Data Structures',
  'Brute Force',
  'Constructive Algorithms',
  'Graphs',
  'Sortings',
  'Binary Search',
  'DFS / BFS',
  'Trees',
  'Strings',
  'Number Theory',
  'Combinatorics',
  'Geometry',
  'Bitmasks',
  'Two Pointers',
  'Disjoint Set Union (DSU)',
];

const TAG_ALIASES = {
  implementation: ['Implementation'],
  simulation: ['Implementation'],
  math: ['Math'],
  mathematics: ['Math'],
  greedy: ['Greedy'],
  'dynamic programming': ['Dynamic Programming (DP)'],
  dp: ['Dynamic Programming (DP)'],
  memoization: ['Dynamic Programming (DP)'],
  'data structures': ['Data Structures'],
  'data structure': ['Data Structures'],
  array: ['Data Structures'],
  arrays: ['Data Structures'],
  'hash table': ['Data Structures'],
  hash_table: ['Data Structures'],
  hashmap: ['Data Structures'],
  heap: ['Data Structures'],
  'priority queue': ['Data Structures'],
  queue: ['Data Structures'],
  stack: ['Data Structures'],
  design: ['Data Structures'],
  'ordered set': ['Data Structures'],
  'binary indexed tree': ['Data Structures'],
  'segment tree': ['Data Structures'],
  'suffix array': ['Data Structures', 'Strings'],
  'brute force': ['Brute Force'],
  enumeration: ['Brute Force'],
  'constructive algorithms': ['Constructive Algorithms'],
  constructive: ['Constructive Algorithms'],
  graph: ['Graphs'],
  graphs: ['Graphs'],
  'graph theory': ['Graphs'],
  'shortest paths': ['Graphs'],
  'minimum spanning tree': ['Graphs'],
  'topological sort': ['Graphs'],
  sorting: ['Sortings'],
  sort: ['Sortings'],
  'binary search': ['Binary Search'],
  'binary search tree': ['Binary Search', 'Trees'],
  dfs: ['DFS / BFS'],
  bfs: ['DFS / BFS'],
  'dfs and similar': ['DFS / BFS'],
  'depth-first search': ['DFS / BFS'],
  'breadth-first search': ['DFS / BFS'],
  tree: ['Trees'],
  trees: ['Trees'],
  trie: ['Trees', 'Strings'],
  string: ['Strings'],
  strings: ['Strings'],
  'string matching': ['Strings'],
  'number theory': ['Number Theory'],
  primes: ['Number Theory'],
  'prime number': ['Number Theory'],
  combinatorics: ['Combinatorics'],
  probability: ['Combinatorics'],
  geometry: ['Geometry'],
  bitmask: ['Bitmasks'],
  bitmasks: ['Bitmasks'],
  'bit manipulation': ['Bitmasks'],
  'two pointers': ['Two Pointers'],
  'sliding window': ['Two Pointers'],
  dsu: ['Disjoint Set Union (DSU)'],
  'disjoint set union': ['Disjoint Set Union (DSU)'],
  'union find': ['Disjoint Set Union (DSU)'],
  'binary tree': ['Trees'],
  'linked list': ['Data Structures'],
  'matrix': ['Implementation'],
  'backtracking': ['DFS / BFS', 'Brute Force'],
  'divide and conquer': ['Math', 'Implementation'],
  'heap (priority queue)': ['Data Structures'],
  'database': ['Implementation'],
  'simulation': ['Implementation'],
};

function normalizeTag(tag) {
  return String(tag || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function topicsForTag(tag) {
  return TAG_ALIASES[normalizeTag(tag)] || [];
}

function topicsForProblem(problem) {
  const mapped = new Set();
  for (const problemTag of problem.tags || []) {
    const tagName = problemTag.tag?.name || problemTag.name || problemTag;
    for (const topic of topicsForTag(tagName)) mapped.add(topic);
  }
  return [...mapped];
}

function levelForScore(score) {
  return score >= 65 ? 'strong' : 'weak';
}

function getProblemRating(problem) {
  if (problem.rating) return problem.rating;
  if (problem.platform === 'LEETCODE') {
    if (problem.difficulty === 'Easy') return 1200;
    if (problem.difficulty === 'Medium') return 1500;
    if (problem.difficulty === 'Hard') return 1900;
  }
  return null;
}

function complexityMultiplier(attempts) {
  if (attempts === 1) return 1;
  if (attempts === 2) return 0.85;
  return 0.7;
}

function recencyDecay(submittedAt, referenceTime) {
  if (!submittedAt || !referenceTime) return 1;
  const daysSince = Math.max(0, (referenceTime.getTime() - submittedAt.getTime()) / 86400000);
  const decay = 0.003 * daysSince;
  return Math.max(0.1, 1 / (1 + 0.5 * decay));
}

function difficultyWeight(problem) {
  if (problem.platform === 'LEETCODE') {
    if (problem.difficulty === 'Hard') return 1.35;
    if (problem.difficulty === 'Medium') return 1.15;
    return 1;
  }

  const rating = problem.rating || 0;
  if (rating >= 1900) return 1.35;
  if (rating >= 1400) return 1.15;
  return 1;
}

function ratingComponent(rating, userRating) {
  if (!rating) return 25;
  return Math.max(0, Math.min(100, 50 + ((rating - userRating) * 0.12)));
}

function buildTopicSummary(submissions, user = {}) {
  const userRating = user.cfRating || user.cfMaxRating || 1200;
  const topicStats = new Map(TOPICS.map(topic => [topic, {
    topic,
    solvedProblems: new Set(),
    attemptedProblems: new Set(),
    solved: 0,
    failed: 0,
    attempts: 0,
    weightedSolved: 0,
    platforms: { CODEFORCES: 0, LEETCODE: 0 },
    difficulties: { Easy: 0, Medium: 0, Hard: 0 },
    cfRatings: [],
    rawTags: new Set(),
  }]));

  for (const submission of submissions) {
    const problem = submission.problem;
    if (!problem) continue;

    const topics = topicsForProblem(problem);
    if (topics.length === 0) continue;

    const verdict = String(submission.verdict || '').toUpperCase();
    const isSolved = verdict === 'OK' || verdict === 'ACCEPTED';
    const weight = difficultyWeight(problem);
    const rawTags = (problem.tags || []).map(problemTag => problemTag.tag?.name).filter(Boolean);

    for (const topic of topics) {
      const stat = topicStats.get(topic);
      if (!stat) continue;

      stat.attempts += 1;
      stat.attemptedProblems.add(problem.id);
      rawTags.forEach(tag => stat.rawTags.add(tag));

      if (!isSolved) {
        stat.failed += 1;
        continue;
      }

      if (stat.solvedProblems.has(problem.id)) continue;

      stat.solvedProblems.add(problem.id);
      stat.solved += 1;
      stat.weightedSolved += weight;
      if (problem.platform in stat.platforms) stat.platforms[problem.platform] += 1;
      if (problem.difficulty in stat.difficulties) stat.difficulties[problem.difficulty] += 1;
      
      const pRating = getProblemRating(problem);
      if (pRating) stat.cfRatings.push(pRating);
    }
  }

  return [...topicStats.values()].map(stat => {
    const successRate = stat.attempts ? stat.solved / stat.attempts : 0;
    const successScore = successRate * 100;
    const avgCfRating = stat.cfRatings.length
      ? Math.round(stat.cfRatings.reduce((sum, rating) => sum + rating, 0) / stat.cfRatings.length)
      : null;
    const maxCfRating = stat.cfRatings.length ? Math.max(...stat.cfRatings) : null;
    const avgRatingScore = ratingComponent(avgCfRating, userRating);
    const maxRatingScore = ratingComponent(maxCfRating, userRating);
    const volumeScore = Math.min(100, Math.log1p(stat.solved) * 28);
    const rawScore = (
      0.30 * successScore
      + 0.25 * avgRatingScore
      + 0.20 * maxRatingScore
      + 0.25 * volumeScore
    );
    const confidence = Math.min(1, stat.attempts / 8);
    const score = Math.round((confidence * rawScore) + ((1 - confidence) * 50));

    return {
      tag: stat.topic,
      topic: stat.topic,
      masteryScore: score,
      level: levelForScore(score),
      solved: stat.solved,
      failed: stat.failed,
      attempts: stat.attempts,
      uniqueAttempted: stat.attemptedProblems.size,
      platforms: stat.platforms,
      difficulties: stat.difficulties,
      avgCfRating,
      maxCfRating,
      successRate,
      rawTags: [...stat.rawTags].slice(0, 10),
      reason: `${stat.solved}/${stat.attempts} accepted Codeforces attempts; avg solved rating ${avgCfRating || 'N/A'}`,
    };
  }).sort((a, b) => a.masteryScore - b.masteryScore);
}

function buildCanonicalMlTopicSummary(rawTopics = []) {
  const buckets = new Map(TOPICS.map(topic => [topic, {
    topic,
    scores: [],
    weightedScores: [],
    rawTags: [],
    solved: 0,
    failed: 0,
    attempts: 0,
  }]));

  for (const rawTopic of rawTopics) {
    const canonicalTopics = topicsForTag(rawTopic.tag || rawTopic.topic);
    const score = rawTopic.masteryScore;
    if (!Number.isFinite(score)) continue;

    const weight = Math.max(1, rawTopic.attempts || rawTopic.solved || 1);

    for (const topic of canonicalTopics) {
      const bucket = buckets.get(topic);
      if (!bucket) continue;

      bucket.scores.push(score);
      bucket.weightedScores.push({ score, weight });
      bucket.rawTags.push(rawTopic.tag || rawTopic.topic);
      bucket.solved += rawTopic.solved || 0;
      bucket.failed += rawTopic.failed || 0;
      bucket.attempts += rawTopic.attempts || 0;
    }
  }

  return [...buckets.values()].map(bucket => {
    const weightedTotal = bucket.weightedScores.reduce((sum, item) => sum + item.score * item.weight, 0);
    const totalWeight = bucket.weightedScores.reduce((sum, item) => sum + item.weight, 0);
    const masteryScore = totalWeight > 0 ? Math.round(weightedTotal / totalWeight) : 0;
    const level = bucket.attempts >= 3 ? levelForScore(masteryScore) : (masteryScore >= 65 ? 'strong' : 'moderate');

    return {
      tag: bucket.topic,
      topic: bucket.topic,
      masteryScore,
      level,
      solved: bucket.solved,
      failed: bucket.failed,
      attempts: bucket.attempts,
      rawTags: [...new Set(bucket.rawTags)],
      reason: bucket.rawTags.length
        ? `History score aggregated from: ${[...new Set(bucket.rawTags)].join(', ')}`
        : 'No mapped Codeforces history for this topic yet.',
    };
  }).sort((a, b) => a.masteryScore - b.masteryScore);
}

function buildAnalyzerTopicClassification(submissions, user = {}, minSolves = 3) {
  const cfSubmissions = submissions
    .filter(submission => submission.problem)
    .sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt));
  const currentRating = user.cfRating || user.cfMaxRating || 1500;
  const referenceTime = cfSubmissions.length
    ? new Date(Math.max(...cfSubmissions.map(submission => new Date(submission.submittedAt).getTime())))
    : null;

  const attemptsByProblemId = new Map();
  for (const submission of cfSubmissions) {
    attemptsByProblemId.set(submission.problemId, (attemptsByProblemId.get(submission.problemId) || 0) + 1);
  }

  const strongStats = new Map();
  const weakStats = new Map();
  const solvedSeen = new Set();

  for (const submission of cfSubmissions) {
    const problem = submission.problem;
    const topics = topicsForProblem(problem);
    if (topics.length === 0) continue;

    const verdict = String(submission.verdict || '').toUpperCase();
    const isAccepted = verdict === 'OK' || verdict === 'ACCEPTED';
    const rating = getProblemRating(problem) || 0;
    const submittedAt = new Date(submission.submittedAt);

    for (const topic of topics) {
      if (!weakStats.has(topic)) {
        weakStats.set(topic, {
          topic,
          acRatings: [],
          acCount: 0,
          nonAcCount: 0,
          rawTags: new Set(),
        });
      }

      const weak = weakStats.get(topic);
      (problem.tags || []).forEach(problemTag => {
        const tagName = problemTag.tag?.name || problemTag.name || problemTag;
        if (tagName) weak.rawTags.add(tagName);
      });

      if (isAccepted) {
        weak.acRatings.push(rating);
        weak.acCount += 1;
      } else {
        weak.nonAcCount += 1;
      }

      if (!isAccepted || solvedSeen.has(`${submission.problemId}:${topic}`)) continue;

      const attempts = attemptsByProblemId.get(submission.problemId) || 1;
      const baseScore = rating / 100;
      const weight = baseScore * complexityMultiplier(attempts) * recencyDecay(submittedAt, referenceTime);

      if (!strongStats.has(topic)) {
        strongStats.set(topic, {
          topic,
          scores: [],
          ratings: [],
          count: 0,
          rawTags: new Set(),
        });
      }

      const strong = strongStats.get(topic);
      strong.scores.push(weight);
      strong.ratings.push(rating);
      strong.count += 1;
      (problem.tags || []).forEach(problemTag => {
        const tagName = problemTag.tag?.name || problemTag.name || problemTag;
        if (tagName) strong.rawTags.add(tagName);
      });
      solvedSeen.add(`${submission.problemId}:${topic}`);
    }
  }

  const strongTopics = [...strongStats.values()]
    .filter(stat => stat.count >= minSolves)
    .map(stat => {
      const totalScore = stat.scores.reduce((sum, score) => sum + score, 0);
      const avgRating = stat.ratings.reduce((sum, rating) => sum + rating, 0) / stat.ratings.length;
      const weakStat = weakStats.get(stat.topic);
      const attempts = weakStat ? weakStat.acCount + weakStat.nonAcCount : stat.count;
      return {
        tag: stat.topic,
        topic: stat.topic,
        level: 'strong',
        masteryScore: Math.round(totalScore),
        totalScore: Number(totalScore.toFixed(2)),
        solved: stat.count,
        attempts,
        avgSolvedRating: Math.round(avgRating),
        rawTags: [...stat.rawTags],
        reason: `${stat.count} solved; avg rating ${Math.round(avgRating)}; weighted score ${totalScore.toFixed(2)}`,
      };
    })
    .filter(topic => topic.avgSolvedRating >= currentRating - 200)
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, 5);

  const weakTopics = [...weakStats.values()]
    .map(stat => {
      const totalAttempts = stat.acCount + stat.nonAcCount;
      const nonAcRatio = totalAttempts > 0 ? stat.nonAcCount / totalAttempts : 0;
      const avgRating = stat.acRatings.length
        ? stat.acRatings.reduce((sum, rating) => sum + rating, 0) / stat.acRatings.length
        : 0;
      const weaknessScore = avgRating > 0 ? (nonAcRatio * 100) + ((1500 - avgRating) / 10) : 0;
      return {
        tag: stat.topic,
        topic: stat.topic,
        level: 'weak',
        masteryScore: Math.max(0, Math.round(100 - weaknessScore)),
        weaknessScore: Number(weaknessScore.toFixed(2)),
        solved: stat.acCount,
        failed: stat.nonAcCount,
        attempts: totalAttempts,
        nonAcRatio,
        avgSolvedRating: Math.round(avgRating),
        rawTags: [...stat.rawTags],
        reason: `${stat.nonAcCount}/${totalAttempts} non-AC; avg solved rating ${Math.round(avgRating) || 'N/A'}`,
      };
    })
    .filter(topic => topic.attempts >= minSolves && (topic.nonAcRatio > 0.5 || topic.avgSolvedRating < 1200))
    .sort((a, b) => b.weaknessScore - a.weaknessScore)
    .slice(0, 5);

  const strongTopicNames = new Set(strongTopics.map(t => t.topic));
  const weakTopicNames = new Set(weakTopics.map(t => t.topic));

  const mediumTopics = [...weakStats.values()]
    .filter(stat => !strongTopicNames.has(stat.topic) && !weakTopicNames.has(stat.topic))
    .map(stat => {
      const totalAttempts = stat.acCount + stat.nonAcCount;
      const nonAcRatio = totalAttempts > 0 ? stat.nonAcCount / totalAttempts : 0;
      const avgRating = stat.acRatings.length
        ? stat.acRatings.reduce((sum, rating) => sum + rating, 0) / stat.acRatings.length
        : 0;
      const weaknessScore = avgRating > 0 ? (nonAcRatio * 100) + ((1500 - avgRating) / 10) : 0;
      return {
        tag: stat.topic,
        topic: stat.topic,
        level: 'medium',
        masteryScore: Math.max(0, Math.round(100 - weaknessScore)),
        weaknessScore: Number(weaknessScore.toFixed(2)),
        solved: stat.acCount,
        failed: stat.nonAcCount,
        attempts: totalAttempts,
        nonAcRatio,
        avgSolvedRating: Math.round(avgRating),
        rawTags: [...stat.rawTags],
      };
    })
    .filter(topic => topic.attempts >= minSolves)
    .sort((a, b) => b.attempts - a.attempts)
    .slice(0, 5);

  return [...weakTopics, ...mediumTopics, ...strongTopics];
}

module.exports = {
  TOPICS,
  buildAnalyzerTopicClassification,
  buildCanonicalMlTopicSummary,
  buildTopicSummary,
  topicsForProblem,
};
