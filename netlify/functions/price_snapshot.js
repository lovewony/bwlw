// ============================================
// 가격 기록 (하루 1회 자동 실행)
// 시트에 등록된 딜들의 "오늘 가격"을 구글 시트 '가격기록' 탭에 쌓아둡니다.
// 나중에 이 기록이 쌓이면 "최근 N개월 최저가" 같은 걸 보여줄 수 있어요.
//
// 실행 주기는 netlify.toml 에서 정합니다.
// 필요한 것: 구글 시트에 '가격기록' 탭 (없으면 기록 실패)
// ============================================

// 한국 시간 기준 "2026-07-20 09:00" 형태
function kstStamp() {
  var d = new Date(Date.now() + 9 * 60 * 60 * 1000); // UTC + 9시간
  function p(n) { return String(n).padStart(2, "0"); }
  return d.getUTCFullYear() + "-" + p(d.getUTCMonth() + 1) + "-" + p(d.getUTCDate())
       + " " + p(d.getUTCHours()) + ":" + p(d.getUTCMinutes());
}

// 한국 시간 기준 "2026-07-20" (날짜만 — 하루 중복 방지/집계용)
function kstDate() {
  return kstStamp().slice(0, 10);
}

exports.handler = async function () {
  var appsUrl = process.env.APPS_SCRIPT_URL;
  if (!appsUrl) {
    console.log("[가격기록] APPS_SCRIPT_URL 환경변수가 없어요.");
    return { statusCode: 500, body: "APPS_SCRIPT_URL 없음" };
  }

  var site = process.env.URL || "https://bwlw.kr";

  // 1) 내 시트에 등록된 딜 전부 가져오기
  var deals = [];
  try {
    var res = await fetch(site + "/.netlify/functions/deals_sheet?all=1");
    var j = await res.json();
    deals = (j && j.deals) ? j.deals : [];
  } catch (e) {
    console.log("[가격기록] 딜 불러오기 실패:", String(e));
    return { statusCode: 500, body: "딜 불러오기 실패" };
  }

  if (!deals.length) {
    console.log("[가격기록] 기록할 딜이 없어요.");
    return { statusCode: 200, body: "기록할 딜 없음" };
  }

  // 2) 같은 상품(링크 기준)이 여러 줄이면 한 번만 기록
  var seen = {};
  var unique = [];
  deals.forEach(function (d) {
    var key = (d.buyurl && d.buyurl !== "#") ? d.buyurl : ("title:" + (d.title || ""));
    if (!key || seen[key]) return;
    seen[key] = 1;
    unique.push(d);
  });

  // 3) 기록할 줄 만들기
  //    A:기록시각  B:날짜  C:상품명  D:쇼핑몰  E:판매가  F:정상가  G:링크
  var stamp = kstStamp();
  var day = kstDate();
  var rows = unique.map(function (d) {
    return [
      stamp,
      day,
      (d.title || "").slice(0, 200),
      d.mallName || d.mall || "",
      Number(d.now) || 0,
      Number(d.was) || 0,
      d.buyurl || ""
    ];
  });

  // 4) 구글 시트 '가격기록' 탭에 한 번에 저장
  try {
    var post = await fetch(appsUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sheet: "가격기록", rows: rows })
    });
    var pj = await post.json();
    if (pj && pj.success) {
      console.log("[가격기록] " + rows.length + "개 딜 가격을 기록했어요. (" + stamp + ")");
      return { statusCode: 200, body: "기록 완료: " + rows.length + "건" };
    }
    console.log("[가격기록] 저장 실패:", JSON.stringify(pj));
    return { statusCode: 500, body: "저장 실패: " + ((pj && pj.error) || "알 수 없음") };
  } catch (e) {
    console.log("[가격기록] 시트 전송 실패:", String(e));
    return { statusCode: 500, body: "시트 전송 실패" };
  }
};
