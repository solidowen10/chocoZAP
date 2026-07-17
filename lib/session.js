// lib/session.js
// Stateless JWT-in-cookie session. Keeps things simple (no session table,
// no Redis) which matches the rest of the single-server / PM2 deployment.
const jwt = require('jsonwebtoken');

const SECRET = process.env.SESSION_SECRET || 'dev-secret-change-me';
const COOKIE_NAME = 'ext_session';
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

function issueSession(res, userId) {
  const token = jwt.sign({ uid: userId }, SECRET, { expiresIn: '30d' });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: MAX_AGE_MS,
  });
}

function clearSession(res) {
  res.clearCookie(COOKIE_NAME);
}

function readSession(req) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, SECRET);
    return payload.uid;
  } catch {
    return null;
  }
}

module.exports = { issueSession, clearSession, readSession, COOKIE_NAME };
