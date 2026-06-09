const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../db');
const { authenticateToken, issueAuthTokens, REFRESH_TOKEN_SECRET } = require('../middleware/auth');
const { withComputedStats } = require('../services/userStats');

router.post('/register', async (req, res) => {
  const { username, password, cfHandle, lcUsername } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const existingUser = await prisma.user.findUnique({ where: { username } });
    if (existingUser) {
      return res.status(400).json({ error: 'Username is already taken' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    let user = await prisma.user.create({
      data: {
        username,
        passwordHash,
        cfHandle: cfHandle || null,
        lcUsername: lcUsername || null,
      }
    });

    user = await withComputedStats(user);
    const tokens = issueAuthTokens(user);

    res.status(201).json({ ...tokens, user });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Failed to register' });
  }
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const userWithStats = await withComputedStats(user);
    const tokens = issueAuthTokens(user);

    res.json({ ...tokens, user: userWithStats });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(401).json({ error: 'Refresh token is required' });
  }

  try {
    const payload = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);
    if (payload.type !== 'refresh') {
      return res.status(403).json({ error: 'Invalid refresh token' });
    }

    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const tokens = issueAuthTokens(user);
    res.json(tokens);
  } catch (error) {
    res.status(403).json({ error: 'Invalid or expired refresh token' });
  }
});

router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const userWithStats = await withComputedStats(user);
    res.json({ user: userWithStats });
  } catch (error) {
    console.error('Me error:', error);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

module.exports = router;
