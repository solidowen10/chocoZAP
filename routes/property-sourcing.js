const express = require('express');
const fs = require('fs');
const path = require('path');

const {
  HUMAN_FIELDS,
  defaultScoringConfig,
  mergeScoringConfig,
  listingFromSheetRow,
  listingIdentity,
  listingIdentities,
  normalizeListing,
  normalizeHumanFields,
  buildShortlistSheetSyncPlan,
  applyCurrentSheetListingIds,
  filterListingsByCurrentSheetIds,
  scoreListings,
  scoreListing,
  scoreManualLocations,
  upsertListings,
  listingToLocationReviewItem,
} = require('../lib/propertySourcing');
const {
  appendSheetValues,
  batchUpdateSheetValues,
  ensureSheetExists,
  formatShortlistSheet,
  orderSheetsByNames,
  readSheetRows,
  readSheetValues,
  updateSheetValues,
} = require('../lib/googleSheets');

const router = express.Router();

const DATA_DIR = path.join(__dirname, '..', 'data');
const STORE_FILE = path.join(DATA_DIR, 'property-sourcing.json');
const CONFIG_FILE = path.join(DATA_DIR, 'property-scoring-config.json');
const LOCATION_REPORT_FILE = path.join(DATA_DIR, 'location-report.json');
const DEFAULT_SHEET_TAB = '自動蒐集';
const SHORTLIST_SHEET_TAB = '候選清單';

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
    currentSheetListingIds: null,
    currentSheetSyncedAt: null,
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

function shortlistSheetTabForCity(city = '') {
  const value = String(city || '');

  if (/台北|臺北/.test(value)) return '候選_台北';
  if (/新北/.test(value)) return '候選_新北';
  if (/桃園/.test(value)) return '候選_桃園';
  if (/新竹/.test(value)) return '候選_新竹';
  if (/台中|臺中/.test(value)) return '候選_台中';
  if (/台南|臺南/.test(value)) return '候選_台南';
  if (/高雄/.test(value)) return '候選_高雄';

  return '候選_其他';
}

const SHORTLIST_SHEET_HEADERS = [
  'source',
  '591 ID',
  '物件名稱',
  '591 URL',
  '城市',
  '行政區',
  '地址',
  '月租',
  '總坪數',
  '每坪月租',
  '每坪月租（日圓）',
  '最近捷運',
  '捷運距離M',
  '初篩分數',
  '加入候選時間',
  '聯繫狀態',
  '聯繫日期',
  '房東／仲介回覆',
  '可否看屋',
  '看屋日期',
  '房仲備註',
  'TWD→JPY 匯率',
  '匯率更新時間',
];

async function fetchTwdJpyRate() {
  const response = await fetch('https://open.er-api.com/v6/latest/TWD');

  if (!response.ok) {
    throw new Error(`FX rate request failed: HTTP ${response.status}`);
  }

  const data = await response.json();
  const rate = Number(data?.rates?.JPY);

  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error('Invalid TWD/JPY exchange rate');
  }

  return {
    rate,
    updatedAt: data.time_last_update_utc || new Date().toISOString(),
  };
}

