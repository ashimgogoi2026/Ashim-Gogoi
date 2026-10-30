cat << 'INNEREOF' > temp_patch2.js
const fs = require('fs');
let code = fs.readFileSync('src/components/SecureBillPayment.tsx', 'utf8');

const updateTaskBlock = `
    if (onUpdateTask) {
      onUpdateTask(pdfTask.id, {
        pdfBillDate,
        pdfVideoNo,
        pdfVideoReleaseDate,
        pdfCampaignBrand,
        pdfVideoLink,
        pdfItemDesc,
        pdfRate,
        pdfAdditionalItemDesc,
        pdfAdditionalItemAmount,
        pdfOrderNumber,
        pdfOrderDate
      });
    }
`;

code = code.replace(/setPdfTask\(null\);\n  };\n\n  \n  const formatDateForPdf/, updateTaskBlock + '    setPdfTask(null);\n  };\n\n  \n  const formatDateForPdf');
code = code.replace(/\/\/ Close modal\n    setPdfTask\(null\);/, '// Close modal\n' + updateTaskBlock + '    setPdfTask(null);');

fs.writeFileSync('src/components/SecureBillPayment.tsx', code);
INNEREOF
node temp_patch2.js
