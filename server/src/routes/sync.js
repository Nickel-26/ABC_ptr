const express = require('express');
const router = express.Router();
const prisma = require('../db');
const codeforces = require('../services/codeforces');
const leetcode = require('../services/leetcode');
const { withComputedStats } = require('../services/userStats');
const fs = require('fs');
const path = require('path');

let lcRatingMap = null;
function getLcRatingMap() {
  if (lcRatingMap) return lcRatingMap;
  try {
    const rawData = fs.readFileSync(path.resolve(__dirname, '../../../ml/lc_to_cf_rating.json'), 'utf-8');
    const mapping = JSON.parse(rawData);
    lcRatingMap = new Map();
    for (const item of mapping) {
        if (item.TitleSlug && typeof item.Rating === 'number') {
            lcRatingMap.set(item.TitleSlug, Math.round(item.Rating));
        }
    }
  } catch (e) {
    lcRatingMap = new Map();
  }
  return lcRatingMap;
}

const { authenticateToken } = require('../middleware/auth');

router.post('/', authenticateToken, async (req, res) => {
  const cfHandle = req.body.cfHandle?.trim() || '';
  const lcUsername = req.body.lcUsername?.trim() || '';
  const lcSession = req.body.lcSession?.trim() || '';

  if (!cfHandle && !lcUsername) {
    return res.status(400).json({ error: 'Provide at least cfHandle or lcUsername' });
  }

  try {
    let user = await prisma.user.findUnique({
      where: { id: req.user.id }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const cfHandleChanged = Boolean(cfHandle && user.cfHandle && user.cfHandle !== cfHandle);
    const lcUsernameChanged = Boolean(lcUsername && user.lcUsername && user.lcUsername !== lcUsername);

    if (cfHandleChanged) {
      await prisma.submission.deleteMany({
        where: { userId: user.id, platform: 'CODEFORCES' }
      });
    }

    if (lcUsernameChanged) {
      await prisma.submission.deleteMany({
        where: { userId: user.id, platform: 'LEETCODE' }
      });
    }

    const lcSessionChanged = Boolean(lcSession && user.lcSession !== lcSession);

    if ((cfHandle && user.cfHandle !== cfHandle) || (lcUsername && user.lcUsername !== lcUsername) || lcSessionChanged) {
        user = await prisma.user.update({
            where: { id: user.id },
            data: {
                cfHandle: cfHandle || user.cfHandle,
                lcUsername: lcUsername || user.lcUsername,
                lcSession: lcSession || user.lcSession,
                     ...(cfHandleChanged ? { cfRating: null, cfMaxRating: null, cfRank: null } : {}),
                     ...(lcUsernameChanged || lcSessionChanged ? {
                       lcTotalSolved: null,
                       lcEasySolved: null,
                       lcMediumSolved: null,
                       lcHardSolved: null,
                     } : {}),
                 }
             });
        }

    // 1. Sync Codeforces
    if (user.cfHandle) {
      try {
        const cfInfo = await codeforces.getUserInfo(user.cfHandle);
        
        // Update user CF stats
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            cfRating: cfInfo.rating || null,
            cfMaxRating: cfInfo.maxRating || null,
            cfRank: cfInfo.rank || null,
          }
        });

        const submissions = await codeforces.getUserSubmissions(user.cfHandle);

        // Process CF Problems
        for (const sub of submissions) {
          if (!sub.problem || !sub.problem.contestId) continue;
          
          const problemId = `${sub.problem.contestId}${sub.problem.index}`;
          const platform = 'CODEFORCES';
          
          let problem = await prisma.problem.findUnique({
            where: { platform_problemId: { platform, problemId } }
          });

          if (!problem) {
            problem = await prisma.problem.create({
              data: {
                platform,
                problemId,
                name: sub.problem.name,
                rating: sub.problem.rating || null,
                url: `https://codeforces.com/contest/${sub.problem.contestId}/problem/${sub.problem.index}`
              }
            });

            // Handle tags
            if (sub.problem.tags && sub.problem.tags.length > 0) {
              for (const tagName of sub.problem.tags) {
                let tag = await prisma.tag.findUnique({ where: { name: tagName } });
                if (!tag) {
                  tag = await prisma.tag.create({ data: { name: tagName } });
                }
                await prisma.problemTag.create({
                  data: {
                    problemId: problem.id,
                    tagId: tag.id
                  }
                });
              }
            }
          }

          // Create submission if doesn't exist
          const submittedAt = new Date(sub.creationTimeSeconds * 1000);
          await prisma.submission.upsert({
            where: {
              userId_problemId_platform_submittedAt: {
                userId: user.id,
                problemId: problem.id,
                platform,
                submittedAt
              }
            },
            update: {},
            create: {
              userId: user.id,
              problemId: problem.id,
              platform,
              verdict: sub.verdict || 'UNKNOWN',
              submittedAt
            }
          });
        }
      } catch (cfError) {
        console.error('Codeforces sync error:', cfError);
        // Continue to LeetCode even if CF fails
      }
    }

    // 2. Sync LeetCode
    if (user.lcUsername) {
      try {
        const lcStats = await leetcode.getUserStats(user.lcUsername);
        
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            lcTotalSolved: lcStats.total,
            lcEasySolved: lcStats.easy,
            lcMediumSolved: lcStats.medium,
            lcHardSolved: lcStats.hard,
          }
        });

        let lcSubs = [];
        if (user.lcSession) {
            lcSubs = await leetcode.getAllAcceptedProblems(user.lcSession);
        } else {
            lcSubs = await leetcode.getRecentSubmissions(user.lcUsername);
        }

        for (const sub of lcSubs) {
            const platform = 'LEETCODE';
            const problemId = sub.titleSlug;
            
            let problem = await prisma.problem.findUnique({
                where: { platform_problemId: { platform, problemId } }
            });

            if (!problem) {
                const rMap = getLcRatingMap();
                const rating = rMap.get(problemId) || null;
                problem = await prisma.problem.create({
                    data: {
                        platform,
                        problemId,
                        name: sub.title,
                        rating,
                        url: `https://leetcode.com/problems/${sub.titleSlug}/`
                    }
                });
            }

            const submittedAt = new Date(parseInt(sub.timestamp) * 1000);
            await prisma.submission.upsert({
                where: {
                    userId_problemId_platform_submittedAt: {
                        userId: user.id,
                        problemId: problem.id,
                        platform,
                        submittedAt
                    }
                },
                update: {},
                create: {
                    userId: user.id,
                    problemId: problem.id,
                    platform,
                    verdict: 'ACCEPTED',
                    submittedAt
                }
            });
        }
      } catch (lcError) {
        console.error('LeetCode sync error:', lcError);
      }
    }

    // Update last sync time
    user = await prisma.user.update({
      where: { id: user.id },
      data: { lastSyncAt: new Date() }
    });

    res.json({ success: true, user: await withComputedStats(user) });
  } catch (error) {
    console.error('Overall Sync Error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
