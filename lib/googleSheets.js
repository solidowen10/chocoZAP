const { google } = require('googleapis');

const SPREADSHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

let sheetsClient = null;

function requireGoogleCredentials() {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS is not configured');
  }
}

function sheetRange(sheetName, range = 'A:ZZ') {
  const safeSheetName = String(sheetName || '').replace(/'/g, "''");
  return `'${safeSheetName}'!${range}`;
}

function getSheetsClient() {
  requireGoogleCredentials();

  if (!sheetsClient) {
    const auth = new google.auth.GoogleAuth({
      scopes: [SPREADSHEETS_SCOPE],
    });

    sheetsClient = google.sheets({ version: 'v4', auth });
  }

  return sheetsClient;
}

async function ensureSheetExists(spreadsheetId, sheetName) {
  if (!spreadsheetId) throw new Error('spreadsheetId is not configured');
  if (!sheetName) throw new Error('sheetName is not configured');

  const sheets = getSheetsClient();

  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties.title',
  });

  const exists = (response.data.sheets || []).some(
    (sheet) => sheet.properties?.title === sheetName,
  );

  if (exists) return { created: false, sheetName };

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: { title: sheetName },
          },
        },
      ],
    },
  });

  return { created: true, sheetName };
}

async function formatShortlistSheet(spreadsheetId, sheetName) {
  const sheets = getSheetsClient();

  const metadata = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties(sheetId,title)',
  });

  const sheet = (metadata.data.sheets || []).find(
    (item) => item.properties?.title === sheetName,
  );

  if (!sheet) throw new Error(`Sheet not found: ${sheetName}`);

  const sheetId = sheet.properties.sheetId;

  const numberFormatRequest = (startColumnIndex, endColumnIndex, pattern) => ({
    repeatCell: {
      range: {
        sheetId,
        startRowIndex: 1,
        startColumnIndex,
        endColumnIndex,
      },
      cell: {
        userEnteredFormat: {
          numberFormat: {
            type: 'NUMBER',
            pattern,
          },
        },
      },
      fields: 'userEnteredFormat.numberFormat',
    },
  });

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        // H 月租
        numberFormatRequest(7, 8, '"NT$"#,##0'),

        // I 總坪數
        numberFormatRequest(8, 9, '#,##0.##'),

        // J 每坪月租 TWD
        numberFormatRequest(9, 10, '"NT$"#,##0'),

        // K 每坪月租 JPY
        numberFormatRequest(10, 11, '"¥"#,##0'),

        // M 捷運距離
        numberFormatRequest(12, 13, '#,##0'),

        // N 初篩分數
        numberFormatRequest(13, 14, '0.##'),

        // V TWD -> JPY rate
        numberFormatRequest(21, 22, '0.0000'),

        // Freeze header row + source / 591 ID columns.
        {
          updateSheetProperties: {
            properties: {
              sheetId,
              gridProperties: {
                frozenRowCount: 1,
                frozenColumnCount: 2,
              },
            },
            fields: 'gridProperties.frozenRowCount,gridProperties.frozenColumnCount',
          },
        },

        // Body rows must never inherit header bold formatting.
        {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 1,
              startColumnIndex: 0,
              endColumnIndex: 23,
            },
            cell: {
              userEnteredFormat: {
                textFormat: {
                  bold: false,
                },
              },
            },
            fields: 'userEnteredFormat.textFormat.bold',
          },
        },

        // A:O — platform-managed header.
        {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 0,
              endRowIndex: 1,
              startColumnIndex: 0,
              endColumnIndex: 15,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: {
                  red: 0.90,
                  green: 0.92,
                  blue: 0.95,
                },
                textFormat: {
                  bold: true,
                },
                verticalAlignment: 'MIDDLE',
              },
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment)',
          },
        },

        // P:U — broker-editable header.
        {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 0,
              endRowIndex: 1,
              startColumnIndex: 15,
              endColumnIndex: 21,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: {
                  red: 1.0,
                  green: 0.90,
                  blue: 0.55,
                },
                textFormat: {
                  bold: true,
                },
                verticalAlignment: 'MIDDLE',
              },
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment)',
          },
        },

        // P:U — lightly highlight broker input area.
        {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 1,
              startColumnIndex: 15,
              endColumnIndex: 21,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: {
                  red: 1.0,
                  green: 0.98,
                  blue: 0.88,
                },
              },
            },
            fields: 'userEnteredFormat.backgroundColor',
          },
        },

        // V:W — FX metadata header.
        {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 0,
              endRowIndex: 1,
              startColumnIndex: 21,
              endColumnIndex: 23,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: {
                  red: 0.90,
                  green: 0.92,
                  blue: 0.95,
                },
                textFormat: {
                  bold: true,
                },
                verticalAlignment: 'MIDDLE',
              },
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment)',
          },
        },

        // Strong divider before P (broker section).
        {
          updateBorders: {
            range: {
              sheetId,
              startColumnIndex: 15,
              endColumnIndex: 16,
            },
            left: {
              style: 'SOLID_THICK',
              color: {
                red: 0.85,
                green: 0.65,
                blue: 0.10,
              },
            },
          },
        },

        // Divider before V (FX metadata section).
        {
          updateBorders: {
            range: {
              sheetId,
              startColumnIndex: 21,
              endColumnIndex: 22,
            },
            left: {
              style: 'SOLID_MEDIUM',
              color: {
                red: 0.55,
                green: 0.60,
                blue: 0.65,
              },
            },
          },
        },
      ],
    },
  });
}

