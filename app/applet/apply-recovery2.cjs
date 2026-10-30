const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const backupDir = path.join(os.tmpdir(), 'backups-influencer-manager');
const kvFile = path.join(backupDir, 'kv_store.json');
const data = JSON.parse(fs.readFileSync(kvFile, 'utf-8'));
const suffix = '_b4WqNgDLrUfBMBkPwKK6SmPfEZF2'; // user UID

const bulk = {};

const collections = [
  'INFS', 'CAMPS', 'TSKS', 'MSGS', 'CONTS', 'BILLS', 'AOV_ENTRIES', 'MONTHLY_TARGETS', 'DASHBOARD_PRODUCTS'
];

for (const col of collections) {
  const key = `INFLUENCER_MANAGER_${col}`;
  const userKey = `${key}${suffix}`;
  
  if (data[userKey]) {
    bulk[key] = data[userKey];
    bulk[`${key}_guest`] = data[userKey];
  }
}

const req = http.request({
  hostname: '127.0.0.1',
  port: 3000,
  path: '/api/kv-store',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
}, (res) => {
  let resData = '';
  res.on('data', chunk => resData += chunk);
  res.on('end', () => console.log('Response:', resData));
});

req.on('error', err => console.error(err));
req.write(JSON.stringify({ bulk, overwrite: false }));
req.end();
