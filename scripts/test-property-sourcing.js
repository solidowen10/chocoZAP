const assert = require('assert');

const {
  applyCurrentSheetListingIds,
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

function testListedAreaDrivesScoring() {
  const listing = normalizeListing({
    source: '591',
    source_listing_id: '21778960',
    url: 'https://rent.591.com.tw/21778960',
    city: '台北市',
    district: '南港區',
    rent_twd: 89000,
    listed_area_ping: 90,
    usable_area_ping: null,
    floor_text: '1F/15F',
  });
  const scored = scoreListing(listing, defaultScoringConfig());

  assert.strictEqual(listing.usable_area_ping, null);
  assert.strictEqual(scored.score, 10);
  assert(!scored.missing_data.includes('總坪數'));
  assert(!scored.missing_data.includes('使用面積'));
}

function testScoringChangesWhenConfigChanges() {
  const listing = {
    source: '591',
    source_listing_id: '1',
    url: 'https://rent.591.com.tw/1',
    city: '台北市',
    district: '南港區',
    rent_twd: 150000,
    listed_area_ping: 90,
    usable_area_ping: 90,
    mrt_minutes: 4,
    floor_text: '1F/15F',
    signage: '2面看板',
    pedestrian_flow: '人流多',
    zoning_permit: '商業區可',
  };

  const base = defaultScoringConfig();
  const strictRent = {
    ...base,
    rent: {
      ...base.rent,
      good_max_twd: 80000,
      ok_max_twd: 90000,
      good_points: 1.5,
      ok_points: 0.4,
      high_points: 0,
    },
  };

  const normalScore = scoreListing(listing, base).score;
  const strictScore = scoreListing(listing, strictRent).score;
  assert.notStrictEqual(normalScore, strictScore);
  assert(normalScore > strictScore);
}

function testRecommendationThresholdWorks() {
  const listing = {
    source: '591',
    source_listing_id: '2',
    url: 'https://rent.591.com.tw/2',
    city: '台北市',
    district: '南港區',
    rent_twd: 150000,
    listed_area_ping: 100,
    usable_area_ping: 100,
    mrt_minutes: 3,
    floor_text: '1F/15F',
    signage: '2面看板',
    pedestrian_flow: '人流多',
    zoning_permit: '商業區可',
  };

  const lowThreshold = {
    ...defaultScoringConfig(),
    recommendation_threshold: 8,
  };
  const highThreshold = {
    ...defaultScoringConfig(),
    recommendation_threshold: 9.5,
  };

  assert.strictEqual(scoreListing(listing, lowThreshold).recommendation, 'recommend_viewing');
  assert.notStrictEqual(scoreListing(listing, highThreshold).recommendation, 'recommend_viewing');
}

function testScoreListingsDeterministic() {
  const listings = [{
    source: '591',
    source_listing_id: '3',
    url: 'https://rent.591.com.tw/3',
    city: '台北市',
    district: '松山區',
    rent_twd: 100000,
    listed_area_ping: 85,
    usable_area_ping: 85,
    mrt_minutes: 5,
    floor_text: '1F/5F',
    signage: '1面',
    pedestrian_flow: '人流多',
    zoning_permit: '商業區可',
  }];
  const config = defaultScoringConfig();

  assert.deepStrictEqual(scoreListings(listings, config), scoreListings(listings, config));
}

function testUnifiedMaxIsExactlyTen() {
  const listing = {
    city: '台北市',
    district: '南港區',
    listed_area_ping: 100,
    rent_twd: 100000,
    floor_text: '1F/5F',
  };
  const scoring = scoreListing(listing, defaultScoringConfig());

  assert.strictEqual(scoring.score, 10);
  assert.strictEqual(
    scoring.breakdown.reduce((sum, item) => sum + item.max, 0),
    10,
  );
}

function testUsableAreaDoesNotAffectScore() {
  const listing = {
    city: '台北市',
    district: '南港區',
    listed_area_ping: 100,
    rent_twd: 100000,
    floor_text: '1F/5F',
  };

  assert.strictEqual(
    scoreListing({ ...listing, usable_area_ping: 20 }).score,
    scoreListing({ ...listing, usable_area_ping: 300 }).score,
  );
}

function testResearchFieldsDoNotAffectNumericScore() {
  const listing = {
    city: '台北市',
    district: '南港區',
    listed_area_ping: 100,
    rent_twd: 100000,
    floor_text: '1F/5F',
  };
  const baseScore = scoreListing(listing, defaultScoringConfig()).score;
  const researchedScore = scoreListing({
    ...listing,
    mrt_minutes: 1,
    mrt_station: '民權西路',
    nearby_place: '三姐姐早餐店',
    nearby_distance_m: 517,
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
  };
  const automated = {
    city: '台北市',
    district: '南港區',
    listed_area_ping: 100,
    rent_twd: 100000,
    floor_text: '1F/5F',
  };
  const adapted = manualLocationToScoringListing(manual);

  assert.strictEqual(adapted.city, automated.city);
  assert.strictEqual(adapted.district, automated.district);
  assert.strictEqual(adapted.listed_area_ping, automated.listed_area_ping);
  assert.strictEqual(scoreListing(adapted, defaultScoringConfig()).score, scoreListing(automated, defaultScoringConfig()).score);
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

  assert.strictEqual(scoreManualLocation(manual, config).aiScore, scoreListing(automated, config).score);
  assert.strictEqual(scoreManualLocation(manual, strictAreaConfig).aiScore, scoreListing(automated, strictAreaConfig).score);
  assert.notStrictEqual(scoreManualLocation(manual, config).aiScore, scoreManualLocation(manual, strictAreaConfig).aiScore);
}

testUpsertPreventsDuplicates();
testBusinessTypePipeline();
testCrawlerReimportPreservesHumanFields();
testCurrentSheetMembershipFiltersListingsWithoutDeletingHistory();
testNearbyPlaceClassifier();
testListedAreaDrivesScoring();
testScoringChangesWhenConfigChanges();
testRecommendationThresholdWorks();
testScoreListingsDeterministic();
testUnifiedMaxIsExactlyTen();
testUsableAreaDoesNotAffectScore();
testResearchFieldsDoNotAffectNumericScore();
testManualAdapterMatchesAutomatedScoringField();
testConfigChangeAffectsManualAndAutomatedScores();

console.log('property sourcing tests passed');
