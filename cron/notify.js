// cron/notify.js
// Runs once an hour. For each org, checks whether "now" (in Asia/Taipei)
// matches its configured schedule (daily @ hour_local, or weekly @
// day_of_week + hour_local) and, if so and it hasn't already sent today,
// sends the LINE progress digest.
const cron = require('node-cron');
const db = require('../db/db');
const { sendOrgDigest } = require('../lib/lineNotify');

const TZ = process.env.SCHEDULE_TZ || 'Asia/Taipei';

function nowInTz() {
  // Use Intl to get local hour/day-of-week without extra deps.
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hour: 'numeric', hour12: false, weekday: 'short',
  });
  const parts = fmt.formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === 'hour').value) % 24;
  const weekdayStr = parts.find((p) => p.type === 'weekday').value;
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { hour, dayOfWeek: map[weekdayStr] };
}

async function tick() {
  const { hour, dayOfWeek } = nowInTz();
  const settings = db.prepare('SELECT * FROM notification_settings WHERE enabled = 1').all();

  for (const s of settings) {
    if (s.hour_local !== hour) continue;
    if (s.frequency === 'weekly' && s.day_of_week !== dayOfWeek) continue;

    // Avoid double-sends if the job fires more than once inside the same hour.
    if (s.last_sent_at) {
      const last = new Date(s.last_sent_at + 'Z');
      const hoursSince = (Date.now() - last.getTime()) / 3600000;
      if (hoursSince < 1) continue;
    }

    try {
      const result = await sendOrgDigest(s.org_id);
      console.log(`[cron] digest sent for org ${s.org_id}:`, result);
    } catch (err) {
      console.error(`[cron] failed to send digest for org ${s.org_id}:`, err);
    }
  }
}

function startNotifyCron() {
  // Run at the top of every hour.
  cron.schedule('0 * * * *', tick, { timezone: TZ });
  console.log(`[cron] notification scheduler started (timezone ${TZ})`);
}

module.exports = { startNotifyCron, tick };
