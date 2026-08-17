const express = require('express');
const fs = require('fs');
const path = require('path');

const {
  HUMAN_FIELDS,
  defaultScoringConfig,
  mergeScoringConfig,
  listingFromSheetRow,
  listingIdentity,
  normalizeListing,
  normalizeHumanFields,
  scoreListings,
  scoreManualLocations,
  upsertListings,
  listingToLocationReviewItem,
} = require('../lib/propertySourcing');
const { readSheetRows } = require('../lib/googleSheets');

const router = express.Router();

const DATA_DIR = path.join(__dirname, '..', 'data');
const STORE_FILE = path.join(DATA_DIR, 'property-sourcing.json');
const CONFIG_FILE = path.join(DATA_DIR, 'property-scoring-config.json');
const LOCATION_REPORT_FILE = path.join(DATA_DIR, 'location-report.json');
const DEFAULT_SHEET_TAB = '自動蒐集';

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return fallback;
  }
}

function writeJson(file, value) {
  ensureDataDir();
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function readStore() {
  return readJson(STORE_FILE, {
    updatedAt: null,
    updatedBy: null,
    listings: [],
    lastImport: null,
  });
}

function writeStore(store) {
  writeJson(STORE_FILE, store);
}

function readConfig() {
  return mergeScoringConfig(readJson(CONFIG_FILE, null));
}

function writeConfig(config) {
  writeJson(CONFIG_FILE, mergeScoringConfig(config));
}

function authToken(req) {
  return (
    req.headers.authorization ||
    req.headers['x-sync-token'] ||
    ''
  ).replace(/^Bearer\s+/i, '');
}

function requireSyncToken(req, res, next) {
  if (!process.env.LOCATION_SYNC_TOKEN && process.env.NODE_ENV !== 'production') {
    return next();
  }

  if (
    process.env.LOCATION_SYNC_TOKEN &&
    authToken(req) === process.env.LOCATION_SYNC_TOKEN
  ) {
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized' });
}

function propertySourcingSheetId() {
  if (!process.env.PROPERTY_SOURCING_SHEET_ID) {
    throw new Error('PROPERTY_SOURCING_SHEET_ID is not configured');
  }

  return process.env.PROPERTY_SOURCING_SHEET_ID;
}

function propertySourcingSheetTab() {
  return process.env.PROPERTY_SOURCING_SHEET_TAB || DEFAULT_SHEET_TAB;
}

function scoredPayload(store = readStore(), config = readConfig()) {
  const scoringConfig = mergeScoringConfig(config);
  const listings = scoreListings(store.listings || [], scoringConfig);

  return {
    updatedAt: store.updatedAt || null,
    updatedBy: store.updatedBy || null,
    count: listings.length,
    listings,
    scoringConfig,
    lastImport: store.lastImport || null,
  };
}

function recalculateLocationReport(config) {
  const report = readJson(LOCATION_REPORT_FILE, null);
  if (!report) return null;

  const output = {
    ...report,
    updatedAt: new Date().toISOString(),
    updatedBy: 'Unified Scoring v1',
    locations: scoreManualLocations(Array.isArray(report.locations) ? report.locations : [], config),
    reviewOnly: scoreManualLocations(Array.isArray(report.reviewOnly) ? report.reviewOnly : [], config),
  };

  writeJson(LOCATION_REPORT_FILE, output);
  return {
    count: output.locations.length,
    reviewOnly: output.reviewOnly.length,
    updatedAt: output.updatedAt,
  };
}

function importListings(rawListings, options = {}) {
  const store = readStore();
  const result = upsertListings(store.listings || [], rawListings || [], {
    now: options.now || new Date().toISOString(),
  });

  const output = {
    ...store,
    updatedAt: options.now || new Date().toISOString(),
    updatedBy: options.updatedBy || 'Property Sourcing Import',
    listings: result.listings,
    lastImport: {
      importedAt: options.now || new Date().toISOString(),
      importedBy: options.updatedBy || 'Property Sourcing Import',
      created: result.created,
      updated: result.updated,
      rejected: result.rejected.length,
      source: options.source || 'api',
    },
  };

  writeStore(output);
  return { store: output, result };
}

router.get('/api/property-sourcing', (req, res) => {
  res.json(scoredPayload());
});

router.post('/api/property-sourcing/import', requireSyncToken, (req, res) => {
  if (!req.body || !Array.isArray(req.body.listings)) {
    return res.status(400).json({ error: 'listings must be an array' });
  }

  const { store, result } = importListings(req.body.listings, {
    updatedBy: req.body.updatedBy || '591 Radar Import',
    source: req.body.source || 'api',
  });

  return res.json({
    ok: true,
    count: store.listings.length,
    created: result.created,
    updated: result.updated,
    rejected: result.rejected,
    updatedAt: store.updatedAt,
  });
});

router.post('/api/property-sourcing/sheet-sync', requireSyncToken, async (req, res) => {
  try {
    const sheetTab = propertySourcingSheetTab();
    const rows = await readSheetRows(propertySourcingSheetId(), sheetTab);
    const listings = rows
      .map((row) => listingFromSheetRow(row))
      .filter((listing) => listingIdentity(listing) && listing.url);

    const { store, result } = importListings(listings, {
      updatedBy: 'Property Google Sheet Sync',
      source: 'google-sheet',
    });

    return res.json({
      ok: true,
      count: store.listings.length,
      rows: rows.length,
      created: result.created,
      updated: result.updated,
      rejected: result.rejected.length,
      updatedAt: store.updatedAt,
      sheet: sheetTab,
    });
  } catch (error) {
    console.error('[property-sourcing sheet-sync]', error);
    return res.status(500).json({
      error: 'sheet_sync_failed',
      message: error.message,
    });
  }
});

router.get('/api/property-sourcing/scoring-config', (req, res) => {
  res.json({ scoringConfig: readConfig() });
});

router.post('/api/property-sourcing/scoring-config', requireSyncToken, (req, res) => {
  const config = req.body && req.body.reset ? defaultScoringConfig() : mergeScoringConfig(req.body || {});
  writeConfig(config);
  const manual = recalculateLocationReport(config);
  res.json({
    ok: true,
    scoringConfig: config,
    manual,
    preview: scoredPayload(readStore(), config),
  });
});

router.patch('/api/property-sourcing/listings/:source/:sourceListingId', requireSyncToken, (req, res) => {
  const store = readStore();
  const identity = `${req.params.source}:${req.params.sourceListingId}`;
  const now = new Date().toISOString();
  let found = false;

  const listings = (store.listings || []).map((listing) => {
    if (listingIdentity(listing) !== identity) return listing;
    found = true;
    const humanPatch = normalizeHumanFields(req.body || {});
    const output = { ...listing };

    for (const field of HUMAN_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, field)) {
        output[field] = field === 'status' ? humanPatch.status : humanPatch[field];
      }
    }

    output.reviewed_at = output.reviewed_at || now;
    return normalizeListing(output);
  });

  if (!found) return res.status(404).json({ error: 'not_found' });

  const output = {
    ...store,
    updatedAt: now,
    updatedBy: 'Property Human Review',
    listings,
  };
  writeStore(output);

  res.json({ ok: true, listing: scoreListings(listings, readConfig()).find((x) => listingIdentity(x) === identity) });
});

