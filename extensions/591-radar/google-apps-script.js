const SHEET_NAME = '自動蒐集';
const SHARED_SECRET = '';

const CRAWLER_HEADERS = [
  'source',
  'source_listing_id',
  'url',
  'title',
  'city',
  'district',
  'rent_twd',
  'listed_area_ping',
  'floor_text',
  'property_type',
  'thumbnail_url',
  'scraped_at',
  'first_seen_at',
  'last_seen_at',
];

const HUMAN_HEADERS = [
  'status',
  'usable_area_ping',
  'mrt_station',
  'mrt_minutes',
  'signage',
  'pedestrian_flow',
  'zoning_permit',
  'building_risks',
  'manual_notes',
  'reviewer',
  'reviewed_at',
  'shortlist_priority',
  'rejected_reason',
  'location_review_id',
];

const ALL_HEADERS = [...CRAWLER_HEADERS, ...HUMAN_HEADERS];

function doPost(event) {
  try {
    const payload = JSON.parse(event.postData.contents || '{}');
    if (SHARED_SECRET && payload.secret !== SHARED_SECRET) {
      return json({ ok: false, error: 'unauthorized' });
    }

    const listings = Array.isArray(payload.listings) ? payload.listings : [];
    const result = upsertListings(listings);
    return json({ ok: true, ...result });
  } catch (error) {
    return json({ ok: false, error: error.message });
  }
}

function upsertListings(listings) {
  const sheet = getSheet();
  const headers = ensureHeaders(sheet);
  const rows = sheet.getDataRange().getValues();
  const rowByIdentity = new Map();

  for (let index = 1; index < rows.length; index += 1) {
    const row = rowToObject(headers, rows[index]);
    const identity = listingIdentity(row);
    if (identity) rowByIdentity.set(identity, index + 1);
  }

  let created = 0;
  let updated = 0;
  let rejected = 0;
  const now = new Date().toISOString();

  for (const listing of listings) {
    const normalized = normalizeListing(listing, now);
    const identity = listingIdentity(normalized);
    if (!identity || !normalized.url) {
      rejected += 1;
      continue;
    }

    const rowNumber = rowByIdentity.get(identity);
    if (rowNumber) {
      const existingValues = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
      const existing = rowToObject(headers, existingValues);
      const merged = {
        ...existing,
        ...pick(normalized, CRAWLER_HEADERS),
        first_seen_at: existing.first_seen_at || normalized.first_seen_at || now,
        last_seen_at: now,
      };
      for (const header of HUMAN_HEADERS) {
        merged[header] = existing[header] || normalized[header] || '';
      }
      sheet.getRange(rowNumber, 1, 1, headers.length).setValues([headers.map((header) => merged[header] || '')]);
      updated += 1;
    } else {
      const output = {
        ...pick(normalized, CRAWLER_HEADERS),
        first_seen_at: now,
        last_seen_at: now,
        status: 'new',
      };
      sheet.appendRow(headers.map((header) => output[header] || ''));
      rowByIdentity.set(identity, sheet.getLastRow());
      created += 1;
    }
  }

  return {
    upserted: created + updated,
    created,
    updated,
    rejected,
  };
}

function getSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  return spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.insertSheet(SHEET_NAME);
}

function ensureHeaders(sheet) {
  const currentHeaders = sheet.getLastRow() > 0
    ? sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), ALL_HEADERS.length)).getValues()[0].filter(Boolean)
    : [];
  const headers = [...currentHeaders];

  for (const header of ALL_HEADERS) {
    if (!headers.includes(header)) headers.push(header);
  }

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  return headers;
}

function rowToObject(headers, values) {
  return headers.reduce((object, header, index) => {
    object[header] = values[index];
    return object;
  }, {});
}

function listingIdentity(listing) {
  if (!listing.source || !listing.source_listing_id) return '';
  return `${listing.source}:${listing.source_listing_id}`;
}

function normalizeListing(listing, now) {
  return {
    source: listing.source || '591',
    source_listing_id: listing.source_listing_id || '',
    url: listing.url || '',
    title: listing.title || '',
    city: listing.city || '',
    district: listing.district || '',
    rent_twd: listing.rent_twd || '',
    listed_area_ping: listing.listed_area_ping || '',
    floor_text: listing.floor_text || '',
    property_type: listing.property_type || '',
    thumbnail_url: listing.thumbnail_url || '',
    scraped_at: listing.scraped_at || now,
    first_seen_at: listing.first_seen_at || now,
    last_seen_at: listing.last_seen_at || now,
  };
}

function pick(object, keys) {
  return keys.reduce((output, key) => {
    output[key] = object[key] == null ? '' : object[key];
    return output;
  }, {});
}

function json(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
