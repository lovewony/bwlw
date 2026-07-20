// ============================================
// BWLW 시트 등록기 (구글 앱스스크립트)
// 구글 시트 → 확장 프로그램 → Apps Script 에 붙여넣으세요.
// ★ 가격기록(여러 줄 한 번에 저장) 기능이 추가됐어요.
//    다시 붙여넣고 "새 배포"를 해주세요!
// ============================================

var DEFAULT_SHEET = "딜정보";

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var sheetName = body.sheet || DEFAULT_SHEET;   // "딜정보" / "행사정보" / "단독기획" / "가격기록"

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    if (!sheet) {
      return out({ success: false, error: "탭을 찾을 수 없어요: " + sheetName });
    }

    // ── 여러 줄 한 번에 저장 (가격기록용) ──
    if (body.rows && body.rows.length) {
      var rows = body.rows;
      var width = rows[0].length;

      // 줄마다 칸 수가 다르면 오류가 나므로 길이를 맞춰줌
      for (var i = 0; i < rows.length; i++) {
        while (rows[i].length < width) rows[i].push("");
        if (rows[i].length > width) rows[i] = rows[i].slice(0, width);
      }

      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, width).setValues(rows);
      return out({ success: true, added: rows.length });
    }

    // ── 한 줄 저장 (기존 딜/기획전/단독 등록 — 그대로 동작) ──
    var row = body.row;
    if (!row || !row.length) {
      return out({ success: false, error: "row 없음" });
    }
    sheet.appendRow(row);
    return out({ success: true });

  } catch (err) {
    return out({ success: false, error: String(err) });
  }
}

function doGet() {
  return ContentService.createTextOutput("BWLW 시트 등록기 작동 중 (딜정보 + 행사정보 + 단독기획 + 가격기록)");
}

function out(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
