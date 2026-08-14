const fetch = require('node-fetch');

async function resolveGoogleMapsUrl(shortUrl) {
  if (!shortUrl) return null;

  // 地址文字、座標文字，不丟給 fetch
  if (!/^https?:\/\//i.test(shortUrl)) {
    return shortUrl;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const res = await fetch(shortUrl, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });

    return res.url || shortUrl;

  } catch (err) {
    console.error('[maps resolve]', shortUrl, err.message);
    return shortUrl;

  } finally {
    clearTimeout(timeout);
  }
}

function extractCoordinates(url = '') {
  const patterns = [
    /@(-?\d+\.\d+),(-?\d+\.\d+)/,
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
    /query=(-?\d+\.\d+)%2C(-?\d+\.\d+)/,
    /q=(-?\d+\.\d+),(-?\d+\.\d+)/
  ];

  for (const pattern of patterns) {
    const m = url.match(pattern);

    if (m) {
      return {
        lat: Number(m[1]),
        lng: Number(m[2])
      };
    }
  }

  return null;
}

function regionFromResolvedUrl(url = '') {
  const decoded = decodeURIComponent(url);

  if (/Taipei City|台北市|臺北市/i.test(decoded)) return '台北';
  if (/New Taipei City|新北市/i.test(decoded)) return '新北';
  if (/Taoyuan City|桃園市/i.test(decoded)) return '桃園';
  if (/Hsinchu County|新竹縣|竹北市/i.test(decoded)) return '竹北';
  if (/Taichung City|台中市|臺中市/i.test(decoded)) return '台中';
  if (/Tainan City|台南市|臺南市/i.test(decoded)) return '台南';
  if (/Kaohsiung City|高雄市/i.test(decoded)) return '高雄';

  return '';
}

/*
 * 台灣這幾個展店城市可用座標做第一層分類。
 * 後續再用 Google Places / Geocoding 地址確認。
 */
function regionFromCoordinates(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return '';
  }

  // 台北市
  if (
    lat >= 24.95 && lat <= 25.22 &&
    lng >= 121.43 && lng <= 121.67
  ) return '台北';

  // 新北市（粗略範圍，台北盆地會重疊，因此之後要由地址精修）
  if (
    lat >= 24.75 && lat <= 25.32 &&
    lng >= 121.25 && lng <= 122.02
  ) return '新北';

  // 桃園
  if (
    lat >= 24.75 && lat <= 25.15 &&
    lng >= 120.95 && lng <= 121.35
  ) return '桃園';

  // 竹北
  if (
    lat >= 24.78 && lat <= 24.95 &&
    lng >= 120.90 && lng <= 121.10
  ) return '竹北';

  // 台中
  if (
    lat >= 24.00 && lat <= 24.35 &&
    lng >= 120.45 && lng <= 120.85
  ) return '台中';

  // 台南
  if (
    lat >= 22.85 && lat <= 23.20 &&
    lng >= 120.05 && lng <= 120.40
  ) return '台南';

  // 高雄
  if (
    lat >= 22.45 && lat <= 22.90 &&
    lng >= 120.15 && lng <= 120.50
  ) return '高雄';

  return '其他';
}

module.exports = {
  resolveGoogleMapsUrl,
  extractCoordinates,
  regionFromCoordinates,
  regionFromResolvedUrl,
  extractAddressFromResolvedUrl
};

function extractAddressFromResolvedUrl(url = '') {
  try {
    const decoded = decodeURIComponent(url);

    const m = decoded.match(/\/maps\/place\/([^/@?]+)/i);
    if (!m) return '';

    return m[1]
      .replace(/\+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  } catch {
    return '';
  }
}
