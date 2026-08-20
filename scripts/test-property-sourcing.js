const assert = require('assert');

const {
  applyCurrentSheetListingIds,
  buildShortlistSheetSyncPlan,
  classifyNearbyPlace,
  defaultScoringConfig,
  filterListingsByCurrentSheetIds,
  listingIdentities,
  listingIdentity,
  listingFromSheetRow,
  manualLocationToScoringListing,
  normalizeListing,
  scoreManualLocation,
  upsertListings,
  scoreListing,
  scoreListings,
} = require('../lib/propertySourcing');

function makeAutomatedListing(id, patch = {}) {
  return normalizeListing({
    source: '591',
    source_listing_id: String(id),
    url: `https://rent.591.com.tw/${id}`,
    title: `測試物件 ${id}`,
    city: '台北市',
    district: '南港區',
    rent_twd: 100000,
    listed_area_ping: 100,
    floor_text: '1F/5F',
    first_seen_at: '2026-08-01T00:00:00.000Z',
    last_seen_at: '2026-08-01T00:00:00.000Z',
    ...patch,
  });
}

function testUpsertPreventsDuplicates() {
  const now = '2026-08-14T00:00:00.000Z';
  const first = upsertListings([], [
    {
      source: '591',
      source_listing_id: '21778960',
      url: 'https://rent.591.com.tw/21778960',
      title: '東方晶璽大樓',
      rent_twd: 89000,
    },
  ], { now });

  assert.strictEqual(first.listings.length, 1);
  assert.strictEqual(first.created, 1);

  const second = upsertListings(first.listings, [
    {
      source: '591',
      source_listing_id: '21778960',
      url: 'https://rent.591.com.tw/21778960',
      title: '東方晶璽大樓更新',
      rent_twd: 89000,
    },
  ], { now: '2026-08-15T00:00:00.000Z' });

  assert.strictEqual(second.listings.length, 1);
  assert.strictEqual(second.updated, 1);
  assert.strictEqual(second.listings[0].title, '東方晶璽大樓更新');
  assert.strictEqual(second.listings[0].first_seen_at, now);
  assert.strictEqual(second.listings[0].last_seen_at, '2026-08-15T00:00:00.000Z');
}


function testBusinessTypePipeline() {
  const normalized = normalizeListing({
    source: '591',
    source_listing_id: '999001',
    url: 'https://business.591.com.tw/rent/999001',
    title: '測試店面',
    business_type: '商業街店面',
  });

  assert.strictEqual(normalized.business_type, '商業街店面');

  const sheetEnglish = listingFromSheetRow({
    source: '591',
    source_listing_id: '999002',
    url: 'https://business.591.com.tw/rent/999002',
    business_type: '路邊/臨街門面',
  });

  assert.strictEqual(sheetEnglish.business_type, '路邊/臨街門面');

  const sheetChinese = listingFromSheetRow({
    source: '591',
    source_listing_id: '999003',
    url: 'https://business.591.com.tw/rent/999003',
    '商用類型': '社區底商',
  });

  assert.strictEqual(sheetChinese.business_type, '社區底商');

  const existing = [{
    source: '591',
    source_listing_id: '999004',
    url: 'https://business.591.com.tw/rent/999004',
    business_type: '店面',
    status: 'reviewing',
  }];

  const result = upsertListings(existing, [{
    source: '591',
    source_listing_id: '999004',
    url: 'https://business.591.com.tw/rent/999004',
    business_type: '商業街店面',
  }], { now: '2026-08-18T00:00:00.000Z' });

  assert.strictEqual(result.listings[0].business_type, '商業街店面');
  assert.strictEqual(result.listings[0].status, 'reviewing');
}

