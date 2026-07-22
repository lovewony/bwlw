// 심부름꾼: 구글 시트 '쿠폰정보' 탭(CSV)을 읽어 실시간 쿠폰 카드로 정리합니다.
// 주소는 넷리파이 환경변수 GOOGLE_COUPON_URL 에서 읽어요.
// 열 순서(1행 제목): 쿠폰명 | 몰 | 오픈시각 | 링크 | 안내문구 | 종료일
//   - 오픈시각 예: "10:00" (매일 반복) / "2026-07-25 10:00" (특정 날짜만)
//   - 종료일 비워두면 계속 노출, 날짜 적으면 그날 지나고 자동으로 사라짐

var ALLOWED_MALLS = ["coupang", "gmarket", "11st", "ohou", "lotteon", "ssg", "kakao", "toss", "naver", "momq", "oliveyoung", "etc"];

function parseCsvLine(line) {
  var out = [], cur = "", inQ = false;
  for (var i = 0; i < line.length; i++) {
    var c = line[i];
    if (inQ) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else { inQ = false; } }
      else { cur += c; }
    } else {
      if (c === '"') { inQ = true; }
      else if (c === ",") { out.push(cur); cur = ""; }
      else { cur += c; }
    }
  }
  out.push(cur);
  return out;
}
function parseCsv(text) {
  var lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(function (l) { return l.trim() !== ""; });
  return lines.map(parseCsvLine);
}

// 지금 한국시간 (분 단위)
function kstNowParts() {
  var d = new Date(Date.now() + 9 * 3600 * 1000);
  return {
    ymd: d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0"),
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes()
  };
}

// 종료일(날짜만) → 그날 23:59:59 (KST) epoch
function parseEndKST(s) {
  s = (s || "").trim();
  if (!s) return null;
  s = s.replace(/[.\/]/g, "-");
  var m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], 23, 59, 59) - 9 * 3600 * 1000;
}

// 오픈시각 해석 → { daily:true, min:600 } 또는 { date:"2026-07-25", min:600 }
function parseOpen(s) {
  s = (s || "").trim().replace(/시/g, ":").replace(/[.\/]/g, "-");
  if (!s) return null;
  var withDate = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})[ T]+(\d{1,2})(?::(\d{1,2}))?/);
  if (withDate) {
    return {
      daily: false,
      date: withDate[1] + "-" + String(+withDate[2]).padStart(2, "0") + "-" + String(+withDate[3]).padStart(2, "0"),
      min: (+withDate[4]) * 60 + (+(withDate[5] || 0))
    };
  }
  var onlyTime = s.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (onlyTime) return { daily: true, min: (+onlyTime[1]) * 60 + (+(onlyTime[2] || 0)) };
  return null;
}

function normalizeRow(cols) {
  var mall = (cols[1] || "").trim().toLowerCase();
  if (ALLOWED_MALLS.indexOf(mall) === -1) mall = "etc";
  return {
    name: (cols[0] || "").trim(),
    mall: mall,
    open: parseOpen(cols[2]),
    openRaw: (cols[2] || "").trim(),
    url: (cols[3] || "").trim() || "#",
    info: (cols[4] || "").trim(),
    endTs: parseEndKST(cols[5])
  };
}

// 상태 계산: soon(곧 열림) / open(오픈 중) / done(오늘 지남)
function withStatus(list) {
  var now = kstNowParts();
  var nowTs = Date.now();
  return list.filter(function (c) {
    if (!c.name) return false;
    if (c.endTs && nowTs > c.endTs) return false;      // 종료일 지나면 자동 제거
    if (!c.open) return false;
    if (!c.open.daily && c.open.date !== now.ymd) {
      // 특정 날짜 쿠폰인데 오늘이 아니면, 미래 날짜만 남김
      return c.open.date > now.ymd;
    }
    return true;
  }).map(function (c) {
    var status = "open", left = 0;
    if (!c.open.daily && c.open.date > now.ymd) {
      status = "upcoming";                              // 다른 날 예정
    } else {
      var diff = c.open.min - now.minutes;
      if (diff > 0) { status = "soon"; left = diff; }   // 오늘 아직 안 열림
      else { status = "open"; }                          // 열림
    }
    var hh = String(Math.floor(c.open.min / 60)).padStart(2, "0");
    var mm = String(c.open.min % 60).padStart(2, "0");
    return {
      name: c.name, mall: c.mall, url: c.url, info: c.info,
      openText: (c.open.daily ? "매일 " : (c.open.date || "") + " ") + hh + ":" + mm,
      openMin: c.open.min,
      daily: c.open.daily, status: status, minutesLeft: left
    };
  }).sort(function (a, b) {
    // 오픈 시각이 이른 순 (09:00 → 10:00 → 23:00)
    return a.openMin - b.openMin;
  });
}

var cache = { at: 0, data: null };
var CACHE_MS = 60 * 1000;

exports.handler = async function () {
  var url = process.env.GOOGLE_COUPON_URL;
  if (!url) {
    return { statusCode: 200, headers: hd(), body: JSON.stringify({ coupons: [] }) };
  }
  try {
    if (cache.data && Date.now() - cache.at < CACHE_MS) {
      return { statusCode: 200, headers: hd(), body: JSON.stringify({ coupons: withStatus(cache.data) }) };
    }
    var res = await fetch(url);
    var text = await res.text();
    var rows = parseCsv(text);
    if (rows.length <= 1) return { statusCode: 200, headers: hd(), body: JSON.stringify({ coupons: [] }) };
    var list = rows.slice(1).map(normalizeRow);
    cache = { at: Date.now(), data: list };
    return { statusCode: 200, headers: hd(), body: JSON.stringify({ coupons: withStatus(list) }) };
  } catch (e) {
    return { statusCode: 200, headers: hd(), body: JSON.stringify({ coupons: [], error: String(e) }) };
  }
};

function hd() {
  return { "Content-Type": "application/json", "Cache-Control": "public, max-age=30" };
}
