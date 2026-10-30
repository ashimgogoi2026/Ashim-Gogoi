import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Influencer, Task } from '../types';

const numberToWords = (num: number): string => {
  const a = ['','one ','two ','three ','four ', 'five ','six ','seven ','eight ','nine ','ten ','eleven ','twelve ','thirteen ','fourteen ','fifteen ','sixteen ','seventeen ','eighteen ','nineteen '];
  const b = ['', '', 'twenty','thirty','forty','fifty', 'sixty','seventy','eighty','ninety'];
  const numStr = num.toString();
  if (numStr.length > 9) return 'overflow';
  const n = ('000000000' + numStr).slice(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
  if (!n) return '';
  let str = '';
  str += (n[1] !== '00') ? (a[Number(n[1])] || b[Number(n[1][0])] + ' ' + a[Number(n[1][1])]) + 'crore ' : '';
  str += (n[2] !== '00') ? (a[Number(n[2])] || b[Number(n[2][0])] + ' ' + a[Number(n[2][1])]) + 'lakh ' : '';
  str += (n[3] !== '00') ? (a[Number(n[3])] || b[Number(n[3][0])] + ' ' + a[Number(n[3][1])]) + 'thousand ' : '';
  str += (n[4] !== '0') ? (a[Number(n[4])] || b[Number(n[4][0])] + ' ' + a[Number(n[4][1]||0)]) + 'hundred ' : '';
  str += (n[5] !== '00') ? ((str !== '') ? 'and ' : '') + (a[Number(n[5])] || b[Number(n[5][0])] + ' ' + a[Number(n[5][1])]) : '';
  return str.trim();
};

export interface PdfBillOverrides {
  billFromName?: string;
  billFromAddress?: string;
  billToName?: string;
  billToAddress?: string;
  billToPhone?: string;
  accountName?: string;
  pan?: string;
  accountNumber?: string;
  bankName?: string;
  ifsc?: string;
  influencerSignatureBase64?: string;
  authorizedSignatureBase64?: string;
  billDate?: string;
  videoNo?: string;
  videoReleaseDate?: string;
  campaignBrand?: string;
  videoLink?: string;
  itemDescription?: string;
  rate?: number;
  additionalItemDesc?: string;
  additionalItemAmount?: number;
  orderNumber?: string;
  orderDate?: string;
}

export const generateInfluencerBillPDF = (task: any, influencer: any, companyDetails: any = {}, overrides: PdfBillOverrides = {}) => {
  const doc = new jsPDF();
  
  // Title
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("BILL", 14, 15);
  
  // Header Table 1 (Bill Date, Video No, Video Release Date)
  const billDate = overrides.billDate || new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
  const videoReleaseDate = overrides.videoReleaseDate !== undefined ? overrides.videoReleaseDate : (task.deadline ? new Date(task.deadline).toLocaleDateString('en-GB').replace(/\//g, '-') : '');
  
  const videoId = overrides.videoNo || (task.videoId || (task.displayVideoId ? task.displayVideoId : (task.id ? `VoId-${task.id.slice(-4)}` : 'VoId-0000')));
  
  autoTable(doc, {
    startY: 20,
    head: [],
    body: [
      ['Bill Date', billDate],
      ['Video No', videoId],
      ['Video Release Date', videoReleaseDate]
    ],
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 9, textColor: [0,0,0], lineColor: [0,0,0], lineWidth: 0.3, cellPadding: 1.5 },
    columnStyles: {
      0: { fontStyle: 'bold', fillColor: [240, 240, 240], cellWidth: 50 },
      1: { cellWidth: 100 }
    },
    margin: { left: 14 }
  });

  // BILL FROM Table
  doc.setFontSize(9);
  const lastTable1 = (doc as any).lastAutoTable;
  doc.text("BILL FROM -", 14, lastTable1.finalY + 6);
  
  autoTable(doc, {
    startY: lastTable1.finalY + 8,
    body: [
      ['Influencer Name', overrides.billFromName || influencer?.name || ''],
      ['Influencer Address', overrides.billFromAddress || influencer?.location || ''],
      ['Campaign Brand / Product', overrides.campaignBrand !== undefined ? overrides.campaignBrand : (task.campaignName || '')], 
      ['Video Link', overrides.videoLink !== undefined ? overrides.videoLink : (task.videoLink1 || '')]
    ],
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 9, textColor: [0,0,0], lineColor: [0,0,0], lineWidth: 0.3, cellPadding: 1.5 },
    columnStyles: {
      0: { fontStyle: 'bold', fillColor: [240, 240, 240], cellWidth: 50 },
      1: { cellWidth: 130 }
    },
    margin: { left: 14 }
  });

  // BILL TO Table
  const lastTable2 = (doc as any).lastAutoTable;
  doc.text("BILL TO -", 14, lastTable2.finalY + 6);
  autoTable(doc, {
    startY: lastTable2.finalY + 8,
    body: [
      ['Company Name', overrides.billToName || companyDetails.name || 'PROTOGROW CORP LLP'],
      ['Company Address', overrides.billToAddress || companyDetails.address || 'HOUSE NO 22, 1ST FLOOR, GS ROAD, AMRAWATI PATH CHRISTIAN BASTI, GUWAHATI, PIN-781005'],
      ['Company Phone', overrides.billToPhone || companyDetails.phone || '8724044420']
    ],
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 9, textColor: [0,0,0], lineColor: [0,0,0], lineWidth: 0.3, cellPadding: 1.5 },
    columnStyles: {
      0: { fontStyle: 'bold', fillColor: [240, 240, 240], cellWidth: 50 },
      1: { cellWidth: 130 }
    },
    margin: { left: 14 }
  });

  // Item Table
  const rate = overrides.rate !== undefined ? overrides.rate : (task.billedAmount !== undefined ? task.billedAmount : (task.remuneration || 0));
  const lastTable3 = (doc as any).lastAutoTable;
  const itemDesc = overrides.itemDescription || 'Product Promotion video';
  
  const bodyRows: any[][] = [
    ['1', itemDesc, '1', rate.toString(), rate.toString()]
  ];
  
  let totalAmount = rate;
  let rowCount = 1;

  if (overrides.additionalItemDesc && overrides.additionalItemAmount !== undefined && overrides.additionalItemAmount > 0) {
    rowCount++;
    bodyRows.push([
      rowCount.toString(), 
      overrides.additionalItemDesc, 
      '1', 
      overrides.additionalItemAmount.toString(), 
      overrides.additionalItemAmount.toString()
    ]);
    totalAmount += overrides.additionalItemAmount;
  }

  if (overrides.orderNumber || overrides.orderDate) {
    bodyRows.push([
      { content: '', styles: { minCellHeight: 6, lineWidth: 0, border: 0 } },
      { content: `Order Number: ${overrides.orderNumber || ''}\nOrder Date: ${overrides.orderDate || ''}`, colSpan: 4, styles: { halign: 'left', fontStyle: 'bold', cellPadding: 1.5 } }
    ]);
  }

  autoTable(doc, {
    startY: lastTable3.finalY + 8,
    head: [['SL NO', 'Description', 'Qty', 'Rate (Rs)', 'Amount (Rs)']],
    body: bodyRows,
    foot: [
      ['', '', '', 'Total', totalAmount.toString()]
    ],
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 9, textColor: [0,0,0], lineColor: [0,0,0], lineWidth: 0.3, halign: 'center', cellPadding: 1.5 },
    headStyles: { fontStyle: 'bold', fillColor: [240, 240, 240] },
    footStyles: { fontStyle: 'bold', fillColor: [240, 240, 240] },
    margin: { left: 14 }
  });

  // Amount in Words
  const lastTable4 = (doc as any).lastAutoTable;
  autoTable(doc, {
    startY: lastTable4.finalY + 6,
    body: [
      ['Amount in Words', `Rupees ${numberToWords(totalAmount)} only`]
    ],
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 9, textColor: [0,0,0], lineColor: [0,0,0], lineWidth: 0.3, cellPadding: 1.5 },
    columnStyles: {
      0: { fontStyle: 'bold', fillColor: [240, 240, 240], cellWidth: 50 },
      1: { cellWidth: 130 }
    },
    margin: { left: 14 }
  });

  // Bank Details Table
  const lastTable5 = (doc as any).lastAutoTable;
  autoTable(doc, {
    startY: lastTable5.finalY + 6,
    body: [
      ['Account Holder Name', overrides.accountName || influencer?.bankDetails?.accountName || influencer?.name || ''],
      ['PAN Number', overrides.pan || influencer?.bankDetails?.pan || ''],
      ['Account Number', overrides.accountNumber || influencer?.bankDetails?.accountNumber || ''],
      ['Bank Name', overrides.bankName || influencer?.bankDetails?.bankName || ''],
      ['IFSC Code', overrides.ifsc || influencer?.bankDetails?.ifsc || '']
    ],
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 9, textColor: [0,0,0], lineColor: [0,0,0], lineWidth: 0.3, cellPadding: 1.5 },
    columnStyles: {
      0: { fontStyle: 'bold', fillColor: [240, 240, 240], cellWidth: 50 },
      1: { cellWidth: 100 }
    },
    margin: { left: 14 }
  });

  // Signatures
  let finalY = (doc as any).lastAutoTable.finalY + 15;
  
  // Left signature (Influencer)
  if (overrides.influencerSignatureBase64) {
    try {
      doc.addImage(overrides.influencerSignatureBase64, 'PNG', 14, finalY, 35, 15);
    } catch(e) {}
  } else {
    doc.setFont("helvetica", "italic");
    doc.text(overrides.billFromName || influencer?.name || 'Signature', 14, finalY + 12);
  }
  doc.line(14, finalY + 15, 50, finalY + 15);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Signature", 14, finalY + 20);
  
  // Right signature (Company)
  if (overrides.authorizedSignatureBase64) {
    try {
      doc.addImage(overrides.authorizedSignatureBase64, 'PNG', 140, finalY, 35, 15);
    } catch(e) {}
  }
  doc.line(140, finalY + 15, 185, finalY + 15);
  doc.text("BDM Signature", 140, finalY + 20);
  
  doc.save(`BILL - ${videoId}.pdf`);
}
