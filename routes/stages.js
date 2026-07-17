// routes/stages.js
const express = require('express');
const db = require('../db/db');
const { newId } = require('../lib/util');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

const router = express.Router();
router.use(requireAuth);

// Full pipeline (stages + nested substeps), used by the workspace board
// and the admin pipeline editor.
router.get('/orgs/:orgId/pipeline', requireRole('viewer'), (req, res) => {
  const stages = db.prepare(`SELECT * FROM stage_templates WHERE org_id = ? ORDER BY order_index`).all(req.orgId);
  const substeps = db.prepare(`SELECT * FROM substep_templates WHERE org_id = ? ORDER BY order_index`).all(req.orgId);
  const byStage = {};
  substeps.forEach((s) => {
    (byStage[s.stage_template_id] = byStage[s.stage_template_id] || []).push(s);
  });
  res.json({ stages: stages.map((s) => ({ ...s, substeps: byStage[s.id] || [] })) });
});

router.post('/orgs/:orgId/stages', requireRole('admin'), (req, res) => {
  const { name, color = '#6b7280' } = req.body;
  if (!name) return res.status(400).json({ error: 'name_required' });
  const maxOrder = db.prepare(`SELECT COALESCE(MAX(order_index), -1) m FROM stage_templates WHERE org_id = ?`).get(req.orgId).m;
  const id = newId('stg');
  const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  db.prepare(`INSERT INTO stage_templates (id, org_id, key, name, color, order_index) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(id, req.orgId, key, name, color, maxOrder + 1);
  res.json({ stage: db.prepare('SELECT * FROM stage_templates WHERE id = ?').get(id) });
});

router.patch('/orgs/:orgId/stages/:stageId', requireRole('admin'), (req, res) => {
  const { name, color, order_index } = req.body;
  const fields = []; const params = [];
  if (name) { fields.push('name = ?'); params.push(name); }
  if (color) { fields.push('color = ?'); params.push(color); }
  if (typeof order_index === 'number') { fields.push('order_index = ?'); params.push(order_index); }
  if (!fields.length) return res.status(400).json({ error: 'nothing_to_update' });
  params.push(req.params.stageId, req.orgId);
  db.prepare(`UPDATE stage_templates SET ${fields.join(', ')} WHERE id = ? AND org_id = ?`).run(...params);
  res.json({ ok: true });
});

router.delete('/orgs/:orgId/stages/:stageId', requireRole('admin'), (req, res) => {
  db.prepare('DELETE FROM stage_templates WHERE id = ? AND org_id = ?').run(req.params.stageId, req.orgId);
  res.json({ ok: true });
});

router.post('/orgs/:orgId/stages/:stageId/substeps', requireRole('admin'), (req, res) => {
  const { name, is_milestone = 0 } = req.body;
  if (!name) return res.status(400).json({ error: 'name_required' });
  const maxOrder = db.prepare(`SELECT COALESCE(MAX(order_index), -1) m FROM substep_templates WHERE stage_template_id = ?`)
    .get(req.params.stageId).m;
  const id = newId('sub');
  db.prepare(`INSERT INTO substep_templates (id, org_id, stage_template_id, name, order_index, is_milestone) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(id, req.orgId, req.params.stageId, name, maxOrder + 1, is_milestone ? 1 : 0);

  // Backfill a not_started progress row for every existing location so the
  // new checklist item immediately shows up across the board.
  const locations = db.prepare('SELECT id FROM locations WHERE org_id = ?').all(req.orgId);
  const insertProgress = db.prepare(`INSERT OR IGNORE INTO location_progress (id, location_id, substep_template_id) VALUES (?, ?, ?)`);
  locations.forEach((loc) => insertProgress.run(newId('prg'), loc.id, id));

  res.json({ substep: db.prepare('SELECT * FROM substep_templates WHERE id = ?').get(id) });
});

router.patch('/orgs/:orgId/substeps/:substepId', requireRole('admin'), (req, res) => {
  const { name, order_index, is_milestone } = req.body;
  const fields = []; const params = [];
  if (name) { fields.push('name = ?'); params.push(name); }
  if (typeof order_index === 'number') { fields.push('order_index = ?'); params.push(order_index); }
  if (typeof is_milestone === 'number') { fields.push('is_milestone = ?'); params.push(is_milestone); }
  if (!fields.length) return res.status(400).json({ error: 'nothing_to_update' });
  params.push(req.params.substepId, req.orgId);
  db.prepare(`UPDATE substep_templates SET ${fields.join(', ')} WHERE id = ? AND org_id = ?`).run(...params);
  res.json({ ok: true });
});

router.delete('/orgs/:orgId/substeps/:substepId', requireRole('admin'), (req, res) => {
  db.prepare('DELETE FROM substep_templates WHERE id = ? AND org_id = ?').run(req.params.substepId, req.orgId);
  res.json({ ok: true });
});

module.exports = router;
