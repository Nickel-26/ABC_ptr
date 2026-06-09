const express = require('express');
const router = express.Router();
const prisma = require('../db');
const { authenticateToken } = require('../middleware/auth');

// Get all solved problems with their notes
router.get('/:username', authenticateToken, async (req, res) => {
  const { username } = req.params;
  
  if (req.user.username !== username) {
      return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Get all solved submissions for this user
    const submissions = await prisma.submission.findMany({
        where: {
            userId: user.id,
            verdict: { in: ['OK', 'ACCEPTED'] }
        },
        include: {
            problem: {
                include: { tags: { include: { tag: true } } }
            }
        },
        orderBy: { submittedAt: 'desc' }
    });

    // Get all notes for this user
    const notes = await prisma.problemNote.findMany({
        where: { userId: user.id }
    });

    const noteMap = new Map(notes.map(n => [n.problemId, { content: n.content, isBookmarked: n.isBookmarked }]));

    // Remove duplicates (if user solved same problem multiple times)
    const seen = new Set();
    const solved = [];

    for (const sub of submissions) {
        if (!seen.has(sub.problemId)) {
            seen.add(sub.problemId);
            const userNote = noteMap.get(sub.problemId) || { content: '', isBookmarked: false };
            solved.push({
                submissionId: sub.id,
                submittedAt: sub.submittedAt,
                problem: sub.problem,
                note: userNote.content,
                isBookmarked: userNote.isBookmarked
            });
        }
    }

    res.json(solved);
  } catch (error) {
    console.error('Solved notes error:', error);
    res.status(500).json({ error: 'Failed to fetch solved problems' });
  }
});

// Update or create a note
router.post('/:username', authenticateToken, async (req, res) => {
    const { username } = req.params;
    const { problemId, content } = req.body;
    
    if (req.user.username !== username) {
        return res.status(403).json({ error: 'Forbidden' });
    }
  
    try {
      const user = await prisma.user.findUnique({ where: { username } });
      if (!user) return res.status(404).json({ error: 'User not found' });
  
      const note = await prisma.problemNote.upsert({
          where: {
              userId_problemId: { userId: user.id, problemId }
          },
          update: { content },
          create: {
              userId: user.id,
              problemId,
              content
          }
      });
  
      res.json(note);
    } catch (error) {
      console.error('Note save error:', error);
      res.status(500).json({ error: 'Failed to save note' });
    }
});

// Toggle bookmark status
router.post('/:username/bookmark', authenticateToken, async (req, res) => {
    const { username } = req.params;
    const { problemId, isBookmarked } = req.body;
    
    if (req.user.username !== username) {
        return res.status(403).json({ error: 'Forbidden' });
    }
  
    try {
      const user = await prisma.user.findUnique({ where: { username } });
      if (!user) return res.status(404).json({ error: 'User not found' });
  
      const note = await prisma.problemNote.upsert({
          where: {
              userId_problemId: { userId: user.id, problemId }
          },
          update: { isBookmarked },
          create: {
              userId: user.id,
              problemId,
              content: '',
              isBookmarked
          }
      });
  
      res.json(note);
    } catch (error) {
      console.error('Bookmark save error:', error);
      res.status(500).json({ error: 'Failed to update bookmark' });
    }
});

module.exports = router;
