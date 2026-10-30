const fs = require('fs');
const path = require('path');
const os = require('os');

const backupDir = path.join(os.tmpdir(), 'backups-influencer-manager');
console.log('Checking:', backupDir);

try {
  if (fs.existsSync(backupDir)) {
    const files = fs.readdirSync(backupDir);
    console.log('Files:', files);
    for (const f of files) {
      const p = path.join(backupDir, f);
      const stat = fs.statSync(p);
      console.log(`- ${f} (${stat.size} bytes)`);
      if (f === 'kv_store.json') {
         console.log(fs.readFileSync(p, 'utf-8').slice(0, 500));
      }
    }
  } else {
    console.log('Directory does not exist');
  }
} catch(e) {
  console.log(e);
}
