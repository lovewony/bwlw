// 심부름꾼 5호: 구글 시트 '행사정보' 탭(CSV)을 읽어 쇼핑몰별 할인행사 카드로 정리합니다.
// 주소는 넷리파이 환경변수 GOOGLE_EVENT_URL 에서 읽어요.
// 열 순서(1행 제목): 행사명 | 몰 | 종료일 | 행사링크 | 배너이미지 | 안내문구

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

// 한국시간 기준 시각(epoch ms). '2026-07-14', '2026-07-14 23시', '2026-07-14 23:00' 등 인식
function parseKST(s) {
  s = (s || "").trim();
  if (!s) return null;
  s = s.replace(/시/g, ":").replace(/[.\/]/g, "-");
  var m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T]+(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?)?/);
  if (!m) return null;
  var y = +m[1], mo = +m[2], d = +m[3];
  var hasTime = m[4] != null;
  var H = +(m[4] || 0), M = +(m[5] || 0), S = +(m[6] || 0);
  if (!hasTime) { H = 23; M = 59; S = 59; }
  return Date.UTC(y, mo - 1, d, H, M, S) - 9 * 3600 * 1000;
}

function normalizeRow(cols) {
  var mall = (cols[1] || "").trim().toLowerCase();
  if (ALLOWED_MALLS.indexOf(mall) === -1) mall = "etc";
  return {
    name: (cols[0] || "").trim(),
    mall: mall,
    endTs: parseKST(cols[2]),
    url: (cols[3] || "").trim() || "#",
    banner: (cols[4] || "").trim(),
    info: (cols[5] || "").trim()
  };
}

function visible(list) {
  var now = Date.now();
  return list.filter(function (e) {
    if (!e.name) return false;
    if (e.endTs && now > e.endTs) return false; // 종료일 지나면 자동으로 내려감
    return true;
  });
}

var cache = { at: 0, data: null };
var FIVE_MIN = 5 * 60 * 1000;

exports.handler = async function () {
  var url = process.env.GOOGLE_EVENT_URL;
  if (!url) {
    return json(500, { error: "GOOGLE_EVENT_URL 환경변수가 설정되지 않았어요." });
  }
  if (cache.data && (Date.now() - cache.at) < FIVE_MIN) {
    return json(200, { events: visible(cache.data), cached: true });
  }
  try {
    var res = await fetch(url, { headers: { "User-Agent": "bwlw/1.0" } });
    if (!res.ok) {
      if (cache.data) return json(200, { events: visible(cache.data), stale: true });
      return json(502, { error: "행사정보 응답 오류: " + res.status });
    }
    var text = await res.text();
    var rows = parseCsv(text);
    var base = rows.slice(1).map(normalizeRow).filter(function (e) { return e.name; });
    cache = { at: Date.now(), data: base };
    return json(200, { events: visible(base) });
  } catch (e) {
    if (cache.data) return json(200, { events: visible(cache.data), stale: true });
    return json(502, { error: "행사정보 받아오기 실패: " + String(e) });
  }
};

function json(status, body) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=120" },
    body: JSON.stringify(body)
  };
}
