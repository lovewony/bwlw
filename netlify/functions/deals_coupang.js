// 심부름꾼 2호: 쿠팡 파트너스 '골드박스'(오늘의 특가)를 받아옵니다.
// 쿠팡은 요청마다 HMAC 서명이 필요해요. 그 복잡한 부분을 여기서 처리합니다.
// 키 두 개는 코드가 아니라 넷리파이 환경변수에서 읽어요:
//   COUPANG_ACCESS_KEY, COUPANG_SECRET_KEY

const crypto = require("crypto");

var DOMAIN = "https://api-gateway.coupang.com";
var PATH = "/v2/providers/affiliate_open_api/apis/openapi/v1/products/goldbox";

// 쿠팡 규격의 HMAC 서명(Authorization 헤더) 만들기
function makeAuth(method, urlpath, accessKey, secretKey) {
  // 쿠팡은 'yyMMdd'T'HHmmss'Z'' (GMT) 형식의 시간을 씁니다.
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

// 쿠팡 골드박스 상품 -> 우리 카드 모양으로 변환
function normalize(item) {
  var now = toNumber(item.productPrice);
  var was = toNumber(item.productBasePrice || item.basePrice);
  if (!was || was < now) was = now;
  return {
    mall: "coupang",
    mallName: "쿠팡",
    title: item.productName || "상품",
    now: now,
    was: was,
    photo: item.productImage || "",
    buyurl: item.productUrl || "#", // 이미 내 파트너스 링크가 포함되어 옵니다
    commission: "",
    grade: "gold" // 쿠팡 골드박스 특가 표시
  };
}

// 유사 상품을 이름 기준으로 하나로 묶고, 가장 싼 걸 대표로
function groupKey(title) {
  return (title || "").replace(/\[.*?\]/g, "").replace(/\s+/g, "").slice(0, 14);
}
function groupDeals(deals) {
  var map = {};
  deals.forEach(function (d) {
    var k = groupKey(d.title);
    if (!k) { k = d.title + Math.random(); }
    if (!map[k]) {
      map[k] = Object.assign({}, d, { variants: [] });
    } else if (d.now < map[k].now) {
      var kept = map[k].variants;
      map[k] = Object.assign({}, d, { variants: kept });
    }
    map[k].variants.push({ mallName: d.mallName, price: d.now, url: d.buyurl });
  });
  return Object.keys(map).map(function (k) { return map[k]; });
}

// 10분 캐시 (쿠팡 호출 제한 대비)
var cache = { at: 0, data: null };
var TEN_MIN = 10 * 60 * 1000;

exports.handler = async function () {
  var accessKey = process.env.COUPANG_ACCESS_KEY;
  var secretKey = process.env.COUPANG_SECRET_KEY;
  if (!accessKey || !secretKey) {
    return json(500, { error: "COUPANG_ACCESS_KEY / COUPANG_SECRET_KEY 환경변수가 필요해요." });
  }

  if (cache.data && (Date.now() - cache.at) < TEN_MIN) {
    return json(200, { deals: cache.data, cached: true });
  }

  var authorization = makeAuth("GET", PATH, accessKey, secretKey);

  try {
    var res = await fetch(DOMAIN + PATH, {
      method: "GET",
      headers: {
        "Authorization": authorization,
        "Content-Type": "application/json;charset=UTF-8"
      }
    });
    var body = await res.json();

    if (!res.ok || (body && body.rCode && body.rCode !== "0")) {
      if (cache.data) return json(200, { deals: cache.data, stale: true });
      return json(502, { error: "쿠팡 응답 오류", detail: (body && body.rMessage) || res.status });
    }

    var list = (body && body.data) ? body.data : [];
    var deals = list.map(normalize).filter(function (d) { return d.now > 0; });
    var grouped = groupDeals(deals);

    cache = { at: Date.now(), data: grouped };
    return json(200, { deals: grouped });
  } catch (e) {
    if (cache.data) return json(200, { deals: cache.data, stale: true });
    return json(502, { error: "받아오기 실패: " + String(e) });
  }
};

function json(status, body) {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300"
    },
    body: JSON.stringify(body)
  };
}
