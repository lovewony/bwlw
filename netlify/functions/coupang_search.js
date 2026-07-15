// 심부름꾼 8호: 쿠팡 상품 검색으로 사진·정상가를 찾아옵니다.
// 관리자에서 딜을 등록할 때, 상품명으로 검색해 사진을 자동으로 채우는 용도예요.
// 사용: /.netlify/functions/coupang_search?q=상품명

const crypto = require("crypto");

var DOMAIN = "https://api-gateway.coupang.com";
var SEARCH_PATH = "/v2/providers/affiliate_open_api/apis/openapi/v1/products/search";

function makeAuth(method, urlpath, accessKey, secretKey) {
  var now = new Date();
  var p = function (n) { return (n < 10 ? "0" : "") + n; };
  var datetime =
    String(now.getUTCFullYear()).slice(2) + p(now.getUTCMonth() + 1) + p(now.getUTCDate()) +
    "T" + p(now.getUTCHours()) + p(now.getUTCMinutes()) + p(now.getUTCSeconds()) + "Z";

  var parts = urlpath.split("?");
  var path = parts[0];
  var query = parts.length > 1 ? parts[1] : "";

  var message = datetime + method + path + query;
  var signature = crypto.createHmac("sha256", secretKey).update(message).digest("hex");

  return "CEA algorithm=HmacSHA256, access-key=" + accessKey +
    ", signed-date=" + datetime + ", signature=" + signature;
}

function toNumber(v) {
  if (v == null) return 0;
  return parseInt(String(v).replace(/[^0-9]/g, ""), 10) || 0;
}

// 제목 비교용: 특수문자·공백 제거
function norm(s) {
  return (s || "").replace(/\[[^\]]*\]/g, "").replace(/[^가-힣a-zA-Z0-9]/g, "").toLowerCase();
}
// 두 제목이 얼마나 겹치는지 (0~1)
function similarity(a, b) {
  a = norm(a); b = norm(b);
  if (!a || !b) return 0;
  var short = a.length < b.length ? a : b;
  var long = a.length < b.length ? b : a;
  var hit = 0;
  // 2글자씩 잘라 겹치는 비율
  for (var i = 0; i < short.length - 1; i++) {
    if (long.indexOf(short.substr(i, 2)) > -1) hit++;
  }
  return short.length > 1 ? hit / (short.length - 1) : 0;
}

exports.handler = async function (event) {
  var accessKey = process.env.COUPANG_ACCESS_KEY;
  var secretKey = process.env.COUPANG_SECRET_KEY;
  if (!accessKey || !secretKey) {
    return json(500, { error: "쿠팡 키가 설정되지 않았어요." });
  }

  var q = (event.queryStringParameters && event.queryStringParameters.q) || "";
  q = q.trim();
  if (!q) return json(400, { error: "검색어(q)가 필요해요." });

  // 검색어가 너무 길면 앞부분만 (쿠팡 검색이 잘 되도록)
  var keyword = q.split(/[,·/]/)[0].trim().slice(0, 40);

  var urlpath = SEARCH_PATH + "?keyword=" + encodeURIComponent(keyword) + "&limit=10";
  var auth = makeAuth("GET", urlpath, accessKey, secretKey);

  try {
    var res = await fetch(DOMAIN + urlpath, {
      method: "GET",
      headers: { Authorization: auth, "Content-Type": "application/json" }
    });
    var data = await res.json();

    if (!res.ok || !data || !data.data) {
      return json(200, { found: false, reason: "검색 결과 없음" });
    }

    var list = (data.data.productData || []);
    if (!list.length) return json(200, { found: false, reason: "결과 없음" });

    // 원래 상품명과 가장 비슷한 것 고르기
    var best = null, bestScore = 0;
    list.forEach(function (it) {
      var s = similarity(q, it.productName);
      if (s > bestScore) { bestScore = s; best = it; }
    });

    // 너무 안 비슷하면 안 쓰는 게 나아요 (엉뚱한 사진 방지)
    if (!best || bestScore < 0.45) {
      return json(200, { found: false, reason: "비슷한 상품 없음", score: bestScore });
    }

    return json(200, {
      found: true,
      score: Math.round(bestScore * 100) / 100,
      title: best.productName || "",
      photo: best.productImage || "",
      price: toNumber(best.productPrice),
      url: best.productUrl || ""
    });
  } catch (e) {
    return json(502, { found: false, error: String(e) });
  }
};

function json(status, body) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body)
  };
}
