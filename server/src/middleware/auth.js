const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretcpinsightkey';
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || `${JWT_SECRET}-refresh`;
const ACCESS_TOKEN_EXPIRES_IN = '10m';
const REFRESH_TOKEN_EXPIRES_IN = '7d';

function signAccessToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, type: 'access' },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRES_IN }
  );
}

function signRefreshToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, type: 'refresh' },
    REFRESH_TOKEN_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
  );
}

function issueAuthTokens(user) {
  return {
    accessToken: signAccessToken(user),
    refreshToken: signRefreshToken(user),
  };
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err || user.type !== 'access') {
      return res.status(403).json({ error: 'Invalid or expired token.' });
    }
    req.user = user; // { id, username }
    next();
  });
}

module.exports = {
  authenticateToken,
  issueAuthTokens,
  JWT_SECRET,
  REFRESH_TOKEN_SECRET,
};
