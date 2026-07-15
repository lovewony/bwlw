// 심부름꾼 7호: 구글 시트 '단독기획' 탭(CSV)을 읽어 '바이웰 단독' 카드로 정리합니다.
// 주소는 넷리파이 환경변수 GOOGLE_SINGLE_URL 에서 읽어요.
// 열 순서(1행 제목): 단독기획명 | 유형 | 진행기간 | 참여링크 | 배너이미지 | 상세설명

// CSV 전체를 한 글자씩 읽어 행/열로 분해 (따옴표 안의 줄바꿈·쉼표를 올바르게 처리)
function parseCsv(text) {
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  var rows = [], row = [], cur = "", inQ = false;
  for (var i = 0; i < text.length; i++) {
    var c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; } // 이스케이프된 따옴표
        else { inQ = false; }
      } else {
        cur += c; // 따옴표 안이면 줄바꿈·쉼표도 그대로 셀 내용
      }
    } else {
      if (c === '"') { inQ = true; }
      else if (c === ",") { row.push(cur); cur = ""; }
      else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
      else { cur += c; }
    }
  }
  // 마지막 셀/행 정리
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  // 완전히 빈 행 제거
  return rows.filter(function (r) { return r.some(function (x) { return String(x).trim() !== ""; }); });
}

function normalizeRow(cols) {
  // 상세설명은 줄바꿈으로 여러 항목 → 배열로 쪼갬
  var detailRaw = (cols[5] || "").trim();
  var details = detailRaw
    ? detailRaw.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean)
    : [];
  return {
    name: (cols[0] || "").trim(),
    type: (cols[1] || "").trim() || "공동구매",
    period: (cols[2] || "").trim(),
    url: (cols[3] || "").trim() || "#",
    banner: (cols[4] || "").trim(),
    details: details
  };
}

var cache = { at: 0, data: null };
var FIVE_MIN = 60 * 1000; // 1분 캐시 (admin 등록 반영 빠르게)

exports.handler = async function () {
  var url = process.env.GOOGLE_SINGLE_URL;
  if (!url) {
    return json(500, { error: "GOOGLE_SINGLE_URL 환경변수가 설정되지 않았어요." });
  }
  if (cache.data && (Date.now() - cache.at) < FIVE_MIN) {
    return json(200, { singles: cache.data, cached: true });
  }
  try {
    var res = await fetch(url, { headers: { "User-Agent": "bwlw/1.0" } });
    if (!res.ok) {
      if (cache.data) return json(200, { singles: cache.data, stale: true });
      return json(502, { error: "단독기획 응답 오류: " + res.status });
    }
    var text = await res.text();
    var rows = parseCsv(text);
    var base = rows.slice(1).map(normalizeRow).filter(function (e) { return e.name; });
    cache = { at: Date.now(), data: base };
    return json(200, { singles: base });
  } catch (e) {
    if (cache.data) return json(200, { singles: cache.data, stale: true });
    return json(502, { error: "단독기획 받아오기 실패: " + String(e) });
  }
};

function json(status, body) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=30" },
    body: JSON.stringify(body)
  };
}
