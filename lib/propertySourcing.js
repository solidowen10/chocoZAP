const DEFAULT_STATUS = 'new';
const STATUS_VALUES = ['new', 'reviewing', 'shortlisted', 'rejected', 'archived'];
const SCORING_MAX_POINTS = {
  mrt_distance: 4,
  rent_per_ping: 3,
  area: 3,
};
const SCORING_TOTAL_MAX = Object.values(SCORING_MAX_POINTS).reduce((sum, value) => sum + value, 0);
const MANUAL_CITY_BY_REGION = {
  台北: '台北市',
  新北: '新北市',
  桃園: '桃園市',
  竹北: '新竹縣',
  台中: '台中市',
  台南: '台南市',
  高雄: '高雄市',
};
const DISTRICT_NAMES = [
  '中正區',
  '大同區',
  '中山區',
  '松山區',
  '大安區',
  '萬華區',
  '信義區',
  '士林區',
  '北投區',
  '內湖區',
  '南港區',
  '文山區',
  '板橋區',
  '新莊區',
  '中和區',
  '永和區',
  '新店區',
  '土城區',
  '蘆洲區',
  '三重區',
  '林口區',
  '淡水區',
  '汐止區',
  '三峽區',
  '樹林區',
  '桃園區',
  '中壢區',
  '龜山區',
  '蘆竹區',
  '竹北市',
  '西屯區',
  '南屯區',
  '北屯區',
  '中區',
  '東區',
  '西區',
  '南區',
  '北區',
  '安平區',
  '永康區',
  '左營區',
  '鼓山區',
  '苓雅區',
  '前鎮區',
  '鳳山區',
];

const TAIPEI_NEW_TAIPEI_MRT_STATIONS = new Set([
  '動物園',
  '木柵',
  '萬芳社區',
  '萬芳醫院',
  '辛亥',
  '麟光',
  '六張犁',
  '科技大樓',
  '大安',
  '忠孝復興',
  '南京復興',
  '中山國中',
  '松山機場',
  '大直',
  '劍南路',
  '西湖',
  '港墘',
  '文德',
  '內湖',
  '大湖公園',
  '葫洲',
  '東湖',
  '南港軟體園區',
  '南港展覽館',
  '淡水',
  '紅樹林',
  '竹圍',
  '關渡',
  '忠義',
  '復興崗',
  '北投',
  '新北投',
  '奇岩',
  '唭哩岸',
  '石牌',
  '明德',
  '芝山',
  '士林',
  '劍潭',
  '圓山',
  '民權西路',
  '雙連',
  '中山',
  '台北車站',
  '臺北車站',
  '台大醫院',
  '中正紀念堂',
  '東門',
  '大安森林公園',
  '信義安和',
  '台北101/世貿',
  '臺北101/世貿',
  '象山',
  '松山',
  '南京三民',
  '台北小巨蛋',
  '松江南京',
  '北門',
  '西門',
  '小南門',
  '古亭',
  '台電大樓',
  '公館',
  '萬隆',
  '景美',
  '大坪林',
  '七張',
  '小碧潭',
  '新店區公所',
  '新店',
  '蘆洲',
  '三民高中',
  '徐匯中學',
  '三和國中',
  '三重國小',
  '迴龍',
  '丹鳳',
  '輔大',
  '新莊',
  '頭前庄',
  '先嗇宮',
  '三重',
  '菜寮',
  '台北橋',
  '大橋頭',
  '中山國小',
  '行天宮',
  '頂溪',
  '永安市場',
  '景安',
  '南勢角',
  '頂埔',
  '永寧',
  '土城',
  '海山',
  '亞東醫院',
  '府中',
  '板橋',
  '新埔',
  '江子翠',
  '龍山寺',
  '善導寺',
  '忠孝新生',
  '忠孝敦化',
  '國父紀念館',
  '市政府',
  '永春',
  '後山埤',
  '昆陽',
  '南港',
  '十四張',
  '秀朗橋',
  '景平',
  '中和',
  '橋和',
  '中原',
  '板新',
  '新埔民生',
  '幸福',
  '新北產業園區',
]);

const CRAWLER_FIELDS = [
  'source',
  'source_listing_id',
  'url',
  'title',
  'city',
  'district',
  'address',
  'rent_twd',
  'listed_area_ping',
  'floor_text',
  'property_type',
  'business_type',
  'nearby_place',
  'nearby_place_type',
  'nearby_distance_m',
  'thumbnail_url',
  'scraped_at',
];

