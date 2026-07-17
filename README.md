# Site Ledger — Expansion Tracker

A multi-tenant project tracker for rolling out physical locations (gyms,
retail stores, restaurants, etc.) from scouting through grand opening.
Built so **CRDN's 100-gym rollout is just one tenant** — the same install
can be sold to another company later; they get their own organization,
their own pipeline, their own users.

## Stack

- Node.js + Express (single process, no build step)
- SQLite via `better-sqlite3` (WAL mode — safe for several people co-editing)
- Vanilla JS single-file SPA (`public/index.html` — no React/TypeScript/build tool)
- LINE Login for authentication
- LINE Messaging API for periodic progress pushes
- `node-cron` for the notification scheduler
- Deploy target: AWS Lightsail + PM2 + Nginx (same pattern as your other tools)

## Core concepts

- **Organization (tenant)** — one per company/team using the system. CRDN is
  one organization. If you resell this, another company signs up as a second
  organization with zero code changes.
- **Roles** (per org, per user): `viewer` → `editor` → `manager` → `admin` → `owner`.
  Viewer = read-only. Editor = update checklists/comments. Manager = editor +
  can trigger/receive LINE digests. Admin = manager + manage members/pipeline.
  Owner = admin + can't be removed below the last remaining owner.
- **Pipeline** — each org has its own ordered **stages** (defaults: Scouting →
  Confirmed → Planning → Building → Grand Opening) and each stage has its own
  **sub-steps** (the actual checklist items). Fully editable per org under
  Admin → Pipeline, so a future customer's process doesn't have to look
  anything like a gym rollout.
- **Location** — one row per physical site being opened. Carries its own
  checklist state (one row per sub-step), comments, and activity log.
  Completing every sub-step in a stage auto-advances the location to the
  next stage.
- **Notifications** — each org has one schedule (daily/weekly + hour, in
  Asia/Taipei by default). Any member with "LINE digest" enabled gets a
  push summarizing every active location's stage, % complete, and blocked
  items. Managers+ can also trigger "Send digest now" on demand.

## Local development (no LINE credentials needed yet)

```bash
npm install
cp .env.example .env      # leave LINE_* blank for now
npm run dev
```

Open http://localhost:3000 — you'll see a "Dev login" button (only shown
outside production) that lets you create fake local users and test the
whole app, including multi-user co-editing, before you've set up LINE.

## Setting up LINE (before going to production)

You need **two separate LINE channels**:

1. **LINE Login channel** (developers.line.biz console) — for sign-in.
   Set the callback URL to `https://yourdomain.com/auth/line/callback` and
   put the channel ID/secret into `LINE_LOGIN_CHANNEL_ID` / `_SECRET`.
2. **Messaging API channel** — for push notifications. Generate a long-lived
   channel access token and put it in `LINE_MESSAGING_ACCESS_TOKEN`. Every
   person who should receive digests must add this channel's official
   account as a LINE friend once (share the QR code from that channel's
   console).

Without the Messaging API token set, `send-now` and the cron job simply log
the digest to the server console instead of failing — safe to leave unset
in staging.

## Deploying (AWS Lightsail + PM2 + Nginx)

```bash
# On the Lightsail instance
git clone <your-repo> /opt/site-ledger
cd /opt/site-ledger
npm install --omit=dev
cp .env.example .env   # fill in real values, NODE_ENV=production

pm2 start server.js --name site-ledger
pm2 save
```

Nginx (reverse proxy + TLS via certbot, same as your other tools):

```nginx
server {
  server_name tracker.yourdomain.com;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_http_version 1.1;
  }
}
```

The SQLite file lives at `data/app.db` by default — back it up like any
other file (e.g. a nightly `cp` to S3 or another disk). WAL mode means
you'll also see `app.db-wal` / `app.db-shm`; include those in backups too,
or run `PRAGMA wal_checkpoint(TRUNCATE);` before copying.

## Multi-tenant / resale checklist

Already handled: every table is scoped by `org_id`, every route enforces
org membership + role, pipelines are per-org and fully editable, a user can
belong to multiple orgs (useful for a contractor working with two clients).

Before onboarding an unrelated second company, you'll probably want to add:
- **Per-org custom branding** (name/logo shown in the sidebar) — one column
  on `organizations`, small SPA tweak.
- **Location-level access scoping** (an editor who should only see/edit
  *their* sites, not the whole org) — add a `location_assignments` table;
  the schema already isolates everything else needed for this.
- **Billing/plan limits** — not included; bolt on separately (e.g. Stripe)
  once there's a paying second customer.

## Project structure

```
server.js               entry point
db/db.js                schema (SQLite)
db/defaultTemplate.js    default 5-stage pipeline seeded for new orgs
lib/session.js           JWT-in-cookie auth
lib/lineNotify.js        LINE push helper + digest text builder
middleware/auth.js       attaches req.user from session cookie
middleware/rbac.js       enforces per-org minimum role
routes/auth.js           LINE Login OAuth + dev login + invites
routes/orgs.js           org creation, members, invites
routes/stages.js         pipeline (stage/sub-step template) admin
routes/locations.js      location CRUD, checklist updates, comments
routes/notifications.js  notification settings + manual send
cron/notify.js           hourly scheduler, checks each org's send time
public/index.html        the entire frontend (no build step)
```
