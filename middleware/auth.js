// middleware/auth.js
const db = require('../db/db');
const { readSession } = require('../lib/session');

function attachUser(req, res, next) {
  const uid = readSession(req);
  if (uid) {
    req.user = db.prepare('SELECT * FROM users WHERE id = ?').get(uid) || null;
  } else {
    req.user = null;
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'not_authenticated' });
  next();
}

module.exports = { attachUser, requireAuth };