const HUMAN_FIELDS = [
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

const DEFAULT_SCORING_CONFIG = {
  version: 2,
  recommendation_threshold: 8,

  mrt_distance: {
    good_max_m: 500,
    ok_max_m: 1000,
    good_max_minutes: 5,
    ok_max_minutes: 10,
    good_points: 4,
    ok_points: 2,
    far_points: 0,
  },

  rent_per_ping: {
    good_max_twd: 5000,
    ok_max_twd: 6000,
    good_points: 3,
    ok_points: 1.5,
    high_points: 0,
  },

  area: {
    good_min_ping: 80,
    good_max_ping: 160,
    ok_min_ping: 60,
    good_points: 3,
    ok_points: 1.5,
    low_points: 0,
  },
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepMerge(base, patch) {
  const output = clone(base);
  if (!patch || typeof patch !== 'object') return output;

  for (const [key, value] of Object.entries(patch)) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      output[key] &&
      typeof output[key] === 'object' &&
      !Array.isArray(output[key])
    ) {
      output[key] = deepMerge(output[key], value);
    } else {
      output[key] = value;
    }
  }

  return output;
}

function configNumber(value, fallback, options = {}) {
  const n = number(value);
  const output = n == null ? fallback : n;
  const min = options.min == null ? output : options.min;
  const max = options.max == null ? output : options.max;
  return clamp(output, min, max);
}

function configPoint(value, fallback, max) {
  return configNumber(value, fallback, { min: 0, max });
}

function configList(value, fallback) {
  const values = Array.isArray(value) ? value : String(value || '').split(',');
  const output = values
    .map((item) => clean(item))
    .filter(Boolean);
  return output.length ? uniq(output) : clone(fallback);
}

function normalizeScoringConfig(config) {
  const merged = deepMerge(DEFAULT_SCORING_CONFIG, config || {});

  return {
    version: 2,

    recommendation_threshold: configNumber(
      merged.recommendation_threshold,
      DEFAULT_SCORING_CONFIG.recommendation_threshold,
      { min: 0, max: SCORING_TOTAL_MAX },
    ),

    mrt_distance: {
      good_max_m: configNumber(
        merged.mrt_distance?.good_max_m,
        DEFAULT_SCORING_CONFIG.mrt_distance.good_max_m,
        { min: 0 },
      ),
      ok_max_m: configNumber(
        merged.mrt_distance?.ok_max_m,
        DEFAULT_SCORING_CONFIG.mrt_distance.ok_max_m,
        { min: 0 },
      ),
      good_max_minutes: configNumber(
        merged.mrt_distance?.good_max_minutes,
        DEFAULT_SCORING_CONFIG.mrt_distance.good_max_minutes,
        { min: 0 },
      ),
      ok_max_minutes: configNumber(
        merged.mrt_distance?.ok_max_minutes,
        DEFAULT_SCORING_CONFIG.mrt_distance.ok_max_minutes,
        { min: 0 },
      ),
      good_points: configPoint(
        merged.mrt_distance?.good_points,
        DEFAULT_SCORING_CONFIG.mrt_distance.good_points,
        SCORING_MAX_POINTS.mrt_distance,
      ),
      ok_points: configPoint(
        merged.mrt_distance?.ok_points,
        DEFAULT_SCORING_CONFIG.mrt_distance.ok_points,
        SCORING_MAX_POINTS.mrt_distance,
      ),
      far_points: configPoint(
        merged.mrt_distance?.far_points,
        DEFAULT_SCORING_CONFIG.mrt_distance.far_points,
        SCORING_MAX_POINTS.mrt_distance,
      ),
    },

    rent_per_ping: {
      good_max_twd: configNumber(
        merged.rent_per_ping?.good_max_twd,
        DEFAULT_SCORING_CONFIG.rent_per_ping.good_max_twd,
        { min: 0 },
      ),
      ok_max_twd: configNumber(
        merged.rent_per_ping?.ok_max_twd,
        DEFAULT_SCORING_CONFIG.rent_per_ping.ok_max_twd,
        { min: 0 },
      ),
      good_points: configPoint(
        merged.rent_per_ping?.good_points,
        DEFAULT_SCORING_CONFIG.rent_per_ping.good_points,
        SCORING_MAX_POINTS.rent_per_ping,
      ),
      ok_points: configPoint(
        merged.rent_per_ping?.ok_points,
        DEFAULT_SCORING_CONFIG.rent_per_ping.ok_points,
        SCORING_MAX_POINTS.rent_per_ping,
      ),
      high_points: configPoint(
        merged.rent_per_ping?.high_points,
        DEFAULT_SCORING_CONFIG.rent_per_ping.high_points,
        SCORING_MAX_POINTS.rent_per_ping,
      ),
    },

    area: {
      good_min_ping: configNumber(
        merged.area?.good_min_ping,
        DEFAULT_SCORING_CONFIG.area.good_min_ping,
        { min: 0 },
      ),
      good_max_ping: configNumber(
        merged.area?.good_max_ping,
        DEFAULT_SCORING_CONFIG.area.good_max_ping,
        { min: 0 },
      ),
      ok_min_ping: configNumber(
        merged.area?.ok_min_ping,
        DEFAULT_SCORING_CONFIG.area.ok_min_ping,
        { min: 0 },
      ),
      good_points: configPoint(
        merged.area?.good_points,
        DEFAULT_SCORING_CONFIG.area.good_points,
        SCORING_MAX_POINTS.area,
      ),
      ok_points: configPoint(
        merged.area?.ok_points,
        DEFAULT_SCORING_CONFIG.area.ok_points,
        SCORING_MAX_POINTS.area,
      ),
      low_points: configPoint(
        merged.area?.low_points,
        DEFAULT_SCORING_CONFIG.area.low_points,
        SCORING_MAX_POINTS.area,
      ),
    },
  };
}