function testCrawlerReimportPreservesHumanFields() {
  const existing = [{
    source: '591',
    source_listing_id: '21778960',
    url: 'https://rent.591.com.tw/21778960',
    title: '東方晶璽大樓',
    status: 'reviewing',
    usable_area_ping: 52,
    mrt_station: '南港展覽館',
    address: '台北市南港區經園街',
    nearby_place: '南港展覽館',
    nearby_distance_m: 620,
    manual_notes: '已約房仲確認',
  }];

  const result = upsertListings(existing, [{
    source: '591',
    source_listing_id: '21778960',
    url: 'https://rent.591.com.tw/21778960',
    title: '東方晶璽大樓 crawler update',
    rent_twd: 89000,
    address: '南港區-經園街',
    nearby_place: '後山埤',
    nearby_distance_m: 450,
    usable_area_ping: '',
    manual_notes: '',
  }], { now: '2026-08-15T00:00:00.000Z' });

  const listing = result.listings[0];
  assert.strictEqual(listing.title, '東方晶璽大樓 crawler update');
  assert.strictEqual(listing.status, 'reviewing');
  assert.strictEqual(listing.usable_area_ping, 52);
  assert.strictEqual(listing.mrt_station, '南港展覽館');
  assert.strictEqual(listing.address, '南港區-經園街');
  assert.strictEqual(listing.nearby_place, '後山埤');
  assert.strictEqual(listing.nearby_place_type, 'mrt');
  assert.strictEqual(listing.nearby_distance_m, 450);
  assert.strictEqual(listing.manual_notes, '已約房仲確認');
}


function testImportedStatusDoesNotOverwritePlatformStatus() {
  const now = '2026-08-20T08:00:00.000Z';

  ['reviewing', 'shortlisted', 'rejected'].forEach((status, index) => {
    const id = `status-preserve-${index}`;
    const result = upsertListings([
      makeAutomatedListing(id, {
        status,
        title: '原始標題',
        rent_twd: 100000,
        address: '原地址',
      }),
    ], [{
      source: '591',
      source_listing_id: id,
      url: `https://rent.591.com.tw/${id}`,
      title: '匯入更新標題',
      rent_twd: 123000,
      address: '匯入更新地址',
      status: 'new',
    }], { now });

    const listing = result.listings[0];
    assert.strictEqual(listing.status, status);
    assert.strictEqual(listing.title, '匯入更新標題');
    assert.strictEqual(listing.rent_twd, 123000);
    assert.strictEqual(listing.address, '匯入更新地址');
  });

  const created = upsertListings([], [{
    source: '591',
    source_listing_id: 'incoming-shortlisted-new-listing',
    url: 'https://rent.591.com.tw/incoming-shortlisted-new-listing',
    title: '新匯入物件',
    status: 'shortlisted',
  }], { now });

  assert.strictEqual(created.created, 1);
  assert.strictEqual(created.listings[0].status, 'new');
}

function testCurrentSheetMembershipFiltersListingsWithoutDeletingHistory() {
  const historicalListings = Array.from({ length: 143 }, (_, index) => makeAutomatedListing(index + 1));
  const firstCurrentIds = listingIdentities(historicalListings.slice(0, 84));

  assert.strictEqual(firstCurrentIds.length, 84);

  const firstStore = applyCurrentSheetListingIds(
    { listings: historicalListings, currentSheetListingIds: null, currentSheetSyncedAt: null },
    firstCurrentIds,
    '2026-08-17T00:00:00.000Z',
  );
  const firstPayloadListings = scoreListings(
    filterListingsByCurrentSheetIds(firstStore.listings, firstStore.currentSheetListingIds),
    defaultScoringConfig(),
  );

  assert.strictEqual(firstStore.listings.length, 143);
  assert.strictEqual(firstPayloadListings.length, 84);
  assert.deepStrictEqual(
    listingIdentities(firstPayloadListings),
    firstCurrentIds,
  );

  const removedListing = historicalListings[0];
  const removedIdentity = listingIdentity(removedListing);
  const secondCurrentIds = listingIdentities(historicalListings.slice(1, 85));
  const secondStore = applyCurrentSheetListingIds(
    firstStore,
    secondCurrentIds,
    '2026-08-17T01:00:00.000Z',
  );
  const secondPayloadListings = filterListingsByCurrentSheetIds(
    secondStore.listings,
    secondStore.currentSheetListingIds,
  );

  assert.strictEqual(secondCurrentIds.length, 84);
  assert.strictEqual(secondPayloadListings.length, 84);
  assert(!secondPayloadListings.some((listing) => listingIdentity(listing) === removedIdentity));
  assert(secondStore.listings.some((listing) => listingIdentity(listing) === removedIdentity));
  assert.strictEqual(secondStore.listings.length, 143);

  const thirdStore = applyCurrentSheetListingIds(
    secondStore,
    listingIdentities([removedListing, ...historicalListings.slice(1, 85)]),
    '2026-08-17T02:00:00.000Z',
  );
  const thirdPayloadListings = filterListingsByCurrentSheetIds(
    thirdStore.listings,
    thirdStore.currentSheetListingIds,
  );

  assert.strictEqual(thirdPayloadListings.length, 85);
  assert(thirdPayloadListings.some((listing) => listingIdentity(listing) === removedIdentity));
  assert.strictEqual(thirdStore.listings.length, 143);

  const failedSyncStore = applyCurrentSheetListingIds(
    thirdStore,
    undefined,
    '2026-08-17T03:00:00.000Z',
  );

  assert.deepStrictEqual(failedSyncStore.currentSheetListingIds, thirdStore.currentSheetListingIds);
  assert.strictEqual(failedSyncStore.currentSheetSyncedAt, thirdStore.currentSheetSyncedAt);
  assert.strictEqual(
    filterListingsByCurrentSheetIds(failedSyncStore.listings, failedSyncStore.currentSheetListingIds).length,
    85,
  );

  const emptySheetStore = applyCurrentSheetListingIds(
    failedSyncStore,
    [],
    '2026-08-17T04:00:00.000Z',
  );

  assert.deepStrictEqual(emptySheetStore.currentSheetListingIds, []);
  assert.strictEqual(
    filterListingsByCurrentSheetIds(emptySheetStore.listings, emptySheetStore.currentSheetListingIds).length,
    0,
  );
  assert.strictEqual(emptySheetStore.listings.length, 143);
}

