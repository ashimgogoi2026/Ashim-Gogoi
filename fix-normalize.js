const fs = require('fs');

function fixFile(file) {
  let content = fs.readFileSync(file, 'utf8');
  const target = "const normalize = (u?: string) => (u || '').trim().toLowerCase();";
  const replacement = "const normalize = (u?: string) => { if (!u) return ''; let v = u.trim().toLowerCase(); v = v.replace(/^https?:\\/\\//, ''); v = v.replace(/^www\\./, ''); return v.replace(/\\/+$/, ''); };";
  
  if (content.includes(target)) {
     content = content.split(target).join(replacement);
     fs.writeFileSync(file, content, 'utf8');
     console.log('Fixed', file);
  } else {
     console.log('Not found in', file);
  }
}

fixFile('src/components/ShortioTracker.tsx');
fixFile('src/components/VideoCampaignDashboard.tsx');
