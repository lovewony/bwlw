// 심부름꾼 4호: 링크프라이스 '잘 팔리는 상품' API로 지마켓 딜을 받아옵니다.
// A코드(사이트코드)는 코드가 아니라 넷리파이 환경변수 LINKPRICE_AFFILIATE_ID 에서 읽어요.
// 비밀키(authkey) 불필요 — A코드만 있으면 됩니다.

var ENDPOINT = "https://api.linkprice.com/popularProducts/affiliateId/";
// 불러올 몰들 (추정 코드 포함, 안 되는 건 자동으로 건너뜀). 쿠팡은 파트너스 직접연동이라 제외.
var MERCHANTS = ["gmarket", "11st", "lotteon", "yes24", "himart", "emart", "ohou"];

function mapMall(mid) {
  var s = (mid || "").toLowerCase();
  if (s.indexOf("gmarket") > -1) return "gmarket";
  if (s.indexOf("11st") > -1) return "11st";
  if (s.indexOf("lotteon") > -1 || s.indexOf("lotte") > -1) return "lotteon";
  if (s.indexOf("emart") > -1 || s.indexOf("ssg") > -1) return "ssg";
  if (s.indexOf("ohou") > -1 || s.indexOf("todayhouse") > -1) return "ohou";
  if (s.indexOf("yes24") > -1) return "etc";
  if (s.indexOf("himart") > -1) return "etc";
  return "etc";
}
function mallName(mid) {
  var s = (mid || "").toLowerCase();
  if (s.indexOf("gmarket") > -1) return "지마켓";
  if (s.indexOf("11st") > -1) return "11번가";
  if (s.indexOf("lotteon") > -1) return "롯데온";
  if (s.indexOf("emart") > -1) return "이마트";
  if (s.indexOf("ohou") > -1) return "오늘의집";
  if (s.indexOf("yes24") > -1) return "예스24";
  if (s.indexOf("himart") > -1) return "하이마트";
  return "쇼핑몰";
}
function toNumber(v) {
  if (v == null) return 0;
  return parseInt(String(v).replace(/[^0-9]/g, ""), 10) || 0;
}
function normalize(item, mid) {
  var now = toNumber(item.sale_price);
  var was = toNumber(item.price);
  if (!was || was < now) was = now;
  return {
    mall: mapMall(item.merchant_id || mid),
    mallName: mallName(item.merchant_id || mid),
    title: item.title || "상품",
    now: now,
    was: was,
    photo: item.image_link || "",
    buyurl: item.click_url || "#", // 지원 님 수익 링크
    commission: ""
  };
}

var cache = { at: 0, data: null };
var TEN_MIN = 10 * 60 * 1000;

exports.handler = async function () {
  var affiliateId = process.env.LINKPRICE_AFFILIATE_ID;
  if (!affiliateId) {
    return json(500, { error: "LINKPRICE_AFFILIATE_ID 환경변수가 설정되지 않았어요." });
  }
  if (cache.data && (Date.now() - cache.at) < TEN_MIN) {
    return json(200, { deals: cache.data, cached: true });
  }

  var url = ENDPOINT + encodeURIComponent(affiliateId);

  // 여러 몰을 동시에 호출, 안 되는 몰은 조용히 건너뜀
  async function fetchMerchant(mid) {
    try {
      var res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "m_id=" + mid + "&discount=Y&per_page=20"
      });
      var data = await res.json();
      if (!res.ok || (data && typeof data.code !== "undefined" && data.code !== 0)) return [];
      var list = (data && data.list) ? data.list : [];
      return list.map(function (it) { return normalize(it, mid); }).filter(function (d) { return d.now > 0; });
    } catch (e) { return []; }
  }

  try {
    var results = await Promise.all(MERCHANTS.map(fetchMerchant));
    var deals = [];
    results.forEach(function (arr) { deals = deals.concat(arr); });
    deals.forEach(function (d) { d.source = "linkprice"; });

    cache = { at: Date.now(), data: deals };
    return json(200, { deals: deals });
  } catch (e) {
    if (cache.data) return json(200, { deals: cache.data, stale: true });
    return json(502, { error: "링크프라이스 받아오기 실패: " + String(e) });
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
