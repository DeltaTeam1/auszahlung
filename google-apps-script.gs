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
      password: row[7] || '',
      id: row[8] || ''
    })).filter((row) => row.type);

    return ContentService.createTextOutput(JSON.stringify({ ok: true, data }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const payload = JSON.parse(e.postData.contents || '{}');
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName(SHEET_NAME);

    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
    }

    const rows = [
      ['type', 'division', 'recipient', 'amount', 'purpose', 'status', 'timestamp', 'password', 'id']
    ];

    const divisionPasswords = payload.divisionPasswords || {};
    Object.keys(divisionPasswords).forEach((division) => {
      const password = divisionPasswords[division] || '';
      rows.push(['password', division, '', '', '', '', '', password, '']);
    });

    const payoutHistory = payload.payoutHistory || {};
    Object.keys(payoutHistory).forEach((division) => {
      const entries = payoutHistory[division] || [];
      entries.forEach((entry) => {
        const recipient = entry.recipient || '';
        const amount = entry.amount || '';
        const purpose = entry.purpose || '';
        const timestamp = entry.timestamp || '';
        const stableId = entry.id || [recipient, amount, purpose, timestamp].join('|');

        rows.push([
          'transaction',
          division,
          recipient,
          amount,
          purpose,
          entry.status || 'Bearbeitung',
          timestamp,
          '',
          stableId
        ]);
      });
    });

    sheet.clearContents();
    sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);

    return ContentService.createTextOutput(JSON.stringify({ ok: true, message: 'Saved to Google Sheet.' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    try {
      lock.releaseLock();
    } catch (e) {
    }
  }
}
