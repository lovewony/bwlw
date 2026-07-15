// 심부름꾼 3호: 구글 시트(CSV)를 읽어와 '오늘의 찐핫딜' 카드로 정리합니다.
// 시트 주소는 코드가 아니라 넷리파이 환경변수 GOOGLE_SHEET_URL 에서 읽어요.
// 시트 열 순서(1행 제목): 상품명 | 지금가격 | 정상가 | 이미지주소 | 상품링크 | 몰 | 등급

var ALLOWED_MALLS = ["coupang", "gmarket", "11st", "ohou", "lotteon", "ssg", "kakao", "toss", "naver", "momq", "oliveyoung", "etc"];

function toNumber(v) {
  if (v == null) return 0;
  return parseInt(String(v).replace(/[^0-9]/g, ""), 10) || 0;
}

// 쉼표가 값 안에 들어있어도 안전하게 CSV 한 줄을 쪼갭니다(따옴표 처리 포함).
function parseCsvLine(line) {
  var out = [], cur = "", inQ = false;
  for (var i = 0; i < line.length; i++) {
    var c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else { inQ = false; }
      } else { cur += c; }
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
  // 줄바꿈 정리 후, 빈 줄 제거
  var lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(function (l) { return l.trim() !== ""; });
  return lines.map(parseCsvLine);
}

// 시간을 너그럽게 해석 (한국시간 기준). 아래 형식 모두 인식:
//  2026-07-05 / 2026-07-05 10시 / 2026-07-05 10:00 / 2026-07-05 10:00:00
//  2026.07.05, 2026/07/05 처럼 구분자가 . 또는 / 여도 OK
function parseKST(s) {
  s = (s || "").trim();
  if (!s) return null;
  s = s.replace(/시/g, ":").replace(/[.\/]/g, "-"); // '10시'->'10:', 날짜 구분자 통일
  var m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T]+(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?)?/);
  if (!m) return null;
  var y = +m[1], mo = +m[2], d = +m[3];
  var hasTime = m[4] != null;
  var H = +(m[4] || 0), M = +(m[5] || 0), S = +(m[6] || 0);
  if (!hasTime) { H = 23; M = 59; S = 59; } // 시간 안 적으면 그날 자정까지
  return Date.UTC(y, mo - 1, d, H, M, S) - 9 * 3600 * 1000;
}

function normalizeRow(cols) {
  var mall = (cols[5] || "").trim().toLowerCase();
  if (ALLOWED_MALLS.indexOf(mall) === -1) mall = "etc";
  var grade = (cols[6] || "").trim().toLowerCase();
  if (grade !== "hot" && grade !== "good") grade = "";

  var now = toNumber(cols[1]);
  var was = toNumber(cols[2]);
  if (!was || was < now) was = now;

  var kindRaw = (cols[10] || "").trim();       // K열 구분
  var kind = (kindRaw.indexOf("일반") > -1) ? "normal" : "jjin";
  var tagsRaw = (cols[11] || "").trim();       // L열 태그
  var tags = tagsRaw ? tagsRaw.split(/[,#\s]+/).filter(Boolean) : [];
  var optRaw = (cols[12] || "").trim();        // M열 옵션여부
  var hasOptions = /[oO○ㅇ예yY1있]/.test(optRaw) && optRaw !== "";

  return {
    mall: mall,
    mallName: (cols[5] || "").trim(),
    title: (cols[0] || "").trim() || "상품",
    now: now,
    was: was,
    photo: (cols[3] || "").trim(),
    buyurl: (cols[4] || "").trim() || "#",
    grade: grade,
    startTs: parseKST(cols[7]),
    endTs: parseKST(cols[8]),
    cardInfo: (cols[9] || "").trim(),
    kind: kind,
    tags: tags,
    hasOptions: hasOptions,
    pinned: (kind === "jjin")
  };
}

// 5분 캐시 (시트를 너무 자주 안 부르게)
// 노출 기간(시작~종료) 안에 있는 것만 남기기 — 매 요청마다 실시간 판단
function timeVisible(list) {
  var nowMs = Date.now();
  return list.filter(function (d) {
    if (d.startTs && nowMs < d.startTs) return false; // 아직 시작 전
    if (d.endTs && nowMs > d.endTs) return false;     // 이미 종료 → 자동으로 내려감
    return true;
  });
}

var cache = { at: 0, data: null };
var FIVE_MIN = 60 * 1000; // 서버 캐시: 1분 (admin 등록 반영 빠르게)

exports.handler = async function (event) {
  var url = process.env.GOOGLE_SHEET_URL;
  if (!url) {
    return json(500, { error: "GOOGLE_SHEET_URL 환경변수가 설정되지 않았어요." });
  }
  var wantAll = !!(event && event.queryStringParameters && event.queryStringParameters.all);

  // 캐시에 기본 목록이 있으면, 시간 필터만 새로 적용해서 바로 반환
  if (cache.data && (Date.now() - cache.at) < FIVE_MIN) {
    return json(200, { deals: wantAll ? cache.data : timeVisible(cache.data), cached: true });
  }

  try {
    var res = await fetch(url, { headers: { "User-Agent": "bwlw/1.0" } });
    if (!res.ok) {
      if (cache.data) return json(200, { deals: timeVisible(cache.data), stale: true });
      return json(502, { error: "구글 시트 응답 오류: " + res.status });
    }
    var text = await res.text();
    var rows = parseCsv(text);

    var dataRows = rows.slice(1);
    var base = dataRows
      .map(normalizeRow)
      .filter(function (d) { return d.title && d.title !== "상품" && d.buyurl && d.buyurl !== "#"; });

    cache = { at: Date.now(), data: base };
    return json(200, { deals: wantAll ? base : timeVisible(base) });
  } catch (e) {
    if (cache.data) return json(200, { deals: timeVisible(cache.data), stale: true });
    return json(502, { error: "시트 받아오기 실패: " + String(e) });
  }
};

function json(status, body) {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=30"
    },
    body: JSON.stringify(body)
  };
}
