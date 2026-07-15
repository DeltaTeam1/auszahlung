const SPREADSHEET_ID = '1caffNc0TQMuvZTdptFPRnD-5CefuS9Eqs4kr91BkDKY';
const SHEET_NAME = 'Data';

function doGet(e) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
    const rows = sheet.getDataRange().getDisplayValues();
    const data = rows.slice(1).map((row) => ({
      type: row[0] || '',
      division: row[1] || '',
      recipient: row[2] || '',
      amount: row[3] || '',
      purpose: row[4] || '',
      status: row[5] || '',
      timestamp: row[6] || '',
      password: row[7] || ''
    })).filter((row) => row.type);

    return ContentService.createTextOutput(JSON.stringify({ ok: true, data }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || '{}');
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName(SHEET_NAME);

    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
    }

    sheet.clearContents();
    sheet.appendRow(['type', 'division', 'recipient', 'amount', 'purpose', 'status', 'timestamp', 'password']);

    const divisionPasswords = payload.divisionPasswords || {};
    Object.keys(divisionPasswords).forEach((division) => {
      const password = divisionPasswords[division] || '';
      sheet.appendRow(['password', division, '', '', '', '', '', password]);
    });

    const payoutHistory = payload.payoutHistory || {};
    Object.keys(payoutHistory).forEach((division) => {
      const entries = payoutHistory[division] || [];
      entries.forEach((entry) => {
        sheet.appendRow([
          'transaction',
          division,
          entry.recipient || '',
          entry.amount || '',
          entry.purpose || '',
          entry.status || 'Bearbeitung',
          entry.timestamp || '',
          ''
        ]);
      });
    });

    return ContentService.createTextOutput(JSON.stringify({ ok: true, message: 'Saved to Google Sheet.' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