function testNearbyPlaceClassifier() {
  [
    '南京復興',
    '南京復興站',
    '明德',
    '明德站',
    '象山',
    '劍南路',
    '石牌',
    '昆陽',
  ].forEach((place) => {
    assert.strictEqual(classifyNearbyPlace(place), 'mrt');
  });

  [
    '三姐姐早餐店',
    '山仔后派出所',
    '故宮博物院',
    '中華地磅',
    '振興醫院',
    '天母公園',
  ].forEach((place) => {
    assert.strictEqual(classifyNearbyPlace(place), 'place');
  });

  assert.strictEqual(classifyNearbyPlace(''), null);
  assert.strictEqual(classifyNearbyPlace(null), null);
  assert.strictEqual(normalizeListing({ nearby_place: '三姐姐早餐店' }).nearby_place_type, 'place');
  assert.strictEqual(normalizeListing({ nearby_place: '明德站' }).nearby_place_type, 'mrt');
  assert.strictEqual(normalizeListing({}).nearby_place_type, null);
  assert.strictEqual(scoreListings([{ nearby_place: '昆陽' }], defaultScoringConfig())[0].nearby_place_type, 'mrt');
}

function scoringListing(patch = {}) {
  return {
    source: '591',
    source_listing_id: 'scoring-test',
    url: 'https://rent.591.com.tw/scoring-test',
    city: '台北市',
    district: '南港區',
    rent_twd: 100000,
    listed_area_ping: 100,
    nearby_place: '昆陽',
    nearby_place_type: 'mrt',
    nearby_distance_m: 300,
    floor_text: '1F/5F',
    ...patch,
  };
}

function testListedAreaDrivesScoring() {
  const listing = normalizeListing(scoringListing({
    rent_twd: 89000,
    listed_area_ping: 90,
    usable_area_ping: null,
  }));

  const scored = scoreListing(listing, defaultScoringConfig());

  assert.strictEqual(listing.usable_area_ping, null);
  assert.strictEqual(scored.score, 10);
  assert(!scored.missing_data.includes('總坪數'));
  assert(!scored.missing_data.includes('使用面積'));
}

function testMrtDistanceScoring() {
  const config = defaultScoringConfig();

  const near = scoreListing(scoringListing({
    nearby_distance_m: 500,
  }), config);

  const middle = scoreListing(scoringListing({
    nearby_distance_m: 863,
  }), config);

  const far = scoreListing(scoringListing({
    nearby_distance_m: 1200,
  }), config);

  assert.strictEqual(
    near.breakdown.find((item) => item.key === 'mrt_distance').points,
    4,
  );

  assert.strictEqual(
    middle.breakdown.find((item) => item.key === 'mrt_distance').points,
    2,
  );

  assert.strictEqual(
    far.breakdown.find((item) => item.key === 'mrt_distance').points,
    0,
  );

  assert(near.score > middle.score);
  assert(middle.score > far.score);
}