function defaultScoringConfig() {
  return normalizeScoringConfig(DEFAULT_SCORING_CONFIG);
}

function mergeScoringConfig(config) {
  return normalizeScoringConfig(config);
}

function clean(value) {
  if (value == null) return '';
  return String(value).trim();
}

function nullableString(value) {
  const v = clean(value);
  return v ? v : null;
}

function number(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const normalized = String(value)
    .replace(/,/g, '')
    .replace(/[^\d.-]/g, '');
  if (!normalized) return null;
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
}

function integer(value) {
  const n = number(value);
  return n == null ? null : Math.round(n);
}

function isBlank(value) {
  return value == null || String(value).trim() === '';
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

function roundTenth(value) {
  return Math.round(value * 10) / 10;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function listingIdentity(listing) {
  const source = clean(listing.source);
  const sourceListingId = clean(listing.source_listing_id);
  if (!source || !sourceListingId) return null;
  return `${source}:${sourceListingId}`;
}

function listingIdentities(listings = []) {
  return uniq((listings || []).map((listing) => listingIdentity(listing)));
}

function normalizeCurrentSheetListingIds(value) {
  if (!Array.isArray(value)) return null;
  return uniq(value.map((item) => clean(item)));
}

function applyCurrentSheetListingIds(store = {}, currentSheetListingIds, syncedAt = new Date().toISOString()) {
  const normalizedIds = normalizeCurrentSheetListingIds(currentSheetListingIds);
  if (!normalizedIds) return store;

  return {
    ...store,
    currentSheetListingIds: normalizedIds,
    currentSheetSyncedAt: syncedAt,
  };
}

function filterListingsByCurrentSheetIds(listings = [], currentSheetListingIds) {
  const normalizedIds = normalizeCurrentSheetListingIds(currentSheetListingIds);
  if (!normalizedIds) return listings;

  const currentIds = new Set(normalizedIds);
  return (listings || []).filter((listing) => currentIds.has(listingIdentity(listing)));
}

function normalizeStatus(value) {
  const status = clean(value);
  return STATUS_VALUES.includes(status) ? status : DEFAULT_STATUS;
}

function classifyNearbyPlace(value) {
  const place = clean(value);
  if (!place) return null;
  const normalizedPlace = place.replace(/站$/, '');
  return TAIPEI_NEW_TAIPEI_MRT_STATIONS.has(normalizedPlace) ? 'mrt' : 'place';
}

function normalizeCrawlerListing(input = {}) {
  const nearbyPlace = nullableString(input.nearby_place);
  return {
    source: nullableString(input.source) || '591',
    source_listing_id: nullableString(input.source_listing_id),
    url: nullableString(input.url),
    title: nullableString(input.title),
    city: nullableString(input.city),
    district: nullableString(input.district),
    address: nullableString(input.address),
    rent_twd: integer(input.rent_twd),
    listed_area_ping: number(input.listed_area_ping),
    floor_text: nullableString(input.floor_text),
    property_type: nullableString(input.property_type),
    business_type: nullableString(input.business_type),
    nearby_place: nearbyPlace,
    nearby_place_type: classifyNearbyPlace(nearbyPlace),
    nearby_distance_m: integer(input.nearby_distance_m),
    thumbnail_url: nullableString(input.thumbnail_url),
    scraped_at: nullableString(input.scraped_at),
  };
}

function normalizeHumanFields(input = {}) {
  return {
    status: normalizeStatus(input.status),
    usable_area_ping: number(input.usable_area_ping),
    mrt_station: nullableString(input.mrt_station),
    mrt_minutes: number(input.mrt_minutes),
    signage: nullableString(input.signage),
    pedestrian_flow: nullableString(input.pedestrian_flow),
    zoning_permit: nullableString(input.zoning_permit),
    building_risks: nullableString(input.building_risks),
    manual_notes: nullableString(input.manual_notes),
    reviewer: nullableString(input.reviewer),
    reviewed_at: nullableString(input.reviewed_at),
    shortlist_priority: nullableString(input.shortlist_priority),
    rejected_reason: nullableString(input.rejected_reason),
    location_review_id: nullableString(input.location_review_id),
  };
}

function normalizeListing(input = {}) {
  return {
    ...normalizeCrawlerListing(input),
    ...normalizeHumanFields(input),
    first_seen_at: nullableString(input.first_seen_at),
    last_seen_at: nullableString(input.last_seen_at),
  };
}

function mergeImportedListing(existing = {}, incoming = {}, now = new Date().toISOString()) {
  const crawler = normalizeCrawlerListing(incoming);
  const incomingHuman = normalizeHumanFields(incoming);
  const oldHuman = normalizeHumanFields(existing);
  const merged = {
    ...existing,
    ...crawler,
  };

  for (const field of HUMAN_FIELDS) {
    if (field === 'status') {
      merged.status = !isBlank(incoming.status)
        ? normalizeStatus(incoming.status)
        : oldHuman.status || DEFAULT_STATUS;
      continue;
    }

    merged[field] = !isBlank(incoming[field]) ? incomingHuman[field] : oldHuman[field];
  }

  merged.first_seen_at = existing.first_seen_at || incoming.first_seen_at || now;
  merged.last_seen_at = incoming.last_seen_at || now;

  return normalizeListing(merged);
}

function upsertListings(existingListings = [], incomingListings = [], options = {}) {
  const now = options.now || new Date().toISOString();
  const byIdentity = new Map();
  const rejected = [];
  let created = 0;
  let updated = 0;

  for (const listing of existingListings) {
    const normalized = normalizeListing(listing);
    const identity = listingIdentity(normalized);
    if (identity && !byIdentity.has(identity)) byIdentity.set(identity, normalized);
  }

  for (const raw of incomingListings) {
    const incoming = normalizeListing(raw);
    const identity = listingIdentity(incoming);
    if (!identity || !incoming.url) {
      rejected.push({ reason: 'missing_identity_or_url', listing: raw });
      continue;
    }

    const existing = byIdentity.get(identity);
    byIdentity.set(identity, mergeImportedListing(existing || {}, raw, now));
    if (existing) updated += 1;
    else created += 1;
  }

  return {
    listings: Array.from(byIdentity.values()).sort((a, b) =>
      String(b.last_seen_at || '').localeCompare(String(a.last_seen_at || '')),
    ),
    created,
    updated,
    rejected,
  };
}

function rowValue(row, names) {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(row, name) && !isBlank(row[name])) {
      return row[name];
    }
  }
  return '';
}

