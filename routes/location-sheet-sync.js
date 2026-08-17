const {
  resolveGoogleMapsUrl,
  extractCoordinates,
  regionFromCoordinates,
  regionFromResolvedUrl,
  extractAddressFromResolvedUrl
} = require('../lib/maps');

const express = require('express');
const fs = require('fs');
const path = require('path');
const {
  mergeScoringConfig,
  scoreManualLocations,
} = require('../lib/propertySourcing');
const {
  readSheetRows,
  readSheetValues,
} = require('../lib/googleSheets');

const router = express.Router();

const SHEET_TABS = ['台北','桃園','竹北','台中','台南','高雄'];
const REVIEW_TAB_NAME = '審查物件14件';

const REPORT = path.join(__dirname, '..', 'data', 'location-report.json');
const SCORING_CONFIG = path.join(__dirname, '..', 'data', 'property-scoring-config.json');

function manualResearchSheetId() {
  if (!process.env.MANUAL_RESEARCH_SHEET_ID) {
    throw new Error('MANUAL_RESEARCH_SHEET_ID is not configured');
  }

  return process.env.MANUAL_RESEARCH_SHEET_ID;
}

function readScoringConfig() {
  try {
    return mergeScoringConfig(JSON.parse(fs.readFileSync(SCORING_CONFIG, 'utf8')));
  } catch (error) {
    return mergeScoringConfig(null);
  }
}

function normalizeAddress(v = '') {
  return String(v)
    .replace(/^\d{3,6}/, '')
    .replace(/臺北市|台北市|新北市/g, '')
    .replace(/\s|,|，/g, '')
    .trim();
}

function normalizeFloor(v = '') {
  return String(v)
    .replace(/\s/g, '')
    .replace(/＋/g, '+')
    .toUpperCase();
}
function clean(v = '') {
  return String(v).trim();
}

function number(v = '') {
  const n = parseFloat(
    String(v).replace(/[^\d.-]/g, '')
  );
  return Number.isFinite(n) ? n : null;
}

function regionFromStation(station = '') {
  const s = String(station).trim();

  const newTaipei = [
    '板橋','府中','三重','林口','中和','永和','新店',
    '新埔','江子翠','蘆洲','淡水','新莊','土城',
    '景安','南勢角','頂溪','徐匯中學','菜寮'
  ];

  const taoyuan = [
    '桃園','中壢','青埔','高鐵桃園','A18','藝文特區',
    '內壢','龜山','南崁'
  ];

  const hsinchu = [
    '竹北','新竹','六家','高鐵新竹'
  ];

  const taichung = [
    '台中','臺中','市政府','水安宮','文心森林公園',
    '文心崇德','文華高中','豐樂公園','大慶'
  ];

  const tainan = [
    '台南','臺南','永康','南紡','安平'
  ];

  const kaohsiung = [
    '高雄','左營','巨蛋','美麗島','三多商圈',
    '中央公園','凹子底','鳳山'
  ];

  if (newTaipei.some(x => s.includes(x))) return '新北';
  if (taoyuan.some(x => s.includes(x))) return '桃園';
  if (hsinchu.some(x => s.includes(x))) return '竹北';
  if (taichung.some(x => s.includes(x))) return '台中';
  if (tainan.some(x => s.includes(x))) return '台南';
  if (kaohsiung.some(x => s.includes(x))) return '高雄';

  // 目前 Sheet 多數捷運站名屬台北
  if (s) return '台北';

  return '其他';
}

