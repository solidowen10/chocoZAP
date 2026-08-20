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
  appendSheetValues,
  readSheetRows,
  readSheetValues,
  updateSheetValues,
  valuesToRows,
};