function listingFromSheetRow(row = {}) {
  return normalizeListing({
    source: rowValue(row, ['source', '來源']),
    source_listing_id: rowValue(row, ['source_listing_id', '591 ID', '物件ID', '房源ID']),
    url: rowValue(row, ['url', 'source_url', '591 URL', '連結', 'リンク']),
    title: rowValue(row, ['title', '標題', '物件名']),
    city: rowValue(row, ['city', '城市']),
    district: rowValue(row, ['district', '行政區', '區']),
    address: rowValue(row, ['address', '地址', '位置']),
    rent_twd: rowValue(row, ['rent_twd', '租金TWD', '租金', '家賃（TWD）']),
    listed_area_ping: rowValue(row, ['listed_area_ping', '刊登坪數', '坪數']),
    floor_text: rowValue(row, ['floor_text', '樓層', 'フロア']),
    property_type: rowValue(row, ['property_type', '類型']),
    business_type: rowValue(row, ['business_type', '商用類型', '店面類型']),
    nearby_place: rowValue(row, ['nearby_place', '附近地標']),
    nearby_distance_m: rowValue(row, ['nearby_distance_m', '附近距離M', '附近距離', '距離公尺']),
    thumbnail_url: rowValue(row, ['thumbnail_url', '縮圖']),
    scraped_at: rowValue(row, ['scraped_at', '擷取時間']),
    first_seen_at: rowValue(row, ['first_seen_at', '首次看到']),
    last_seen_at: rowValue(row, ['last_seen_at', '最後看到']),
    status: rowValue(row, ['status', '狀態']),
    usable_area_ping: rowValue(row, ['usable_area_ping', '使用面積', '可用坪數']),
    mrt_station: rowValue(row, ['mrt_station', '捷運站', '最寄り駅']),
    mrt_minutes: rowValue(row, ['mrt_minutes', '捷運分鐘', 'アクセス']),
    signage: rowValue(row, ['signage', '看板']),
    pedestrian_flow: rowValue(row, ['pedestrian_flow', '人流']),
    zoning_permit: rowValue(row, ['zoning_permit', '使用分區/許可', '使用分區', '許可']),
    building_risks: rowValue(row, ['building_risks', '建物風險', '風險']),
    manual_notes: rowValue(row, ['manual_notes', '人工備註', '備註']),
    reviewer: rowValue(row, ['reviewer', '審查者']),
    reviewed_at: rowValue(row, ['reviewed_at', '審查時間']),
    shortlist_priority: rowValue(row, ['shortlist_priority', '優先度']),
    rejected_reason: rowValue(row, ['rejected_reason', '淘汰原因']),
    location_review_id: rowValue(row, ['location_review_id', 'Location Review ID']),
  });
}

