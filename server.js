// server.js
require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const { attachUser } = require('./middleware/auth');
const { startNotifyCron } = require('./cron/notify');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';

app.use(cors({ origin: process.env.APP_URL || true, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(attachUser);

app.use(require('./routes/auth'));
app.use(express.static(path.join(__dirname, 'public')));

// Public location report API
app.use(require('./routes/location-report'));
app.use(require('./routes/location-sheet-sync'));

// Authenticated APIs
app.use(require('./routes/orgs'));
app.use(require('./routes/stages'));
app.use(require('./routes/locations'));
app.use(require('./routes/notifications'));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`Expansion tracker running on http://${HOST}:${PORT}`);
  if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_CRON === '1') {
    startNotifyCron();
  } else {
    console.log('[cron] not started (set ENABLE_CRON=1 to enable in this environment)');
  }
});
