import fs from 'fs';
const data = JSON.parse(fs.readFileSync('src/initialData.json', 'utf8'));
const tasks = data.tasks || [];
const influencers = data.influencers || [];

console.log(`Total tasks: ${tasks.length}`);
const active = tasks.filter((t: any) => t.status !== 'Cancelled');
console.log(`Active tasks: ${active.length}`);
active.forEach((t: any) => {
    let linkToAdd = t.shortIoLink || t.videoLink1 || t.videoLink2 || t.videoLink3;
    const inf = influencers.find((i: any) => i.id === t.influencerId);
    console.log(`Task ${t.id} - ${inf?.name}: linkToAdd='${linkToAdd}'`);
});