function testMrtMinutesFallbackScoring() {
  const config = defaultScoringConfig();

  assert.strictEqual(config.mrt_distance.good_max_minutes, 5);
  assert.strictEqual(config.mrt_distance.ok_max_minutes, 10);

  const good = scoreListing(scoringListing({
    nearby_place: null,
    nearby_place_type: null,
    nearby_distance_m: null,
    mrt_station: '昆陽',
    mrt_minutes: 5,
  }), config);

  const acceptable = scoreListing(scoringListing({
    nearby_place: null,
    nearby_place_type: null,
    nearby_distance_m: null,
    mrt_station: '昆陽',
    mrt_minutes: 8,
  }), config);

  const far = scoreListing(scoringListing({
    nearby_place: null,
    nearby_place_type: null,
    nearby_distance_m: null,
    mrt_station: '昆陽',
    mrt_minutes: 12,
  }), config);

  assert.strictEqual(
    good.breakdown.find((item) => item.key === 'mrt_distance').points,
    4,
  );

  assert.strictEqual(
    acceptable.breakdown.find((item) => item.key === 'mrt_distance').points,
    2,
  );

  assert.strictEqual(
    far.breakdown.find((item) => item.key === 'mrt_distance').points,
    0,
  );

  assert(good.score > acceptable.score);
  assert(acceptable.score > far.score);
}

function testMrtDistanceTakesPriorityOverMinutes() {
  const scored = scoreListing(scoringListing({
    nearby_distance_m: 800,
    mrt_station: '昆陽',
    mrt_minutes: 2,
  }), defaultScoringConfig());

  const mrt = scored.breakdown.find((item) => item.key === 'mrt_distance');

  assert.strictEqual(mrt.points, 2);
  assert(mrt.reason.includes('800 公尺'));
}

function testNonMrtPlaceDoesNotCountAsMrtDistance() {
  const scored = scoreListing(scoringListing({
    nearby_place: '三姐姐早餐店',
    nearby_place_type: 'place',
    nearby_distance_m: 200,
  }), defaultScoringConfig());

  const mrt = scored.breakdown.find((item) => item.key === 'mrt_distance');

  assert.strictEqual(mrt.points, 0);
  assert.strictEqual(mrt.status, 'missing');
  assert(scored.missing_data.includes('捷運距離'));
}

function testRentPerPingScoring() {
  const config = defaultScoringConfig();

  const good = scoreListing(scoringListing({
    rent_twd: 80000,
    listed_area_ping: 80,
  }), config);

  const acceptable = scoreListing(scoringListing({
    rent_twd: 550000,
    listed_area_ping: 100,
  }), config);

  const expensive = scoreListing(scoringListing({
    rent_twd: 650000,
    listed_area_ping: 100,
  }), config);

  assert.strictEqual(
    good.breakdown.find((item) => item.key === 'rent_per_ping').points,
    3,
  );

  assert.strictEqual(
    acceptable.breakdown.find((item) => item.key === 'rent_per_ping').points,
    1.5,
  );

  assert.strictEqual(
    expensive.breakdown.find((item) => item.key === 'rent_per_ping').points,
    0,
  );
}

function testScoringChangesWhenConfigChanges() {
  const listing = scoringListing({
    rent_twd: 550000,
    listed_area_ping: 100,
  });

  const base = defaultScoringConfig();

  const strictRent = {
    ...base,
    rent_per_ping: {
      ...base.rent_per_ping,
      good_max_twd: 4000,
      ok_max_twd: 5000,
      good_points: 3,
      ok_points: 1.5,
      high_points: 0,
    },
  };

  const normalScore = scoreListing(listing, base).score;
  const strictScore = scoreListing(listing, strictRent).score;

  assert.notStrictEqual(normalScore, strictScore);
  assert(normalScore > strictScore);
}

function testRecommendationThresholdWorks() {
  const listing = scoringListing();

  const lowThreshold = {
    ...defaultScoringConfig(),
    recommendation_threshold: 8,
  };

  const highThreshold = {
    ...defaultScoringConfig(),
    recommendation_threshold: 10,
  };

  assert.strictEqual(
    scoreListing(listing, lowThreshold).recommendation,
    'recommend_viewing',
  );

  assert.strictEqual(
    scoreListing(listing, highThreshold).recommendation,
    'recommend_viewing',
  );

  const reducedListing = scoringListing({
    nearby_distance_m: 800,
  });

  assert.strictEqual(
    scoreListing(reducedListing, lowThreshold).recommendation,
    'recommend_viewing',
  );

  assert.notStrictEqual(
    scoreListing(reducedListing, highThreshold).recommendation,
    'recommend_viewing',
  );
}

