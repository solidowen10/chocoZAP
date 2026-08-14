// lib/lineNotify.js
// Sends a periodic progress digest to every org member who opted in
// (memberships.notify_progress = 1), via the LINE Messaging API.
// This requires a separate LINE "Messaging API" channel (not the Login
// channel) whose access token goes in LINE_MESSAGING_ACCESS_TOKEN.
// Each recipient must have added that channel's official account as a
// friend at least once for push messages to reach them.
const fetch = require('node-fetch');
const db = require('../db/db');

const MESSAGING_TOKEN = process.env.LINE_MESSAGING_ACCESS_TOKEN;

function buildDigestText(org, locations) {
  const lines = [`📋 ${org.name} — 進度摘要`, ''];
  const byStage = {};
  locations.forEach((l) => {
    const key = l.stage_name || '尚未設定階段';
    (byStage[key] = byStage[key] || []).push(l);
  });
  if (!locations.length) {
    lines.push('目前沒有進行中的門市。', '');
  }
  Object.entries(byStage).forEach(([stage, locs]) => {
    lines.push(`■ ${stage} (${locs.length})`);
    locs.forEach((l) => {
      const flag = l.blocked_count > 0 ? ` ⚠️${l.blocked_count} 個卡關項目` : '';
      lines.push(`  • ${l.name}: ${l.progress_pct}%${flag}`);
    });
    lines.push('');
  });
  lines.push(`查看完整工作區：${process.env.APP_URL || ''}`);
  return lines.join('\n').slice(0, 4900); // LINE text message limit ~5000 chars
}

async function pushLineMessage(lineUserId, text) {
  if (!MESSAGING_TOKEN) {
    console.warn('[lineNotify] LINE_MESSAGING_ACCESS_TOKEN not set — skipping push, logging instead:\n', text);
    return { skipped: true };
  }
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${MESSAGING_TOKEN}`,
    },
    body: JSON.stringify({ to: lineUserId, messages: [{ type: 'text', text }] }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`[lineNotify] push failed for ${lineUserId}: ${res.status} ${body}`);
  }
  return { ok: res.ok };
}

// Sends the digest for one org right now, to everyone subscribed.
async function sendOrgDigest(orgId) {
  const org = db.prepare('SELECT * FROM organizations WHERE id = ?').get(orgId);
  if (!org) return { error: 'org_not_found' };

  const locations = db.prepare(`
    SELECT l.*, s.name as stage_name, s.order_index as stage_order
    FROM locations l LEFT JOIN stage_templates s ON s.id = l.current_stage_id
    WHERE l.org_id = ? AND l.status = 'active'
    ORDER BY s.order_index
  `).all(orgId);

  const withPct = locations.map((l) => {
    const rows = db.prepare('SELECT status FROM location_progress WHERE location_id = ?').all(l.id);
    const done = rows.filter((r) => r.status === 'done').length;
    const blocked = rows.filter((r) => r.status === 'blocked').length;
    return { ...l, progress_pct: rows.length ? Math.round((done / rows.length) * 100) : 0, blocked_count: blocked };
  });

  const text = buildDigestText(org, withPct);

  const recipients = db.prepare(`
    SELECT u.line_user_id FROM memberships m
    JOIN users u ON u.id = m.user_id
    WHERE m.org_id = ? AND m.notify_progress = 1 AND u.line_user_id IS NOT NULL AND u.line_user_id NOT LIKE 'dev_%'
  `).all(orgId);

  const results = await Promise.all(recipients.map((r) => pushLineMessage(r.line_user_id, text)));
  db.prepare(`UPDATE notification_settings SET last_sent_at = datetime('now') WHERE org_id = ?`).run(orgId);
  return { sent_to: recipients.length, results };
}

module.exports = { sendOrgDigest, buildDigestText };