function normalizeFloor(value) {
  return clean(value).replace(/\s/g, '').replace(/＋/g, '+').toUpperCase();
}

function textIncludes(text, patterns) {
  return patterns.some((pattern) => pattern.test(String(text || '')));
}

function addBreakdown(breakdown, key, label, points, max, reason, status = 'known') {
  breakdown.push({ key, label, points, max, reason, status });
}

function earnedPoints(value, categoryMax) {
  return clamp(Number(value) || 0, 0, categoryMax);
}

function scoreListing(listing, rawConfig = DEFAULT_SCORING_CONFIG) {
  const config = mergeScoringConfig(rawConfig);
  const x = normalizeListing(listing);
  const breakdown = [];
  const risks = [];
  const missing = [];
  let score = 0;

  // 1. MRT access - max 4 points
  const nearbyIsMrt = x.nearby_place_type === 'mrt';
  const hasMrtDistance = nearbyIsMrt && x.nearby_distance_m != null;
  const mrtEvidence = hasMrtDistance
    ? {
        kind: 'distance',
        value: x.nearby_distance_m,
        goodMax: config.mrt_distance.good_max_m,
        okMax: config.mrt_distance.ok_max_m,
        label: `${x.nearby_place || '捷運站'} ${x.nearby_distance_m.toLocaleString()} 公尺`,
      }
    : x.mrt_minutes != null
      ? {
          kind: 'minutes',
          value: x.mrt_minutes,
          goodMax: config.mrt_distance.good_max_minutes,
          okMax: config.mrt_distance.ok_max_minutes,
          label: `${x.mrt_station || '捷運站'} ${x.mrt_minutes.toLocaleString()} 分鐘`,
        }
      : null;

  if (!mrtEvidence) {
    missing.push('捷運距離');
    addBreakdown(
      breakdown,
      'mrt_distance',
      '捷運距離',
      0,
      SCORING_MAX_POINTS.mrt_distance,
      '待確認',
      'missing',
    );
  } else if (mrtEvidence.value <= mrtEvidence.goodMax) {
    const points = earnedPoints(
      config.mrt_distance.good_points,
      SCORING_MAX_POINTS.mrt_distance,
    );
    score += points;
    addBreakdown(
      breakdown,
      'mrt_distance',
      '捷運距離',
      points,
      SCORING_MAX_POINTS.mrt_distance,
      mrtEvidence.label,
    );
  } else if (mrtEvidence.value <= mrtEvidence.okMax) {
    const points = earnedPoints(
      config.mrt_distance.ok_points,
      SCORING_MAX_POINTS.mrt_distance,
    );
    score += points;
    risks.push(
      mrtEvidence.kind === 'minutes'
        ? `捷運步行約 ${mrtEvidence.value.toLocaleString()} 分鐘`
        : `距離捷運約 ${mrtEvidence.value.toLocaleString()} 公尺`,
    );
    addBreakdown(
      breakdown,
      'mrt_distance',
      '捷運距離',
      points,
      SCORING_MAX_POINTS.mrt_distance,
      mrtEvidence.label,
    );
  } else {
    const points = earnedPoints(
      config.mrt_distance.far_points,
      SCORING_MAX_POINTS.mrt_distance,
    );
    score += points;
    risks.push(
      mrtEvidence.kind === 'minutes'
        ? `捷運步行約 ${mrtEvidence.value.toLocaleString()} 分鐘，時間偏長`
        : `距離捷運約 ${mrtEvidence.value.toLocaleString()} 公尺，距離偏遠`,
    );
    addBreakdown(
      breakdown,
      'mrt_distance',
      '捷運距離',
      points,
      SCORING_MAX_POINTS.mrt_distance,
      `${mrtEvidence.label}，${mrtEvidence.kind === 'minutes' ? '時間偏長' : '距離偏遠'}`,
    );
  }

  // 2. Rent per ping - max 3 points
  const listedArea = x.listed_area_ping;
  const rentPerPing =
    x.rent_twd != null && listedArea != null && listedArea > 0
      ? Math.round(x.rent_twd / listedArea)
      : null;

  if (rentPerPing == null) {
    if (x.rent_twd == null) missing.push('租金');
    if (listedArea == null) missing.push('總坪數');

    addBreakdown(
      breakdown,
      'rent_per_ping',
      '每坪月租',
      0,
      SCORING_MAX_POINTS.rent_per_ping,
      '待確認',
      'missing',
    );
  } else if (rentPerPing <= config.rent_per_ping.good_max_twd) {
    const points = earnedPoints(
      config.rent_per_ping.good_points,
      SCORING_MAX_POINTS.rent_per_ping,
    );
    score += points;
    addBreakdown(
      breakdown,
      'rent_per_ping',
      '每坪月租',
      points,
      SCORING_MAX_POINTS.rent_per_ping,
      `NT$${rentPerPing.toLocaleString()}/坪/月`,
    );
  } else if (rentPerPing <= config.rent_per_ping.ok_max_twd) {
    const points = earnedPoints(
      config.rent_per_ping.ok_points,
      SCORING_MAX_POINTS.rent_per_ping,
    );
    score += points;
    risks.push(`每坪月租 NT$${rentPerPing.toLocaleString()} 偏高`);
    addBreakdown(
      breakdown,
      'rent_per_ping',
      '每坪月租',
      points,
      SCORING_MAX_POINTS.rent_per_ping,
      `NT$${rentPerPing.toLocaleString()}/坪/月`,
    );
  } else {
    const points = earnedPoints(
      config.rent_per_ping.high_points,
      SCORING_MAX_POINTS.rent_per_ping,
    );
    score += points;
    risks.push(`每坪月租 NT$${rentPerPing.toLocaleString()} 過高`);
    addBreakdown(
      breakdown,
      'rent_per_ping',
      '每坪月租',
      points,
      SCORING_MAX_POINTS.rent_per_ping,
      `NT$${rentPerPing.toLocaleString()}/坪/月，偏高`,
    );
  }

  // 3. Listed area - max 3 points
  if (listedArea == null) {
    if (!missing.includes('總坪數')) missing.push('總坪數');

    addBreakdown(
      breakdown,
      'area',
      '總坪數',
      0,
      SCORING_MAX_POINTS.area,
      '待確認',
      'missing',
    );
  } else if (
    listedArea >= config.area.good_min_ping &&
    listedArea <= config.area.good_max_ping
  ) {
    const points = earnedPoints(
      config.area.good_points,
      SCORING_MAX_POINTS.area,
    );
    score += points;
    addBreakdown(
      breakdown,
      'area',
      '總坪數',
      points,
      SCORING_MAX_POINTS.area,
      `${listedArea} 坪符合目標`,
    );
  } else if (listedArea >= config.area.ok_min_ping) {
    const points = earnedPoints(
      config.area.ok_points,
      SCORING_MAX_POINTS.area,
    );
    score += points;
    risks.push(`總坪數 ${listedArea} 坪可接受但非最佳`);
    addBreakdown(
      breakdown,
      'area',
      '總坪數',
      points,
      SCORING_MAX_POINTS.area,
      `${listedArea} 坪可接受但非最佳`,
    );
  } else {
    const points = earnedPoints(
      config.area.low_points,
      SCORING_MAX_POINTS.area,
    );
    score += points;
    risks.push(`總坪數 ${listedArea} 坪偏小`);
    addBreakdown(
      breakdown,
      'area',
      '總坪數',
      points,
      SCORING_MAX_POINTS.area,
      `${listedArea} 坪偏小`,
    );
  }

  score = roundTenth(score);

  let recommendation = 'needs_research';

  if (x.status === 'rejected') {
    recommendation = 'reject';
  } else if (missing.length) {
    recommendation = 'needs_research';
  } else if (score >= Number(config.recommendation_threshold || 8)) {
    recommendation = 'recommend_viewing';
  } else {
    recommendation = 'hold';
  }

  let nextStep = '補齊缺資料後重新評分';

  if (recommendation === 'recommend_viewing') {
    nextStep = '條件良好，可優先進入候選';
  }

  if (recommendation === 'reject') {
    nextStep = '已人工淘汰';
  }

  if (recommendation === 'hold') {
    nextStep = '保留觀察，與其他物件比較';
  }

  return {
    score,
    recommendation,
    breakdown,
    risks: uniq(risks),
    missing_data: uniq(missing),
    next_step: nextStep,
  };
}

