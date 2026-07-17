// routes/auth.js
const express = require('express');
const fetch = require('node-fetch');
const db = require('../db/db');
const { newId } = require('../lib/util');
const { issueSession, clearSession } = require('../lib/session');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const LINE_CHANNEL_ID = process.env.LINE_LOGIN_CHANNEL_ID;
const LINE_CHANNEL_SECRET = process.env.LINE_LOGIN_CHANNEL_SECRET;
const LINE_CALLBACK_URL = process.env.LINE_LOGIN_CALLBACK_URL; // e.g. https://yourdomain.com/auth/line/callback
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

function findOrCreateUserByLine(profile) {
  let user = db.prepare('SELECT * FROM users WHERE line_user_id = ?').get(profile.userId);
  if (!user) {
    const id = newId('usr');
    db.prepare(
      `INSERT INTO users (id, line_user_id, display_name, picture_url) VALUES (?, ?, ?, ?)`
    ).run(id, profile.userId, profile.displayName, profile.pictureUrl || null);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  }
  return user;
}

// --- Real LINE Login flow ---------------------------------------------

router.get('/auth/line/login', (req, res) => {
  if (!LINE_CHANNEL_ID) {
    return res.status(500).send('LINE login is not configured. Set LINE_LOGIN_CHANNEL_ID etc, or use /auth/dev-login in development.');
  }
  const state = newId('st');
  res.cookie('line_oauth_state', state, { httpOnly: true, maxAge: 10 * 60 * 1000 });
  const invite = req.query.invite ? `&state=${state}::${req.query.invite}` : `&state=${state}`;
  const url = `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${LINE_CHANNEL_ID}` +
    `&redirect_uri=${encodeURIComponent(LINE_CALLBACK_URL)}&scope=${encodeURIComponent('profile openid')}${invite}`;
  res.redirect(url);
});

router.get('/auth/line/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    const cookieState = req.cookies.line_oauth_state;
    const [receivedState, inviteCode] = String(state || '').split('::');
    if (!code || receivedState !== cookieState) {
      return res.status(400).send('Invalid OAuth state.');
    }

    const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: LINE_CALLBACK_URL,
        client_id: LINE_CHANNEL_ID,
        client_secret: LINE_CHANNEL_SECRET,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      return res.status(400).send('LINE token exchange failed.');
    }

    const profileRes = await fetch('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = await profileRes.json();

    const user = findOrCreateUserByLine(profile);
    issueSession(res, user.id);

    if (inviteCode) {
      return res.redirect(`${APP_URL}/#/accept-invite/${inviteCode}`);
    }
    res.redirect(`${APP_URL}/`);
  } catch (err) {
    console.error('LINE callback error:', err);
    res.status(500).send('Login failed.');
  }
});

// --- Dev login (only enabled outside production) ----------------------
// Lets you build/test the whole app locally before LINE channel credentials
// exist. Guarded so it can never be reached in production.

router.get('/auth/dev-login', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).send('Not found.');
  }
  const name = req.query.name || 'Dev User';
  const fakeLineId = `dev_${name.toLowerCase().replace(/\s+/g, '_')}`;
  let user = db.prepare('SELECT * FROM users WHERE line_user_id = ?').get(fakeLineId);
  if (!user) {
    const id = newId('usr');
    db.prepare(`INSERT INTO users (id, line_user_id, display_name) VALUES (?, ?, ?)`).run(id, fakeLineId, name);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  }
  issueSession(res, user.id);
  res.redirect('/');
});

router.post('/auth/logout', (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

router.get('/auth/me', requireAuth, (req, res) => {
  const memberships = db.prepare(`
    SELECT m.org_id, m.role, o.name as org_name, o.slug as org_slug
    FROM memberships m JOIN organizations o ON o.id = m.org_id
    WHERE m.user_id = ?
    ORDER BY o.name
  `).all(req.user.id);
  res.json({ user: req.user, memberships });
});

// Accept an org invite code (requires login first)
router.post('/auth/accept-invite', requireAuth, (req, res) => {
  const { code } = req.body;
  const invite = db.prepare('SELECT * FROM invites WHERE code = ?').get(code);
  if (!invite) return res.status(404).json({ error: 'invite_not_found' });
  if (invite.used_by) return res.status(400).json({ error: 'invite_already_used' });
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return res.status(400).json({ error: 'invite_expired' });
  }

  const existing = db.prepare('SELECT * FROM memberships WHERE org_id = ? AND user_id = ?')
    .get(invite.org_id, req.user.id);
  if (!existing) {
    db.prepare(`INSERT INTO memberships (id, org_id, user_id, role) VALUES (?, ?, ?, ?)`)
      .run(newId('mem'), invite.org_id, req.user.id, invite.role);
  }
  db.prepare(`UPDATE invites SET used_by = ?, used_at = datetime('now') WHERE id = ?`)
    .run(req.user.id, invite.id);

  const org = db.prepare('SELECT * FROM organizations WHERE id = ?').get(invite.org_id);
  res.json({ ok: true, org });
});

module.exports = router;
