const assert = require('assert');

const {
  defaultScoringConfig,
  normalizeListing,
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
    manual_notes: '已約房仲確認',
  }];

  const result = upsertListings(existing, [{
    source: '591',
    source_listing_id: '21778960',
    url: 'https://rent.591.com.tw/21778960',
    title: '東方晶璽大樓 crawler update',
    rent_twd: 89000,
    usable_area_ping: '',
    manual_notes: '',
  }], { now: '2026-08-15T00:00:00.000Z' });

  const listing = result.listings[0];
  assert.strictEqual(listing.title, '東方晶璽大樓 crawler update');
  assert.strictEqual(listing.status, 'reviewing');
  assert.strictEqual(listing.usable_area_ping, 52);
  assert.strictEqual(listing.mrt_station, '南港展覽館');
  assert.strictEqual(listing.manual_notes, '已約房仲確認');
}

function testMissingUsableAreaRemainsMissing() {
  const listing = normalizeListing({
    source: '591',
    source_listing_id: '21778960',
    url: 'https://rent.591.com.tw/21778960',
    city: '台北市',
    district: '南港區',
    rent_twd: 89000,
    listed_area_ping: 55,
    usable_area_ping: null,
    floor_text: '1F/15F',
  });
  const scored = scoreListing(listing, defaultScoringConfig());

  assert.strictEqual(listing.usable_area_ping, null);
  assert(scored.missing_data.includes('使用面積'));
}

function testScoringChangesWhenConfigChanges() {
  const listing = {
    source: '591',
    source_listing_id: '1',
    url: 'https://rent.591.com.tw/1',
    city: '台北市',
    district: '南港區',
    rent_twd: 150000,
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
    rent_twd: 89000,
    usable_area_ping: 100,
    mrt_minutes: 3,
    floor_text: '1F/15F',
    signage: '2面看板',
    pedestrian_flow: '人流多',
    zoning_permit: '商業區可',
  };

  const lowThreshold = {
    ...defaultScoringConfig(),
    recommendation_threshold: 7,
  };
  const highThreshold = {
    ...defaultScoringConfig(),
    recommendation_threshold: 10.5,
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

testUpsertPreventsDuplicates();
testCrawlerReimportPreservesHumanFields();
testMissingUsableAreaRemainsMissing();
testScoringChangesWhenConfigChanges();
testRecommendationThresholdWorks();
testScoreListingsDeterministic();

console.log('property sourcing tests passed');
