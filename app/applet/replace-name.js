const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? 
      walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

function processFile(filePath) {
  if (filePath.includes('node_modules') || filePath.includes('.git') || filePath.includes('dist')) {
    return;
  }
  if (!filePath.endsWith('.ts') && !filePath.endsWith('.tsx') && !filePath.endsWith('.json') && !filePath.endsWith('.html') && !filePath.endsWith('.md')) {
    return;
  }
  
  let content = fs.readFileSync(filePath, 'utf8');
  let newContent = content
    .replace(/PRO-TO-GROW INFLUENCER MANAGER/g, 'Influencer Manager')
    .replace(/PRO-TO-GROW/g, 'Influencer Manager')
    .replace(/pro-to-grow/g, 'influencer-manager')
    .replace(/PRO_TO_GROW/g, 'INFLUENCER_MANAGER')
    .replace(/Pro-To-Grow/g, 'Influencer Manager');
  if (content !== newContent) {
    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log(`Updated ${filePath}`);
  }
}

walkDir('./src', processFile);
processFile('./index.html');
if (fs.existsSync('./capacitor.config.ts')) processFile('./capacitor.config.ts');
if (fs.existsSync('./server.ts')) processFile('./server.ts');
if (fs.existsSync('./metadata.json')) processFile('./metadata.json');
if (fs.existsSync('./public/manifest.json')) processFile('./public/manifest.json');
if (fs.existsSync('./security_spec.md')) processFile('./security_spec.md');
