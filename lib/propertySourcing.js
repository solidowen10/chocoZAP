const DEFAULT_STATUS = 'new';
const STATUS_VALUES = ['new', 'reviewing', 'shortlisted', 'rejected', 'archived'];

const CRAWLER_FIELDS = [
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
  version: 1,
  recommendation_threshold: 8,
  hard_rejects: {
    enabled: true,
    reject_gym_not_allowed: true,
    reject_major_building_risk: true,
    reject_zoning_blocker: true,
  },
  city_location: {
    enabled: true,
    preferred_cities: ['台北市', '新北市'],
    preferred_districts: ['南港區', '松山區', '信義區', '大安區', '士林區', '北投區', '內湖區'],
    city_points: 0.7,
    district_bonus_points: 0.3,
  },
  area: {
    enabled: true,
    good_min_ping: 80,
    good_max_ping: 160,
    ok_min_ping: 60,
    good_points: 2,
    ok_points: 1,
    low_points: 0,
    require_usable_area: true,
  },
  rent: {
    enabled: true,
    good_max_twd: 120000,
    ok_max_twd: 200000,
    good_points: 1.5,
    ok_points: 0.8,
    high_points: 0.2,
  },
  mrt: {
    enabled: true,
    good_max_minutes: 5,
    ok_max_minutes: 10,
    good_points: 2,
    ok_points: 1,
    far_points: 0.2,
  },
  floor: {
    enabled: true,
    ground_floor_points: 1.5,
    ground_plus_second_points: 1.2,
    ground_plus_basement_points: 0.9,
    second_floor_points: 0.4,
  },
  signage: {
    enabled: true,
    good_points: 1,
    ok_points: 0.5,
  },
  pedestrian_flow: {
    enabled: true,
    good_points: 1,
    ok_points: 0.5,
  },
  zoning_permit: {
    enabled: true,
    commercial_points: 1,
    uncertain_points: 0,
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

function defaultScoringConfig() {
  return clone(DEFAULT_SCORING_CONFIG);
}

function mergeScoringConfig(config) {
  return deepMerge(DEFAULT_SCORING_CONFIG, config || {});
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

function roundHalf(value) {
  return Math.round(value * 2) / 2;
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

function normalizeStatus(value) {
  const status = clean(value);
  return STATUS_VALUES.includes(status) ? status : DEFAULT_STATUS;
}

function normalizeCrawlerListing(input = {}) {
  return {
    source: nullableString(input.source) || '591',
    source_listing_id: nullableString(input.source_listing_id),
    url: nullableString(input.url),
    title: nullableString(input.title),
    city: nullableString(input.city),
    district: nullableString(input.district),
    rent_twd: integer(input.rent_twd),
    listed_area_ping: number(input.listed_area_ping),
    floor_text: nullableString(input.floor_text),
    property_type: nullableString(input.property_type),
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
    rent_twd: rowValue(row, ['rent_twd', '租金TWD', '租金', '家賃（TWD）']),
    listed_area_ping: rowValue(row, ['listed_area_ping', '刊登坪數', '坪數']),
    floor_text: rowValue(row, ['floor_text', '樓層', 'フロア']),
    property_type: rowValue(row, ['property_type', '類型']),
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

function scoreListing(listing, rawConfig = DEFAULT_SCORING_CONFIG) {
  const config = mergeScoringConfig(rawConfig);
  const x = normalizeListing(listing);
  const breakdown = [];
  const risks = [];
  const missing = [];
  let score = 0;
  let hardReject = false;

  if (config.city_location.enabled) {
    const cityHit = config.city_location.preferred_cities.includes(x.city);
    const districtHit = config.city_location.preferred_districts.includes(x.district);
    const points =
      (cityHit ? Number(config.city_location.city_points) || 0 : 0) +
      (districtHit ? Number(config.city_location.district_bonus_points) || 0 : 0);
    score += points;
    addBreakdown(
      breakdown,
      'city_location',
      '城市 / 區域',
      points,
      (Number(config.city_location.city_points) || 0) + (Number(config.city_location.district_bonus_points) || 0),
      cityHit ? `${x.city || ''}${x.district ? ` ${x.district}` : ''}` : '非優先城市',
    );
  }

  if (config.area.enabled) {
    const usable = x.usable_area_ping;
    if (usable == null) {
      missing.push('使用面積');
      addBreakdown(breakdown, 'area', '使用面積', 0, config.area.good_points, '待確認', 'missing');
    } else if (usable >= config.area.good_min_ping && usable <= config.area.good_max_ping) {
      score += Number(config.area.good_points) || 0;
      addBreakdown(breakdown, 'area', '使用面積', config.area.good_points, config.area.good_points, `${usable} 坪符合目標`);
    } else if (usable >= config.area.ok_min_ping) {
      score += Number(config.area.ok_points) || 0;
      risks.push(`使用面積 ${usable} 坪需確認設備配置`);
      addBreakdown(breakdown, 'area', '使用面積', config.area.ok_points, config.area.good_points, `${usable} 坪可接受但非最佳`);
    } else {
      score += Number(config.area.low_points) || 0;
      risks.push(`使用面積 ${usable} 坪偏小`);
      addBreakdown(breakdown, 'area', '使用面積', config.area.low_points, config.area.good_points, `${usable} 坪偏小`);
    }
  }

  if (config.rent.enabled) {
    if (x.rent_twd == null) {
      missing.push('租金');
      addBreakdown(breakdown, 'rent', '租金', 0, config.rent.good_points, '待確認', 'missing');
    } else if (x.rent_twd <= config.rent.good_max_twd) {
      score += Number(config.rent.good_points) || 0;
      addBreakdown(breakdown, 'rent', '租金', config.rent.good_points, config.rent.good_points, `NT$${x.rent_twd.toLocaleString()}/月`);
    } else if (x.rent_twd <= config.rent.ok_max_twd) {
      score += Number(config.rent.ok_points) || 0;
      addBreakdown(breakdown, 'rent', '租金', config.rent.ok_points, config.rent.good_points, `NT$${x.rent_twd.toLocaleString()}/月偏高`);
    } else {
      score += Number(config.rent.high_points) || 0;
      risks.push(`租金 NT$${x.rent_twd.toLocaleString()}/月偏高`);
      addBreakdown(breakdown, 'rent', '租金', config.rent.high_points, config.rent.good_points, `NT$${x.rent_twd.toLocaleString()}/月過高`);
    }
  }

  if (config.mrt.enabled) {
    if (x.mrt_minutes == null) {
      missing.push('捷運步行時間');
      addBreakdown(breakdown, 'mrt', '捷運', 0, config.mrt.good_points, '待確認', 'missing');
    } else if (x.mrt_minutes <= config.mrt.good_max_minutes) {
      score += Number(config.mrt.good_points) || 0;
      addBreakdown(breakdown, 'mrt', '捷運', config.mrt.good_points, config.mrt.good_points, `${x.mrt_minutes} 分鐘`);
    } else if (x.mrt_minutes <= config.mrt.ok_max_minutes) {
      score += Number(config.mrt.ok_points) || 0;
      addBreakdown(breakdown, 'mrt', '捷運', config.mrt.ok_points, config.mrt.good_points, `${x.mrt_minutes} 分鐘`);
    } else {
      score += Number(config.mrt.far_points) || 0;
      risks.push(`捷運步行 ${x.mrt_minutes} 分鐘偏遠`);
      addBreakdown(breakdown, 'mrt', '捷運', config.mrt.far_points, config.mrt.good_points, `${x.mrt_minutes} 分鐘偏遠`);
    }
  }

  if (config.floor.enabled) {
    const floor = normalizeFloor(x.floor_text);
    if (!floor) {
      missing.push('樓層');
      addBreakdown(breakdown, 'floor', '樓層', 0, config.floor.ground_floor_points, '待確認', 'missing');
    } else if (/^1F(?:\/|$)/.test(floor)) {
      score += Number(config.floor.ground_floor_points) || 0;
      addBreakdown(breakdown, 'floor', '樓層', config.floor.ground_floor_points, config.floor.ground_floor_points, floor);
    } else if (/1F[+~]2F|1F.*2F/.test(floor)) {
      score += Number(config.floor.ground_plus_second_points) || 0;
      missing.push('2F 跳躍 / 樓板測試');
      addBreakdown(breakdown, 'floor', '樓層', config.floor.ground_plus_second_points, config.floor.ground_floor_points, floor);
    } else if (/1F[+~]B1|1F.*B1/.test(floor)) {
      score += Number(config.floor.ground_plus_basement_points) || 0;
      addBreakdown(breakdown, 'floor', '樓層', config.floor.ground_plus_basement_points, config.floor.ground_floor_points, floor);
    } else if (/2F/.test(floor)) {
      score += Number(config.floor.second_floor_points) || 0;
      missing.push('2F 跳躍 / 樓板測試');
      addBreakdown(breakdown, 'floor', '樓層', config.floor.second_floor_points, config.floor.ground_floor_points, floor);
    } else {
      risks.push(`樓層 ${floor} 需人工確認`);
      addBreakdown(breakdown, 'floor', '樓層', 0, config.floor.ground_floor_points, floor);
    }
  }

  if (config.signage.enabled) {
    const signage = clean(x.signage);
    if (!signage) {
      missing.push('看板條件');
      addBreakdown(breakdown, 'signage', '看板', 0, config.signage.good_points, '待確認', 'missing');
    } else if (/2面|兩面|三角窗|角地|可|佳|醒目/.test(signage)) {
      score += Number(config.signage.good_points) || 0;
      addBreakdown(breakdown, 'signage', '看板', config.signage.good_points, config.signage.good_points, signage);
    } else if (/1面|一面|普通/.test(signage)) {
      score += Number(config.signage.ok_points) || 0;
      addBreakdown(breakdown, 'signage', '看板', config.signage.ok_points, config.signage.good_points, signage);
    } else {
      risks.push('看板受限');
      addBreakdown(breakdown, 'signage', '看板', 0, config.signage.good_points, signage);
    }
  }

  if (config.pedestrian_flow.enabled) {
    const flow = clean(x.pedestrian_flow);
    if (!flow) {
      missing.push('人流');
      addBreakdown(breakdown, 'pedestrian_flow', '人流', 0, config.pedestrian_flow.good_points, '待確認', 'missing');
    } else if (/多|佳|商圈|通勤|百貨|夜市|辦公|住宅人口/.test(flow)) {
      score += Number(config.pedestrian_flow.good_points) || 0;
      addBreakdown(breakdown, 'pedestrian_flow', '人流', config.pedestrian_flow.good_points, config.pedestrian_flow.good_points, flow);
    } else if (/普通|尚可|一般/.test(flow)) {
      score += Number(config.pedestrian_flow.ok_points) || 0;
      addBreakdown(breakdown, 'pedestrian_flow', '人流', config.pedestrian_flow.ok_points, config.pedestrian_flow.good_points, flow);
    } else {
      risks.push('人流偏弱');
      addBreakdown(breakdown, 'pedestrian_flow', '人流', 0, config.pedestrian_flow.good_points, flow);
    }
  }

  if (config.zoning_permit.enabled) {
    const zoning = clean(x.zoning_permit);
    if (!zoning) {
      missing.push('使用分區 / 使用執照');
      addBreakdown(breakdown, 'zoning_permit', '用途 / 許可', 0, config.zoning_permit.commercial_points, '待確認', 'missing');
    } else if (/商業|可|允許|OK|D1|D5/i.test(zoning)) {
      score += Number(config.zoning_permit.commercial_points) || 0;
      addBreakdown(breakdown, 'zoning_permit', '用途 / 許可', config.zoning_permit.commercial_points, config.zoning_permit.commercial_points, zoning);
    } else if (/住宅|住[0-9]|變更|待確認/.test(zoning)) {
      risks.push('用途 / 使用執照需確認');
      missing.push('使用執照變更可行性');
      addBreakdown(breakdown, 'zoning_permit', '用途 / 許可', config.zoning_permit.uncertain_points, config.zoning_permit.commercial_points, zoning);
    } else {
      risks.push('用途 / 許可存在阻礙');
      addBreakdown(breakdown, 'zoning_permit', '用途 / 許可', 0, config.zoning_permit.commercial_points, zoning);
    }
  }

  const riskEvidence = `${clean(x.building_risks)} ${clean(x.manual_notes)} ${clean(x.zoning_permit)}`;
  if (config.hard_rejects.enabled) {
    if (
      config.hard_rejects.reject_gym_not_allowed &&
      textIncludes(riskEvidence, [/健身房.*不可/, /不可.*健身房/, /gym.*not.*allowed/i])
    ) {
      hardReject = true;
      risks.push('房東 / 建物條件不接受健身房業態');
    }
    if (
      config.hard_rejects.reject_major_building_risk &&
      textIncludes(riskEvidence, [/老舊/, /毛胚/, /震動/, /耐荷重/, /違建/, /增建/])
    ) {
      hardReject = true;
      risks.push('建物條件存在重大風險');
    }
    if (
      config.hard_rejects.reject_zoning_blocker &&
      textIncludes(riskEvidence, [/不可變更/, /無法變更/, /用途.*不可/, /執照.*不可/])
    ) {
      hardReject = true;
      risks.push('用途 / 執照存在阻礙');
    }
  }

  score = clamp(roundHalf(score), 0, 10);
  if (hardReject) score = Math.min(score, 3);

  let recommendation = 'needs_research';
  if (hardReject || x.status === 'rejected') recommendation = 'reject';
  else if (score >= Number(config.recommendation_threshold || 8)) recommendation = 'recommend_viewing';
  else if (missing.length) recommendation = 'needs_research';
  else recommendation = 'hold';

  let nextStep = '補齊缺資料後重新評分';
  if (recommendation === 'recommend_viewing') nextStep = '可排看屋 / 進入 shortlist';
  if (recommendation === 'reject') nextStep = '先暫停推進，確認淘汰條件是否可排除';
  if (recommendation === 'hold') nextStep = '保留觀察，等待更佳物件或補強條件';

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
    const scoring = scoreListing(listing, config);
    return {
      ...listing,
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
    address: [x.city, x.district].filter(Boolean).join(''),
    lat: null,
    lng: null,
    finder: '591 Radar',
    floor: x.floor_text || '',
    mrt: x.mrt_minutes == null ? '' : `${x.mrt_minutes} 分鐘`,
    rent: formatTwd(x.rent_twd),
    managementFee: '',
    rentJPY: '',
    area: x.usable_area_ping == null ? '待確認' : `${x.usable_area_ping}坪`,
    areaPing: x.usable_area_ping,
    listedAreaPing: x.listed_area_ping,
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
  clean,
  number,
  normalizeListing,
  normalizeCrawlerListing,
  normalizeHumanFields,
  listingIdentity,
  listingFromSheetRow,
  upsertListings,
  scoreListing,
  scoreListings,
  listingToLocationReviewItem,
};
