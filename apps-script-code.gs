// ============================================
// BWLW 시트 등록기 (구글 앱스스크립트)
// 구글 시트 → 확장 프로그램 → Apps Script 에 붙여넣으세요.
// ★ 기획전 등록이 추가되어 코드가 바뀌었어요. 다시 붙여넣고 "새 배포" 해주세요!
// ============================================

var DEFAULT_SHEET = "딜정보";

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var row = body.row;
    var sheetName = body.sheet || DEFAULT_SHEET;   // "딜정보" 또는 "행사정보"

    if (!row || !row.length) {
      return out({ success: false, error: "row 없음" });
    }

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    if (!sheet) {
      return out({ success: false, error: "탭을 찾을 수 없어요: " + sheetName });
    }

    sheet.appendRow(row);
    return out({ success: true });
  } catch (err) {
    return out({ success: false, error: String(err) });
  }
}

function doGet() {
  return ContentService.createTextOutput("BWLW 시트 등록기 작동 중 (딜정보 + 행사정보)");
}

function out(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