async function orderSheetsByNames(spreadsheetId, orderedNames = []) {
  const sheets = getSheetsClient();

  const metadata = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties(sheetId,title,index)',
  });

  const allSheets = (metadata.data.sheets || []).map(
    (item) => item.properties,
  );

  const targetSheets = orderedNames
    .map((name) => allSheets.find((sheet) => sheet.title === name))
    .filter(Boolean);

  if (!targetSheets.length) return;

  // Keep unrelated tabs where they are; reorder only the shortlist block.
  const baseIndex = Math.min(...targetSheets.map((sheet) => sheet.index));

  const requests = targetSheets.map((sheet, i) => ({
    updateSheetProperties: {
      properties: {
        sheetId: sheet.sheetId,
        index: baseIndex + i,
      },
      fields: 'index',
    },
  }));

  if (!requests.length) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests },
  });
}

async function readSheetValues(spreadsheetId, sheetName, range = 'A:ZZ') {
  if (!spreadsheetId) throw new Error('spreadsheetId is not configured');
  if (!sheetName) throw new Error('sheetName is not configured');

  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: sheetRange(sheetName, range),
  });

  return response.data.values || [];
}

function valuesToRows(values) {
  if (!Array.isArray(values) || values.length === 0) return [];

  const headers = values[0].map((value) => String(value || '').trim());

  return values.slice(1).map((row) => {
    const item = {};

    headers.forEach((header, index) => {
      if (!header) return;
      item[header] = row[index] == null ? '' : row[index];
    });

    return item;
  });
}

async function readSheetRows(spreadsheetId, sheetName, range = 'A:ZZ') {
  return valuesToRows(await readSheetValues(spreadsheetId, sheetName, range));
}

async function batchUpdateSheetValues(spreadsheetId, sheetName, updates = [], options = {}) {
  if (!spreadsheetId) throw new Error('spreadsheetId is not configured');
  if (!sheetName) throw new Error('sheetName is not configured');

  const sheets = getSheetsClient();

  const data = (updates || []).map((update) => ({
    range: sheetRange(sheetName, update.range),
    values: update.values || [],
  }));

  if (!data.length) return null;

  const response = await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: options.valueInputOption || 'RAW',
      data,
    },
  });

  return response.data;
}

async function updateSheetValues(spreadsheetId, sheetName, range, values, options = {}) {
  if (!spreadsheetId) throw new Error('spreadsheetId is not configured');
  if (!sheetName) throw new Error('sheetName is not configured');
  if (!range) throw new Error('range is not configured');

  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: sheetRange(sheetName, range),
    valueInputOption: options.valueInputOption || 'RAW',
    requestBody: { values: values || [] },
  });

  return response.data;
}

async function appendSheetValues(spreadsheetId, sheetName, values, range = 'A:ZZ', options = {}) {
  if (!spreadsheetId) throw new Error('spreadsheetId is not configured');
  if (!sheetName) throw new Error('sheetName is not configured');

  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: sheetRange(sheetName, range),
    valueInputOption: options.valueInputOption || 'RAW',
    insertDataOption: options.insertDataOption || 'INSERT_ROWS',
    requestBody: { values: values || [] },
  });

  return response.data;
}

module.exports = {
  SPREADSHEETS_SCOPE,
  ensureSheetExists,
  formatShortlistSheet,
  orderSheetsByNames,
  appendSheetValues,
  batchUpdateSheetValues,
  readSheetRows,
  readSheetValues,
  updateSheetValues,
  valuesToRows,
};