router.post('/api/property-sourcing/listings/:source/:sourceListingId/promote', requireSyncToken, (req, res) => {
  const store = readStore();
  const identity = `${req.params.source}:${req.params.sourceListingId}`;
  const listing = (store.listings || []).find((item) => listingIdentity(item) === identity);

  if (!listing) return res.status(404).json({ error: 'not_found' });

  const config = readConfig();
  const reviewItem = listingToLocationReviewItem(
    {
      ...listing,
      status: req.body?.status || listing.status || 'shortlisted',
    },
    config,
  );
  const report = readJson(LOCATION_REPORT_FILE, {
    updatedAt: null,
    updatedBy: null,
    locations: [],
    reviewOnly: [],
  });
  const locations = Array.isArray(report.locations) ? report.locations : [];
  const existingIndex = locations.findIndex((item) => item.id === reviewItem.id);

  if (existingIndex >= 0) locations[existingIndex] = { ...locations[existingIndex], ...reviewItem };
  else locations.push(reviewItem);

  const updatedReport = {
    ...report,
    updatedAt: new Date().toISOString(),
    updatedBy: 'Property Sourcing Promotion',
    locations,
  };
  writeJson(LOCATION_REPORT_FILE, updatedReport);

  const patched = (store.listings || []).map((item) =>
    listingIdentity(item) === identity
      ? normalizeListing({
          ...item,
          status: req.body?.status || 'shortlisted',
          location_review_id: reviewItem.id,
        })
      : item,
  );
  writeStore({
    ...store,
    updatedAt: updatedReport.updatedAt,
    updatedBy: 'Property Sourcing Promotion',
    listings: patched,
  });

  res.json({
    ok: true,
    locationReviewItem: reviewItem,
  });
});

module.exports = router;
