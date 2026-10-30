import fs from 'fs';
const tasksStr = fs.readFileSync('src/data.ts', 'utf-8');
console.log(tasksStr.substring(0, 500));
