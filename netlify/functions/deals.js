// 심부름꾼: 애드픽 핫딜 API를 받아와 bwlw 카드 모양으로 정리해 돌려줍니다.
// affid는 화면(공개)이 아니라 넷리파이 환경변수(ADPICK_AFFID)에서 읽습니다.

// 애드픽이 알려주는 mall_name -> 우리 플랫폼 배지 id 로 연결
function mapMall(mallName, mallDomain) {
  var s = ((mallName || "") + " " + (mallDomain || "")).toLowerCase();
  if (s.indexOf("쿠팡") > -1 || s.indexOf("coupang") > -1) return "coupang";
  if (s.indexOf("지마켓") > -1 || s.indexOf("gmarket") > -1) return "gmarket";
  if (s.indexOf("11") > -1 || s.indexOf("11st") > -1) return "11st";
  if (s.indexOf("오늘의집") > -1 || s.indexOf("ohou") > -1) return "ohou";
  if (s.indexOf("롯데") > -1 || s.indexOf("lotte") > -1) return "lotteon";
  if (s.indexOf("ssg") > -1 || s.indexOf("신세계") > -1) return "ssg";
  if (s.indexOf("카카오") > -1 || s.indexOf("kakao") > -1) return "kakao";
  return "etc"; // 못 찾으면 기타로
}

function toNumber(v) {
  if (v == null) return 0;
  return parseInt(String(v).replace(/[^0-9]/g, ""), 10) || 0;
}

// 받아온 원본 딜을 우리 카드가 아는 모양으로 변환
function normalize(item) {
  var now = toNumber(item.price_sale);
  var was = toNumber(item.price_org);
  if (!was || was < now) was = now; // 정상가가 없거나 이상하면 판매가로
  return {
    mall: mapMall(item.mall_name, item.mall),
    mallName: item.mall_name || "", // 애드픽이 준 진짜 판매처 이름
    title: item.product_name || "상품",
    now: now,
    was: was,
    photo: item.photo || "",
    buyurl: item.buyurl || "#", // 지원 님 수익 링크
    commission: item.commission || ""
  };
}

// 유사 상품을 이름 기준으로 하나로 묶고, 가장 싼 걸 대표로 (폴센트 스타일)
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
      var kept = map[k].variants;         // 기존 비교 목록 유지
      map[k] = Object.assign({}, d, { variants: kept }); // 더 싼 걸 대표로 교체
    }
    map[k].variants.push({ mallName: d.mallName, price: d.now, url: d.buyurl });
  });
  return Object.keys(map).map(function (k) { return map[k]; });
}

// 10분 캐시 (애드픽 규정: 1분에 1회 이하 호출)
var cache = { at: 0, data: null };
var TEN_MIN = 10 * 60 * 1000;

exports.handler = async function () {
  var affid = process.env.ADPICK_AFFID;
  if (!affid) {
    return json(500, { error: "ADPICK_AFFID 환경변수가 설정되지 않았어요." });
  }

  // 캐시가 살아있으면 그대로 돌려줌 (애드픽 과호출 방지)
  if (cache.data && (Date.now() - cache.at) < TEN_MIN) {
    return json(200, { deals: cache.data, cached: true });
  }

  var url = "https://adpick.co.kr/apis/sdk_shopping_hotdeal.php?affid=" + encodeURIComponent(affid);

  try {
    var res = await fetch(url, { headers: { "User-Agent": "bwlw/1.0" } });
    if (!res.ok) {
      // 실패하면 이전 캐시라도 있으면 그거라도 줌
      if (cache.data) return json(200, { deals: cache.data, stale: true });
      return json(502, { error: "애드픽 응답 오류: " + res.status });
    }
    var raw = await res.json();

    // 애드픽 응답: [ { title, description, list: [ {상품들...} ] } ]
    var block = Array.isArray(raw) ? raw[0] : raw;
    var list = (block && block.list) ? block.list : [];
    var deals = list.map(normalize).filter(function (d) { return d.now > 0; });
    deals.forEach(function (d) { d.source = "adpick"; }); // 출처 표시

    cache = { at: Date.now(), data: deals };
    return json(200, { deals: deals });
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
