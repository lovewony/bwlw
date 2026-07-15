// 심부름꾼 7호: 구글 시트 '공지' 탭(CSV)을 읽어 공지사항으로 보여줍니다.
// 주소는 넷리파이 환경변수 GOOGLE_NOTICE_URL 에서 읽어요.
// 열 순서(1행 제목): 제목 | 내용 | 날짜 | 중요

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

function normalizeRow(cols) {
  var imp = (cols[3] || "").trim();
  return {
    title: (cols[0] || "").trim(),
    body: (cols[1] || "").trim(),
    date: (cols[2] || "").trim(),
    important: /[oO○ㅇ예yYtT중요1]/.test(imp) && imp !== ""
  };
}

var cache = { at: 0, data: null };
var FIVE_MIN = 5 * 60 * 1000;

exports.handler = async function () {
  var url = process.env.GOOGLE_NOTICE_URL;
  if (!url) {
    // 공지 시트를 아직 안 만들었으면 기본 공지 한 줄만 보여줌
    return json(200, {
      notices: [{
        title: "타임딜 안내",
        body: "타임딜은 재고 소진 등의 사정으로 조기 종료될 수 있습니다.",
        date: "",
        important: true
      }]
    });
  }
  if (cache.data && (Date.now() - cache.at) < FIVE_MIN) {
    return json(200, { notices: cache.data, cached: true });
  }
  try {
    var res = await fetch(url, { headers: { "User-Agent": "bwlw/1.0" } });
    if (!res.ok) {
      if (cache.data) return json(200, { notices: cache.data, stale: true });
      return json(502, { error: "공지 응답 오류: " + res.status });
    }
    var text = await res.text();
    var rows = parseCsv(text);
    var list = rows.slice(1).map(normalizeRow).filter(function (n) { return n.title || n.body; });
    // 중요 공지를 위로
    list.sort(function (a, b) { return (b.important ? 1 : 0) - (a.important ? 1 : 0); });
    cache = { at: Date.now(), data: list };
    return json(200, { notices: list });
  } catch (e) {
    if (cache.data) return json(200, { notices: cache.data, stale: true });
    return json(502, { error: "공지 받아오기 실패: " + String(e) });
  }
};

function json(status, body) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=120" },
    body: JSON.stringify(body)
  };
}
