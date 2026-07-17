// db/db.js
// Single SQLite file, WAL mode for concurrent co-editing reads/writes.
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'app.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  line_user_id TEXT UNIQUE,
  display_name TEXT NOT NULL,
  picture_url TEXT,
  email TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A user can belong to multiple orgs (e.g. an outside contractor working
-- with two different client companies once this is resold).
CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','manager','editor','viewer')),
  notify_progress INTEGER NOT NULL DEFAULT 0, -- 1 = receives periodic LINE digests
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(org_id, user_id)
);

CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','manager','editor','viewer')),
  created_by TEXT REFERENCES users(id),
  expires_at TEXT,
  used_by TEXT REFERENCES users(id),
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Stage templates are per-org and ordered, so each tenant (gym chain,
-- retail chain, restaurant group, etc.) can define its own pipeline.
CREATE TABLE IF NOT EXISTS stage_templates (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key TEXT NOT NULL,           -- stable machine key, e.g. "scouting"
  name TEXT NOT NULL,          -- display name, e.g. "Scouting"
  color TEXT NOT NULL DEFAULT '#6b7280',
  order_index INTEGER NOT NULL,
  UNIQUE(org_id, key)
);

-- Sub-steps live inside a stage and are the actual checklist items
-- (e.g. within "Building": permits filed, structural work, fit-out, etc.)
CREATE TABLE IF NOT EXISTS substep_templates (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  stage_template_id TEXT NOT NULL REFERENCES stage_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  is_milestone INTEGER NOT NULL DEFAULT 0 -- milestone substeps drive stage-complete date
);

CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,             -- e.g. "Taichung - Xitun"
  city TEXT,
  address TEXT,
  lat REAL,
  lng REAL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','on_hold','cancelled','opened')),
  current_stage_id TEXT REFERENCES stage_templates(id),
  target_open_date TEXT,
  owner_user_id TEXT REFERENCES users(id), -- location lead / point person
  notes TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS location_progress (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  substep_template_id TEXT NOT NULL REFERENCES substep_templates(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','in_progress','done','blocked')),
  notes TEXT,
  due_date TEXT,
  completed_by TEXT REFERENCES users(id),
  completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(location_id, substep_template_id)
);

CREATE TABLE IF NOT EXISTS activity_log (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  location_id TEXT REFERENCES locations(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,     -- e.g. "stage_change", "substep_update", "comment"
  detail TEXT,              -- free text / JSON string
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notification_settings (
  org_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 1,
  frequency TEXT NOT NULL DEFAULT 'weekly' CHECK (frequency IN ('daily','weekly')),
  day_of_week INTEGER NOT NULL DEFAULT 1, -- 0=Sun..6=Sat, used when weekly
  hour_local INTEGER NOT NULL DEFAULT 9,  -- 0-23, Asia/Taipei
  last_sent_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_locations_org ON locations(org_id);
CREATE INDEX IF NOT EXISTS idx_progress_location ON location_progress(location_id);
CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_org ON activity_log(org_id);
`);

module.exports = db;