router.post('/api/location-sheet-sync', async (req, res) => {
  if (
    !process.env.LOCATION_SYNC_TOKEN ||
    req.headers.authorization !==
      `Bearer ${process.env.LOCATION_SYNC_TOKEN}`
  ) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // 讀取既有 AI research，避免同步 Sheet 時洗掉 AI 評語
    let oldLocations = [];

    if (fs.existsSync(REPORT)) {
      const old = JSON.parse(fs.readFileSync(REPORT, 'utf8'));
      oldLocations = old.locations || [];
    }

    const locations = [];
    const spreadsheetId = manualResearchSheetId();

for (const sheetName of SHEET_TABS) {
  const rows = await readSheetRows(spreadsheetId, sheetName);

  for (let index = 0; index < rows.length; index++) {
  const row = rows[index];

  if (!clean(row['リンク'])) continue;

  const mapLink = clean(row['リンク']);
  const station = clean(row['最寄り駅']);
  const floor = clean(row['フロア']);

  const old =
    oldLocations.find(x => x.mapLink === mapLink) ||
    oldLocations.find(x =>
      x.name === station &&
      x.floor === floor
    ) ||
    {};

  let resolvedMapUrl = old.resolvedMapUrl || '';
  let lat = old.lat || null;
  let lng = old.lng || null;
  let region = old.region || '';
  let address = old.address || '';

  try {
    resolvedMapUrl = await resolveGoogleMapsUrl(mapLink);

    const coords = extractCoordinates(resolvedMapUrl);

    if (!address) {
      address = extractAddressFromResolvedUrl(resolvedMapUrl);
    }

    if (coords) {
      lat = coords.lat;
      lng = coords.lng;
    }

    region =
      regionFromResolvedUrl(resolvedMapUrl) ||
      (Number.isFinite(lat) && Number.isFinite(lng) ? regionFromCoordinates(lat, lng) : '') ||
      old.region ||
      '其他';

  } catch (err) {
    console.error('[map enrichment]', mapLink, err.message);
  }

  locations.push({
    id: old.id || `${sheetName}-sheet-${index + 1}`,
    region: sheetName === "台北" ? (regionFromStation(station) === "新北" || /New Taipei City|新北市|板橋區|Banqiao District|中和區|三重區|永和區|林口區|新店區|新莊區|土城區/.test((address || "") + " " + (resolvedMapUrl || "")) ? "新北" : "台北") : sheetName,
    name: station || `物件 ${index + 1}`,
    station,
    mapLink,
    resolvedMapUrl,
    address,
    lat,
    lng,

    finder: clean(row['発見者']),
    floor,
    mrt: clean(row['アクセス']),
    rent: clean(row['家賃（TWD）']),
    managementFee: clean(row['管理費（TWD）']),
    rentJPY: clean(row['家賃+管理費（JPY）']),
    area: clean(row['坪数']) ? `${clean(row['坪数'])}坪` : '',
    areaPing: number(row['坪数']),
    rentPerPing: clean(row['坪単価']),
    signage: clean(row['看板']),
    competitionOriginal: clean(row['競合']),
    toshiScore: clean(row['とし評価']),
    nakamuraScore: clean(row['仲村評価']),
    videoLink: clean(row['動画link']),
    brokerAnswer: clean(row['不動産の回答']),

    aiScore: old.aiScore ?? null,
    aiReviewer: old.aiReviewer || 'chocoZAP Taiwan Assistant (AI)',
    status: old.status || '待 AI 評估',
    risk: old.risk || '待 AI 評估',
    missing: old.missing || '待 AI 評估',
    next: old.next || '待 AI 評估',
    aiComment: old.aiComment || '待 Agent 研究',
    competition: old.competition || '待 Agent 研究',
    trafficResearch: old.trafficResearch || '待 Agent 研究',

    mapQuery:
      lat && lng
        ? `${lat},${lng}`
        : mapLink,

    rejected: old.rejected || false
  });
}
}
    // ===== Review sheet enrichment =====
let reviewRows = [];

try {
  reviewRows = await readSheetValues(spreadsheetId, REVIEW_TAB_NAME);
} catch (error) {
  console.error('[review sheet sync]', error.message);
}

if (reviewRows.length) {

  locations.forEach(x => {
    x.underReview = false;
    delete x.reviewMeta;
  });

  const reviewOnly = [];
  let matched = 0;

  const reviewItems = reviewRows.filter(row =>
    row.some(v => clean(v) === '審查')
  );

  for (const row of reviewItems) {
    const values = row.map(v => clean(v));

    const urls = values.filter(v => /^https?:\/\//i.test(v));

    const reviewDate = values.find(v => /已評估/.test(v)) || '';

    const station =
      values.find(v =>
        /忠孝|中山|松山|石牌|菜寮|府中|板橋|新生|復興|A18|高鐵|文新|櫻花/.test(v)
      ) || '';

    const floor =
      values.find(v =>
        /^(1F|B1|1F\+2F|1F\+B1|1F\+2F\+3F)$/i.test(
          v.replace(/\s/g, '')
        )
      ) || '';

    const address =
      values.find(v =>
        /(?:區|市).*(?:路|街|巷|號)/.test(v)
      ) || '';

    const areaValue =
      values.find(v =>
        /^\d+(\.\d+)?$/.test(v) &&
        Number(v) >= 20 &&
        Number(v) <= 500
      );

    const area = areaValue ? Number(areaValue) : null;

    let target = null;

    // 1) URL exact match
    if (urls.length) {
      target = locations.find(x => {
        const hay = JSON.stringify(x);
        return urls.some(u => hay.includes(u));
      });
    }

    // 2) Address match
    if (!target && address) {
      target = locations.find(x =>
        normalizeAddress(x.address) &&
        normalizeAddress(x.address) === normalizeAddress(address)
      );
    }

    // 3) station + floor + area
    if (!target && station && floor) {
      target = locations.find(x =>
        clean(x.station) === station &&
        normalizeFloor(x.floor) === normalizeFloor(floor) &&
        (
          area === null ||
          x.areaPing === null ||
          Math.abs(Number(x.areaPing) - area) < 0.2
        )
      );
    }

    const meta = {
      reviewDate,
      reviewAddress: address,
      desiredRentTWD:
        values.find(v => /^NT\$/.test(v)) || '',
      finalDecision:
        values.find(v => /リリース|第一希望|第二希望|旗艦店/.test(v)) || '',
      reviewComment:
        values.find(v =>
          v.length > 20 &&
          !/^https?:\/\//i.test(v)
        ) || ''
    };

    if (target) {
      target.underReview = true;
      target.reviewMeta = meta;
      matched++;
      continue;
    }

    reviewOnly.push({
      id: `review-only-${reviewOnly.length + 1}`,
      underReview: true,
      reviewOnly: true,
      region:
        /桃園|A18|高鐵/.test(values.join(' ')) ? '桃園' :
        /文新|櫻花|台中/.test(values.join(' ')) ? '台中' :
        /菜寮|三重|新北/.test(values.join(' ')) ? '新北' :
        '其他',
      name: station || '審查物件',
      station,
      address,
      floor,
      areaPing: area,
      rent: values.find(v => /^NT\$/.test(v)) || '',
      reviewMeta: meta,
      rawReviewRow: values
    });
  }

  console.log(
    `[review sync] total=${reviewItems.length} matched=${matched} reviewOnly=${reviewOnly.length}`
  );

  global.__reviewOnly = reviewOnly;
}

    const scoringConfig = readScoringConfig();
    const scoredLocations = scoreManualLocations(locations, scoringConfig);
    const scoredReviewOnly = scoreManualLocations(global.__reviewOnly || [], scoringConfig);

    const output = {
      updatedAt: new Date().toISOString(),
      updatedBy: 'Google Sheet Sync',
      count: scoredLocations.length,
      locations: scoredLocations,
      reviewOnly: scoredReviewOnly
    };

    fs.writeFileSync(
      REPORT,
      JSON.stringify(output, null, 2),
      'utf8'
    );

    res.json({
      ok: true,
      count: locations.length,
      updatedAt: output.updatedAt
    });

  } catch (err) {
    console.error('[location-sheet-sync]', err);

    res.status(500).json({
      error: 'sync_failed',
      message: err.message
    });
  }
});

module.exports = router;
