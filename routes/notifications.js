// routes/notifications.js
const express = require('express');
const db = require('../db/db');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { sendOrgDigest } = require('../lib/lineNotify');

const router = express.Router();
router.use(requireAuth);

router.get('/orgs/:orgId/notification-settings', requireRole('manager'), (req, res) => {
  const settings = db.prepare('SELECT * FROM notification_settings WHERE org_id = ?').get(req.orgId);
  res.json({ settings });
});

router.patch('/orgs/:orgId/notification-settings', requireRole('admin'), (req, res) => {
  const { enabled, frequency, day_of_week, hour_local } = req.body;
  const fields = []; const params = [];
  if (typeof enabled === 'number') { fields.push('enabled = ?'); params.push(enabled); }
  if (frequency) { fields.push('frequency = ?'); params.push(frequency); }
  if (typeof day_of_week === 'number') { fields.push('day_of_week = ?'); params.push(day_of_week); }
  if (typeof hour_local === 'number') { fields.push('hour_local = ?'); params.push(hour_local); }
  if (!fields.length) return res.status(400).json({ error: 'nothing_to_update' });
  params.push(req.orgId);
  db.prepare(`UPDATE notification_settings SET ${fields.join(', ')} WHERE org_id = ?`).run(...params);
  res.json({ ok: true });
});

// Manual "send digest now" button for managers/admins/owner
router.post('/orgs/:orgId/notifications/send-now', requireRole('manager'), async (req, res) => {
  const result = await sendOrgDigest(req.orgId);
  res.json(result);
});

module.exports = router;
