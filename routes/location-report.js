const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

const DATA_FILE = path.join(
  __dirname,
  '..',
  'data',
  'location-report.json'
);

router.get('/api/location-report', (req, res) => {
  try {
    const data = JSON.parse(
      fs.readFileSync(DATA_FILE, 'utf8')
    );

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: 'Unable to read location report'
    });
  }
});

router.post('/api/location-report', (req, res) => {
  const token = req.headers.authorization;

  if (
    !process.env.LOCATION_SYNC_TOKEN ||
    token !== `Bearer ${process.env.LOCATION_SYNC_TOKEN}`
  ) {
    return res.status(401).json({
      error: 'Unauthorized'
    });
  }

  if (!req.body || !Array.isArray(req.body.locations)) {
    return res.status(400).json({
      error: 'locations must be an array'
    });
  }

  const output = {
    updatedAt: new Date().toISOString(),
    updatedBy:
      req.body.updatedBy ||
      'chocoZAP Taiwan Assistant (AI)',
    locations: req.body.locations
  };

  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(output, null, 2),
    'utf8'
  );

  res.json({
    ok: true,
    count: output.locations.length,
    updatedAt: output.updatedAt
  });
});

module.exports = router;