function scoredPayload(store = readStore(), config = readConfig()) {
  const scoringConfig = mergeScoringConfig(config);
  const sourceListings = filterListingsByCurrentSheetIds(store.listings || [], store.currentSheetListingIds);
  const listings = scoreListings(sourceListings, scoringConfig);
  const hasCurrentSheetMembership = Array.isArray(store.currentSheetListingIds);

  return {
    updatedAt: store.updatedAt || null,
    updatedBy: store.updatedBy || null,
    count: listings.length,
    historicalCount: (store.listings || []).length,
    listings,
    scoringConfig,
    lastImport: store.lastImport || null,
    currentSheetListingCount: hasCurrentSheetMembership ? store.currentSheetListingIds.length : null,
    currentSheetSyncedAt: store.currentSheetSyncedAt || null,
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
  const now = options.now || new Date().toISOString();
  const result = upsertListings(store.listings || [], rawListings || [], {
    now,
  });

  // Hard-reject underground-only listings during import.
  // Preserve an explicit human shortlist decision.
  result.listings = result.listings.map((listing) => {
    const scoring = scoreListing(listing, readConfig());

    if (
      scoring.recommendation === 'reject' &&
      /^(地下樓層|2F 樓層)，直接淘汰$/.test(scoring.next_step) &&
      listing.status !== 'archived'
    ) {
      return normalizeListing({
        ...listing,
        status: 'rejected',
        rejected_reason: scoring.risks[0] || '樓層條件不符',
      });
    }

    return listing;
  });

  let output = {
    ...store,
    updatedAt: now,
    updatedBy: options.updatedBy || 'Property Sourcing Import',
    listings: result.listings,
    lastImport: {
      importedAt: now,
      importedBy: options.updatedBy || 'Property Sourcing Import',
      created: result.created,
      updated: result.updated,
      rejected: result.rejected.length,
      source: options.source || 'api',
    },
  };

  output = applyCurrentSheetListingIds(output, options.currentSheetListingIds, now);

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
    const currentSheetListingIds = listingIdentities(listings);

    const { store, result } = importListings(listings, {
      updatedBy: 'Property Google Sheet Sync',
      source: 'google-sheet',
      currentSheetListingIds,
    });

    return res.json({
      ok: true,
      count: store.listings.length,
      currentSheetListingCount: currentSheetListingIds.length,
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

async function migrateLegacyShortlistSheet(spreadsheetId, sheetName) {
  const values = await readSheetValues(spreadsheetId, sheetName, 'A:W');

  if (!values.length) return;

  const header = values[0] || [];

  // Old schema:
  // J 每坪月租
  // K 最近捷運
  // ...
  // N 加入候選時間
  // O:T broker fields
  const isLegacy =
    header[9] === '每坪月租' &&
    header[10] === '最近捷運';

  if (!isLegacy) return;

  const migrated = values.map((row, index) => {
    if (index === 0) return SHORTLIST_SHEET_HEADERS;

    return [
      row[0] || '',   // A source
      row[1] || '',   // B 591 ID
      row[2] || '',   // C title
      row[3] || '',   // D URL
      row[4] || '',   // E city
      row[5] || '',   // F district
      row[6] || '',   // G address
      row[7] || '',   // H rent
      row[8] || '',   // I area
      row[9] || '',   // J rent/ping TWD

      '',             // K rent/ping JPY (filled by sync)

      row[10] || '',  // L MRT
      row[11] || '',  // M MRT distance
      row[12] || '',  // N score
      row[13] || '',  // O added at

      row[14] || '',  // P contact status
      row[15] || '',  // Q contact date
      row[16] || '',  // R reply
      row[17] || '',  // S viewing possible
      row[18] || '',  // T viewing date
      row[19] || '',  // U broker notes

      '',             // V rate
      '',             // W rate updated time
    ];
  });

  await updateSheetValues(
    spreadsheetId,
    sheetName,
    `A1:W${migrated.length}`,
    migrated,
  );
}

router.post('/api/property-sourcing/shortlist-sheet-sync', requireSyncToken, async (req, res) => {
  try {
    const store = readStore();
    const config = readConfig();

    const shortlisted = (store.listings || []).filter(
      (listing) => normalizeListing(listing).status === 'shortlisted',
    );

    const scored = scoreListings(shortlisted, config);
    const now = new Date().toISOString();

    // One FX snapshot per sync.
    const fx = await fetchTwdJpyRate();

    // --------------------------------------------------------
    // Total sheet + city sheets
    // --------------------------------------------------------

    const grouped = new Map();

    // Total sheet always receives every shortlisted listing.
    grouped.set(SHORTLIST_SHEET_TAB, scored);

    for (const listing of scored) {
      const sheetName = shortlistSheetTabForCity(listing.city);

      if (!grouped.has(sheetName)) {
        grouped.set(sheetName, []);
      }

      grouped.get(sheetName).push(listing);
    }

    const tabs = [];

    for (const [sheetName, listings] of grouped.entries()) {
      await ensureSheetExists(
        propertySourcingSheetId(),
        sheetName,
      );

      // Safely migrate the old "候選清單" schema before syncing.
      await migrateLegacyShortlistSheet(
        propertySourcingSheetId(),
        sheetName,
      );

      const existingValues = await readSheetValues(
        propertySourcingSheetId(),
        sheetName,
        'A:W',
      );

      const plan = buildShortlistSheetSyncPlan(
        listings,
        existingValues,
        {
          now,
          config,
          twdJpyRate: fx.rate,
          fxUpdatedAt: fx.updatedAt,
        },
      );

      const batchUpdates = [
        {
          range: 'A1:W1',
          values: [SHORTLIST_SHEET_HEADERS],
        },
      ];

      for (const update of plan.updates) {
        batchUpdates.push(
          {
            range: `A${update.rowNumber}:O${update.rowNumber}`,
            values: [update.values],
          },
          {
            range: `V${update.rowNumber}:W${update.rowNumber}`,
            values: [update.fxValues],
          },
        );
      }

      await batchUpdateSheetValues(
        propertySourcingSheetId(),
        sheetName,
        batchUpdates,
      );

      if (plan.appendRows.length) {
        await appendSheetValues(
          propertySourcingSheetId(),
          sheetName,
          plan.appendRows,
          'A:W',
        );
      }

      await formatShortlistSheet(
        propertySourcingSheetId(),
        sheetName,
      );

      tabs.push({
        sheet: sheetName,
        shortlisted: plan.shortlisted,
        created: plan.created,
        updated: plan.updated,
        total: plan.total,
      });
    }

    // --------------------------------------------------------
    // North -> south order
    // --------------------------------------------------------

    await orderSheetsByNames(
      propertySourcingSheetId(),
      [
        '候選清單',
        '候選_台北',
        '候選_新北',
        '候選_桃園',
        '候選_新竹',
        '候選_台中',
        '候選_台南',
        '候選_高雄',
        '候選_其他',
      ],
    );

    return res.json({
      ok: true,
      shortlisted: scored.length,

      // Counts for city tabs only would double-count total sheet,
      // so expose per-tab details as the authoritative breakdown.
      tabs,

      twdJpyRate: fx.rate,
      fxUpdatedAt: fx.updatedAt,
      updatedAt: now,
    });
  } catch (error) {
    console.error('[property-sourcing shortlist-sheet-sync]', error);

    return res.status(500).json({
      error: 'shortlist_sheet_sync_failed',
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
