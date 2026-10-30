import fs from 'fs';
const data = fs.readFileSync('src/mockData.ts', 'utf8');
const match = data.match(/export const INITIAL_TASKS: Task\[\] = (\[[\s\S]*?\]);/);
if (match) {
  const tasksStr = match[1];
  // we can just run eval or parse it
  // Actually, easiest to just compile and run it
}
