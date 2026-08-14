const fs = require('fs');

const FILE = './data/location-report.json';
const report = JSON.parse(fs.readFileSync(FILE, 'utf8'));

function num(v) {
  if (v == null || v === '') return null;
  const n = parseFloat(String(v).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function walkMinutes(v='') {
  const m = String(v).match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

function uniq(arr) {
  return [...new Set(arr.filter(Boolean))];
}

function shorten(text='', max=110) {
  const s = String(text).replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max) + '…' : s;
}
function officialScore(x) {
  let points = 0;
  let availableMax = 0;

  const detail = {};
  const missing = [];

  const ping = x.areaPing ?? num(x.area);
  const rentPerPing = num(x.rentPerPing);
  const rentJPY = num(x.rentJPY);
  const walk = walkMinutes(x.mrt);

  const floor = String(x.floor || '')
    .replace(/\s/g, '')
    .replace(/＋/g, '+')
    .toUpperCase();

  const signage = String(x.signage || '').trim();
  const competition = String(x.competitionOriginal || '').trim();

  // 1. 坪單價：10
  if (rentPerPing != null) {
    availableMax += 10;

    if (rentPerPing <= 20000) {
      detail.rentPerPing = 10;
      points += 10;
    } else if (rentPerPing <= 30000) {
      detail.rentPerPing = 5;
      points += 5;
    } else {
      detail.rentPerPing = 0;
    }
  } else {
    detail.rentPerPing = null;
    missing.push('坪單價');
  }

  // 2. 家賃+管理費 JPY：15
  if (rentJPY != null) {
    availableMax += 15;

    if (rentJPY <= 1000000) {
      detail.rent = 15;
      points += 15;
    } else if (rentJPY < 2000000) {
      detail.rent = 8;
      points += 8;
    } else {
      detail.rent = 0;
    }
  } else {
    detail.rent = null;
    missing.push('家賃+管理費（JPY）');
  }

  // 3. 樓層：10
  if (floor) {
    availableMax += 10;

    if (floor === '1F') {
      detail.floor = 10;
      points += 10;
    } else if (floor === '1F+2F') {
      detail.floor = 8;
      points += 8;
    } else if (floor === '1F+B1' || floor === '1F+B1F') {
      detail.floor = 6;
      points += 6;
    } else {
      detail.floor = 3;
      points += 3;
    }
  } else {
    detail.floor = null;
    missing.push('樓層');
  }

  // 4. 坪數：15
  if (ping != null) {
    availableMax += 15;

    if (ping >= 81) {
      detail.area = 15;
      points += 15;
    } else if (ping >= 71) {
      detail.area = 12;
      points += 12;
    } else if (ping >= 61) {
      detail.area = 9;
      points += 9;
    } else if (ping >= 50) {
      detail.area = 6;
      points += 6;
    } else {
      detail.area = 3;
      points += 3;
    }
  } else {
    detail.area = null;
    missing.push('可用坪數');
  }

  // 5. 視認性
  // 官方表標示權重 20，但表中可取得最高分為 15。
  // 因此依實際規則最高 15，最後統一 normalize 成 100 分。
  if (signage) {
    availableMax += 15;

    if (/2面以上|２面以上|2面|三角窗/.test(signage)) {
      detail.visibility = 15;
      points += 15;
    } else if (/1面|１面/.test(signage)) {
      detail.visibility = 10;
      points += 10;
    } else if (/なし|無|不可|NG/i.test(signage)) {
      detail.visibility = 0;
    } else {
      detail.visibility = null;
      availableMax -= 15;
      missing.push('視認性 / 看板');
    }
  } else {
    detail.visibility = null;
    missing.push('視認性 / 看板');
  }

  // 6. 競合：10
  if (competition) {
    if (/同建物|同棟|同一建物/.test(competition)) {
      availableMax += 10;
      detail.competition = 0;
    } else {
      const distance = num(competition);

      if (distance != null) {
        availableMax += 10;

        if (distance >= 251) {
          detail.competition = 10;
          points += 10;
        } else {
          detail.competition = 5;
          points += 5;
        }
      } else {
        detail.competition = null;
        missing.push('競合距離');
      }
    }
  } else {
    detail.competition = null;
    missing.push('競合距離');
  }

  // 7. Access：20
  // 現有 Sheet 的アクセス先按 MRT 徒步時間計算
  if (walk != null) {
    availableMax += 20;

    if (walk <= 5) {
      detail.access = 20;
      points += 20;
    } else if (walk <= 10) {
      detail.access = 15;
      points += 15;
    } else {
      detail.access = 0;
    }
  } else {
    detail.access = null;
    missing.push('交通時間');
  }

  // 官方表各實際規則可取得最高合計為 95。
  // 若部分欄位缺資料，僅依已知項目 normalize。
  const score100 =
    availableMax > 0
      ? Math.round((points / availableMax) * 1000) / 10
      : null;

  const score10 =
    score100 != null
      ? Math.round(score100) / 10
      : null;

  return {
    rawPoints: points,
    availableMax,
    score100,
    score10,
    detail,
    missing: uniq(missing)
  };
}

function evaluate(x) {
  let score = 1;
  const official = officialScore(x);

  const positives = [];
  const risks = [];
  const missing = [];
  const actions = [];

  const ping = x.areaPing ?? num(x.area);
  const rentPing = num(x.rentPerPing);
  const walk = walkMinutes(x.mrt);

  const floor = String(x.floor || '');
  const signage = String(x.signage || '');

  const broker = String(x.brokerAnswer || '');
  const toshi = String(x.toshiScore || '');
  const nakamura = String(x.nakamuraScore || '');
  const review = String(x.reviewMeta?.reviewComment || '');

  const evidence = [broker, toshi, nakamura, review].join(' ');

  // Target geography
  if (['台北','新北'].includes(x.region)) score += 1;

  // Area
  if (x.region === '台北') {
    if (ping >= 80 && ping <= 160) {
      score += 1.5;
      positives.push(`${ping} 坪符合台北旗艦館 80–160 坪目標`);
    } else if (ping >= 70 && ping < 80) {
      score += 0.6;
      risks.push(`${ping} 坪低於台北旗艦館 80 坪目標`);
    } else if (ping != null) {
      score += 0.2;
      risks.push(`${ping} 坪與台北旗艦館 80–160 坪目標落差較大`);
    } else {
      missing.push('實際可使用坪數');
    }
  } else {
    if (ping >= 70) {
      score += 1.1;
      positives.push(`可使用面積 ${ping} 坪，具一定營運空間`);
    } else if (ping != null) {
      score += 0.5;
      risks.push(`可使用面積僅 ${ping} 坪，需確認設備配置是否足夠`);
    } else {
      missing.push('實際可使用坪數');
    }
  }

  // Rent efficiency
  if (rentPing != null) {
    if (rentPing <= 20000) {
      score += 2;
      positives.push(`坪租約 ¥${rentPing.toLocaleString()}，租金效率佳`);
    } else if (rentPing <= 25000) {
      score += 1.6;
      positives.push(`坪租約 ¥${rentPing.toLocaleString()}，仍在理想 ¥25,000 內`);
    } else if (rentPing <= 30000) {
      score += 0.8;
      risks.push(`坪租約約 ¥${rentPing.toLocaleString()}，高於理想 ¥25,000`);
    } else {
      score += 0.2;
      risks.push(`坪租約約 ¥${rentPing.toLocaleString()}，明顯高於理想 ¥25,000`);
    }
  } else {
    missing.push('每坪租金 / 匯率確認');
  }

  // Floor
  if (/1F\s*\+\s*2F/i.test(floor)) {
    score += 1;
    positives.push('1F+2F 為優先樓層組合');
    missing.push('2F 跳躍測試');
  } else if (/1F\s*\+\s*B1/i.test(floor)) {
    score += 0.6;
    positives.push('1F+B1 為可接受備選配置');
  } else if (/^1F$/i.test(floor)) {
    score += 0.7;
    positives.push('純 1F 對進出與可視性較單純');
  } else if (/2F/i.test(floor)) {
    score += 0.4;
    missing.push('2F 跳躍測試');
  }

  // Transit
  if (walk != null) {
    if (walk <= 5) {
      score += 1;
      positives.push(`距捷運約 ${walk} 分鐘，交通便利`);
    } else if (walk <= 10) {
      score += 0.7;
      positives.push(`距捷運約 ${walk} 分鐘，仍在台北優先範圍`);
    } else {
      score += 0.2;
      risks.push(`距捷運約 ${walk} 分鐘，步行距離偏長`);
    }
  } else {
    missing.push('捷運步行時間');
  }

  // Signage
  if (/2面以上|2面|三角窗|角地/.test(signage + evidence)) {
    score += 0.75;
    positives.push('看板 / 角地曝光條件佳');
  } else if (/1面/.test(signage)) {
    score += 0.4;
    positives.push('已有一面看板條件');
  } else if (/看板NG|看板.*不可|外部.*看板.*できません|広告.*できません/.test(evidence)) {
    risks.push('外部看板受限');
  } else {
    missing.push('看板位置、尺寸與設置規範');
  }

  // Traffic / commercial evidence from broker only
  if (/人通り.*多|人流.*多|通勤|オフィスワーカー|商圏|夜市|百貨店|住宅人口.*多|安定した集客/.test(evidence)) {
    score += 1;
    positives.push('房仲資料顯示周邊具有住宅、通勤或商圈客流');
  } else if (/人通り.*少|人通り.*それほど|比較不多人|休日.*人通り.*減/.test(evidence)) {
    risks.push('房仲資料顯示部分時段或路段人流偏弱');
  } else {
    missing.push('平日 / 假日現場人流');
  }

  // Zoning / permits
  if (/住居|住宅區|住宅地域|住3/.test(evidence)) {
    risks.push('住宅區使用存在用途 / 使用執照變更風險');
    missing.push('是否可變更使用執照（約 2 個月評估）');
  } else if (/商業地域|商業區|商業/.test(evidence)) {
    score += 1;
    positives.push('現有資料顯示為商業用途區域');
  } else {
    missing.push(
      ping > 90.75
        ? '使用分區及 D1 適用性'
        : '使用分區及 D5 適用性'
    );
  }

  if (/高級住宅|高級マンション|ハイエンド/.test(evidence)) {
    missing.push('裝潢許可證');
  }

  // Parking substitute payment
  if (/科技園區|サイエンスパーク|科技.*園區/.test(evidence)) {
    missing.push('停車位代金 / 代金風險');
  }

  // Hard / major risks
  let hardReject = false;

  if (/老朽|老舊|物件古い|建物.*古すぎ|非常に老朽化/.test(evidence)) {
    hardReject = true;
    risks.push('建物老舊，依展店規則不建議');
  }

  if (/毛胚|スケルトン|bare shell/i.test(evidence)) {
    hardReject = true;
    risks.push('毛胚屋，不符合展店條件');
  }

  if (/フィットネスジム業態への賃貸は不可|ジム.*賃貸.*不可|健身房.*不可/.test(evidence)) {
    hardReject = true;
    risks.push('房東 / 建物條件不接受健身房業態');
  }

  if (/跳.*晃|跳躍.*晃|揺れ|震動.*問題|耐荷重.*通過しない/.test(evidence)) {
    hardReject = true;
    risks.push('2F 樓板 / 跳躍振動存在重大風險');
  }

  // Existing interior: only hard reject when clearly unsuitable/conflicting
  if (/SPA|スパ施設|理髪店|システム収納|既存設備.*撤去|残置物.*撤去/.test(evidence)) {
    risks.push('既有內裝 / 設備可能增加拆除成本');
  }

  if (/増築|違法建築/.test(evidence)) {
    risks.push('存在增建 / 違建範圍，不能直接計入可使用面積');
    missing.push('合法可使用面積');
  }

  // Area based D1/D5 reminder
  if (ping != null && !missing.some(v => /D1|D5/.test(v))) {
    missing.push(
      ping > 90.75
        ? '確認是否採 D1'
        : '確認是否採 D5'
    );
  }

  // Specific next actions
  if (hardReject) {
    actions.push('先停止優先推進，確認重大淘汰條件是否可被正式排除');
  } else {
    if (missing.some(v => /跳躍|樓板/.test(v))) {
      actions.push('現勘時優先做 2F 跳躍 / 樓板振動確認');
    }

    if (missing.some(v => /D1|D5|使用分區|使用執照/.test(v))) {
      actions.push('先請房仲 / 建築師確認使用分區與 D1/D5 路徑');
    }

    if (rentPing != null && rentPing > 25000) {
      actions.push('同步確認租金議價空間');
    }

    if (risks.some(v => /增建|違建/.test(v))) {
      actions.push('重新確認排除違建後的合法可使用坪數');
    }

    if (missing.some(v => /看板/.test(v))) {
      actions.push('確認實際可設置看板的位置與尺寸');
    }

    if (actions.length === 0) {
      actions.push('補齊現場人流與用途確認後，決定是否排看屋');
    }
  }

  score = Math.max(0, Math.min(10, Math.round(score * 2) / 2));

  if (hardReject) score = Math.min(score, 3);

  let status = '補資料';
  if (hardReject) status = '淘汰';
  else if (score >= 8) status = '推薦看屋';
  else status = '補資料';

  // Personalized AI comment
  const commentParts = [];

  if (positives.length) {
    commentParts.push(`優點：${positives.slice(0,3).join('；')}。`);
  }

  if (risks.length) {
    commentParts.push(`注意：${risks.slice(0,3).join('；')}。`);
  }

  if (review) {
    commentParts.push(`審查紀錄：${shorten(review, 100)}。`);
  } else if (broker) {
    commentParts.push(`房仲補充：${shorten(broker, 100)}。`);
  }

  if (toshi) {
    commentParts.push(`Toshi：${shorten(toshi, 70)}。`);
  }

  if (nakamura) {
    commentParts.push(`仲村：${shorten(nakamura, 70)}。`);
  }

  return {
  score,
  status,

  officialScore: official.score100,
  officialRawPoints: official.rawPoints,
  officialAvailableMax: official.availableMax,
  officialScoreDetail: official.detail,
  officialScoreMissing: official.missing,

  risk: uniq(risks).join('；') || '目前未發現明確硬性淘汰條件',
  missing: uniq([...missing, ...official.missing]).join('、') || '目前無重大缺資料',
  next: uniq(actions).join('；'),
  aiComment: commentParts.join(' ')
};
}

let count = 0;

for (const x of report.locations) {
  if (!['台北','新北'].includes(x.region)) continue;

  const r = evaluate(x);

  x.aiScore = r.score;

  x.officialScore = r.officialScore;
  x.officialRawPoints = r.officialRawPoints;
  x.officialAvailableMax = r.officialAvailableMax;
  x.officialScoreDetail = r.officialScoreDetail;
  x.officialScoreMissing = r.officialScoreMissing;

  x.aiReviewer = 'chocoZAP Taiwan Assistant (AI)';
  x.aiReviewedAt = new Date().toISOString();

  x.status = r.status;
  x.risk = r.risk;
  x.missing = r.missing;
  x.next = r.next;
  x.aiComment = r.aiComment;

  count++;
}

report.updatedAt = new Date().toISOString();
report.updatedBy = 'chocoZAP Taiwan Assistant (AI)';

fs.writeFileSync(FILE, JSON.stringify(report, null, 2));

console.log(`personalized ${count} Taipei/New Taipei locations`);