function scoreListings(listings, config) {
  return listings.map((listing) => {
    const normalized = normalizeListing(listing);
    const scoring = scoreListing(normalized, config);
    return {
      ...listing,
      nearby_place_type: normalized.nearby_place_type,
      score: scoring.score,
      recommendation: scoring.recommendation,
      breakdown: scoring.breakdown,
      risks: scoring.risks,
      missing_data: scoring.missing_data,
      next_step: scoring.next_step,
    };
  });
}

function formatTwd(value) {
  return value == null ? '' : `NT$${Number(value).toLocaleString('zh-TW')}`;
}

function cityToRegion(city) {
  if (/新北/.test(city || '')) return '新北';
  if (/台北|臺北/.test(city || '')) return '台北';
  if (/桃園/.test(city || '')) return '桃園';
  if (/台中|臺中/.test(city || '')) return '台中';
  if (/台南|臺南/.test(city || '')) return '台南';
  if (/高雄/.test(city || '')) return '高雄';
  return city || '其他';
}

function cityFromManualLocation(location = {}) {
  const explicitCity = nullableString(location.city);
  if (explicitCity) return explicitCity;
  const region = clean(location.region).replace(/\s+\d+$/, '');
  if (MANUAL_CITY_BY_REGION[region]) return MANUAL_CITY_BY_REGION[region];
  const text = [location.address, location.resolvedMapUrl, location.mapLink].map(clean).join(' ');
  if (/新北市|New Taipei/i.test(text)) return '新北市';
  if (/臺北市|台北市|Taipei City/i.test(text)) return '台北市';
  if (/桃園市|Taoyuan/i.test(text)) return '桃園市';
  if (/新竹縣|新竹市|Hsinchu/i.test(text)) return /竹北/.test(text) ? '新竹縣' : '新竹市';
  if (/臺中市|台中市|Taichung/i.test(text)) return '台中市';
  if (/臺南市|台南市|Tainan/i.test(text)) return '台南市';
  if (/高雄市|Kaohsiung/i.test(text)) return '高雄市';
  return null;
}

