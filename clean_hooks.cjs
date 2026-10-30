const fs = require('fs');
const filePath = 'src/components/SecureBillPayment.tsx';
let content = fs.readFileSync(filePath, 'utf8');

const startMarker = `  React.useEffect(() => {
    const handler = setTimeout(() => {
      if (String(localVal) !== String(lastReportedVal.current)) {
        lastReportedVal.current = localVal;
        onChangeRef.current(localVal);
      }
    }, 800);`;

const endMarker = `  return () => clearTimeout(handler);
  }, [localVal]);`;

const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker, startIndex);

if (startIndex !== -1 && endIndex !== -1) {
  const codeToKeep = startMarker + "\n    " + endMarker;
  const oldCode = content.substring(startIndex, endIndex + endMarker.length);
  content = content.replace(oldCode, codeToKeep);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log("Successfully removed injected hooks from DebouncedInput");
} else {
  console.log("Could not find start or end marker");
}
