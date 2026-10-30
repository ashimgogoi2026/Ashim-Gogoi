import jsPDF from 'jspdf';
import html2canvas from 'html2canvas-pro';

export interface ChecklistItem {
  id: string;
  text: string;
  checked: boolean;
}

export interface ChecklistSection {
  id: string;
  title: string;
  subtitle?: string;
  iconType: 'check' | 'target' | 'video' | 'prohibited' | 'posting';
  items: ChecklistItem[];
}

export interface PdfChecklistData {
  productTitle: string;
  influencerName?: string;
  date?: string;
  bdmName?: string;
  bdmSignatureBase64?: string;
  videoNo?: string;
  fileName?: string;
  sections?: ChecklistSection[];
  hideMetadataAndSignature?: boolean;
  showGeneratedDateTime?: boolean;
  generatedDateTime?: string;
  allCheckboxesBlank?: boolean;
}

export const formatGeneratedDateTime = (dateObj: Date = new Date()): string => {
  const day = String(dateObj.getDate()).padStart(2, '0');
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const year = dateObj.getFullYear();
  let hours = dateObj.getHours();
  const minutes = String(dateObj.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const strHours = String(hours).padStart(2, '0');
  return `${day}/${month}/${year}, ${strHours}:${minutes} ${ampm}`;
};

export const DEFAULT_CHECKLIST_SECTIONS: ChecklistSection[] = [
  {
    id: 'mention',
    title: 'Points to Mention',
    subtitle: 'Benefits of the Product',
    iconType: 'check',
    items: [
      { id: 'm1', text: 'Follow the exact preparation method as mentioned on the jar/box.', checked: true },
      { id: 'm2', text: '100% Vegetarian', checked: true },
      { id: 'm3', text: 'Includes Bhim Banana, Ashwagandha, Brahmi, and Turmeric', checked: true },
      { id: 'm4', text: 'Contains Calcium – supports bone health', checked: true },
      { id: 'm5', text: 'Contains Vitamin D – essential for overall health', checked: true },
      { id: 'm6', text: 'Contains Iron – important for growing children', checked: true },
      { id: 'm7', text: 'Includes Prebiotics and Probiotics – aids digestion for kids', checked: true }
    ]
  },
  {
    id: 'cta',
    title: 'Call-to-Action',
    iconType: 'target',
    items: [
      { id: 'c1', text: 'Mention availability on Amazon, Flipkart, and www.protogrow.in', checked: true },
      { id: 'c2', text: 'For Instagram: "Link in Bio"', checked: true },
      { id: 'c3', text: 'For Facebook/YouTube: "Link in caption and pinned comment"', checked: true }
    ]
  },
  {
    id: 'creation',
    title: 'Points to Follow (During Content Creation)',
    iconType: 'video',
    items: [
      { id: 'cr1', text: 'Use storytelling format', checked: true },
      { id: 'cr2', text: 'Ensure good video and audio quality', checked: true },
      { id: 'cr3', text: 'Present the product clearly', checked: true },
      { id: 'cr4', text: 'Follow the preparation method exactly as printed on the jar', checked: true }
    ]
  },
  {
    id: 'prohibited',
    title: 'Points to NOT Mention or Show',
    iconType: 'prohibited',
    items: [
      { id: 'p1', text: 'Do not use the word "Local"', checked: true },
      { id: 'p2', text: 'Do not use the words "Manual" or "Handmade"', checked: true },
      { id: 'p3', text: 'Do not mention age group 0–2 years', checked: true },
      { id: 'p4', text: 'Do not show incorrect preparation methods', checked: true },
      { id: 'p5', text: 'Do not use the word "Artificial"', checked: true },
      { id: 'p6', text: 'Do not leave the jar open after preparation in the video', checked: true }
    ]
  },
  {
    id: 'posting',
    title: 'Points to Follow During Posting',
    iconType: 'posting',
    items: [
      { id: 'po1', text: 'Use the post description provided by the brand', checked: true },
      { id: 'po2', text: 'Add Linktree link in Instagram bio for 7 days', checked: false },
      { id: 'po3', text: 'Add Wishlink for Instagram', checked: false },
      { id: 'po4', text: 'Add Linktree at the top of the caption for YouTube and Facebook', checked: true }
    ]
  }
];

export const cleanChecklistVideoId = (input?: string): string => {
  if (!input) return 'VoId-0000';
  let str = input.trim();
  // Strip any 'VIDEO ID' prefix or redundant VOID prefixes
  str = str.replace(/^(video\s*id\s*[-–:]*\s*)+/gi, '');
  str = str.replace(/(void[-_\s]*)+/gi, 'VoId-');
  if (!str.toLowerCase().startsWith('void-')) {
    if (str.toLowerCase().startsWith('vid')) {
      str = 'VoId-' + str.slice(3).replace(/^[-_]/, '');
    } else {
      str = 'VoId-' + str;
    }
  }
  // Remove any redundant repeated VoId- prefix
  str = str.replace(/^(VoId[-_\s]*)+/gi, 'VoId-');
  return str;
};

function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const renderIconSvg = (type: string): string => {
  switch (type) {
    case 'check':
      return `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" style="flex-shrink:0;">
        <circle cx="11" cy="11" r="10" fill="#10b981"/>
        <path d="M7 11.5L9.5 14L15 8.5" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
    case 'target':
      return `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" style="flex-shrink:0;">
        <circle cx="11" cy="11" r="10" fill="#f43f5e"/>
        <circle cx="11" cy="11" r="6.5" fill="#ffffff"/>
        <circle cx="11" cy="11" r="3.5" fill="#f43f5e"/>
      </svg>`;
    case 'video':
      return `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" style="flex-shrink:0;">
        <circle cx="11" cy="11" r="10" fill="#475569"/>
        <rect x="7" y="7" width="8" height="8" rx="1.5" fill="#ffffff"/>
        <polygon points="9.5,8.5 13.5,11 9.5,13.5" fill="#475569"/>
      </svg>`;
    case 'prohibited':
      return `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" style="flex-shrink:0;">
        <circle cx="11" cy="11" r="9.5" stroke="#ef4444" stroke-width="2" fill="#fee2e2"/>
        <line x1="5" y1="5" x2="17" y2="17" stroke="#ef4444" stroke-width="2.2" stroke-linecap="round"/>
      </svg>`;
    case 'posting':
      return `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" style="flex-shrink:0;">
        <circle cx="11" cy="11" r="10" fill="#6366f1"/>
        <rect x="7" y="5" width="8" height="12" rx="1.5" fill="#ffffff"/>
        <circle cx="11" cy="14.5" r="0.8" fill="#6366f1"/>
      </svg>`;
    default:
      return `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" style="flex-shrink:0;">
        <circle cx="11" cy="11" r="10" fill="#64748b"/>
        <path d="M7 11.5L9.5 14L15 8.5" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
  }
};

const renderCheckbox = (checked: boolean): string => {
  if (checked) {
    return `<div style="width:14px;height:14px;min-width:14px;border-radius:3px;background:#64748b;display:flex;align-items:center;justify-content:center;margin-top:2px;box-sizing:border-box;">
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <path d="M2 5L4 7.5L8 2.5" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>`;
  }
  return `<div style="width:14px;height:14px;min-width:14px;border-radius:3px;border:1.6px solid #64748b;background:#ffffff;margin-top:2px;box-sizing:border-box;"></div>`;
};

// Fallback generator in case DOM rendering is unavailable
const generateFallbackPdf = (data: PdfChecklistData, outFileName: string) => {
  const doc = new jsPDF({
    unit: 'mm',
    format: 'a4',
    orientation: 'portrait'
  });

  const pageWidth = 210;
  const marginX = 20;
  const contentWidth = pageWidth - (marginX * 2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(20, 20, 20);
  const rawTitle = (data.productTitle || '').trim() || 'Chocolate Drink';
  const titleText = rawTitle.toLowerCase().startsWith('product') ? rawTitle : `Product - ${rawTitle}`;
  doc.text(titleText, marginX, 20);

  let currentY = 28;

  if (data.hideMetadataAndSignature) {
    const genDateTime = data.generatedDateTime || formatGeneratedDateTime();
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text('CHECKLIST GENERATE DATE & TIME:-', marginX, currentY);
    doc.setFont('courier', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(genDateTime, marginX + 78, currentY);
    currentY += 8;
  } else {
    const cleanVid = cleanChecklistVideoId(data.videoNo);
    doc.setFontSize(10.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(20, 20, 20);
    doc.text('VIDEO ID:-', marginX, currentY);
    doc.setFont('courier', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(cleanVid, marginX + 22, currentY);

    currentY = 36;
    doc.setFontSize(10.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(20, 20, 20);
    doc.text('INFLUENCER:-', marginX, currentY);
    doc.text(data.influencerName || 'Creator', marginX + 30, currentY);

    const dateLabelX = 135;
    doc.text('DATE:-', dateLabelX, currentY);
    doc.text(data.date || new Date().toLocaleDateString('en-GB'), dateLabelX + 16, currentY);

    currentY += 8;
  }

  const sectionsToRender = data.sections && data.sections.length > 0
    ? data.sections
    : DEFAULT_CHECKLIST_SECTIONS;

  // Force all checklist boxes to be blank for Influencer Checklist output
  const forceBlankBoxes = Boolean(data.allCheckboxesBlank || data.hideMetadataAndSignature);

  sectionsToRender.forEach((section) => {
    currentY += 2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(15, 23, 42);
    doc.text(section.title, marginX, currentY);
    currentY += 5;

    if (section.subtitle) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.text(section.subtitle, marginX, currentY);
      currentY += 4.5;
    }

    section.items.forEach(item => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(30, 41, 59);
      const isChecked = forceBlankBoxes ? false : Boolean(item.checked);
      const lines = doc.splitTextToSize((isChecked ? '[x] ' : '[ ] ') + item.text, contentWidth);
      doc.text(lines, marginX, currentY);
      currentY += (lines.length * 4) + 0.4;
    });

    currentY += 3;
  });

  if (!data.hideMetadataAndSignature) {
    const footerY = Math.max(currentY + 6, 268);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    const bdmTitle = data.bdmName ? `BDM:- ${data.bdmName.toUpperCase()}` : 'BDM:- ASHIM GOGOI';
    doc.text(bdmTitle, marginX, footerY);

    const sigX = 148;
    if (data.bdmSignatureBase64 && data.bdmSignatureBase64.startsWith('data:image')) {
      try {
        doc.addImage(data.bdmSignatureBase64, 'PNG', sigX - 5, footerY - 14, 34, 12);
      } catch {
        // ignore
      }
    }
    doc.text('SIGNATURE', sigX, footerY);
  }

  doc.save(outFileName);
};

export const generateInfluencerChecklistPDF = async (data: PdfChecklistData): Promise<void> => {
  // Determine desired filename
  let outFileName: string;
  if (data.fileName && data.fileName.trim()) {
    outFileName = data.fileName.trim().endsWith('.pdf') ? data.fileName.trim() : `${data.fileName.trim()}.pdf`;
  } else {
    // Style: Checklist-1571 (only add numbers from the Void)
    const voidNumbers = (data.videoNo || '').replace(/\D/g, '');
    if (voidNumbers) {
      outFileName = `Checklist-${voidNumbers}.pdf`;
    } else {
      const safeFilename = (data.productTitle || data.videoNo || data.influencerName || 'Checklist')
        .replace(/[^a-zA-Z0-9_-]/g, '_');
      outFileName = `Checklist-${safeFilename}.pdf`;
    }
  }

  // Ensure DOM is available
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const isInfluencerChecklistClean = Boolean(data.hideMetadataAndSignature);
  // Force all checklist boxes to be blank for Influencer Checklist output
  const forceBlankBoxes = Boolean(data.allCheckboxesBlank || data.hideMetadataAndSignature);
  const generatedDateTimeStr = data.generatedDateTime || formatGeneratedDateTime();

  // Title text
  const rawTitle = (data.productTitle || '').trim() || 'Chocolate Drink';
  const titleText = rawTitle.toLowerCase().startsWith('product') ? rawTitle : `Product - ${rawTitle}`;
  const cleanVid = cleanChecklistVideoId(data.videoNo);
  const creatorName = data.influencerName || 'Creator';
  const dateStr = data.date || new Date().toLocaleDateString('en-GB');
  const bdmNameStr = data.bdmName ? data.bdmName.trim().toUpperCase() : 'ASHIM GOGOI';

  const sectionsToRender = (data.sections && data.sections.length > 0)
    ? data.sections
    : DEFAULT_CHECKLIST_SECTIONS;

  // Build Sections HTML
  let sectionsHtml = '';
  sectionsToRender.forEach(section => {
    let itemsHtml = '';

    if (section.subtitle && section.items.length > 0) {
      // First item can be preceding prep instructions
      const firstItem = section.items[0];
      const isFirstChecked = forceBlankBoxes ? false : Boolean(firstItem.checked);
      itemsHtml += `
        <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:6px;">
          ${renderCheckbox(isFirstChecked)}
          <div style="font-size:12.5px;line-height:1.45;font-weight:600;color:#1e293b;flex:1;">
            ${escapeHtml(firstItem.text)}
          </div>
        </div>
        <div style="font-size:13px;font-weight:800;color:#0f172a;margin:8px 0 6px 22px;">
          ${escapeHtml(section.subtitle)}
        </div>
      `;

      section.items.slice(1).forEach(item => {
        const isItemChecked = forceBlankBoxes ? false : Boolean(item.checked);
        itemsHtml += `
          <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:5px;">
            ${renderCheckbox(isItemChecked)}
            <div style="font-size:12px;line-height:1.42;font-weight:600;color:#1e293b;flex:1;">
              ${escapeHtml(item.text)}
            </div>
          </div>
        `;
      });
    } else {
      section.items.forEach(item => {
        const isItemChecked = forceBlankBoxes ? false : Boolean(item.checked);
        itemsHtml += `
          <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:5px;">
            ${renderCheckbox(isItemChecked)}
            <div style="font-size:12px;line-height:1.42;font-weight:600;color:#1e293b;flex:1;">
              ${escapeHtml(item.text)}
            </div>
          </div>
        `;
      });
    }

    sectionsHtml += `
      <div style="margin-bottom:14px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;">
          ${renderIconSvg(section.iconType)}
          <div style="font-size:14.5px;font-weight:800;color:#0f172a;letter-spacing:-0.2px;">
            ${escapeHtml(section.title)}
          </div>
        </div>
        <div style="padding-left:4px;">
          ${itemsHtml}
        </div>
      </div>
    `;
  });

  // Signature image or blank area
  const signatureImgHtml = (data.bdmSignatureBase64 && data.bdmSignatureBase64.startsWith('data:image'))
    ? `<img src="${data.bdmSignatureBase64}" style="max-height:48px;max-width:140px;object-fit:contain;display:block;margin:0 auto 4px auto;" alt="Signature" />`
    : `<div style="height:40px;"></div>`;

  const footerHtml = `
    <div style="margin-top:24px;padding-top:16px;border-top:1.5px solid #e2e8f0;display:flex;justify-content:space-between;align-items:flex-end;">
      <div>
        <div style="font-size:13px;font-weight:800;color:#0f172a;letter-spacing:0.5px;">
          BDM:- ${escapeHtml(bdmNameStr)}
        </div>
      </div>
      <div style="text-align:center;min-width:140px;">
        ${signatureImgHtml}
        <div style="font-size:12px;font-weight:800;color:#0f172a;letter-spacing:1px;border-top:1px dashed #94a3b8;padding-top:4px;">
          SIGNATURE
        </div>
      </div>
    </div>
  `;

  // Top header HTML: Clean Influencer Checklist mode hides Video ID, Influencer, Date, and displays Checklist generate date and time
  const topHeaderHtml = isInfluencerChecklistClean
    ? `
      <div style="margin-bottom:14px;">
        <h1 style="font-size:22px;font-weight:800;color:#0f172a;margin:0 0 10px 0;line-height:1.2;letter-spacing:-0.3px;">
          ${escapeHtml(titleText)}
        </h1>
        <div style="display:flex;justify-content:space-between;align-items:center;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px 14px;">
          <div style="display:flex;align-items:center;gap:7px;">
            <span style="font-size:11.5px;font-weight:800;color:#475569;letter-spacing:0.3px;">CHECKLIST GENERATE DATE &amp; TIME:-</span>
            <span style="font-family:ui-monospace,Menlo,monospace;font-size:12px;font-weight:800;color:#0f172a;background:#e2e8f0;padding:2px 8px;border-radius:4px;">${escapeHtml(generatedDateTimeStr)}</span>
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="font-size:11px;font-weight:800;color:#4338ca;background:#e0e7ff;padding:2px 8px;border-radius:4px;letter-spacing:0.4px;">INFLUENCER CHECKLIST</span>
          </div>
        </div>
      </div>
    `
    : `
      <div style="margin-bottom:14px;">
        <h1 style="font-size:22px;font-weight:800;color:#0f172a;margin:0 0 10px 0;line-height:1.2;letter-spacing:-0.3px;">
          ${escapeHtml(titleText)}
        </h1>
        <div style="display:flex;justify-content:space-between;align-items:center;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px 14px;">
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="font-size:11.5px;font-weight:800;color:#475569;letter-spacing:0.3px;">VIDEO ID:-</span>
            <span style="font-family:ui-monospace,Menlo,monospace;font-size:12px;font-weight:800;color:#0f172a;background:#e2e8f0;padding:2px 7px;border-radius:4px;">${escapeHtml(cleanVid)}</span>
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="font-size:11.5px;font-weight:800;color:#475569;letter-spacing:0.3px;">INFLUENCER:-</span>
            <span style="font-size:12px;font-weight:800;color:#0f172a;">${escapeHtml(creatorName)}</span>
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="font-size:11.5px;font-weight:800;color:#475569;letter-spacing:0.3px;">DATE:-</span>
            <span style="font-size:12px;font-weight:800;color:#0f172a;">${escapeHtml(dateStr)}</span>
          </div>
        </div>
      </div>
    `;

  // Create isolated offscreen container for high-DPI capture with full Unicode & Assamese font support
  const containerId = 'checklist-pdf-render-' + Date.now();
  const container = document.createElement('div');
  container.id = containerId;
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '794px';
  container.style.minHeight = '1123px';
  container.style.backgroundColor = '#ffffff';
  container.style.color = '#0f172a';
  container.style.boxSizing = 'border-box';
  container.style.padding = '38px 46px 42px 46px';
  container.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans Assamese", "Noto Sans Bengali", "Nirmala UI", "Vrinda", Arial, sans-serif';
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.justifyContent = isInfluencerChecklistClean ? 'flex-start' : 'space-between';
  container.style.zIndex = '-99999';

  container.innerHTML = `
    <div>
      ${topHeaderHtml}

      <!-- Sections -->
      ${sectionsHtml}
    </div>

    <!-- Footer (Omitted in clean Influencer Checklist mode) -->
    ${isInfluencerChecklistClean ? '' : footerHtml}
  `;

  document.body.appendChild(container);

  try {
    // Small delay to ensure all fonts and layout metrics are fully computed
    await new Promise(resolve => setTimeout(resolve, 80));

    const canvas = await html2canvas(container, {
      scale: 2, // 2x gives 1588px width, crystal-clear 300 DPI print quality
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      windowWidth: 794
    });

    const pdf = new jsPDF({
      unit: 'mm',
      format: 'a4',
      orientation: 'portrait'
    });

    const pdfWidth = 210;
    const pdfHeight = 297;
    const imgWidth = canvas.width;
    const imgHeight = canvas.height;

    // Standard A4 aspect ratio
    const a4Ratio = pdfHeight / pdfWidth; // ~1.4142857
    const singlePageMaxHeight = Math.floor(imgWidth * a4Ratio);

    // If within single page height (with 8% leeway)
    if (imgHeight <= singlePageMaxHeight * 1.08) {
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
    } else {
      // Seamless multi-page slicing so no text is ever clipped or overlapped
      let remainingHeight = imgHeight;
      let sourceY = 0;
      let pageIndex = 0;

      while (remainingHeight > 0) {
        if (pageIndex > 0) {
          pdf.addPage();
        }
        const chunkHeight = Math.min(remainingHeight, singlePageMaxHeight);
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = imgWidth;
        pageCanvas.height = chunkHeight;
        const pageCtx = pageCanvas.getContext('2d');
        if (pageCtx) {
          pageCtx.fillStyle = '#ffffff';
          pageCtx.fillRect(0, 0, imgWidth, chunkHeight);
          pageCtx.drawImage(canvas, 0, sourceY, imgWidth, chunkHeight, 0, 0, imgWidth, chunkHeight);
        }
        const chunkData = pageCanvas.toDataURL('image/jpeg', 0.95);
        const mmChunkHeight = (chunkHeight / imgWidth) * pdfWidth;
        pdf.addImage(chunkData, 'JPEG', 0, 0, pdfWidth, mmChunkHeight, undefined, 'FAST');

        sourceY += chunkHeight;
        remainingHeight -= chunkHeight;
        pageIndex++;
      }
    }

    pdf.save(outFileName);
  } catch (err) {
    console.warn('[ChecklistPDF] Canvas capture notice, using fallback:', err);
    generateFallbackPdf(data, outFileName);
  } finally {
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  }
};

