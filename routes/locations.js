// routes/locations.js
const express = require('express');
const db = require('../db/db');
const { newId } = require('../lib/util');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

const router = express.Router();
router.use(requireAuth);

function logActivity(orgId, locationId, userId, action, detail) {
  db.prepare(`INSERT INTO activity_log (id, org_id, location_id, user_id, action, detail) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(newId('act'), orgId, locationId, userId, action, detail ? JSON.stringify(detail) : null);
}

function computeProgressPct(locationId) {
  const rows = db.prepare('SELECT status FROM location_progress WHERE location_id = ?').all(locationId);
  if (!rows.length) return 0;
  const done = rows.filter((r) => r.status === 'done').length;
  return Math.round((done / rows.length) * 100);
}

// Dashboard: every location with its stage, overall %, and flags for
// stalled/blocked items (used for both the UI and the notification job).
router.get('/orgs/:orgId/locations', requireRole('viewer'), (req, res) => {
  const locations = db.prepare(`
    SELECT l.*, s.name as stage_name, s.color as stage_color, s.order_index as stage_order,
           u.display_name as owner_name
    FROM locations l
    LEFT JOIN stage_templates s ON s.id = l.current_stage_id
    LEFT JOIN users u ON u.id = l.owner_user_id
    WHERE l.org_id = ?
    ORDER BY s.order_index, l.target_open_date
  `).all(req.orgId);

  const withProgress = locations.map((loc) => {
    const blockedCount = db.prepare(`SELECT COUNT(*) c FROM location_progress WHERE location_id = ? AND status = 'blocked'`)
      .get(loc.id).c;
    return { ...loc, progress_pct: computeProgressPct(loc.id), blocked_count: blockedCount };
  });

  res.json({ locations: withProgress });
});

router.post('/orgs/:orgId/locations', requireRole('editor'), (req, res) => {
  const { name, city, address, target_open_date, owner_user_id, notes } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name_required' });

  const firstStage = db.prepare(`SELECT id FROM stage_templates WHERE org_id = ? ORDER BY order_index LIMIT 1`).get(req.orgId);
  const id = newId('loc');

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO locations (id, org_id, name, city, address, target_open_date, owner_user_id, notes, current_stage_id, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, req.orgId, name.trim(), city || null, address || null, target_open_date || null, owner_user_id || null, notes || null,
      firstStage ? firstStage.id : null, req.user.id);

    // Create a not_started progress row for every substep in the pipeline.
    const substeps = db.prepare('SELECT id FROM substep_templates WHERE org_id = ?').all(req.orgId);
    const insert = db.prepare(`INSERT INTO location_progress (id, location_id, substep_template_id) VALUES (?, ?, ?)`);
    substeps.forEach((s) => insert.run(newId('prg'), id, s.id));

    logActivity(req.orgId, id, req.user.id, 'location_created', { name });
  });
  tx();

  res.json({ location: db.prepare('SELECT * FROM locations WHERE id = ?').get(id) });
});

router.get('/orgs/:orgId/locations/:locationId', requireRole('viewer'), (req, res) => {
  const location = db.prepare('SELECT * FROM locations WHERE id = ? AND org_id = ?').get(req.params.locationId, req.orgId);
  if (!location) return res.status(404).json({ error: 'not_found' });

  const stages = db.prepare(`SELECT * FROM stage_templates WHERE org_id = ? ORDER BY order_index`).all(req.orgId);
  const substeps = db.prepare(`SELECT * FROM substep_templates WHERE org_id = ? ORDER BY order_index`).all(req.orgId);
  const progress = db.prepare(`SELECT * FROM location_progress WHERE location_id = ?`).all(req.params.locationId);
  const progressBySubstep = Object.fromEntries(progress.map((p) => [p.substep_template_id, p]));

  const pipeline = stages.map((stage) => ({
    ...stage,
    substeps: substeps
      .filter((s) => s.stage_template_id === stage.id)
      .map((s) => ({ ...s, progress: progressBySubstep[s.id] || null })),
  }));

  const comments = db.prepare(`
    SELECT c.*, u.display_name, u.picture_url FROM comments c
    JOIN users u ON u.id = c.user_id
    WHERE c.location_id = ? ORDER BY c.created_at DESC LIMIT 100
  `).all(req.params.locationId);

  const activity = db.prepare(`
    SELECT a.*, u.display_name FROM activity_log a
    LEFT JOIN users u ON u.id = a.user_id
    WHERE a.location_id = ? ORDER BY a.created_at DESC LIMIT 100
  `).all(req.params.locationId);

  res.json({ location, pipeline, comments, activity, progress_pct: computeProgressPct(req.params.locationId) });
});

router.patch('/orgs/:orgId/locations/:locationId', requireRole('editor'), (req, res) => {
  const allowed = ['name', 'city', 'address', 'target_open_date', 'owner_user_id', 'notes', 'status', 'current_stage_id'];
  const fields = []; const params = [];
  for (const key of allowed) {
    if (key in req.body) { fields.push(`${key} = ?`); params.push(req.body[key]); }
  }
  if (!fields.length) return res.status(400).json({ error: 'nothing_to_update' });
  fields.push(`updated_at = datetime('now')`);
  params.push(req.params.locationId, req.orgId);
  db.prepare(`UPDATE locations SET ${fields.join(', ')} WHERE id = ? AND org_id = ?`).run(...params);
  logActivity(req.orgId, req.params.locationId, req.user.id, 'location_updated', req.body);
  res.json({ location: db.prepare('SELECT * FROM locations WHERE id = ?').get(req.params.locationId) });
});

router.delete('/orgs/:orgId/locations/:locationId', requireRole('admin'), (req, res) => {
  db.prepare('DELETE FROM locations WHERE id = ? AND org_id = ?').run(req.params.locationId, req.orgId);
  res.json({ ok: true });
});

// Update a single checklist item's status (this is the main co-editing action)
router.patch('/orgs/:orgId/locations/:locationId/progress/:substepId', requireRole('editor'), (req, res) => {
  const { status, notes, due_date } = req.body;
  const valid = ['not_started', 'in_progress', 'done', 'blocked'];
  if (status && !valid.includes(status)) return res.status(400).json({ error: 'invalid_status' });

  const existing = db.prepare('SELECT * FROM location_progress WHERE location_id = ? AND substep_template_id = ?')
    .get(req.params.locationId, req.params.substepId);
  if (!existing) return res.status(404).json({ error: 'not_found' });

  const fields = [`updated_at = datetime('now')`];
  const params = [];
  if (status) {
    fields.push('status = ?'); params.push(status);
    if (status === 'done') {
      fields.push('completed_by = ?', `completed_at = datetime('now')`);
      params.push(req.user.id);
    } else {
      fields.push('completed_by = NULL', 'completed_at = NULL');
    }
  }
  if (typeof notes === 'string') { fields.push('notes = ?'); params.push(notes); }
  if (due_date !== undefined) { fields.push('due_date = ?'); params.push(due_date); }

  params.push(existing.id);
  db.prepare(`UPDATE location_progress SET ${fields.join(', ')} WHERE id = ?`).run(...params);

  if (status) {
    const substep = db.prepare('SELECT name FROM substep_templates WHERE id = ?').get(req.params.substepId);
    logActivity(req.orgId, req.params.locationId, req.user.id, 'substep_update', { substep: substep && substep.name, status });

    // If this substep is a milestone that unlocks the next stage, auto-advance
    // current_stage_id when every substep in the current stage is done.
    if (status === 'done') {
      const loc = db.prepare('SELECT * FROM locations WHERE id = ?').get(req.params.locationId);
      const stageSubsteps = db.prepare(`
        SELECT ls.id FROM substep_templates ls WHERE ls.stage_template_id = ?
      `).all(loc.current_stage_id);
      const stageProgress = db.prepare(`
        SELECT status FROM location_progress WHERE location_id = ? AND substep_template_id IN (${stageSubsteps.map(() => '?').join(',') || "''"})
      `).all(req.params.locationId, ...stageSubsteps.map((s) => s.id));
      const allDone = stageProgress.length > 0 && stageProgress.every((p) => p.status === 'done');
      if (allDone) {
        const nextStage = db.prepare(`
          SELECT * FROM stage_templates WHERE org_id = ? AND order_index > (
            SELECT order_index FROM stage_templates WHERE id = ?
          ) ORDER BY order_index LIMIT 1
        `).get(req.orgId, loc.current_stage_id);
        if (nextStage) {
          db.prepare(`UPDATE locations SET current_stage_id = ? WHERE id = ?`).run(nextStage.id, req.params.locationId);
          logActivity(req.orgId, req.params.locationId, req.user.id, 'stage_advanced', { to: nextStage.name });
        }
      }
    }
  }

  res.json({ progress: db.prepare('SELECT * FROM location_progress WHERE id = ?').get(existing.id) });
});

router.post('/orgs/:orgId/locations/:locationId/comments', requireRole('editor'), (req, res) => {
  const { body } = req.body;
  if (!body || !body.trim()) return res.status(400).json({ error: 'body_required' });
  const id = newId('cmt');
  db.prepare(`INSERT INTO comments (id, location_id, user_id, body) VALUES (?, ?, ?, ?)`)
    .run(id, req.params.locationId, req.user.id, body.trim());
  logActivity(req.orgId, req.params.locationId, req.user.id, 'comment', { preview: body.trim().slice(0, 80) });
  res.json({ comment: db.prepare('SELECT * FROM comments WHERE id = ?').get(id) });
});

module.exports = router;
