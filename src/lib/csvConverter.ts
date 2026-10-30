import Papa from 'papaparse';

export function dataToCsv(data: any): string {
  let csvRows = [];
  
  for (const key of Object.keys(data)) {
    const tableData = data[key];
    if (!Array.isArray(tableData)) continue;
    
    // Add table marker
    csvRows.push([`--- TABLE: ${key.toUpperCase()} ---`]);
    
    if (tableData.length === 0) {
      csvRows.push(['No data']);
      csvRows.push([]);
      continue;
    }
    
    // Extract headers (all unique keys)
    const allKeys = new Set<string>();
    tableData.forEach(row => {
      Object.keys(row).forEach(k => allKeys.add(k));
    });
    const headers = Array.from(allKeys);
    
    // Convert to unparse format
    const unparsed = Papa.unparse({
      fields: headers,
      data: tableData.map(row => {
        const newRow: any = {};
        headers.forEach(h => {
          const val = row[h];
          if (val === null || val === undefined) newRow[h] = '';
          else if (typeof val === 'object') newRow[h] = JSON.stringify(val);
          else newRow[h] = String(val);
        });
        return newRow;
      })
    }, { header: true });
    
    csvRows.push([unparsed]);
    csvRows.push([]);
  }
  
  return csvRows.map(row => row.join(',')).join('\n');
}

export function csvToData(csvString: string): any {
  const lines = csvString.split(/\r?\n/);
  const data: any = {};
  
  let currentTable = null;
  let currentTableCsvLines: string[] = [];
  let hasTableMarkers = false;
  
  for (let i = 0; i < lines.length; i++) {
    // robustly clean line (strip BOM, quotes, and whitespace)
    let rawLine = lines[i];
    let cleanLine = rawLine.replace(/^\uFEFF/, '').trim();
    if (cleanLine.startsWith('"') && cleanLine.endsWith('"')) {
      cleanLine = cleanLine.slice(1, -1).trim();
    }
    
    if (cleanLine.startsWith('--- TABLE: ') && cleanLine.endsWith(' ---')) {
      hasTableMarkers = true;
      // Parse previous table if exists
      if (currentTable && currentTableCsvLines.length > 0) {
        if (currentTableCsvLines[0] !== 'No data') {
          const parsed = Papa.parse(currentTableCsvLines.join('\n'), { header: true });
          data[currentTable] = parsed.data.map((row: any) => {
             const newRow: any = {};
             for (const key of Object.keys(row)) {
               try {
                 // attempt to parse JSON arrays/objects back if they look like it
                 if ((row[key].startsWith('{') && row[key].endsWith('}')) || (row[key].startsWith('[') && row[key].endsWith(']'))) {
                   newRow[key] = JSON.parse(row[key]);
                 } else {
                   newRow[key] = row[key];
                 }
               } catch (e) {
                 newRow[key] = row[key];
               }
             }
             return newRow;
          });
        } else {
          data[currentTable] = [];
        }
      }
      
      // Start new table
      let tableName = cleanLine.replace('--- TABLE: ', '').replace(' ---', '').toLowerCase();
      // map back from uppercase to correct camelCase keys
      if (tableName === 'dashboardproducts') tableName = 'dashboardProducts';
      if (tableName === 'savedproducts') tableName = 'savedProducts';
      if (tableName === 'selectedmonth') tableName = 'selectedMonth';
      if (tableName === 'selectedyear') tableName = 'selectedYear';
      if (tableName === 'monthlytargets') tableName = 'monthlyTargets';
      if (tableName === 'aoventries') tableName = 'aovEntries';
      if (tableName === 'notebooknotes') tableName = 'notebookNotes';
      if (tableName === 'billingentries') tableName = 'billingEntries';
      if (tableName === 'salesdata') tableName = 'salesData';
      
      currentTable = tableName;
      currentTableCsvLines = [];
    } else if (currentTable) {
       // Append line to current table CSV string
       if (rawLine.trim() !== '') {
          currentTableCsvLines.push(rawLine);
       }
    }
  }
  
  // Parse last table
  if (currentTable && currentTableCsvLines.length > 0) {
      if (currentTableCsvLines[0] !== 'No data') {
          const parsed = Papa.parse(currentTableCsvLines.join('\n'), { header: true });
          data[currentTable] = parsed.data.map((row: any) => {
             const newRow: any = {};
             for (const key of Object.keys(row)) {
               try {
                 if ((row[key].startsWith('{') && row[key].endsWith('}')) || (row[key].startsWith('[') && row[key].endsWith(']'))) {
                   newRow[key] = JSON.parse(row[key]);
                 } else {
                   newRow[key] = row[key];
                 }
               } catch (e) {
                 newRow[key] = row[key];
               }
             }
             return newRow;
          });
      } else {
          data[currentTable] = [];
      }
  }
  
  if (!hasTableMarkers) {
    throw new Error('Invalid System Backup Format: No system table markers found. If you are trying to import an external CSV for influencers, campaigns, or sales, please use the specific "Import CSV" button located on those respective pages instead of the full system backup importer.');
  }

  return data;
}
