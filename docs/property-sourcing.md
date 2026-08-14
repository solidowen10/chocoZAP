# Property Sourcing Workflow

Flow:

```text
591 Chrome Extension
→ Google Sheet tab: 自動蒐集
→ /api/property-sourcing/sheet-sync
→ /location/ Automated Listings
→ Scoring Rules
→ shortlist / Location Review
```

## Data Ownership

Crawler-owned fields may be updated on every import:

- `source`
- `source_listing_id`
- `url`
- `title`
- `city`
- `district`
- `rent_twd`
- `listed_area_ping`
- `floor_text`
- `property_type`
- `thumbnail_url`
- `scraped_at`
- `first_seen_at`
- `last_seen_at`

Human/research fields must not be erased by crawler re-import:

- `status`
- `usable_area_ping`
- `mrt_station`
- `mrt_minutes`
- `signage`
- `pedestrian_flow`
- `zoning_permit`
- `building_risks`
- `manual_notes`
- `reviewer`
- `reviewed_at`
- `shortlist_priority`
- `rejected_reason`
- `location_review_id`

`listed_area_ping` is raw crawler data only. It is never used as `usable_area_ping`.

## Google Sheet Setup

Create or use a tab named `自動蒐集`.

Install the Apps Script from:

```text
extensions/591-radar/google-apps-script.js
```

Deploy it as a Web App and paste the `/exec` URL into the Chrome Extension's
**Google Sheet Webhook URL** field.

For the server sync, either publish the `自動蒐集` tab as CSV or set:

```env
PROPERTY_SOURCING_SHEET_ID=...
PROPERTY_SOURCING_SHEET_TAB=自動蒐集
```

If the published CSV URL is custom, set:

```env
PROPERTY_SOURCING_SHEET_CSV_URL=https://docs.google.com/...
```

## Server Sync

The sync endpoint is token-protected in production:

```bash
curl -X POST https://gym.selinnaowen.com/api/property-sourcing/sheet-sync \
  -H "Authorization: Bearer $LOCATION_SYNC_TOKEN"
```

The frontend also has a **從 Google Sheet 同步** button under:

```text
/location/ → Automated Listings / 自動蒐集
```

It prompts once for `LOCATION_SYNC_TOKEN` and stores it in local browser storage.

## Frontend

Open:

```text
/location/
```

Entry points:

- **Manual Research / 人工蒐集**: existing Location Review behavior.
- **Automated Listings / 自動蒐集**: real synced data from the Google Sheet pipeline.
- **Scoring Rules / 評分規則**: visual scoring controls, persisted server-side.

Changing scoring rules recalculates existing automated listings without another
591 scan.

## Status Workflow

Supported statuses:

- `new`
- `reviewing`
- `shortlisted`
- `rejected`
- `archived`

An automated listing can be promoted into the existing Location Review report
with source traceability:

- `source`
- `source_listing_id`
- `sourceUrl`
