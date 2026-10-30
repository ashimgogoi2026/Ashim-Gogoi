const fs = require('fs');
const path = 'src/components/CampaignPlanner.tsx';
let content = fs.readFileSync(path, 'utf8');

const targetStrStart = `    // --- CALCULATE SUMMARY ---`;
const targetStrEnd = `    const summaryCsv = Papa.unparse(summaryRows, { header: false });
    const finalCsv = baseCsv + '\\n' + summaryCsv;

    const blob = new Blob([finalCsv], { type: 'text/csv;charset=utf-8;' });`;

// We'll just replace the whole handleExportCSV function to be safe.
const fullTargetRegex = /const handleExportCSV = \(\) => \{[\s\S]*?document\.body\.removeChild\(link\);\n  \};/;

const newFunc = `const handleExportCSV = () => {
    if (filteredTasks.length === 0) {
      alert("No video plans to export.");
      return;
    }
    const tasksToExport = [...filteredTasks].sort((a, b) => {
      const dateA = a.deadline || a.releaseDate || '9999-99-99';
      const dateB = b.deadline || b.releaseDate || '9999-99-99';
      return new Date(dateA).getTime() - new Date(dateB).getTime();
    });

    const csv = Papa.unparse(tasksToExport.map(t => {
      const influencer: any = influencers.find(i => i.id === t.influencerId) || {};
      
      const res = {
        ...t,
        ...influencer,
        'INFLUENCER NAME': influencer.name || t.secondaryInfluencerName || 'Unknown',
        'Creator': influencer.name || t.secondaryInfluencerName || 'Unknown',
        'Handle': influencer.handle || '',
        'Mobile': influencer.mobile || '',
        'Communication Status': influencer.status || '',
        'Video ID': t.videoId || '',
        'Product': t.title,
        'SHORT.IO LINK': t.shortIoLink || ''
      };
      
      return res;
    }));
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", \`monthly_planner_\${new Date().toLocaleString('en-GB').replace(/[\\/:]/g, '-').replace(', ', '_')}.csv\`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };`;

if(fullTargetRegex.test(content)) {
  content = content.replace(fullTargetRegex, newFunc);
  fs.writeFileSync(path, content, 'utf8');
  console.log('reverted csv summary');
} else {
  console.log('not found');
}
