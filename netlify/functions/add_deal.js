// 심부름꾼 6호: 관리자 페이지에서 등록한 딜을 구글 시트(딜정보 탭)에 한 줄 추가합니다.
// 구글 앱스스크립트 주소는 넷리파이 환경변수 APPS_SCRIPT_URL 에서 읽어요.
// 시트 열 순서(A~K): 상품명 | 지금가격 | 정상가 | 이미지주소 | 상품링크 | 몰 | 등급 | 시작시간 | 종료시간 | 카드정보 | 구분

var ALLOWED_MALLS = ["coupang", "gmarket", "11st", "ohou", "lotteon", "ssg", "kakao", "toss", "naver", "momq", "oliveyoung", "etc"];

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return json(405, { success: false, error: "POST만 가능해요." });
  }

  var url = process.env.APPS_SCRIPT_URL;
  if (!url) {
    return json(500, { success: false, error: "APPS_SCRIPT_URL 환경변수가 설정되지 않았어요." });
  }

  try {
    var d = JSON.parse(event.body || "{}");

    // ── 바이웰 단독 (단독기획 탭) ──
    if (d.isSingle) {
      var sgName = String(d.name || "").trim();
      var sgUrl = String(d.url || "").trim();
      if (!sgName || !sgUrl) {
        return json(400, { success: false, error: "행사명·참여링크는 필수예요." });
      }
      // 단독기획 A~F: 행사명 | 유형 | 진행기간 | 참여링크 | 배너이미지 | 상세설명
      var sgRow = [
        sgName,
        String(d.type || "공동구매").trim(),
        String(d.period || "").trim(),
        sgUrl,
        String(d.banner || "").trim(),
        String(d.detail || "").trim()
      ];
      var sgRes = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ row: sgRow, sheet: "단독기획" })
      });
      var sgText = await sgRes.text();
      if (!sgRes.ok || sgText.indexOf("false") > -1) {
        return json(502, { success: false, error: "단독 등록 실패: " + sgText.slice(0, 120) });
      }
      return json(200, { success: true });
    }

    // ── 기획전(행사정보 탭) ──
    if (d.isEvent) {
      var evName = String(d.name || "").trim();
      var evUrl = String(d.url || "").trim();
      if (!evName || !evUrl) {
        return json(400, { success: false, error: "행사명·행사링크는 필수예요." });
      }
      var evMall = String(d.mall || "etc").trim().toLowerCase();
      if (ALLOWED_MALLS.indexOf(evMall) === -1) evMall = "etc";

      // 행사정보 A~F: 행사명 | 몰 | 종료일 | 행사링크 | 배너이미지 | 안내문구
      var evRow = [
        evName,
        evMall,
        String(d.endDate || "").trim(),
        evUrl,
        String(d.banner || "").trim(),
        String(d.info || "").trim()
      ];
      var evRes = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ row: evRow, sheet: "행사정보" })
      });
      var evText = await evRes.text();
      if (!evRes.ok || evText.indexOf("false") > -1) {
        return json(502, { success: false, error: "기획전 등록 실패: " + evText.slice(0, 120) });
      }
      return json(200, { success: true });
    }

    var title = String(d.title || "").trim();
    var price = parseInt(String(d.price || "").replace(/[^0-9]/g, ""), 10) || 0;
    var link = String(d.link || "").trim();
    if (!title || !price || !link) {
      return json(400, { success: false, error: "상품명·가격·링크는 필수예요." });
    }

    var mall = String(d.mall || "etc").trim().toLowerCase();
    if (ALLOWED_MALLS.indexOf(mall) === -1) mall = "etc";

    var grade = String(d.grade || "").trim().toLowerCase();
    if (grade !== "hot" && grade !== "good") grade = "";

    var was = parseInt(String(d.was || "").replace(/[^0-9]/g, ""), 10) || "";
    if (was && was < price) was = "";

    // 시트 A~M 순서 그대로 한 줄
    var row = [
      title,                          // A 상품명
      price,                          // B 지금가격
      was,                            // C 정상가
      String(d.photo || "").trim(),   // D 이미지주소
      link,                           // E 상품링크
      mall,                           // F 몰
      grade,                          // G 등급
      String(d.startAt || "").trim(), // H 시작시간
      String(d.endAt || "").trim(),   // I 종료시간
      String(d.cardInfo || "").trim(),// J 카드정보
      String(d.kind || "").trim(),    // K 구분
      String(d.tags || "").trim(),    // L 태그
      String(d.hasOptions || "").trim() // M 옵션
    ];

    var res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ row: row, sheet: "딜정보" })
    });

    var text = await res.text();
    var ok = res.ok && text.indexOf("false") === -1;
    if (!ok) {
      return json(502, { success: false, error: "구글 시트 등록 실패: " + text.slice(0, 120) });
    }
    return json(200, { success: true });
  } catch (e) {
    return json(500, { success: false, error: String(e) });
  }
};

function json(status, body) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body)
  };
}
