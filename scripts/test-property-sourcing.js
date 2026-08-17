const assert = require('assert');

const {
  defaultScoringConfig,
  manualLocationToScoringListing,
  normalizeListing,
  scoreManualLocation,
  upsertListings,
  scoreListing,
  scoreListings,
} = require('../lib/propertySourcing');

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
    mrt_distance_m: 620,
    manual_notes: '已約房仲確認',
  }];

  const result = upsertListings(existing, [{
    source: '591',
    source_listing_id: '21778960',
    url: 'https://rent.591.com.tw/21778960',
    title: '東方晶璽大樓 crawler update',
    rent_twd: 89000,
    address: '南港區-經園街',
    mrt_station: '後山埤',
    mrt_distance_m: 450,
    usable_area_ping: '',
    manual_notes: '',
  }], { now: '2026-08-15T00:00:00.000Z' });

  const listing = result.listings[0];
  assert.strictEqual(listing.title, '東方晶璽大樓 crawler update');
  assert.strictEqual(listing.status, 'reviewing');
  assert.strictEqual(listing.usable_area_ping, 52);
  assert.strictEqual(listing.mrt_station, '南港展覽館');
  assert.strictEqual(listing.address, '南港區-經園街');
  assert.strictEqual(listing.mrt_distance_m, 450);
  assert.strictEqual(listing.manual_notes, '已約房仲確認');
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
    mrt_distance_m: 517,
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
testCrawlerReimportPreservesHumanFields();
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