function testScoreListingsDeterministic() {
  const listings = [
    scoringListing({
      source_listing_id: '3',
      nearby_distance_m: 450,
      rent_twd: 100000,
      listed_area_ping: 85,
    }),
  ];

  const config = defaultScoringConfig();

  assert.deepStrictEqual(
    scoreListings(listings, config),
    scoreListings(listings, config),
  );
}

function testShortlistSheetSyncPlan() {
  const config = defaultScoringConfig();
  const now = '2026-08-20T00:00:00.000Z';
  const existingAddedAt = '2026-08-01T09:00:00.000Z';
  const existing = scoreListings([
    makeAutomatedListing('101', {
      status: 'shortlisted',
      title: '內湖站旁店面',
      city: '台北市',
      district: '內湖區',
      address: '內湖區成功路',
      rent_twd: 90000,
      listed_area_ping: 83.4,
      nearby_place: '內湖',
      nearby_distance_m: 322,
      reviewed_at: '2026-08-10T10:00:00.000Z',
    }),
  ], config)[0];
  const added = scoreListings([
    makeAutomatedListing('102', {
      status: 'shortlisted',
      title: '信義安和人工捷運備援',
      rent_twd: 100000,
      listed_area_ping: 100,
      nearby_place: '三姐姐早餐店',
      nearby_distance_m: 200,
      mrt_station: '信義安和',
      mrt_minutes: 4,
      reviewed_at: '2026-08-11T11:00:00.000Z',
    }),
  ], config)[0];
  const notShortlisted = scoreListings([
    makeAutomatedListing('103', { status: 'reviewing' }),
  ], config)[0];
  const existingValues = [
    ['source', '591 ID', '物件名稱', '591 URL', '城市', '行政區', '地址', '月租', '總坪數', '每坪月租', '最近捷運', '捷運距離M', '初篩分數', '加入候選時間', '聯繫狀態', '聯繫日期', '房東／仲介回覆', '可否看屋', '看屋日期', '房仲備註'],
    ['591', '101', '舊名稱', 'old-url', '台北市', '內湖區', '舊地址', 1, 2, 3, '舊站', 999, 5, existingAddedAt, '已聯繫', '2026-08-12', '會回覆', '可', '2026-08-21', '保留這些欄位'],
    ['591', '999', '不再候選', 'old-999', '', '', '', '', '', '', '', '', '', '2026-08-02T00:00:00.000Z', 'broker', '', '', '', '', 'keep'],
  ];

  const plan = buildShortlistSheetSyncPlan(
    [existing, added, notShortlisted],
    existingValues,
    { now, config },
  );

  assert.strictEqual(plan.shortlisted, 2);
  assert.strictEqual(plan.updated, 1);
  assert.strictEqual(plan.created, 1);
  assert.strictEqual(plan.total, 2);

  const update = plan.updates.find((item) => item.identity === '591:101');
  assert(update);
  assert.strictEqual(update.rowNumber, 2);
  assert.strictEqual(update.values.length, 14);
  assert.strictEqual(update.values[0], '591');
  assert.strictEqual(update.values[1], '101');
  assert.strictEqual(update.values[9], 1079);
  assert.strictEqual(update.values[10], '內湖');
  assert.strictEqual(update.values[11], 322);
  assert.strictEqual(update.values[12], 10);
  assert.strictEqual(update.values[13], existingAddedAt);
  assert(!plan.updates.some((item) => item.identity === '591:999'));
  assert(!plan.updates.some((item) => item.identity === '591:103'));

  const appended = plan.appendRows[0];
  assert.strictEqual(appended.length, 20);
  assert.strictEqual(appended[0], '591');
  assert.strictEqual(appended[1], '102');
  assert.strictEqual(appended[9], 1000);
  assert.strictEqual(appended[10], '信義安和');
  assert.strictEqual(appended[11], '');
  assert.strictEqual(appended[13], '2026-08-11T11:00:00.000Z');
  assert.deepStrictEqual(appended.slice(14), ['', '', '', '', '', '']);
}

function testUnifiedMaxIsExactlyTen() {
  const scoring = scoreListing(
    scoringListing(),
    defaultScoringConfig(),
  );

  assert.strictEqual(scoring.score, 10);

  assert.strictEqual(
    scoring.breakdown.reduce((sum, item) => sum + item.max, 0),
    10,
  );
}

