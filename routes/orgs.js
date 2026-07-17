// routes/orgs.js
const express = require('express');
const db = require('../db/db');
const { newId } = require('../lib/util');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const DEFAULT_TEMPLATE = require('../db/defaultTemplate');

const router = express.Router();
router.use(requireAuth);

function slugify(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || newId('org').slice(4);
}

// Create a new organization (tenant). Creator becomes owner and the
// default 5-stage pipeline is seeded automatically.
router.post('/orgs', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name_required' });

  let slug = slugify(name);
  let attempt = 0;
  while (db.prepare('SELECT 1 FROM organizations WHERE slug = ?').get(slug)) {
    attempt += 1;
    slug = `${slugify(name)}-${attempt}`;
  }

  const orgId = newId('org');
  const tx = db.transaction(() => {
    db.prepare('INSERT INTO organizations (id, name, slug) VALUES (?, ?, ?)').run(orgId, name.trim(), slug);
    db.prepare('INSERT INTO memberships (id, org_id, user_id, role, notify_progress) VALUES (?, ?, ?, ?, 1)')
      .run(newId('mem'), orgId, req.user.id, 'owner');
    db.prepare(`INSERT INTO notification_settings (org_id) VALUES (?)`).run(orgId);

    DEFAULT_TEMPLATE.forEach((stage, stageIdx) => {
      const stageId = newId('stg');
      db.prepare(`INSERT INTO stage_templates (id, org_id, key, name, color, order_index) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(stageId, orgId, stage.key, stage.name, stage.color, stageIdx);
      stage.substeps.forEach((label, subIdx) => {
        db.prepare(`INSERT INTO substep_templates (id, org_id, stage_template_id, name, order_index) VALUES (?, ?, ?, ?, ?)`)
          .run(newId('sub'), orgId, stageId, label, subIdx);
      });
    });
  });
  tx();

  const org = db.prepare('SELECT * FROM organizations WHERE id = ?').get(orgId);
  res.json({ org });
});

// List members of an org
router.get('/orgs/:orgId/members', requireRole('viewer'), (req, res) => {
  const members = db.prepare(`
    SELECT u.id, u.display_name, u.picture_url, m.role, m.notify_progress, m.created_at
    FROM memberships m JOIN users u ON u.id = m.user_id
    WHERE m.org_id = ?
    ORDER BY m.role, u.display_name
  `).all(req.orgId);
  res.json({ members });
});

// Change a member's role (admin+)
router.patch('/orgs/:orgId/members/:userId', requireRole('admin'), (req, res) => {
  const { role, notify_progress } = req.body;
  const target = db.prepare('SELECT * FROM memberships WHERE org_id = ? AND user_id = ?').get(req.orgId, req.params.userId);
  if (!target) return res.status(404).json({ error: 'member_not_found' });

  // Only an owner can create/demote another owner, and you can't demote the last owner.
  if ((role && role !== target.role) && (target.role === 'owner' || role === 'owner') && req.membership.role !== 'owner') {
    return res.status(403).json({ error: 'only_owner_can_change_owner_role' });
  }
  if (role && target.role === 'owner' && role !== 'owner') {
    const ownerCount = db.prepare(`SELECT COUNT(*) c FROM memberships WHERE org_id = ? AND role = 'owner'`).get(req.orgId).c;
    if (ownerCount <= 1) return res.status(400).json({ error: 'cannot_demote_last_owner' });
  }

  const fields = [];
  const params = [];
  if (role) { fields.push('role = ?'); params.push(role); }
  if (typeof notify_progress === 'number') { fields.push('notify_progress = ?'); params.push(notify_progress); }
  if (!fields.length) return res.status(400).json({ error: 'nothing_to_update' });
  params.push(req.orgId, req.params.userId);
  db.prepare(`UPDATE memberships SET ${fields.join(', ')} WHERE org_id = ? AND user_id = ?`).run(...params);
  res.json({ ok: true });
});

router.delete('/orgs/:orgId/members/:userId', requireRole('admin'), (req, res) => {
  const target = db.prepare('SELECT * FROM memberships WHERE org_id = ? AND user_id = ?').get(req.orgId, req.params.userId);
  if (target && target.role === 'owner') {
    const ownerCount = db.prepare(`SELECT COUNT(*) c FROM memberships WHERE org_id = ? AND role = 'owner'`).get(req.orgId).c;
    if (ownerCount <= 1) return res.status(400).json({ error: 'cannot_remove_last_owner' });
  }
  db.prepare('DELETE FROM memberships WHERE org_id = ? AND user_id = ?').run(req.orgId, req.params.userId);
  res.json({ ok: true });
});

// Create an invite link (admin+)
router.post('/orgs/:orgId/invites', requireRole('admin'), (req, res) => {
  const { role = 'editor', expiresInDays = 14 } = req.body;
  const id = newId('inv');
  const code = newId('code').replace('code_', '');
  const expiresAt = new Date(Date.now() + expiresInDays * 86400000).toISOString();
  db.prepare(`INSERT INTO invites (id, org_id, code, role, created_by, expires_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(id, req.orgId, code, role, req.user.id, expiresAt);
  res.json({ invite: { code, role, expiresAt, url: `${process.env.APP_URL || ''}/#/join/${code}` } });
});

router.get('/orgs/:orgId/invites', requireRole('admin'), (req, res) => {
  const invites = db.prepare(`SELECT * FROM invites WHERE org_id = ? ORDER BY created_at DESC`).all(req.orgId);
  res.json({ invites });
});

module.exports = router;
