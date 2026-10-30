const fs = require('fs');
let code = fs.readFileSync('src/components/SmartAINotebook.tsx', 'utf8');

const migrationEffect = `
  useEffect(() => {
    let needsMigration = false;
    const migratedNotes = notes.map(n => {
      if (n.date && n.date.endsWith('-AddressBook') && n.date !== 'Global-AddressBook') {
        needsMigration = true;
        return { ...n, date: 'Global-AddressBook' };
      }
      return n;
    });
    if (needsMigration) {
      setNotes(migratedNotes);
    }
  }, []);
`;

code = code.replace('useEffect(() => {', migrationEffect + '\n  useEffect(() => {');
fs.writeFileSync('src/components/SmartAINotebook.tsx', code);