function testUsableAreaDoesNotAffectScore() {
  const listing = scoringListing();

  assert.strictEqual(
    scoreListing({ ...listing, usable_area_ping: 20 }).score,
    scoreListing({ ...listing, usable_area_ping: 300 }).score,
  );
}

function testOldResearchFieldsDoNotAffectNumericScore() {
  const listing = scoringListing();

  const baseScore = scoreListing(
    listing,
    defaultScoringConfig(),
  ).score;

  const researchedScore = scoreListing({
    ...listing,
    mrt_minutes: 1,
    mrt_station: '民權西路',
    address: '中山區-中山北路二段',
    signage: '2面看板',
    pedestrian_flow: '人流多',
    zoning_permit: '不可變更',
    building_risks: '重大建物風險',
    usable_area_ping: 10,
  }, defaultScoringConfig()).score;

  assert.strictEqual(baseScore, researchedScore);
}

function testManualAdapterMatchesAutomatedScoringField() {
  const manual = {
    region: '台北',
    address: '台北市南港區經園街',
    areaPing: 100,
    rent: 'NT$100,000',
    floor: '1F/5F',
    station: '昆陽',
    mrt: '步行 5 分鐘',
  };

  const automated = {
    city: '台北市',
    district: '南港區',
    listed_area_ping: 100,
    rent_twd: 100000,
    floor_text: '1F/5F',
    mrt_station: '昆陽',
    mrt_minutes: 5,
  };

  const adapted = manualLocationToScoringListing(manual);

  assert.strictEqual(adapted.city, automated.city);
  assert.strictEqual(adapted.district, automated.district);
  assert.strictEqual(adapted.mrt_station, automated.mrt_station);
  assert.strictEqual(adapted.mrt_minutes, automated.mrt_minutes);
  assert.strictEqual(
    adapted.listed_area_ping,
    automated.listed_area_ping,
  );

  assert.strictEqual(
    scoreListing(adapted, defaultScoringConfig()).score,
    scoreListing(automated, defaultScoringConfig()).score,
  );

  const explicit = manualLocationToScoringListing({
    ...manual,
    station: '昆陽',
    mrt: '步行 5 分鐘',
    mrt_station: '明德',
    mrt_minutes: 4,
  });

  assert.strictEqual(explicit.mrt_station, '明德');
  assert.strictEqual(explicit.mrt_minutes, 4);
}

function testConfigChangeAffectsManualAndAutomatedScores() {
  const config = defaultScoringConfig();

  const strictAreaConfig = {
    ...config,
    area: {
      ...config.area,
      good_min_ping: 120,
      ok_min_ping: 110,
      good_points: 3,
      ok_points: 1,
      low_points: 0,
    },
  };

  const manual = {
    region: '台北',
    address: '台北市南港區經園街',
    areaPing: 100,
    rent: 'NT$100,000',
    floor: '1F/5F',
  };

  const automated = {
    city: '台北市',
    district: '南港區',
    listed_area_ping: 100,
    rent_twd: 100000,
    floor_text: '1F/5F',
  };

  assert.strictEqual(
    scoreManualLocation(manual, config).aiScore,
    scoreListing(automated, config).score,
  );

  assert.strictEqual(
    scoreManualLocation(manual, strictAreaConfig).aiScore,
    scoreListing(automated, strictAreaConfig).score,
  );

  assert.notStrictEqual(
    scoreManualLocation(manual, config).aiScore,
    scoreManualLocation(manual, strictAreaConfig).aiScore,
  );
}

testUpsertPreventsDuplicates();
testBusinessTypePipeline();
testCrawlerReimportPreservesHumanFields();
testImportedStatusDoesNotOverwritePlatformStatus();
testCurrentSheetMembershipFiltersListingsWithoutDeletingHistory();
testNearbyPlaceClassifier();

testListedAreaDrivesScoring();
testMrtDistanceScoring();
testMrtMinutesFallbackScoring();
testMrtDistanceTakesPriorityOverMinutes();
testNonMrtPlaceDoesNotCountAsMrtDistance();
testRentPerPingScoring();
testScoringChangesWhenConfigChanges();
testRecommendationThresholdWorks();
testScoreListingsDeterministic();
testShortlistSheetSyncPlan();
testUnifiedMaxIsExactlyTen();
testUsableAreaDoesNotAffectScore();
testOldResearchFieldsDoNotAffectNumericScore();
testManualAdapterMatchesAutomatedScoringField();
testConfigChangeAffectsManualAndAutomatedScores();

console.log('property sourcing tests passed');
