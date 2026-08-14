const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const FILE = path.join(__dirname, '..', 'data', 'location-report.json');

const sleep = ms => new Promise(r => setTimeout(r, ms));

function looksLikeRealAddress(s = '') {
  return (
    /[路街巷弄號]/.test(s) ||
    /\b(No\.|Rd|Road|St|Street|Section|District)\b/i.test(s)
  );
}

async function reverseGeocode(lat, lng) {
  const url =
    `https://nominatim.openstreetmap.org/reverse` +
    `?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=zh-TW`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'chocoZAP-Taiwan-Location-Tracker/1.0'
    }
  });

  if (!res.ok) {
    throw new Error(`Nominatim HTTP ${res.status}`);
  }

  return res.json();
}

(async () => {
  const report = JSON.parse(fs.readFileSync(FILE, 'utf8'));

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < report.locations.length; i++) {
    const x = report.locations[i];

    if (looksLikeRealAddress(x.address)) {
      x.addressSource = x.addressSource || 'google_maps_url';
      skipped++;
      continue;
    }

    if (!Number.isFinite(x.lat) || !Number.isFinite(x.lng)) {
      console.log(`[${i + 1}] NO COORDS ${x.name}`);
      failed++;
      continue;
    }

    try {
      console.log(`[${i + 1}/${report.locations.length}] ${x.name}`);

      const geo = await reverseGeocode(x.lat, x.lng);

      if (geo && geo.display_name) {
        x.address = geo.display_name;
        x.addressSource = 'nominatim_reverse';
        x.addressUpdatedAt = new Date().toISOString();

        updated++;

        fs.writeFileSync(
          FILE,
          JSON.stringify(report, null, 2),
          'utf8'
        );
      }

      // Nominatim public service: keep requests slow
      await sleep(1100);

    } catch (err) {
      console.error('FAILED:', x.name, err.message);
      failed++;
      await sleep(2000);
    }
  }

  report.updatedAt = new Date().toISOString();

  fs.writeFileSync(
    FILE,
    JSON.stringify(report, null, 2),
    'utf8'
  );

  console.log({
    total: report.locations.length,
    updated,
    skipped,
    failed
  });
})();
