const express = require('express');
const router = express.Router();
const prisma = require('../db');
const { withComputedStats } = require('../services/userStats');
const { TOPICS, buildAnalyzerTopicClassification, buildTopicSummary } = require('../services/topicTaxonomy');

// Get user profile
router.get('/:handle', async (req, res) => {
  const { handle } = req.params;
  try {
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ cfHandle: handle }, { lcUsername: handle }]
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(await withComputedStats(user));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user activity (heatmap data)
router.get('/:handle/activity', async (req, res) => {
    const { handle } = req.params;
    try {
      const user = await prisma.user.findFirst({
        where: { OR: [{ cfHandle: handle }, { lcUsername: handle }] }
      });
  
      if (!user) return res.status(404).json({ error: 'User not found' });
  
      const submissions = await prisma.submission.findMany({
        where: { userId: user.id },
        select: { submittedAt: true, platform: true }
      });
      
      // Group by day
      const activityMap = {};
      submissions.forEach(sub => {
          const dateStr = sub.submittedAt.toISOString().split('T')[0];
          if (!activityMap[dateStr]) activityMap[dateStr] = 0;
          activityMap[dateStr]++;
      });

      const activityArray = Object.keys(activityMap).map(date => ({
          date,
          count: activityMap[date]
      }));

      res.json(activityArray);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
});

// Get canonical Codeforces topic mastery
router.get('/:handle/topics', async (req, res) => {
  const { handle } = req.params;

  try {
    const user = await prisma.user.findFirst({
      where: { OR: [{ cfHandle: handle }, { lcUsername: handle }] }
    });

    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.cfHandle) return res.status(400).json({ error: 'Codeforces handle is required for topic analysis.' });

    const submissions = await prisma.submission.findMany({
      where: { userId: user.id, platform: 'CODEFORCES' },
      include: {
        problem: {
          include: { tags: { include: { tag: true } } }
        }
      },
      orderBy: { submittedAt: 'asc' }
    });

    const topics = buildAnalyzerTopicClassification(submissions, user);
    const allTopics = buildTopicSummary(submissions, user);

    res.json({
      handle: user.cfHandle,
      topics,
      allTopics,
      canonicalTopics: TOPICS,
      predictionSource: 'history-analyzer',
      method: {
        summary: 'Uses the analyzer.py strong/weak logic on stored Codeforces submissions, mapped into the fixed topic taxonomy.',
        scoring: 'Strong topics are top weighted solved areas with at least 3 solves and average solved rating at least current rating minus 200. Weak topics require at least 3 submissions and are selected by high non-AC ratio or low average solved rating.',
        levels: {
          weak: 'high non-AC ratio > 50% or average solved rating < 1200, with at least 3 submissions',
          strong: 'top weighted solved topics, with at least 3 solves and avg solved rating >= current rating - 200'
        }
      }
    });
  } catch (error) {
    console.error('Topic summary error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get recommended problems
router.get('/:handle/recommendations', async (req, res) => {
    const { handle } = req.params;
    try {
        const user = await prisma.user.findFirst({
            where: { OR: [{ cfHandle: handle }, { lcUsername: handle }] }
        });

        if (!user || !user.cfHandle) {
            return res.status(404).json({ error: 'User not found or no Codeforces handle associated' });
        }

        // Fetch user's solved CF problems with tags
        const solvedSubs = await prisma.submission.findMany({
            where: { userId: user.id, platform: 'CODEFORCES', verdict: 'OK' },
            select: { problemId: true }
        });
        
        const solvedProblemIds = solvedSubs.map(s => s.problemId);

        const solvedProblems = await prisma.problem.findMany({
            where: { id: { in: solvedProblemIds } },
            include: { tags: { include: { tag: true } } }
        });

        // Compute tag frequency to find strong/weak topics
        const tagCounts = {};
        solvedProblems.forEach(p => {
            p.tags.forEach(pt => {
                const tagName = pt.tag.name;
                tagCounts[tagName] = (tagCounts[tagName] || 0) + 1;
            });
        });

        // Sort tags by frequency (weakest to strongest, or we can just pick based on target difficulty)
        // Here, let's just recommend problems slightly above user's rating in topics they practice.
        const targetRating = (user.cfRating || 1200) + 100; // Aim +100 rating
        
        // Fetch unsolved problems near target rating
        const recommended = await prisma.problem.findMany({
            where: {
                platform: 'CODEFORCES',
                rating: {
                    gte: targetRating - 100,
                    lte: targetRating + 200
                },
                id: { notIn: solvedProblemIds }
            },
            include: { tags: { include: { tag: true } } },
            take: 50 // take some sample and sort manually by tag overlap or just return random
        });

        // Score recommendations based on tag overlap with user's profile
        // A simple approach: problem score = sum of (tag frequency in user profile)
        const scoredRecs = recommended.map(p => {
            let score = 0;
            p.tags.forEach(pt => {
                score += tagCounts[pt.tag.name] || 0;
            });
            // Penalize problems that are too far from target rating
            const ratingDiff = Math.abs(p.rating - targetRating);
            score -= ratingDiff / 10;

            return {
                ...p,
                tags: p.tags.map(pt => pt.tag.name),
                score
            };
        });

        // Sort by highest score and return top 10
        scoredRecs.sort((a, b) => b.score - a.score);
        
        res.json(scoredRecs.slice(0, 10));

    } catch (error) {
        console.error('Recommendation error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