function districtFromManualLocation(location = {}) {
  const explicitDistrict = nullableString(location.district);
  if (explicitDistrict) return explicitDistrict;
  const text = [
    location.address,
    location.resolvedMapUrl,
    location.mapLink,
    location.name,
    location.station,
  ]
    .map(clean)
    .join(' ');
  return DISTRICT_NAMES.find((district) => text.includes(district)) || null;
}

function manualLocationToScoringListing(location = {}) {
  const mrtStation = nullableString(location.mrt_station) || nullableString(location.station);
  const mrtMinutes = number(location.mrt_minutes);

  return {
    city: cityFromManualLocation(location),
    district: districtFromManualLocation(location),
    listed_area_ping: number(location.areaPing ?? location.listedAreaPing ?? location.listed_area_ping),
    rent_twd: integer(location.rent_twd ?? location.rent),
    floor_text: nullableString(location.floor ?? location.floor_text),
    mrt_station: mrtStation,
    mrt_minutes: mrtMinutes == null ? number(location.mrt) : mrtMinutes,
  };
}

function statusFromRecommendation(recommendation) {
  if (recommendation === 'recommend_viewing') return '推薦看屋';
  if (recommendation === 'hold') return '保留觀察';
  if (recommendation === 'reject') return '淘汰';
  return '補資料';
}

