const prisma = require('../db');

async function getCfSolvedCount(userId) {
  const solved = await prisma.submission.groupBy({
    by: ['problemId'],
    where: {
      userId,
      platform: 'CODEFORCES',
      verdict: 'OK',
    },
  });

  return solved.length;
}

async function withComputedStats(user) {
  if (!user) return user;

  const cfSolvedCount = await getCfSolvedCount(user.id);

  return {
    ...user,
    cfSolvedCount,
    totalSolved: cfSolvedCount + (user.lcTotalSolved || 0),
  };
}

module.exports = {
  getCfSolvedCount,
  withComputedStats,
};
