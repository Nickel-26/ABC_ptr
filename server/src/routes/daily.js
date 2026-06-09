const express = require('express');
const router = express.Router();
const prisma = require('../db');
const { authenticateToken } = require('../middleware/auth');

router.get('/:username', authenticateToken, async (req, res) => {
  const { username } = req.params;
  
  if (req.user.username !== username) {
      return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { username },
      include: { submissions: true }
    });

    if (!user) return res.status(404).json({ error: 'User not found' });

    const solvedIds = new Set(user.submissions.filter(s => s.verdict === 'OK' || s.verdict === 'ACCEPTED').map(s => s.problemId));
    
    const today = new Date();
    const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
    
    const targetRating = user.cfRating || 1200;

    const problems = await prisma.problem.findMany({
      where: {
        rating: {
          gte: targetRating,
          lte: targetRating + 300
        }
      },
      include: { tags: { include: { tag: true } } }
    });

    const unsolved = problems.filter(p => !solvedIds.has(p.id));
    
    if (unsolved.length === 0) {
        return res.json({ problem: null });
    }

    const index = seed % unsolved.length;
    res.json({ problem: unsolved[index] });

  } catch (error) {
    console.error('Daily problem error:', error);
    res.status(500).json({ error: 'Failed to fetch daily problem' });
  }
});

module.exports = router;
