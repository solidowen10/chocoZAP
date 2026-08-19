"use strict";

(() => {
  const SCRIPT_VERSION = "0.2.1";

  if (window.__radar591ContentScriptVersion === SCRIPT_VERSION) {
    console.debug("[591-radar] Content script already loaded.");
    return;
  }

  window.__radar591ContentScriptVersion = SCRIPT_VERSION;

  const DEBUG_PREFIX = "[591-radar]";
  const RENT_HOST = "rent.591.com.tw";
  const BUSINESS_HOST = "business.591.com.tw";

  const CITY_NAMES = [
    "台北市",
    "臺北市",
    "新北市",
    "桃園市",
    "台中市",
    "臺中市",
    "台南市",
    "臺南市",
    "高雄市",
    "基隆市",
    "新竹市",
    "嘉義市",
    "新竹縣",
    "苗栗縣",
    "彰化縣",
    "南投縣",
    "雲林縣",
    "嘉義縣",
    "屏東縣",
    "宜蘭縣",
    "花蓮縣",
    "台東縣",
    "臺東縣",
    "澎湖縣",
    "金門縣",
    "連江縣",
  ];

  const REGION_CITY_MAP = {
    "1": "台北市",
  };

  const TAIPEI_DISTRICTS = [
    "中正區",
    "大同區",
    "中山區",
    "松山區",
    "大安區",
    "萬華區",
    "信義區",
    "士林區",
    "北投區",
    "內湖區",
    "南港區",
    "文山區",
  ];

  const DISTRICTS_BY_CITY = {
    台北市: TAIPEI_DISTRICTS,
    新北市: [
      "板橋區",
      "三重區",
      "中和區",
      "永和區",
      "新莊區",
      "新店區",
      "土城區",
      "蘆洲區",
      "樹林區",
      "汐止區",
      "鶯歌區",
      "三峽區",
      "淡水區",
      "瑞芳區",
      "五股區",
      "泰山區",
      "林口區",
      "深坑區",
      "石碇區",
      "坪林區",
      "三芝區",
      "石門區",
      "八里區",
      "平溪區",
      "雙溪區",
      "貢寮區",
      "金山區",
      "萬里區",
      "烏來區",
    ],
    桃園市: [
      "桃園區",
      "中壢區",
      "平鎮區",
      "八德區",
      "楊梅區",
      "蘆竹區",
      "大溪區",
      "龍潭區",
      "龜山區",
      "大園區",
      "觀音區",
      "新屋區",
      "復興區",
    ],
    台中市: [
      "中區",
      "東區",
      "南區",
      "西區",
      "北區",
      "北屯區",
      "西屯區",
      "南屯區",
      "太平區",
      "大里區",
      "霧峰區",
      "烏日區",
      "豐原區",
      "后里區",
      "石岡區",
      "東勢區",
      "和平區",
      "新社區",
      "潭子區",
      "大雅區",
      "神岡區",
      "大肚區",
      "沙鹿區",
      "龍井區",
      "梧棲區",
      "清水區",
      "大甲區",
      "外埔區",
      "大安區",
    ],
    台南市: [
      "中西區",
      "東區",
      "南區",
      "北區",
      "安平區",
      "安南區",
      "永康區",
      "歸仁區",
      "新化區",
      "左鎮區",
      "玉井區",
      "楠西區",
      "南化區",
      "仁德區",
      "關廟區",
      "龍崎區",
      "官田區",
      "麻豆區",
      "佳里區",
      "西港區",
      "七股區",
      "將軍區",
      "學甲區",
      "北門區",
      "新營區",
      "後壁區",
      "白河區",
      "東山區",
      "六甲區",
      "下營區",
      "柳營區",
      "鹽水區",
      "善化區",
      "大內區",
      "山上區",
      "新市區",
      "安定區",
    ],
    高雄市: [
      "楠梓區",
      "左營區",
      "鼓山區",
      "三民區",
      "鹽埕區",
      "前金區",
      "新興區",
      "苓雅區",
      "前鎮區",
      "旗津區",
      "小港區",
      "鳳山區",
      "林園區",
      "大寮區",
      "大樹區",
      "大社區",
      "仁武區",
      "鳥松區",
      "岡山區",
      "橋頭區",
      "燕巢區",
      "田寮區",
      "阿蓮區",
      "路竹區",
      "湖內區",
      "茄萣區",
      "永安區",
      "彌陀區",
      "梓官區",
      "旗山區",
      "美濃區",
      "六龜區",
      "甲仙區",
      "杉林區",
      "內門區",
      "茂林區",
      "桃源區",
      "那瑪夏區",
    ],
  };

  const BUSINESS_TYPES = [
    "商業街店面",
    "路邊/臨街門面",
    "社區底商",
    "店辦",
    "辦公",
    "店面",
    "商辦",
    "辦公室",
    "廠辦",
  ];

  const PROPERTY_TYPES = [
    "整層住家",
    "獨立套房",
    "分租套房",
    "雅房",
    "店面",
    "辦公",
    "住辦",
    "廠房",
    "土地",
    "其他",
  ];

  const NON_LISTING_CONTEXT_SELECTOR = [
    ".t5-carousel__item",
    ".community-card-info",
    "[class*=\"community-card\" i]",
    "[class*=\"broker-card\" i]",
    "[class*=\"broker-item\" i]",
    "[class*=\"agent-card\" i]",
    "[class*=\"agent-item\" i]",
    "[class*=\"recommend-agent\" i]",
    "[class*=\"consultant\" i]",
  ].join(",");

  const INTERNAL_CARD_PART_SELECTOR = [
    ".content",
    ".item-info-flex",
    ".item-info-left",
    ".item-info-title",
    "[class*=\"item-info\" i]",
    "[class*=\"info-left\" i]",
    "[class*=\"info-title\" i]",
  ].join(",");

  const CARD_ROOT_HINT_SELECTOR = [
    ".recommend-ware",
    "[data-houseid]",
    "[houseid]",
    "[data-house-id]",
    "[data-rent-id]",
    "[class*=\"vue-list-rent-item\" i]",
    "[class*=\"rent-list-item\" i]",
    "[class*=\"house-list-item\" i]",
    "[class*=\"list-item\" i]",
    "[class*=\"rent-item\" i]",
    "[class*=\"house-item\" i]",
    "article",
    "li",
  ].join(",");

  const TITLE_SELECTORS = [
    ".title",
    ".item-info-title",
    "[class*=\"item-title\" i]",
    "[class*=\"house-title\" i]",
    "[class*=\"title\" i]",
    "h1",
    "h2",
    "h3",
    "h4",
    "a[href]",
  ];

  const ADDRESS_SELECTORS = [
    "[class*=\"address\" i]",
    "[class*=\"addr\" i]",
    "[class*=\"location\" i]",
    "[class*=\"position\" i]",
    "[class*=\"street\" i]",
    "[class*=\"area\" i]",
  ];

  const RENT_SELECTORS = [
    "[class*=\"price\" i]",
    "[class*=\"rent-price\" i]",
    "[class*=\"item-price\" i]",
    "[class*=\"house-price\" i]",
    "[class*=\"money\" i]",
    "[class*=\"amount\" i]",
  ];

  function normalizeWhitespace(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t\r\f\v]+/g, " ")
      .replace(/\n\s+/g, "\n")
      .trim();
  }

  function compactText(value) {
    return normalizeWhitespace(value).replace(/\s+/g, "");
  }

  function unique(values) {
    return Array.from(new Set(values.filter(Boolean)));
  }

  function classNameOf(element) {
    return typeof element.className === "string"
      ? element.className
      : element.getAttribute("class") || "";
  }

  function isVisibleElement(element) {
    if (!(element instanceof Element)) return false;

    const style = window.getComputedStyle(element);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      Number(style.opacity) === 0
    ) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function toAbsoluteUrl(value) {
    const raw = normalizeWhitespace(value);
    if (!raw || raw.startsWith("javascript:")) return null;

    try {
      return new URL(raw, window.location.href).href;
    } catch (error) {
      return null;
    }
  }

  function getElementText(element) {
    return normalizeWhitespace(element?.innerText || element?.textContent || "");
  }

  function getTextLines(element) {
    return unique(
      getElementText(element)
        .split(/\n+/)
        .map((line) => normalizeWhitespace(line))
        .filter(Boolean),
    );
  }

  function normalizeCityName(city) {
    return city ? city.replace(/^臺/, "台") : null;
  }

  function isRentHost(hostname) {
    return hostname === RENT_HOST;
  }

  function isBusinessHost(hostname) {
    return hostname === BUSINESS_HOST;
  }

  function parseRentListingHref(href) {
    const absoluteUrl = toAbsoluteUrl(href);
    if (!absoluteUrl) return null;

    let parsedUrl;
    try {
      parsedUrl = new URL(absoluteUrl);
    } catch (error) {
      return null;
    }

    if (!isRentHost(parsedUrl.hostname)) return null;

    const pathParts = parsedUrl.pathname.split("/").filter(Boolean);
    if (pathParts.length !== 1 || !/^\d{5,}$/.test(pathParts[0])) return null;

    return {
      id: pathParts[0],
      url: parsedUrl.href,
    };
  }

  function parseBusinessListingHref(href) {
    const absoluteUrl = toAbsoluteUrl(href);
    if (!absoluteUrl) return null;

    let parsedUrl;
    try {
      parsedUrl = new URL(absoluteUrl);
    } catch (error) {
      return null;
    }

    if (!isBusinessHost(parsedUrl.hostname)) return null;

    const pathParts = parsedUrl.pathname.split("/").filter(Boolean);

    if (
      pathParts.length !== 2 ||
      pathParts[0] !== "rent" ||
      !/^\d{5,}$/.test(pathParts[1])
    ) {
      return null;
    }

    return {
      id: pathParts[1],
      url: parsedUrl.href,
    };
  }

  function parse591ListingHref(href) {
    return parseRentListingHref(href) || parseBusinessListingHref(href);
  }

  function closestNonListingContext(element) {
    return element.closest(NON_LISTING_CONTEXT_SELECTOR);
  }

  function isInternalCardPart(element) {
    return element.matches(INTERNAL_CARD_PART_SELECTOR);
  }

  function legalRentAnchorsIn(element) {
    const anchors = [
      ...(element.matches("a[href]") ? [element] : []),
      ...Array.from(element.querySelectorAll("a[href]")),
    ];

    return anchors
      .map((anchor) => ({ anchor, listing: parse591ListingHref(anchor.getAttribute("href")) }))
      .filter((item) => item.listing && !closestNonListingContext(item.anchor));
  }

  function legalListingIdsIn(element) {
    return unique(legalRentAnchorsIn(element).map((item) => item.listing.id));
  }

  function collectCandidateAnchors() {
    const allAnchors = Array.from(document.querySelectorAll("a[href]"));
    const candidateAnchors = [];
    let excludedNonListing = 0;

    for (const anchor of allAnchors) {
      const href = anchor.getAttribute("href");
      const absoluteUrl = toAbsoluteUrl(href);
      if (!absoluteUrl || !/591\.com\.tw/i.test(absoluteUrl)) continue;

      const listing = parse591ListingHref(href);
      const excludedContext = closestNonListingContext(anchor);

      if (!listing || excludedContext) {
        excludedNonListing += 1;
        continue;
      }

      candidateAnchors.push({ anchor, id: listing.id, url: listing.url });
    }

    return { candidateAnchors, excludedNonListing };
  }

  function rootClassLooksUseful(element) {
    const className = classNameOf(element);
    return /(recommend-ware|vue-list-rent-item|rent-list-item|house-list-item|list-item|rent-item|house-item|item|card)/i.test(
      className,
    );
  }

  function rootClassLooksWrong(element) {
    const className = classNameOf(element);
    return /(item-info|info-left|info-title|community|broker|agent|carousel|avatar|portrait)/i.test(
      className,
    );
  }

  function hasLikelyListingImage(element) {
    return Array.from(element.querySelectorAll("img")).some((image) => isLikelyListingImage(image));
  }

  function scoreRootCandidate(element, listingId) {
    if (!(element instanceof Element) || element === document.body) return -Infinity;
    if (!isVisibleElement(element)) return -Infinity;
    if (closestNonListingContext(element) === element) return -Infinity;
    if (rootClassLooksWrong(element) || isInternalCardPart(element)) return -100;

    const ids = legalListingIdsIn(element);
    if (!ids.includes(listingId) || ids.length !== 1) return -Infinity;

    const text = getElementText(element);
    const textLength = text.length;
    if (textLength < 20 || textLength > 2600) return -Infinity;

    let score = 0;
    if (element.matches(CARD_ROOT_HINT_SELECTOR)) score += 4;
    if (rootClassLooksUseful(element)) score += 3;
    if (hasLikelyListingImage(element)) score += 3;
    if (/(元|萬|\/月|月租|租金)/.test(text)) score += 2;
    if (/\d+(?:\.\d+)?\s*坪/.test(text)) score += 2;
    if (/(?:B\d+|\d+F|\d+樓|地下|整棟)/i.test(text)) score += 1;
    if (PROPERTY_TYPES.some((type) => compactText(text).includes(type))) score += 1;
    if (/(?:區[-－\s]?|路|街|巷|弄|大道|段)/.test(text)) score += 1;

    const rect = element.getBoundingClientRect();
    if (rect.width >= 280 && rect.height >= 90) score += 2;
    if (textLength > 1800) score -= 2;

    return score;
  }

  function findRootContainer(anchor, listingId) {
    const candidates = [];
    let current = anchor;

    for (let depth = 0; current && depth < 12; depth += 1) {
      if (!(current instanceof Element) || current === document.body) break;
      const score = scoreRootCandidate(current, listingId);
      if (Number.isFinite(score) && score > -100) {
        candidates.push({
          element: current,
          score,
          depth,
          textLength: getElementText(current).length,
        });
      }
      current = current.parentElement;
    }

    candidates.sort((a, b) => {
      const scoreDelta = b.score - a.score;
      if (Math.abs(scoreDelta) >= 2) return scoreDelta;
      return b.depth - a.depth || b.textLength - a.textLength;
    });

    return candidates[0]?.element || null;
  }

  function choosePrimaryAnchor(root, listingId) {
    const anchors = legalRentAnchorsIn(root)
      .filter((item) => item.listing.id === listingId)
      .map((item) => item.anchor);

    return anchors
      .slice()
      .sort((a, b) => getElementText(b).length - getElementText(a).length)[0] || null;
  }

  function isMetadataLine(line) {
    const compact = compactText(line);
    if (!compact) return true;
    if (/^(收藏|分享|查看|詳情|照片|影片|屋主|仲介|更新|今日|昨日|廣告|立即聯絡)$/u.test(compact)) {
      return true;
    }
    if (/^\d+(?:\.\d+)?坪$/.test(compact)) return true;
    if (/^\d+(?:\.\d+)?萬?(?:元|\/月|月)$/.test(compact)) return true;
    if (/^\(?租金含車位租金\)?$/.test(compact)) return true;
    if (/^(?:B?\d+F?|地下\d*樓?|整棟)(?:\/(?:B?\d+F?|\d+樓))?$/.test(compact)) {
      return true;
    }

    return false;
  }

  function titleScore(value) {
    const text = normalizeWhitespace(value);
    if (!text || text.length < 2 || text.length > 140 || isMetadataLine(text)) return -100;

    let score = 0;
    if (/[\u4e00-\u9fff]/u.test(text)) score += 2;
    if (/(出租|租|近|路|街|商圈|捷運|醒目|黃金|角間|一樓|1樓|1F|工作室|電梯|陽台)/i.test(text)) {
      score += 1;
    }
    if (PROPERTY_TYPES.some((type) => text.includes(type))) score += 1;
    if (/(元|萬|坪|樓層|管理費|押金|刊登|更新|距離|屋主|仲介|照片|影片|租金含車位)/.test(text)) {
      score -= 3;
    }
    if (text.length >= 8) score += 1;

    return score;
  }

  function extractTitle(root, primaryAnchor, lines) {
    const candidates = [];

    const isBusinessCard =
      root.classList.contains("recommend-ware") ||
      root.querySelector("a[href*='business.591.com.tw/rent/']");

    if (isBusinessCard) {
      const businessTitle = root.querySelector("a.title")?.innerText?.trim();
      if (businessTitle) {
        return businessTitle;
      }
    }

    for (const selector of TITLE_SELECTORS) {
      const elements = Array.from(root.querySelectorAll(selector)).slice(0, 12);
      for (const element of elements) {
        if (element.matches("img, svg")) continue;
        candidates.push(getElementText(element));
      }
    }

    if (primaryAnchor) candidates.push(getElementText(primaryAnchor));
    candidates.push(...lines);

    const scored = unique(candidates)
      .map((value) => ({ value: normalizeWhitespace(value), score: titleScore(value) }))
      .filter((item) => item.score > -100)
      .sort((a, b) => b.score - a.score || b.value.length - a.value.length);

    return scored[0]?.value || null;
  }

  function extractBusinessType(root) {
    const text = getElementText(root);

    return BUSINESS_TYPES.find(type =>
      text.includes(type)
    ) || null;
  }

  function extractPageCity() {
    const title = normalizeWhitespace(document.title);
    for (const city of CITY_NAMES) {
      if (title.includes(city)) return normalizeCityName(city);
    }

    const region = new URLSearchParams(window.location.search).get("region");
    if (region && REGION_CITY_MAP[region]) return REGION_CITY_MAP[region];

    const selectedText = Array.from(
      document.querySelectorAll(
        "[class*=\"city\" i], [class*=\"region\" i], [class*=\"area\" i], [class*=\"filter\" i], [class*=\"selected\" i]",
      ),
    )
      .slice(0, 80)
      .map((element) => getElementText(element))
      .join(" ");

    for (const city of CITY_NAMES) {
      if (selectedText.includes(city)) return normalizeCityName(city);
    }

    return null;
  }

  function collectAddressTexts(root, lines) {
    const addressTexts = [];

    for (const selector of ADDRESS_SELECTORS) {
      for (const element of Array.from(root.querySelectorAll(selector)).slice(0, 20)) {
        const text = getElementText(element);
        if (text) addressTexts.push(text);
      }
    }

    for (const line of lines) {
      if (/(?:區\s*[-－]|區-|路|街|巷|弄|大道|段)/.test(compactText(line))) {
        addressTexts.push(line);
      }
    }

    return unique(addressTexts);
  }

  function allKnownDistricts() {
    return unique(Object.values(DISTRICTS_BY_CITY).flat());
  }

  function districtPoolForCity(city) {
    const cityDistricts = city ? DISTRICTS_BY_CITY[normalizeCityName(city)] || [] : [];
    return cityDistricts.length ? cityDistricts : allKnownDistricts();
  }

  function extractDistrictFromTexts(texts, city) {
    const districtPool = districtPoolForCity(city);

    for (const text of texts) {
      const compact = compactText(text);
      const knownDistrict = districtPool.find((district) => compact.includes(district));
      if (knownDistrict) return knownDistrict;
    }

    return null;
  }

  function extractDistrict(root, lines, city) {
    const addressTexts = collectAddressTexts(root, lines);
    const addressDistrict = extractDistrictFromTexts(addressTexts, city);
    if (addressDistrict) return addressDistrict;

    return extractDistrictFromTexts(lines, city);
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function extractAddressFromText(value, city) {
    const compact = compactText(value);
    if (!compact) return null;

    const district = districtPoolForCity(city).find((name) => compact.includes(name));
    if (!district) return null;

    const tail = compact.slice(compact.indexOf(district));
    const pattern = new RegExp(
      `^(${escapeRegExp(district)})[-－–—\\s]*` +
        "(.{1,40}?(?:大道|路|街|巷|弄)(?:[一二三四五六七八九十\\d]+段)?(?:\\d+巷)?(?:\\d+弄)?(?:\\d+號)?)",
    );
    const match = tail.match(pattern);
    if (!match) return null;

    return `${match[1]}-${match[2]}`;
  }

  function extractAddressFromTexts(texts, city) {
    const candidates = [];

    for (const text of texts) {
      candidates.push(
        ...String(text || "")
          .split(/\n+|[｜|]/)
          .map((line) => normalizeWhitespace(line)),
      );
    }

    for (const candidate of unique(candidates)) {
      const address = extractAddressFromText(candidate, city);
      if (address) return address;
    }

    return null;
  }

  function extractAddress(root, lines, city) {
    return extractAddressFromTexts(collectAddressTexts(root, lines), city);
  }

  function parseNearbyDistanceText(value) {
    const text = normalizeWhitespace(value).replace(/\s+/g, " ");
    if (!text || !/距(?:離)?/.test(text)) return null;

    const match = text.match(
      /距(?:離)?\s*(?:捷運)?\s*([\u4e00-\u9fffA-Za-z0-9/＋+・．.\-]{1,24}?)(?:站)?\s*(\d{1,5}(?:,\d{3})?)\s*(?:公尺|米|m)/i,
    );
    if (!match) return null;

    const place = normalizeWhitespace(match[1])
      .replace(/^捷運/, "")
      .replace(/站$/, "");
    const distance = Number.parseInt(match[2].replace(/,/g, ""), 10);

    if (!place || !Number.isFinite(distance)) return null;
    return {
      nearby_place: place,
      nearby_distance_m: distance,
    };
  }

  function extractNearbyEvidence(lines, allText) {
    for (const text of [...lines, allText]) {
      const evidence = parseNearbyDistanceText(text);
      if (evidence) return evidence;
    }

    return {
      nearby_place: null,
      nearby_distance_m: null,
    };
  }

  function normalizeRentNumber(value) {
    return Number.parseFloat(String(value || "").replace(/,/g, ""));
  }

  function monthlyRentCandidatesFromText(value) {
    const originalText = compactText(value);
    const candidates = [];
    const wanMatches = Array.from(originalText.matchAll(/(\d+(?:,\d{3})*(?:\.\d+)?)\s*萬\s*(?:元)?\s*\/\s*月/g));
    for (const match of wanMatches) {
      const amount = normalizeRentNumber(match[1]);
      if (Number.isFinite(amount) && amount > 0) {
        candidates.push({
          amount: Math.round(amount * 10000),
          index: match.index,
          raw: match[0],
        });
      }
    }

    const yuanMatches = Array.from(
      originalText.matchAll(/(?:NT\$|NTD|\$)?\s*(\d{1,3}(?:,\d{3})+|\d{4,9})\s*元\s*\/\s*月/gi),
    );
    for (const match of yuanMatches) {
      const amount = normalizeRentNumber(match[1]);
      if (Number.isFinite(amount) && amount > 0) {
        candidates.push({
          amount: Math.round(amount),
          index: match.index,
          raw: match[0],
        });
      }
    }

    return candidates.sort((a, b) => a.index - b.index);
  }

  function feeMarkerIndex(value) {
    const compact = compactText(value);
    const match = compact.match(/額外費用|管理費|押金|服務費|仲介費|清潔費|水費|電費|瓦斯費|車位費|車位租金/);
    return match ? match.index : -1;
  }

  function parseMonthlyRentText(value) {
    const text = compactText(value);
    if (!text) return null;

    const feeIndex = feeMarkerIndex(text);
    const primaryScope = feeIndex >= 0 ? text.slice(0, feeIndex) : text;
    const primaryCandidates = monthlyRentCandidatesFromText(primaryScope);
    if (primaryCandidates.length) return primaryCandidates[0].amount;

    const candidates = monthlyRentCandidatesFromText(text).filter((candidate) => {
      const contextBefore = text.slice(Math.max(0, candidate.index - 18), candidate.index);
      return feeMarkerIndex(contextBefore) === -1;
    });

    return candidates[0]?.amount || null;
  }

  function parseLooseRentText(value) {
    const text = compactText(value);
    if (!text || feeMarkerIndex(text) === 0 || /(降|省|折|優惠)/.test(text)) return null;

    const wanMatch = text.match(/(\d+(?:,\d{3})*(?:\.\d+)?)\s*萬(?:元)?/);
    if (wanMatch) {
      const amount = normalizeRentNumber(wanMatch[1]);
      if (Number.isFinite(amount) && amount > 0) return Math.round(amount * 10000);
    }

    const yuanMatch = text.match(/(?:租金|月租|價格|租)\D{0,8}(\d{1,3}(?:,\d{3})+|\d{5,9})\s*元/);
    if (yuanMatch) {
      const amount = normalizeRentNumber(yuanMatch[1]);
      if (Number.isFinite(amount) && amount >= 10000) return Math.round(amount);
    }

    return null;
  }

  function collectRentElementTexts(root) {
    const texts = [];

    for (const selector of RENT_SELECTORS) {
      for (const element of Array.from(root.querySelectorAll(selector)).slice(0, 20)) {
        const text = getElementText(element);
        if (/元\s*\/\s*月|萬\s*(?:元)?\s*\/\s*月/.test(text)) texts.push(text);
      }
    }

    return unique(texts);
  }

  function extractRent(root, lines, allText) {
    for (const text of collectRentElementTexts(root)) {
      const rent = parseMonthlyRentText(text);
      if (rent !== null) return rent;
    }

    const monthlyLines = lines.filter((line) => /元\s*\/\s*月|萬\s*(?:元)?\s*\/\s*月/.test(line));
    for (const line of [...monthlyLines, allText]) {
      const rent = parseMonthlyRentText(line);
      if (rent !== null) return rent;
    }

    const looseLines = lines.filter(
      (line) => /(租金|月租|價格|租).*(元|萬)/.test(line) && !/(額外費用|管理費|押金|服務費|仲介費)/.test(line),
    );
    for (const line of looseLines) {
      const rent = parseLooseRentText(line);
      if (rent !== null) return rent;
    }

    return parseLooseRentText(allText);
  }

  function parseAreaText(value) {
    const matches = Array.from(String(value || "").matchAll(/(\d+(?:\.\d+)?)\s*坪/g));
    for (const match of matches) {
      const area = Number.parseFloat(match[1]);
      if (Number.isFinite(area) && area > 0) return area;
    }

    return null;
  }

  function extractArea(lines, allText) {
    const preferredLines = lines.filter(
      (line) => /坪/.test(line) && !/(元|萬|租金|月租|押金|管理費|服務費|仲介費)/.test(line),
    );

    for (const line of [...preferredLines, allText]) {
      const area = parseAreaText(line);
      if (area !== null) return area;
    }

    return null;
  }

  function normalizeFloorText(value) {
    return normalizeWhitespace(value).replace(/\s+/g, "").replace(/f/g, "F");
  }

  function extractFloorText(lines, allText) {
    const patterns = [
      /((?:B\d+|\d+)F(?:~(?:B\d+|\d+)F)?\/(?:B?\d+|\d+)F)/i,
      /((?:地下\d*樓?|B\d+|\d+樓)(?:~(?:地下\d*樓?|B\d+|\d+樓))?\/(?:地下\d*樓?|B?\d+樓?))/i,
      /((?:B\d+|\d+)F)/i,
    ];

    for (const text of [...lines, allText]) {
      if (!/(樓|F|B\d|地下)/i.test(text)) continue;

      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) return normalizeFloorText(match[1]);
      }
    }

    return null;
  }

  function extractPropertyType(lines) {
    const compactLines = lines.map((line) => compactText(line));

    for (const line of compactLines) {
      const explicitMatch = line.match(/(?:類型|型態|用途)[:：]?(.{1,18})/);
      if (explicitMatch) {
        const type = PROPERTY_TYPES.find((value) => explicitMatch[1].includes(value));
        if (type) return type;
      }
    }

    for (const line of compactLines) {
      const type = PROPERTY_TYPES.find((value) => line.startsWith(value));
      if (!type) continue;

      if (
        line === type ||
        /(?:房|廳|衛|坪|樓|F|\/|透天|別墅|公寓|電梯|華廈|大樓|其他)/i.test(
          line.slice(type.length),
        )
      ) {
        return type;
      }
    }

    return null;
  }

  function firstUrlFromSrcset(srcset) {
    if (!srcset) return null;
    const first = srcset.split(",")[0]?.trim().split(/\s+/)[0];
    return first || null;
  }

  function imageUrlFromElement(image) {
    return toAbsoluteUrl(
      image.currentSrc ||
        image.getAttribute("src") ||
        image.getAttribute("data-src") ||
        image.getAttribute("data-original") ||
        image.getAttribute("data-lazy") ||
        firstUrlFromSrcset(image.getAttribute("srcset")) ||
        firstUrlFromSrcset(image.getAttribute("data-srcset")),
    );
  }

  function isLikelyListingImage(image) {
    if (!(image instanceof HTMLImageElement)) return false;
    if (image.closest(NON_LISTING_CONTEXT_SELECTOR)) return false;

    const className = classNameOf(image);
    const alt = image.getAttribute("alt") || "";
    const src = imageUrlFromElement(image) || "";
    const markerText = `${className} ${alt} ${src}`;

    if (/(avatar|portrait|broker|agent|user|head|face|member)/i.test(markerText)) {
      return false;
    }

    const rect = image.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0 && (rect.width < 70 || rect.height < 55)) {
      return false;
    }

    return Boolean(src && !src.startsWith("data:"));
  }

  function scoreImage(image) {
    const rect = image.getBoundingClientRect();
    const className = classNameOf(image);
    const alt = image.getAttribute("alt") || "";
    const src = imageUrlFromElement(image) || "";
    let score = 0;

    if (/(cover|photo|pic|image|thumb|house|rent)/i.test(`${className} ${alt} ${src}`)) {
      score += 4;
    }
    if (rect.width > 0 && rect.height > 0) {
      score += Math.min((rect.width * rect.height) / 10000, 8);
      if (rect.width >= rect.height) score += 1;
    }
    if (/(avatar|portrait|broker|agent|user|head|face|member)/i.test(`${className} ${alt} ${src}`)) {
      score -= 10;
    }

    return score;
  }

  function extractThumbnailUrl(root) {
    const candidates = Array.from(root.querySelectorAll("img"))
      .filter((image) => isLikelyListingImage(image))
      .map((image) => ({
        image,
        url: imageUrlFromElement(image),
        score: scoreImage(image),
      }))
      .filter((item) => item.url);

    candidates.sort((a, b) => b.score - a.score);
    return candidates[0]?.url || null;
  }

  function parseListing(root, anchorInfo, scrapedAt, pageCity) {
    const lines = getTextLines(root);
    const allText = getElementText(root);
    const primaryAnchor = choosePrimaryAnchor(root, anchorInfo.id) || anchorInfo.anchor;
    const title = extractTitle(root, primaryAnchor, lines);
    const city = pageCity;
    const nearbyEvidence = extractNearbyEvidence(lines, allText);

    return {
      source: "591",
      source_listing_id: anchorInfo.id,
      url: anchorInfo.url,
      title,
      business_type: extractBusinessType(root),
      city,
      district: extractDistrict(root, lines, city),
      address: extractAddress(root, lines, city),
      rent_twd: extractRent(root, lines, allText),
      listed_area_ping: extractArea(lines, allText),
      floor_text: extractFloorText(lines, allText),
      property_type: extractPropertyType(lines),
      nearby_place: nearbyEvidence.nearby_place,
      nearby_distance_m: nearbyEvidence.nearby_distance_m,
      thumbnail_url: extractThumbnailUrl(root),
      scraped_at: scrapedAt,
    };
  }

  function textPreview(element) {
    return getElementText(element).replace(/\s+/g, " ").slice(0, 220);
  }

  function isValidRentValue(value) {
    return Number.isInteger(value) && value > 0;
  }

  function isValidDistrictForCity(city, district) {
    if (!district) return true;
    if (normalizeCityName(city) === "台北市") return TAIPEI_DISTRICTS.includes(district);
    const districtPool = districtPoolForCity(city);
    return districtPool.includes(district);
  }

  function scanCurrentPage() {
    const scrapedAt = new Date().toISOString();
    const pageCity = extractPageCity();
    const { candidateAnchors, excludedNonListing } = collectCandidateAnchors();
    const byId = new Map();
    const debugListings = [];
    const listings = [];
    let failed = 0;

    for (const anchorInfo of candidateAnchors) {
      if (!byId.has(anchorInfo.id)) byId.set(anchorInfo.id, []);
      byId.get(anchorInfo.id).push(anchorInfo);
    }

    console.groupCollapsed(
      `${DEBUG_PREFIX} scan found ${candidateAnchors.length} legal 591 anchor(s), ${byId.size} unique listing id(s)`,
    );

    for (const [listingId, anchorInfos] of byId.entries()) {
      const anchorInfo = anchorInfos[0];
      const root = findRootContainer(anchorInfo.anchor, listingId);

      if (!root) {
        failed += 1;
        const debugEntry = {
          source_listing_id: listingId,
          root_container_class: null,
          root_text_preview: null,
          parsed_result: null,
          error: "No complete listing root container found.",
        };
        debugListings.push(debugEntry);
        console.debug(`${DEBUG_PREFIX} listing ${listingId}`, debugEntry);
        continue;
      }

      const parsed = parseListing(root, anchorInfo, scrapedAt, pageCity);
      const parsedHostname = new URL(parsed.url).hostname;

      const isValid =
        Boolean(parsed.source_listing_id) &&
        Boolean(parsed.url) &&
        (isRentHost(parsedHostname) || isBusinessHost(parsedHostname));

      const debugEntry = {
        source_listing_id: listingId,
        root_container_class: classNameOf(root) || null,
        root_text_preview: textPreview(root),
        parsed_result: parsed,
      };
      debugListings.push(debugEntry);
      console.debug(`${DEBUG_PREFIX} listing ${listingId}`, debugEntry);

      if (isValid) {
        listings.push(parsed);
      } else {
        failed += 1;
      }
    }

    console.groupEnd();

    const duplicateIdsRemoved = Math.max(candidateAnchors.length - byId.size, 0);
    const invalidRentCount = listings.filter((listing) => !isValidRentValue(listing.rent_twd)).length;
    const invalidDistrictCount = listings.filter(
      (listing) => !isValidDistrictForCity(listing.city, listing.district),
    ).length;

    return {
      scanned_at: scrapedAt,
      page_url: window.location.href,
      page_title: document.title || null,
      stats: {
        candidate_anchors: candidateAnchors.length,
        unique_listing_ids: byId.size,
        parsed_successfully: listings.length,
        failed,
        excluded_non_listing: excludedNonListing,
        duplicate_ids_removed: duplicateIdsRemoved,
        invalid_rent_count: invalidRentCount,
        invalid_district_count: invalidDistrictCount,
      },
      listings,
      debug: {
        listings: debugListings,
      },
    };
  }

  const PARSER_SELF_TEST_CASES = {
    rent_twd: [
      ["降4000元 89,000元/月", 89000],
      ["220,000元/月 (額外費用 12,101元/月)", 220000],
      ["158,000元/月(含網路等)", 158000],
    ],
    taipei_district: [
      ["東方晶璽大樓南港區-經園街", "南港區"],
      ["南京東路松山區-長春路", "松山區"],
      ["倚翠園士林區-中山北路", "士林區"],
      ["新光山莊士林區-中庸一路", "士林區"],
      ["十方天母榕園北投區-明德路", "北投區"],
    ],
    location_evidence: [
      [
        "中山區-中山北路二段 距民權西路 517公尺",
        {
          address: "中山區-中山北路二段",
          nearby_place: "民權西路",
          nearby_distance_m: 517,
        },
      ],
      [
        "中山區-中山北路二段 距三姐姐早餐店 494公尺",
        {
          address: "中山區-中山北路二段",
          nearby_place: "三姐姐早餐店",
          nearby_distance_m: 494,
        },
      ],
      [
        "南港區-經園街 距捷運南港展覽館站 1,050公尺",
        {
          address: "南港區-經園街",
          nearby_place: "南港展覽館",
          nearby_distance_m: 1050,
        },
      ],
    ],
    business_listing_href: {
      href: "https://business.591.com.tw/rent/21768020",
      expected_id: "21768020",
    },
    listing_21778960: {
      href: "https://rent.591.com.tw/21778960",
      text: "東方晶璽大樓南港區-經園街 距南港展覽館 620公尺 降4000元 89,000元/月 整層住家4房2廳55坪1F/15F",
      expected: {
        source_listing_id: "21778960",
        url: "https://rent.591.com.tw/21778960",
        district: "南港區",
        address: "南港區-經園街",
        nearby_place: "南港展覽館",
        nearby_distance_m: 620,
        rent_twd: 89000,
        listed_area_ping: 55,
        floor_text: "1F/15F",
      },
    },
  };

  function runParserSelfTests() {
    const failures = [];

    for (const [input, expected] of PARSER_SELF_TEST_CASES.rent_twd) {
      const actual = parseMonthlyRentText(input);
      if (actual !== expected) {
        failures.push({ parser: "rent_twd", input, expected, actual });
      }
    }

    for (const [input, expected] of PARSER_SELF_TEST_CASES.taipei_district) {
      const actual = extractDistrictFromTexts([input], "台北市");
      if (actual !== expected) {
        failures.push({ parser: "district", input, expected, actual });
      }
    }

    for (const [input, expected] of PARSER_SELF_TEST_CASES.location_evidence) {
      const actualNearby = parseNearbyDistanceText(input);
      const actual = {
        address: extractAddressFromTexts([input], "台北市"),
        nearby_place: actualNearby?.nearby_place || null,
        nearby_distance_m: actualNearby?.nearby_distance_m || null,
      };
      for (const [key, expectedValue] of Object.entries(expected)) {
        if (actual[key] !== expectedValue) {
          failures.push({
            parser: "location_evidence",
            field: key,
            input,
            expected: expectedValue,
            actual: actual[key],
          });
        }
      }
    }

    const businessFixture = PARSER_SELF_TEST_CASES.business_listing_href;
    const parsedBusinessHref = parseBusinessListingHref(businessFixture.href);

    if (parsedBusinessHref?.id !== businessFixture.expected_id) {
      failures.push({
        parser: "business_listing_href",
        input: businessFixture.href,
        expected: businessFixture.expected_id,
        actual: parsedBusinessHref?.id || null,
      });
    }

    const fixture = PARSER_SELF_TEST_CASES.listing_21778960;
    const parsedHref = parseRentListingHref(fixture.href);
    const fixtureNearby = parseNearbyDistanceText(fixture.text);
    const fixtureActual = {
      source_listing_id: parsedHref?.id || null,
      url: parsedHref?.url || null,
      district: extractDistrictFromTexts([fixture.text], "台北市"),
      address: extractAddressFromTexts([fixture.text], "台北市"),
      nearby_place: fixtureNearby?.nearby_place || null,
      nearby_distance_m: fixtureNearby?.nearby_distance_m || null,
      rent_twd: parseMonthlyRentText(fixture.text),
      listed_area_ping: parseAreaText(fixture.text),
      floor_text: extractFloorText([fixture.text], fixture.text),
    };

    for (const [key, expected] of Object.entries(fixture.expected)) {
      if (fixtureActual[key] !== expected) {
        failures.push({
          parser: "listing_21778960",
          field: key,
          expected,
          actual: fixtureActual[key],
        });
      }
    }

    return {
      passed: failures.length === 0,
      checked:
        PARSER_SELF_TEST_CASES.rent_twd.length +
        PARSER_SELF_TEST_CASES.taipei_district.length +
        PARSER_SELF_TEST_CASES.location_evidence.length * 3 +
        Object.keys(PARSER_SELF_TEST_CASES.listing_21778960.expected).length,
      failures,
    };
  }

  window.__radar591RunParserSelfTests = runParserSelfTests;
  window.__radar591ScanCurrentPage = scanCurrentPage;

  const parserSelfTestResult = runParserSelfTests();
  if (parserSelfTestResult.passed) {
    console.debug(`${DEBUG_PREFIX} parser self-tests passed`, parserSelfTestResult);
  } else {
    console.debug(`${DEBUG_PREFIX} parser self-tests failed`, parserSelfTestResult);
  }

  if (typeof chrome !== "undefined" && chrome.runtime?.onMessage?.addListener) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!message || message.type !== "SCAN_591_PAGE") return false;

      try {
        sendResponse({ ok: true, payload: scanCurrentPage() });
      } catch (error) {
        console.debug(`${DEBUG_PREFIX} scan failed`, error);
        sendResponse({ ok: false, error: error?.message || String(error) });
      }

      return true;
    });
  }

  console.debug(`${DEBUG_PREFIX} Content script ready.`);
})();