function scoreManualLocation(location = {}, config = DEFAULT_SCORING_CONFIG) {
  const scoring = scoreListing(manualLocationToScoringListing(location), config);
  const output = {
    ...location,
    city: location.city || cityFromManualLocation(location),
    district: location.district || districtFromManualLocation(location),
    listedAreaPing: location.listedAreaPing ?? number(location.areaPing ?? location.listed_area_ping),
    aiScore: scoring.score,
    aiReviewer: 'Unified Scoring v2',
    breakdown: scoring.breakdown,
    risk: scoring.risks.join('；') || '目前未發現明確硬性淘汰條件',
    missing: scoring.missing_data.join('、') || '目前無重大缺資料',
    next: scoring.next_step,
  };

  if (!clean(output.status) || output.status === '待 AI 評估') {
    output.status = statusFromRecommendation(scoring.recommendation);
  }
  if (output.rejected == null) output.rejected = scoring.recommendation === 'reject';

  return output;
}

function scoreManualLocations(locations = [], config = DEFAULT_SCORING_CONFIG) {
  return locations.map((location) => scoreManualLocation(location, config));
}

function listingToLocationReviewItem(listing, config) {
  const scored = scoreListing(listing, config);
  const x = normalizeListing(listing);
  return {
    id: x.location_review_id || `auto-${x.source}-${x.source_listing_id}`,
    region: cityToRegion(x.city),
    name: x.title || `${x.district || x.city || '自動物件'} ${x.source_listing_id}`,
    station: x.mrt_station || '',
    mapLink: x.url,
    resolvedMapUrl: '',
    address: x.address || [x.city, x.district].filter(Boolean).join(''),
    lat: null,
    lng: null,
    finder: '591 Radar',
    floor: x.floor_text || '',
    mrt: x.mrt_minutes == null ? '' : `${x.mrt_minutes} 分鐘`,
    rent: formatTwd(x.rent_twd),
    managementFee: '',
    rentJPY: '',
    area: x.listed_area_ping == null ? '待確認' : `${x.listed_area_ping}坪`,
    areaPing: x.listed_area_ping,
    listedAreaPing: x.listed_area_ping,
    usableAreaPing: x.usable_area_ping,
    rentPerPing: '',
    signage: x.signage || '',
    brokerAnswer: x.manual_notes || '',
    aiScore: scored.score,
    aiReviewer: 'Property Radar Scoring',
    status:
      scored.recommendation === 'recommend_viewing'
        ? '推薦看屋'
        : scored.recommendation === 'reject'
          ? '淘汰'
          : '補資料',
    risk: scored.risks.join('；') || '目前未發現明確硬性淘汰條件',
    missing: scored.missing_data.join('、') || '目前無重大缺資料',
    next: scored.next_step,
    aiComment: `來源：${x.source} ${x.source_listing_id}。${x.url}`,
    source: x.source,
    source_listing_id: x.source_listing_id,
    sourceUrl: x.url,
    propertySourcing: true,
    rejected: scored.recommendation === 'reject',
  };
}

module.exports = {
  CRAWLER_FIELDS,
  HUMAN_FIELDS,
  STATUS_VALUES,
  DEFAULT_SCORING_CONFIG,
  defaultScoringConfig,
  mergeScoringConfig,
  classifyNearbyPlace,
  clean,
  number,
  normalizeListing,
  normalizeCrawlerListing,
  normalizeHumanFields,
  listingIdentity,
  listingIdentities,
  applyCurrentSheetListingIds,
  filterListingsByCurrentSheetIds,
  listingFromSheetRow,
  upsertListings,
  scoreListing,
  scoreListings,
  manualLocationToScoringListing,
  scoreManualLocation,
  scoreManualLocations,
  listingToLocationReviewItem,
};
