import React, { useState, useEffect, useMemo, useRef } from 'react';
import Papa from 'papaparse';
import { triggerUpdateWhatsAppModal } from '../lib/whatsappPrompt';
import { globalToast } from '../lib/toast';
import { openWhatsAppChat, getKnownMobile, cleanSingleMobileForStorage, formatDisplayPhone, formatProductForWhatsApp } from '../lib/whatsappHelper';
import { formatDateToDMY } from '../lib/dateUtils';
import { Copy,  
  TrendingUp, 
  Plus, 
  Trash2, 
  Sparkles, 
  Search,
  Download, 
  Award, 
  AlertTriangle, 
  CheckCircle2, 
  IndianRupee, 
  Calendar, 
  Clock, 
  Filter, 
  ExternalLink,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  RotateCcw,
  HelpCircle,
  CheckCircle,
  BarChart3,
  ThumbsUp,
  ThumbsDown,
  PlayCircle,
  StickyNote,
  Film,
  Loader2,
  Save,
  Cloud,
  Check,
  X,
  XCircle,
  Video,
  Camera,
  
  UploadCloud,
  CalendarPlus,
  Phone,
  Package,
  PackageCheck,
  Truck,
  FileSpreadsheet,
  FileText,
  FileDown,
  Pencil,
  Send,
  Bell,
  MessageSquare,
  Globe,
  Zap,
  Scissors,
  Image as ImageIcon,
  Paperclip,
  Link as LinkIcon
} from 'lucide-react';
import pptxgen from 'pptxgenjs';
import { Campaign, Influencer, Task, ProductConfig } from '../types';
import { safeLocalStorage } from '../lib/safeLocalStorage';
import { isTaskInPeriod } from '../lib/taskUtils';
import { MonthlyProductTarget } from './MonthlyTargets';
import { generateInfluencerChecklistPDF, ChecklistSection } from '../lib/pdfChecklistGenerator';
import { getProductChecklist, syncChecklistsFromGoogleDrive } from '../lib/productChecklistStore';

const isOthersProduct = (name?: string): boolean => {
  if (!name) return false;
  const upper = name.trim().toUpperCase();
  return (
    upper === 'OTHERS 1' ||
    upper === 'OTHERS 2' ||
    upper === 'OTHERS 3' ||
    upper === 'OTHERS 4' ||
    upper === 'OTHERS 5' ||
    /^OTHERS\s*[1-5]$/i.test(upper) ||
    upper.startsWith('OTHERS')
  );
};

// WhatsApp template messages for video deliverables (Supports English and Assamese / অসমীয়া)
export type WhatsAppLang = 'en' | 'as';

export type WhatsAppDeliverableTemplateType =
  | 'upcoming'
  | 'followup'
  | 'sample_received'
  | 'sample_sent_tracking'
  | 'guidelines'
  | 'payment_details'
  | 'checklist_pdf'
  | 'schedule_upload'
  | 'schedule_upload_pin_only'
  | 'advance_link_edit_review'
  | 'edited_video_ready_check'
  | 'video_approved_details_soon'
  | 'office_hours_feedback_notice'
  | 'video_upload_reminder'
  | 'custom'
  | 'video_correction';

export const toDisplayDate = (isoOrStr?: string): string => {
  return formatDateToDMY(isoOrStr);
};

export const toIsoDate = (str?: string): string => {
  if (!str) return "";
  const trimmed = str.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const dmyMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split("T")[0];
  }
  return "";
};

export const DEFAULT_CORRECTION_SAMPLE_TEXT = "The influencer has already mentioned the available platforms, so there is no need to mention them again. Please avoid repeating the same information twice.";

export const getVideoCorrectionWhatsAppText = (
  name: string,
  product: string,
  feedbackText?: string,
  lang: WhatsAppLang = 'en',
  hasImage: boolean = false
) => {
  const infName = name || 'Creator';
  const prodName = formatProductForWhatsApp(product || 'Product');
  const rawNote = (feedbackText || '').trim() || DEFAULT_CORRECTION_SAMPLE_TEXT;
  const imageNoteEn = hasImage ? '\n📸 *(Attached screenshot shows the reference frame)*' : '';
  const imageNoteAs = hasImage ? '\n📸 *(সহজ বুজাবুজিৰ বাবে স্ক্ৰীনশ্বট সংলগ্ন কৰা হৈছে)*' : '';

  // Smart formatting for notes into polite, actionable instructions
  let formattedNoteEn = rawNote;
  let formattedNoteAs = rawNote;
  const lower = rawNote.toLowerCase();

  if (lower.includes('already mentioned') || lower.includes('repeating')) {
    formattedNoteEn = `• You did an amazing job mentioning where to find the product earlier! To keep the pacing punchy and avoid repeating the same info twice, could you please *trim out the second mention* of the platforms? ✂️`;
    formattedNoteAs = `• ভিডিঅ'ৰ আৰম্ভণিতে আপুনি প্লেটফৰ্মসমূহৰ বিষয়ে অতি সুন্দৰকৈ উল্লেখ কৰিছেই! গতিকে ভিডিঅ'টো আকৰ্ষণীয় ৰাখিবলৈ দ্বিতীয়বাৰ প্লেটফৰ্মৰ নাম কোৱা অংশটো অলপ *ট্ৰিম (trim)* কৰি দিলে অতি সুন্দৰ হ'ব। ✂️`;
  } else if (lower.includes('audio') || lower.includes('music')) {
    formattedNoteEn = `• The voiceover sounds great! Could you please *lower the background music volume by 20-30%* during speaking so your voice is crisp and clear? 🔊`;
    formattedNoteAs = `• আপোনাৰ মাতটো অতি সুন্দৰ হৈছে! কিন্তু কথা কোৱাৰ সময়ত ব্যাকগ্ৰাউণ্ড মিউজিকৰ ভলিউমটো প্ৰায় ২০-৩০% অলপ কমাই দিলে আপোনাৰ কথাখিনি আৰু স্পষ্টকৈ শুনা যাব। 🔊`;
  } else if (lower.includes('label') || lower.includes('camera') || lower.includes('facing')) {
    formattedNoteEn = `• During the showcase shot, please ensure the *${prodName}* label is angled directly towards the camera so viewers can clearly read the brand name. 🏷️`;
    formattedNoteAs = `• প্ৰডাক্ট দেখুওৱাৰ সময়ত অনুগ্ৰহ কৰি *${prodName}* ৰ লেবেলটো কেমেৰাৰ সন্মুখলৈ পোনপটীয়াকৈ ৰাখক যাতে ব্ৰেণ্ডৰ নামটো স্পষ্টকৈ দেখা যায়। 🏷️`;
  } else if (lower.includes('cta') || lower.includes('call to action') || lower.includes('bio') || lower.includes('comment')) {
    formattedNoteEn = `• Please add a quick reminder at the end asking viewers to check the *Link in Bio / pinned comment* to purchase *${prodName}*. 🔗`;
    formattedNoteAs = `• ভিডিঅ'ৰ শেষত দৰ্শকসকলক বায়'ৰ লিংক (Link in Bio) বা পিন কৰা কমেন্ট পৰীক্ষা কৰি *${prodName}* অৰ্ডাৰ কৰিবলৈ অনুগ্ৰহ কৰি এটা সৰু আহ্বান (CTA) যোগ কৰক। 🔗`;
  } else if (lower.includes('trim') || lower.includes('pause') || lower.includes('intro') || lower.includes('hook') || lower.includes('seconds')) {
    formattedNoteEn = `• Please *trim the initial pause/silence (first 2-3 seconds)* at the start so the video hooks the viewer instantly from the opening second! ⚡`;
    formattedNoteAs = `• ভিডিঅ'টোৰ আৰম্ভণিৰ প্ৰথম ২-৩ ছেকেণ্ডৰ বিৰতিটো অলপ *ট্ৰিম* কৰি দিলে দৰ্শকে প্ৰথম পলকতে বিষয়টো ধৰিব পাৰিব। ⚡`;
  } else {
    formattedNoteEn = `• ${rawNote}`;
    formattedNoteAs = `• ${rawNote}`;
  }

  if (lang === 'as') {
    return formatProductForWhatsApp(`নমস্কাৰ ${infName}! PRO-TO-GROW ৰ ফালৰ পৰা জনাইছোঁ। 🎬✨

"${prodName}" ৰ বাবে প্ৰস্তুত কৰা ভিডিঅ' ড্ৰাফটটো আমি চালোঁ, সামগ্ৰিকভাৱে কামটো অতি সুন্দৰ আৰু আকৰ্ষণীয় হৈছে!

ভিডিঅ'টো চূড়ান্ত ৰূপত আপল'ড কৰাৰ পূৰ্বে এটা সৰু সালসলনি (Edit Request) কৰিবলৈ অনুৰোধ জনোৱা হ'ল:${imageNoteAs}

✂️ *পৰিৱৰ্তনৰ নিৰ্দেশনা (Correction Details):*
${formattedNoteAs}

অনুগ্ৰহ কৰি এই অংশটো অলপ এডিট / ট্ৰিম (trim) কৰি পৰিশোধিত ভিডিঅ'টো আমাক এবাৰ দেখুৱাবচোন। আপোনাৰ সহযোগিতাৰ বাবে অশেষ ধন্যবাদ! 🙏✨

— Team PRO-TO-GROW`);
  }

  return formatProductForWhatsApp(`Hi ${infName}! Hope you are having a wonderful day! 🎬✨

Thank you so much for sharing the video draft for *${prodName}*. The overall presentation and energy look fantastic!

Before final publishing, our brand team noticed one quick edit to make the video even more impactful:${imageNoteEn}

✂️ *Requested Edit:*
${formattedNoteEn}

Could you please make this small edit and share the revised cut with us before uploading? Let us know if you need any clarification. Thank you so much for your effort! 🙏✨

Warmly,
Team PRO-TO-GROW`);
};

const getUpcomingVideoWhatsAppText = (name: string, product: string, date: string, lang: WhatsAppLang = 'en') => {
  const displayDate = toDisplayDate(date);
  const formattedProd = formatProductForWhatsApp(product);
  if (lang === 'as') {
    const prodSegment = formattedProd ? `${formattedProd} ৰ ` : '';
    const dateSegment = displayDate ? `${displayDate} তাৰিখে ` : 'নিৰ্ধাৰিত তাৰিখে ';
    return `নমস্কাৰ ${name}! PRO-TO-GROW ৰ ফালৰ পৰা জনাইছোঁ। আপোনাৰ ${prodSegment}আগন্তুক প্ৰম'শ্বনেল ভিডিঅ'টো ${dateSegment}আপল'ড কৰাৰ কথা আছে। অনুগ্ৰহ কৰি নিৰ্ধাৰিত সময়ত ভিডিঅ'টো প্ৰস্তুত কৰি ৰাখিবচোন। কিবা সহায় বা তথ্যৰ প্ৰয়োজন হ'লে জনাব। ধন্যবাদ! 🎬✨`;
  }
  const prodSegment = formattedProd ? ` for ${formattedProd}` : '';
  const dateSegment = displayDate ? ` on ${displayDate}` : ' on the scheduled date';
  return `Hi ${name}! This is from PRO-TO-GROW. We are pleased to inform you about your upcoming promotion video${prodSegment} scheduled for upload${dateSegment}. Please ensure your video is prepared and scheduled on time! Let us know if you need any details or creative support. 🎬✨`;
};

const getSampleReceivedWhatsAppText = (name: string, product: string, orderDate?: string, lang: WhatsAppLang = 'en') => {
  const displayOrderDate = toDisplayDate(orderDate);
  const formattedProd = formatProductForWhatsApp(product);
  if (lang === 'as') {
    const prodSegment = formattedProd ? `${formattedProd} ৰ ` : '';
    const dateSegment = displayOrderDate ? ` (${displayOrderDate} তাৰিখে)` : '';
    return `নমস্কাৰ ${name}! PRO-TO-GROW ৰ ফালৰ পৰা জনাইছোঁ। আমি আপোনালৈ ${prodSegment}প্ৰডাক্ট ছেম্পলটো পঠিয়াই দিছিলোঁ${dateSegment}। পাৰ্চেলটো আপুনি সঠিকভাৱে পালে নে অনুগ্ৰহ কৰি জনাবচোন? যাতে আমি ভিডিঅ'ৰ পৰৱৰ্তী কামখিনি আগবঢ়াব পাৰোঁ। ধন্যবাদ! 📦🎁✨`;
  }
  const prodSegment = formattedProd ? ` for ${formattedProd}` : '';
  const dateSegment = displayOrderDate ? ` (dispatched on ${displayOrderDate})` : '';
  return `Hi ${name}! This is from PRO-TO-GROW. We sent out the product sample${prodSegment}${dateSegment} to your address. Could you please confirm if you have received the parcel safely? Let us know so we can coordinate the next steps for your promotional video! 📦🎁✨`;
};

const getSampleDispatchedTrackingWhatsAppText = (
  name: string,
  product: string,
  courierName?: string,
  trackingId?: string,
  dispatchDate?: string,
  lang: WhatsAppLang = 'en'
) => {
  const displayDate = toDisplayDate(dispatchDate);
  const prod = formatProductForWhatsApp(product || 'Product');
  const courier = courierName?.trim() || '';
  const tracking = trackingId?.trim() || '';

  if (lang === 'as') {
    let courierSection = '';
    if (courier && tracking) {
      courierSection = `\n\n📦 ডেলিভাৰী আৰু ট্ৰেকিং তথ্য (Courier & Tracking Details):
🚚 কুৰিয়াৰ সংগী (Courier Partner): ${courier}
🔖 ট্ৰেকিং নম্বৰ (Tracking ID / AWB): ${tracking}${displayDate ? `\n📅 প্ৰেৰণৰ তাৰিখ (Dispatch Date): ${displayDate}` : ''}`;
    } else if (courier) {
      courierSection = `\n\n📦 ডেলিভাৰী তথ্য (Delivery Details):
🚚 কুৰিয়াৰ সংগী (Courier Partner): ${courier}${displayDate ? `\n📅 প্ৰেৰণৰ তাৰিখ (Dispatch Date): ${displayDate}` : ''}
(ট্ৰেকিং নম্বৰ শীঘ্ৰেই জনোৱা হ'ব)`;
    } else if (tracking) {
      courierSection = `\n\n📦 ট্ৰেকিং তথ্য (Tracking Details):
🔖 ট্ৰেকিং নম্বৰ (Tracking ID / AWB): ${tracking}${displayDate ? `\n📅 প্ৰেৰণৰ তাৰিখ (Dispatch Date): ${displayDate}` : ''}`;
    } else {
      courierSection = `\n\n📦 ডেলিভাৰী তথ্য:
(কুৰিয়াৰ আৰু ট্ৰেকিং নম্বৰ শীঘ্ৰেই জনোৱা হ'ব)`;
    }

    const viaSegment = courier ? `${courier} ৰ জৰিয়তে ` : '';

    return `নমস্কাৰ ${name}! PRO-TO-GROW ৰ ফালৰ পৰা জনাইছোঁ।

আমি আপোনাৰ "${prod}" প্ৰডাক্ট ছেম্পলটো ${viaSegment}পঠিয়াই দিছোঁ! 📦🚚${courierSection}

অনুগ্ৰহ কৰি ওপৰৰ ট্ৰেকিং আইডিৰ সহায়ত আপোনাৰ পাৰ্চেলটো ট্ৰেক কৰিব আৰু পাৰ্চেলটো সুৰক্ষিতভাৱে পোৱাৰ পাছত আমাক এবাৰ জনাবচোন, যাতে আমি ভিডিঅ'ৰ পৰৱৰ্তী কামখিনি আগবঢ়াব পাৰোঁ। ধন্যবাদ! 🎬🛍️✨`;
  }

  // English Copy
  let courierSectionEn = '';
  if (courier && tracking) {
    courierSectionEn = `\n\n📦 Courier & Tracking Details:
🚚 Courier Partner: ${courier}
🔖 Tracking ID / AWB: ${tracking}${displayDate ? `\n📅 Dispatch Date: ${displayDate}` : ''}`;
  } else if (courier) {
    courierSectionEn = `\n\n📦 Courier Details:
🚚 Courier Partner: ${courier}${displayDate ? `\n📅 Dispatch Date: ${displayDate}` : ''}
(Tracking ID / AWB will be shared shortly)`;
  } else if (tracking) {
    courierSectionEn = `\n\n📦 Tracking Details:
🔖 Tracking ID / AWB: ${tracking}${displayDate ? `\n📅 Dispatch Date: ${displayDate}` : ''}`;
  } else {
    courierSectionEn = `\n\n📦 Courier & Tracking details will follow shortly.`;
  }

  const viaSegmentEn = courier ? ` via ${courier}` : '';

  return `Hi ${name}! This is from PRO-TO-GROW.

We are pleased to inform you that we have sent your product sample for "${prod}"${viaSegmentEn}! 📦🚚${courierSectionEn}

Please track your parcel using the Tracking ID / details above. Once you receive the parcel safely, kindly confirm with us so we can coordinate the next steps for your promotional video. Thank you! 🎬🛍️✨`;
};

const getFollowUpWhatsAppText = (name: string, product: string, date: string, lang: WhatsAppLang = 'en') => {
  const displayDate = toDisplayDate(date);
  const formattedProd = formatProductForWhatsApp(product);
  if (lang === 'as') {
    const prodSegment = formattedProd ? `${formattedProd} ৰ ` : '';
    const dateSegment = displayDate ? `${displayDate} তাৰিখে আপল'ডৰ বাবে ` : '';
    return `নমস্কাৰ ${name}! PRO-TO-GROW ৰ পৰা জনাইছোঁ। ${prodSegment}প্ৰম'শ্বনেল ভিডিঅ'টোৰ প্ৰস্তুতি কেনে চলিছে? ${dateSegment}কামখিনি আগবাঢ়িছে নে অনুগ্ৰহ কৰি জনাবচোন! 📹✨`;
  }
  const prodSegment = formattedProd ? ` for ${formattedProd}` : '';
  const dateSegment = displayDate ? ` on ${displayDate}` : ' on the scheduled date';
  return `Hi ${name}! This is from PRO-TO-GROW. Are you preparing the promotion video${prodSegment} for upload${dateSegment}? Please let us know the progress!`;
};

const getGuidelinesWhatsAppText = (name: string, product: string, date: string, lang: WhatsAppLang = 'en') => {
  const displayDate = toDisplayDate(date);
  const formattedProd = formatProductForWhatsApp(product);
  if (lang === 'as') {
    const prodSegment = formattedProd ? `${formattedProd} ৰ ` : '';
    const dateSegment = displayDate ? `${displayDate} তাৰিখে ` : '';
    return `নমস্কাৰ ${name}! PRO-TO-GROW ৰ ফালৰ পৰা এটা মনত পেলাই দিয়াৰ বাৰ্তা। ${prodSegment}ভিডিঅ'টো ${dateSegment}ৰিলিজৰ সময়ত নিৰ্ধাৰিত মুখ্য পইণ্টসমূহ, লিংক আৰু হেচটেগ ভালদৰে উল্লেখ কৰিবচোন। ভিডিঅ'টো চাবলৈ অপেক্ষা কৰি আছোঁ! 📋✨`;
  }
  const prodSegment = formattedProd ? ` for ${formattedProd}` : '';
  const dateSegment = displayDate ? ` on ${displayDate}` : ' on the scheduled date';
  return `Hi ${name}! Quick reminder from PRO-TO-GROW regarding your upcoming promotion video${prodSegment} releasing${dateSegment}. Please make sure to highlight the key product benefits and follow approved talking points. Looking forward to the release!`;
};

const getPaymentDetailsWhatsAppText = (name: string, product: string, amount?: number, ref?: string, lang: WhatsAppLang = 'en') => {
  const formattedAmt = amount ? `₹${amount.toLocaleString()}` : 'নিৰ্ধাৰিত পাৰিশ্ৰমিক';
  const formattedAmtEn = amount ? `₹${amount.toLocaleString()}` : 'your remuneration';
  const refStrAs = ref ? ` (ৰেফাৰেন্স/UTR: ${ref})` : '';
  const refStrEn = ref ? ` (Reference/UTR: ${ref})` : '';
  const formattedProd = formatProductForWhatsApp(product);
  if (lang === 'as') {
    const prodSegment = formattedProd ? `${formattedProd} ৰ ` : '';
    return `নমস্কাৰ ${name}! PRO-TO-GROW ৰ ফালৰ পৰা জনাইছোঁ। আপোনাৰ ${prodSegment}প্ৰম'শ্বনেল ভিডিঅ'ৰ বাবে ${formattedAmt} ৰ পেমেন্ট প্ৰচেছ কৰা হৈছে${refStrAs}। অনুগ্ৰহ কৰি আপোনাৰ একাউণ্ট পৰীক্ষা কৰি পেমেন্ট পোৱাটো নিশ্চিত কৰিবচোন। ধন্যবাদ! 💳✨`;
  }
  const prodSegment = formattedProd ? ` for "${formattedProd}"` : '';
  return `Hi ${name}! This is from PRO-TO-GROW. We have cleared and processed the payment of ${formattedAmtEn}${prodSegment}${refStrEn}. Please check your account and confirm receipt! Let us know if you need any details. Thank you! 💳✨`;
};

export const getVideoUploadReminderWhatsAppText = (
  name: string,
  product: string,
  date: string,
  uploadTimeArg: string = '6:00 PM',
  buyingLinkArg?: string,
  lang: WhatsAppLang = 'en'
) => {
  const infName = name || 'Creator';
  const prod = formatProductForWhatsApp(product || 'Product Promotional Video');
  const displayDate = toDisplayDate(date) || 'today / as scheduled';
  let displayTime = uploadTimeArg || '6:00 PM';
  if (isInfluencerPreferredTime(uploadTimeArg)) {
    const timeMatch = uploadTimeArg.match(/(\d{1,2}:\d{2}\s*(am|pm)?)/i);
    displayTime = lang === 'as'
      ? (timeMatch ? `${timeMatch[1]} (আপোনাৰ সুবিধাৰ সময়)` : "আপোনাৰ সুবিধা অনুসৰি")
      : (timeMatch ? `${timeMatch[1]} (Influencer's Preferred Time)` : "At your convenience");
  }

  const buyingLink = buyingLinkArg?.trim() || '';

  if (lang === 'as') {
    let linkSegmentAs = '';
    if (buyingLink) {
      linkSegmentAs = `\n\n🔗 *প্ৰডাক্ট ক্ৰয়ৰ লিংক (Buying Link):*\n${buyingLink}\n(ভিডিঅ'ৰ কেপশ্বন/বায়' আৰু পিন কমেণ্টত এই ক্ৰয় লিংকটো যোগ কৰিবলৈ নাপাহৰিব)`;
    }

    return `নমস্কাৰ ${infName}! PRO-TO-GROW ৰ ফালৰ পৰা এটা জৰুৰী সোঁৱৰণী বাৰ্তা (Video Upload Reminder)। ⏰🎬✨

আপোনাৰ "${prod}" প্ৰম'শ্বনেল ভিডিঅ'টো আপল'ডৰ বাবে সোঁৱৰাই দিয়া হৈছে:
📅 নিৰ্ধাৰিত আপল'ড তাৰিখ (Upload Date): ${displayDate}
⏰ নিৰ্ধাৰিত সময় (Upload Time): ${displayTime}${linkSegmentAs}

⚠️ অনুগ্ৰহ কৰি ভিডিঅ'টো নিৰ্ধাৰিত সময়ত সোনকালে আপল'ড কৰাটো নিশ্চিত কৰিব আৰু ভিডিঅ'টো আপল'ড হোৱাৰ ঠিক পিছতেই আমালৈ লাইভ ভিডিঅ'ৰ লিংকটো (Uploaded Video Link) তৎক্ষণাৎ প্ৰেৰণ কৰিবচোন।

কিবা অসুবিধা বা প্ৰশ্ন থাকিলে আমাক জনাব। আপোনাৰ সহযোগিতাৰ বাবে অশেষ ধন্যবাদ! 🙏✨`;
  }

  let linkSegmentEn = '';
  if (buyingLink) {
    linkSegmentEn = `\n\n🔗 *Product Buying Link:*\n${buyingLink}\n(Please make sure to prominently add this buying link in your description/bio and pinned comment)`;
  }

  return `Hi ${infName}! Friendly video upload reminder from PRO-TO-GROW! ⏰🎬✨

This is a quick reminder regarding your upcoming promotional video upload for *"${prod}"*:
📅 Scheduled Upload Date: ${displayDate}
⏰ Scheduled Upload Time: ${displayTime}${linkSegmentEn}

⚠️ Please ensure the video is uploaded on schedule. Once published, kindly share the live uploaded video link with us immediately for verification and campaign tracking!

Let us know if you need any assistance or creative support. Thank you for your continued partnership! 🙏✨`;
};

export const getAdvanceLinkAndEditReviewWhatsAppText = (
  name: string,
  product: string,
  uploadDateOrOptions?: string | {
    uploadDate?: string;
    uploadTime?: string;
    buyingLink?: string;
  },
  uploadTimeArg: string = '6:00 PM',
  buyingLinkArg?: string,
  langArg: WhatsAppLang = 'en'
) => {
  const infName = name || 'Creator';
  const prod = formatProductForWhatsApp(product || 'Product Promotional Video');
  let uploadDate = 'the scheduled date';
  let uploadTime = '6:00 PM';
  let buyingLink = '';
  let lang: WhatsAppLang = 'en';

  if (typeof uploadDateOrOptions === 'object' && uploadDateOrOptions !== null) {
    uploadDate = toDisplayDate(uploadDateOrOptions.uploadDate) || 'the scheduled date';
    uploadTime = (uploadDateOrOptions.uploadTime && uploadDateOrOptions.uploadTime.trim()) || '6:00 PM';
    buyingLink = uploadDateOrOptions.buyingLink?.trim() || '';
    lang = (typeof uploadTimeArg === 'string' && (uploadTimeArg === 'en' || uploadTimeArg === 'as'))
      ? (uploadTimeArg as WhatsAppLang)
      : (langArg || 'en');
  } else {
    uploadDate = toDisplayDate(uploadDateOrOptions) || 'the scheduled date';
    uploadTime = (uploadTimeArg && uploadTimeArg.trim()) || '6:00 PM';
    buyingLink = buyingLinkArg?.trim() || '';
    lang = langArg || 'en';
  }

  let displayUploadTime = uploadTime;
  if (isInfluencerPreferredTime(uploadTime)) {
    const timeMatch = uploadTime.match(/(\d{1,2}:\d{2}\s*(am|pm)?)/i);
    if (timeMatch) {
      displayUploadTime = lang === 'as'
        ? `${timeMatch[1]} (ইনফ্লুৱেন্সাৰৰ সুবিধা অনুসৰি সময় / Influencer's Preferred Time)`
        : `${timeMatch[1]} (Influencer's Preferred Time)`;
    } else {
      displayUploadTime = lang === 'as'
        ? "আপোনাৰ সুবিধা অনুসৰি সময় (Influencer's Preferred Time)"
        : "Influencer's Preferred Time (At your convenience)";
    }
  }

  if (lang === 'as') {
    let linkSegmentAs = '';
    if (buyingLink) {
      linkSegmentAs = `\n\n🔗 *প্ৰডাক্ট ক্ৰয়ৰ লিংক (Official Buying Link):*\n${buyingLink}\n*(ভিডিঅ' আপল'ডৰ সময়ত কেপশ্বন/ডেচক্ৰিপশ্বন, বায়' আৰু পিন কমেণ্টত এই ক্ৰয় লিংকটো যোগ কৰিবলৈ সাজু ৰাখক)*`;
    } else {
      linkSegmentAs = `\n\n🔗 *প্ৰডাক্ট ক্ৰয়ৰ লিংক (Buying Link):* (আমাৰ প্ৰদান কৰা অফিচিয়েল ক্ৰয় লিংকটো ব্যৱহাৰ কৰিব)`;
    }

    return `নমস্কাৰ ${infName}! PRO-TO-GROW ৰ ফালৰ পৰা এটা অতি গুৰুত্বপূৰ্ণ আপডেট (Advance Buying Link & Final Video Approval)। 🎬✨

আমি আপোনাৰ "${prod}" প্ৰম'শ্বনেল ভিডিঅ'ৰ বাবে অফিচিয়েল ক্ৰয় লিংকটো (Buying Link) আপোনাৰ এডিটেড ভিডিঅ' আমালৈ জমা দিয়াৰ পূৰ্বেই আগতীয়াকৈ প্ৰদান কৰিছোঁ, যাতে সকলো সাজু থাকে।

⚠️ *অতি গুৰুত্বপূৰ্ণ চৰ্ত আৰু বাধ্যতামূলক নিৰ্দেশনা (MANDATORY REQUIREMENTS):*
১️⃣ *পূৰ্বৰ এডিটিং নিৰ্দেশনা অনুসৰি এডিট:* আমাৰ পূৰ্বৰ এডিটিং বাৰ্তাত (Previous Editing Message / Instructions) দিয়া সকলো পৰামৰ্শ আৰু সংশোধন অনুসৰি ভিডিঅ'টো সঠিকভাৱে এডিট কৰিব লাগিব।
২️⃣ *আপল'ডৰ পূৰ্বে চূড়ান্ত ভিডিঅ' পৰীক্ষা:* ছ'চিয়েল মিডিয়াত ৰাজহুৱাভাৱে আপল'ড কৰাৰ পূৰ্বে আপুনি ফাইনেল এডিটেড ভিডিঅ'টো (Final Edited Video) বাধ্যতামূলকভাৱে আমাক দেখুৱাই অনুমোদন (Approval) ল'ব লাগিব। আমাৰ অনুমোদন অবিহনে ভিডিঅ' আপল'ড কৰিব নোৱাৰিব।

📅 নিৰ্ধাৰিত আপল'ডৰ তাৰিখ (Scheduled Upload Date): ${uploadDate}
⏰ নিৰ্ধাৰিত আপল'ড সময় (Scheduled Upload Time): ${displayUploadTime}${linkSegmentAs}

অনুগ্ৰহ কৰি নিৰ্দেশনা অনুসৰি এডিট সম্পন্ন কৰি ফাইনেল ভিডিঅ' কাটটো সোনকালে আমালৈ প্ৰেৰণ কৰক। ধন্যবাদ! 🙏✨`;
  }

  let linkSegmentEn = '';
  if (buyingLink) {
    linkSegmentEn = `\n\n🔗 *Product Buying Link:*\n${buyingLink}\n*(Please keep this buying link ready to add in your caption/description, bio, and pinned comment upon upload)*`;
  } else {
    linkSegmentEn = `\n\n🔗 *Product Buying Link:* (Please use our provided official buying link)`;
  }

  return `Hi ${infName}! Important collaboration update from PRO-TO-GROW! 🎬✨

We are sharing the official product buying link with you in advance, before your edited video has been submitted to us, so you can keep everything prepared.

⚠️ *STRICT MANDATORY REQUIREMENTS:*
1️⃣ *Edit Per Previous Feedback:* You MUST edit the video strictly as per our previous editing message and instructions.
2️⃣ *Submit Final Video Before Uploading:* Before uploading or publishing the video publicly to your social media, you MUST submit the final edited video to our team for review and approval. Do not publish until our team confirms sign-off.

📅 Scheduled Upload Date: ${uploadDate}
⏰ Scheduled Upload Time: ${displayUploadTime}${linkSegmentEn}

Please complete the requested edits and share the final video cut with us as soon as it's ready. Thank you so much for your effort and cooperation! 🙏✨`;
};

export const getEditedVideoReadyCheckWhatsAppText = (
  name: string,
  product: string,
  deadlineDate?: string,
  lang: WhatsAppLang = 'en'
) => {
  const infName = name || 'Creator';
  const formattedProd = formatProductForWhatsApp(product);
  const prod = formattedProd ? `"${formattedProd}"` : 'the promotional video';
  const displayDeadline = toDisplayDate(deadlineDate);

  if (lang === 'as') {
    const deadlineSegmentAs = displayDeadline ? ` (${displayDeadline} তাৰিখে আপল'ডৰ বাবে নিৰ্ধাৰিত)` : '';
    return `নমস্কাৰ ${infName}! PRO-TO-GROW ৰ ফালৰ পৰা যোগাযোগ কৰিছোঁ। 🎬✨

আপোনাৰ ${prod} ৰ এডিটেড ভিডিঅ'টো (Edited Video) সাজু হ'ল নেকি?${deadlineSegmentAs}

ভিডিঅ'টোৰ এডিটিং সম্পূৰ্ণ হৈছে যদি অনুগ্ৰহ কৰি আমাক এটা আপডেট জনাব আৰু ফাইনেল ভিডিঅ' কাটটো (Edited Video Cut / Link) আমালৈ পৰীক্ষাৰ বাবে প্ৰেৰণ কৰিবচোন। কিবা সহায় বা প্ৰশ্ন থাকিলে জনাব। আপোনাৰ সহযোগিতাৰ বাবে ধন্যবাদ! 🙏✨`;
  }

  const deadlineSegmentEn = displayDeadline ? ` scheduled for ${displayDeadline}` : '';
  return `Hi ${infName}! Hope you are having a wonderful day! 🎬✨

Quick check-in from PRO-TO-GROW regarding your video for *${prod}*${deadlineSegmentEn}.

Could you please confirm if the edited video is ready? If the edit is complete, please share the revised draft / final cut with us for review so we can give you quick sign-off before publishing.

Let us know if you need any assistance or clarification. Looking forward to your update, thank you! 🙏✨`;
};

export const getVideoApprovedDetailsSoonWhatsAppText = (
  name: string,
  product: string,
  lang: WhatsAppLang = 'en'
) => {
  const infName = name || 'Creator';
  const formattedProd = formatProductForWhatsApp(product);
  const prod = formattedProd ? `"${formattedProd}"` : 'the promotional video';

  if (lang === 'as') {
    return `নমস্কাৰ ${infName}! PRO-TO-GROW ৰ ফালৰ পৰা এটা সুখবৰ! ✅🎬✨

আমি আপোনাৰ ${prod} ৰ প্ৰম'শ্বনেল ভিডিঅ'টো পৰীক্ষা কৰিলোঁ আৰু আনন্দেৰে জনাইছোঁ যে আপোনাৰ ভিডিঅ'টো চূড়ান্তভাৱে *অনুমোদিত (APPROVED)* হৈছে! 🎉🙌

আমি অতি শীঘ্ৰেই আপোনাক ভিডিঅ'টো আপল'ড কৰাৰ *নিৰ্ধাৰিত তাৰিখ (Upload Date), সময় (Upload Time) আৰু অফিচিয়েল প্ৰডাক্ট ক্ৰয়ৰ লিংক (Buying Link)* প্ৰদান কৰিম।

অনুগ্ৰহ কৰি আমি আপল'ডৰ সময়সূচী আৰু ক্ৰয় লিংক নপঠিওৱালৈকে ভিডিঅ'টো ৰাজহুৱাভাৱে আপল'ড নকৰিব। আপোনাৰ সুন্দৰ কাম আৰু সহযোগিতাৰ বাবে অশেষ ধন্যবাদ! 🙏✨`;
  }

  return `Hi ${infName}! Great news from PRO-TO-GROW! ✅🎬✨

We have reviewed your promotional video for *${prod}*, and we are delighted to inform you that your video is officially *APPROVED*! 🎉🙌

Our team is currently finalizing the schedule and links. We will share your *upload date, upload time, and official product buying link* with you very soon.

Please hold on before uploading publicly until we send you the exact upload schedule and buying link. Thank you so much for your wonderful work and effort! 🙏✨`;
};

export const getOfficeHoursFeedbackNoticeWhatsAppText = (
  name: string,
  product: string,
  isSundayArg?: boolean,
  lang: WhatsAppLang = 'en'
) => {
  const infName = name || 'Creator';
  const formattedProd = formatProductForWhatsApp(product);
  const prod = formattedProd ? `"${formattedProd}"` : 'the promotional video';
  const isSunday = typeof isSundayArg === 'boolean' ? isSundayArg : new Date().getDay() === 0;

  if (lang === 'as') {
    if (isSunday) {
      return `নমস্কাৰ ${infName}! PRO-TO-GROW ৰ ফালৰ পৰা জনাইছোঁ। ✨

আপোনাৰ ${prod} ভিডিঅ' সন্দৰ্ভত এটা গুৰুত্বপূৰ্ণ জাননী:
⏰ আমাৰ অফিচ টিমৰ কৰ্ম সময় হৈছে পুৱা ১০:০০ বজাৰ পৰা সন্ধিয়া ৬:০০ বজাৰ ভিতৰত (10:00 AM to 6:00 PM)।

📅 আজি দেওবাৰ (Sunday - Office Weekly Off) হোৱাৰ বাবে আমাৰ অফিচ দলৰ দ্বাৰা ভিডিঅ'ৰ আনুষ্ঠানিক পৰীক্ষা আৰু ফিডবেক আজি সন্ধিয়া দিয়াটো সম্ভৱ নহ'ব। কাইলৈ সোমবাৰে অফিচ সময়ত (১০:০০ AM - ৬:০০ PM) আমাৰ দলে ভিডিঅ'টো পৰীক্ষা কৰি আপোনাক চূড়ান্ত ফিডবেক প্ৰদান কৰিব।

মই ব্যক্তিগতভাৱে (Personally) এতিয়া আপোনাৰ বাৰ্তাৰ উত্তৰ দিবলৈ আৰু কথা পাতিবলৈ উপলব্ধ আছোঁ। কিন্তু ভিডিঅ'ৰ আনুষ্ঠানিক চূড়ান্ত ফিডবেক আৰু অনুমোদনৰ বাবে কাইলৈ সোমবাৰলৈকে অপেক্ষা কৰিব লাগিব।

আপোনাৰ বুজাবুজি আৰু সহযোগিতাৰ বাবে অশেষ ধন্যবাদ! 🙏✨`;
    }

    return `নমস্কাৰ ${infName}! PRO-TO-GROW ৰ ফালৰ পৰা জনাইছোঁ। ✨

আপোনাৰ ${prod} ভিডিঅ' সন্দৰ্ভত এটা গুৰুত্বপূৰ্ণ জাননী:
⏰ আমাৰ অফিচ টিমৰ কৰ্ম সময় হৈছে পুৱা ১০:০০ বজাৰ পৰা সন্ধিয়া ৬:০০ বজাৰ ভিতৰত (10:00 AM to 6:00 PM)।

সন্ধিয়া ৬:০০ বজাৰ পাছত আমাৰ ৰিভিউ টিম বন্ধ হোৱাৰ বাবে আজি সন্ধিয়া ভিডিঅ'ৰ দলীয় আনুষ্ঠানিক ফিডবেক দিব পৰা নাযাব; কাইলৈ অফিচ সময়ত (১০:০০ AM - ৬:০০ PM) আমাৰ দলে ভিডিঅ'টো পৰীক্ষা কৰি আপোনাক ফিডবেক প্ৰদান কৰিব।

মই ব্যক্তিগতভাৱে (Personally) এতিয়া আপোনাৰ বাৰ্তাৰ উত্তৰ দিবলৈ আৰু কথা পাতিবলৈ উপলব্ধ আছোঁ। কিন্তু ভিডিঅ'ৰ চূড়ান্ত ফিডবেক আৰু অনুমোদন কাইলৈ অফিচ সময়তে লাভ কৰিব।

ধৈৰ্য ধৰাৰ বাবে অশেষ ধন্যবাদ! 🙏✨`;
  }

  // English Copy
  if (isSunday) {
    return `Hi ${infName}! Hope you are having a wonderful day! ✨

Regarding your promotional video for *${prod}*:
⏰ Please note that our office team working hours are 10:00 AM to 6:00 PM.

📅 Today is Sunday (Office Weekly Off), so our review team is currently off duty and cannot evaluate or provide official video feedback today. Our team will review your video and provide the final feedback tomorrow (Monday) during regular office hours (10:00 AM – 6:00 PM).

However, I can personally reply and chat with you right now for any urgent questions or updates! For the team's official video review and final approval, it will be completed tomorrow during office hours.

Thank you so much for your understanding and cooperation! 🙏✨`;
  }

  return `Hi ${infName}! Hope you are having a wonderful day! ✨

Regarding your promotional video for *${prod}*:
⏰ Please note that our office team working hours are 10:00 AM to 6:00 PM.

Since it is currently after 6:00 PM, our review team is closed for the day and cannot evaluate or provide video feedback this evening. Our team will review your video and provide the feedback tomorrow during regular office hours (10:00 AM – 6:00 PM).

I can personally reply and chat with you right now to note your points, but for the final official review and video feedback, it will be completed tomorrow by our team.

Thank you so much for your patience and cooperation! 🙏✨`;
};

export const isInfluencerPreferredTime = (timeStr?: string): boolean => {
  if (!timeStr) return false;
  return /influencer|preferred|convenience|সুবিধা/i.test(timeStr);
};

export const getPreferredTimeOption = (influencer: any, task: any, lang: WhatsAppLang = 'en'): string => {
  const savedTime = (influencer?.preferredTime || influencer?.preferredUploadTime || task?.influencerPreferredTime || task?.preferredTime || '').trim();
  if (savedTime) {
    const timeMatch = savedTime.match(/(\d{1,2}:\d{2}\s*(am|pm)?)/i);
    const cleanTime = timeMatch ? timeMatch[1] : savedTime;
    return lang === 'as' 
      ? `${cleanTime} (ইনফ্লুৱেন্সাৰৰ সুবিধা অনুসৰি)`
      : `${cleanTime} (Influencer's Preferred Time)`;
  }
  return lang === 'as'
    ? "আপোনাৰ সুবিধা অনুসৰি সময় (Influencer's Preferred Time)"
    : "Influencer's Preferred Time";
};

export const to24HourTime = (timeStr?: string): string => {
  if (!timeStr) return "18:00";
  const trimmed = timeStr.trim();
  if (isInfluencerPreferredTime(trimmed)) {
    const timeMatch = trimmed.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
    if (timeMatch) {
      let [, hours, minutes, modifier] = timeMatch;
      let h = parseInt(hours, 10);
      const mod = modifier?.toLowerCase();
      if (mod === "pm" && h < 12) h += 12;
      if (mod === "am" && h === 12) h = 0;
      return `${String(h).padStart(2, "0")}:${minutes}`;
    }
    return "";
  }
  if (/^([01]?\d|2[0-3]):[0-5]\d$/.test(trimmed)) {
    const [h, m] = trimmed.split(":");
    return `${h.padStart(2, "0")}:${m}`;
  }
  const match = trimmed.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
  if (match) {
    let [, hours, minutes, modifier] = match;
    let h = parseInt(hours, 10);
    const mod = modifier?.toLowerCase();
    if (mod === "pm" && h < 12) h += 12;
    if (mod === "am" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${minutes}`;
  }
  return "18:00";
};

export const to12HourTime = (time24?: string): string => {
  if (!time24) return "6:00 PM";
  const trimmed = time24.trim();
  if (/am|pm|preferred|সুবিধা/i.test(trimmed)) return trimmed;
  const match = trimmed.match(/^(\d{1,2}):(\d{2})/);
  if (match) {
    let h = parseInt(match[1], 10);
    const m = match[2];
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12;
    if (h === 0) h = 12;
    return `${h}:${m} ${ampm}`;
  }
  return trimmed;
};

const getInfluencerChecklistPdfWhatsAppText = (name: string, product: string, videoId?: string, lang: WhatsAppLang = 'en') => {
  const formattedProd = formatProductForWhatsApp(product);
  const prodLabel = formattedProd || 'the product';
  const vidStr = videoId ? ` (Video ID: ${videoId})` : '';
  if (lang === 'as') {
    return `নমস্কাৰ ${name}!\n\nPRO-TO-GROW ৰ ফালৰ পৰা আপোনাৰ "${formattedProd || 'প্ৰডাক্ট'}"${vidStr} ভিডিঅ'ৰ বাবে নিৰ্ধাৰিত অফিচিয়েল ইনফ্লুৱেন্সাৰ চেক-লিষ্ট (Influencer Checklist PDF) সংলগ্ন কৰা হৈছে।\n\n📄 অনুগ্ৰহ কৰি PDF ফৰ্মেটৰ চেক-লিষ্টখন পৰীক্ষা কৰি ভিডিঅ' শ্বুটিঙৰ সময়ত মুখ্য পইণ্ট আৰু নিয়মসমূহ মানি চলিব। কিবা জানিবলগীয়া থাকিলে জনাব। ধন্যবাদ! 📋📄✨`;
  }
  return `Hi ${name}!\n\nThis is from PRO-TO-GROW. Please find the official Influencer Checklist PDF for your upcoming "${prodLabel}"${vidStr} video placement.\n\n📄 Kindly review the attached PDF checklist for approved talking points, benefits, and guidelines before shooting & posting. Thank you! 📋📄✨`;
};

const getUploadScheduleWhatsAppText = (
  name: string,
  product: string,
  optionsOrDate?: string | {
    uploadDate?: string;
    uploadTime?: string;
    buyingLink?: string;
    facebookDescLink?: string;
    facebookPinCommentLink?: string;
    instagramBioLink?: string;
    instagramWishlink?: string;
    youtubeDescLink?: string;
    pinCommentOnly?: boolean;
  },
  uploadTimeArg: string = '6:00 PM',
  buyingLinkArg?: string,
  langArg: WhatsAppLang = 'en',
  fbDescLinkArg?: string,
  fbPinLinkArg?: string,
  igBioLinkArg?: string,
  igWishlinkArg?: string,
  ytDescLinkArg?: string,
  pinCommentOnlyArg?: boolean
) => {
  const prod = formatProductForWhatsApp(product || 'Product Promotional Video');
  let uploadDate = 'the scheduled date';
  let uploadTime = '6:00 PM';
  let buyingLink = '';
  let facebookDescLink = '';
  let facebookPinCommentLink = '';
  let instagramBioLink = '';
  let instagramWishlink = '';
  let youtubeDescLink = '';
  let pinCommentOnly = false;
  let lang: WhatsAppLang = 'en';

  if (typeof optionsOrDate === 'object' && optionsOrDate !== null) {
    uploadDate = toDisplayDate(optionsOrDate.uploadDate) || 'the scheduled date';
    uploadTime = (optionsOrDate.uploadTime && optionsOrDate.uploadTime.trim()) || '6:00 PM';
    buyingLink = optionsOrDate.buyingLink?.trim() || '';
    facebookDescLink = optionsOrDate.facebookDescLink?.trim() || '';
    facebookPinCommentLink = optionsOrDate.facebookPinCommentLink?.trim() || '';
    instagramBioLink = optionsOrDate.instagramBioLink?.trim() || '';
    instagramWishlink = optionsOrDate.instagramWishlink?.trim() || '';
    youtubeDescLink = optionsOrDate.youtubeDescLink?.trim() || '';
    pinCommentOnly = Boolean(optionsOrDate.pinCommentOnly);
    lang = (typeof uploadTimeArg === 'string' && (uploadTimeArg === 'en' || uploadTimeArg === 'as')) 
      ? (uploadTimeArg as WhatsAppLang) 
      : (langArg || 'en');
  } else {
    uploadDate = toDisplayDate(optionsOrDate) || 'the scheduled date';
    uploadTime = (uploadTimeArg && uploadTimeArg.trim()) || '6:00 PM';
    buyingLink = buyingLinkArg?.trim() || '';
    lang = langArg || 'en';
    facebookDescLink = fbDescLinkArg?.trim() || '';
    facebookPinCommentLink = fbPinLinkArg?.trim() || '';
    instagramBioLink = igBioLinkArg?.trim() || '';
    instagramWishlink = igWishlinkArg?.trim() || '';
    youtubeDescLink = ytDescLinkArg?.trim() || '';
    pinCommentOnly = Boolean(pinCommentOnlyArg);
  }

  const hasFb = Boolean(facebookDescLink || facebookPinCommentLink);
  const hasIg = Boolean(instagramBioLink || instagramWishlink);
  const hasYt = Boolean(youtubeDescLink);
  const hasPlatformLinks = hasFb || hasIg || hasYt;

  let displayUploadTime = uploadTime;
  if (isInfluencerPreferredTime(uploadTime)) {
    const timeMatch = uploadTime.match(/(\d{1,2}:\d{2}\s*(am|pm)?)/i);
    if (timeMatch) {
      displayUploadTime = lang === 'as' 
        ? `${timeMatch[1]} (ইনফ্লুৱেন্সাৰৰ সুবিধা অনুসৰি সময় / Influencer's Preferred Time)`
        : `${timeMatch[1]} (Influencer's Preferred Time)`;
    } else {
      displayUploadTime = lang === 'as'
        ? "আপোনাৰ সুবিধা অনুসৰি সময় (Influencer's Preferred Time)"
        : "Influencer's Preferred Time (At your convenience)";
    }
  }

  // --- Option 2: Pin Comment Only (User Request: Message will tell influencer add our provided link and details only on pin comment) ---
  if (pinCommentOnly) {
    if (lang === 'as') {
      let pinBlockAs = '';
      const pinTargetLink = facebookPinCommentLink || buyingLink || facebookDescLink || '';
      if (hasPlatformLinks || pinTargetLink) {
        const partsAs: string[] = [];
        if (facebookPinCommentLink) partsAs.push(`📘 ফেচবুক পিন কমেণ্ট লিংক: ${facebookPinCommentLink}`);
        if (buyingLink && buyingLink !== facebookPinCommentLink) partsAs.push(`🔗 মূল প্ৰডাক্ট ক্ৰয়ৰ লিংক: ${buyingLink}`);
        if (instagramWishlink) partsAs.push(`📸 ইনষ্টাগ্ৰাম উইশলিংক: ${instagramWishlink}`);
        if (partsAs.length === 0 && pinTargetLink) partsAs.push(`🔗 প্ৰডাক্ট ক্ৰয়ৰ লিংক: ${pinTargetLink}`);

        pinBlockAs = `\n\n📌 কেৱল পিন কমেণ্টত যোগ কৰিবলগীয়া ক্ৰয়ৰ লিংক আৰু সবিশেষ (PIN COMMENT ONLY):\n${partsAs.join('\n')}\n\n⚠️ অতি গুৰুত্বপূৰ্ণ নিৰ্দেশনা (STRICT INSTRUCTION):\nঅনুগ্ৰহ কৰি আমাৰ প্ৰদান কৰা ওপৰৰ ক্ৰয়ৰ লিংক আৰু প্ৰডাক্টৰ সবিশেষ তথ্য কেৱল আপোনাৰ ভিডিঅ'ৰ প্ৰথম পিন কমেণ্টতহে (PIN COMMENT ONLY) যোগ কৰিব। কেপশ্বন বা ডেচক্ৰিপশ্বনত যোগ নকৰিব, কেৱল কমেণ্টৰ পিনত ৰাখিব যাতে দৰ্শকে সহজে লিংকটো পাই ক্ৰয় কৰিব পাৰে।`;
      } else {
        pinBlockAs = `\n\n📌 কেৱল পিন কমেণ্টত যোগ কৰিবলগীয়া ক্ৰয়ৰ লিংক আৰু সবিশেষ (PIN COMMENT ONLY):\n⚠️ অতি গুৰুত্বপূৰ্ণ নিৰ্দেশনা (STRICT INSTRUCTION):\nভিডিঅ'টো আপল'ড হোৱাৰ পিছত আমাৰ প্ৰদান কৰা অফিচিয়েল প্ৰডাক্ট ক্ৰয়ৰ লিংক আৰু সবিশেষ কেৱল আপোনাৰ ভিডিঅ'ৰ প্ৰথম পিন কমেণ্টতহে (PIN COMMENT ONLY) যোগ কৰিব। অনুগ্ৰহ কৰি কেপশ্বন বা ডেচক্ৰিপশ্বনত যোগ নকৰিব, কেৱল কমেণ্টৰ পিনত ৰাখিব যাতে দৰ্শকে সহজে পাই ক্ৰয় কৰিব পাৰে।`;
      }

      return `নমস্কাৰ ${name}! PRO-TO-GROW ৰ ফালৰ পৰা জনাইছোঁ।

আপোনাৰ "${prod}" প্ৰম'শ্বনেল ভিডিঅ'টো আপল'ডৰ বাবে নিৰ্ধাৰিত দিন আৰু সময়:
📅 আপল'ড তাৰিখ (Date): ${uploadDate}
⏰ আপল'ড সময় (Time): ${displayUploadTime}

⚠️ আপল'ডৰ বাবে অতি গুৰুত্বপূৰ্ণ নিৰ্দেশনা (কেৱল পিন কমেণ্ট / Pin Comment Only):${pinBlockAs}

২️⃣ ভিডিঅ' লিংক প্ৰেৰণ (Video Link):
ভিডিঅ'টো আপল'ড কৰি পিন কমেণ্ট দিয়াৰ ঠিক লগে লগেই অনুগ্ৰহ কৰি আমাক আপল'ড কৰা লাইভ ভিডিঅ'ৰ লিংকটো (Uploaded Video Link) তৎক্ষণাৎ প্ৰেৰণ কৰিবচোন।

কিবা সহায় বা লিংকৰ প্ৰয়োজন হ'লে জনাব। ধন্যবাদ! 🎬🛍️✨`;
    }

    // English Option 2 (Pin Comment Only)
    let pinBlockEn = '';
    const pinTargetLinkEn = facebookPinCommentLink || buyingLink || facebookDescLink || '';
    if (hasPlatformLinks || pinTargetLinkEn) {
      const partsEn: string[] = [];
      if (facebookPinCommentLink) partsEn.push(`📘 Facebook Pin Comment: ${facebookPinCommentLink}`);
      if (buyingLink && buyingLink !== facebookPinCommentLink) partsEn.push(`🔗 Main Buying Link: ${buyingLink}`);
      if (instagramWishlink) partsEn.push(`📸 Instagram Wishlink: ${instagramWishlink}`);
      if (partsEn.length === 0 && pinTargetLinkEn) partsEn.push(`🔗 Product Buying Link: ${pinTargetLinkEn}`);

      pinBlockEn = `\n\n📌 PRODUCT BUYING LINK & DETAILS FOR PINNED COMMENT ONLY:\n${partsEn.join('\n')}\n\n⚠️ STRICT INSTRUCTION (PIN COMMENT ONLY):\nPlease add our provided buying link and product details ONLY in the PINNED COMMENT (Pin Comment) of your video. Do not add it in the caption or description — keep it strictly on the pinned comment only so viewers can immediately find it at the top of comments to purchase!`;
    } else {
      pinBlockEn = `\n\n📌 PRODUCT BUYING LINK & DETAILS FOR PINNED COMMENT ONLY:\n⚠️ STRICT INSTRUCTION (PIN COMMENT ONLY):\nPlease make sure to add our provided official product buying link and product details ONLY in the PINNED COMMENT (Pin Comment) of your video. Do not add it in the caption or description — keep it strictly on the pinned comment only so viewers can easily find and buy the product!`;
    }

    return `Hi ${name}! This is from PRO-TO-GROW.

Please note your upcoming promotional video for "${prod}" is scheduled for upload on:
📅 Scheduled Upload Date: ${uploadDate}
⏰ Scheduled Upload Time: ${displayUploadTime}

⚠️ IMPORTANT INSTRUCTIONS FOR UPLOAD & BUYING LINK (PIN COMMENT ONLY):${pinBlockEn}

2️⃣ Video Link Submission:
As soon as the video is uploaded and your pinned comment is posted, please send us the live uploaded video link immediately for our verification and performance tracking.

Let us know if you need any clarification or updated purchase links. Thank you! 🎬🛍️✨`;
  }

  // --- Option 1: Standard (Description / Bio & Pinned Comment) ---
  if (lang === 'as') {
    let platformBlock = '';
    if (hasPlatformLinks) {
      const parts: string[] = [];
      if (hasFb) {
        const fbLines = ['📘 ফেচবুক (Facebook):'];
        if (facebookDescLink) fbLines.push(`  • কেপশ্বন / ডেচক্ৰিপশ্বন লিংক: ${facebookDescLink}`);
        if (facebookPinCommentLink) fbLines.push(`  • পিন কমেণ্ট লিংক (Pin Comment): ${facebookPinCommentLink}`);
        parts.push(fbLines.join('\n'));
      }
      if (hasIg) {
        const igLines = ['📸 ইনষ্টাগ্ৰাম (Instagram):'];
        if (instagramBioLink) igLines.push(`  • বায়' লিংক (Link in Bio): ${instagramBioLink}`);
        if (instagramWishlink) igLines.push(`  • উইশলিংক (Wishlink): ${instagramWishlink}`);
        parts.push(igLines.join('\n'));
      }
      if (hasYt) {
        const ytLines = ['▶️ ইউটিউব (YouTube):'];
        if (youtubeDescLink) ytLines.push(`  • ডেচক্ৰিপশ্বন লিংক (Description): ${youtubeDescLink}`);
        parts.push(ytLines.join('\n'));
      }
      if (buyingLink) {
        parts.push(`🔗 মূল প্ৰডাক্ট ক্ৰয়ৰ লিংক: ${buyingLink}`);
      }
      platformBlock = `\n\n🛍️ দৰ্শকে প্ৰডাক্ট ক্ৰয় কৰিবলৈ লিংকসমূহ:\n${parts.join('\n\n')}`;
    } else if (buyingLink) {
      platformBlock = `\n\n🛍️ প্ৰডাক্ট ক্ৰয়ৰ লিংক (Buying Link): ${buyingLink}\n(দৰ্শক আৰু গ্ৰাহকে যাতে সহজতে ক্ৰয় কৰিব পাৰে, তাৰ বাবে আপোনাৰ ভিডিঅ'ৰ ডেচক্ৰিপশ্বন/বায়' আৰু পিন কমেণ্টত ক্ৰয়ৰ লিংকটো সঠিকভাৱে অন্তৰ্ভুক্ত কৰিব)`;
    } else {
      platformBlock = `\n\n১️⃣ প্ৰডাক্ট ক্ৰয়ৰ লিংক (Buying Link): দৰ্শক আৰু গ্ৰাহকে যাতে সহজতে প্ৰডাক্টটো ক্ৰয় কৰিব পাৰে, তাৰ বাবে আপোনাৰ ভিডিঅ'ৰ ডেচক্ৰিপশ্বন, বায়' আৰু পিন কমেণ্টত ক্ৰয়ৰ লিংকটো সঠিকভাৱে অন্তৰ্ভুক্ত কৰিব।`;
    }

    return `নমস্কাৰ ${name}! PRO-TO-GROW ৰ ফালৰ পৰা জনাইছোঁ।

আপোনাৰ "${prod}" প্ৰম'শ্বনেল ভিডিঅ'টো আপল'ডৰ বাবে নিৰ্ধাৰিত দিন আৰু সময়:
📅 আপল'ড তাৰিখ (Date): ${uploadDate}
⏰ আপল'ড সময় (Time): ${displayUploadTime}

⚠️ আপল'ডৰ বাবে অতি গুৰুত্বপূৰ্ণ নিৰ্দেশনা:${platformBlock}

২️⃣ ভিডিঅ' লিংক প্ৰেৰণ (Video Link):
ভিডিঅ'টো আপল'ড হোৱাৰ ঠিক লগে লগেই অনুগ্ৰহ কৰি আমাক আপল'ড কৰা লাইভ ভিডিঅ'ৰ লিংকটো (Uploaded Video Link) তৎক্ষণাৎ প্ৰেৰণ কৰিবচোন।

কিবা সহায় বা লিংকৰ প্ৰয়োজন হ'লে জনাব। ধন্যবাদ! 🎬🛍️✨`;
  }

  // English Copy (Option 1: Standard)
  let platformBlockEn = '';
  if (hasPlatformLinks) {
    const partsEn: string[] = [];
    if (hasFb) {
      const fbLines = ['📘 Facebook:'];
      if (facebookDescLink) fbLines.push(`  • Description / Caption Link: ${facebookDescLink}`);
      if (facebookPinCommentLink) fbLines.push(`  • Pin Comment: ${facebookPinCommentLink}`);
      partsEn.push(fbLines.join('\n'));
    }
    if (hasIg) {
      const igLines = ['📸 Instagram:'];
      if (instagramBioLink) igLines.push(`  • Link in bio: ${instagramBioLink}`);
      if (instagramWishlink) igLines.push(`  • Wishlink: ${instagramWishlink}`);
      partsEn.push(igLines.join('\n'));
    }
    if (hasYt) {
      const ytLines = ['▶️ YouTube:'];
      if (youtubeDescLink) ytLines.push(`  • Link for Description: ${youtubeDescLink}`);
      partsEn.push(ytLines.join('\n'));
    }
    if (buyingLink) {
      partsEn.push(`🔗 Main Buying Link: ${buyingLink}`);
    }
    platformBlockEn = `\n\n🛍️ PRODUCT BUYING LINKS FOR VIEWERS:\n${partsEn.join('\n\n')}`;
  } else if (buyingLink) {
    platformBlockEn = `\n\n🛍️ Product Buying Link: ${buyingLink}\n(Please make sure to prominently add this buying link in your video description/bio and pinned comment so viewers can easily purchase)`;
  } else {
    platformBlockEn = `\n\n1️⃣ Product Buying Link: Please make sure to prominently add the official Product Buying Link in your video description, bio, and pinned comment so viewers can easily buy the product.`;
  }

  return `Hi ${name}! This is from PRO-TO-GROW.

Please note your upcoming promotional video for "${prod}" is scheduled for upload on:
📅 Scheduled Upload Date: ${uploadDate}
⏰ Scheduled Upload Time: ${displayUploadTime}

⚠️ IMPORTANT INSTRUCTIONS FOR UPLOAD & BUYING LINKS:${platformBlockEn}

2️⃣ Video Link Submission:
As soon as the video is uploaded, please send us the live uploaded video link immediately for our verification and performance tracking.

Let us know if you need any clarification or updated purchase links. Thank you! 🎬🛍️✨`;
};

const resolveDeliverableTemplateText = (
  tmpl: WhatsAppDeliverableTemplateType,
  lang: WhatsAppLang,
  name: string,
  product: string,
  date: string,
  orderDate?: string,
  amount?: number,
  ref?: string,
  videoId?: string,
  uploadDate?: string,
  uploadTime?: string,
  buyingLink?: string,
  facebookDescLink?: string,
  facebookPinCommentLink?: string,
  instagramBioLink?: string,
  instagramWishlink?: string,
  youtubeDescLink?: string,
  courierName?: string,
  trackingId?: string,
  feedbackText?: string,
  hasImage?: boolean,
  isSundayNotice?: boolean
) => {
  const effectiveProduct = formatProductForWhatsApp(product);
  const getRawText = () => {
    switch (tmpl) {
      case 'upcoming':
        return getUpcomingVideoWhatsAppText(name, effectiveProduct, uploadDate || date, lang);
      case 'video_correction':
        return getVideoCorrectionWhatsAppText(name, effectiveProduct, feedbackText, lang, hasImage);
      case 'office_hours_feedback_notice':
        return getOfficeHoursFeedbackNoticeWhatsAppText(
          name,
          effectiveProduct,
          typeof isSundayNotice === 'boolean' ? isSundayNotice : (new Date().getDay() === 0),
          lang
        );
      case 'video_upload_reminder':
        return getVideoUploadReminderWhatsAppText(
          name,
          effectiveProduct,
          uploadDate || date,
          uploadTime || '6:00 PM',
          buyingLink,
          lang
        );
      case 'schedule_upload':
        return getUploadScheduleWhatsAppText(name, effectiveProduct, {
          uploadDate: uploadDate || date,
          uploadTime: uploadTime || '6:00 PM',
          buyingLink,
          facebookDescLink,
          facebookPinCommentLink,
          instagramBioLink,
          instagramWishlink,
          youtubeDescLink,
          pinCommentOnly: false
        }, lang as any);
      case 'schedule_upload_pin_only':
        return getUploadScheduleWhatsAppText(name, effectiveProduct, {
          uploadDate: uploadDate || date,
          uploadTime: uploadTime || '6:00 PM',
          buyingLink,
          facebookDescLink,
          facebookPinCommentLink,
          instagramBioLink,
          instagramWishlink,
          youtubeDescLink,
          pinCommentOnly: true
        }, lang as any);
      case 'advance_link_edit_review':
        return getAdvanceLinkAndEditReviewWhatsAppText(
          name,
          effectiveProduct,
          {
            uploadDate: uploadDate || date,
            uploadTime: uploadTime || '6:00 PM',
            buyingLink: buyingLink
          },
          uploadTime || '6:00 PM',
          buyingLink,
          lang
        );
      case 'edited_video_ready_check':
        return getEditedVideoReadyCheckWhatsAppText(name, effectiveProduct, uploadDate || date, lang);
      case 'video_approved_details_soon':
        return getVideoApprovedDetailsSoonWhatsAppText(name, effectiveProduct, lang);
      case 'sample_sent_tracking':
        return getSampleDispatchedTrackingWhatsAppText(name, effectiveProduct, courierName, trackingId, orderDate || date, lang);
      case 'sample_received':
        return getSampleReceivedWhatsAppText(name, effectiveProduct, orderDate, lang);
      case 'followup':
        return getFollowUpWhatsAppText(name, effectiveProduct, uploadDate || date, lang);
      case 'guidelines':
        return getGuidelinesWhatsAppText(name, effectiveProduct, uploadDate || date, lang);
      case 'payment_details':
        return getPaymentDetailsWhatsAppText(name, effectiveProduct, amount, ref, lang);
      case 'checklist_pdf':
        return getInfluencerChecklistPdfWhatsAppText(name, effectiveProduct, videoId, lang);
      case 'custom':
      default:
        return lang === 'as'
          ? `নমস্কাৰ ${name}! PRO-TO-GROW ৰ ফালৰ পৰা যোগাযোগ কৰিছোঁ। অনুগ্ৰহ কৰি এবাৰ আমাৰ সৈতে কথা পাতকচোন। ধন্যবাদ!`
          : `Hi ${name}! Reaching out from PRO-TO-GROW. Please let us know if you are available for a quick update! Thanks.`;
    }
  };
  return formatProductForWhatsApp(getRawText());
};

const StableInput = ({ value, onChange, className, placeholder, title }: { value: number, onChange: (val: number) => void, className?: string, placeholder?: string, title?: string }) => {
  const [localVal, setLocalVal] = useState<string>(value === 0 ? '' : value.toString());

  useEffect(() => {
    setLocalVal((prev) => {
      const currentParsed = parseFloat(prev) || 0;
      if (currentParsed !== value) {
        return value === 0 ? '' : value.toString();
      }
      return prev;
    });
  }, [value]);

  const handleBlur = () => {
    if (localVal.trim() === '') {
      if (value !== 0) onChange(0);
      return;
    }
    const parsed = parseFloat(localVal);
    const finalVal = isNaN(parsed) ? 0 : parsed;
    if (finalVal !== value) {
      onChange(finalVal);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalVal(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    }
  };

  return (
    <input
      type="number"
      min="0"
      value={localVal}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className={className}
      placeholder={placeholder}
      title={title}
    />
  );
};

import { MonthlyBudget } from '../types';
import RecentShipmentsFab from './RecentShipmentsFab';
const isBannedText = (text?: string): boolean => {
  if (!text) return false;
  const t = text.toLowerCase();
  return (
    t.includes("gitimoni") ||
    t.includes("kabyashree") ||
    t.includes("nitumoni") ||
    t.includes("sikha")
  );
};

interface VideoCampaignDashboardProps {
  monthlyBudgets?: MonthlyBudget[];
  tasks: Task[];
  campaigns: Campaign[];
  influencers: Influencer[];
  products: ProductConfig[];
  notebookNotes?: any[];
  setProducts: React.Dispatch<React.SetStateAction<ProductConfig[]>>;
  wizardProducts: string[];
  setWizardProducts: React.Dispatch<React.SetStateAction<string[]>>;
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
  selectedYear: string;
  setSelectedYear: (year: string) => void;
  selectedWeek?: string;
  setSelectedWeek?: (week: string) => void;
  onNavigateTab?: (tab: any) => void;
  monthlyTargets?: MonthlyProductTarget[];
  setMonthlyTargets?: React.Dispatch<React.SetStateAction<MonthlyProductTarget[]>>;
  autoSyncPlannerWithTargets?: boolean;
  setAutoSyncPlannerWithTargets?: (sync: boolean) => void;
  onlyShowPlacedProducts?: boolean;
  onToggleOnlyShowPlacedProducts?: (val: boolean) => void;
  onUpdateInfluencer?: (influencerId: string, updatedFields: Partial<Influencer>) => void;
  onUpdateTask?: (taskId: string, updatedFields: Partial<Task>) => void;
  onUpdateTasksBulk?: (bulkUpdates: {id: string, updates: Partial<Task>}[]) => void;
  onCreateTask?: (task: Omit<Task, 'id'>) => void;
  onDeleteTask?: (taskId: string) => void;
  onBulkDeleteTasks?: (taskIds: string[]) => void;
  accessToken?: string | null;
  onForceGlobalBackup?: () => void;
  salesData?: any[];
  onAutoSyncSalesData?: () => void;
}

export default function VideoCampaignDashboard({
  monthlyBudgets = [],
  tasks,
  campaigns,
  influencers,
  products,
  setProducts,
  notebookNotes = [],
  wizardProducts,
  setWizardProducts,
  selectedMonth,
  setSelectedMonth,
  selectedYear,
  setSelectedYear,
  selectedWeek = 'ALL',
  setSelectedWeek,
  onNavigateTab,
  monthlyTargets = [],
  setMonthlyTargets,
  autoSyncPlannerWithTargets = false,
  setAutoSyncPlannerWithTargets,
  onlyShowPlacedProducts = true,
  onToggleOnlyShowPlacedProducts,
  onUpdateInfluencer,
  onUpdateTask,
  onUpdateTasksBulk,
  onCreateTask,
  onDeleteTask,
  onBulkDeleteTasks,
  accessToken = null,
  onForceGlobalBackup,
  salesData = [],
  onAutoSyncSalesData,
}: VideoCampaignDashboardProps) {

   // Manual configuration for planner synchronization
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [copiedProductId, setCopiedProductId] = useState<string | null>(null);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  // Auto-sync alignment verification states
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [verificationFeedback, setVerificationFeedback] = useState<string | null>(null);
  const [showCentralUpdate, setShowCentralUpdate] = useState<boolean>(false);
  const globalWeek = selectedWeek;
  const setGlobalWeek = setSelectedWeek || (() => {});

  const getVideoDisplayId = (task: Task, index?: number) => {
    if (task.videoId !== undefined) {
      return task.videoId;
    }
    
    // Extract any numbers from the ID to use as the base
    const numbersOnly = task.id.replace(/\D/g, '');
    
    if (numbersOnly.length > 0) {
      // If it's a timestamp (like Date.now() which is 13 digits), take the last 5
      if (numbersOnly.length > 8) {
        return `VID${numbersOnly.slice(-5)}`;
      }
      return `VID${numbersOnly.padStart(3, '0')}`;
    }
    
    // If absolutely no numbers in ID, use a hash
    let hash = 0;
    for (let i = 0; i < task.id.length; i++) {
      hash = (hash << 5) - hash + task.id.charCodeAt(i);
      hash = hash & hash;
    }
    return `VID${(Math.abs(hash) % 10000).toString().padStart(4, '0')}`;
  };

  const [verificationDetails, setVerificationDetails] = useState<{
    totalProducts: number;
    syncedProductsCount: number;
    missingTargetsCount: number;
    missingProducts: string[];
    misalignedList: string[];
    isPerfect: boolean;
    checkedAt: string;
    period: string;
  } | null>(null);

  // States to track target editing inline
  const [editingTargetProd, setEditingTargetProd] = useState<string | null>(null);
  const [editingInfluencerNameId, setEditingInfluencerNameId] = useState<string | null>(null);
  const [editingInfluencerNameValue, setEditingInfluencerNameValue] = useState<string>('');
  const [tempTargetValue, setTempTargetValue] = useState<number>(5);

  const [isSavingMemory, setIsSavingMemory] = useState<boolean>(false);
  const [memorySaveSuccess, setMemorySaveSuccess] = useState<boolean>(false);

  const [editingRevenueProd, setEditingRevenueProd] = useState<string | null>(null);
  const [tempRevenueValue, setTempRevenueValue] = useState<number>(0);

  const [editingSalesProd, setEditingSalesProd] = useState<string | null>(null);
  const [tempSalesValue, setTempSalesValue] = useState<number>(0);

  // Local state for product-wise video planning interval selection (as explicitly requested: "add option to select month and year")
  const planningMonth = selectedMonth;
  const setPlanningMonth = setSelectedMonth;
  const planningYear = selectedYear;
  const setPlanningYear = setSelectedYear;
  const planningWeek = selectedWeek;
  const setPlanningWeek = setSelectedWeek;
  const [showOnlyActivePlanning, setShowOnlyActivePlanning] = useState<boolean>(true);

  // Wizard Scheduler local states
  const [showWizard, setShowWizard] = useState(false);
  const [wizardProduct, setWizardProduct] = useState('');
  const [wizardInfluencer, setWizardInfluencer] = useState(influencers[0]?.id || '');
  const [wizardInfluencerSearch, setWizardInfluencerSearch] = useState('');
  const [wizardSecondaryInfluencer, setWizardSecondaryInfluencer] = useState('');
  const [wizardAmount, setWizardAmount] = useState('');
  const [wizardDate, setWizardDate] = useState('');

  const filteredWizardInfluencers = useMemo(() => {
    const list = influencers
      .filter(i => i.status !== 'Future Creator')
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
    if (!wizardInfluencerSearch.trim()) return list;
    const q = wizardInfluencerSearch.toLowerCase();
    return list.filter(i => 
      (i.name || '').toLowerCase().includes(q) ||
      (i.niche || '').toLowerCase().includes(q) ||
      (i.handle || '').toLowerCase().includes(q) ||
      (i.mobile || '').toLowerCase().includes(q)
    );
  }, [influencers, wizardInfluencerSearch]);

  const handleWizardSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!wizardProduct || !wizardInfluencer || !onCreateTask) {
      alert("Please fill all required fields.");
      return;
    }
    
    onCreateTask({
      campaignId: `camp-${Date.now()}`,
      influencerId: wizardInfluencer === 'NEW_CREATOR' ? 'unknown' : wizardInfluencer,
      secondaryInfluencerName: wizardSecondaryInfluencer.trim(),
      title: wizardProduct,
      type: 'Video Content',
      status: 'Pending',
      remuneration: parseFloat(wizardAmount) || 0,
      deadline: wizardDate,
      platform: 'YouTube',
      views: 0,
      clicks: 0,
      videoLink1: '',
      videoLink2: '',
      videoLink3: '',
      shortIoLink: '',
      videoId: `VID10${tasks.length + 1}`
    });
    
    setWizardProduct('');
    setWizardAmount('');
    setWizardDate('');
    setShowWizard(false);
  };

  // States for influencer notes inside the planner
  const [editingNoteForInfluencerId, setEditingNoteForInfluencerId] = useState<string | null>(null);
  const [tempInfluencerNote, setTempInfluencerNote] = useState<string>('');

  const [trackerLinks, setTrackerLinks] = useState<any[]>([]);

  useEffect(() => {
    const fetchTrackerLinks = () => {
      try {
        const stored = localStorage.getItem('INFLUENCER_MANAGER_SHORT_IO_TRACKED_LINKS') || localStorage.getItem('SHORT_IO_TRACKED_LINKS');
        if (stored) {
          setTrackerLinks(JSON.parse(stored));
        } else {
          setTrackerLinks([]);
        }
      } catch(e) {}
    };
    fetchTrackerLinks();
    
    window.addEventListener('shortio-links-updated', fetchTrackerLinks);
    return () => window.removeEventListener('shortio-links-updated', fetchTrackerLinks);
  }, []);

  // States for updating task video links inside the dashboard
  const [editingVideoLinksTaskId, setEditingVideoLinksTaskId] = useState<string | null>(null);
  const [tempVideoLinks, setTempVideoLinks] = useState<{link1: string, link2: string, link3: string, shortIoLink: string, releaseDate: string, videoId: string}>({link1: '', link2: '', link3: '', shortIoLink: '', releaseDate: '', videoId: ''});

  // State for Next Month Planning
  const [planningNextMonthTaskId, setPlanningNextMonthTaskId] = useState<string | null>(null);
  const [nextMonthProduct, setNextMonthProduct] = useState<string>('');
  const [nextMonthDeadline, setNextMonthDeadline] = useState<string>('');

  // State for canceling a task
  const [cancelingTaskId, setCancelingTaskId] = useState<string | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [cancelReasonStr, setCancelReasonStr] = useState<string>('');
  
  // State for editing task details
  const [editingTaskData, setEditingTaskData] = useState<{
    id: string;
    title: string;
    influencerId: string;
    remuneration: number;
    deadline: string;
    sampleCost: number | null;
  } | null>(null);

  // States for WhatsApp Message Options on Awaiting Release & Video Deliverables
  const [whatsAppLanguage, setWhatsAppLanguage] = useState<WhatsAppLang>(() => {
    return (safeLocalStorage.getItem('wa_msg_lang') as WhatsAppLang) || 'en';
  });

  const [whatsAppModalData, setWhatsAppModalData] = useState<{
    task: any;
    influencer: any;
    influencerName: string;
    productName: string;
    releaseDate: string;
    uploadDate?: string;
    uploadTime?: string;
    buyingLink?: string;
    facebookDescLink?: string;
    facebookPinCommentLink?: string;
    instagramBioLink?: string;
    instagramWishlink?: string;
    youtubeDescLink?: string;
    activeLinkTab?: 'all' | 'facebook' | 'instagram' | 'youtube';
    selectedTemplate: WhatsAppDeliverableTemplateType;
    customText: string;
    statusLabel: string;
    sampleSent?: boolean;
    sampleOrderDate?: string;
    courierName?: string;
    trackingId?: string;
    language: WhatsAppLang;
    amount?: number;
    paymentDetails?: string;
    correctionFeedbackText?: string;
    correctionScreenshot?: string | null;
    correctionScreenshotName?: string | null;
    correctionTone?: 'polite' | 'direct' | 'urgent';
    isGeneratingCorrection?: boolean;
    isSundayNotice?: boolean;
  } | null>(null);

  const [activeWhatsAppMenuTaskId, setActiveWhatsAppMenuTaskId] = useState<string | null>(null);
  const [isSyncingChecklistPdf, setIsSyncingChecklistPdf] = useState<boolean>(false);
  const [lastChecklistDriveSyncTime, setLastChecklistDriveSyncTime] = useState<string | null>(null);

  const handleManualSyncChecklistsFromDrive = async () => {
    setIsSyncingChecklistPdf(true);
    try {
      globalToast.info('Connecting to Google Drive to fetch latest checklists...');
      const syncRes = await syncChecklistsFromGoogleDrive(accessToken);
      if (syncRes.success) {
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setLastChecklistDriveSyncTime(timeStr);
        globalToast.success(`Synchronized ${syncRes.count} checklists from Google Drive!`);
      } else {
        globalToast.info('Local Central Checklist store is ready.');
      }
    } catch (err: any) {
      console.error('[Manual Drive Sync Error]', err);
      globalToast.error(`Drive Sync notice: ${err?.message || 'Failed to sync'}`);
    } finally {
      setIsSyncingChecklistPdf(false);
    }
  };

  useEffect(() => {
    const handleCloseMenu = () => setActiveWhatsAppMenuTaskId(null);
    window.addEventListener('click', handleCloseMenu);
    return () => window.removeEventListener('click', handleCloseMenu);
  }, []);

  // Helper to update scheduled upload date & time and live recalculate WhatsApp message preview
  const handleUpdateDateAndTime = (newDate: string, newTime: string) => {
    setWhatsAppModalData(prev => {
      if (!prev) return null;
      const effectiveDate = (newDate && newDate.trim()) || prev.releaseDate || 'the scheduled date';
      const effectiveTime = (newTime && newTime.trim()) || '6:00 PM';
      const newText = resolveDeliverableTemplateText(
        prev.selectedTemplate,
        prev.language,
        prev.influencerName,
        prev.productName,
        effectiveDate,
        prev.sampleOrderDate,
        prev.amount,
        prev.paymentDetails,
        prev.task?.videoId,
        effectiveDate,
        effectiveTime,
        prev.buyingLink,
        prev.facebookDescLink,
        prev.facebookPinCommentLink,
        prev.instagramBioLink,
        prev.instagramWishlink,
        prev.youtubeDescLink,
        prev.courierName,
        prev.trackingId
      );
      return {
        ...prev,
        uploadDate: newDate,
        uploadTime: newTime,
        customText: newText
      };
    });
  };

  // Helper to update platform-specific buying links (Facebook caption/pin, Instagram bio/Wishlink, YouTube description)
  const handleUpdatePlatformLinks = (patch: Partial<{
    buyingLink: string;
    facebookDescLink: string;
    facebookPinCommentLink: string;
    instagramBioLink: string;
    instagramWishlink: string;
    youtubeDescLink: string;
    activeLinkTab: 'all' | 'facebook' | 'instagram' | 'youtube';
  }>) => {
    setWhatsAppModalData(prev => {
      if (!prev) return null;
      const merged = { ...prev, ...patch };
      const effectiveDate = merged.uploadDate || merged.releaseDate || 'the scheduled date';
      const effectiveTime = merged.uploadTime || '6:00 PM';
      const newText = resolveDeliverableTemplateText(
        merged.selectedTemplate,
        merged.language,
        merged.influencerName,
        merged.productName,
        effectiveDate,
        merged.sampleOrderDate,
        merged.amount,
        merged.paymentDetails,
        merged.task?.videoId,
        effectiveDate,
        effectiveTime,
        merged.buyingLink,
        merged.facebookDescLink,
        merged.facebookPinCommentLink,
        merged.instagramBioLink,
        merged.instagramWishlink,
        merged.youtubeDescLink,
        merged.courierName,
        merged.trackingId
      );
      return {
        ...merged,
        customText: newText
      };
    });
  };

  // Helper to update Courier Partner Name, Tracking ID, and Dispatch Date with live recalculation of message preview
  const handleUpdateCourierTracking = (newCourier: string, newTracking: string, newDate?: string) => {
    setWhatsAppModalData(prev => {
      if (!prev) return null;
      const effectiveDate = newDate !== undefined && newDate.trim() !== '' ? newDate : (prev.sampleOrderDate || prev.releaseDate || 'the scheduled date');
      const newText = resolveDeliverableTemplateText(
        prev.selectedTemplate === 'sample_received' ? 'sample_received' : 'sample_sent_tracking',
        prev.language,
        prev.influencerName,
        prev.productName,
        prev.releaseDate,
        effectiveDate,
        prev.amount,
        prev.paymentDetails,
        prev.task?.videoId,
        prev.uploadDate,
        prev.uploadTime,
        prev.buyingLink,
        prev.facebookDescLink,
        prev.facebookPinCommentLink,
        prev.instagramBioLink,
        prev.instagramWishlink,
        prev.youtubeDescLink,
        newCourier,
        newTracking
      );
      return {
        ...prev,
        courierName: newCourier,
        trackingId: newTracking,
        sampleOrderDate: effectiveDate,
        customText: newText
      };
    });
  };

  // Helper to toggle Sunday notice mode for Office Hours WhatsApp Message
  const handleToggleSundayNotice = (forceValue?: boolean) => {
    setWhatsAppModalData(prev => {
      if (!prev) return null;
      const nextSunday = typeof forceValue === 'boolean' ? forceValue : !prev.isSundayNotice;
      const effectiveDate = prev.uploadDate || prev.releaseDate || 'the scheduled date';
      const effectiveTime = prev.uploadTime || '6:00 PM';
      const newText = resolveDeliverableTemplateText(
        'office_hours_feedback_notice',
        prev.language,
        prev.influencerName,
        prev.productName,
        effectiveDate,
        prev.sampleOrderDate,
        prev.amount,
        prev.paymentDetails,
        prev.task?.videoId,
        effectiveDate,
        effectiveTime,
        prev.buyingLink,
        prev.facebookDescLink,
        prev.facebookPinCommentLink,
        prev.instagramBioLink,
        prev.instagramWishlink,
        prev.youtubeDescLink,
        prev.courierName,
        prev.trackingId,
        prev.correctionFeedbackText,
        !!prev.correctionScreenshot,
        nextSunday
      );
      return {
        ...prev,
        selectedTemplate: 'office_hours_feedback_notice',
        isSundayNotice: nextSunday,
        customText: newText
      };
    });
  };

  // Helper to handle screenshot file upload (converts to base64 for AI and preview)
  const handleScreenshotFile = (file: File) => {
    if (!file || !file.type.startsWith('image/')) {
      globalToast.error('Please select a valid image file (PNG, JPG, WebP)');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setWhatsAppModalData(prev => prev ? {
        ...prev,
        correctionScreenshot: base64,
        correctionScreenshotName: file.name
      } : null);
      globalToast.success(`Screenshot "${file.name}" attached!`);
    };
    reader.readAsDataURL(file);
  };

  // Helper to call backend /api/video-correction-message with Gemini AI
  const handleGenerateAIVideoCorrectionMessage = async (customPrompt?: string, customTone?: 'polite' | 'direct' | 'urgent') => {
    if (!whatsAppModalData) return;
    const feedback = customPrompt !== undefined ? customPrompt : (whatsAppModalData.correctionFeedbackText || DEFAULT_CORRECTION_SAMPLE_TEXT);
    const tone = customTone || whatsAppModalData.correctionTone || 'polite';
    const lang = whatsAppModalData.language || 'en';

    setWhatsAppModalData(prev => prev ? { ...prev, isGeneratingCorrection: true, correctionTone: tone } : null);
    try {
      const payload = {
        influencerName: whatsAppModalData.influencerName,
        productName: formatProductForWhatsApp(whatsAppModalData.productName),
        videoTitle: whatsAppModalData.task?.videoId ? `ID: ${whatsAppModalData.task.videoId}` : (whatsAppModalData.task?.title || ''),
        feedbackText: feedback,
        imageBase64: whatsAppModalData.correctionScreenshot || undefined,
        mimeType: whatsAppModalData.correctionScreenshot?.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png',
        language: lang,
        tone: tone
      };

      const res = await fetch('/api/video-correction-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const data = await res.json();
      if (data?.message) {
        const finalMsg = formatProductForWhatsApp(data.message);
        setWhatsAppModalData(prev => prev ? {
          ...prev,
          customText: finalMsg,
          correctionFeedbackText: feedback,
          correctionTone: tone,
          isGeneratingCorrection: false
        } : null);
        globalToast.success(lang === 'as' ? "AI ভিডিঅ' সংশোধন বাৰ্তা প্ৰস্তুত কৰা হ'ল!" : "AI Video Correction message generated!");
      } else {
        throw new Error('No message returned from server');
      }
    } catch (err: any) {
      console.warn('AI correction generation error, falling back locally:', err);
      const fallbackMsg = getVideoCorrectionWhatsAppText(
        whatsAppModalData.influencerName,
        whatsAppModalData.productName,
        feedback,
        lang,
        !!whatsAppModalData.correctionScreenshot
      );
      setWhatsAppModalData(prev => prev ? {
        ...prev,
        customText: fallbackMsg,
        correctionFeedbackText: feedback,
        correctionTone: tone,
        isGeneratingCorrection: false
      } : null);
      globalToast.info(lang === 'as' ? "টেমপ্লেটৰ আধাৰত বাৰ্তা তৈয়াৰ কৰা হ’ল" : "Generated message using smart correction template");
    }
  };

  // Global paste handler to capture pasted screenshots (Ctrl + V) when Video Correction modal is open
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (!whatsAppModalData || whatsAppModalData.selectedTemplate !== 'video_correction') return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf('image') !== -1) {
          const file = item.getAsFile();
          if (file) {
            handleScreenshotFile(file);
            break;
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [whatsAppModalData?.selectedTemplate]);

  // Helper to generate & download Influencer Checklist PDF for a video deliverable and send/open WhatsApp
  // Strictly identical to the output from Central Product Checklist Store:
  // - Always synchronize latest checklist which was uploaded to Google Drive from Central Product Checklist Store
  // - Output pdf filename: Checklist-(PRODUCT NAME).pdf
  // - Clean Influencer Checklist mode (hideMetadataAndSignature: true, showGeneratedDateTime: true)
  // - Mandatory: All checklist boxes in the output must be completely blank (checked: false)
  // - Title: Product - (PRODUCT NAME)
  const handleDownloadAndSendChecklistPdf = async (
    task: any,
    inf: any,
    influencerName: string,
    productName: string,
    lang: WhatsAppLang,
    openChatImmediately = true
  ) => {
    setIsSyncingChecklistPdf(true);
    const prodName = (productName || task?.title || task?.product || task?.productName || 'Product').trim();

    // 1. Always synchronize latest checklist uploaded to Google Drive from Central Product Checklist Store
    try {
      const syncRes = await syncChecklistsFromGoogleDrive(accessToken);
      if (syncRes.success) {
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setLastChecklistDriveSyncTime(timeStr);
        console.log(`[VideoDashboard] Successfully synchronized ${syncRes.count} checklists from Google Drive backup.`);
      }
    } catch (e: any) {
      console.warn('[VideoDashboard] Google Drive checklist auto-sync notice:', e?.message || e);
    }

    // 2. Strictly load latest product configuration from synchronized Central Product Checklist Store
    const productConfig = getProductChecklist(prodName, true);
    const rawProdName = (productConfig.productName || prodName).trim();
    const safeProdName = rawProdName.replace(/[/\\?%*:|"<>]/g, '_').trim();
    const checklistPdfFileName = `Checklist-${safeProdName}.pdf`;

    // 3. Guarantee that all checklist boxes are completely blank for the Influencer Checklist (identical to Central Store)
    const blankSections: ChecklistSection[] = (productConfig.sections || []).map(section => ({
      ...section,
      items: (section.items || []).map(item => ({
        ...item,
        checked: false
      }))
    }));

    try {
      globalToast.info(`Generating ${checklistPdfFileName} for ${rawProdName}...`);
      await generateInfluencerChecklistPDF({
        productTitle: productConfig.title || (rawProdName.toLowerCase().startsWith('product') ? rawProdName : `Product - ${rawProdName}`),
        fileName: checklistPdfFileName,
        sections: blankSections,
        hideMetadataAndSignature: true,
        showGeneratedDateTime: true,
        allCheckboxesBlank: true
      });
      globalToast.success(`Downloaded Influencer Checklist: ${checklistPdfFileName}!`);
    } catch (err: any) {
      console.error('PDF generation error:', err);
      globalToast.error(`Could not generate PDF: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsSyncingChecklistPdf(false);
    }

    if (!openChatImmediately) return;

    const vidNo = task?.videoId || task?.displayVideoId || '';
    const msgText = getInfluencerChecklistPdfWhatsAppText(influencerName, rawProdName, vidNo, lang);
    const targetMobile = cleanSingleMobileForStorage(inf?.mobile || task?.influencerMobile || getKnownMobile(influencerName || inf?.name));

    if (!targetMobile) {
      triggerUpdateWhatsAppModal({
        influencerId: inf?.id || task?.influencerId,
        influencerName: influencerName || inf?.name,
        influencerAvatar: inf?.avatar,
        influencerHandle: inf?.handle,
        currentMobile: inf?.mobile,
        messageText: msgText,
        contextTitle: `Influencer Checklist PDF (${rawProdName})`
      });
      return;
    }

    openWhatsAppChat({
      phoneNumber: targetMobile,
      text: msgText,
      preferApp: true,
      contactName: influencerName || inf?.name || 'Creator'
    });
    globalToast.success(`WhatsApp chat opened! Please attach the downloaded ${checklistPdfFileName} to your message.`);
  };



  const handleBringForwardDeadlines = () => {
    if (planningYear === 'ALL' || planningMonth === 'ALL') {
      alert('Please select a specific Month and Year to update deadlines.');
      return;
    }
    const defaultDate = `${planningYear}-${planningMonth}-01`;
    const bulkUpdates: {id: string, updates: Partial<Task>}[] = [];
    
    // We update tasks that are rendered in the planning schedule
    const itemsToRender = allProductsListForPlanning.filter(prodName => {
      const matchedTasks = filteredTasksForPlanning.filter(
        t => t.title && t.title.trim().toLowerCase() === (prodName || "").trim().toLowerCase()
      );
      if (showOnlyActivePlanning) {
        return matchedTasks.length > 0;
      }
      return true;
    });

    itemsToRender.forEach(prodName => {
      const productScheduledTasks = filteredTasksForPlanning.filter(
        t => t.title && t.title.trim().toLowerCase() === (prodName || "").trim().toLowerCase()
      );
      productScheduledTasks.forEach(task => {
        if (task.status !== 'Completed' && task.status !== 'Cancelled' && !task.readyToUpload) {
          if (task.deadline) {
            const dlYear = task.deadline.substring(0, 4);
            const dlMonth = task.deadline.substring(5, 7);
            if (dlYear !== planningYear || dlMonth !== planningMonth) {
              bulkUpdates.push({ id: task.id, updates: { deadline: defaultDate }});
            }
          } else {
             bulkUpdates.push({ id: task.id, updates: { deadline: defaultDate }});
          }
        }
      });
    });

    if (bulkUpdates.length > 0 && onUpdateTasksBulk) {
      onUpdateTasksBulk(bulkUpdates);
      alert(`Successfully brought forward ${bulkUpdates.length} deadlines to ${planningMonth}/${planningYear}.`);
    } else if (!onUpdateTasksBulk) {
      alert('Bulk update is not available.');
    } else {
      alert('No outdated deadlines found to bring forward.');
    }
  };

  // Sync planning filters with global dashboard month/year when they change
  useEffect(() => {
    setPlanningMonth(selectedMonth);
  }, [selectedMonth]);

  useEffect(() => {
    setPlanningYear(selectedYear);
  }, [selectedYear]);

  useEffect(() => {
    setPlanningWeek?.(globalWeek);
  }, [globalWeek]);

  // FILTERED OVERVIEW OPTIONS - States for Video Release Tracking & Financial Breakdown filtering and auto-sync
  const [bdSearch, setBdSearch] = useState<string>('');
  const [bdReleaseStatus, setBdReleaseStatus] = useState<string>('ALL'); // ALL, MET, UNDER
  const [bdRoasStatus, setBdRoasStatus] = useState<string>('ALL'); // ALL, HIGH, MID, NONE
  const bdWeek = selectedWeek;
  const setBdWeek = setSelectedWeek;
  const bdMonth = selectedMonth;
  const setBdMonth = setSelectedMonth;
  const bdYear = selectedYear;
  const setBdYear = setSelectedYear;
  const [bdAutoSync, setBdAutoSync] = useState<boolean>(true);
  const [showBigRoas, setShowBigRoas] = useState<boolean>(false);
  const [showWeeklySales, setShowWeeklySales] = useState<boolean>(false);
  
  const [samplePromptTaskId, setSamplePromptTaskId] = useState<string | null>(null);
  const [samplePromptCost, setSamplePromptCost] = useState<string>('');
  const [samplePromptOrderId, setSamplePromptOrderId] = useState<string>('');
  const [samplePromptOrderDate, setSamplePromptOrderDate] = useState<string>('');
  const [samplePromptCourier, setSamplePromptCourier] = useState<string>('');
  const [samplePromptTrackingId, setSamplePromptTrackingId] = useState<string>('');

  // Sync breakdown filters with global dashboard month/year when bdAutoSync is active and they change
  useEffect(() => {
    if (bdAutoSync) {
      setBdMonth(selectedMonth);
    }
  }, [selectedMonth, bdAutoSync]);

  useEffect(() => {
    if (bdAutoSync) {
      setBdYear(selectedYear);
    }
  }, [selectedYear, bdAutoSync]);

  useEffect(() => {
    if (bdAutoSync) {
      setBdWeek?.(globalWeek);
    }
  }, [globalWeek, bdAutoSync]);

  // Editable overall custom Monthly Target override state
  const [customMonthlyTarget, setCustomMonthlyTarget] = useState<string>(() => {
    return safeLocalStorage.getItem(`INFLUENCER_MANAGER_MONTHLY_TARGET_${selectedMonth}_${selectedYear}`) || '';
  });

  // Track month/year changes and reload the saved custom monthly target
  useEffect(() => {
    const val = safeLocalStorage.getItem(`INFLUENCER_MANAGER_MONTHLY_TARGET_${selectedMonth}_${selectedYear}`) || '';
    setCustomMonthlyTarget(val);
  }, [selectedMonth, selectedYear]);

  const handleUpdateMonthlyTarget = (val: string) => {
    setCustomMonthlyTarget(val);
    if (val.trim() === '') {
      safeLocalStorage.removeItem(`INFLUENCER_MANAGER_MONTHLY_TARGET_${selectedMonth}_${selectedYear}`);
    } else {
      safeLocalStorage.setItem(`INFLUENCER_MANAGER_MONTHLY_TARGET_${selectedMonth}_${selectedYear}`, val);
    }
  };

  // Quick toggle tracking / untracking of a specific product string
  const handleToggleTrackProduct = (prodName: string) => {
    const trimmed = (prodName || "").trim();
    if (!trimmed) return;
    const isTracked = products.some(p => p.name.toLowerCase() === trimmed.toLowerCase());
    if (isTracked) {
      setProducts(prev => prev.filter(p => p.name.toLowerCase() !== trimmed.toLowerCase()));
    } else {
      setProducts(prev => [
        ...prev,
        {
          name: trimmed,
          target: 5,
          salesAmount: 0
        }
      ]);
    }
  };

  // Manual synchronization trigger to fetch products and presets from Monthly Planner & Targets
  const handleManualSyncWithPlanner = () => {
    setIsSyncing(true);
    setSyncFeedback(null);

    setTimeout(() => {
      // Find all unique products from both tasks (Monthly Planner scheduler) and wizard products list
      const plannerProducts = Array.from(
        new Set(
          tasks
            .map(t => t.title?.trim())
            .filter((title): title is string => !!title && title.length > 0)
        )
      );

      let addedProductsCount = 0;
      setProducts(prev => {
        let updated = [...prev];
        plannerProducts.forEach((plannerProd: string) => {
          const exists = prev.some(p => p.name.toLowerCase() === plannerProd.toLowerCase());
          if (!exists) {
            updated.push({
              name: plannerProd,
              target: 5,
              salesAmount: 0
            });
            addedProductsCount++;
          }
        });
        return updated;
      });

      let addedOptionsCount = 0;
      setWizardProducts(prev => {
        let updated = [...prev];
        plannerProducts.forEach(p => {
          if (!prev.includes(p)) {
            updated.push(p);
            addedOptionsCount++;
          }
        });
        return updated;
      });

      const activeM = bdAutoSync ? selectedMonth : bdMonth;
      const activeY = bdAutoSync ? selectedYear : bdYear;
      const currentM = (new Date().getMonth() + 1).toString().padStart(2, '0');
      const currentY = new Date().getFullYear().toString();
      const activeMonth = activeM === 'ALL' ? currentM : activeM;
      const activeYear = activeY === 'ALL' ? currentY : activeY;

      let addedTargetsCount = 0;
      if (setMonthlyTargets) {
        setMonthlyTargets(prevTargets => {
          let newTargets = [...prevTargets];
          plannerProducts.forEach((plannerProd: string) => {
            const exists = newTargets.some(
              t => t.productName.toLowerCase() === plannerProd.toLowerCase() && t.month === activeMonth && t.year === activeYear
            );
            if (!exists) {
              newTargets.push({
                id: `target-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                productName: plannerProd,
                target: 0,
                videoTarget: 5,
                salesAmount: 0,
                month: activeMonth,
                year: activeYear
              });
              addedTargetsCount++;
            }
          });
          return newTargets;
        });
      }

      setIsSyncing(false);
      setSyncFeedback(`Auto-synchronization is fully active! Verified ${plannerProducts.length} unique products from the Monthly Planner scheduler and synced targets in real-time.`);
      
      // Auto fade feedback after 6 seconds
      setTimeout(() => {
        setSyncFeedback(null);
      }, 6000);
    }, 450);
  };

  // Delete product name
  const handleDeleteProduct = (nameToDelete: string) => {
    if (window.confirm(`Are you sure you want to stop tracking "${nameToDelete}"?`)) {
      setProducts(prev => prev.filter(p => p.name !== nameToDelete));
    }
  };

  // Helper to update or create a target entry in monthlyTargets
  const updateMonthlyTargetValue = (productName: string, field: 'target' | 'salesAmount' | 'quantitySold' | 'salesAmountWeek1' | 'salesAmountWeek2' | 'salesAmountWeek3' | 'salesAmountWeek4' | 'salesAmountWeek5' | 'videoTarget', value: number) => {
    if (!setMonthlyTargets) return;

    // Determine target month and year, respecting local breakdown filters
    const activeM = bdAutoSync ? selectedMonth : bdMonth;
    const activeY = bdAutoSync ? selectedYear : bdYear;

    const currentM = (new Date().getMonth() + 1).toString().padStart(2, '0');
    const currentY = new Date().getFullYear().toString();
    const activeMonth = activeM === 'ALL' ? currentM : activeM;
    const activeYear = activeY === 'ALL' ? currentY : activeY;

    setMonthlyTargets(prev => {
      const updatedList = [...prev];
      const existingIndex = updatedList.findIndex(
        t =>
          t.productName.toLowerCase() === productName.toLowerCase() &&
          t.month === activeMonth &&
          t.year === activeYear
      );

      if (existingIndex > -1) {
        updatedList[existingIndex] = {
          ...updatedList[existingIndex],
          [field]: value
        };
      } else {
        const newEntry: MonthlyProductTarget = {
          id: `target-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          productName: productName,
          target: 0,
          videoTarget: 5,
          salesAmount: 0,
          month: activeMonth,
          year: activeYear
        };
        // @ts-ignore
        newEntry[field] = value;
        updatedList.push(newEntry);
      }
      return updatedList;
    });
  };

  // Modify a specific product target inline
  const handleUpdateTarget = (productName: string, targetVal: number) => {
    const val = Math.max(1, targetVal);
    
    // Automatically turn off auto-sync if they're manually editing the target
    if (autoSyncPlannerWithTargets && setAutoSyncPlannerWithTargets) {
      setAutoSyncPlannerWithTargets(false);
      setSyncFeedback("Manual Video Target override detected. Disabling automatic planner synchronization to preserve your custom target.");
      setTimeout(() => {
        setSyncFeedback(null);
      }, 6000);
    }

    setProducts(prev => prev.map(p => {
      if (p.name === productName) {
        return { 
          ...p, 
          target: val,
          videoTarget: val
        };
      }
      return p;
    }));
    updateMonthlyTargetValue(productName, 'videoTarget', val);
  };

  // Modify a specific product quantity sold inline
  const handleUpdateQuantity = (productName: string, qtyVal: number) => {
    const val = Math.max(0, qtyVal);

    setProducts(prev => prev.map(p => {
      if (p.name === productName) {
        return { ...p, quantitySold: val };
      }
      return p;
    }));
    updateMonthlyTargetValue(productName, 'quantitySold', val);
  };

  // Modify a specific product sales amount inline for instantaneous ROAS update
  const handleUpdateSales = (productName: string, salesVal: number) => {
    const val = Math.max(0, salesVal);

    if (bdWeek !== 'ALL') {
      const weekNum = parseInt(bdWeek, 10);
      if (weekNum >= 1 && weekNum <= 5) {
        handleUpdateWeeklySales(productName, weekNum as 1 | 2 | 3 | 4 | 5, val);
        return;
      }
    }

    setProducts(prev => prev.map(p => {
      if (p.name === productName) {
        return { ...p, salesAmount: val };
      }
      return p;
    }));
    updateMonthlyTargetValue(productName, 'salesAmount', val);
  };

  const handleUpdateWeeklySales = (productName: string, weekIndex: 1 | 2 | 3 | 4 | 5, salesVal: number) => {
    const val = Math.max(0, salesVal);
    const weekField = `salesAmountWeek${weekIndex}` as 'salesAmountWeek1' | 'salesAmountWeek2' | 'salesAmountWeek3' | 'salesAmountWeek4' | 'salesAmountWeek5';
    
    if (!setMonthlyTargets || !monthlyTargets) return;

    const activeM = bdAutoSync ? selectedMonth : bdMonth;
    const activeY = bdAutoSync ? selectedYear : bdYear;
    const currentM = (new Date().getMonth() + 1).toString().padStart(2, '0');
    const currentY = new Date().getFullYear().toString();
    const activeMonth = activeM === 'ALL' ? currentM : activeM;
    const activeYear = activeY === 'ALL' ? currentY : activeY;

    const existingIndex = monthlyTargets.findIndex(
      t => t.productName.toLowerCase() === productName.toLowerCase() && t.month === activeMonth && t.year === activeYear
    );

    let currentTarget: MonthlyProductTarget = existingIndex > -1 ? monthlyTargets[existingIndex] : {
      id: `target-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      productName: productName,
      target: 0,
      videoTarget: 5,
      salesAmount: 0,
      month: activeMonth,
      year: activeYear
    };

    const updatedTarget = { ...currentTarget, [weekField]: val };
    
    const calcdTotal = (updatedTarget.salesAmountWeek1 || 0) + 
                       (updatedTarget.salesAmountWeek2 || 0) + 
                       (updatedTarget.salesAmountWeek3 || 0) + 
                       (updatedTarget.salesAmountWeek4 || 0) +
                       (updatedTarget.salesAmountWeek5 || 0);

    updatedTarget.salesAmount = calcdTotal;

    setMonthlyTargets(prev => {
      const updatedList = [...prev];
      const idx = updatedList.findIndex(
        t => t.productName.toLowerCase() === productName.toLowerCase() && t.month === activeMonth && t.year === activeYear
      );
      if (idx > -1) {
        updatedList[idx] = updatedTarget;
      } else {
        updatedList.push(updatedTarget);
      }
      return updatedList;
    });

    setProducts(prev => prev.map(p => {
      if (p.name === productName) {
        return { ...p, [weekField]: val, salesAmount: calcdTotal };
      }
      return p;
    }));
  };

  // Modify a specific product revenue target inline
  const handleUpdateRevenueTarget = (productName: string, targetVal: number) => {
    const val = Math.max(0, targetVal);
    setProducts(prev => prev.map(p => {
      if (p.name === productName) {
        return { ...p, revenueTarget: val };
      }
      return p;
    }));
    updateMonthlyTargetValue(productName, 'target', val);
  };

  // Check and verify alignment between Product Performance Matrix and the Monthly Target database
  const handleVerifySyncWithTargets = () => {
    setIsVerifying(true);
    setVerificationFeedback(null);
    setVerificationDetails(null);

    setTimeout(() => {
      const periodTargets = monthlyTargets.filter(t => t.month === selectedMonth && t.year === selectedYear);
      
      const missingProducts: string[] = [];
      const misalignedList: string[] = [];
      let syncedCount = 0;

      productAggregates.forEach(prod => {
        const match = periodTargets.find(t => t.productName.toLowerCase() === prod.name.toLowerCase());
        if (!match) {
          missingProducts.push(prod.name);
        } else {
          syncedCount++;
          const targetRevenueMatches = Math.round(prod.revenueTarget || 0) === Math.round(match.target || 0);
          const targetVideosMatches = Math.round(prod.target || 5) === Math.round(match.videoTarget || 5);
          if (!targetRevenueMatches || !targetVideosMatches) {
            misalignedList.push(prod.name);
          }
        }
      });

      const isPerfect = missingProducts.length === 0 && misalignedList.length === 0;

      const activeMonthName = MONTHS_MAP[selectedMonth] || selectedMonth;

      setVerificationDetails({
        totalProducts: productAggregates.length,
        syncedProductsCount: syncedCount,
        missingTargetsCount: missingProducts.length,
        missingProducts,
        misalignedList,
        isPerfect,
        checkedAt: new Date().toLocaleTimeString(),
        period: `${activeMonthName} ${selectedYear}`
      });

      if (isPerfect) {
        setVerificationFeedback(`Successfully alignment certified! All ${productAggregates.length} products in the Performance Matrix are perfectly in sync with Monthly Revenue Targets!`);
      } else {
        setVerificationFeedback(`Sync diagnostic run complete. Verified ${syncedCount} targets. Found ${missingProducts.length} product(s) missing configurations.`);
      }
      setIsVerifying(false);
    }, 600);
  };

  // Quick fix matching missing target records dynamically
  const handleAutoFixTargets = () => {
    if (!verificationDetails) return;
    const { missingProducts } = verificationDetails;
    if (!missingProducts || missingProducts.length === 0) return;

    // Propagate default monthly target entries for missing items
    setProducts(prev => prev.map(p => {
      if (missingProducts.includes(p.name)) {
        return {
          ...p,
          revenueTarget: p.revenueTarget || 0, // Def ₹0 threshold
          videoTarget: p.videoTarget || p.target || 5, // Match current or 5 videos
          target: p.target || 5
        };
      }
      return p;
    }));

    setTimeout(() => {
      handleVerifySyncWithTargets();
    }, 200);
  };

  const handleGlobalSaveTrigger = () => {
    setIsSavingMemory(true);
    setMemorySaveSuccess(false);
    
    // Attempt local callback
    if (onForceGlobalBackup) {
      onForceGlobalBackup();
    }
    
    // Simulate UI delay to show save state
    setTimeout(() => {
      setIsSavingMemory(false);
      setMemorySaveSuccess(true);
      setTimeout(() => setMemorySaveSuccess(false), 4000);
    }, 800);
  };

  // Active Month Month Name map for legible headings
  const MONTHS_MAP: { [key: string]: string } = {
    'ALL': 'All Months',
    '01': 'January', '02': 'February', '03': 'March', '04': 'April',
    '05': 'May', '06': 'June', '07': 'July', '08': 'August',
    '09': 'September', '10': 'October', '11': 'November', '12': 'December'
  };

  // Program release validation check:
  // "Release Detection Rule: If a video link is present, automatically mark that video as 'Released'"
  // We can filter our tasks for the selected Month and Year
  const filteredTasksForPeriod = useMemo(() => {
    return tasks.filter(t => isTaskInPeriod(t, selectedMonth, selectedYear, globalWeek));
  }, [tasks, selectedMonth, selectedYear, globalWeek]);

  // Filtered tasks specifically for the product-wise planning scheduler segment by its own selectedMonth & selectedYear
  const filteredTasksForPlanning = useMemo(() => {
    return tasks.filter(t => isTaskInPeriod(t, planningMonth, planningYear, planningWeek));
  }, [tasks, planningMonth, planningYear, planningWeek]);

  // Unified list of all products (either tracked, saved of wizard, or discovered dynamically from scheduler tasks)
  const allProductsListForPlanning = useMemo(() => {
    const names = new Set<string>();
    
    const placedTitlesSet = new Set<string>();
    tasks.forEach(t => {
      if (t.title && t.title.trim()) {
        placedTitlesSet.add(t.title.trim().toLowerCase());
      }
    });

    const addName = (name?: string) => {
      if (!name) return;
      const clean = name.trim();
      if (isBannedText(clean)) return;

      if (!clean) return;
      if (clean === 'CENTRAL_BUDGET') return;
      if (onlyShowPlacedProducts) {
        if (!placedTitlesSet.has(clean.toLowerCase())) return;
      }
      names.add(clean);
    };

    products.forEach(p => addName(p.name));
    wizardProducts.forEach(p => addName(p));
    tasks.forEach(t => addName(t.title));
    return Array.from(names);
  }, [products, wizardProducts, tasks, onlyShowPlacedProducts]);

  // Segmented tasks for the Video Release Tracking & Breakdown
  const filteredTasksForBreakdown = useMemo(() => {
    const activeM = bdAutoSync ? selectedMonth : bdMonth;
    const activeY = bdAutoSync ? selectedYear : bdYear;
    return tasks.filter(t => isTaskInPeriod(t, activeM, activeY, bdWeek));
  }, [tasks, selectedMonth, selectedYear, bdMonth, bdYear, bdAutoSync, bdWeek]);

  const globalTrackerClicks = useMemo(() => {
    if (!trackerLinks || trackerLinks.length === 0) return 0;
    
    const matchingLinks = trackerLinks.filter(item => {
      const normalize = (u?: string) => { if (!u) return ''; let v = u.trim().toLowerCase(); v = v.replace(/^https?:\/\//, ''); v = v.replace(/^www\./, ''); return v.replace(/\/+$/, ''); };
      const itemUrl = normalize(item.url);
      if (!itemUrl) return false;
      
      return filteredTasksForBreakdown.some(t => 
        normalize(t.shortIoLink) === itemUrl ||
        normalize(t.videoLink1) === itemUrl ||
        normalize(t.videoLink2) === itemUrl ||
        normalize(t.videoLink3) === itemUrl || (t.videoId && (itemUrl.endsWith('/' + normalize(t.videoId)) || itemUrl.endsWith('=' + normalize(t.videoId)))) || (t.videoId && normalize(t.videoId) === itemUrl)
      );
    });

    return matchingLinks.reduce((acc: number, item: any) => acc + (item.manualClicksOverride !== undefined ? item.manualClicksOverride : (item.humanClicks !== undefined ? item.humanClicks : (item.clicks || 0))), 0);
  }, [trackerLinks, filteredTasksForBreakdown]);

  // Aggregate stats per product based on active breakdown period (either global or overridden locally)
  const productAggregates = useMemo(() => {
    const activeM = bdAutoSync ? selectedMonth : bdMonth;
    const activeY = bdAutoSync ? selectedYear : bdYear;

    // Resolve unique product names available for the active breakdown month and year
    const activeProductNames = new Set<string>();

    const placedTitlesSet = new Set<string>();
    tasks.forEach(t => {
      if (t.title && t.title.trim()) {
        placedTitlesSet.add(t.title.trim().toLowerCase());
      }
    });


    const isOthersProduct = (name?: string): boolean => {
      if (!name) return false;
      const upper = name.trim().toUpperCase();
      return (
        upper === 'OTHERS 1' ||
        upper === 'OTHERS 2' ||
        upper === 'OTHERS 3' ||
        upper === 'OTHERS 4' ||
        upper === 'OTHERS 5' ||
        /^OTHERS\s*[1-5]$/i.test(upper) ||
        upper.startsWith('OTHERS')
      );
    };

    const addActiveProduct = (name?: string, forceInclude: boolean = false) => {
      if (!name) return;
      const clean = name.trim();
      if (isBannedText(clean)) return;

      if (!clean) return;
      if (!forceInclude && onlyShowPlacedProducts) {
        if (!placedTitlesSet.has(clean.toLowerCase())) return;
      }
      activeProductNames.add(clean);
    };

    products.forEach(p => {
      if (p.name && !isOthersProduct(p.name)) addActiveProduct(p.name, false);
    });

    wizardProducts.forEach(p => {
      if (p && !isOthersProduct(p)) addActiveProduct(p, false);
    });

    filteredTasksForBreakdown.forEach(t => {
      if (t.title && !isOthersProduct(t.title)) addActiveProduct(t.title, false);
    });

    // Auto-update OTHERS 1-5 directly from Sales Dashboard data ONLY when sales exist
    if (salesData && salesData.length > 0) {
      salesData.forEach(row => {
        if (row.productName && isOthersProduct(row.productName)) {
          const pName = row.productName.trim();
          const matchesYear = activeY === 'ALL' || (row.year && activeY && String(row.year).trim() === String(activeY).trim());
          
          let matchesMonth = activeM === 'ALL';
          if (activeM !== 'ALL') {
            const monthMap: Record<string, number> = {
              'january': 1, 'jan': 1, '1': 1, '01': 1,
              'february': 2, 'feb': 2, '2': 2, '02': 2,
              'march': 3, 'mar': 3, '3': 3, '03': 3,
              'april': 4, 'apr': 4, '4': 4, '04': 4,
              'may': 5, '5': 5, '05': 5,
              'june': 6, 'jun': 6, '6': 6, '06': 6,
              'july': 7, 'jul': 7, '7': 7, '07': 7,
              'august': 8, 'aug': 8, '8': 8, '08': 8,
              'september': 9, 'sep': 9, '9': 9, '09': 9,
              'october': 10, 'oct': 10, '10': 10,
              'november': 11, 'nov': 11, '11': 11,
              'december': 12, 'dec': 12, '12': 12
            };
            const mStr = String(row.month).trim().toLowerCase();
            const mInt = monthMap[mStr] || parseInt(mStr.replace(/\D/g, ''), 10);
            const activeMInt = parseInt(String(activeM).replace(/\D/g, ''), 10);
            matchesMonth = (!isNaN(mInt) && !isNaN(activeMInt) && mInt === activeMInt);
          }

          const amt = Number(row.netRevenue) || Number(row.grossSales) || 0;
          if (matchesYear && matchesMonth && amt > 0) {
            addActiveProduct(pName, true);
          }
        }
      });
    }

    if (monthlyTargets) {
      monthlyTargets.forEach(t => {
        if (t.productName && !isOthersProduct(t.productName)) {
          const matchesYear = activeY === 'ALL' || (t.year && activeY && parseInt(String(t.year), 10) === parseInt(String(activeY), 10));
          const matchesMonth = activeM === 'ALL' || (t.month && activeM && parseInt(String(t.month).replace(/\D/g, ''), 10) === parseInt(String(activeM).replace(/\D/g, ''), 10));
          if (matchesYear && matchesMonth) {
            addActiveProduct(t.productName, false);
          }
        }
      });
    }

    const uniqueNames = Array.from(activeProductNames).sort((a, b) => a.localeCompare(b));

    return uniqueNames.map(productName => {
      // Find tasks related to this product for the breakdown Month/Year
      const productTasks = filteredTasksForBreakdown.filter(t => 
        t.title && t.title.trim().toLowerCase() === (productName || "").trim().toLowerCase()
      );

      // Check video links present to automatically mark as "Released"
      // STRICT: DO NOT show or count awaiting release deliverables as completed video
      const releasedTasks = productTasks.filter(t => 
        t.status !== 'Cancelled' && !!(t.videoLink1?.trim() || t.videoLink2?.trim() || t.videoLink3?.trim())
      );

      const completedTasks = releasedTasks;

      const totalSpent = releasedTasks.reduce((sum, t) => sum + (t.remuneration || 0), 0);
      const totalSampleCost = completedTasks.reduce((sum, t) => sum + (t.sampleCost || 0), 0);
      const totalMediaRight = productTasks.reduce((sum, t) => sum + (t.mediaRightAmount || 0), 0);
      const achievementCount = releasedTasks.length;

      const tasksForViews = productTasks.filter(t => t.status !== 'Cancelled' && (!!(t.videoLink1?.trim() || t.videoLink2?.trim() || t.videoLink3?.trim()) || (t.views || 0) > 0));
      const totalViews = tasksForViews.reduce((sum, t) => sum + (t.views || 0), 0);
      const totalClicks = tasksForViews.reduce((sum, t) => sum + (t.clicks || 0), 0);
      const totalCpv = totalViews > 0 ? totalSpent / totalViews : 0;
      const totalCpc = totalClicks > 0 ? totalSpent / totalClicks : 0;
      const totalCtr = totalViews > 0 ? (totalClicks / totalViews) * 100 : 0;
      // FETCH TARGET AND SALES
      const existingProd = products.find(p => p.name.trim().toLowerCase() === productName.trim().toLowerCase());
      let resolvedRevenueTarget = existingProd?.revenueTarget || 0;
      let resolvedVideoTarget = existingProd?.target || 5;
      let resolvedSalesAmount = 0;
      let resolvedSalesAmountWeek1 = 0;
      let resolvedSalesAmountWeek2 = 0;
      let resolvedSalesAmountWeek3 = 0;
      let resolvedSalesAmountWeek4 = 0;
      let resolvedSalesAmountWeek5 = 0;
      let resolvedQuantitySold = 0;

      // 1. Fetch Revenue Target from MonthlyTargets based on Filtered Overview Options
      if (monthlyTargets && monthlyTargets.length > 0) {
        if (activeM === 'ALL') {
          // Sum up target metrics for selected year across all months
          const matches = monthlyTargets.filter(t => 
             (t.productName || "").trim().toLowerCase() === (productName || "").trim().toLowerCase() &&
            (activeY === 'ALL' || (t.year && activeY && parseInt(t.year, 10) === parseInt(activeY, 10)))
          );
          if (matches.length > 0) {
            resolvedRevenueTarget = matches.reduce((sum, m) => sum + (m.target || 0), 0);
            resolvedVideoTarget = matches.reduce((sum, m) => sum + (m.videoTarget || 0), 0);
          } else {
            resolvedRevenueTarget = 0;
            resolvedVideoTarget = 5;
          }
        } else {
          // Normal lookup for specific month and year
          const match = monthlyTargets.find(t => 
             (t.productName || "").trim().toLowerCase() === (productName || "").trim().toLowerCase() &&
            (t.month && activeM && parseInt(String(t.month).replace(/\D/g, ''), 10) === parseInt(String(activeM).replace(/\D/g, ''), 10)) &&
            (activeY === 'ALL' || (t.year && activeY && parseInt(t.year, 10) === parseInt(activeY, 10)))
          );
          if (match) {
            resolvedRevenueTarget = match.target !== undefined ? match.target : 0;
            resolvedVideoTarget = match.videoTarget !== undefined ? match.videoTarget : 5;
          } else {
            resolvedRevenueTarget = 0;
            resolvedVideoTarget = 5;
          }
        }
      }

      // 2. Fetch Quantity sold and estimated sales from E-Commerce Sales Dashboard (salesData)
      if (salesData && salesData.length > 0) {
        const prodMatch = (productName || "").trim().toLowerCase();
        const monthMap: Record<string, number> = {
          'january': 1, 'jan': 1, '1': 1, '01': 1,
          'february': 2, 'feb': 2, '2': 2, '02': 2,
          'march': 3, 'mar': 3, '3': 3, '03': 3,
          'april': 4, 'apr': 4, '4': 4, '04': 4,
          'may': 5, '5': 5, '05': 5,
          'june': 6, 'jun': 6, '6': 6, '06': 6,
          'july': 7, 'jul': 7, '7': 7, '07': 7,
          'august': 8, 'aug': 8, '8': 8, '08': 8,
          'september': 9, 'sep': 9, '9': 9, '09': 9,
          'october': 10, 'oct': 10, '10': 10,
          'november': 11, 'nov': 11, '11': 11,
          'december': 12, 'dec': 12, '12': 12
        };

        salesData.forEach(row => {
          if (!row.productName || row.productName.trim().toLowerCase() !== prodMatch) return;
          
          if (activeY !== 'ALL') {
            if (String(row.year).trim() !== String(activeY).trim()) return;
          }
          if (activeM !== 'ALL') {
            const mStr = String(row.month).trim().toLowerCase();
            const mInt = monthMap[mStr] || parseInt(mStr.replace(/\D/g, ''), 10);
            const activeMInt = parseInt(String(activeM).replace(/\D/g, ''), 10);
            if (!mInt || !activeMInt || mInt !== activeMInt) return;
          }

          const amountToSync = Number(row.netRevenue) || Number(row.grossSales) || 0;
          const qtySold = Number(row.quantity) || 0;
          resolvedQuantitySold += qtySold;
          
          let weekNum = 0;
          const match = String(row.week).match(/\d+/);
          if (match) weekNum = parseInt(match[0], 10);
          
          if (weekNum === 1) resolvedSalesAmountWeek1 += amountToSync;
          else if (weekNum === 2) resolvedSalesAmountWeek2 += amountToSync;
          else if (weekNum === 3) resolvedSalesAmountWeek3 += amountToSync;
          else if (weekNum === 4) resolvedSalesAmountWeek4 += amountToSync;
          else if (weekNum === 5) resolvedSalesAmountWeek5 += amountToSync;
        });
        resolvedSalesAmount = resolvedSalesAmountWeek1 + resolvedSalesAmountWeek2 + resolvedSalesAmountWeek3 + resolvedSalesAmountWeek4 + resolvedSalesAmountWeek5;
      }

      // Fallback to monthlyTargets if salesData was empty or already aggregated into targets (ONLY for non-OTHERS products)
      if (!isOthersProduct(productName) && resolvedSalesAmount === 0 && monthlyTargets && monthlyTargets.length > 0) {
        const prodMatch = (productName || "").trim().toLowerCase();
        const activeMInt = parseInt(String(activeM).replace(/\D/g, ''), 10);
        const matches = monthlyTargets.filter(t => {
          if ((t.productName || "").trim().toLowerCase() !== prodMatch) return false;
          if (activeY !== 'ALL' && t.year && String(t.year).trim() !== String(activeY).trim()) return false;
          if (activeM !== 'ALL') {
            const tMInt = parseInt(String(t.month).replace(/\D/g, ''), 10);
            if (tMInt !== activeMInt) return false;
          }
          return true;
        });
        if (matches.length > 0) {
          resolvedSalesAmount = matches.reduce((sum, m) => sum + (m.salesAmount || 0), 0);
          resolvedSalesAmountWeek1 = matches.reduce((sum, m) => sum + (m.salesAmountWeek1 || 0), 0);
          resolvedSalesAmountWeek2 = matches.reduce((sum, m) => sum + (m.salesAmountWeek2 || 0), 0);
          resolvedSalesAmountWeek3 = matches.reduce((sum, m) => sum + (m.salesAmountWeek3 || 0), 0);
          resolvedSalesAmountWeek4 = matches.reduce((sum, m) => sum + (m.salesAmountWeek4 || 0), 0);
          resolvedSalesAmountWeek5 = matches.reduce((sum, m) => sum + (m.salesAmountWeek5 || 0), 0);
          if (resolvedQuantitySold === 0) {
            resolvedQuantitySold = matches.reduce((sum, m) => sum + (m.quantitySold || 0), 0);
          }
        }
      }

      if (bdWeek !== 'ALL') {
        const weekNum = parseInt(bdWeek, 10);
        if (weekNum === 1) resolvedSalesAmount = resolvedSalesAmountWeek1;
        if (weekNum === 2) resolvedSalesAmount = resolvedSalesAmountWeek2;
        if (weekNum === 3) resolvedSalesAmount = resolvedSalesAmountWeek3;
        if (weekNum === 4) resolvedSalesAmount = resolvedSalesAmountWeek4;
        if (weekNum === 5) resolvedSalesAmount = resolvedSalesAmountWeek5;
      }

      // Calculate ROAS: Sales Amount / (Spent + Sample Cost + Media Right)
      const totalCostForROAS = totalSpent + totalSampleCost + totalMediaRight;
      const roas = (!isOthersProduct(productName) && totalCostForROAS > 0) ? resolvedSalesAmount / totalCostForROAS : 0;

      return {
        name: productName,
        target: resolvedVideoTarget,
        salesAmount: resolvedSalesAmount,
        salesAmountWeek1: resolvedSalesAmountWeek1,
        salesAmountWeek2: resolvedSalesAmountWeek2,
        salesAmountWeek3: resolvedSalesAmountWeek3,
        salesAmountWeek4: resolvedSalesAmountWeek4,
        salesAmountWeek5: resolvedSalesAmountWeek5,
        quantitySold: resolvedQuantitySold,
        revenueTarget: resolvedRevenueTarget,
        videoTarget: resolvedVideoTarget,
        totalTasks: productTasks.length,
        achievementCount,
        totalSpent,
        totalSampleCost,
        totalMediaRight,
        totalViews,
        totalClicks,
        totalCpv,
        totalCpc,
        totalCtr,
        roas,
        tasksMatching: productTasks,
        releasedTasksMatching: releasedTasks
      };
    });
  }, [products, filteredTasksForBreakdown, monthlyTargets, salesData, selectedMonth, selectedYear, bdAutoSync, bdMonth, bdYear, bdWeek, wizardProducts, onlyShowPlacedProducts, tasks]);

  // Grand totals across all products for selected Month & Year
  const grandTotals = useMemo(() => {
    const totalReleased = productAggregates.reduce((sum, p) => sum + p.achievementCount, 0);
    const totalSpent = productAggregates.reduce((sum, p) => sum + p.totalSpent, 0);
    const totalSampleCost = productAggregates.reduce((sum, p) => sum + p.totalSampleCost, 0);
    const totalMediaRight = productAggregates.reduce((sum, p) => sum + (p.totalMediaRight || 0), 0);
    const calculatedTarget = productAggregates.reduce((sum, p) => sum + p.totalTasks, 0);
    const totalTarget = calculatedTarget;
    const totalSales = productAggregates.reduce((sum, p) => sum + p.salesAmount, 0);
    const totalSalesForROAS = productAggregates.filter(p => !isOthersProduct(p.name)).reduce((sum, p) => sum + p.salesAmount, 0);
    const totalRevenueTarget = productAggregates.reduce((sum, p) => sum + (p.revenueTarget || 0), 0);
    const totalGrandCostForROAS = totalSpent + totalSampleCost + totalMediaRight;
    const overallROAS = totalGrandCostForROAS > 0 ? totalSalesForROAS / totalGrandCostForROAS : 0;

    const totalViews = productAggregates.reduce((sum, p) => sum + (p.totalViews || 0), 0);
    const totalClicks = productAggregates.reduce((sum, p) => sum + (p.totalClicks || 0), 0);
    const totalCpv = totalViews > 0 ? totalSpent / totalViews : 0;
    const totalCpc = totalClicks > 0 ? totalSpent / totalClicks : 0;
    const totalCtr = totalViews > 0 ? (totalClicks / totalViews) * 100 : 0;

    let topViews = 0;
    let topViewsInfluencer: string | null = null;
    let topClicks = 0;
    let topClicksInfluencer: string | null = null;

    productAggregates.forEach(p => {
      p.tasksMatching.forEach(t => {
        const v = typeof t.views === 'number' ? t.views : parseInt(t.views as any, 10) || 0;
        const c = typeof t.clicks === 'number' ? t.clicks : parseInt(t.clicks as any, 10) || 0;
        if (v > topViews) {
          topViews = v;
          const influencer = influencers.find(inf => inf.id === t.influencerId);
          topViewsInfluencer = influencer ? influencer.name : 'Unknown';
        }
        if (c > topClicks) {
          topClicks = c;
          const influencer = influencers.find(inf => inf.id === t.influencerId);
          topClicksInfluencer = influencer ? influencer.name : 'Unknown';
        }
      });
    });

    return {
      totalReleased,
      totalSpent,
      totalSampleCost,
      totalMediaRight,
      totalViews,
      totalClicks,
      topViews,
      topClicks,
      topViewsInfluencer,
      topClicksInfluencer,
      totalCpv,
      totalCpc,
      totalCtr,
      totalTarget,
      totalSales,
      totalRevenueTarget,
      overallROAS
    };
  }, [productAggregates, influencers]);

  // FILTERED OVERVIEW OPTIONS - Filters calculation for display inside the Breakdown card table
  const filteredProductAggregates = useMemo(() => {
    return productAggregates.filter(prod => {
      // 1. Search Query
      if (bdSearch.trim() !== "") {
        if (!prod.name.toLowerCase().includes(bdSearch.toLowerCase())) {
          return false;
        }
      }
      
      // 2. Release Status Milestone
      if (bdReleaseStatus === "MET") {
        if (prod.achievementCount < prod.target) return false;
      } else if (bdReleaseStatus === "UNDER") {
        if (prod.achievementCount >= prod.target) return false;
      }
      
      // 3. ROAS Performance Status Selector
      if (bdRoasStatus === "HIGH") {
        if (prod.roas < 2.0) return false;
      } else if (bdRoasStatus === "MID") {
        if (prod.roas <= 0 || prod.roas >= 2.0) return false;
      } else if (bdRoasStatus === "NONE") {
        if (prod.roas > 0) return false;
      }
      
      return true;
    });
  }, [productAggregates, bdSearch, bdReleaseStatus, bdRoasStatus]);

  // Breakdown Totals across the active filtered list
  const breakdownTotals = useMemo(() => {
    const totalReleased = filteredProductAggregates.reduce((sum, p) => sum + p.achievementCount, 0);
    const totalSpent = filteredProductAggregates.reduce((sum, p) => sum + p.totalSpent, 0);
    const totalSampleCost = filteredProductAggregates.reduce((sum, p) => sum + p.totalSampleCost, 0);
    const totalMediaRight = filteredProductAggregates.reduce((sum, p) => sum + (p.totalMediaRight || 0), 0);
    const calculatedTarget = filteredProductAggregates.reduce((sum, p) => sum + p.totalTasks, 0);
    const totalSales = filteredProductAggregates.reduce((sum, p) => sum + p.salesAmount, 0);
    const totalSalesWeek1 = filteredProductAggregates.reduce((sum, p) => sum + (p.salesAmountWeek1 || 0), 0);
    const totalSalesWeek2 = filteredProductAggregates.reduce((sum, p) => sum + (p.salesAmountWeek2 || 0), 0);
    const totalSalesWeek3 = filteredProductAggregates.reduce((sum, p) => sum + (p.salesAmountWeek3 || 0), 0);
    const totalSalesWeek4 = filteredProductAggregates.reduce((sum, p) => sum + (p.salesAmountWeek4 || 0), 0);
    const totalSalesWeek5 = filteredProductAggregates.reduce((sum, p) => sum + (p.salesAmountWeek5 || 0), 0);
    const totalQuantitySold = filteredProductAggregates.reduce((sum, p) => sum + (p.quantitySold || 0), 0);
    const totalRevenueTarget = filteredProductAggregates.reduce((sum, p) => sum + (p.revenueTarget || 0), 0);
    const totalSalesForROAS = filteredProductAggregates.filter(p => !isOthersProduct(p.name)).reduce((sum, p) => sum + p.salesAmount, 0);
    const totalCostForROAS = totalSpent + totalSampleCost + totalMediaRight;
    const overallROAS = totalCostForROAS > 0 ? totalSalesForROAS / totalCostForROAS : 0;

    const totalViews = filteredProductAggregates.reduce((sum, p) => sum + (p.totalViews || 0), 0);
    const totalClicks = filteredProductAggregates.reduce((sum, p) => sum + (p.totalClicks || 0), 0);
    const totalCpv = totalViews > 0 ? totalSpent / totalViews : 0;
    const totalCpc = totalClicks > 0 ? totalSpent / totalClicks : 0;
    const totalCtr = totalViews > 0 ? (totalClicks / totalViews) * 100 : 0;

    return {
      totalReleased,
      totalSpent,
      totalSampleCost,
      totalMediaRight,
      totalViews,
      totalClicks,
      totalCpv,
      totalCpc,
      totalCtr,
      totalTarget: calculatedTarget,
      totalSales,
      totalSalesWeek1,
      totalSalesWeek2,
      totalSalesWeek3,
      totalSalesWeek4,
      totalSalesWeek5,
      totalQuantitySold,
      totalRevenueTarget,
      overallROAS
    };
  }, [filteredProductAggregates]);

  // Performance Analytics: Top & Underperforming Influencers for the selected Month/Year
  // High-performing = those with tasks in this month having video links and high average views/clicks, or high ROI ranking
  const influencerPerformance = useMemo(() => {
    // Collect all unique influencers who have tasks in this month
    const activeInfluencerIds = Array.from(new Set(filteredTasksForPeriod.map(t => t.influencerId)));
    
    const statsList = activeInfluencerIds.map(infId => {
      const influencer = influencers.find(i => i.id === infId);
      const infTasks = filteredTasksForPeriod.filter(t => t.influencerId === infId);
      
      const releasedTasks = infTasks.filter(t => !!(t.videoLink1?.trim() || t.videoLink2?.trim() || t.videoLink3?.trim()));
      const completedInfTasks = infTasks.filter(t => { const hasLink = !!(t.videoLink1 || t.videoLink2 || t.videoLink3); return t.status !== 'Cancelled' && (t.status === 'Completed' || hasLink) && hasLink; });
      const totalViews = completedInfTasks.reduce((sum, t) => sum + (t.views || 0), 0);
      const totalClicks = completedInfTasks.reduce((sum, t) => sum + (t.clicks || 0), 0);
      const totalConversions = completedInfTasks.reduce((sum, t) => sum + (t.conversions || 0), 0);
      const totalSpent = infTasks.reduce((sum, t) => sum + (t.remuneration || 0), 0);

      // Score for ranking: released videos count heavily, view count, and average views-to-spent efficiency
      // Unreleased tasks drag down score
      const score = (releasedTasks.length * 1000) + (totalViews * 0.05) + (totalClicks * 0.5) - (infTasks.length - releasedTasks.length) * 200;

      return {
        influencer,
        tasks: infTasks,
        releasedTasks,
        totalViews,
        totalClicks,
        totalConversions,
        totalSpent,
        score,
        hasReleasedVideo: releasedTasks.length > 0
      };
    });

    // Sort by performance score
    const sortedStats = statsList.sort((a, b) => b.score - a.score);

    // Top performers: released at least one video, sorted high score
    const topPerformers = sortedStats.filter(s => s.influencer && s.releasedTasks.length > 0).slice(0, 3);
    
    // Low performers: either active but no videos released, or low views/clicks relative to spent
    const lowPerformers = sortedStats.filter(s => s.influencer && (s.releasedTasks.length === 0 || s.totalViews < 1500)).slice(-3).reverse();

    return {
      topPerformers,
      lowPerformers,
      allInfluencerStats: sortedStats
    };
  }, [filteredTasksForPeriod, influencers]);

  const generateExportRows = (): string[][] => {
    const rows: string[][] = [];

    const scopeTitle = `${selectedMonth === 'ALL' ? 'All Months' : MONTHS_MAP[selectedMonth] || selectedMonth} ${selectedYear === 'ALL' ? 'All Years' : selectedYear}`;
    
    // 1. GLOBAL DASHBOARD STATISTICS
    rows.push(['--- GLOBAL DASHBOARD STATISTICS ---', scopeTitle]);
    rows.push(['Videos Auto-Released', grandTotals.totalReleased.toString()]);
    rows.push(['Media Funds Spent', grandTotals.totalSpent.toString()]);
    rows.push(['Total Sample Cost', grandTotals.totalSampleCost.toString()]);
    rows.push(['Media Right Spend', grandTotals.totalMediaRight.toString()]);
    rows.push(['Tracked Sales Turnover', grandTotals.totalSales.toString()]);
    rows.push(['Overall Portfolio ROAS', grandTotals.overallROAS > 0 ? `${grandTotals.overallROAS.toFixed(2)}x` : 'N/A']);
    rows.push([]);

    // 2. PRODUCT PERFORMANCE MATRIX
    rows.push(['--- PRODUCT PERFORMANCE MATRIX ---']);
    rows.push([
      'Product Name', 
      'Videos Released',
      'Target Videos', 
      'Total Cost', 
      'Media Rights',
      'Quantity Sold',
      'Sales Amount',
      'Revenue Target',
      'ROAS (x)'
    ]);
    productAggregates.forEach(p => {
      rows.push([
        `"${p.name.replace(/"/g, '""')}"`,
        p.achievementCount.toString(),
        p.target.toString(),
        (p.totalSpent + p.totalSampleCost).toString(),
        (p.totalMediaRight || 0).toString(),
        (p.quantitySold || 0).toString(),
        p.salesAmount.toString(),
        (p.revenueTarget || 0).toString(),
        p.roas.toFixed(2).toString()
      ]);
    });
    rows.push([]);

    // 3. VIDEO RELEASE TRACKING & FINANCIAL BREAKDOWN
    rows.push(['--- VIDEO RELEASE TRACKING & FINANCIAL BREAKDOWN ---']);
    const breakdownHeaders = [
      'Product / Project Reference',
      'Video Target',
      'Videos Released',
      'Spent on Product (₹)',
      'Sample Cost (₹)',
      'Media Right (₹)',
      'Quantity Sold',
      'Revenue Target (₹)',
      'Estimated Sales (₹)'
    ];
    if (showWeeklySales) {
      breakdownHeaders.push('W1 Sales (₹)', 'W2 Sales (₹)', 'W3 Sales (₹)', 'W4 Sales (₹)', 'W5 Sales (₹)');
    }
    breakdownHeaders.push('Resulting ROAS');
    rows.push(breakdownHeaders);

    filteredProductAggregates.forEach(p => {
      const breakdownRow = [
        `"${p.name.replace(/"/g, '""')}"`,
        p.target.toString(),
        p.achievementCount.toString(),
        p.totalSpent.toString(),
        p.totalSampleCost.toString(),
        (p.totalMediaRight || 0).toString(),
        (p.quantitySold || 0).toString(),
        (p.revenueTarget || 0).toString(),
        p.salesAmount.toString()
      ];
      if (showWeeklySales) {
        breakdownRow.push(
          (p.salesAmountWeek1 || 0).toString(),
          (p.salesAmountWeek2 || 0).toString(),
          (p.salesAmountWeek3 || 0).toString(),
          (p.salesAmountWeek4 || 0).toString(),
          (p.salesAmountWeek5 || 0).toString()
        );
      }
      breakdownRow.push(p.roas.toFixed(2).toString());
      rows.push(breakdownRow);
    });
    rows.push([]);

    // 4. Product-wise Video Planning & Delivery Schedule
    rows.push(['--- PRODUCT-WISE VIDEO PLANNING & DELIVERY SCHEDULE ---']);
    rows.push([
      'Product Name',
      'Sl No',
      'Ready / Awaiting Status',
      'Task Title',
      'Overview Status',
      'Influencer Name',
      'Remuneration (₹)',
      'Sample Cost (₹)',
      'Media Rights (₹)',
      'Video Link 1',
      'Video Link 2',
      'Video Link 3'
    ]);
    
    // Filter the items just like we do in UI
    const itemsToRender = allProductsListForPlanning.filter(prodName => {
      const matchedTasks = filteredTasksForPlanning.filter(
        t => t.title && t.title.trim().toLowerCase() === (prodName || "").trim().toLowerCase()
      );
      if (showOnlyActivePlanning) {
        return matchedTasks.length > 0;
      }
      return true;
    });

    let exportReadyCount = 0;
    let exportAwaitingCount = 0;

    itemsToRender.forEach(prodName => {
      const productScheduledTasks = filteredTasksForPlanning.filter(
        t => t.title && t.title.trim().toLowerCase() === (prodName || "").trim().toLowerCase()
      );
      
      if (productScheduledTasks.length === 0) {
        rows.push([`"${prodName.replace(/"/g, '""')}"`, '', '', 'No tasks scheduled', '', '', '', '', '', '', '', '']);
      } else {
        productScheduledTasks.forEach(t => {
          const isReleased = !!(t.videoLink1?.trim() || t.videoLink2?.trim() || t.videoLink3?.trim());
          const infName = influencers.find(inf => inf.id === t.influencerId)?.name || 'Unknown Influencer';
          
          let displaySlNo = '';
          let readyStatusDisplay = '';

          if (!isReleased && t.status !== 'Cancelled') {
            if (t.readyToUpload) {
               exportReadyCount++;
               displaySlNo = exportReadyCount.toString();
               readyStatusDisplay = 'READY TO UPLOAD';
            } else {
               exportAwaitingCount++;
               displaySlNo = exportAwaitingCount.toString();
               readyStatusDisplay = 'AWAITING RELEASE';
            }
          }

          rows.push([
            `"${prodName.replace(/"/g, '""')}"`,
            displaySlNo,
            readyStatusDisplay,
            `"${(t.title || '').replace(/"/g, '""')}"`,
            isReleased ? 'Released' : 'Pending',
            `"${infName.replace(/"/g, '""')}"`,
            (t.remuneration || 0).toString(),
            (t.sampleCost || 0).toString(),
            (t.mediaRightAmount || 0).toString(),
            `"${(t.videoLink1 || '').replace(/"/g, '""')}"`,
            `"${(t.videoLink2 || '').replace(/"/g, '""')}"`,
            `"${(t.videoLink3 || '').replace(/"/g, '""')}"`
          ]);
        });
      }
    });
    rows.push([]);

    // 5. LIVE INFLUENCER RANKINGS
    rows.push(['--- LIVE INFLUENCER RANKINGS ---']);
    rows.push([
      'Influencer Name',
      'Niche',
      'Performance Score',
      'Videos Released',
      'Pending Uploads',
      'Total Views',
      'Total Clicks',
      'CTR (%)',
      'Total Spent',
      'Av. CPV',
      'Av. CPC'
    ]);
    influencerPerformance.allInfluencerStats.forEach(s => {
      if (!s.influencer) return;
      const ctr = s.totalViews > 0 ? ((s.totalClicks / s.totalViews) * 100).toFixed(2) : '0';
      const cpv = s.totalViews > 0 ? (s.totalSpent / s.totalViews).toFixed(3) : '0';
      const cpc = s.totalClicks > 0 ? (s.totalSpent / s.totalClicks).toFixed(2) : '0';
      rows.push([
        `"${s.influencer.name.replace(/"/g, '""')}"`,
        `"${s.influencer.niche ? s.influencer.niche.replace(/"/g, '""') : 'N/A'}"`,
        s.score.toFixed(0),
        s.releasedTasks.length.toString(),
        (s.tasks.length - s.releasedTasks.length).toString(),
        s.totalViews.toString(),
        s.totalClicks.toString(),
        ctr.toString(),
        s.totalSpent.toString(),
        cpv.toString(),
        cpc.toString()
      ]);
    });

    return rows;
  };

  const handleDownloadExcel = () => {
    const rows = generateExportRows();
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + rows.map(r => r.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Video_Dashboard_Export_${new Date().toLocaleString('en-GB').replace(/[\/:]/g, '-').replace(', ', '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!onCreateTask) {
      alert("Function to add tasks is not available.");
      return;
    }

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const data = results.data as any[];
        let addedCount = 0;
        const newCreatorsMap = new Map<string, string>();
        
        data.forEach(row => {
          let infId = influencers[0]?.id || 'inf-1';
          const rawCreatorName = row.creator || row.Creator || row.influencer || row.Influencer || '';
          
          if (rawCreatorName) {
            const foundCreator = influencers.find(inf => 
              inf.name.toLowerCase() === rawCreatorName.toLowerCase() || 
              inf.handle.toLowerCase() === rawCreatorName.toLowerCase()
            );
            if (foundCreator) {
              infId = foundCreator.id;
            } else if (newCreatorsMap.has(rawCreatorName.toLowerCase())) {
              infId = newCreatorsMap.get(rawCreatorName.toLowerCase())!;
            }
            // For dashboard we don't have onAddInfluencer easily, so we just use what's found or default
          }

          const productTitle = row.product || row.Product || row.title || row.Title || 'Unassigned Product';
          const amountVal = parseFloat(row.remuneration || row.Remuneration || row.amount || row.Amount || '0') || 0;
          const viewsVal = parseInt(row.views || row.Views || '0', 10) || 0;
          const clicksVal = parseInt(row.clicks || row.Clicks || '0', 10) || 0;

          const normalizeDate = (d: string | undefined): string => {
            if (!d) return '';
            const trimmed = d.trim();
            if (!trimmed) return '';
            if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
            
            const parts = trimmed.split(/[\/\-]/);
            if (parts.length === 3) {
              if (parts[2].length === 4) {
                const p1 = parseInt(parts[0], 10);
                const p2 = parseInt(parts[1], 10);
                const p3 = parts[2];
                if (p2 > 12) {
                   return `${p3}-${p1.toString().padStart(2,'0')}-${p2.toString().padStart(2,'0')}`;
                } else if (p1 > 12) {
                   return `${p3}-${p2.toString().padStart(2,'0')}-${p1.toString().padStart(2,'0')}`;
                } else {
                   return `${p3}-${p2.toString().padStart(2,'0')}-${p1.toString().padStart(2,'0')}`;
                }
              }
              if (parts[0].length === 4) {
                return `${parts[0]}-${parts[1].padStart(2,'0')}-${parts[2].padStart(2,'0')}`;
              }
            }
            return trimmed;
          };

          const importedDate = normalizeDate(row.date || row.Date || row.deadline || row.Deadline);
          
          const typeVal = row.type || row.Type || 'Video Content';
          
          const newTask: Omit<Task, 'id'> = {
            campaignId: campaigns[0]?.id || 'camp-1',
            influencerId: infId,
            title: productTitle,
            type: typeVal as any,
            status: row.status || row.Status || 'Pending',
            remuneration: amountVal,
            sampleCost: parseFloat(row.sampleCost || row.SampleCost || row['Sample Cost'] || '0') || null,
            mediaRightAmount: parseFloat(row.mediaRight || row.MediaRight || row['Media Right'] || '0') || 0,
            orderId: row.orderId || row.OrderId || row['Order ID'] || undefined,
            orderDate: normalizeDate(row.orderDate || row.OrderDate || row['Order Date']),
            deadline: importedDate,
            platform: row.platform || row.Platform || 'YouTube',
            views: viewsVal,
            clicks: clicksVal,
            videoLink1: row.url1 || row.videoLink1 || row.video1 || '',
            videoLink2: row.url2 || row.videoLink2 || row.video2 || '',
            videoLink3: row.url3 || row.videoLink3 || row.video3 || '',
            shortIoLink: row.shortioLink || row.shortio || '',
            videoId: (row.videoId ?? row.VideoId ?? row.videoID ?? row['Video ID'] ?? row['Video Id']) ?? `VID10${tasks.length + addedCount + 1}`
          };
          
          onCreateTask(newTask);
          addedCount++;
        });

        if (fileInputRef.current) fileInputRef.current.value = '';
        alert(`Successfully imported ${addedCount} video plans from CSV!`);
      },
      error: (error: any) => {
        console.error("Error parsing CSV:", error);
        alert("Failed to parse CSV file.");
      }
    });
  };

  const handleDeleteAllAwaitingUpload = () => {
    if (!onDeleteTask) return;
    const awaitingTasks = filteredTasksForPlanning.filter(t => {
      const isReleased = !!(t.videoLink1?.trim() || t.videoLink2?.trim() || t.videoLink3?.trim());
      return !isReleased && t.status !== 'Cancelled' && !t.readyToUpload;
    });

    if (awaitingTasks.length === 0) {
      alert('No Awaiting Release deliverables found to delete.');
      return;
    }

    if (window.confirm(`Are you sure you want to delete all ${awaitingTasks.length} AWAITING RELEASE deliverables? This action cannot be undone.`)) {
      if (onBulkDeleteTasks) {
        onBulkDeleteTasks(awaitingTasks.map(t => t.id));
      } else {
        awaitingTasks.forEach(t => {
          onDeleteTask(t.id);
        });
      }
    }
  };

  const handleExportCSV = () => {
    if (filteredTasksForPlanning.length === 0) {
      alert("No video plans to export.");
      return;
    }
    const csv = Papa.unparse(filteredTasksForPlanning.map(t => {
      const creator = influencers.find(i => i.id === t.influencerId);
      return {
        date: t.deadline || '',
        creator: creator?.name || 'Unknown Creator',
        product: t.title,
        platform: t.platform,
        type: t.type,
        amount: t.remuneration || 0,
        'Sample Cost': t.sampleCost || 0,
        'Media Right': t.mediaRightAmount || 0,
        'Order ID': t.orderId || '',
        'Order Date': t.orderDate || '',
        'Video ID': t.videoId || '',
        views: t.views || 0,
        clicks: t.clicks || 0,
        url1: t.videoLink1 || '',
        url2: t.videoLink2 || '',
        url3: t.videoLink3 || '',
        shortioLink: t.shortIoLink || ''
      };
    }));
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `Video_Dashboard_Tasks_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const [exportState, setExportState] = useState<{ status: 'idle' | 'loading' | 'success' | 'error', sheetUrl?: string, error?: string }>({ status: 'idle' });

  const handleGoogleSheet = async () => {
    try {
      if (!accessToken) {
        alert("Please sign in with Google first using the 'Cloud Backup & Restore' button at the top right to enable Google Sheet extraction!");
        return;
      }

      setExportState({ status: 'loading' });

      const rows = generateExportRows();
      const scopeTitle = `${selectedMonth === 'ALL' ? 'All Months' : MONTHS_MAP[selectedMonth] || selectedMonth}_${selectedYear === 'ALL' ? 'All_Years' : selectedYear}`;

      // Create spreadsheet
      const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          properties: {
            title: `Video Dashboard Export - ${scopeTitle}`
          }
        })
      });
      
      if (!createRes.ok) {
         throw new Error(`Failed to create spreadsheet: ${createRes.statusText}`);
      }
      
      const sheetData = await createRes.json();
      const sheetId = sheetData.spreadsheetId;
      const sheetTitle = sheetData.sheets && sheetData.sheets[0] ? sheetData.sheets[0].properties.title : 'Sheet1';

      // Insert data using batchUpdate or value update. 
      // Put values to Sheet1
      const updateRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(sheetTitle)}!A1?valueInputOption=USER_ENTERED`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values: rows
        })
      });

      if (!updateRes.ok) {
        throw new Error(`Failed to update spreadsheet: ${updateRes.statusText}`);
      }

      setExportState({ 
        status: 'success', 
        sheetUrl: `https://docs.google.com/spreadsheets/d/${sheetId}/edit` 
      });

    } catch (error) {
      console.error("Export to Sheets failed:", error);
      setExportState({ 
        status: 'error', 
        error: (error as Error).message || "An unknown error occurred." 
      });
    }
  };

  const [isCentralRefreshing, setIsCentralRefreshing] = useState(false);

  useEffect(() => {
    const handleGlobalCentralRefresh = () => {
      setIsCentralRefreshing(true);
      setTimeout(() => setIsCentralRefreshing(false), 3500); // UI feedback duration
    };
    window.addEventListener('TRIGGER_CENTRAL_REFRESH', handleGlobalCentralRefresh);
    return () => window.removeEventListener('TRIGGER_CENTRAL_REFRESH', handleGlobalCentralRefresh);
  }, []);

  const handleCentralRefresh = () => {
    setIsCentralRefreshing(true);
    window.dispatchEvent(new CustomEvent('TRIGGER_CENTRAL_REFRESH'));
    setTimeout(() => setIsCentralRefreshing(false), 3500); // UI feedback duration
  };

  const [showCompletedVideosModal, setShowCompletedVideosModal] = useState(false);
  const runningMonthCompletedTasks = useMemo(() => {
    return filteredTasksForPeriod.filter(t => t.status !== 'Cancelled' && !!(t.videoLink1 || t.videoLink2 || t.videoLink3)).sort((a, b) => {
      const dateA = new Date(a.releaseDate || a.deadline || 0).getTime();
      const dateB = new Date(b.releaseDate || b.deadline || 0).getTime();
      return dateA - dateB;
    });
  }, [filteredTasksForPeriod]);

  return (
    <div className="space-y-8" id="video-campaign-dashboard-workspace">
      <RecentShipmentsFab notebookNotes={notebookNotes} selectedMonth={selectedMonth} selectedYear={selectedYear} onCreateTaskForShipment={(influencerName, product, orderDate, cost, orderId, platform) => {
        if (!onCreateTask) return;
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + 2);
        const formattedDeadline = targetDate.toISOString().split("T")[0];
        
        onCreateTask({
          type: "Video",
          title: product,
          influencerId: influencers.find(i => i.name.toLowerCase().trim() === influencerName.toLowerCase().trim())?.id || influencerName.trim(),
          secondaryInfluencerName: influencerName.trim(),
          deadline: formattedDeadline,
          status: "Pending",
          remuneration: 0,
          videoId: `VID-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
          campaignId: campaigns[0]?.id || "camp-1",
          sampleCost: cost !== undefined ? Number(cost) : undefined,
          orderId: orderId,
          orderDate: orderDate,
          orderPlatform: platform
        });
      }} />
      {/* Header Panel with bold styling */}
      <div className="bg-gradient-to-r from-fuchsia-600 to-indigo-600 rounded-2xl border border-indigo-500 p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-md relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 pointer-events-none" />
        <div className="space-y-3 relative z-10">
          <div className="flex items-center gap-3">
            <span className="p-2.5 bg-white/20 backdrop-blur-sm text-white rounded-xl shadow-sm border border-white/30">
              <TrendingUp className="w-6 h-6 stroke-[2.5]" />
            </span>
            <span className="text-[11px] font-mono tracking-widest font-black uppercase text-fuchsia-100 bg-black/20 backdrop-blur-sm px-3 py-1 rounded-md border border-white/20 shadow-sm flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-fuchsia-300" />
              Live Campaign Analytics
            </span>
          </div>
          <h2 className="text-3xl font-black font-sans text-white tracking-tight leading-none md:text-4xl">
            Video Campaign & Influencer Dashboard
          </h2>
          <p className="text-sm text-indigo-100 leading-relaxed max-w-2xl font-medium">
            Track video target accomplishment, cross-check links instantly against Scheduled items under the Monthly Planner, calculate automated return metrics, and export high-fidelity PPT presentations.
          </p>
        </div>

        {/* Filter and Actions Column */}
        <div className="flex flex-col gap-3 shrink-0 relative z-10">
          {/* Global Month/Year Filter Selection */}
          <div className="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/20 flex flex-wrap items-center justify-end gap-3.5 select-none shadow-sm">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-fuchsia-200" />
              <span className="text-xs font-bold text-indigo-100 uppercase tracking-wider font-mono">Global Interval Scope:</span>
            </div>
            
            <div className="flex items-center gap-1.5 font-mono">
              {/* Month selector */}
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-white/90 border border-indigo-200 text-xs font-bold font-mono px-3 py-1.5 rounded-lg text-indigo-950 focus:outline-none focus:ring-2 focus:ring-fuchsia-400 cursor-pointer shadow-sm hover:bg-white transition"
                title="Select Scope Month"
                id="dash-month-selector"
              >
                <option value="ALL">All Months</option>
                <option value="01">01 - Jan</option>
                <option value="02">02 - Feb</option>
                <option value="03">03 - Mar</option>
                <option value="04">04 - Apr</option>
                <option value="05">05 - May</option>
                <option value="06">06 - Jun</option>
                <option value="07">07 - Jul</option>
                <option value="08">08 - Aug</option>
                <option value="09">09 - Sep</option>
                <option value="10">10 - Oct</option>
                <option value="11">11 - Nov</option>
                <option value="12">12 - Dec</option>
              </select>

              {/* Year selector */}
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="bg-white/90 border border-indigo-200 text-xs font-bold font-mono px-3 py-1.5 rounded-lg text-indigo-950 focus:outline-none focus:ring-2 focus:ring-fuchsia-400 cursor-pointer shadow-sm hover:bg-white transition"
                title="Select Scope Year"
                id="dash-year-selector"
              >
                <option value="ALL">All Years</option>
                <option value="2025">2025</option>
                <option value="2026">2026</option>
                <option value="2027">2027</option>
                <option value="2028">2028</option>
                <option value="2029">2029</option>
              </select>

              {/* Week selector */}
              <select
                value={globalWeek}
                onChange={(e) => setGlobalWeek(e.target.value)}
                className="bg-white/90 border border-indigo-200 text-xs font-bold font-mono px-3 py-1.5 rounded-lg text-indigo-950 focus:outline-none focus:ring-2 focus:ring-fuchsia-400 cursor-pointer shadow-sm hover:bg-white transition"
                title="Select Scope Week"
                id="dash-week-selector"
              >
                <option value="ALL">All Weeks</option>
                <option value="1">Week 1</option>
                <option value="2">Week 2</option>
                <option value="3">Week 3</option>
                <option value="4">Week 4</option>
                <option value="5">Week 5</option>
                <option value="1-2">1st & 2nd week (Days 1–14)</option>
                <option value="1-3">1st, 2nd, 3rd week (Days 1–21)</option>
                <option value="1-4">1st, 2nd, 3rd, 4th week (Days 1–28)</option>
              </select>
            </div>
          </div>

          {/* Export Action Buttons */}
          <div className="flex items-center justify-end gap-3 select-none flex-wrap">
            <button
              onClick={handleDeleteAllAwaitingUpload}
              className="flex items-center gap-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold px-4 py-2 rounded-lg cursor-pointer transition-colors shadow-sm border border-red-400/50 active:scale-95 whitespace-nowrap"
              title="Delete all deliverables marked as Awaiting Release"
            >
              <Trash2 className="w-4 h-4" />
              DELETE ALL AWAITING
            </button>

            <input 
              type="file" 
              accept=".csv" 
              ref={fileInputRef} 
              onChange={handleImportCSV} 
              className="hidden" 
              id="dash-csv-upload" 
            />
            <label 
              htmlFor="dash-csv-upload"
              className="flex items-center gap-1.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold px-4 py-2 rounded-lg cursor-pointer transition-colors shadow-sm border border-sky-400/50 active:scale-95 whitespace-nowrap"
              title="Import Video Tasks from CSV"
            >
              <FileSpreadsheet className="w-4 h-4" />
              IMPORT CSV
            </label>

            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-xs font-bold px-4 py-2 rounded-lg cursor-pointer transition-colors shadow-sm border border-fuchsia-400/50 active:scale-95 whitespace-nowrap"
              title="Export Raw Video Tasks to CSV"
            >
              <Download className="w-4 h-4" />
              EXPORT CSV
            </button>

            <button
              onClick={handleDownloadExcel}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2 rounded-lg cursor-pointer transition-colors shadow-sm border border-emerald-400/50 active:scale-95 whitespace-nowrap"
              title="Download Dashboard Overview Data to Excel (CSV)"
            >
              <Download className="w-4 h-4" />
              DOWNLOAD EXCEL
            </button>
            
            <button
              onClick={handleGoogleSheet}
              disabled={exportState.status === 'loading'}
              className={`flex items-center gap-1.5 ${exportState.status === 'loading' ? 'bg-blue-600/50 cursor-wait' : 'bg-blue-600 hover:bg-blue-500 active:scale-95'} text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors shadow-sm border border-blue-400/50 whitespace-nowrap`}
              title="Extract to Google Sheets"
            >
              {exportState.status === 'loading' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  EXTRACTING...
                </>
              ) : (
                <>
                  <ExternalLink className="w-4 h-4" />
                  EXTRACT TO GOOGLE SHEET
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Google Sheets extraction alert message */}
      {(exportState.status === 'success' || exportState.status === 'error') && (
        <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 ${
          exportState.status === 'success' 
            ? 'bg-emerald-50 border-emerald-250 text-emerald-800 shadow-sm' 
            : 'bg-red-50 border-red-200 text-red-800 shadow-sm'
        }`}>
          <div className="flex items-center gap-3">
            <span className="text-xl">{exportState.status === 'success' ? '✅' : '❌'}</span>
            <div>
              <p className="text-sm font-bold leading-normal">
                {exportState.status === 'success' 
                  ? 'Successfully extracted to Google Sheets!' 
                  : `Extraction error: ${exportState.error}`}
              </p>
              {exportState.status === 'success' && (
                <p className="text-xs text-emerald-700 font-medium mt-0.5">Your dashboard data has been saved as a spreadsheet in your Google Drive.</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto mt-2 sm:mt-0">
            {exportState.status === 'success' && exportState.sheetUrl && (
              <a
                href={exportState.sheetUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center flex-1 sm:flex-none gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase px-4 py-2.5 rounded-lg shadow-sm transition active:scale-95 whitespace-nowrap"
              >
                <span>OPEN SPREADSHEET</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
            <button
              onClick={() => setExportState({ status: 'idle' })}
              className="text-[11px] font-black uppercase text-gray-500 hover:text-gray-700 px-3 py-2.5 rounded bg-white border border-gray-200 hover:bg-gray-50 transition sm:w-auto w-full"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Massive Grand Totals Layout */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 w-full gap-6 mb-6">
        
        <div className="bg-gradient-to-br from-blue-600 to-blue-800 text-white rounded-2xl p-6 shadow-sm select-none hover:shadow-md transition">
          <span className="text-[10px] font-mono tracking-widest font-bold text-blue-200 uppercase block">
            Overall Revenue Target (₹)
          </span>
          <div className="mt-4 flex items-baseline gap-1">
            <span className="text-blue-300 font-bold text-2xl font-mono">₹</span>
            <span className="text-4xl font-black font-sans text-white leading-none tracking-tight">
              {grandTotals.totalRevenueTarget.toLocaleString()}
            </span>
          </div>
          <div className="mt-2 text-xs text-blue-200/70 font-medium">
            Accumulated monthly target goals
          </div>
        </div>

        <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 text-white rounded-2xl p-6 shadow-sm select-none hover:shadow-md transition">
          <span className="text-[10px] font-mono tracking-widest font-bold text-emerald-100 uppercase block">
            Tracked Sales Achieved (₹)
          </span>
          <div className="mt-4 flex items-baseline gap-1">
            <span className="text-emerald-200 font-bold text-2xl font-mono">₹</span>
            <span className="text-4xl font-black font-sans text-white leading-none tracking-tight">
              {grandTotals.totalSales.toLocaleString()}
            </span>
          </div>
          <div className="mt-2 text-xs text-emerald-100/70 font-medium">
            Sum of custom product manual sales entries.
          </div>
        </div>

        <div className="bg-gradient-to-br from-amber-500 to-amber-700 text-white rounded-2xl p-6 shadow-sm select-none hover:shadow-md transition">
          <span className="text-[10px] font-mono tracking-widest font-bold text-amber-100 uppercase block">
            Remaining Target Balance (₹)
          </span>
          <div className="mt-4 flex items-baseline gap-1">
            <span className="text-amber-200 font-bold text-2xl font-mono">₹</span>
            <span className="text-4xl font-black font-sans text-white leading-none tracking-tight">
              {Math.max(0, grandTotals.totalRevenueTarget - grandTotals.totalSales).toLocaleString()}
            </span>
          </div>
          <div className="mt-2.5 pb-1">
            <span className="bg-amber-900/50 text-amber-50 shadow-sm text-[10px] font-black font-mono tracking-wider uppercase px-2.5 py-1 rounded-md border border-amber-400">
              {grandTotals.totalRevenueTarget > 0 ? ((grandTotals.totalSales / grandTotals.totalRevenueTarget) * 100).toFixed(1) : 0}% ACHIEVED
            </span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 text-white rounded-2xl p-6 shadow-sm select-none hover:shadow-md transition">
          <span className="text-[10px] font-mono tracking-widest font-bold text-indigo-100 uppercase block">
            Overall Portfolio ROAS
          </span>
          <div className="mt-4 flex items-baseline gap-1">
            <span className="text-4xl font-black font-sans text-white leading-none tracking-tight">
              {grandTotals.overallROAS > 0 ? `${grandTotals.overallROAS.toFixed(2)}x` : 'N/A'}
            </span>
          </div>
          <div className="mt-2.5 pb-1">
            {grandTotals.overallROAS >= 3.0 ? (
              <span className="bg-emerald-400 text-emerald-950 shadow-sm text-[10px] font-black font-mono tracking-wider uppercase px-2.5 py-1 rounded-md border border-emerald-300">
                🚀 HIGH CONVERSION PERFORMANCE
              </span>
            ) : grandTotals.overallROAS > 0 ? (
              <span className="bg-amber-400 text-amber-950 shadow-sm text-[10px] font-bold font-mono tracking-wider uppercase px-2.5 py-1 rounded-md border border-amber-500">
                ⚠️ MODERATE MARGIN
              </span>
            ) : (
              <span className="bg-indigo-900/50 text-indigo-200 text-[10px] font-bold font-mono tracking-wider uppercase px-2 py-0.5 rounded border border-indigo-500">
                No active metrics
              </span>
            )}
          </div>
        </div>

      </div>

      {/* Modal for Central Update of Views and Clicks */}
      {showCentralUpdate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm shadow-2xl">
          <div className="bg-white rounded-2xl w-full max-w-4xl shadow-xl flex flex-col border border-gray-200" style={{ maxHeight: '90vh' }}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-gray-50 rounded-t-2xl">
              <div>
                <h3 className="text-xl font-black font-sans text-gray-900 tracking-tight flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-indigo-500" />
                  CENTRAL UPDATE
                </h3>
                <p className="text-xs text-gray-500 font-medium">Quickly update views and clicks for generated video campaigns.</p>
              </div>
              <button onClick={() => setShowCentralUpdate(false)} className="p-2 bg-gray-200 hover:bg-gray-300 rounded-full text-gray-700 transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {tasks.filter(t => t.status !== 'Cancelled' && (t.videoLink1?.trim() || t.videoLink2?.trim() || t.videoLink3?.trim())).length === 0 ? (
                <div className="text-center py-10 text-gray-400 font-medium italic">No released videos found to update.</div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 text-xs text-gray-500 uppercase tracking-widest bg-gray-50 font-black">
                      <th className="p-3 font-mono">Video Link</th>
                      <th className="p-3 font-mono">Product</th>
                      <th className="p-3 font-mono">Total Views</th>
                      <th className="p-3 font-mono">Total Clicks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.filter(t => t.status !== 'Cancelled' && (t.videoLink1?.trim() || t.videoLink2?.trim() || t.videoLink3?.trim())).map(task => {
                      const mainLink = task.videoLink1 || task.videoLink2 || task.videoLink3;
                      return (
                        <tr key={task.id} className="border-b border-gray-100 hover:bg-indigo-50/30 transition">
                          <td className="p-3">
                            <a href={mainLink} target="_blank" rel="noreferrer" className="text-indigo-600 hover:text-indigo-800 text-xs font-bold font-mono underline truncate inline-block max-w-[200px]">
                              {mainLink || 'Unlinked Video'}
                            </a>
                          </td>
                          <td className="p-3 text-xs font-bold text-gray-700">{task.title}</td>
                          <td className="p-3">
                            <input 
                              type="number" 
                              value={task.views || 0} 
                              onChange={(e) => {
                                 if (!onUpdateTask) return;
                                 const views = parseInt(e.target.value) || 0;
                                 const clicks = task.clicks || 0;
                                 const remuneration = task.remuneration || 0;
                                 const ctr = views > 0 ? parseFloat(((clicks / views) * 100).toFixed(2)) : 0;
                                 const cpv = views > 0 ? parseFloat((remuneration / views).toFixed(3)) : 0;
                                 onUpdateTask(task.id, { views, ctr, cpv });
                              }}
                              className="w-24 px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono font-bold"
                            />
                          </td>
                          <td className="p-3">
                            <input 
                              type="number" 
                              value={task.clicks || 0} 
                              onChange={(e) => {
                                 if (!onUpdateTask) return;
                                 const clicks = parseInt(e.target.value) || 0;
                                 const views = task.views || 0;
                                 const remuneration = task.remuneration || 0;
                                 const ctr = views > 0 ? parseFloat(((clicks / views) * 100).toFixed(2)) : 0;
                                 const cpc = clicks > 0 ? parseFloat((remuneration / clicks).toFixed(2)) : 0;
                                 onUpdateTask(task.id, { clicks, ctr, cpc });
                              }}
                              className="w-24 px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono font-bold"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            
            <div className="p-5 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex justify-end">
              <button 
                onClick={() => setShowCentralUpdate(false)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-black px-6 py-2 rounded-lg transition active:scale-95 shadow-sm"
              >
                Close & Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product Wise Video Dashboard Breakdown */}
      <div className="mb-8 mt-2">
        <div className="flex items-center justify-between mb-4">
           <h3 className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-2 px-1">
             <Video className="w-5 h-5 text-indigo-500" />
             Product Wise Breakdown
           </h3>
           <button 
             onClick={handleCentralRefresh}
             disabled={isCentralRefreshing}
             className={`bg-emerald-600 hover:bg-emerald-700 text-white shadow-md font-black uppercase text-[11px] px-4 py-2 rounded-lg flex items-center gap-2 transition tracking-widest ${isCentralRefreshing ? 'opacity-75 cursor-wait' : 'active:scale-95'}`}
             title="One click update of views and clicks without visiting their pages."
           >
             {isCentralRefreshing ? (
               <Loader2 className="w-3.5 h-3.5 animate-spin" />
             ) : (
               <Sparkles className="w-3.5 h-3.5" />
             )}
             CENTRAL REFRESH
           </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {productAggregates.map((p, idx) => {
            const colors = [
              "from-blue-500 to-blue-700",
              "from-emerald-500 to-emerald-700",
              "from-amber-500 to-amber-700",
              "from-indigo-500 to-indigo-700",
              "from-pink-500 to-pink-700",
              "from-cyan-500 to-cyan-700",
              "from-orange-500 to-orange-700",
              "from-teal-500 to-teal-700",
            ];
            const colorClass = colors[idx % colors.length];

            return (
              <div key={`p-db-${p.name}`} className={`bg-gradient-to-br ${colorClass} text-white rounded-2xl p-5 shadow-sm hover:shadow-md transition relative overflow-hidden group`}>
                <div className="absolute top-0 right-0 p-3 opacity-20 group-hover:scale-110 transition-transform">
                  <Camera className="w-12 h-12" />
                </div>
                <h4 className="text-[14px] font-black font-sans tracking-tight mb-4 relative z-10 w-4/5 leading-tight">{p.name}</h4>
                <div className="grid grid-cols-2 gap-4 relative z-10">
                  <div>
                    <span className="text-[9px] font-mono tracking-widest font-bold text-white/70 uppercase">Videos</span>
                    <div className="mt-1 flex items-baseline gap-1">
                      <span className="text-3xl font-black font-sans leading-none">{p.achievementCount}</span>
                      <span className="text-xs text-white/80 font-medium">/{p.target}</span>
                    </div>
                  </div>
                  <div>
                    <span className="text-[9px] font-mono tracking-widest font-bold text-white/70 uppercase">Spent</span>
                    <span className="mt-1 text-2xl font-black font-sans block truncate leading-none" title={`₹${p.totalSpent.toLocaleString()}`}>₹{p.totalSpent.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>



      {/* Monthly Financial Budget Metrics */}
      {(() => {
        const activeM = bdAutoSync ? selectedMonth : bdMonth;
        const activeY = bdAutoSync ? selectedYear : bdYear;
        
        let currentMonthlyBudget = 0;
        if (activeM === 'ALL' && activeY === 'ALL') {
          currentMonthlyBudget = monthlyBudgets.reduce((sum, b) => sum + (b.budget || 0), 0);
        } else if (activeM === 'ALL') {
          currentMonthlyBudget = monthlyBudgets.filter(b => b.year === activeY).reduce((sum, b) => sum + (b.budget || 0), 0);
        } else if (activeY === 'ALL') {
          currentMonthlyBudget = monthlyBudgets.filter(b => b.month === activeM).reduce((sum, b) => sum + (b.budget || 0), 0);
        } else {
          currentMonthlyBudget = monthlyBudgets.find(b => b.month === activeM && b.year === activeY)?.budget || 0;
        }

        const deductedAmount = grandTotals.totalSpent;
        const remainingBalance = currentMonthlyBudget - deductedAmount;

        return (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 text-white rounded-2xl p-5 shadow-md flex flex-col justify-between">
              <span className="text-xs font-mono tracking-widest font-bold text-indigo-200 uppercase">Total Monthly Budget</span>
              <span className="mt-3 text-3xl font-black font-sans">₹{currentMonthlyBudget.toLocaleString()}</span>
            </div>
            <div className="bg-gradient-to-br from-rose-500 to-rose-700 text-white rounded-2xl p-5 shadow-md flex flex-col justify-between">
              <span className="text-xs font-mono tracking-widest font-bold text-rose-200 uppercase">Deducted Amount</span>
              <span className="mt-3 text-3xl font-black font-sans">₹{deductedAmount.toLocaleString()}</span>
            </div>
            <div className={`bg-gradient-to-br ${remainingBalance < 0 ? 'from-red-500 to-red-700' : 'from-emerald-500 to-emerald-700'} text-white rounded-2xl p-5 shadow-md flex flex-col justify-between`}>
              <span className="text-xs font-mono tracking-widest font-bold text-white/80 uppercase">Remaining Balance</span>
              <span className="mt-3 text-3xl font-black font-sans">₹{remainingBalance.toLocaleString()}</span>
            </div>
          </div>
        );
      })()}

      {/* Video Dashboard Summary Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-6 gap-4 mb-6">
        <div className="bg-gradient-to-br from-blue-500 to-blue-700 text-white rounded-2xl p-4 shadow-sm flex flex-col justify-between hover:shadow-md transition">
          <span className="text-[10px] font-mono tracking-widest font-bold text-blue-100 uppercase">Total Planned</span>
          <span className="mt-3 text-2xl font-black font-sans text-white">{productAggregates.reduce((sum, p) => sum + p.totalTasks, 0)}</span>
        </div>
        <div className="bg-gradient-to-br from-sky-400 to-sky-600 text-white rounded-2xl p-4 shadow-sm flex flex-col justify-between hover:shadow-md transition">
          <span className="text-[10px] font-mono tracking-widest font-bold text-sky-100 uppercase">Actual Posted</span>
          <span className="mt-3 text-2xl font-black font-sans">{grandTotals.totalReleased}</span>
        </div>
        <div className="bg-gradient-to-br from-emerald-400 to-emerald-600 text-white rounded-2xl p-4 shadow-sm flex flex-col justify-between hover:shadow-md transition">
          <span className="text-[10px] font-mono tracking-widest font-bold text-emerald-100 uppercase">Budget Allocated</span>
          <span className="mt-3 text-2xl font-black font-sans">₹{grandTotals.totalSpent.toLocaleString()}</span>
        </div>
        <div className="bg-gradient-to-br from-amber-400 to-amber-600 text-white rounded-2xl p-4 shadow-sm flex flex-col justify-between hover:shadow-md transition">
          <span className="text-[10px] font-mono tracking-widest font-bold text-amber-100 uppercase">Sample Cost</span>
          <span className="mt-3 text-2xl font-black font-sans">₹{grandTotals.totalSampleCost.toLocaleString()}</span>
        </div>
        <div className="bg-gradient-to-br from-orange-400 to-orange-600 text-white rounded-2xl p-4 shadow-sm flex flex-col justify-between hover:shadow-md transition">
          <span className="text-[10px] font-mono tracking-widest font-bold text-orange-100 uppercase">Media Rights</span>
          <span className="mt-3 text-2xl font-black font-sans">₹{grandTotals.totalMediaRight.toLocaleString()}</span>
        </div>
        <div className="bg-gradient-to-br from-purple-500 to-purple-700 text-white rounded-2xl p-4 shadow-sm flex flex-col justify-between hover:shadow-md transition">
          <span className="text-[10px] font-mono tracking-widest font-bold text-purple-200 uppercase">Total Views</span>
          <span className="mt-3 text-2xl font-black font-sans">{grandTotals.totalViews.toLocaleString()}</span>
        </div>
        
        <div className="bg-gradient-to-br from-pink-500 to-pink-700 text-white rounded-2xl p-4 shadow-sm flex flex-col justify-between hover:shadow-md transition relative group">
          <span className="text-[10px] font-mono tracking-widest font-bold text-pink-200 uppercase">Top Views</span>
          <div>
            <span className="mt-3 text-2xl font-black font-sans">{grandTotals.topViews.toLocaleString()}</span>
            {grandTotals.topViewsInfluencer && (
              <span className="block text-[10px] font-medium text-pink-100 max-w-[120px] truncate" title={grandTotals.topViewsInfluencer}>
                by {grandTotals.topViewsInfluencer}
              </span>
            )}
          </div>
        </div>
        <div className="bg-gradient-to-br from-teal-400 to-teal-600 text-white rounded-2xl p-4 shadow-sm flex flex-col justify-between hover:shadow-md transition">
          <span className="text-[10px] font-mono tracking-widest font-bold text-teal-100 uppercase">Total Clicks</span>
          <span className="mt-3 text-2xl font-black font-sans">{globalTrackerClicks > 0 ? globalTrackerClicks.toLocaleString() : grandTotals.totalClicks.toLocaleString()}</span>
        </div>
        <div className="bg-gradient-to-br from-cyan-400 to-cyan-600 text-white rounded-2xl p-4 shadow-sm flex flex-col justify-between hover:shadow-md transition relative group">
          <span className="text-[10px] font-mono tracking-widest font-bold text-cyan-100 uppercase">Top Clicks</span>
          <div>
            <span className="mt-3 text-2xl font-black font-sans">{grandTotals.topClicks.toLocaleString()}</span>
            {grandTotals.topClicksInfluencer && (
              <span className="block text-[10px] font-medium text-cyan-100 max-w-[120px] truncate" title={grandTotals.topClicksInfluencer}>
                by {grandTotals.topClicksInfluencer}
              </span>
            )}
          </div>
        </div>
        <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 text-white rounded-2xl p-4 shadow-sm flex flex-col justify-between hover:shadow-md transition">
          <span className="text-[10px] font-mono tracking-widest font-bold text-indigo-200 uppercase">Avg CTR</span>
          <span className="mt-3 text-2xl font-black font-sans">{grandTotals.totalCtr.toFixed(2)}%</span>
        </div>
        <div className="bg-gradient-to-br from-rose-500 to-rose-700 text-white rounded-2xl p-4 shadow-sm flex flex-col justify-between hover:shadow-md transition">
          <span className="text-[10px] font-mono tracking-widest font-bold text-rose-200 uppercase">Avg CPC</span>
          <span className="mt-3 text-2xl font-black font-sans">₹{grandTotals.totalCpc.toFixed(2)}</span>
        </div>
        <div className="bg-gradient-to-br from-fuchsia-500 to-fuchsia-700 text-white rounded-2xl p-4 shadow-sm flex flex-col justify-between hover:shadow-md transition">
          <span className="text-[10px] font-mono tracking-widest font-bold text-fuchsia-200 uppercase">Avg CPV</span>
          <span className="mt-3 text-2xl font-black font-sans">₹{grandTotals.totalCpv.toFixed(2)}</span>
        </div>
      </div>

      {/* Target vs Achievement Metrics & Product Management */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left 2 Columns: Products Metrics Matrix */}
        <div className="lg:col-span-2 bg-gradient-to-r from-fuchsia-600 to-indigo-600 rounded-2xl border border-indigo-500 p-6 md:p-8 space-y-6 shadow-md relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 pointer-events-none" />
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-indigo-400/30 pb-5 relative z-10">
            <div>
              <h3 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                <span>Product Performance Matrix</span>
                <span className="inline-flex items-center gap-1 text-[10px] bg-white/20 text-white border border-white/30 rounded-full px-2.5 py-0.5 font-bold font-mono shadow-sm">
                  <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  Synced
                </span>
              </h3>
              <p className="text-xs text-indigo-100 font-medium">
                Review Target accomplishments, Total Spends and input Sales figures to calculate ROAS instantly.
              </p>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleGlobalSaveTrigger}
                disabled={isSavingMemory}
                className={`inline-flex items-center gap-1.5 px-4 py-2 text-[10px] font-black uppercase tracking-wider rounded-xl transition cursor-pointer select-none active:scale-95 shadow-sm border ${memorySaveSuccess ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40 hover:bg-emerald-500/30' : 'bg-indigo-600/30 text-indigo-100 hover:bg-indigo-600/50 border-indigo-500/30'}`}
                title="Save product sales and values directly to Global Memory"
              >
                {isSavingMemory ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-300" />
                ) : memorySaveSuccess ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Save className="w-3.5 h-3.5 text-indigo-300" />
                )}
                <span>{isSavingMemory ? 'Saving...' : memorySaveSuccess ? 'Memory Synced' : 'Force Memory Sync'}</span>
              </button>
              
              <button
                type="button"
                onClick={handleVerifySyncWithTargets}
                disabled={isVerifying}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-[10px] font-black uppercase tracking-wider bg-fuchsia-600/20 text-fuchsia-200 border border-fuchsia-500/30 rounded-xl hover:bg-fuchsia-600/30 transition cursor-pointer select-none active:scale-95 shadow-sm"
                title="Verify data sync with Monthly Revenue Targets database"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isVerifying ? 'animate-spin text-fuchsia-300' : 'text-fuchsia-400'}`} />
                <span>{isVerifying ? 'Checking alignment...' : 'Verify Targets Sync'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (onAutoSyncSalesData) onAutoSyncSalesData();
                  setSyncFeedback("E-Commerce Sales Dashboard data has been auto-synchronized with the Product Performance Matrix.");
                  setTimeout(() => setSyncFeedback(null), 4000);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-[10px] font-black uppercase tracking-wider bg-emerald-600/20 text-emerald-200 border border-emerald-500/30 rounded-xl hover:bg-emerald-600/30 transition cursor-pointer select-none active:scale-95 shadow-sm"
                title="Auto Synchronize E-Commerce Sales Dashboard with Product Performance Matrix"
              >
                <Cloud className="w-3.5 h-3.5 text-emerald-400" />
                <span>Auto-Sync Sales Data</span>
              </button>
            </div>

          </div>

          {/* Sync Diagnostics & Verification Banner */}
          {verificationDetails && (
            <div className="p-4 bg-gray-50/80 border border-gray-200/80 rounded-2xl space-y-3.5 text-xs text-left animate-fadeIn">
              <div className="flex justify-between items-center pb-2 border-b border-gray-150">
                <span className="font-mono text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                  Target Sync Diagnostics ({verificationDetails.period})
                </span>
                <span className="text-[9px] text-gray-400 font-mono">Verified {verificationDetails.checkedAt}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-white p-3 rounded-xl border border-gray-150 space-y-1 shadow-2xs">
                  <div className="text-[9px] font-sans font-bold text-gray-400 uppercase tracking-wider">
                    Alignment Integrity
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${verificationDetails.isPerfect ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                    <span className="font-mono font-black text-gray-800">
                      {verificationDetails.isPerfect ? 'Perfect' : 'Discrepancy'}
                    </span>
                  </div>
                </div>
                <div className="bg-white p-3 rounded-xl border border-gray-150 space-y-1 shadow-2xs">
                  <div className="text-[9px] font-sans font-bold text-gray-400 uppercase tracking-wider">
                    Mapped Products
                  </div>
                  <div className="font-mono font-black text-gray-800">
                    {verificationDetails.syncedProductsCount} / {verificationDetails.totalProducts} Loaded
                  </div>
                </div>
                <div className="bg-white p-3 rounded-xl border border-gray-150 space-y-1 shadow-2xs">
                  <div className="text-[9px] font-sans font-bold text-gray-400 uppercase tracking-wider">
                    Missing Configurations
                  </div>
                  <div className="font-mono font-black text-amber-600">
                    {verificationDetails.missingTargetsCount} Products
                  </div>
                </div>
              </div>

              {verificationDetails.missingProducts.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-900">
                  <div className="space-y-0.5">
                    <div className="font-bold flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
                      <span>Missing Target records in Month Targets page:</span>
                    </div>
                    <p className="text-[10px] text-amber-700 leading-normal">
                      <span className="font-mono font-bold">{verificationDetails.missingProducts.join(', ')}</span> don't have configured sales targets for {verificationDetails.period}.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAutoFixTargets}
                    className="shrink-0 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-extrabold uppercase text-[9px] tracking-wider rounded-lg transition active:scale-95 cursor-pointer max-w-fit"
                  >
                    Auto-Fill Targets
                  </button>
                </div>
              )}

              {verificationDetails.isPerfect && (
                <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-800 font-sans">
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div>
                    <span className="font-bold">Database alignment certified: </span>
                    <span className="leading-snug">All product aggregates in your Performance Matrix match your Monthly Revenue Targets and active monthly progress state.</span>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="space-y-6">
            {productAggregates.map((prod) => {
              const accomplishmentRatio = prod.target > 0 ? (prod.achievementCount / prod.target) * 100 : 0;
              const completedPercent = Math.min(100, Math.round(accomplishmentRatio));
              
              return (
                <div 
                  key={prod.name} 
                  className="space-y-3.5 p-5 rounded-2xl border border-white/10 bg-black/20 hover:bg-black/30 backdrop-blur-sm hover:shadow shadow-sm transition duration-150 relative z-10"
                  id={`prod-card-${prod.name.replace(/\s+/g, '-').toLowerCase()}`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-2">
                      <div>
                        <h4 className="text-sm font-black text-white font-sans tracking-tight leading-snug">
                          {prod.name}
                        </h4>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-indigo-200 font-mono">
                            Total Planned: {prod.totalTasks} Video placements.
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Target & Achievement quick controls */}
                    <div className="flex items-center gap-3 select-none">
                      <div className="shrink-0 text-right">
                        <span className="text-[9px] uppercase font-mono tracking-wider text-fuchsia-200 font-bold block">
                          Target Videos
                        </span>
                        {editingTargetProd === prod.name ? (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <input
                              type="number"
                              min="1"
                              max="99"
                              value={tempTargetValue}
                              onChange={(e) => setTempTargetValue(parseInt(e.target.value) || 1)}
                              className="w-14 text-center text-xs font-bold font-mono px-1.5 py-0.5 border border-red-500 rounded focus:outline-none bg-white text-gray-950"
                              autoFocus
                              title="Set target count of videos expected"
                              id={`input-target-${prod.name.replace(/\s+/g, '-')}`}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                handleUpdateTarget(prod.name, tempTargetValue);
                                setEditingTargetProd(null);
                              }}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] uppercase font-mono px-2 py-1 rounded transition cursor-pointer"
                              title="Save updates"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingTargetProd(null)}
                              className="bg-gray-150 hover:bg-gray-200 text-gray-600 font-bold text-[10px] uppercase font-mono px-2 py-1 rounded transition cursor-pointer"
                              title="Cancel"
                            >
                              X
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs font-black font-mono text-white">{prod.target} videos</span>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingTargetProd(prod.name);
                                setTempTargetValue(prod.target);
                              }}
                              className="inline-flex items-center gap-1 bg-white/10 hover:bg-white/20 text-white px-2 py-0.5 rounded border border-white/20 text-[10px] font-black transition cursor-pointer leading-tight"
                              title="Edit target video count"
                            >
                              Edit
                            </button>
                          </div>
                        )}
                      </div>

                      {editingTargetProd !== prod.name && (
                        <button
                          type="button"
                          onClick={() => handleDeleteProduct(prod.name)}
                          className="text-white/40 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/20 hover:border-red-500/30 border border-transparent transition cursor-pointer self-end mt-4 sm:mt-0"
                          title="Delete product name representation from tracking"
                          id={`btn-delete-${prod.name.replace(/\s+/g, '-')}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Horizontal visual target line bar (Bold progress text display) */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-baseline text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="text-indigo-200 font-medium">Released Status / Achievement:</span>
                        <span className="font-bold font-mono text-white">
                          {prod.achievementCount} released
                        </span>
                        <span className="text-white/20">•</span>
                        <span className="text-indigo-200">Target goal:</span>
                        <span className="font-mono font-bold text-white">{prod.target} videos</span>
                      </div>
                      <span className="font-mono font-black text-white">
                        {completedPercent}% Achieved
                      </span>
                    </div>

                    {/* Elegant horizontal filled progress bar */}
                    <div className="w-full bg-black/40 h-3 rounded-full overflow-hidden select-none">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${
                          completedPercent >= 100 
                            ? 'bg-gradient-to-r from-emerald-400 to-emerald-300' 
                            : completedPercent > 50 
                              ? 'bg-fuchsia-400' 
                              : 'bg-white/80'
                        }`}
                        style={{ width: `${completedPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* ROAS Settle Interface and spent indicators */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3.5 border-t border-white/10 select-none">
                    
                    <div className="space-y-1 text-left">
                      <span className="text-[9px] uppercase font-mono font-bold tracking-wider text-indigo-200 block">
                        Media Budget Spent
                      </span>
                      <div className="font-mono text-xs font-bold text-white">
                        ₹{prod.totalSpent.toLocaleString()}
                      </div>
                    </div>

                    <div className="space-y-1 text-left">
                      <span className="text-[9px] uppercase font-mono font-bold tracking-wider text-indigo-200 block">
                        Monthly Rev Target
                      </span>
                      <div className="font-mono text-xs font-extrabold text-white">
                        ₹{(prod.revenueTarget || 0).toLocaleString()}
                      </div>
                    </div>

                    <div className="space-y-1 font-mono text-left">
                      <span className="text-[9px] uppercase font-bold tracking-wider text-indigo-200 block font-sans">
                        Input Sales (₹)
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="text-indigo-300 text-xs font-semibold">₹</span>
                        <div className="w-full px-1.5 py-0.5 text-xs text-indigo-950 font-bold bg-indigo-50/50 border border-indigo-100 rounded font-mono shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)] cursor-not-allowed flex items-center justify-between group relative overflow-hidden transition-all hover:border-indigo-300">
                          <span className="truncate">{(prod.salesAmount || 0).toLocaleString()}</span>
                          <button 
                            title="Copy amount"
                            onClick={() => {
                              navigator.clipboard.writeText((prod.salesAmount || 0).toString());
                              setCopiedProductId(prod.name);
                              setTimeout(() => setCopiedProductId(null), 1500);
                            }}
                            className="text-indigo-400 hover:text-indigo-600 transition-colors opacity-100 ml-1 p-0.5 rounded-sm hover:bg-indigo-100/50"
                          >
                            {copiedProductId === prod.name ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1 font-sans text-left">
                      <span className="text-[9px] uppercase font-mono font-bold tracking-wider text-indigo-200 block">
                        Progress / ROAS
                      </span>
                      
                      <div className="flex flex-col gap-0.5">
                        {(prod.totalSpent + prod.totalSampleCost) > 0 ? (
                          <span className={`text-xs font-black font-mono leading-none ${
                            prod.roas >= 3.0 ? 'text-emerald-400' : prod.roas >= 1.5 ? 'text-amber-400' : 'text-rose-400'
                          }`}>
                            {prod.roas.toFixed(2)}x <span className="text-[8px] text-white/50 font-medium">ROAS</span>
                          </span>
                        ) : (
                          <span className="text-[9px] text-white/40 font-mono italic">
                            N/A (Spent/Sample ₹0)
                          </span>
                        )}

                        {prod.revenueTarget && prod.revenueTarget > 0 ? (
                          <span className={`text-[10px] font-mono font-black ${
                            prod.salesAmount >= prod.revenueTarget ? 'text-emerald-400' : 'text-fuchsia-200'
                          }`}>
                            {Math.round((prod.salesAmount / prod.revenueTarget) * 100)}% of Rev
                          </span>
                        ) : (
                          <span className="text-[9px] text-white/40 font-mono italic">No target</span>
                        )}
                      </div>
                    </div>

                    {/* Weekly Sales Breakdown */}
                    <div className="col-span-2 sm:col-span-4 pt-3 border-t border-white/10 select-none mt-1">
                      <span className="text-[9px] uppercase font-mono font-bold tracking-wider text-indigo-200 block mb-2">
                        Weekly Sales Breakdown (₹)
                      </span>
                      <div className="grid grid-cols-5 gap-2">
                        {[1, 2, 3, 4, 5].map((w) => {
                          const val = prod[`salesAmountWeek${w}` as keyof typeof prod] as number || 0;
                          return (
                            <div key={w} className="space-y-1">
                              <span className="text-[8px] text-indigo-300 font-mono font-bold uppercase tracking-wider block">
                                Week {w}
                              </span>
                              <div className="flex items-center">
                                <StableInput
                                  placeholder="0"
                                  value={val}
                                  onChange={(newVal) => handleUpdateWeeklySales(prod.name, w as 1|2|3|4|5, newVal)}
                                  className="w-full px-1.5 py-0.5 text-[10px] sm:text-xs text-indigo-950 font-bold bg-white/90 focus:bg-white border border-indigo-200/50 rounded focus:outline-none focus:ring-1 focus:ring-fuchsia-500 font-mono shadow-sm"
                                  title={`Enter week ${w} sales`}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Planner Integration & Manual Synchronizer Panel */}
        <div className="bg-gradient-to-br from-indigo-50 via-white to-sky-50 rounded-2xl border border-indigo-100 p-6 md:p-8 space-y-6 shadow-sm self-start">
          <div>
            <h3 className="text-lg font-black text-indigo-950 tracking-tight flex items-center gap-2">
              <span className="p-1.5 bg-indigo-100 rounded-md shadow-sm"><Calendar className="w-5 h-5 text-indigo-600" /></span>
              <span>Planner Integration</span>
            </h3>
            <p className="text-xs text-indigo-600/70 font-medium leading-normal mt-1">
              Your campaign tracker keeps product lists synchronized with the Monthly Planner. Video target goals are managed manually to align with your custom benchmarks.
            </p>
          </div>

          <div className="space-y-4">
            {/* Main Sync Button */}
            <button
              type="button"
              onClick={handleManualSyncWithPlanner}
              disabled={isSyncing}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-fuchsia-600 to-indigo-600 hover:from-fuchsia-700 hover:to-indigo-700 font-extrabold uppercase tracking-wider disabled:opacity-70 text-white text-[11px] py-3 px-4 rounded-xl cursor-pointer transition shadow-md active:scale-98 border-none"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Verifying live sync...' : 'Auto-Sync Active (Click to Verify)'}</span>
            </button>

            {/* Sync feedback notification banner */}
            {syncFeedback && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-[11px] text-emerald-800 leading-relaxed animate-pulse">
                {syncFeedback}
              </div>
            )}

            {/* Sync status card info */}
            <div className="p-3.5 bg-white/60 backdrop-blur-sm border border-indigo-100 rounded-xl space-y-2.5 text-xs text-left shadow-sm">
              <div className="flex justify-between items-center text-[10px] uppercase font-mono font-bold tracking-wider text-indigo-400">
                <span>Synchronizer Diagnostics</span>
                <span className="text-emerald-500 font-extrabold">● Real-Time Active</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center text-xs pt-1">
                <div className="bg-white p-2 rounded-lg border border-indigo-50 shadow-sm">
                  <div className="text-lg font-black text-indigo-900 font-mono">
                    {tasks.length}
                  </div>
                  <div className="text-[9px] text-indigo-400 uppercase font-sans font-bold">Planner Tasks</div>
                </div>
                <div className="bg-white p-2 rounded-lg border border-indigo-50 shadow-sm">
                  <div className="text-lg font-black text-indigo-900 font-mono">
                    {Array.from(new Set(tasks.map(t => t.title?.trim()).filter(Boolean))).length}
                  </div>
                  <div className="text-[9px] text-indigo-400 uppercase font-sans font-bold">Unique Products</div>
                </div>
              </div>
            </div>

            {/* Detected Products List inside scheduler */}
            <div className="border-t border-indigo-100 pt-5 space-y-3">
              <div>
                <h4 className="text-xs font-black font-mono tracking-wider text-indigo-600 uppercase flex items-center gap-1.5 select-none">
                  <Sparkles className="w-3.5 h-3.5 text-fuchsia-500 animate-pulse" />
                  <span>Scheduled Campaigns Found</span>
                </h4>
                <p className="text-[10px] text-indigo-500/80 leading-relaxed mt-1">
                  Products detected inside the <strong className="text-indigo-800">Monthly Planner Scheduler</strong>. Toggle the tracking status of each campaign to monitor active ROAS.
                </p>
              </div>

              {/* Unique items scroll wrapper */}
              <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                {(() => {
                  const items = Array.from(
                    new Set(tasks.map(t => t.title?.trim()).filter((t): t is string => !!t && t.length > 0))
                  );
                  if (items.length === 0) {
                    return (
                      <p className="text-indigo-400 text-[11px] italic text-center py-4 bg-indigo-50/50 rounded-lg border border-dashed border-indigo-200">
                        No product campaigns scheduled on the Monthly Planner yet.
                      </p>
                    );
                  }
                  return items.map((opt) => {
                    const isTracked = products.some(p => p.name.toLowerCase() === opt.toLowerCase());
                    const taskCount = tasks.filter(t => t.title?.toLowerCase() === opt.toLowerCase()).length;
                    return (
                      <div
                        key={opt}
                        className="flex items-center justify-between text-xs p-2.5 rounded bg-white border border-indigo-50 hover:border-indigo-200 transition shadow-sm"
                      >
                        <button
                          type="button"
                          onClick={() => handleToggleTrackProduct(opt)}
                          className="flex-1 text-left hover:text-indigo-600 transition flex flex-col gap-0.5"
                          title={isTracked ? "Remove from dashboard tracking" : "Add to dashboard tracking"}
                        >
                          <span className="font-bold text-indigo-950 text-xs flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${isTracked ? 'bg-fuchsia-500' : 'bg-slate-300'}`} />
                            <span className="truncate max-w-[130px]">{opt}</span>
                          </span>
                          <span className="text-[9px] text-indigo-400 font-mono ml-3.5">
                            {taskCount} scheduled deliverable{taskCount !== 1 ? 's' : ''}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleToggleTrackProduct(opt)}
                          className={`text-[9px] font-black font-mono tracking-wider uppercase px-2 py-0.5 rounded border transition cursor-pointer select-none ${
                            isTracked 
                              ? 'bg-fuchsia-50 border-fuchsia-200 text-fuchsia-700' 
                              : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                          }`}
                        >
                          {isTracked ? 'Tracked' : '+ Track'}
                        </button>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>



            {/* Quick redirection helper layout */}
            {onNavigateTab && (
              <button
                type="button"
                onClick={() => onNavigateTab('planner')}
                className="w-full flex items-center justify-center gap-1.5 border border-dashed border-indigo-200 text-indigo-500 hover:text-fuchsia-600 hover:border-fuchsia-200 bg-indigo-50/20 text-[11px] font-bold py-2 px-3 rounded-lg cursor-pointer transition"
              >
                <span>Edit Scheduler in Monthly Planner</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}

          </div>

        </div>

      </div>

      {/* Video Release Tracking list & Product breakdown table */}
      <div className="bg-gradient-to-br from-indigo-50 to-white rounded-2xl border border-indigo-100 p-6 md:p-8 space-y-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-indigo-100 pb-4">
          <div>
            <h3 className="text-xl font-black text-indigo-950 tracking-tight flex items-center gap-2">
              <Film className="w-5 h-5 text-indigo-500" />
              <span>Video Release Tracking & Financial Breakdown</span>
            </h3>
            <p className="text-xs text-indigo-600/70 font-medium">
              Current list of monitored products alongside count of released videos (those having active playable video hyper-links in the Planner) and corresponding financial spent logs.
            </p>
          </div>
          <div className="flex items-center gap-2 font-mono text-[10px] bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-100 px-3.5 py-1.5 rounded-xl shrink-0 font-bold shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-600 animate-pulse" />
            <span>Overview Live-Sync Engine Active</span>
          </div>
        </div>

        {/* Filtered Overview Options Toolbar */}
        <div className="bg-gradient-to-br from-fuchsia-100 via-purple-100 to-rose-100 border-2 border-fuchsia-300 rounded-2xl p-5 space-y-4 shadow-lg resize overflow-auto min-h-[60px] min-w-[150px] relative overflow-hidden">
          {/* Decorative shapes */}
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-gradient-to-bl from-rose-300/40 to-fuchsia-300/40 rounded-full blur-2xl pointer-events-none"></div>
          <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-gradient-to-tr from-purple-300/40 to-indigo-300/40 rounded-full blur-2xl pointer-events-none"></div>
          
          <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-fuchsia-200/60 pb-3 relative z-10">
            <div className="flex items-center gap-2 bg-white/60 px-3 py-1.5 rounded-xl border border-white/80 shadow-sm backdrop-blur-sm">
              <Filter className="w-4 h-4 text-fuchsia-600 animate-pulse" />
              <span className="text-sm font-black font-mono uppercase bg-clip-text text-transparent bg-gradient-to-r from-fuchsia-700 via-purple-700 to-rose-600 tracking-widest drop-shadow-sm">Filtered Overview Options</span>
            </div>
            
            <div className="flex flex-wrap items-center gap-2 relative z-10">
              {onToggleOnlyShowPlacedProducts && (
                <label className="inline-flex items-center gap-2 cursor-pointer select-none bg-white/60 hover:bg-white/90 px-3 py-1.5 rounded-xl border border-fuchsia-200 shadow-sm transition-all backdrop-blur-sm group">
                  <input 
                    type="checkbox"
                    checked={onlyShowPlacedProducts}
                    onChange={(e) => onToggleOnlyShowPlacedProducts(e.target.checked)}
                    className="w-4 h-4 rounded text-fuchsia-600 bg-white border-fuchsia-300 focus:ring-fuchsia-500 accent-fuchsia-600 cursor-pointer"
                  />
                  <span className="text-[10px] uppercase font-black font-mono text-fuchsia-800 flex items-center gap-1 group-hover:text-fuchsia-600 transition-colors">
                    <span>📌</span> Placed Products Only
                  </span>
                </label>
              )}
              {/* Auto Sync Toggle */}
              <label className="inline-flex items-center gap-2 cursor-pointer select-none bg-white/60 hover:bg-white/90 px-3 py-1.5 rounded-xl border border-indigo-200 shadow-sm transition-all backdrop-blur-sm group">
                <input 
                  type="checkbox"
                  checked={bdAutoSync}
                  onChange={(e) => setBdAutoSync(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 bg-white border-indigo-300 focus:ring-indigo-500 accent-indigo-600 cursor-pointer"
                />
                <span className="text-[10px] uppercase font-black font-mono text-indigo-800 flex items-center gap-1 group-hover:text-indigo-600 transition-colors">
                  <span>🔄</span> Auto-align with Global Scope
                </span>
              </label>
              
              {/* Big ROAS View Toggle */}
              <label className="inline-flex items-center gap-2 cursor-pointer select-none bg-white/60 hover:bg-white/90 px-3 py-1.5 rounded-xl border border-emerald-200 shadow-sm transition-all backdrop-blur-sm group">
                <input 
                  type="checkbox"
                  checked={showBigRoas}
                  onChange={(e) => setShowBigRoas(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-600 bg-white border-emerald-300 focus:ring-emerald-500 accent-emerald-600 cursor-pointer"
                />
                <span className="text-[10px] uppercase font-black font-mono text-emerald-800 flex items-center gap-1 group-hover:text-emerald-600 transition-colors">
                  <span>📈</span> Big Size ROAS
                </span>
              </label>

              {/* Weekly Sales Detail Toggle */}
              <label className="inline-flex items-center gap-2 cursor-pointer select-none bg-white/60 hover:bg-white/90 px-3 py-1.5 rounded-xl border border-sky-200 shadow-sm transition-all backdrop-blur-sm group">
                <input 
                  type="checkbox"
                  checked={showWeeklySales}
                  onChange={(e) => setShowWeeklySales(e.target.checked)}
                  className="w-4 h-4 rounded text-sky-600 bg-white border-sky-300 focus:ring-sky-500 accent-sky-600 cursor-pointer"
                />
                <span className="text-[10px] uppercase font-black font-mono text-sky-800 flex items-center gap-1 group-hover:text-sky-600 transition-colors">
                  <span>📊</span> Weekly Breakdown
                </span>
              </label>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    let updatedCount = 0;
                    setProducts(prev => prev.map(p => {
                       const activeM = bdAutoSync ? selectedMonth : bdMonth;
                       const activeY = bdAutoSync ? selectedYear : bdYear;
                       
                       let newRevTarget = p.revenueTarget;
                       let newVidTarget = p.target;
                       
                       if (activeM === 'ALL') {
                         const matches = monthlyTargets.filter(t => 
                            (t.productName || "").trim().toLowerCase() === (p.name || "").trim().toLowerCase() &&
                            (activeY === 'ALL' || (t.year && activeY && parseInt(t.year, 10) === parseInt(activeY, 10)))
                         );
                         if (matches.length > 0) {
                           newRevTarget = matches.reduce((sum, m) => sum + (m.target || 0), 0);
                           newVidTarget = matches.reduce((sum, m) => sum + (m.videoTarget || 0), 0);
                           updatedCount++;
                         } else if (monthlyTargets.length > 0) {
                           newRevTarget = 0;
                           newVidTarget = 5;
                           updatedCount++;
                         }
                       } else {
                         const match = monthlyTargets.find(t => 
                            (t.productName || "").trim().toLowerCase() === (p.name || "").trim().toLowerCase() &&
                            (t.month && activeM && parseInt(String(t.month).replace(/\D/g, ''), 10) === parseInt(String(activeM).replace(/\D/g, ''), 10)) &&
                            (activeY === 'ALL' || (t.year && activeY && parseInt(t.year, 10) === parseInt(activeY, 10)))
                         );
                         if (match) {
                           newRevTarget = match.target || 0;
                           newVidTarget = match.videoTarget || 5;
                           updatedCount++;
                         } else if (monthlyTargets.length > 0) {
                           newRevTarget = 0;
                           newVidTarget = 5;
                           updatedCount++;
                         }
                       }
                       
                       if (newRevTarget !== p.revenueTarget || newVidTarget !== p.target) {
                         return { ...p, revenueTarget: newRevTarget, target: newVidTarget };
                       }
                       return p;
                    }));
                    if (updatedCount > 0) {
                      setSyncFeedback(`Successfully collected revenue targets for ${updatedCount} products from Monthly Targets.`);
                    } else {
                      setSyncFeedback("No matching revenue targets found for the selected period.");
                    }
                    setTimeout(() => setSyncFeedback(null), 4000);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider bg-fuchsia-100 text-fuchsia-800 border border-fuchsia-300 rounded-xl hover:bg-fuchsia-200 transition cursor-pointer select-none active:scale-95 shadow-sm"
                  title="Collect Revenue Targets from Monthly Targets page"
                >
                  <Cloud className="w-3.5 h-3.5 text-fuchsia-600" />
                  <span>Collect Revenue Targets</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (onAutoSyncSalesData) onAutoSyncSalesData();
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl hover:bg-emerald-200 transition cursor-pointer select-none active:scale-95 shadow-sm"
                  title="Auto Synchronize E-Commerce Sales Dashboard data"
                >
                  <Cloud className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Auto-Sync Sales Data</span>
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 lg:gap-4">
            {/* Search Input */}
            <div className="space-y-1 text-left">
              <label className="text-[10px] font-black text-indigo-500 uppercase font-mono tracking-wider block mb-1">Search Campaign Reference</label>
              <div className="flex items-center gap-2 bg-white px-2 py-1.5 border border-indigo-200 rounded-lg shadow-sm focus-within:ring-2 focus-within:ring-fuchsia-400 focus-within:border-fuchsia-400 transition-all">
                <span className="text-[10px] text-indigo-400">🔍</span>
                <input 
                  type="text"
                  placeholder="e.g. Oats, Apple..."
                  value={bdSearch}
                  onChange={(e) => setBdSearch(e.target.value)}
                  className="w-full text-[11px] font-bold font-mono text-indigo-950 focus:outline-none bg-transparent placeholder-indigo-300"
                />
              </div>
            </div>

            {/* Target Milestone select */}
            <div className="space-y-1 text-left">
              <label className="text-[10px] font-black text-indigo-500 uppercase font-mono tracking-wider block mb-1">Milestone Target Status</label>
              <select
                value={bdReleaseStatus}
                onChange={(e) => setBdReleaseStatus(e.target.value)}
                className="w-full text-[11px] font-bold font-mono px-2 py-1.5 border border-indigo-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-fuchsia-400 bg-white text-indigo-950 cursor-pointer shadow-sm transition-all"
              >
                <option value="ALL">All Levels</option>
                <option value="MET">Target Met/Exceeded</option>
                <option value="UNDER">In Progress (Pending)</option>
              </select>
            </div>

            {/* ROAS Level select */}
            <div className="space-y-1 text-left">
              <label className="text-[10px] font-black text-indigo-500 uppercase font-mono tracking-wider block mb-1">Resulting ROAS Segment</label>
              <select
                value={bdRoasStatus}
                onChange={(e) => setBdRoasStatus(e.target.value)}
                className="w-full text-[11px] font-bold font-mono px-2 py-1.5 border border-indigo-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-fuchsia-400 bg-white text-indigo-950 cursor-pointer shadow-sm transition-all"
              >
                <option value="ALL">All Perf levels</option>
                <option value="HIGH">Highly Profitable (&gt;= 2x)</option>
                <option value="MID">Breakeven (&gt;0x to &lt;2x)</option>
                <option value="NONE">Unprofitable (0x ROAS)</option>
              </select>
            </div>

            {/* Weekly Basis select */}
            <div className="space-y-1 text-left">
              <label className="text-[10px] font-black text-indigo-500 uppercase font-mono tracking-wider block mb-1">Weekly Basis</label>
              <select
                value={bdAutoSync ? globalWeek : bdWeek}
                onChange={(e) => {
                  setBdWeek?.(e.target.value);
                  setBdAutoSync(false); // Disable auto-sync on manual modification
                }}
                className="w-full text-[11px] font-bold font-mono px-2 py-1.5 border border-indigo-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-fuchsia-400 bg-white text-indigo-950 cursor-pointer shadow-sm transition-all"
              >
                <option value="ALL">All Weeks</option>
                <option value="1">Week 1</option>
                <option value="2">Week 2</option>
                <option value="3">Week 3</option>
                <option value="4">Week 4</option>
                <option value="5">Week 5</option>
                <option value="1-2">1st & 2nd week (Days 1–14)</option>
                <option value="1-3">1st, 2nd, 3rd week (Days 1–21)</option>
                <option value="1-4">1st, 2nd, 3rd, 4th week (Days 1–28)</option>
              </select>
            </div>

            {/* Local Month Override */}
            <div className="space-y-1 text-left">
              <label className="text-[10px] font-black text-indigo-400 uppercase font-mono tracking-wider block mb-1">Local Breakdown Month</label>
              <select
                value={bdAutoSync ? selectedMonth : bdMonth}
                onChange={(e) => {
                  setBdMonth(e.target.value);
                  setBdAutoSync(false); // Disable auto-sync on manual modification
                }}
                className="w-full text-[11px] font-bold font-mono px-2 py-1.5 border border-indigo-200 rounded-lg focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-400 bg-white text-indigo-900 cursor-pointer shadow-sm transition-all"
              >
                <option value="ALL">All Months</option>
                <option value="01">01 - Jan</option>
                <option value="02">02 - Feb</option>
                <option value="03">03 - Mar</option>
                <option value="04">04 - Apr</option>
                <option value="05">05 - May</option>
                <option value="06">06 - Jun</option>
                <option value="07">07 - Jul</option>
                <option value="08">08 - Aug</option>
                <option value="09">09 - Sep</option>
                <option value="10">10 - Oct</option>
                <option value="11">11 - Nov</option>
                <option value="12">12 - Dec</option>
              </select>
            </div>

            {/* Local Year Override */}
            <div className="space-y-1 text-left">
              <label className="text-[10px] font-black text-indigo-400 uppercase font-mono tracking-wider block mb-1">Local Breakdown Year</label>
              <select
                value={bdAutoSync ? selectedYear : bdYear}
                onChange={(e) => {
                  setBdYear(e.target.value);
                  setBdAutoSync(false); // Disable auto-sync on manual modification
                }}
                className="w-full text-[11px] font-bold font-mono px-2 py-1.5 border border-indigo-200 rounded-lg focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-400 bg-white text-indigo-900 cursor-pointer shadow-sm transition-all"
              >
                <option value="ALL">All Years</option>
                <option value="2025">2025</option>
                <option value="2026">2026</option>
                <option value="2027">2027</option>
                <option value="2028">2028</option>
                <option value="2029">2029</option>
              </select>
            </div>
          </div>
        </div>

        {!showBigRoas ? (
          <div className="overflow-x-auto border border-indigo-200 rounded-xl shadow-sm bg-white">
            <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-gradient-to-r from-indigo-50 to-fuchsia-50 border-b border-indigo-200 text-indigo-800 font-mono text-[10px] uppercase font-bold tracking-wider">
                <th scope="col" className="p-4 pl-5">Product / Project Reference</th>
                <th scope="col" className="p-4 text-center">Video Target</th>
                <th scope="col" className="p-4 text-center">Videos Released</th>
                <th scope="col" className="p-4">Sync Integrity Verification</th>
                <th scope="col" className="p-4 text-right border-l border-indigo-100 bg-white/30 backdrop-blur-sm">Spent on Product (₹)</th>
                <th scope="col" className="p-4 text-right bg-white/30 backdrop-blur-sm relative">
                  <div className="flex flex-col items-end gap-1" title="Automatically synchronized in real-time from Monthly Planner tasks">
                    <div className="flex items-center gap-1 text-fuchsia-800">
                      <span>SAMPLE COST (₹) of RELEASED VIDEO</span>
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-fuchsia-600 animate-pulse" />
                    </div>
                  </div>
                  <div className="absolute right-0 bottom-0 w-full h-[2px] bg-fuchsia-300/30"></div>
                </th>
                <th scope="col" className="p-4 text-right border-l border-indigo-100 bg-white/30 backdrop-blur-sm">Media Right (₹)</th>
                <th scope="col" className="p-4 text-right border-l border-indigo-100 bg-indigo-50/50">Quantity Sold</th>
                <th scope="col" className="p-4 text-right bg-white/30 backdrop-blur-sm">Revenue Target (₹)</th>
                <th scope="col" className="p-4 text-right border-l border-indigo-100 bg-indigo-100/30">Estimated Sales (₹)</th>
                {showWeeklySales && (
                  <>
                    <th scope="col" className="p-4 text-right bg-indigo-100/30 w-24">W1 Sales (₹)</th>
                    <th scope="col" className="p-4 text-right bg-indigo-100/30 w-24">W2 Sales (₹)</th>
                    <th scope="col" className="p-4 text-right bg-indigo-100/30 w-24">W3 Sales (₹)</th>
                    <th scope="col" className="p-4 text-right bg-indigo-100/30 w-24">W4 Sales (₹)</th>
                    <th scope="col" className="p-4 text-right bg-indigo-100/30 w-24">W5 Sales (₹)</th>
                  </>
                )}
                <th scope="col" className="p-4 text-center bg-indigo-100/50">Resulting ROAS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-indigo-50">
              {filteredProductAggregates.length === 0 ? (
                <tr>
                  <td colSpan={showWeeklySales ? 15 : 10} className="p-8 text-center text-indigo-400 italic font-medium font-sans bg-indigo-50/10">
                    No records found matching your active Filtered Overview options. Clear filters or adjust values.
                  </td>
                </tr>
              ) : (
                filteredProductAggregates.map((prod) => {
                const achievementSuccess = prod.achievementCount >= prod.target;
                return (
                  <tr key={prod.name} className="hover:bg-indigo-50/50 transition duration-150">
                    <td className="p-4 pl-5 font-black text-indigo-950">
                      {prod.name}
                    </td>
                    <td className="p-4 text-center font-bold font-mono text-indigo-600">
                      <div className="flex items-center justify-center gap-1.5">
                        <StableInput
                          value={prod.target || 1}
                          onChange={(val) => handleUpdateTarget(prod.name, val)}
                          className="w-16 text-center text-xs font-mono font-bold px-1.5 py-0.5 border-b border-transparent focus:border-fuchsia-500 rounded bg-transparent focus:bg-white text-indigo-950 focus:outline-none focus:ring-1 focus:ring-fuchsia-400 transition"
                          title="Target video count"
                        />
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <span className={`inline-flex items-center gap-1 font-mono font-black text-xs ${
                        achievementSuccess ? 'text-emerald-500' : 'text-rose-500'
                      }`}>
                        {prod.achievementCount} Releases
                        {achievementSuccess && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 fill-emerald-50" />}
                      </span>
                    </td>
                    <td className="p-4 font-medium text-indigo-500">
                      {prod.achievementCount > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {prod.releasedTasksMatching.map((rt, i) => (
                            <span 
                              key={rt.id} 
                              className="text-[9px] bg-fuchsia-50 text-fuchsia-700 font-mono px-1.5 py-0.5 rounded border border-fuchsia-200 flex items-center gap-1 shadow-2xs"
                              title={`Video Link Verified: ${rt.videoLink1 || rt.videoLink2 || rt.videoLink3}`}
                            >
                              <PlayCircle className="w-2.5 h-2.5 text-fuchsia-600" />
                              {getVideoDisplayId(rt, i)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-indigo-300 italic text-[10px]">Pending submissions in planner</span>
                      )}
                    </td>
                    <td className="p-4 text-right font-bold text-indigo-900 font-mono bg-white/10 border-l border-indigo-50">
                      ₹{prod.totalSpent.toLocaleString()}
                    </td>
                    <td className="p-4 text-right font-bold text-indigo-700 font-mono" title="Live synchronized from Monthly Planner tasks">
                      ₹{prod.totalSampleCost.toLocaleString()}
                    </td>
                    <td className="p-4 text-right font-bold text-rose-600 font-mono border-l border-indigo-50">
                      ₹{prod.totalMediaRight.toLocaleString()}
                    </td>
                    <td className="p-4 text-right font-bold text-indigo-900 bg-indigo-50/20 border-l border-indigo-50">
                      <StableInput
                        value={prod.quantitySold || 0}
                        onChange={(val) => handleUpdateQuantity(prod.name, val)}
                        placeholder="0"
                        className="w-20 text-right text-xs font-mono font-bold px-1.5 py-0.5 border-b border-transparent focus:border-fuchsia-500 rounded bg-transparent focus:bg-white text-indigo-900 focus:outline-none focus:ring-fuchsia-400 transition"
                        title="Enter quantity sold"
                      />
                    </td>
                    <td className="p-4 text-right font-bold text-indigo-400 select-none bg-white/10">
                      {editingRevenueProd === prod.name ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <input
                            type="number"
                            min="0"
                            placeholder="e.g. 50000"
                            value={tempRevenueValue || ''}
                            onChange={(e) => setTempRevenueValue(parseFloat(e.target.value) || 0)}
                            className="w-20 text-right text-xs font-mono font-bold px-1.5 py-0.5 border border-fuchsia-500 rounded bg-white text-indigo-950 focus:outline-none focus:ring-1 focus:ring-fuchsia-400"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => {
                              handleUpdateRevenueTarget(prod.name, tempRevenueValue);
                              setEditingRevenueProd(null);
                            }}
                            className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-[9px] uppercase font-mono px-1.5 py-0.5 rounded transition cursor-pointer shadow-sm"
                            title="Save revenue target"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingRevenueProd(null)}
                            className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-[9px] uppercase font-mono px-1.5 py-0.5 rounded transition cursor-pointer"
                            title="Cancel"
                          >
                            X
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <span>₹{(prod.revenueTarget || 0).toLocaleString()}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingRevenueProd(prod.name);
                              setTempRevenueValue(prod.revenueTarget || 0);
                            }}
                            className="inline-flex items-center gap-0.5 bg-white hover:bg-fuchsia-50 hover:text-fuchsia-600 hover:border-fuchsia-200 text-indigo-400 border border-indigo-100 px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition leading-tight shadow-2xs"
                            title="Edit target revenue threshold"
                          >
                            Edit
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="p-4 text-right font-bold text-indigo-900 bg-indigo-50/20 border-l border-indigo-50">
                      <div className="flex items-center justify-end gap-1.5 font-mono relative group">
                        {/* Weekly input dropdown on hover / click */}
                        <div className="absolute top-1/2 -translate-y-1/2 right-full mr-2 bg-white border border-indigo-200 rounded-lg p-2 shadow-xl opacity-0 invisible group-hover:opacity-100 group-focus-within:opacity-100 group-hover:visible group-focus-within:visible transition-all z-50 flex flex-col gap-2 w-48 pointer-events-none group-hover:pointer-events-auto group-focus-within:pointer-events-auto">
                          <div className="text-[9px] uppercase tracking-wider font-black text-fuchsia-600 mb-1">Weekly Input Breakdown</div>
                          {[1, 2, 3, 4, 5].map(w => {
                            const val = prod[`salesAmountWeek${w}` as keyof typeof prod] as number || 0;
                            return (
                              <div key={w} className="flex items-center justify-between gap-2">
                                <span className="text-[9px] font-bold text-indigo-400 w-8">W{w}</span>
                                <StableInput
                                  value={val}
                                  onChange={(newVal) => handleUpdateWeeklySales(prod.name, w as 1|2|3|4|5, newVal)}
                                  className="w-20 text-right text-xs bg-slate-50 border border-slate-200 focus:border-fuchsia-400 rounded px-1 outline-none text-indigo-900"
                                  placeholder="0"
                                />
                              </div>
                            )
                          })}
                        </div>
                        <span className="text-indigo-400 font-bold text-xs">₹</span>
                        <div
                          title="Hover to input weekly breakdowns"
                          className="w-24 text-right text-xs font-mono font-bold px-1.5 py-0.5 border-b border-transparent rounded bg-transparent text-indigo-900 cursor-not-allowed select-none"
                        >
                          {(prod.salesAmount || 0).toLocaleString()}
                        </div>
                      </div>
                    </td>
                    {showWeeklySales && (
                      <>
                        <td className="p-4 text-right bg-indigo-50/20 text-indigo-900">
                          <StableInput value={prod.salesAmountWeek1 || 0} onChange={(val) => handleUpdateWeeklySales(prod.name, 1, val)} className="w-16 font-mono font-bold text-indigo-900 text-right text-xs bg-transparent border-b border-transparent focus:border-fuchsia-500 focus:bg-white rounded px-1 outline-none transition" placeholder="0" />
                        </td>
                        <td className="p-4 text-right bg-indigo-50/20 text-indigo-900">
                          <StableInput value={prod.salesAmountWeek2 || 0} onChange={(val) => handleUpdateWeeklySales(prod.name, 2, val)} className="w-16 font-mono font-bold text-indigo-900 text-right text-xs bg-transparent border-b border-transparent focus:border-fuchsia-500 focus:bg-white rounded px-1 outline-none transition" placeholder="0" />
                        </td>
                        <td className="p-4 text-right bg-indigo-50/20 text-indigo-900">
                          <StableInput value={prod.salesAmountWeek3 || 0} onChange={(val) => handleUpdateWeeklySales(prod.name, 3, val)} className="w-16 font-mono font-bold text-indigo-900 text-right text-xs bg-transparent border-b border-transparent focus:border-fuchsia-500 focus:bg-white rounded px-1 outline-none transition" placeholder="0" />
                        </td>
                        <td className="p-4 text-right bg-indigo-50/20 text-indigo-900">
                          <StableInput value={prod.salesAmountWeek4 || 0} onChange={(val) => handleUpdateWeeklySales(prod.name, 4, val)} className="w-16 font-mono font-bold text-indigo-900 text-right text-xs bg-transparent border-b border-transparent focus:border-fuchsia-500 focus:bg-white rounded px-1 outline-none transition" placeholder="0" />
                        </td>
                        <td className="p-4 text-right bg-indigo-50/20 text-indigo-900">
                          <StableInput value={prod.salesAmountWeek5 || 0} onChange={(val) => handleUpdateWeeklySales(prod.name, 5, val)} className="w-16 font-mono font-bold text-indigo-900 text-right text-xs bg-transparent border-b border-transparent focus:border-fuchsia-500 focus:bg-white rounded px-1 outline-none transition" placeholder="0" />
                        </td>
                      </>
                    )}
                    <td className="p-4 text-center bg-indigo-50/30">
                      {(prod.totalSpent + prod.totalSampleCost) > 0 ? (
                        <span className={`inline-block text-[11px] font-black font-mono px-2 py-0.5 rounded-md shadow-2xs border ${
                          prod.roas >= 3.0 ? 'bg-emerald-500 text-white border-emerald-600' : prod.roas >= 1.5 ? 'bg-amber-400 text-amber-950 border-amber-500' : 'bg-rose-50 border-rose-200 text-rose-600'
                        }`}>
                          {prod.roas.toFixed(2)}x
                        </span>
                      ) : (
                        <span className="text-indigo-300 font-mono text-[10px]">₹0 spent</span>
                      )}
                    </td>
                  </tr>
                );
              })
             )}

              {/* GRAND TOTALS ROW */}
              <tr className="bg-gradient-to-r from-fuchsia-100/50 to-indigo-100/50 border-t-2 border-indigo-300 font-mono font-bold text-indigo-950">
                <td className="p-4 pl-5 font-black uppercase text-xs text-indigo-900">
                  GRAND OVERALL TOTALS
                </td>
                <td className="p-4 text-center text-indigo-800 font-bold">
                  {breakdownTotals.totalTarget}
                </td>
                <td className="p-4 text-center text-fuchsia-700 font-black text-sm">
                  {breakdownTotals.totalReleased} Released
                </td>
                <td className="p-4 text-indigo-600/70 font-medium font-sans text-[11px]">
                  Across filtered active breakdown items for {MONTHS_MAP[bdAutoSync ? selectedMonth : bdMonth]} {bdAutoSync ? selectedYear : bdYear}
                </td>
                <td className="p-4 text-right text-indigo-950 font-black text-sm border-l border-indigo-200/50">
                  ₹{breakdownTotals.totalSpent.toLocaleString()}
                </td>
                <td className="p-4 text-right text-indigo-800 font-black text-sm">
                  ₹{breakdownTotals.totalSampleCost.toLocaleString()}
                </td>
                <td className="p-4 text-right text-rose-600 font-black text-sm border-l border-indigo-200/50">
                  ₹{breakdownTotals.totalMediaRight.toLocaleString()}
                </td>
                <td className="p-4 text-right text-indigo-900 font-black text-sm border-l border-indigo-200/50">
                  {breakdownTotals.totalQuantitySold.toLocaleString()}
                </td>
                <td className="p-4 text-right text-fuchsia-700 font-black text-sm">
                  ₹{breakdownTotals.totalRevenueTarget.toLocaleString()}
                </td>
                <td className="p-4 text-right text-indigo-950 font-black text-sm border-l border-indigo-200/50 bg-indigo-200/50">
                  ₹{breakdownTotals.totalSales.toLocaleString()}
                </td>
                {showWeeklySales && (
                  <>
                    <td className="p-4 text-right text-indigo-950 font-black text-sm bg-indigo-200/50">
                      ₹{breakdownTotals.totalSalesWeek1.toLocaleString()}
                    </td>
                    <td className="p-4 text-right text-indigo-950 font-black text-sm bg-indigo-200/50">
                      ₹{breakdownTotals.totalSalesWeek2.toLocaleString()}
                    </td>
                    <td className="p-4 text-right text-indigo-950 font-black text-sm bg-indigo-200/50">
                      ₹{breakdownTotals.totalSalesWeek3.toLocaleString()}
                    </td>
                    <td className="p-4 text-right text-indigo-950 font-black text-sm bg-indigo-200/50">
                      ₹{breakdownTotals.totalSalesWeek4.toLocaleString()}
                    </td>
                    <td className="p-4 text-right text-indigo-950 font-black text-sm bg-indigo-200/50">
                      ₹{breakdownTotals.totalSalesWeek5.toLocaleString()}
                    </td>
                  </>
                )}
                <td className="p-4 text-center text-white">
                  <span className="bg-gradient-to-br from-indigo-950 to-slate-900 rounded-md font-mono font-black text-xs px-3 py-1.5 shadow-sm border border-indigo-700">
                    {breakdownTotals.overallROAS > 0 ? `${breakdownTotals.overallROAS.toFixed(2)}x` : 'N/A'}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredProductAggregates.map((prod) => (
              <div key={prod.name} className="relative bg-white border-2 border-indigo-100 rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-emerald-200 transition-all flex flex-col items-center justify-center text-center space-y-4 group">
                <div className="flex flex-col gap-1 items-center">
                  <h4 className="text-sm font-black font-mono text-indigo-950 uppercase tracking-widest">{prod.name}</h4>
                  <div className="text-[10px] font-bold text-indigo-400 bg-indigo-50 px-2.5 py-0.5 rounded-full inline-flex items-center">
                    {prod.achievementCount} RELEASES
                  </div>
                </div>
                
                <div className="w-full h-px bg-indigo-50 my-2"></div>
                
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[10px] uppercase font-mono font-bold text-gray-400 tracking-wider">Resulting ROAS</span>
                  <div className={`text-5xl font-black tracking-tighter ${prod.roas >= 4 ? 'text-emerald-500' : prod.roas >= 2.5 ? 'text-amber-500' : prod.roas > 0 ? 'text-fuchsia-500' : 'text-slate-300'}`}>
                    {prod.roas > 0 ? `${prod.roas.toFixed(2)}x` : 'N/A'}
                  </div>
                </div>

                <div className="w-full flex justify-between items-center text-[10px] font-mono mt-2 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <div className="flex flex-col items-start gap-0.5">
                    <span className="text-slate-400 font-bold">SPEND</span>
                    <span className="text-rose-600 font-black tracking-wider">₹{(prod.totalSpent + prod.totalSampleCost + (prod.totalMediaRight || 0)).toLocaleString()}</span>
                  </div>
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-slate-400 font-bold">QTY</span>
                    <span className="text-indigo-600 font-black tracking-wider">{(prod.quantitySold || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="text-slate-400 font-bold">SALES</span>
                    <span className="text-emerald-600 font-black tracking-wider">₹{(prod.salesAmount || 0).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            ))}
            
            {filteredProductAggregates.length === 0 && (
              <div className="col-span-full py-20 text-center flex flex-col items-center justify-center space-y-3 bg-indigo-50/30 rounded-2xl border border-dashed border-indigo-200">
                <span className="text-4xl">📭</span>
                <p className="text-sm font-bold text-indigo-400 font-mono">No products matching the active filters</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Product-wise Video Planning Schedule Section --- Basis: Wizard Scheduler Entries */}
      <div className="bg-gradient-to-br from-indigo-50 via-white to-sky-50 rounded-2xl border border-indigo-100 p-6 md:p-8 space-y-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 border-b border-indigo-100 pb-5">
          <div className="space-y-1">
            <h3 className="text-xl font-black text-indigo-950 tracking-tight flex items-center gap-2">
              <span className="p-1.5 bg-indigo-100 rounded-lg shadow-sm text-indigo-600"><Calendar className="w-5 h-5" /></span>
              <span>Product-wise Video Planning & Delivery Schedule</span>
            </h3>
            <p className="text-xs text-indigo-600/70 font-medium ml-1">
              Complete catalog of scheduled and released video placements configured within the **Wizard Scheduler** filters.
            </p>
          </div>

          {/* Month & Year Selectors specifically for this visual schedule sub-module (As explicitly requested: "add option to select month and year") */}
          <div className="w-full bg-white/60 backdrop-blur-sm p-5 md:p-6 rounded-2xl border border-indigo-100 shadow-sm space-y-4">
            <div className="flex items-center gap-2 border-b border-indigo-200/50 pb-3">
              <span className="text-xs font-black font-mono uppercase text-indigo-500 tracking-wider">
                Filter Schedule Options
              </span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-indigo-400 uppercase font-mono tracking-wider block">Month</label>
                <select
                  value={planningMonth}
                  onChange={(e) => setPlanningMonth(e.target.value)}
                  className="w-full text-sm font-bold font-mono px-4 py-2.5 border border-indigo-200 rounded-xl focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-300 bg-white text-indigo-900 cursor-pointer transition-all shadow-sm"
                  title="Select Month for Video Planning Details"
                  id="planning-month-select"
                >
                  <option value="ALL">All Months</option>
                  {Object.entries(MONTHS_MAP).filter(([k]) => k !== 'ALL').map(([num, name]) => (
                    <option key={num} value={num}>{name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-indigo-400 uppercase font-mono tracking-wider block">Year</label>
                <select
                  value={planningYear}
                  onChange={(e) => setPlanningYear(e.target.value)}
                  className="w-full text-sm font-bold font-mono px-4 py-2.5 border border-indigo-200 rounded-xl focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-300 bg-white text-indigo-900 cursor-pointer transition-all shadow-sm"
                  title="Select Year for Video Planning Details"
                  id="planning-year-select"
                >
                  <option value="ALL">All Years</option>
                  <option value="2025">2025</option>
                  <option value="2026">2026</option>
                  <option value="2027">2027</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-indigo-400 uppercase font-mono tracking-wider block">Week</label>
                <select
                  value={planningWeek}
                  onChange={(e) => setPlanningWeek?.(e.target.value)}
                  className="w-full text-sm font-bold font-mono px-4 py-2.5 border border-indigo-200 rounded-xl focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-300 bg-white text-indigo-900 cursor-pointer transition-all shadow-sm"
                  title="Select Week for Video Planning Details"
                  id="planning-week-select"
                >
                  <option value="ALL">All Weeks</option>
                  <option value="1">Week 1</option>
                  <option value="2">Week 2</option>
                  <option value="3">Week 3</option>
                  <option value="4">Week 4</option>
                  <option value="5">Week 5</option>
                  <option value="1-2">1st & 2nd week (Days 1–14)</option>
                  <option value="1-3">1st, 2nd, 3rd week (Days 1–21)</option>
                  <option value="1-4">1st, 2nd, 3rd, 4th week (Days 1–28)</option>
                </select>
              </div>
              
              <div className="space-y-1.5 flex flex-col justify-end">
                <div className="flex gap-2 h-full">
                  <button
                    type="button"
                    onClick={() => setShowOnlyActivePlanning(!showOnlyActivePlanning)}
                    className={`flex-1 h-full flex items-center justify-center text-[11px] font-black font-mono px-4 rounded-xl border transition-all shadow-sm ${
                      showOnlyActivePlanning
                        ? 'bg-gradient-to-r from-fuchsia-600 to-indigo-600 text-white border-transparent hover:opacity-90 shadow-md scale-[1.02]'
                        : 'bg-white text-indigo-500 border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300'
                    }`}
                    title="Toggle to hide idle products without scheduled tasks in selection"
                    id="btn-toggle-active-planning"
                  >
                    {showOnlyActivePlanning ? '🎯 Active Only' : 'Show All'}
                  </button>

                  {/* Sync trigger button if selections have drifted */}
                  {(planningMonth !== selectedMonth || planningYear !== selectedYear || planningWeek !== globalWeek) && (
                    <button
                      type="button"
                      className="text-[11px] h-full flex items-center justify-center bg-gradient-to-r from-sky-500 to-indigo-500 hover:from-sky-600 hover:to-indigo-600 text-white font-black px-4 rounded-xl cursor-pointer transition-all active:scale-95 text-center shadow-md animate-in fade-in"
                      onClick={() => {
                        setPlanningMonth(selectedMonth);
                        setPlanningYear(selectedYear);
                        setPlanningWeek?.(globalWeek);
                      }}
                      title="Synchronize filters back to Main Dashboard Month/Year view"
                      id="btn-sync-dashboard-dates"
                    >
                      Sync 🔄
                    </button>
                  )}
                  
                  {planningMonth !== 'ALL' && planningYear !== 'ALL' && (
                    <button
                      type="button"
                      className="text-[11px] h-full flex items-center justify-center bg-gradient-to-r from-orange-400 to-rose-500 hover:from-orange-500 hover:to-rose-600 text-white font-black px-3 rounded-xl cursor-pointer transition-all active:scale-95 text-center shadow-md whitespace-nowrap"
                      onClick={handleBringForwardDeadlines}
                      title="Update outdated planned deadlines in this view to the selected month"
                      id="btn-bring-forward-deadlines"
                    >
                      Update Outdated Deadlines
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

            {/* Wizard Scheduler Button */}
            <div className="flex justify-end pt-4">
              <button
                type="button"
                onClick={() => setShowWizard(!showWizard)}
                className="w-full md:w-auto inline-flex justify-center items-center gap-1.5 bg-gradient-to-r from-rose-500 via-fuchsia-500 to-indigo-500 hover:from-rose-600 hover:via-fuchsia-600 hover:to-indigo-600 text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition shadow-md cursor-pointer animate-pulse-slow"
              >
                <Sparkles className="w-4 h-4" /> Wizard Scheduler
              </button>
            </div>
          </div>

        {showWizard && (
          <form onSubmit={handleWizardSubmit} className="bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600 rounded-2xl p-6 shadow-xl animate-fade-in space-y-5 relative overflow-hidden mb-6">
            <div className="absolute top-12 -left-12 w-48 h-48 bg-white rounded-full mix-blend-overlay filter blur-3xl opacity-20"></div>
            
            <div className="flex justify-between items-center pb-3 border-b border-white/20 relative z-10">
              <h3 className="text-sm font-mono font-black uppercase tracking-widest flex items-center gap-2 text-white">
                <span className="p-1.5 bg-white/20 backdrop-blur-sm rounded-md shadow-sm">🚀</span> Plan New Video Placement
              </h3>
              <button 
                type="button" 
                onClick={() => setShowWizard(false)} 
                className="text-white/80 hover:text-white text-xs font-bold uppercase tracking-wider bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-colors border border-white/20 cursor-pointer"
              >
                Cancel
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 relative z-10">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-emerald-100 uppercase font-mono tracking-wider block">Product Selection</label>
                <select
                  required
                  className="w-full text-xs text-slate-800 bg-white/90 hover:bg-white px-3 py-2 border border-transparent rounded-lg focus:ring-2 focus:ring-white focus:outline-none font-sans font-bold transition-colors cursor-pointer"
                  value={wizardProduct}
                  onChange={(e) => setWizardProduct(e.target.value)}
                >
                  <option value="">-- Select Product --</option>
                  {products.filter(p => p.name !== 'CENTRAL_BUDGET').map((p) => (
                    <option key={p.name} value={p.name}>{p.name}</option>
                  ))}
                  {wizardProducts.filter(wp => wp !== 'CENTRAL_BUDGET' && !products.find(p => p.name === wp)).map((wp) => (
                    <option key={`wp-${wp}`} value={wp}>{wp}</option>
                  ))}
                </select>
              </div>

              
              <div className="space-y-1">
                <label className="text-[10px] font-black text-emerald-100 uppercase font-mono tracking-wider block">Creator Assignment</label>
                <select
                  required
                  className="w-full text-xs text-slate-800 bg-white/90 hover:bg-white px-3 py-2 border border-transparent rounded-lg focus:ring-2 focus:ring-white focus:outline-none font-sans font-bold transition-colors cursor-pointer"
                  value={wizardInfluencer}
                  onChange={(e) => setWizardInfluencer(e.target.value)}
                >
                  <option value="">-- Select Creator ({influencers.length} available) --</option>
                  <option value="NEW_CREATOR">+ Add New Creator (Auto-Create)</option>
                  {[...influencers]
                    .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }))
                    .map(i => (
                      <option key={i.id} value={i.id}>{i.name} ({i.niche})</option>
                    ))
                  }
                </select>
              </div>



              <div className="space-y-1">
                <label className="text-[10px] font-black text-emerald-100 uppercase font-mono tracking-wider block">Planned Date</label>
                <input
                  type="date"
                  required
                  onClick={(e) => {
                    try {
                      if ('showPicker' in HTMLInputElement.prototype) {
                        (e.target as HTMLInputElement).showPicker();
                      }
                    } catch (err) {}
                  }}
                  className="w-full text-xs text-slate-800 bg-white/90 focus:bg-white px-3 py-2 border border-transparent rounded-lg focus:ring-2 focus:ring-white focus:outline-none font-mono transition-colors font-bold cursor-pointer"
                  value={wizardDate}
                  onChange={(e) => setWizardDate(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-emerald-100 uppercase font-mono tracking-wider block">CPV / Amount (₹)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full text-xs text-slate-800 bg-white/90 focus:bg-white px-3 py-2 border border-transparent rounded-lg focus:ring-2 focus:ring-white focus:outline-none font-mono transition-colors font-bold cursor-text"
                  placeholder="0.00"
                  value={wizardAmount}
                  onChange={(e) => setWizardAmount(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end pt-3 relative z-10">
              <button
                type="submit"
                className="bg-white text-emerald-700 hover:bg-emerald-50 px-6 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all shadow-lg hover:shadow-xl active:scale-95 flex items-center gap-2 cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-emerald-500" />
                Schedule Video
              </button>
            </div>
          </form>
        )}

        {/* Content of product planning grouped hierarchy */}
        <div className="space-y-6">
          {(() => {
            // Group our activities
            const itemsToRender = allProductsListForPlanning.filter(prodName => {
              const matchedTasks = filteredTasksForPlanning.filter(
                t => t.title && t.title.trim().toLowerCase() === (prodName || "").trim().toLowerCase()
              );
              // Filter logic if showOnlyActivePlanning is toggled
              if (showOnlyActivePlanning) {
                return matchedTasks.length > 0;
              }
              return true;
            });

            if (itemsToRender.length === 0) {
              return (
                <div className="text-center py-12 px-4 rounded-2xl bg-white/60 border-2 border-dashed border-indigo-200 shadow-sm" id="empty-planning-schedule">
                  <div className="mx-auto w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-500 mb-3 shadow-inner">
                    <Calendar className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-black text-indigo-950">No Video Placements Scheduled</h4>
                  <p className="text-xs text-indigo-600 max-w-md mx-auto mt-2 leading-relaxed">
                    There are no Wizard Scheduler entries configured for the month of <strong className="text-indigo-900">{MONTHS_MAP[planningMonth] || 'All'}</strong> {planningYear !== 'ALL' ? planningYear : 'All Years'}.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setShowWizard(true);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="mt-5 bg-gradient-to-r from-fuchsia-600 to-indigo-600 hover:from-fuchsia-700 hover:to-indigo-700 text-white font-extrabold uppercase text-[10px] py-2.5 px-5 rounded-lg tracking-wider transition hover:shadow-md cursor-pointer border-none"
                  >
                    Open Wizard Scheduler & Plan Videos Now
                  </button>
                </div>
              );
            }

            let globalReadyToUploadSlNo = 0;
            let globalAwaitingUploadSlNo = 0;

            const completedForStats = filteredTasksForPlanning.filter(t => t.status !== 'Cancelled' && (t.videoLink1?.trim() || t.videoLink2?.trim() || t.videoLink3?.trim()));
            const maxViewsStat = completedForStats.reduce((max, t) => Math.max(max, t.views || 0), 0);
            const maxClicksStat = completedForStats.reduce((max, t) => Math.max(max, t.clicks || 0), 0);
            const minClicksStat = completedForStats.length > 0 ? Math.min(...completedForStats.map(t => t.clicks || 0)) : -1;

            return (
              <div className="grid grid-cols-1 gap-6" id="planning-products-grid">
                {itemsToRender.map((prodName) => {
                  const productScheduledTasks = filteredTasksForPlanning.filter(
                    t => t.title && t.title.trim().toLowerCase() === (prodName || "").trim().toLowerCase()
                  );

                  let targetVideoCount = 5;
                  if (monthlyTargets && monthlyTargets.length > 0) {
                    if (planningMonth === 'ALL') {
                      const matches = monthlyTargets.filter(t => 
                        t.productName.toLowerCase() === prodName.toLowerCase() &&
                        (planningYear === 'ALL' || t.year === planningYear)
                      );
                      if (matches.length > 0) {
                        targetVideoCount = matches.reduce((sum, m) => sum + (m.videoTarget ?? 0), 0);
                      } else {
                        targetVideoCount = 5;
                      }
                    } else {
                      const match = monthlyTargets.find(t => 
                        t.productName.toLowerCase() === prodName.toLowerCase() &&
                        t.month === planningMonth &&
                        t.year === planningYear
                      );
                      if (match) {
                        targetVideoCount = match.videoTarget !== undefined ? match.videoTarget : 5;
                      }
                    }
                  }

                  const isProductTracked = products.some(p => p.name.toLowerCase() === prodName.toLowerCase());
                  const activeTasks = productScheduledTasks.filter(t => t.status !== 'Cancelled');
                  
                  const totalAllocatedSponserFee = activeTasks.reduce((sum, t) => sum + (t.remuneration || 0), 0);
                  const totalSampleShipments = activeTasks.reduce((sum, t) => {
                    return sum + (t.sampleCost || 0);
                  }, 0);
                  const totalMediaRights = activeTasks.reduce((sum, t) => sum + (t.mediaRightAmount || 0), 0);
                  const totalBudgetAllocated = totalAllocatedSponserFee + totalSampleShipments + totalMediaRights;

                  // Compute count released vs count scheduled
                  const releasedList = activeTasks.filter(t => t.videoLink1?.trim() || t.videoLink2?.trim() || t.videoLink3?.trim());
                  const pendingList = activeTasks.filter(t => !(t.videoLink1?.trim() || t.videoLink2?.trim() || t.videoLink3?.trim()));
                  
                  let estimatedSalesForPlanner = 0;
                  const matchingProduct = products.find(p => p.name.toLowerCase() === prodName.toLowerCase());
                  if (salesData && salesData.length > 0) {
                    const prodMatch = prodName.trim().toLowerCase();
                    let w1 = 0, w2 = 0, w3 = 0, w4 = 0, w5 = 0;
                    salesData.forEach(row => {
                      if (!row.productName || row.productName.trim().toLowerCase() !== prodMatch) return;
                      if (planningYear !== 'ALL') {
                        if (String(row.year).trim() !== String(planningYear).trim()) return;
                      }
                      if (planningMonth !== 'ALL') {
                        if (parseInt(String(row.month).trim(), 10) !== parseInt(String(planningMonth), 10)) return;
                      }
                      const amt = Number(row.netRevenue) || Number(row.grossSales) || 0;
                      const match = String(row.week).match(/\d+/);
                      const weekNum = match ? parseInt(match[0], 10) : 0;
                      if (weekNum === 1) w1 += amt;
                      else if (weekNum === 2) w2 += amt;
                      else if (weekNum === 3) w3 += amt;
                      else if (weekNum === 4) w4 += amt;
                      else if (weekNum === 5) w5 += amt;
                    });
                    estimatedSalesForPlanner = w1 + w2 + w3 + w4 + w5;
                    if (planningWeek !== 'ALL') {
                      const weekNum = parseInt(planningWeek, 10);
                      if (weekNum === 1) estimatedSalesForPlanner = w1;
                      else if (weekNum === 2) estimatedSalesForPlanner = w2;
                      else if (weekNum === 3) estimatedSalesForPlanner = w3;
                      else if (weekNum === 4) estimatedSalesForPlanner = w4;
                      else if (weekNum === 5) estimatedSalesForPlanner = w5;
                    }
                  } else if (matchingProduct) {
                    estimatedSalesForPlanner = matchingProduct.salesAmount || 0;
                    if (planningWeek !== 'ALL') {
                       const weekNum = parseInt(planningWeek, 10);
                       if (weekNum === 1) estimatedSalesForPlanner = matchingProduct.salesAmountWeek1 || 0;
                       else if (weekNum === 2) estimatedSalesForPlanner = matchingProduct.salesAmountWeek2 || 0;
                       else if (weekNum === 3) estimatedSalesForPlanner = matchingProduct.salesAmountWeek3 || 0;
                       else if (weekNum === 4) estimatedSalesForPlanner = matchingProduct.salesAmountWeek4 || 0;
                       else if (weekNum === 5) estimatedSalesForPlanner = matchingProduct.salesAmountWeek5 || 0;
                    } else {
                       const manualTotal = (matchingProduct.salesAmountWeek1 || 0) + (matchingProduct.salesAmountWeek2 || 0) + (matchingProduct.salesAmountWeek3 || 0) + (matchingProduct.salesAmountWeek4 || 0) + (matchingProduct.salesAmountWeek5 || 0);
                       if (manualTotal > 0) {
                           estimatedSalesForPlanner = manualTotal;
                       }
                    }
                  }

                  return (
                    <div
                      key={prodName}
                      className="rounded-2xl border border-indigo-100 overflow-hidden shadow-sm hover:shadow-md transition duration-155 bg-white relative group"
                      id={`planning-card-${prodName.replace(/\s+/g, '-').toLowerCase()}`}
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent translate-x-[-100%] group-hover:animate-[shimmer_2s_infinite] pointer-events-none" />
                      
                      {/* Product Section Header Row */}
                      <div className="bg-gradient-to-r from-indigo-600 to-sky-600 border-b border-indigo-700 p-4 flex flex-col sm:flex-row justify-between items-baseline sm:items-center gap-3 relative z-10 shadow-[inset_0_-1px_0_rgba(255,255,255,0.1)]">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-sm font-black text-white tracking-tight font-sans">
                              {prodName}
                            </h4>
                            {isProductTracked ? (
                              <span className="text-[9px] bg-white/20 backdrop-blur-sm text-white px-2 py-0.5 rounded border border-white/30 font-bold font-mono flex items-center gap-1 shadow-sm">
                                <Sparkles className="w-2.5 h-2.5" />
                                Tracked Performer
                              </span>
                            ) : (
                              <span className="text-[9px] bg-black/20 backdrop-blur-sm text-white/80 px-2 py-0.5 rounded border border-black/10 font-bold font-mono">
                                Registry-Only (Wizard)
                              </span>
                            )}
                            {releasedList.length >= targetVideoCount ? (
                              <span className="text-[9px] bg-emerald-400/20 backdrop-blur-sm text-emerald-100 px-2 py-0.5 rounded border border-emerald-400/30 font-bold font-mono flex items-center gap-1 shadow-sm">
                                🏆 Goal Met ({releasedList.length}/{targetVideoCount} Videos)
                              </span>
                            ) : (
                              <span className="text-[9px] bg-amber-400/20 backdrop-blur-sm text-amber-100 px-2 py-0.5 rounded border border-amber-400/30 font-bold font-mono flex items-center gap-1 shadow-sm">
                                ⏳ In Progress ({releasedList.length}/{targetVideoCount} Videos)
                              </span>
                            )}
                          </div>
                          
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-white/70 text-[10px] font-mono font-medium">
                            <span>Schedules matching filters:</span>
                            <span className="text-white font-bold">{activeTasks.length} planned videos</span>
                            <span className="text-white/30">•</span>
                            <span className="text-amber-300 font-black">Target goal: {targetVideoCount} videos</span>
                            <span className="text-white/30">•</span>
                            <span className="text-emerald-300 font-bold">{releasedList.length} released</span>
                            {pendingList.length > 0 && (
                              <>
                                <span className="text-white/30">•</span>
                                <span className="text-rose-300 font-black text-xs uppercase tracking-wider">{pendingList.length} awaiting release</span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Financial Allocation metrics for this filter interval */}
                        <div className="flex items-center gap-3">
                          <div className="shrink-0 font-mono text-left sm:text-right">
                            <span className="text-[9px] text-white/60 uppercase font-sans font-bold block">Interval Budget Allocation</span>
                            <strong className="text-sm text-white font-extrabold">₹{totalBudgetAllocated.toLocaleString()}</strong>
                            <div className="text-[9px] text-white/50 mt-0.5">
                              (₹{totalAllocatedSponserFee.toLocaleString()} pay + ₹{totalSampleShipments.toLocaleString()} samples{totalMediaRights > 0 ? ` + ₹${totalMediaRights.toLocaleString()} media rights` : ''})
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Video Deliverable items list */}
                      <div className="p-3 space-y-3 bg-indigo-50/50">
                        {/* Estimated Sales distinct card */}
                        <div className="rounded-xl border shadow-sm p-4 bg-gradient-to-r from-emerald-500 to-teal-500 border-emerald-600 flex justify-between items-center text-white">
                          <div>
                            <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-100 block">Estimated Sales (Auto-Synced)</span>
                            <span className="text-xl font-black font-sans">₹{estimatedSalesForPlanner.toLocaleString()}</span>
                          </div>
                          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                            <Sparkles className="w-5 h-5 text-emerald-50" />
                          </div>
                        </div>

                        {productScheduledTasks.filter(t => t.status !== 'Cancelled').length === 0 ? (
                          <div className="p-5 text-center text-xs text-indigo-400 italic bg-white/40 leading-normal">
                            No active campaign rows registered for this product in the planning timeframe.
                          </div>
                        ) : (
                          productScheduledTasks.filter(t => t.status !== 'Cancelled').sort((a, b) => {
                            const score = (t: Task) => {
                              const validLinks = !!(t.videoLink1?.trim() || t.videoLink2?.trim() || t.videoLink3?.trim());
                              const recentReleaseDiff = t.releaseDate ? (new Date().getTime() - new Date(t.releaseDate).getTime()) / (1000 * 3600 * 24) : null;
                              const isNewlyCompleted = recentReleaseDiff !== null && recentReleaseDiff >= -1 && recentReleaseDiff <= 2;
                              if (validLinks && !isNewlyCompleted) return 1;
                              if (validLinks && isNewlyCompleted) return 2;
                              if (!validLinks && t.readyToUpload) return 3;
                              return 4;
                            };
                            return score(a) - score(b);
                          }).map((task, activeIdx) => {
                            const stepIdx = productScheduledTasks.indexOf(task);
                            // Match influencer object details if possible
                            const matchedInf = influencers.find(inf => inf.id === task.influencerId);
                            const influencerName = matchedInf?.name || (task.influencerId ? `Assigned Content Creator (Missing/Deleted: ${task.influencerId})` : 'Assigned Content Creator (No ID)');
                            const influencerHandle = matchedInf?.handle || `@influencer`;
                            const influencerNiche = matchedInf?.niche || 'Lifestyle';
                            
                            const hasValidVideoLinks = !!(task.videoLink1?.trim() || task.videoLink2?.trim() || task.videoLink3?.trim());
                            const recentReleaseDiff = task.releaseDate ? (new Date().getTime() - new Date(task.releaseDate).getTime()) / (1000 * 3600 * 24) : null;
                            const isNewlyCompleted = recentReleaseDiff !== null && recentReleaseDiff >= -1 && recentReleaseDiff <= 2;

                            let displaySlNo = 0;
                            if (!hasValidVideoLinks) {
                              if (task.readyToUpload) {
                                globalReadyToUploadSlNo++;
                                displaySlNo = globalReadyToUploadSlNo;
                              } else {
                                globalAwaitingUploadSlNo++;
                                displaySlNo = globalAwaitingUploadSlNo;
                              }
                            }

                            const influencerMonthTasks = filteredTasksForPlanning
                              .filter(t => t.influencerId === task.influencerId && t.status !== 'Cancelled')
                              .sort((a, b) => {
                                const d1 = new Date(a.releaseDate || a.deadline || 0).getTime();
                                const d2 = new Date(b.releaseDate || b.deadline || 0).getTime();
                                if (d1 !== d2) return d1 - d2;
                                return a.id.localeCompare(b.id);
                              });
                            const influencerVideoIndex = influencerMonthTasks.findIndex(t => t.id === task.id);
                            
                            const getOrdinal = (n: number) => {
                              const s = ["th", "st", "nd", "rd"];
                              const v = n % 100;
                              return n + (s[(v - 20) % 10] || s[v] || s[0]);
                            };
                            
                            const taskRankForInfluencer = influencerVideoIndex >= 0 ? influencerVideoIndex + 1 : 1;
                            const showRankBadge = taskRankForInfluencer > 1 || influencerMonthTasks.length > 1;

                            return (
                              <div key={task.id || stepIdx} className={`flex flex-col group border-2 rounded-xl transition duration-500 overflow-hidden shadow-sm ${!hasValidVideoLinks ? 'bg-red-50/30 border-red-300 hover:bg-red-50 hover:shadow-md' : 'bg-white border-blue-500 hover:shadow-md hover:border-blue-600'}`}>
                                <div
                                  className="p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 text-xs"
                                  id={`planning-row-${task.id}`}
                                >
                                  {/* Left: Deliverable & Creator info */}
                                  <div className="space-y-1.5 w-full md:max-w-sm lg:max-w-lg">
                                    <div className="flex items-center gap-2">
                                      <span className={`w-1.5 h-3.5 rounded-sm inline-block animate-[pulse_2s_infinite] ${!hasValidVideoLinks ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]' : 'bg-fuchsia-500'}`} />
                                      <span className={`font-mono font-bold uppercase text-[10px] ${!hasValidVideoLinks ? 'text-red-500' : 'text-indigo-400'}`}>
                                        Deliverable #{stepIdx + 1} ({getVideoDisplayId(task, stepIdx)})
                                      </span>
                                      <span className={`px-2 py-0.5 rounded text-[9px] font-black font-mono uppercase border ${!hasValidVideoLinks ? 'bg-red-50 py-1 text-red-700 border-red-200 shadow-sm' : 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-100'}`}>
                                        {task.type || 'Video Post'}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-3 mt-1.5 w-full justify-between">
                                      {/* Creator Details */}
                                      <div className="flex items-center gap-2">
                                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-fuchsia-100 to-indigo-100 border border-indigo-200 text-indigo-600 font-extrabold flex items-center justify-center text-[10px] font-mono uppercase select-none shadow-sm">
                                          {influencerName.charAt(0)}
                                        </div>
                                        <div>
                                          <div className="font-bold text-indigo-950 font-sans flex items-center flex-wrap gap-1">
                                            {editingInfluencerNameId === matchedInf?.id ? (
                                              <div className="flex items-center gap-2 relative z-10">
                                                <input
                                                  type="text"
                                                  autoFocus
                                                  value={editingInfluencerNameValue}
                                                  onChange={e => setEditingInfluencerNameValue(e.target.value)}
                                                  onKeyDown={e => {
                                                    if (e.key === 'Enter') {
                                                      if (onUpdateInfluencer && matchedInf) {
                                                        onUpdateInfluencer(matchedInf.id, { name: editingInfluencerNameValue.trim() || 'Assigned Content Creator' });
                                                      }
                                                      setEditingInfluencerNameId(null);
                                                    } else if (e.key === 'Escape') {
                                                      setEditingInfluencerNameId(null);
                                                    }
                                                  }}
                                                  className="text-xs px-2 py-1 rounded border border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans"
                                                />
                                                <button
                                                  onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    if (onUpdateInfluencer && matchedInf) {
                                                      onUpdateInfluencer(matchedInf.id, { name: editingInfluencerNameValue.trim() || 'Assigned Content Creator' });
                                                    }
                                                    setEditingInfluencerNameId(null);
                                                  }}
                                                  className="p-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
                                                  title="Save Name"
                                                >
                                                  <Save className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                  onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    setEditingInfluencerNameId(null);
                                                  }}
                                                  className="p-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-700 shadow-sm"
                                                  title="Cancel"
                                                >
                                                  <XCircle className="w-3.5 h-3.5" />
                                                </button>
                                              </div>
                                            ) : (
                                              <>
                                                <span className="bg-blue-600 text-white px-2 py-0.5 rounded-md shadow-sm border border-blue-700/50 font-bold tracking-tight"><strong>{influencerName}</strong></span>
                                                {matchedInf && onUpdateInfluencer && (
                                                  <button
                                                    onClick={(e) => {
                                                      e.preventDefault();
                                                      e.stopPropagation();
                                                      setEditingInfluencerNameValue(influencerName);
                                                      setEditingInfluencerNameId(matchedInf.id);
                                                    }}
                                                    className="ml-1 p-0.5 text-indigo-400 hover:text-indigo-600 transition-colors opacity-50 hover:opacity-100"
                                                    title="Edit Influencer Name"
                                                  >
                                                    <Pencil className="w-3 h-3" />
                                                  </button>
                                                )}
                                              </>
                                            )}
                                            {showRankBadge && (
                                              <span className={`px-2 py-0.5 rounded text-[9px] font-black border shadow-sm whitespace-nowrap ml-1.5 font-mono tracking-wide uppercase flex items-center gap-1 ${taskRankForInfluencer > 1 ? 'bg-gradient-to-r from-amber-400 to-orange-500 text-white border-orange-600 shadow-orange-500/30' : 'bg-indigo-100 text-indigo-700 border-indigo-200'}`}>
                                                {taskRankForInfluencer > 1 && <Sparkles className="w-2.5 h-2.5" />}
                                                {getOrdinal(taskRankForInfluencer)} Video
                                              </span>
                                            )}
                                          </div>
                                          <div className="text-[10px] text-indigo-500/70 font-mono">
                                            {influencerHandle} • {influencerNiche}
                                          </div>
                                          <div className="flex items-center gap-2 mt-0.5 text-[10px] font-mono flex-wrap">
                                            <span className="text-white font-bold bg-green-500 border border-green-600 px-1.5 py-0.5 rounded shadow-sm flex items-center gap-1">
                                              👁 {task.views || 0} Views
                                            </span>
                                            <span className="text-white font-bold bg-pink-500 border border-pink-600 px-1.5 py-0.5 rounded shadow-sm flex items-center gap-1">
                                              👆 {task.clicks || 0} Clicks
                                            </span>
                                            {hasValidVideoLinks && (task.views || 0) > 0 && (task.views || 0) === maxViewsStat && (
                                              <span className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white border border-emerald-400 px-2.5 py-0.5 rounded-full shadow-md flex items-center gap-1.5 font-black uppercase text-[10px] tracking-widest">
                                                🏆 Top View Influencer
                                              </span>
                                            )}
                                            {hasValidVideoLinks && (task.clicks || 0) > 0 && (task.clicks || 0) === maxClicksStat && (
                                              <span className="bg-gradient-to-r from-blue-500 to-indigo-500 text-white border border-blue-400 px-2.5 py-0.5 rounded-full shadow-md flex items-center gap-1.5 font-black uppercase text-[10px] tracking-widest">
                                                🔥 Top Clicks Influencer
                                              </span>
                                            )}
                                            {hasValidVideoLinks && (task.clicks || 0) <= Math.max(10, minClicksStat) && maxClicksStat > 20 && (
                                              <span className="bg-gradient-to-r from-rose-500 to-red-500 text-white border border-rose-400 px-2.5 py-0.5 rounded-full shadow-md flex items-center gap-1.5 font-black uppercase text-[10px] tracking-widest">
                                                ⚠️ Very Low Click Influencer
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                      
                                      <div className="flex items-center gap-1.5">
                                        {matchedInf?.mobile && (
                                          <a
                                            href={`tel:${matchedInf.mobile.replace(/[^0-9+]/g, '')}`}
                                            title={`Call ${influencerName} via Phone`}
                                            className="p-1.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 transition-colors cursor-pointer flex items-center justify-center shadow-xs"
                                          >
                                            <Phone className="w-3.5 h-3.5" />
                                          </a>
                                        )}
                                        {matchedInf && (() => {
                                          const deliverableProductName = formatProductForWhatsApp((task.title || task.product || task.productName || (task.campaignId && campaigns?.find(c => c.id === task.campaignId)?.title) || '').trim());
                                          const scheduledDate = task.releaseDate || task.deadline || 'the scheduled date';
                                          const isAwaitingRelease = !task.readyToUpload && !hasValidVideoLinks && task.status !== 'Completed';
                                          const statusLabel = isAwaitingRelease ? 'Awaiting Release' : (task.readyToUpload ? 'Ready to Upload' : 'Scheduled');

                                          const upcomingMsg = getUpcomingVideoWhatsAppText(influencerName, deliverableProductName, scheduledDate, whatsAppLanguage);
                                          const scheduleUploadMsg = getUploadScheduleWhatsAppText(
                                             influencerName,
                                             deliverableProductName,
                                             {
                                               uploadDate: scheduledDate,
                                               uploadTime: task.uploadTime || task.scheduledTime || "6:00 PM",
                                               buyingLink: task.buyingLink || "",
                                               facebookDescLink: task.facebookDescLink || "",
                                               facebookPinCommentLink: task.facebookPinCommentLink || "",
                                               instagramBioLink: task.instagramBioLink || "",
                                               instagramWishlink: task.instagramWishlink || "",
                                               youtubeDescLink: task.youtubeDescLink || "",
                                               pinCommentOnly: false
                                             },
                                             whatsAppLanguage as any
                                           );
                                          const scheduleUploadPinOnlyMsg = getUploadScheduleWhatsAppText(
                                             influencerName,
                                             deliverableProductName,
                                             {
                                               uploadDate: scheduledDate,
                                               uploadTime: task.uploadTime || task.scheduledTime || "6:00 PM",
                                               buyingLink: task.buyingLink || "",
                                               facebookDescLink: task.facebookDescLink || "",
                                               facebookPinCommentLink: task.facebookPinCommentLink || "",
                                               instagramBioLink: task.instagramBioLink || "",
                                               instagramWishlink: task.instagramWishlink || "",
                                               youtubeDescLink: task.youtubeDescLink || "",
                                               pinCommentOnly: true
                                             },
                                             whatsAppLanguage as any
                                           );
                                          const taskCourier = (task as any).courierName || (task as any).courier || '';
                                          const taskTracking = (task as any).trackingId || (task as any).trackingNo || '';
                                          const sampleTrackingMsg = getSampleDispatchedTrackingWhatsAppText(
                                            influencerName,
                                            deliverableProductName,
                                            taskCourier,
                                            taskTracking,
                                            task.orderDate || scheduledDate,
                                            whatsAppLanguage
                                          );
                                          const uploadReminderMsg = getVideoUploadReminderWhatsAppText(
                                            influencerName,
                                            deliverableProductName,
                                            scheduledDate,
                                            task.uploadTime || task.scheduledTime || matchedInf?.preferredTime || '6:00 PM',
                                            task.buyingLink || '',
                                            whatsAppLanguage
                                          );
                                          const advanceLinkEditReviewMsg = getAdvanceLinkAndEditReviewWhatsAppText(
                                            influencerName,
                                            deliverableProductName,
                                            {
                                              uploadDate: scheduledDate,
                                              uploadTime: task.uploadTime || task.scheduledTime || matchedInf?.preferredTime || '6:00 PM',
                                              buyingLink: task.buyingLink || ''
                                            },
                                            task.uploadTime || task.scheduledTime || matchedInf?.preferredTime || '6:00 PM',
                                            task.buyingLink || '',
                                            whatsAppLanguage
                                          );
                                          const followupMsg = getFollowUpWhatsAppText(influencerName, deliverableProductName, scheduledDate, whatsAppLanguage);
                                          const editedVideoReadyMsg = getEditedVideoReadyCheckWhatsAppText(
                                            influencerName,
                                            deliverableProductName,
                                            task.releaseDate || task.deadline || scheduledDate,
                                            whatsAppLanguage
                                          );
                                          const videoApprovedDetailsSoonMsg = getVideoApprovedDetailsSoonWhatsAppText(
                                            influencerName,
                                            deliverableProductName,
                                            whatsAppLanguage
                                          );
                                          const isTodaySunday = new Date().getDay() === 0;
                                          const officeHoursFeedbackMsg = getOfficeHoursFeedbackNoticeWhatsAppText(
                                            influencerName,
                                            deliverableProductName,
                                            isTodaySunday,
                                            whatsAppLanguage
                                          );
                                          const sampleReceivedMsg = getSampleReceivedWhatsAppText(influencerName, deliverableProductName, task.orderDate, whatsAppLanguage);
                                          const guidelinesMsg = getGuidelinesWhatsAppText(influencerName, deliverableProductName, scheduledDate, whatsAppLanguage);
                                          const taskAmt = task.billedAmount || task.remuneration || 0;
                                          const paymentMsg = getPaymentDetailsWhatsAppText(influencerName, deliverableProductName, taskAmt, task.paymentDetails, whatsAppLanguage);

                                          const isMenuOpen = activeWhatsAppMenuTaskId === task.id;

                                          const handleDirectSend = (msgText: string) => {
                                            const targetMobile = cleanSingleMobileForStorage(matchedInf?.mobile || task.influencerMobile || getKnownMobile(influencerName || matchedInf?.name));
                                            if (!targetMobile) {
                                              triggerUpdateWhatsAppModal({
                                                influencerId: matchedInf.id,
                                                influencerName: influencerName || matchedInf.name,
                                                influencerAvatar: matchedInf.avatar,
                                                influencerHandle: matchedInf.handle,
                                                currentMobile: matchedInf.mobile,
                                                messageText: msgText,
                                                contextTitle: deliverableProductName ? `Video Deliverable (${deliverableProductName})` : 'Video Deliverable'
                                              });
                                              return;
                                            }
                                            openWhatsAppChat({
                                              phoneNumber: targetMobile,
                                              text: msgText,
                                              preferApp: true,
                                              contactName: influencerName || matchedInf.name || 'Creator'
                                            });
                                          };

                                          return (
                                            <div className="relative inline-flex items-center">
                                              <div className="inline-flex items-center rounded-full bg-[#E8F8F5] border border-[#A9DFBF] shadow-xs">
                                                {/* Main WhatsApp Button: Opens modal with Upcoming Video, Sample Check and Follow-up options */}
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    const initialTemplate = task.sampleSent ? 'sample_sent_tracking' : 'upcoming';
                                                    const initialText = resolveDeliverableTemplateText(
                                                      initialTemplate,
                                                      whatsAppLanguage,
                                                      influencerName,
                                                      deliverableProductName,
                                                      scheduledDate,
                                                      task.orderDate,
                                                      taskAmt,
                                                      task.paymentDetails || '',
                                                      task.videoId ? String(task.videoId) : undefined,
                                                      task.releaseDate || task.deadline || scheduledDate,
                                                      task.uploadTime || task.scheduledTime || matchedInf?.preferredTime || matchedInf?.preferredUploadTime || '6:00 PM',
                                                      task.buyingLink || '',
                                                      task.facebookDescLink || '',
                                                      task.facebookPinCommentLink || '',
                                                      task.instagramBioLink || '',
                                                      task.instagramWishlink || '',
                                                      task.youtubeDescLink || '',
                                                      taskCourier,
                                                      taskTracking
                                                    );
                                                    setWhatsAppModalData({
                                                      task,
                                                      influencer: matchedInf,
                                                      influencerName,
                                                      productName: deliverableProductName,
                                                      releaseDate: scheduledDate,
                                                      uploadDate: task.releaseDate || task.deadline || scheduledDate,
                                                      uploadTime: task.uploadTime || task.scheduledTime || matchedInf?.preferredTime || matchedInf?.preferredUploadTime || '6:00 PM',
                                                      buyingLink: task.buyingLink || '',
                                                      facebookDescLink: task.facebookDescLink || '',
                                                      facebookPinCommentLink: task.facebookPinCommentLink || '',
                                                      instagramBioLink: task.instagramBioLink || '',
                                                      instagramWishlink: task.instagramWishlink || '',
                                                      youtubeDescLink: task.youtubeDescLink || '',
                                                      activeLinkTab: 'all',
                                                      selectedTemplate: initialTemplate,
                                                      customText: initialText,
                                                      statusLabel,
                                                      sampleSent: !!task.sampleSent,
                                                      sampleOrderDate: task.orderDate || '',
                                                      courierName: taskCourier,
                                                      trackingId: taskTracking,
                                                      language: whatsAppLanguage,
                                                      amount: taskAmt,
                                                      paymentDetails: task.paymentDetails || '',
                                                      isSundayNotice: isTodaySunday
                                                    });
                                                  }}
                                                  title={`WhatsApp options for ${influencerName} (English / অসমীয়া)`}
                                                  className="p-1.5 rounded-l-full text-[#25D366] hover:bg-[#D4EFDF] transition-colors cursor-pointer flex items-center justify-center"
                                                >
                                                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                                                  </svg>
                                                </button>

                                                {/* Chevron Dropdown Trigger for 1-Click Fast Actions */}
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setActiveWhatsAppMenuTaskId(isMenuOpen ? null : task.id);
                                                  }}
                                                  title="Choose WhatsApp message to send"
                                                  className="pr-1.5 pl-0.5 py-1.5 rounded-r-full text-[#25D366] hover:bg-[#D4EFDF] border-l border-[#A9DFBF]/60 transition-colors cursor-pointer flex items-center justify-center"
                                                >
                                                  <ChevronDown className="w-2.5 h-2.5" />
                                                </button>
                                              </div>

                                              {/* Quick Dropdown Menu */}
                                              {isMenuOpen && (
                                                <div 
                                                  onClick={(e) => e.stopPropagation()}
                                                  className="absolute left-0 bottom-full mb-1.5 w-72 bg-white rounded-xl shadow-xl border border-emerald-200 p-2 z-50 text-left animate-in fade-in zoom-in-95 duration-100"
                                                >
                                                  {/* Menu Header with Language Selector */}
                                                  <div className="px-1.5 py-1 border-b border-gray-100 mb-1.5 flex items-center justify-between gap-1">
                                                    <div className="min-w-0 flex-1">
                                                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                                                        Send WhatsApp
                                                      </span>
                                                      <span className="text-[11px] font-extrabold text-gray-900 truncate block">
                                                        {influencerName}
                                                      </span>
                                                    </div>
                                                    {/* Language Switcher in Dropdown Header */}
                                                    <div className="flex items-center bg-gray-100 p-0.5 rounded-md border border-gray-200 text-[10px] font-extrabold shrink-0">
                                                      <button
                                                        type="button"
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          setWhatsAppLanguage('en');
                                                          safeLocalStorage.setItem('wa_msg_lang', 'en');
                                                        }}
                                                        className={`px-1.5 py-0.5 rounded cursor-pointer transition ${
                                                          whatsAppLanguage === 'en'
                                                            ? 'bg-white text-gray-900 shadow-xs'
                                                            : 'text-gray-500 hover:text-gray-800'
                                                        }`}
                                                        title="English"
                                                      >
                                                        EN
                                                      </button>
                                                      <button
                                                        type="button"
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          setWhatsAppLanguage('as');
                                                          safeLocalStorage.setItem('wa_msg_lang', 'as');
                                                        }}
                                                        className={`px-1.5 py-0.5 rounded cursor-pointer transition ${
                                                          whatsAppLanguage === 'as'
                                                            ? 'bg-emerald-600 text-white shadow-xs'
                                                            : 'text-gray-500 hover:text-gray-800'
                                                        }`}
                                                        title="অসমীয়া (Assamese)"
                                                      >
                                                        অসমীয়া
                                                      </button>
                                                    </div>
                                                  </div>

                                                  {/* Option 1: Inform About Upcoming Video */}
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      setActiveWhatsAppMenuTaskId(null);
                                                      handleDirectSend(upcomingMsg);
                                                    }}
                                                    className="w-full text-left px-2 py-1.5 hover:bg-emerald-50 rounded-lg text-xs font-bold text-emerald-900 flex items-start gap-2 transition cursor-pointer"
                                                  >
                                                    <span className="text-sm mt-0.5">📢</span>
                                                    <div className="min-w-0 flex-1">
                                                      <div className="flex items-center gap-1.5">
                                                        <span className="font-extrabold text-emerald-950 truncate">
                                                          {whatsAppLanguage === 'as' ? "আগন্তুক ভিডিঅ'ৰ জাননী" : "Inform About Upcoming Video"}
                                                        </span>
                                                      </div>
                                                      <p className="text-[10px] text-gray-500 font-normal leading-tight mt-0.5 truncate">
                                                        {whatsAppLanguage === 'as' ? `${scheduledDate} তাৰিখে ৰিলিজৰ জাননী` : `Release notice for ${scheduledDate}`}
                                                      </p>
                                                    </div>
                                                  </button>

                                                  {/* Option 1: Upload Schedule & Buying Link (Description & Pin Comment) */}
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      setActiveWhatsAppMenuTaskId(null);
                                                      handleDirectSend(scheduleUploadMsg);
                                                    }}
                                                    className="w-full text-left px-2 py-1.5 hover:bg-violet-50 rounded-lg text-xs font-bold text-violet-900 flex items-start gap-2 transition cursor-pointer"
                                                  >
                                                    <span className="text-sm mt-0.5">⏰</span>
                                                    <div className="min-w-0 flex-1">
                                                      <div className="flex items-center gap-1.5">
                                                        <span className="font-extrabold text-violet-950 truncate">
                                                          {whatsAppLanguage === "as" ? "আপল'ড সময়সূচী (বিকল্প ১: ডেচক্ৰিপশ্বন আৰু পিন)" : "Upload Schedule (Option 1: Desc & Pin)"}
                                                        </span>
                                                        <span className="text-[9px] bg-violet-100 text-violet-800 px-1 py-0.2 rounded font-black uppercase">
                                                          {whatsAppLanguage === "as" ? "বিকল্প ১" : "Option 1"}
                                                        </span>
                                                      </div>
                                                      <p className="text-[10px] text-gray-500 font-normal leading-tight mt-0.5 truncate">
                                                        {whatsAppLanguage === "as" ? "আপল'ড সময় আৰু ডেচক্ৰিপশ্বন/বায়'/পিন কমেণ্টত লিংক দিয়াৰ নিৰ্দেশনা" : "Upload time & buying link in description/bio & pinned comment"}
                                                      </p>
                                                    </div>
                                                  </button>

                                                  {/* Option 2: Upload Schedule & Buying Link (Pin Comment Only) */}
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      setActiveWhatsAppMenuTaskId(null);
                                                      handleDirectSend(scheduleUploadPinOnlyMsg);
                                                    }}
                                                    className="w-full text-left px-2 py-1.5 hover:bg-purple-50 rounded-lg text-xs font-bold text-purple-900 flex items-start gap-2 transition cursor-pointer border-t border-purple-100/60 bg-purple-50/30"
                                                  >
                                                    <span className="text-sm mt-0.5">📌</span>
                                                    <div className="min-w-0 flex-1">
                                                      <div className="flex items-center gap-1.5">
                                                        <span className="font-extrabold text-purple-950 truncate">
                                                          {whatsAppLanguage === "as" ? "আপল'ড সময়সূচী (বিকল্প ২: কেৱল পিন কমেণ্টত)" : "Upload Schedule (Option 2: Pin Only)"}
                                                        </span>
                                                        <span className="text-[9px] bg-purple-600 text-white px-1 py-0.2 rounded font-black uppercase shadow-2xs">
                                                          {whatsAppLanguage === "as" ? "বিকল্প ২" : "Pin Only"}
                                                        </span>
                                                      </div>
                                                      <p className="text-[10px] text-purple-700/80 font-normal leading-tight mt-0.5 truncate">
                                                        {whatsAppLanguage === "as" ? "আমাৰ দিয়া লিংক আৰু সবিশেষ কেৱল পিন কমেণ্টতহে যোগ কৰিবলৈ বিশেষ বাৰ্তা" : "Tells creator to add provided link and details ONLY on pin comment"}
                                                      </p>
                                                    </div>
                                                  </button>

                                                  {/* Option: Advance Buying Link & Edit Review Submission */}
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      setActiveWhatsAppMenuTaskId(null);
                                                      const initialText = getAdvanceLinkAndEditReviewWhatsAppText(
                                                        influencerName,
                                                        deliverableProductName,
                                                        {
                                                          uploadDate: task.releaseDate || task.deadline || scheduledDate,
                                                          uploadTime: task.uploadTime || task.scheduledTime || matchedInf?.preferredTime || matchedInf?.preferredUploadTime || '6:00 PM',
                                                          buyingLink: task.buyingLink || ''
                                                        },
                                                        task.uploadTime || task.scheduledTime || matchedInf?.preferredTime || matchedInf?.preferredUploadTime || '6:00 PM',
                                                        task.buyingLink || '',
                                                        whatsAppLanguage
                                                      );
                                                      setWhatsAppModalData({
                                                        task,
                                                        influencer: matchedInf,
                                                        influencerName,
                                                        productName: deliverableProductName,
                                                        releaseDate: scheduledDate,
                                                        uploadDate: task.releaseDate || task.deadline || scheduledDate,
                                                        uploadTime: task.uploadTime || task.scheduledTime || matchedInf?.preferredTime || matchedInf?.preferredUploadTime || '6:00 PM',
                                                        buyingLink: task.buyingLink || '',
                                                        facebookDescLink: task.facebookDescLink || '',
                                                        facebookPinCommentLink: task.facebookPinCommentLink || '',
                                                        instagramBioLink: task.instagramBioLink || '',
                                                        instagramWishlink: task.instagramWishlink || '',
                                                        youtubeDescLink: task.youtubeDescLink || '',
                                                        activeLinkTab: 'all',
                                                        selectedTemplate: 'advance_link_edit_review',
                                                        customText: initialText,
                                                        statusLabel,
                                                        sampleSent: !!task.sampleSent,
                                                        sampleOrderDate: task.orderDate || '',
                                                        courierName: taskCourier,
                                                        trackingId: taskTracking,
                                                        language: whatsAppLanguage,
                                                        amount: taskAmt,
                                                        paymentDetails: task.paymentDetails || ''
                                                      });
                                                    }}
                                                    className="w-full text-left px-2 py-1.5 hover:bg-amber-50 rounded-lg text-xs font-bold text-amber-950 flex items-start gap-2 transition cursor-pointer border border-amber-200/90 bg-amber-50/50 my-0.5"
                                                    title="Provide buying link in advance & require video edit per previous notes and final submission before upload"
                                                  >
                                                    <span className="text-sm mt-0.5">🔗</span>
                                                    <div className="min-w-0 flex-1">
                                                      <div className="flex items-center gap-1.5">
                                                        <span className="font-extrabold text-amber-950 truncate">
                                                          {whatsAppLanguage === "as" ? "আগতীয়া ক্ৰয় লিংক আৰু এডিট জমা" : "Advance Link & Edit Review"}
                                                        </span>
                                                        <span className="text-[9px] bg-amber-500 text-white px-1 py-0.2 rounded font-black uppercase shadow-2xs">
                                                          {whatsAppLanguage === "as" ? "আগতীয়া" : "Pre-Submit"}
                                                        </span>
                                                      </div>
                                                      <p className="text-[10px] text-amber-800/90 font-normal leading-tight mt-0.5 truncate">
                                                        {whatsAppLanguage === "as"
                                                          ? "আগতীয়াকৈ ক্ৰয় লিংক প্ৰদান + পূৰ্বৰ নিৰ্দেশনা মতে এডিট আৰু ফাইনেল জমা"
                                                          : "Advance link + must edit per notes & submit final before upload"}
                                                      </p>
                                                    </div>
                                                  </button>

                                                  {/* Option: Video Upload Reminder */}
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      setActiveWhatsAppMenuTaskId(null);
                                                      handleDirectSend(uploadReminderMsg);
                                                    }}
                                                    className="w-full text-left px-2 py-1.5 hover:bg-sky-50 rounded-lg text-xs font-bold text-sky-950 flex items-start gap-2 transition cursor-pointer border border-sky-100 bg-sky-50/50 my-0.5"
                                                    title="Send video upload reminder message to creator"
                                                  >
                                                    <span className="text-sm mt-0.5">🔔</span>
                                                    <div className="min-w-0 flex-1">
                                                      <div className="flex items-center gap-1.5">
                                                        <span className="font-extrabold text-sky-950 truncate">
                                                          {whatsAppLanguage === "as" ? "ভিডিঅ' আপল'ডৰ সোঁৱৰণী" : "Video Upload Reminder"}
                                                        </span>
                                                        <span className="text-[9px] bg-sky-600 text-white px-1.5 py-0.2 rounded font-black uppercase shadow-2xs">
                                                          {whatsAppLanguage === "as" ? "সোঁৱৰণী" : "Reminder"}
                                                        </span>
                                                      </div>
                                                      <p className="text-[10px] text-sky-800/80 font-normal leading-tight mt-0.5 truncate">
                                                        {whatsAppLanguage === "as" ? "নিৰ্ধাৰিত সময়ত আপল'ড কৰিবলৈ আৰু লিংক পঠিয়াবলৈ জৰুৰী সোঁৱৰণী" : "Remind creator to upload on schedule & send live link"}
                                                      </p>
                                                    </div>
                                                  </button>

                                                  {/* Option: Sample Sent (Courier & Tracking) */}
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      setActiveWhatsAppMenuTaskId(null);
                                                      handleDirectSend(sampleTrackingMsg);
                                                    }}
                                                    className="w-full text-left px-2 py-1.5 hover:bg-teal-50 rounded-lg text-xs font-bold text-teal-900 flex items-start gap-2 transition cursor-pointer border border-teal-100 bg-teal-50/40 my-0.5"
                                                    title="Send sample dispatched message with Courier Name & Tracking ID"
                                                  >
                                                    <span className="text-sm mt-0.5">🚚</span>
                                                    <div className="min-w-0 flex-1">
                                                      <div className="flex items-center gap-1.5">
                                                        <span className="font-extrabold text-teal-950 truncate">
                                                          {whatsAppLanguage === 'as' ? "ছেম্পল প্ৰেৰণ (কুৰিয়াৰ আৰু ট্ৰেকিং)" : "Sample Sent (Courier & Tracking)"}
                                                        </span>
                                                        <span className="text-[9px] bg-teal-600 text-white px-1.5 py-0.2 rounded font-black uppercase shadow-2xs">
                                                          {whatsAppLanguage === 'as' ? "ট্ৰেকিং" : "Tracking"}
                                                        </span>
                                                      </div>
                                                      <p className="text-[10px] text-teal-700/90 font-normal leading-tight mt-0.5 truncate">
                                                        {taskCourier 
                                                          ? `${taskCourier} • ${taskTracking || 'No AWB'}`
                                                          : (whatsAppLanguage === 'as' ? "কুৰিয়াৰৰ নাম আৰু ট্ৰেকিং নম্বৰসহ বাৰ্তা" : "Send courier partner name & tracking ID to creator")}
                                                      </p>
                                                    </div>
                                                  </button>

                                                  {/* Option 2: Sample Received Check */}
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      setActiveWhatsAppMenuTaskId(null);
                                                      handleDirectSend(sampleReceivedMsg);
                                                    }}
                                                    className="w-full text-left px-2 py-1.5 hover:bg-orange-50 rounded-lg text-xs font-bold text-orange-900 flex items-start gap-2 transition cursor-pointer"
                                                  >
                                                    <span className="text-sm mt-0.5">📦</span>
                                                    <div className="min-w-0 flex-1">
                                                      <div className="flex items-center gap-1.5">
                                                        <span className="font-extrabold text-orange-950 truncate">
                                                          {whatsAppLanguage === 'as' ? "ছেম্পল পোৱা নিশ্চিতকৰণ" : "Sample Received Check"}
                                                        </span>
                                                        {task.sampleSent && (
                                                          <span className="text-[9px] bg-orange-100 text-orange-800 px-1 py-0.2 rounded font-black uppercase">
                                                            {whatsAppLanguage === 'as' ? "পঠিওৱা হৈছে" : "Dispatched"}
                                                          </span>
                                                        )}
                                                      </div>
                                                      <p className="text-[10px] text-gray-500 font-normal leading-tight mt-0.5 truncate">
                                                        {whatsAppLanguage === 'as' ? "ছেম্পল পাৰ্চেলটো পালে নে নাই সুধক" : "Check if product sample arrived safely"}
                                                      </p>
                                                    </div>
                                                  </button>

                                                  {/* Option 3: Follow-up on Preparation */}
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      setActiveWhatsAppMenuTaskId(null);
                                                      handleDirectSend(followupMsg);
                                                    }}
                                                    className="w-full text-left px-2 py-1.5 hover:bg-blue-50 rounded-lg text-xs font-bold text-blue-900 flex items-start gap-2 transition cursor-pointer"
                                                  >
                                                    <span className="text-sm mt-0.5">📹</span>
                                                    <div className="min-w-0 flex-1">
                                                      <span className="font-extrabold text-blue-950 truncate block">
                                                        {whatsAppLanguage === 'as' ? "ভিডিঅ' প্ৰস্তুতিৰ বুজ লওক" : "Follow-Up on Preparation"}
                                                      </span>
                                                      <p className="text-[10px] text-gray-500 font-normal leading-tight mt-0.5 truncate">
                                                        {whatsAppLanguage === 'as' ? "ভিডিঅ'ৰ কাম কেনে চলিছে সুধক" : "Ask if video is preparing"}
                                                      </p>
                                                    </div>
                                                  </button>

                                                  {/* Option: Is Edited Video Ready? */}
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      setActiveWhatsAppMenuTaskId(null);
                                                      handleDirectSend(editedVideoReadyMsg);
                                                    }}
                                                    className="w-full text-left px-2 py-1.5 hover:bg-indigo-50 rounded-lg text-xs font-bold text-indigo-950 flex items-start gap-2 transition cursor-pointer border border-indigo-100 bg-indigo-50/40 my-0.5"
                                                    title="Ask if the edited video is ready and request final draft cut"
                                                  >
                                                    <span className="text-sm mt-0.5">🎬</span>
                                                    <div className="min-w-0 flex-1">
                                                      <div className="flex items-center gap-1.5">
                                                        <span className="font-extrabold text-indigo-950 truncate">
                                                          {whatsAppLanguage === 'as' ? "এডিটেড ভিডিঅ' সাজু নেকি?" : "Edited Video Ready?"}
                                                        </span>
                                                        <span className="text-[9px] bg-indigo-600 text-white px-1 py-0.2 rounded font-black uppercase shadow-2xs">
                                                          {whatsAppLanguage === 'as' ? "সাজু নেকি?" : "Ready?"}
                                                        </span>
                                                      </div>
                                                      <p className="text-[10px] text-indigo-700 font-normal leading-tight mt-0.5 truncate">
                                                        {whatsAppLanguage === 'as' ? "এডিট সম্পূৰ্ণ হ'ল নে সুধক আৰু কাট বিচাৰক" : "Ask if edited cut is ready for review"}
                                                      </p>
                                                    </div>
                                                  </button>

                                                  {/* Option: Video Approved (Upload Date, Time & Buying Link Soon) */}
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      setActiveWhatsAppMenuTaskId(null);
                                                      handleDirectSend(videoApprovedDetailsSoonMsg);
                                                    }}
                                                    className="w-full text-left px-2 py-1.5 hover:bg-emerald-50 rounded-lg text-xs font-bold text-emerald-950 flex items-start gap-2 transition cursor-pointer border border-emerald-200/90 bg-emerald-50/50 my-0.5"
                                                    title="Inform influencer that their video is approved and upload date, time & buying link will be shared very soon"
                                                  >
                                                    <span className="text-sm mt-0.5">✅</span>
                                                    <div className="min-w-0 flex-1">
                                                      <div className="flex items-center gap-1.5">
                                                        <span className="font-extrabold text-emerald-950 truncate">
                                                          {whatsAppLanguage === 'as' ? "ভিডিঅ' অনুমোদিত (লিংক আৰু সময় শীঘ্ৰেই)" : "Video Approved (Date, Time & Link Soon)"}
                                                        </span>
                                                        <span className="text-[9px] bg-emerald-600 text-white px-1 py-0.2 rounded font-black uppercase shadow-2xs">
                                                          {whatsAppLanguage === 'as' ? "অনুমোদিত" : "Approved"}
                                                        </span>
                                                      </div>
                                                      <p className="text-[10px] text-emerald-800 font-normal leading-tight mt-0.5 truncate">
                                                        {whatsAppLanguage === 'as'
                                                          ? "ভিডিঅ' অনুমোদিত হৈছে; তাৰিখ, সময় আৰু ক্ৰয় লিংক শীঘ্ৰেই দিয়া হ'ব"
                                                          : "Video is approved; upload date, time & buying link coming soon"}
                                                      </p>
                                                    </div>
                                                  </button>

                                                  {/* Option: Office Hours (10 AM - 6 PM) & Video Feedback Notice */}
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      setActiveWhatsAppMenuTaskId(null);
                                                      handleDirectSend(officeHoursFeedbackMsg);
                                                    }}
                                                    className="w-full text-left px-2 py-1.5 hover:bg-amber-50 rounded-lg text-xs font-bold text-amber-950 flex items-start gap-2 transition cursor-pointer border border-amber-200/80 bg-amber-50/40 my-0.5"
                                                    title="Notify creator about office hours (10 AM - 6 PM), after-hours/Sunday timing, feedback tomorrow, and personal reply"
                                                  >
                                                    <span className="text-sm mt-0.5">⏰</span>
                                                    <div className="min-w-0 flex-1">
                                                      <div className="flex items-center gap-1.5">
                                                        <span className="font-extrabold text-amber-950 truncate">
                                                          {whatsAppLanguage === 'as' ? "অফিচ সময় আৰু ফিডবেক জাননী" : "Office Hours & Feedback Notice"}
                                                        </span>
                                                        <span className="text-[9px] bg-amber-600 text-white px-1 py-0.2 rounded font-black uppercase shadow-2xs">
                                                          {isTodaySunday 
                                                            ? (whatsAppLanguage === 'as' ? "দেওবাৰ বন্ধ" : "Sunday Off")
                                                            : "10AM-6PM"}
                                                        </span>
                                                      </div>
                                                      <p className="text-[10px] text-amber-800 font-normal leading-tight mt-0.5 truncate">
                                                        {whatsAppLanguage === 'as'
                                                          ? "১০ AM - ৬ PM অফিচ, কাইলৈ দলীয় ফিডবেক; ব্যক্তিগত উত্তৰ উপলব্ধ"
                                                          : "10 AM - 6 PM office, team feedback tomorrow; personal reply now"}
                                                      </p>
                                                    </div>
                                                  </button>

                                                  {/* Option 4: Brief & Guidelines */}
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      setActiveWhatsAppMenuTaskId(null);
                                                      handleDirectSend(guidelinesMsg);
                                                    }}
                                                    className="w-full text-left px-2 py-1.5 hover:bg-amber-50 rounded-lg text-xs font-bold text-amber-900 flex items-start gap-2 transition cursor-pointer"
                                                  >
                                                    <span className="text-sm mt-0.5">📋</span>
                                                    <div className="min-w-0 flex-1">
                                                      <span className="font-extrabold text-amber-950 truncate block">
                                                        {whatsAppLanguage === 'as' ? "গাইডলাইন আৰু টকিং পইণ্ট" : "Guidelines Reminder"}
                                                      </span>
                                                      <p className="text-[10px] text-gray-500 font-normal leading-tight mt-0.5 truncate">
                                                        {whatsAppLanguage === 'as' ? "মুখ্য পইণ্ট আৰু লিংকসমূহ মনত পেলাওক" : "Talking points & brief"}
                                                      </p>
                                                    </div>
                                                  </button>

                                                  {/* Option 5: Send Payment Details */}
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      setActiveWhatsAppMenuTaskId(null);
                                                      handleDirectSend(paymentMsg);
                                                    }}
                                                    className="w-full text-left px-2 py-1.5 hover:bg-emerald-50 rounded-lg text-xs font-bold text-emerald-900 flex items-start gap-2 transition cursor-pointer"
                                                  >
                                                    <span className="text-sm mt-0.5">💳</span>
                                                    <div className="min-w-0 flex-1">
                                                      <span className="font-extrabold text-emerald-950 truncate block">
                                                        {whatsAppLanguage === 'as' ? "পেমেন্টৰ তথ্য প্ৰেৰণ" : "Send Payment Details"}
                                                      </span>
                                                      <p className="text-[10px] text-gray-500 font-normal leading-tight mt-0.5 truncate">
                                                        {whatsAppLanguage === 'as' ? `₹${taskAmt.toLocaleString()} পেমেন্টৰ সবিশেষ` : `Payment clearance ₹${taskAmt.toLocaleString()}`}
                                                      </p>
                                                    </div>
                                                  </button>

                                                  {/* Option: Send Influencer Checklist of Related Video Product on PDF format */}
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      setActiveWhatsAppMenuTaskId(null);
                                                      handleDownloadAndSendChecklistPdf(task, matchedInf, influencerName, deliverableProductName, whatsAppLanguage, true);
                                                    }}
                                                    className="w-full text-left px-2 py-1.5 hover:bg-rose-50 rounded-lg text-xs font-bold text-rose-900 flex items-start gap-2 transition cursor-pointer border border-rose-100 bg-rose-50/50 my-0.5"
                                                    title="Download Influencer Checklist PDF and send to creator via WhatsApp"
                                                  >
                                                    <span className="text-sm mt-0.5">📄</span>
                                                    <div className="min-w-0 flex-1">
                                                      <div className="flex items-center gap-1.5">
                                                        <span className="font-extrabold text-rose-950 truncate">
                                                          {whatsAppLanguage === 'as' ? "ইনফ্লুৱেন্সাৰ চেক-লিষ্ট (PDF)" : "Send Checklist (PDF)"}
                                                        </span>
                                                        <span className="text-[9px] bg-rose-500 text-white px-1.5 py-0.2 rounded font-black uppercase shadow-2xs">
                                                          PDF
                                                        </span>
                                                      </div>
                                                      <p className="text-[10px] text-rose-700/80 font-normal leading-tight mt-0.5 truncate">
                                                        {whatsAppLanguage === 'as' 
                                                          ? `${deliverableProductName || 'প্ৰডাক্ট'} ৰ PDF চেক-লিষ্ট ডাউনল'ড আৰু প্ৰেৰণ` 
                                                          : `Send ${deliverableProductName || 'product'} checklist PDF`}
                                                      </p>
                                                    </div>
                                                  </button>

                                                  {/* Option: Video Correction / Edit Request (AI) */}
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      setActiveWhatsAppMenuTaskId(null);
                                                      const initialFeedback = DEFAULT_CORRECTION_SAMPLE_TEXT;
                                                      const initialText = getVideoCorrectionWhatsAppText(
                                                        influencerName,
                                                        deliverableProductName,
                                                        initialFeedback,
                                                        whatsAppLanguage,
                                                        false
                                                      );
                                                      setWhatsAppModalData({
                                                        task,
                                                        influencer: matchedInf,
                                                        influencerName,
                                                        productName: deliverableProductName,
                                                        releaseDate: scheduledDate,
                                                        uploadDate: task.releaseDate || task.deadline || scheduledDate,
                                                        uploadTime: task.uploadTime || task.scheduledTime || matchedInf?.preferredTime || matchedInf?.preferredUploadTime || '6:00 PM',
                                                        buyingLink: task.buyingLink || '',
                                                        facebookDescLink: task.facebookDescLink || '',
                                                        facebookPinCommentLink: task.facebookPinCommentLink || '',
                                                        instagramBioLink: task.instagramBioLink || '',
                                                        instagramWishlink: task.instagramWishlink || '',
                                                        youtubeDescLink: task.youtubeDescLink || '',
                                                        activeLinkTab: 'all',
                                                        selectedTemplate: 'video_correction',
                                                        customText: initialText,
                                                        correctionFeedbackText: initialFeedback,
                                                        correctionScreenshot: null,
                                                        correctionScreenshotName: null,
                                                        correctionTone: 'polite',
                                                        statusLabel,
                                                        sampleSent: !!task.sampleSent,
                                                        sampleOrderDate: task.orderDate || '',
                                                        courierName: taskCourier,
                                                        trackingId: taskTracking,
                                                        language: whatsAppLanguage,
                                                        amount: taskAmt,
                                                        paymentDetails: task.paymentDetails || ''
                                                      });
                                                    }}
                                                    className="w-full text-left px-2 py-1.5 hover:bg-amber-50 rounded-lg text-xs font-bold text-amber-900 flex items-start gap-2 transition cursor-pointer border border-amber-200 bg-amber-50/50 my-0.5"
                                                    title="Generate AI video correction or edit request message"
                                                  >
                                                    <span className="text-sm mt-0.5">✂️</span>
                                                    <div className="min-w-0 flex-1">
                                                      <div className="flex items-center gap-1.5">
                                                        <span className="font-extrabold text-amber-950 truncate">
                                                          {whatsAppLanguage === 'as' ? "ভিডিঅ' এডিট অনুৰোধ (AI)" : "Video Correction / Edit (AI)"}
                                                        </span>
                                                        <span className="text-[9px] bg-amber-500 text-white px-1.5 py-0.2 rounded font-black uppercase shadow-2xs flex items-center gap-0.5">
                                                          <Sparkles className="w-2 h-2" />
                                                          <span>AI Edit</span>
                                                        </span>
                                                      </div>
                                                      <p className="text-[10px] text-amber-800/80 font-normal leading-tight mt-0.5 truncate">
                                                        {whatsAppLanguage === 'as' 
                                                          ? "টেক্সট বা স্ক্ৰীনশ্বট দি এডিট বা সালসলনিৰ বাৰ্তা তৈয়াৰ কৰক" 
                                                          : "Input screenshot or text to request video edit"}
                                                      </p>
                                                    </div>
                                                  </button>

                                                  {/* Option 6: Preview & Customize */}
                                                  <div className="pt-1 mt-1 border-t border-gray-100">
                                                    <button
                                                      type="button"
                                                      onClick={() => {
                                                        setActiveWhatsAppMenuTaskId(null);
                                                        const initialTemplate = task.sampleSent ? 'sample_sent_tracking' : 'upcoming';
                                                        const initialText = resolveDeliverableTemplateText(
                                                          initialTemplate,
                                                          whatsAppLanguage,
                                                          influencerName,
                                                          deliverableProductName,
                                                          scheduledDate,
                                                          task.orderDate,
                                                          taskAmt,
                                                          task.paymentDetails || '',
                                                          task.videoId ? String(task.videoId) : undefined,
                                                          task.releaseDate || task.deadline || scheduledDate,
                                                          task.uploadTime || task.scheduledTime || matchedInf?.preferredTime || matchedInf?.preferredUploadTime || '6:00 PM',
                                                          task.buyingLink || '',
                                                          task.facebookDescLink || '',
                                                          task.facebookPinCommentLink || '',
                                                          task.instagramBioLink || '',
                                                          task.instagramWishlink || '',
                                                          task.youtubeDescLink || '',
                                                          taskCourier,
                                                          taskTracking
                                                        );
                                                        setWhatsAppModalData({
                                                          task,
                                                          influencer: matchedInf,
                                                          influencerName,
                                                          productName: deliverableProductName,
                                                          releaseDate: scheduledDate,
                                                          uploadDate: task.releaseDate || task.deadline || scheduledDate,
                                                          uploadTime: task.uploadTime || task.scheduledTime || matchedInf?.preferredTime || matchedInf?.preferredUploadTime || '6:00 PM',
                                                          buyingLink: task.buyingLink || '',
                                                          facebookDescLink: task.facebookDescLink || '',
                                                          facebookPinCommentLink: task.facebookPinCommentLink || '',
                                                          instagramBioLink: task.instagramBioLink || '',
                                                          instagramWishlink: task.instagramWishlink || '',
                                                          youtubeDescLink: task.youtubeDescLink || '',
                                                          activeLinkTab: 'all',
                                                          selectedTemplate: initialTemplate,
                                                          customText: initialText,
                                                          statusLabel,
                                                          sampleSent: !!task.sampleSent,
                                                          sampleOrderDate: task.orderDate || '',
                                                          courierName: taskCourier,
                                                          trackingId: taskTracking,
                                                          language: whatsAppLanguage,
                                                          amount: taskAmt,
                                                          paymentDetails: task.paymentDetails || ''
                                                        });
                                                      }}
                                                      className="w-full text-center px-2 py-1 bg-gray-50 hover:bg-gray-100 rounded-lg text-[11px] font-bold text-gray-700 transition cursor-pointer flex items-center justify-center gap-1.5"
                                                    >
                                                      <Pencil className="w-3 h-3 text-gray-500" />
                                                      <span>{whatsAppLanguage === 'as' ? "বাৰ্তা চাব আৰু সলনি কৰিবলৈ..." : "Preview & Customize..."}</span>
                                                    </button>
                                                  </div>
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })()}
                                        {matchedInf && (
                                          <div className="relative">
                                            <button
                                              type="button"
                                              onClick={() => {
                                                if (editingNoteForInfluencerId === matchedInf.id) {
                                                  setEditingNoteForInfluencerId(null);
                                                } else {
                                                  setTempInfluencerNote(matchedInf.notes || '');
                                                  setEditingNoteForInfluencerId(matchedInf.id);
                                                }
                                              }}
                                              className={`peer p-1.5 rounded-full border transition-colors cursor-pointer flex items-center justify-center shadow-xs ${
                                                matchedInf.notes 
                                                  ? 'bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100' 
                                                  : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100 hover:text-gray-600'
                                              }`}
                                              title={matchedInf.notes ? "View/Edit Influencer Note" : "Add Note for Influencer"}
                                            >
                                              <StickyNote className="w-3.5 h-3.5" />
                                            </button>
                                            {matchedInf.notes && (
                                              <div className="absolute left-1/2 -translate-x-1/2 bottom-[120%] mb-1 w-56 bg-white border border-amber-200 p-2.5 rounded-xl shadow-xl opacity-0 peer-hover:opacity-100 pointer-events-none transition-all duration-200 z-50 text-left text-[10px] text-gray-700 font-medium whitespace-pre-wrap leading-relaxed shadow-amber-900/10 scale-95 peer-hover:scale-100">
                                                {matchedInf.notes}
                                                <div className="absolute left-1/2 -translate-x-1/2 top-full w-2 h-2 bg-white border-b border-r border-amber-200 rotate-45 -mt-[5px]" />
                                              </div>
                                            )}
                                          </div>
                                        )}
                                        {!hasValidVideoLinks && (
                                          <button
                                            type="button"
                                            onClick={() => onUpdateTask && onUpdateTask(task.id, { readyToUpload: !task.readyToUpload })}
                                            className={`p-1.5 rounded-full border transition-colors cursor-pointer flex items-center justify-center shadow-xs ${
                                              task.readyToUpload 
                                                ? 'bg-yellow-100 text-yellow-700 border-yellow-300 hover:bg-yellow-200' 
                                                : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100 hover:text-gray-600'
                                            }`}
                                            title={task.readyToUpload ? "Mark as Not Ready" : "Mark as Ready to Upload"}
                                          >
                                            <UploadCloud className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                        {!hasValidVideoLinks && task.status !== 'Completed' && !task.readyToUpload && !task.sampleSent && !task.needsSample && (
                                          <button
                                            type="button"
                                            onClick={() => onUpdateTask && onUpdateTask(task.id, { needsSample: true })}
                                            className="p-1.5 rounded-full bg-orange-50 text-orange-400 border border-orange-200 hover:bg-orange-100 transition-colors cursor-pointer flex items-center justify-center shadow-xs"
                                            title="Mark as Needs Sample"
                                          >
                                            <Package className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                        {!hasValidVideoLinks && task.status !== 'Completed' && !task.readyToUpload && task.needsSample && !task.sampleSent && (
                                          <>
                                            <button
                                              type="button"
                                              onClick={() => onUpdateTask && onUpdateTask(task.id, { needsSample: false })}
                                              className="p-1.5 rounded-full bg-orange-600 text-white border border-orange-600 hover:bg-orange-700 transition-colors cursor-pointer flex items-center justify-center shadow-xs"
                                              title="Needs Sample"
                                            >
                                              <PackageCheck className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setSamplePromptTaskId(task.id);
                                                setSamplePromptCost(task.sampleCost ? String(task.sampleCost) : '');
                                                setSamplePromptOrderId(task.orderId || '');
                                                setSamplePromptOrderDate(task.orderDate || new Date().toISOString().slice(0, 10));
                                                setSamplePromptCourier((task as any).courierName || (task as any).courier || '');
                                                setSamplePromptTrackingId((task as any).trackingId || (task as any).trackingNo || '');
                                              }}
                                              className="p-1.5 rounded-full bg-orange-100 text-orange-600 border border-orange-500 hover:bg-orange-200 transition-colors cursor-pointer flex items-center justify-center shadow-xs animate-pulse"
                                              title="Mark as Sample Sent & Add Courier / Tracking Details"
                                            >
                                              <Truck className="w-3.5 h-3.5" />
                                            </button>
                                          </>
                                        )}
                                        {!hasValidVideoLinks && task.status !== 'Completed' && !task.readyToUpload && task.sampleSent && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setSamplePromptTaskId(task.id);
                                              setSamplePromptCost(task.sampleCost ? String(task.sampleCost) : '');
                                              setSamplePromptOrderId(task.orderId || '');
                                              setSamplePromptOrderDate(task.orderDate || new Date().toISOString().slice(0, 10));
                                              setSamplePromptCourier((task as any).courierName || (task as any).courier || '');
                                              setSamplePromptTrackingId((task as any).trackingId || (task as any).trackingNo || '');
                                            }}
                                            className="p-1.5 rounded-full bg-orange-600 text-white border border-orange-600 hover:bg-orange-700 transition-colors flex items-center justify-center shadow-xs cursor-pointer"
                                            title={`Sample Sent via ${(task as any).courierName || 'Courier'}. Click to view or edit Courier & Tracking.`}
                                          >
                                            <Truck className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                        {((task.status !== 'Completed' && !task.readyToUpload) || (hasValidVideoLinks && isNewlyCompleted)) && task.status !== 'Cancelled' && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setCancelingTaskId(task.id);
                                              setCancelReasonStr('');
                                            }}
                                            className="p-1.5 rounded-full bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 hover:text-rose-700 transition-colors cursor-pointer flex items-center justify-center shadow-xs"
                                            title="Cancel Task"
                                          >
                                            <XCircle className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                        {task.status !== 'Completed' && !task.readyToUpload && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setEditingTaskData({
                                                id: task.id,
                                                title: task.title,
                                                influencerId: task.influencerId,
                                                remuneration: task.remuneration,
                                                deadline: task.deadline || (!task.readyToUpload && task.status !== 'Completed' && task.status !== 'Cancelled' ? `${selectedYear}-${selectedMonth}-01` : ''),
                                                sampleCost: task.sampleCost || null
                                              });
                                            }}
                                            className="p-1.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 hover:text-blue-700 transition-colors cursor-pointer flex items-center justify-center shadow-xs"
                                            title="Edit Task Details"
                                          >
                                            <Pencil className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                        {task.status !== 'Completed' && !task.readyToUpload && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setDeletingTaskId(task.id);
                                            }}
                                            className="p-1.5 rounded-full bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 hover:text-red-700 transition-colors cursor-pointer flex items-center justify-center shadow-xs"
                                            title="Delete Task Permanently"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Middle: Calendar schedule & status dates */}
                                <div className="space-y-1 text-indigo-700 min-w-[200px]">
                                  <div className="flex items-center gap-2 font-mono">
                                    <span className="text-[10px] text-indigo-400">Planned Deadline:</span>
                                    {(() => {
                                      let dateClasses = "font-bold px-1.5 py-0.5 rounded text-[11px] border focus:outline-none focus:ring-1 focus:ring-indigo-400 cursor-pointer ";
                                      if ((!hasValidVideoLinks && task.status !== 'Completed' && task.status !== 'Cancelled') && task.deadline) {
                                        const localToday = new Date();
                                        const todayStr = localToday.getFullYear() + "-" + String(localToday.getMonth() + 1).padStart(2, '0') + "-" + String(localToday.getDate()).padStart(2, '0');
                                        const d1 = new Date(todayStr + "T12:00:00Z");
                                        const d2 = new Date(task.deadline + "T12:00:00Z");
                                        const diffDays = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
                                        
                                        if (diffDays === 1) {
                                          dateClasses += "bg-emerald-500 text-white border-emerald-600 shadow-[0_0_8px_rgba(16,185,129,0.5)]";
                                        } else if (diffDays <= 0) {
                                          dateClasses += "bg-red-600 text-white border-red-700 shadow-[0_0_8px_rgba(220,38,38,0.5)]";
                                        } else {
                                          dateClasses += "bg-indigo-500 text-white border-indigo-600";
                                        }
                                      } else {
                                        dateClasses += "bg-indigo-500 text-white border-indigo-600";
                                      }

                                      const defaultAwaitingDate = `${selectedYear}-${selectedMonth}-01`;
                                      const displayDeadline = task.deadline || (!task.readyToUpload && task.status !== 'Completed' && task.status !== 'Cancelled' ? defaultAwaitingDate : '');
                                      
                                      const hasLink2 = !!(task.videoLink1 || task.videoLink2 || task.videoLink3); const hasDate2 = !!(task.releaseDate); return (task.status === 'Completed' || hasLink2) && hasLink2 ? (
                                        <span className={dateClasses}>
                                          {task.deadline ? toDisplayDate(task.deadline) : 'unplanned'}
                                        </span>
                                      ) : (
                                        <input 
                                          type="date"
                                          className={dateClasses}
                                          value={displayDeadline}
                                          onChange={(e) => onUpdateTask && onUpdateTask(task.id, { deadline: e.target.value })}
                                          title="Edit Planned Deadline"
                                        />
                                      );
                                    })()}
                                  </div>
                                  <div className="flex items-center flex-wrap gap-2 font-mono">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-indigo-500">Release Publication:</span>
                                    <strong className={`font-black border px-2 py-0.5 rounded text-xs tracking-tight shadow-xs ${
                                      !hasValidVideoLinks 
                                        ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-60 font-semibold'
                                        : task.releaseDate 
                                          ? 'bg-emerald-600 text-white border-emerald-700' 
                                          : 'bg-white text-indigo-400 border-indigo-100/50 italic font-normal'
                                    }`}
                                      title={!hasValidVideoLinks ? 'Add a video link first to unlock' : undefined}
                                    >
                                      {!hasValidVideoLinks ? 'Locked' : (task.releaseDate ? toDisplayDate(task.releaseDate) : 'Not uploaded')}
                                    </strong>
                                    {hasValidVideoLinks && task.uploadTime && (
                                      <strong className="font-black text-xs text-fuchsia-950 bg-fuchsia-100 border border-fuchsia-300 px-2 py-0.5 rounded shadow-2xs flex items-center gap-1">
                                        <Clock className="w-3 h-3 text-fuchsia-700 shrink-0" />
                                        {task.uploadTime}
                                      </strong>
                                    )}
                                  </div>
                                </div>

                                {/* Right: Single Deliverable Pay metrics and Proof urls */}
                                <div className="flex flex-col md:items-end gap-1 font-mono min-w-[180px]">
                                  <div className="text-right flex items-center justify-end gap-2">
                                    {task.sampleSent ? (
                                      <div className="flex flex-col items-end">
                                        <span className="text-[9px] bg-orange-600 text-white border border-orange-700 px-1.5 py-0.5 rounded font-black tracking-wide uppercase shadow-[inset_0_1px_rgba(255,255,255,0.5)]">
                                          Sample Sent
                                        </span>
                                        {task.orderDate && (
                                          <span className="text-[8px] text-orange-600 font-semibold mt-0.5" title="Dispatch / Sending Date">{task.orderDate ? toDisplayDate(task.orderDate) : ''}</span>
                                        )}
                                      </div>
                                    ) : null}
                                    <div>
                                      <span className="text-[10px] text-indigo-400">Sponsorship pay:</span>
                                      <span className="font-bold text-indigo-950 ml-1.5 text-xs">
                                        ₹{(task.remuneration || 0).toLocaleString()}
                                      </span>
                                    </div>
                                  </div>
                                  {task.sampleCost && task.sampleCost > 0 ? (
                                    <div className="text-right text-[10px] text-purple-600 font-semibold">
                                      + ₹{task.sampleCost.toLocaleString()} ship cost
                                    </div>
                                  ) : null}
                                  {task.mediaRightAmount && task.mediaRightAmount > 0 ? (
                                    <div className="text-right text-[10px] text-fuchsia-600 font-semibold">
                                      + ₹{task.mediaRightAmount.toLocaleString()} media right
                                    </div>
                                  ) : null}

                                  {/* Verification status / URL assets */}
                                  <div className="mt-1">
                                    {hasValidVideoLinks ? (
                                      <div className="flex flex-wrap gap-1 md:justify-end">
                                        {[task.videoLink1, task.videoLink2, task.videoLink3].filter(Boolean).map((link, linkIdx) => {
                                          const recentReleaseDiff = task.releaseDate ? (new Date().getTime() - new Date(task.releaseDate).getTime()) / (1000 * 3600 * 24) : null;
                                          const isNewlyCompleted = recentReleaseDiff !== null && recentReleaseDiff >= -1 && recentReleaseDiff <= 2;
                                          return (
                                          <React.Fragment key={linkIdx}>
                                            <a
                                              href={link}
                                              target="_blank"
                                              rel="noreferrer"
                                              className={`inline-flex items-center gap-1 text-[9px] font-black tracking-tight px-1.5 py-0.5 rounded shadow-sm border transition cursor-pointer select-none ${
                                                isNewlyCompleted
                                                  ? 'bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 border-green-400 text-white animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.6)]'
                                                  : 'bg-gradient-to-r from-sky-500 to-indigo-500 hover:from-sky-600 hover:to-indigo-600 text-white border-indigo-400'
                                              }`}
                                              title={`Watch Verified Video Asset ${linkIdx + 1}`}
                                            >
                                              <PlayCircle className="w-3 h-3 text-white" />
                                              <span>Watch {linkIdx + 1}</span>
                                              <ExternalLink className="w-2.5 h-2.5 text-white/70" />
                                            </a>
                                          </React.Fragment>
                                        )})}
                                        <button
                                          onClick={() => {
                                            setPlanningNextMonthTaskId(task.id);
                                            setNextMonthDeadline('');
                                            setNextMonthProduct(prodName);
                                          }}
                                          className="px-2 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 text-[9px] font-black rounded shadow-sm transition flex items-center gap-1 uppercase tracking-tight"
                                          title="Plan a new video for this creator for next month"
                                        >
                                          <CalendarPlus className="w-3 h-3" />
                                          NEXT PLAN
                                        </button>
                                        <button
                                          onClick={() => {
                                            setPlanningNextMonthTaskId(task.id);
                                            const d = new Date();
                                            d.setMonth(d.getMonth() + 1);
                                            setNextMonthDeadline(d.toISOString().split('T')[0]);
                                            setNextMonthProduct(prodName);
                                          }}
                                          className="px-2 py-1 bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200 text-[9px] font-black rounded shadow-sm transition flex items-center gap-1 uppercase tracking-tight"
                                          title="Preset a new video plan for next month"
                                        >
                                          <CalendarPlus className="w-3 h-3" />
                                          NEXT MONTH
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="flex flex-col sm:flex-row items-end sm:items-center gap-3">
                                        {task.readyToUpload && (
                                          <button
                                            onClick={() => {
                                              setEditingVideoLinksTaskId(task.id);
                                              setTempVideoLinks({
                                                link1: task.videoLink1 || '',
                                                link2: task.videoLink2 || '',
                                                link3: task.videoLink3 || '',
                                                shortIoLink: task.shortIoLink || '',
                                                releaseDate: task.releaseDate || '',
                                                videoId: task.videoId || ''
                                              });
                                            }}
                                            className="px-3 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-[10px] sm:text-xs font-bold rounded-lg shadow-sm transition flex items-center gap-1.5 uppercase tracking-wide border border-indigo-400"
                                            title="Click to insert video URLs directly into this task"
                                          >
                                            <UploadCloud className="w-3.5 h-3.5" />
                                            Upload Links
                                          </button>
                                        )}
                                        <div className={`flex items-center gap-2 text-xs sm:text-sm font-black uppercase tracking-widest px-3 py-1.5 border-[3px] rounded-lg animate-pulse ${
                                          task.readyToUpload
                                            ? 'bg-yellow-100 text-yellow-900 border-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.6)]'
                                            : 'bg-red-100 text-red-900 border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.6)]'
                                        }`}>
                                          <div className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full animate-ping ${
                                            task.readyToUpload ? 'bg-yellow-600' : 'bg-red-600'
                                          }`} />
                                          <span className="opacity-70 mr-1">#{displaySlNo}</span>
                                          <span>{task.readyToUpload ? `READY TO UPLOAD` : `AWAITING RELEASE`}</span>
                                        </div>
                                        {!task.readyToUpload && (
                                          <div className="flex gap-2">
                                            <button
                                              onClick={() => {
                                                setEditingTaskData({
                                                id: task.id,
                                                title: task.title,
                                                influencerId: task.influencerId,
                                                remuneration: task.remuneration,
                                                deadline: task.deadline || (!task.readyToUpload && task.status !== 'Completed' && task.status !== 'Cancelled' ? `${selectedYear}-${selectedMonth}-01` : ''),
                                                sampleCost: task.sampleCost || null
                                              });
                                              }}
                                              className="px-2 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 font-black rounded-lg shadow-sm transition flex items-center gap-1 uppercase tracking-tight"
                                              title="Edit Task Details"
                                            >
                                              <Pencil className="w-4 h-4" />
                                            </button>
                                            <button
                                              onClick={() => {
                                                setDeletingTaskId(task.id);
                                              }}
                                              className="px-2 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 font-black rounded-lg shadow-sm transition flex items-center gap-1 uppercase tracking-tight"
                                              title="Delete Task"
                                            >
                                              <Trash2 className="w-4 h-4" />
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                </div>

                                {/* Influencer Note Viewer / Editor */}
                                {matchedInf && editingNoteForInfluencerId === matchedInf.id && (
                                  <div className="bg-amber-50/50 border-t border-amber-100 p-4 pt-3 flex flex-col gap-2 relative">
                                    <div className="flex justify-between items-center">
                                      <h4 className="text-[10px] font-bold text-amber-800 uppercase tracking-wider font-mono flex items-center gap-1.5">
                                        <StickyNote className="w-3.5 h-3.5" />
                                        {influencerName}&apos;s Internal Note
                                      </h4>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const dateStamp = new Date().toLocaleDateString('en-GB') + ' ' + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) + ' - ';
                                          setTempInfluencerNote(prev => prev ? prev + '\n' + dateStamp : dateStamp);
                                        }}
                                        className="text-[9px] font-bold font-mono text-amber-700 bg-amber-100 hover:bg-amber-200 px-2 py-1 rounded transition"
                                      >
                                        + Add Date Stamp
                                      </button>
                                    </div>
                                    <textarea
                                      value={tempInfluencerNote}
                                      onChange={(e) => setTempInfluencerNote(e.target.value)}
                                      placeholder="Leave a private note about this creator, shipping instructions, negotiation terms, or future remarks..."
                                      className="w-full text-xs p-2 rounded-lg border border-amber-200 bg-white shadow-inner focus:outline-none focus:ring-2 focus:ring-amber-500 font-sans min-h-[60px] text-gray-700"
                                    />
                                    <div className="flex justify-end gap-2 mt-1">
                                      <button
                                        type="button"
                                        onClick={() => setEditingNoteForInfluencerId(null)}
                                        className="px-3 py-1 text-[10px] font-bold uppercase transition bg-white text-gray-600 border border-gray-200 hover:bg-gray-100 rounded-md"
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (onUpdateInfluencer) {
                                            onUpdateInfluencer(matchedInf.id, { notes: tempInfluencerNote });
                                          }
                                          setEditingNoteForInfluencerId(null);
                                        }}
                                        className="px-3 py-1 text-[10px] font-bold uppercase transition bg-amber-500 hover:bg-amber-600 text-white shadow-xs rounded-md"
                                      >
                                        Save Note
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {/* Task Video Links Editor */}
                                {editingVideoLinksTaskId === task.id && (
                                  <div className="bg-indigo-50/50 border-t border-indigo-100 p-4 flex flex-col gap-3 relative">
                                    <div className="flex justify-between items-center">
                                      <h4 className="text-[10px] font-bold text-indigo-800 uppercase tracking-wider font-mono flex items-center gap-1.5">
                                        <Film className="w-3.5 h-3.5" />
                                        Upload Video Links
                                      </h4>
                                    </div>
                                    <div className="space-y-2">
                                      <input
                                        type="text"
                                        value={tempVideoLinks.videoId}
                                        onChange={(e) => setTempVideoLinks(prev => ({ ...prev, videoId: e.target.value }))}
                                        placeholder="Video ID (e.g. VID104)"
                                        className="w-full text-xs p-2 rounded border border-indigo-200 bg-white shadow-inner focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono font-bold"
                                        title="Video ID"
                                      />
                                      <input
                                        type="date"
                                        value={tempVideoLinks.releaseDate}
                                        onChange={(e) => setTempVideoLinks(prev => ({ ...prev, releaseDate: e.target.value }))}
                                        className="w-full text-xs p-2 rounded border border-indigo-200 bg-white shadow-inner focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans mt-2"
                                        title="Release Publication Date"
                                      />
                                      <input
                                        type="url"
                                        value={tempVideoLinks.link1}
                                        onChange={(e) => setTempVideoLinks(prev => ({ ...prev, link1: e.target.value }))}
                                        placeholder="Video Link 1 (e.g., https://instagram.com/...)"
                                        className="w-full text-xs p-2 rounded border border-indigo-200 bg-white shadow-inner focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans"
                                      />
                                      <input
                                        type="url"
                                        value={tempVideoLinks.link2}
                                        onChange={(e) => setTempVideoLinks(prev => ({ ...prev, link2: e.target.value }))}
                                        placeholder="Video Link 2 (Optional)"
                                        className="w-full text-xs p-2 rounded border border-indigo-200 bg-white shadow-inner focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans"
                                      />
                                      <input
                                        type="url"
                                        value={tempVideoLinks.link3}
                                        onChange={(e) => setTempVideoLinks(prev => ({ ...prev, link3: e.target.value }))}
                                        placeholder="Video Link 3 (Optional)"
                                        className="w-full text-xs p-2 rounded border border-indigo-200 bg-white shadow-inner focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans"
                                      />
                                      <input
                                        type="url"
                                        value={tempVideoLinks.shortIoLink}
                                        onChange={(e) => setTempVideoLinks(prev => ({ ...prev, shortIoLink: e.target.value }))}
                                        placeholder="Short.io Track Link (e.g., https://link.brand.com/...)"
                                        className="w-full text-xs p-2 rounded border border-fuchsia-200 bg-white shadow-inner focus:outline-none focus:ring-1 focus:ring-fuchsia-500 font-sans mt-2"
                                      />
                                    </div>
                                    <div className="flex justify-end gap-2 mt-1">
                                      <button
                                        type="button"
                                        onClick={() => setEditingVideoLinksTaskId(null)}
                                        className="px-3 py-1.5 text-[10px] font-bold uppercase transition bg-white text-gray-600 border border-gray-200 hover:bg-gray-100 rounded-md"
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (onUpdateTask) {
                                            const hasLink3 = !!(tempVideoLinks.link1?.trim() || tempVideoLinks.link2?.trim() || tempVideoLinks.link3?.trim()); const hasDate3 = !!(tempVideoLinks.releaseDate?.trim()); const newStatus = hasLink3 ? 'Completed' :
                                                              ((!hasLink3) && task.status === 'Completed' ? 'Pending' : task.status);
                                            onUpdateTask(task.id, {
                                              videoLink1: tempVideoLinks.link1,
                                              videoLink2: tempVideoLinks.link2,
                                              videoLink3: tempVideoLinks.link3,
                                              shortIoLink: tempVideoLinks.shortIoLink,
                                              releaseDate: tempVideoLinks.releaseDate,
                                              status: newStatus as any,
                                              videoId: tempVideoLinks.videoId || undefined
                                            });
                                          }
                                          setEditingVideoLinksTaskId(null);
                                        }}
                                        className="px-4 py-1.5 text-[10px] sm:text-xs font-bold uppercase transition bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm rounded-md flex items-center gap-1.5"
                                      >
                                        <Save className="w-3.5 h-3.5" />
                                        Save Links
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {/* Task Editor */}
                                {editingTaskData?.id === task.id && (
                                  <div className="bg-indigo-50/50 border-t border-indigo-100 p-4 flex flex-col gap-3 relative">
                                    <h4 className="text-[10px] font-bold text-indigo-800 uppercase tracking-wider font-mono flex items-center gap-1.5 mb-1">
                                      <Pencil className="w-3.5 h-3.5" />
                                      Edit Scheduled Task
                                    </h4>
                                    
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                      <div className="flex flex-col gap-1">
                                        <label className="text-[10px] font-bold text-indigo-900 uppercase">Product Name</label>
                                        <select
                                          value={editingTaskData?.title}
                                          onChange={e => setEditingTaskData(prev => prev ? { ...prev, title: e.target.value } : null)}
                                          className="text-xs px-2 py-1.5 rounded border border-indigo-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans"
                                        >
                                          {products.map(p => (
                                            <option key={p.name} value={p.name}>{p.name}</option>
                                          ))}
                                          {!products.some(p => p.name === editingTaskData?.title) && (
                                            <option value={editingTaskData?.title}>{editingTaskData?.title}</option>
                                          )}
                                        </select>
                                      </div>
                                      <div className="flex flex-col gap-1">
                                        <label className="text-[10px] font-bold text-indigo-900 uppercase">Influencer</label>
                                         <select
                                           value={editingTaskData?.influencerId || ""}
                                           onChange={(e) => setEditingTaskData(prev => prev ? { ...prev, influencerId: e.target.value } : null)}
                                           className="text-xs px-2 py-1.5 rounded border border-indigo-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white font-medium text-slate-800 cursor-pointer"
                                         >
                                           <option value="">-- Select Influencer --</option>
                                           {[...influencers]
                                             .sort((a, b) => (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" }))
                                             .map(inf => (
                                               <option key={inf.id} value={inf.id}>{inf.name}</option>
                                             ))
                                           }
                                         </select>
                                      </div>
                                      <div className="flex flex-col gap-1">
                                        <label className="text-[10px] font-bold text-indigo-900 uppercase">Sponsorship (₹)</label>
                                        <input
                                          type="number"
                                          value={editingTaskData?.remuneration}
                                          onChange={e => setEditingTaskData(prev => prev ? { ...prev, remuneration: parseFloat(e.target.value) || 0 } : null)}
                                          className="text-xs px-2 py-1.5 rounded border border-indigo-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                                        />
                                      </div>
                                      <div className="flex flex-col gap-1">
                                        <label className="text-[10px] font-bold text-indigo-900 uppercase">Sample Cost (₹)</label>
                                        <input
                                          type="number"
                                          value={editingTaskData?.sampleCost === null ? '' : editingTaskData?.sampleCost}
                                          onChange={e => setEditingTaskData(prev => prev ? { ...prev, sampleCost: e.target.value ? parseFloat(e.target.value) : null } : null)}
                                          className="text-xs px-2 py-1.5 rounded border border-indigo-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                                          placeholder="N/A"
                                        />
                                      </div>
                                      <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-4">
                                        <label className="text-[10px] font-bold text-indigo-900 uppercase">Planned Deadline</label>
                                        <input
                                          type="date"
                                          value={editingTaskData?.deadline}
                                          onChange={e => setEditingTaskData(prev => prev ? { ...prev, deadline: e.target.value } : null)}
                                          className="text-xs px-2 py-1.5 rounded border border-indigo-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                                        />
                                      </div>
                                    </div>
                                    
                                    <div className="flex justify-end gap-2 mt-2">
                                      <button
                                        type="button"
                                        onClick={() => setEditingTaskData(null)}
                                        className="px-3 py-1.5 text-[10px] font-bold uppercase transition bg-white text-gray-600 border border-gray-200 hover:bg-gray-100 rounded-md"
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (onUpdateTask) {
                                            onUpdateTask(task.id, {
                                              title: editingTaskData?.title,
                                              influencerId: editingTaskData?.influencerId,
                                              remuneration: editingTaskData?.remuneration,
                                              deadline: editingTaskData?.deadline,
                                              sampleCost: editingTaskData?.sampleCost
                                            });
                                          }
                                          setEditingTaskData(null);
                                        }}
                                        className="px-4 py-1.5 text-[10px] font-black uppercase transition bg-indigo-600 hover:bg-indigo-700 text-white rounded-md shadow-sm flex items-center gap-1.5"
                                      >
                                        <Save className="w-3.5 h-3.5" /> Save Changes
                                      </button>
                                    </div>
                                  </div>
                                )}
                                
                                {/* Task Cancel Reason Editor */}
                                {cancelingTaskId === task.id && (
                                  <div className="bg-rose-50/50 border-t border-rose-100 p-4 flex flex-col gap-3 relative">
                                    <div className="flex justify-between items-center">
                                      <h4 className="text-[10px] font-bold text-rose-800 uppercase tracking-wider font-mono flex items-center gap-1.5">
                                        <XCircle className="w-3.5 h-3.5" />
                                        Task Cancellation Reason
                                      </h4>
                                    </div>
                                    <textarea
                                      value={cancelReasonStr}
                                      onChange={(e) => setCancelReasonStr(e.target.value)}
                                      placeholder="Reason for cancellation..."
                                      className="w-full text-xs p-2 rounded border border-rose-200 bg-white shadow-inner focus:outline-none focus:ring-1 focus:ring-rose-500 font-sans min-h-[60px]"
                                    />
                                    <div className="flex justify-end gap-2 mt-1">
                                      <button
                                        type="button"
                                        onClick={() => setCancelingTaskId(null)}
                                        className="px-3 py-1.5 text-[10px] font-bold uppercase transition bg-white text-gray-600 border border-gray-200 hover:bg-gray-100 rounded-md"
                                      >
                                        Back
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (onUpdateTask) {
                                            onUpdateTask(task.id, {
                                              status: 'Cancelled',
                                              cancelReason: cancelReasonStr
                                            });
                                          }
                                          setCancelingTaskId(null);
                                        }}
                                        className="px-4 py-1.5 text-[10px] sm:text-xs font-bold uppercase transition bg-rose-600 hover:bg-rose-700 text-white shadow-sm rounded-md flex items-center gap-1.5"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        Confirm Cancel
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {/* Task Deletion Confirmation */}
                                {deletingTaskId === task.id && (
                                  <div className="bg-red-100 border-t-2 border-red-500 p-4 flex flex-col gap-3 relative shadow-inner">
                                    <div className="flex justify-between items-center">
                                      <h4 className="text-sm font-black text-red-700 uppercase tracking-wider flex items-center gap-2">
                                        <Trash2 className="w-5 h-5 animate-pulse" />
                                        Confirm Permanent Deletion
                                      </h4>
                                    </div>
                                    <p className="text-red-800 text-xs font-medium">
                                      Are you absolutely sure you want to delete this scheduled task permanently? This action cannot be undone.
                                    </p>
                                    <div className="flex justify-end gap-2 mt-2">
                                      <button
                                        type="button"
                                        onClick={() => setDeletingTaskId(null)}
                                        className="px-4 py-2 text-xs font-bold uppercase transition bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 rounded-lg shadow-sm"
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (onDeleteTask) onDeleteTask(task.id);
                                          setDeletingTaskId(null);
                                        }}
                                        className="px-5 py-2 text-xs font-black uppercase transition bg-red-600 hover:bg-red-700 text-white shadow-md rounded-lg flex items-center gap-2"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                        Yes, Delete
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {/* Sample Sent Editor */}
                                {samplePromptTaskId === task.id && (
                                  <div className="bg-orange-50/50 border-t border-orange-100 p-4 flex flex-col gap-3 relative">
                                    <div className="flex flex-col gap-2">
                                      <h4 className="text-[10px] font-bold text-orange-800 uppercase tracking-wider font-mono flex items-center gap-1.5">
                                        <PackageCheck className="w-3.5 h-3.5" />
                                        Sample Dispatch Details (Courier & Tracking)
                                      </h4>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                                        <div>
                                          <label className="text-[10px] text-orange-700 font-bold mb-1 block">Courier Partner Name</label>
                                          <input 
                                            type="text"
                                            value={samplePromptCourier}
                                            onChange={(e) => setSamplePromptCourier(e.target.value)}
                                            placeholder="E.g. Delhivery, Blue Dart..."
                                            className="w-full text-xs p-2 rounded border border-orange-200 bg-white shadow-inner focus:outline-none focus:ring-1 focus:ring-orange-500 font-sans"
                                          />
                                          <div className="flex flex-wrap gap-1 mt-1">
                                            {['Delhivery', 'Blue Dart', 'DTDC', 'India Post', 'Shadowfax', 'Xpressbees', 'Ekart'].map(c => (
                                              <button
                                                key={c}
                                                type="button"
                                                onClick={() => setSamplePromptCourier(c)}
                                                className="text-[9px] px-1.5 py-0.2 rounded bg-orange-100 hover:bg-orange-200 text-orange-900 border border-orange-200 font-medium cursor-pointer"
                                              >
                                                {c}
                                              </button>
                                            ))}
                                          </div>
                                        </div>
                                        <div>
                                          <label className="text-[10px] text-orange-700 font-bold mb-1 block">Tracking ID / AWB Number</label>
                                          <input 
                                            type="text"
                                            value={samplePromptTrackingId}
                                            onChange={(e) => setSamplePromptTrackingId(e.target.value)}
                                            placeholder="Enter AWB or tracking no..."
                                            className="w-full text-xs p-2 rounded border border-orange-200 bg-white shadow-inner focus:outline-none focus:ring-1 focus:ring-orange-500 font-mono"
                                          />
                                        </div>
                                        <div>
                                          <label className="text-[10px] text-orange-700 font-bold mb-1 block">Dispatch / Order Date</label>
                                          <input 
                                            type="date"
                                            value={samplePromptOrderDate}
                                            onChange={(e) => setSamplePromptOrderDate(e.target.value)}
                                            className="w-full text-xs p-2 rounded border border-orange-200 bg-white shadow-inner focus:outline-none focus:ring-1 focus:ring-orange-500 font-mono"
                                          />
                                        </div>
                                        <div>
                                          <label className="text-[10px] text-orange-700 font-bold mb-1 block">Sample Cost (₹)</label>
                                          <input 
                                            type="number"
                                            value={samplePromptCost}
                                            onChange={(e) => setSamplePromptCost(e.target.value)}
                                            placeholder="Enter cost..."
                                            className="w-full text-xs p-2 rounded border border-orange-200 bg-white shadow-inner focus:outline-none focus:ring-1 focus:ring-orange-500 font-mono"
                                          />
                                        </div>
                                        <div>
                                          <label className="text-[10px] text-orange-700 font-bold mb-1 block">Order ID (Store Ref)</label>
                                          <input 
                                            type="text"
                                            value={samplePromptOrderId}
                                            onChange={(e) => setSamplePromptOrderId(e.target.value)}
                                            placeholder="E.g. #ORD-123"
                                            className="w-full text-xs p-2 rounded border border-orange-200 bg-white shadow-inner focus:outline-none focus:ring-1 focus:ring-orange-500 font-mono"
                                          />
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex justify-end gap-2 mt-1">
                                      <button
                                        type="button"
                                        onClick={() => setSamplePromptTaskId(null)}
                                        className="px-3 py-1.5 text-[10px] font-bold uppercase transition bg-white text-gray-600 border border-gray-200 hover:bg-gray-100 rounded-md"
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (onUpdateTask) {
                                            onUpdateTask(task.id, {
                                              sampleSent: true,
                                              needsSample: false,
                                              sampleCost: Number(samplePromptCost) || 0,
                                              orderId: samplePromptOrderId,
                                              orderDate: samplePromptOrderDate,
                                              courierName: samplePromptCourier,
                                              trackingId: samplePromptTrackingId
                                            } as any);
                                          }
                                          setSamplePromptTaskId(null);
                                        }}
                                        className="px-4 py-1.5 text-[10px] sm:text-xs font-bold uppercase transition bg-orange-600 hover:bg-orange-700 text-white shadow-sm rounded-md flex items-center gap-1.5 cursor-pointer"
                                      >
                                        <Save className="w-3.5 h-3.5" />
                                        Confirm Sent & Save
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {/* Next Month Planning Editor */}
                                {planningNextMonthTaskId === task.id && (
                                  <div className="bg-emerald-50/50 border-t border-emerald-100 p-4 flex flex-col gap-3 relative">
                                    <div className="flex justify-between items-center">
                                      <h4 className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider font-mono flex items-center gap-1.5">
                                        <CalendarPlus className="w-3.5 h-3.5" />
                                        Plan Video For Next Month
                                      </h4>
                                    </div>
                                    <div className="space-y-3">
                                      <div>
                                        <label className="block text-[10px] font-bold text-emerald-700 uppercase mb-1">Product</label>
                                        <select
                                          value={nextMonthProduct}
                                          onChange={(e) => setNextMonthProduct(e.target.value)}
                                          className="w-full text-xs p-2 rounded border border-emerald-200 bg-white shadow-inner focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
                                        >
                                          <option value="">Select a product...</option>
                                          {products.map(p => (
                                            <option key={p.name} value={p.name}>{p.name}</option>
                                          ))}
                                        </select>
                                      </div>
                                      <div>
                                        <label className="block text-[10px] font-bold text-emerald-700 uppercase mb-1">Planned Deadline</label>
                                        <input
                                          type="date"
                                          value={nextMonthDeadline}
                                          onChange={(e) => setNextMonthDeadline(e.target.value)}
                                          className="w-full text-xs p-2 rounded border border-emerald-200 bg-white shadow-inner focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
                                        />
                                      </div>
                                    </div>
                                    <div className="flex justify-end gap-2 mt-1">
                                      <button
                                        type="button"
                                        onClick={() => setPlanningNextMonthTaskId(null)}
                                        className="px-3 py-1.5 text-[10px] font-bold uppercase transition bg-white text-gray-600 border border-gray-200 hover:bg-gray-100 rounded-md"
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        type="button"
                                        disabled={!nextMonthProduct || !nextMonthDeadline}
                                        onClick={() => {
                                          if (onCreateTask) {
                                            const newTask: Omit<Task, 'id'> = {
                                              campaignId: task.campaignId,
                                              influencerId: task.influencerId,
                                              title: nextMonthProduct,
                                              type: task.type || 'Video Post',
                                              deadline: nextMonthDeadline,
                                              status: 'Pending',
                                              remuneration: task.remuneration || 0,
                                              platform: task.platform || 'Instagram',
                                              sampleCost: 0,
                                              mediaRightAmount: task.mediaRightAmount || 0,
                                            };
                                            onCreateTask(newTask);
                                            
                                            // Ensure the newly created task doesn't disappear from view: switch dashboard scope to the new target month immediately
                                            const newParts = nextMonthDeadline.split('-');
                                            if (newParts.length >= 2) {
                                              if (setSelectedYear) setSelectedYear(newParts[0]);
                                              if (setSelectedMonth) setSelectedMonth(newParts[1]);
                                            }
                                          }
                                          setPlanningNextMonthTaskId(null);
                                        }}
                                        className="px-4 py-1.5 text-[10px] sm:text-xs font-bold uppercase transition bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm rounded-md flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                                      >
                                        <Check className="w-3.5 h-3.5" />
                                        Create Plan
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>

                      {/* Cancelled List */}
                      {productScheduledTasks.filter(t => t.status === 'Cancelled').length > 0 && (
                        <div className="mt-4 border-t border-rose-100 bg-rose-50/30">
                          <div className="bg-rose-100/50 p-2 border-b border-rose-100">
                            <h4 className="text-[10px] font-black uppercase text-rose-800 tracking-wider font-mono flex items-center gap-1.5 ml-2">
                              <XCircle className="w-3.5 h-3.5" />
                              Cancelled Planner List
                            </h4>
                          </div>
                          <div className="divide-y divide-rose-100/50">
                            {productScheduledTasks.filter(t => t.status === 'Cancelled').map((task) => {
                              const matchedInf = influencers.find(inf => inf.id === task.influencerId);
                              const influencerName = matchedInf?.name || (task.influencerId ? `Assigned Content Creator (Missing/Deleted: ${task.influencerId})` : 'Assigned Content Creator (No ID)');
                              const stepIdx = productScheduledTasks.indexOf(task);
                              return (
                                <div key={task.id} className="p-3 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 text-xs opacity-75 grayscale-[0.3]">
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono font-bold uppercase text-[10px] text-rose-700 line-through">
                                        Deliverable #{stepIdx + 1} ({getVideoDisplayId(task, stepIdx)})
                                      </span>
                                      <span className="px-1.5 py-0.5 rounded text-[9px] font-black font-mono uppercase border bg-rose-100 text-rose-800 border-rose-200">
                                        Cancelled
                                      </span>
                                    </div>
                                    <div className="font-bold text-gray-800 flex items-center gap-1">
                                      {editingInfluencerNameId === matchedInf?.id ? (
                                        <div className="flex items-center gap-2 relative z-10">
                                          <input
                                            type="text"
                                            autoFocus
                                            value={editingInfluencerNameValue}
                                            onChange={e => setEditingInfluencerNameValue(e.target.value)}
                                            onKeyDown={e => {
                                              if (e.key === 'Enter') {
                                                if (onUpdateInfluencer && matchedInf) {
                                                  onUpdateInfluencer(matchedInf.id, { name: editingInfluencerNameValue.trim() || 'Assigned Content Creator' });
                                                }
                                                setEditingInfluencerNameId(null);
                                              } else if (e.key === 'Escape') {
                                                setEditingInfluencerNameId(null);
                                              }
                                            }}
                                            className="text-xs px-2 py-1 rounded border border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans"
                                          />
                                          <button
                                            onClick={(e) => {
                                              e.preventDefault();
                                              e.stopPropagation();
                                              if (onUpdateInfluencer && matchedInf) {
                                                onUpdateInfluencer(matchedInf.id, { name: editingInfluencerNameValue.trim() || 'Assigned Content Creator' });
                                              }
                                              setEditingInfluencerNameId(null);
                                            }}
                                            className="p-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
                                            title="Save Name"
                                          >
                                            <Save className="w-3.5 h-3.5" />
                                          </button>
                                          <button
                                            onClick={(e) => {
                                              e.preventDefault();
                                              e.stopPropagation();
                                              setEditingInfluencerNameId(null);
                                            }}
                                            className="p-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-700 shadow-sm"
                                            title="Cancel"
                                          >
                                            <XCircle className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      ) : (
                                        <>
                                          <span className="bg-blue-600 text-white px-2 py-0.5 rounded-md shadow-sm border border-blue-700/50 font-bold tracking-tight"><strong>{influencerName}</strong></span>
                                          {matchedInf && onUpdateInfluencer && (
                                            <button
                                              onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                setEditingInfluencerNameValue(influencerName);
                                                setEditingInfluencerNameId(matchedInf.id);
                                              }}
                                              className="ml-1 p-0.5 text-gray-400 hover:text-gray-600 transition-colors opacity-50 hover:opacity-100"
                                              title="Edit Influencer Name"
                                            >
                                              <Pencil className="w-3 h-3" />
                                            </button>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex-1 border-l-2 border-l-rose-400 bg-white/60 rounded-md p-2 border border-rose-100/50 mt-2 md:mt-0 flex w-full max-w-lg items-center gap-3">
                                    <div className="flex-1 text-[10px] italic text-rose-900 overflow-hidden text-ellipsis">
                                      <span className="font-bold not-italic">Reason:</span> {task.cancelReason || 'No reason provided'}
                                    </div>
                                    <button
                                      onClick={() => {
                                        if (onUpdateTask) {
                                          const newStatus = (task.videoLink1?.trim() || task.videoLink2?.trim() || task.videoLink3?.trim()) ? 'Completed' : 'Pending';
                                          onUpdateTask(task.id, {
                                            status: newStatus,
                                            cancelReason: ''
                                          });
                                        }
                                      }}
                                      className="shrink-0 px-2.5 py-1.5 bg-white border border-rose-200 text-rose-800 hover:bg-rose-50 hover:text-rose-900 rounded-md transition shadow-sm font-bold uppercase tracking-wider text-[10px] flex items-center gap-1.5"
                                      title="Retrieve / Restore Task"
                                    >
                                      <RotateCcw className="w-3.5 h-3.5" />
                                      Retrieve
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </div>

      {showCompletedVideosModal && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Video className="w-5 h-5 text-indigo-600" />
                Completed Videos for {selectedMonth} {selectedYear}
              </h2>
              <button onClick={() => setShowCompletedVideosModal(false)} className="p-1 text-gray-500 hover:text-gray-900 bg-gray-200 hover:bg-gray-300 rounded-full transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              {runningMonthCompletedTasks.length === 0 ? (
                <div className="text-center py-10 text-gray-500 font-medium">
                  No completed videos found for this month.
                </div>
              ) : (
                <div className="space-y-3">
                  {runningMonthCompletedTasks.map((t, idx) => {
                    const inf = influencers.find(i => i.id === t.influencerId);
                    return (
                      <div key={t.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 border border-gray-100 bg-gray-50 rounded-xl gap-2 hover:bg-indigo-50/30 transition">
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-gray-900 truncate flex items-center gap-2">
                            <span className="text-xs text-gray-400 font-mono w-5">{idx + 1}.</span>
                            {inf?.name || 'Unknown Influencer'}
                          </div>
                          <div className="text-xs text-gray-500 font-mono mt-1 pl-7 truncate" title={getVideoDisplayId(t)}>
                            ID: {getVideoDisplayId(t)} {t.title ? `• ${t.title}` : ''}
                          </div>
                        </div>
                        <div className="shrink-0 text-sm font-bold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100 flex items-center gap-1.5">
                          <Calendar className="w-4 h-4" />
                          {t.releaseDate ? toDisplayDate(t.releaseDate) : t.deadline ? toDisplayDate(t.deadline) : 'No Date'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      <button
        onClick={() => setShowCompletedVideosModal(true)}
        className="fixed bottom-24 right-6 z-40 bg-indigo-600 hover:bg-indigo-700 text-white p-4 rounded-full shadow-lg hover:shadow-xl transition-all transform hover:scale-105 group flex items-center justify-center border border-indigo-500"
        title="View Completed Videos for Selected Month"
      >
        <Video className="w-6 h-6" />
        <span className="absolute -top-2 -right-2 bg-rose-500 text-white text-[10px] font-black w-6 h-6 flex items-center justify-center rounded-full shadow-sm border border-rose-400">
          {runningMonthCompletedTasks.length}
        </span>
      </button>

      {/* WhatsApp Message Selection Modal for Awaiting Release & Video Deliverables */}
      {whatsAppModalData && (
        <div className="fixed inset-0 bg-black/60 z-[110] flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-emerald-200 w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-white/20 rounded-xl">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-white">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-black tracking-tight text-white flex items-center gap-2">
                    <span>Send WhatsApp Message</span>
                    <span className="text-[10px] uppercase font-bold bg-white/20 px-2 py-0.5 rounded-full">
                      {whatsAppModalData.statusLabel}
                    </span>
                  </h3>
                  <p className="text-xs text-emerald-100 font-medium">
                    Inform creator about upcoming video release or send follow-up
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setWhatsAppModalData(null)}
                className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Recipient and Deliverable Metadata Bar */}
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-slate-900">{whatsAppModalData.influencerName}</span>
                <span className="text-slate-400">•</span>
                <span className="text-slate-600 font-mono">
                  {formatDisplayPhone(whatsAppModalData.influencer?.mobile || (whatsAppModalData.task as any)?.influencerMobile || '') || 'No Mobile Number'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="bg-indigo-100 text-indigo-800 font-bold px-2 py-0.5 rounded text-[11px]">
                  {whatsAppModalData.productName || 'Deliverable'}
                </span>
                <span className="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded text-[11px] flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {toDisplayDate(whatsAppModalData.releaseDate) || 'Target Date'}
                </span>
                {whatsAppModalData.sampleSent && (
                  <span className="bg-orange-100 text-orange-850 font-extrabold px-2 py-0.5 rounded text-[11px] flex items-center gap-1 border border-orange-200">
                    <Package className="w-3 h-3 text-orange-600" />
                    <span>Sample Dispatched {whatsAppModalData.sampleOrderDate ? `(${toDisplayDate(whatsAppModalData.sampleOrderDate)})` : ''}</span>
                  </span>
                )}
              </div>
            </div>

            {/* Body: Template Cards & Editable Preview */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {/* Language Selector: English vs Assamese (অসমীয়া) */}
              <div className="flex items-center justify-between bg-slate-100/90 px-3.5 py-2.5 rounded-xl border border-slate-200 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-black text-slate-800">
                    {whatsAppModalData.language === 'as' ? "বাৰ্তাৰ ভাষা (Message Language):" : "Message Language:"}
                  </span>
                  {whatsAppModalData.language === 'as' && (
                    <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-full border border-emerald-300">
                      অসমীয়া সক্ৰিয় (Assamese)
                    </span>
                  )}
                </div>
                <div className="inline-flex rounded-lg bg-white p-0.5 shadow-xs border border-slate-200">
                  <button
                    type="button"
                    onClick={() => {
                      setWhatsAppLanguage('en');
                      safeLocalStorage.setItem('wa_msg_lang', 'en');
                      const newText = resolveDeliverableTemplateText(
                        whatsAppModalData.selectedTemplate,
                        'en',
                        whatsAppModalData.influencerName,
                        whatsAppModalData.productName,
                        whatsAppModalData.releaseDate,
                        whatsAppModalData.sampleOrderDate,
                        whatsAppModalData.amount,
                        whatsAppModalData.paymentDetails,
                        whatsAppModalData.task?.videoId,
                        whatsAppModalData.uploadDate,
                        whatsAppModalData.uploadTime,
                        whatsAppModalData.buyingLink,
                        whatsAppModalData.facebookDescLink,
                        whatsAppModalData.facebookPinCommentLink,
                        whatsAppModalData.instagramBioLink,
                        whatsAppModalData.instagramWishlink,
                        whatsAppModalData.youtubeDescLink,
                        whatsAppModalData.courierName,
                        whatsAppModalData.trackingId,
                        whatsAppModalData.correctionFeedbackText,
                        !!whatsAppModalData.correctionScreenshot,
                        whatsAppModalData.isSundayNotice
                      );
                      setWhatsAppModalData(prev => prev ? {
                        ...prev,
                        language: 'en',
                        customText: newText
                      } : null);
                    }}
                    className={`px-3 py-1 text-xs font-black rounded-md transition cursor-pointer flex items-center gap-1.5 ${
                      whatsAppModalData.language === 'en'
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    <span>🇬🇧 English</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setWhatsAppLanguage('as');
                      safeLocalStorage.setItem('wa_msg_lang', 'as');
                      const newText = resolveDeliverableTemplateText(
                        whatsAppModalData.selectedTemplate,
                        'as',
                        whatsAppModalData.influencerName,
                        whatsAppModalData.productName,
                        whatsAppModalData.releaseDate,
                        whatsAppModalData.sampleOrderDate,
                        whatsAppModalData.amount,
                        whatsAppModalData.paymentDetails,
                        whatsAppModalData.task?.videoId,
                        whatsAppModalData.uploadDate,
                        whatsAppModalData.uploadTime,
                        whatsAppModalData.buyingLink,
                        whatsAppModalData.facebookDescLink,
                        whatsAppModalData.facebookPinCommentLink,
                        whatsAppModalData.instagramBioLink,
                        whatsAppModalData.instagramWishlink,
                        whatsAppModalData.youtubeDescLink,
                        whatsAppModalData.courierName,
                        whatsAppModalData.trackingId,
                        whatsAppModalData.correctionFeedbackText,
                        !!whatsAppModalData.correctionScreenshot,
                        whatsAppModalData.isSundayNotice
                      );
                      setWhatsAppModalData(prev => prev ? {
                        ...prev,
                        language: 'as',
                        customText: newText
                      } : null);
                    }}
                    className={`px-3 py-1 text-xs font-black rounded-md transition cursor-pointer flex items-center gap-1.5 ${
                      whatsAppModalData.language === 'as'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-emerald-700 hover:bg-slate-50'
                    }`}
                  >
                    <span>🇮🇳 অসমীয়া (Assamese)</span>
                  </button>
                </div>
              </div>

              {/* Scheduled Upload Date & Scheduled Upload Time Control Bar */}
              <div className="bg-gradient-to-r from-emerald-50/80 via-teal-50/50 to-slate-50 border border-emerald-200/90 rounded-2xl p-3.5 shadow-2xs space-y-2.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1 bg-emerald-600 text-white rounded-lg shadow-2xs">
                      <Clock className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <span className="text-xs font-black text-slate-900 block leading-tight">
                        {whatsAppModalData.language === 'as' ? "নিৰ্ধাৰিত আপল'ড তাৰিখ আৰু সময় (Upload Schedule):" : "Scheduled Upload Date & Scheduled Upload Time:"}
                      </span>
                      <span className="text-[10px] text-slate-500 font-medium">
                        {whatsAppModalData.language === 'as' ? "বাৰ্তাত উল্লেখ হ'বলগীয়া ভিডিঅ' আপল'ডৰ দিন আৰু সময় ইয়াত সলনি কৰক" : "Easily add or edit the upload date and time shown in messages"}
                      </span>
                    </div>
                  </div>

                  {onUpdateTask && whatsAppModalData.task?.id && (
                    <button
                      type="button"
                      onClick={() => {
                        const effectiveDate = whatsAppModalData.uploadDate || whatsAppModalData.releaseDate;
                        const effectiveTime = whatsAppModalData.uploadTime || '6:00 PM';
                        onUpdateTask(whatsAppModalData.task.id, {
                          releaseDate: effectiveDate,
                          deadline: effectiveDate,
                          uploadTime: effectiveTime,
                          facebookDescLink: whatsAppModalData.facebookDescLink,
                          facebookPinCommentLink: whatsAppModalData.facebookPinCommentLink,
                          instagramBioLink: whatsAppModalData.instagramBioLink,
                          instagramWishlink: whatsAppModalData.instagramWishlink,
                          youtubeDescLink: whatsAppModalData.youtubeDescLink,
                          buyingLink: whatsAppModalData.buyingLink
                        });
                        globalToast.success(whatsAppModalData.language === 'as' ? "তাৰিখ, সময় আৰু লিংকসমূহ টাস্কত সংৰক্ষণ কৰা হ'ল!" : "Scheduled date, time & links saved to deliverable task!");
                      }}
                      className="text-[10px] font-black text-emerald-800 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1 shadow-2xs"
                      title="Save this scheduled date & time to the deliverable task"
                    >
                      <Save className="w-3 h-3" />
                      <span>{whatsAppModalData.language === 'as' ? "টাস্কত চেভ কৰক" : "Save to Task"}</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] font-bold text-slate-700 uppercase flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-emerald-600" />
                        <span>{whatsAppModalData.language === 'as' ? "আপল'ড তাৰিখ (Date Picker)" : "Scheduled Upload Date (Date Picker)"}</span>
                      </label>
                      <div className="flex items-center gap-1">
                        {(() => {
                          const now = new Date();
                          const fmt = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
                          const todayStr = fmt(now);
                          const tom = new Date(now); tom.setDate(tom.getDate() + 1);
                          const tomStr = fmt(tom);
                          return (
                            <>
                              <button
                                type="button"
                                onClick={() => handleUpdateDateAndTime(todayStr, whatsAppModalData.uploadTime || '6:00 PM')}
                                className="text-[9px] px-1.5 py-0.2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded font-semibold cursor-pointer"
                              >
                                Today
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateDateAndTime(tomStr, whatsAppModalData.uploadTime || '6:00 PM')}
                                className="text-[9px] px-1.5 py-0.2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded font-semibold cursor-pointer"
                              >
                                Tomorrow
                              </button>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                    <div className="relative">
                      <input
                        type="date"
                        value={toIsoDate(whatsAppModalData.uploadDate || whatsAppModalData.releaseDate)}
                        onChange={(e) => {
                          const val = e.target.value;
                          const display = toDisplayDate(val);
                          handleUpdateDateAndTime(display, whatsAppModalData.uploadTime || '6:00 PM');
                        }}
                        className="w-full text-xs font-mono font-bold bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none cursor-pointer shadow-inner"
                        title="Click to pick scheduled upload date"
                      />
                    </div>
                    {(whatsAppModalData.uploadDate || whatsAppModalData.releaseDate) && (
                      <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono mt-0.5 px-0.5">
                        <span>Formatted: <strong className="text-emerald-700">{toDisplayDate(whatsAppModalData.uploadDate || whatsAppModalData.releaseDate)}</strong></span>
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] font-bold text-slate-700 uppercase flex items-center gap-1">
                        <Clock className="w-3 h-3 text-emerald-600" />
                        <span>{whatsAppModalData.language === 'as' ? "আপল'ড সময় (Time Picker)" : "Scheduled Upload Time (Time Picker)"}</span>
                      </label>
                      <div className="flex items-center gap-1">
                        <span className={`text-[10px] font-mono font-black px-1.5 py-0.2 rounded border ${
                          isInfluencerPreferredTime(whatsAppModalData.uploadTime)
                            ? 'text-amber-900 bg-amber-100 border-amber-300'
                            : 'text-emerald-800 bg-emerald-100 border-emerald-200'
                        }`}>
                          {whatsAppModalData.uploadTime || '6:00 PM'}
                        </span>
                      </div>
                    </div>

                    {/* Mode Selector: Specific Time vs Influencer Preferred Time */}
                    <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 mb-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          const standardTime = whatsAppModalData.uploadTime && !isInfluencerPreferredTime(whatsAppModalData.uploadTime)
                            ? whatsAppModalData.uploadTime
                            : '6:00 PM';
                          handleUpdateDateAndTime(whatsAppModalData.uploadDate || whatsAppModalData.releaseDate || 'the scheduled date', standardTime);
                        }}
                        className={`flex-1 py-1 px-1.5 text-[10px] rounded-md font-bold transition cursor-pointer text-center ${
                          !isInfluencerPreferredTime(whatsAppModalData.uploadTime)
                            ? 'bg-white text-slate-900 shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        ⏰ {whatsAppModalData.language === 'as' ? "নিৰ্দিষ্ট সময় (Picker)" : "Specific Time (Picker)"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const preferredLabel = getPreferredTimeOption(whatsAppModalData.influencer, whatsAppModalData.task, whatsAppModalData.language);
                          handleUpdateDateAndTime(
                            whatsAppModalData.uploadDate || whatsAppModalData.releaseDate || 'the scheduled date',
                            preferredLabel
                          );
                        }}
                        className={`flex-1 py-1 px-1.5 text-[10px] rounded-md font-black transition cursor-pointer flex items-center justify-center gap-1 ${
                          isInfluencerPreferredTime(whatsAppModalData.uploadTime)
                            ? 'bg-amber-500 text-white shadow-2xs ring-1 ring-amber-400'
                            : 'text-amber-900 hover:bg-amber-100/60'
                        }`}
                        title="Click to select Influencer's preferred posting time"
                      >
                        <span>⭐</span>
                        <span>{whatsAppModalData.language === 'as' ? "ইনফ্লুৱেন্সাৰৰ সুবিধাৰ সময়" : "Influencer Preferred Time"}</span>
                      </button>
                    </div>

                    {/* Conditional display: Influencer Preferred Time Selector Card VS standard HTML time picker */}
                    {isInfluencerPreferredTime(whatsAppModalData.uploadTime) ? (
                      <div className="bg-amber-50/90 border border-amber-200 rounded-lg p-2 space-y-1.5 animate-in fade-in duration-100">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-amber-950 flex items-center gap-1">
                            <span>⭐</span>
                            <span>{whatsAppModalData.language === 'as' ? "ইনফ্লুৱেন্সাৰৰ সুবিধাৰ সময় নিৰ্বাচিত:" : "Influencer Preferred Time Active:"}</span>
                          </span>
                          <span className="text-[9px] font-mono text-amber-800 font-bold bg-amber-100 px-1.5 py-0.2 rounded border border-amber-300">
                            {whatsAppModalData.uploadTime}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 flex-wrap">
                          <button
                            type="button"
                            onClick={() => {
                              handleUpdateDateAndTime(
                                whatsAppModalData.uploadDate || whatsAppModalData.releaseDate || 'the scheduled date',
                                whatsAppModalData.language === 'as'
                                  ? "আপোনাৰ সুবিধা অনুসৰি সময় (Influencer's Preferred Time)"
                                  : "Influencer's Preferred Time (At your convenience)"
                              );
                            }}
                            className="px-2 py-0.5 rounded text-[10px] bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold cursor-pointer shadow-2xs"
                          >
                            {whatsAppModalData.language === 'as' ? "সুবিধাৰ সময় (Flexible)" : "At Convenience (Flexible)"}
                          </button>
                          {['6:00 PM', '7:30 PM', '8:00 PM', '9:00 PM'].map((slot) => (
                            <button
                              key={slot}
                              type="button"
                              onClick={() => {
                                const prefStr = whatsAppModalData.language === 'as'
                                  ? `${slot} (ইনফ্লুৱেন্সাৰৰ সুবিধা অনুসৰি)`
                                  : `${slot} (Influencer's Preferred Time)`;
                                if (whatsAppModalData.influencer?.id && onUpdateInfluencer) {
                                  onUpdateInfluencer(whatsAppModalData.influencer.id, { preferredTime: slot });
                                }
                                if (whatsAppModalData.task?.id && onUpdateTask) {
                                  onUpdateTask(whatsAppModalData.task.id, { influencerPreferredTime: slot, uploadTime: slot });
                                }
                                handleUpdateDateAndTime(
                                  whatsAppModalData.uploadDate || whatsAppModalData.releaseDate || 'the scheduled date',
                                  prefStr
                                );
                              }}
                              className="px-2 py-0.5 rounded text-[10px] bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold font-mono cursor-pointer shadow-2xs"
                            >
                              {slot}
                            </button>
                          ))}
                          <div className="flex items-center gap-1 bg-white border border-amber-300 rounded px-1.5 py-0.5 shadow-2xs">
                            <span className="text-[9px] font-bold text-amber-900">
                              {whatsAppModalData.language === 'as' ? "অন্য সময়:" : "Custom:"}
                            </span>
                            <input
                              type="time"
                              value={to24HourTime(whatsAppModalData.uploadTime || '7:30 PM')}
                              onChange={(e) => {
                                const time12 = to12HourTime(e.target.value);
                                const prefStr = whatsAppModalData.language === 'as'
                                  ? `${time12} (ইনফ্লুৱেন্সাৰৰ সুবিধা অনুসৰি)`
                                  : `${time12} (Influencer's Preferred Time)`;
                                if (whatsAppModalData.influencer?.id && onUpdateInfluencer) {
                                  onUpdateInfluencer(whatsAppModalData.influencer.id, { preferredTime: time12 });
                                }
                                if (whatsAppModalData.task?.id && onUpdateTask) {
                                  onUpdateTask(whatsAppModalData.task.id, { influencerPreferredTime: time12, uploadTime: time12 });
                                }
                                handleUpdateDateAndTime(
                                  whatsAppModalData.uploadDate || whatsAppModalData.releaseDate || 'the scheduled date',
                                  prefStr
                                );
                              }}
                              className="text-[10px] font-mono font-bold bg-transparent outline-none cursor-pointer text-amber-950"
                              title="Pick custom influencer preferred time"
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="relative">
                        <input
                          type="time"
                          value={to24HourTime(whatsAppModalData.uploadTime || '6:00 PM')}
                          onChange={(e) => {
                            const time12 = to12HourTime(e.target.value);
                            handleUpdateDateAndTime(
                              whatsAppModalData.uploadDate || whatsAppModalData.releaseDate || 'the scheduled date',
                              time12
                            );
                          }}
                          className="w-full text-xs font-mono font-bold bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none cursor-pointer shadow-inner"
                          title="Click to pick scheduled upload time"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Quick Time Picker Chips */}
                <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-emerald-100/80">
                  <span className="text-[10px] font-bold text-slate-500">
                    {whatsAppModalData.language === 'as' ? "দ্ৰুত সময়:" : "Quick Time Pick:"}
                  </span>

                  {/* Option to select Influencer preferred time */}
                  <div className="inline-flex items-center">
                    <button
                      type="button"
                      onClick={() => {
                        const preferredLabel = getPreferredTimeOption(whatsAppModalData.influencer, whatsAppModalData.task, whatsAppModalData.language);
                        handleUpdateDateAndTime(
                          whatsAppModalData.uploadDate || whatsAppModalData.releaseDate || 'the scheduled date',
                          preferredLabel
                        );
                      }}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer border flex items-center gap-1 shadow-2xs ${
                        isInfluencerPreferredTime(whatsAppModalData.uploadTime)
                          ? 'bg-amber-500 text-white border-amber-600 shadow-xs ring-1 ring-amber-400 font-extrabold'
                          : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300'
                      }`}
                      title="Select Influencer's preferred posting time"
                    >
                      <span>⭐</span>
                      <span>{whatsAppModalData.language === 'as' ? "ইনফ্লুৱেন্সাৰৰ সুবিধাৰ সময়" : "Influencer Preferred Time"}</span>
                    </button>
                  </div>


                  {['11:00 AM', '1:00 PM', '4:00 PM', '6:00 PM', '7:30 PM', '8:00 PM', '9:00 PM'].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => handleUpdateDateAndTime(whatsAppModalData.uploadDate || whatsAppModalData.releaseDate || 'the scheduled date', t)}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono transition cursor-pointer border ${
                        (whatsAppModalData.uploadTime || '6:00 PM') === t && !isInfluencerPreferredTime(whatsAppModalData.uploadTime)
                          ? 'bg-emerald-600 text-white border-emerald-700 shadow-2xs'
                          : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Template Selection Cards */}
              <div>
                <label className="text-[11px] font-black uppercase text-slate-500 tracking-wider block mb-2">
                  {whatsAppModalData.language === 'as' ? "বাৰ্তাৰ টেমপ্লেট বাছনি কৰক (Select Template)" : "Select Message Template"}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* Template 1: Inform About Upcoming Video (Highlighted) */}
                  <button
                    type="button"
                    onClick={() => {
                      const text = getUpcomingVideoWhatsAppText(whatsAppModalData.influencerName, whatsAppModalData.productName, whatsAppModalData.releaseDate, whatsAppModalData.language);
                      setWhatsAppModalData(prev => prev ? {
                        ...prev,
                        selectedTemplate: 'upcoming',
                        customText: text
                      } : null);
                    }}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                      whatsAppModalData.selectedTemplate === 'upcoming'
                        ? 'border-emerald-500 bg-emerald-50/80 shadow-xs ring-2 ring-emerald-500/20'
                        : 'border-slate-200 bg-white hover:border-emerald-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="font-extrabold text-xs text-emerald-950 flex items-center gap-1.5">
                        <span>📢</span>
                        <span>{whatsAppModalData.language === 'as' ? "আগন্তুক ভিডিঅ'ৰ জাননী" : "Inform About Upcoming Video"}</span>
                      </span>
                      <span className="bg-emerald-500 text-white text-[9px] font-black uppercase px-1.5 py-0.2 rounded-full">
                        {whatsAppModalData.language === 'as' ? "আগন্তুক" : "Upcoming"}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-snug">
                      {whatsAppModalData.language === 'as' 
                        ? `${toDisplayDate(whatsAppModalData.releaseDate) || 'নিৰ্ধাৰিত তাৰিখে'} ভিডিঅ' আপল'ডৰ জাননী আৰু ক্ৰিয়েটৰক ভিডিঅ' সাজু ৰাখিবলৈ জনাব`
                        : `Announce upcoming video release on ${toDisplayDate(whatsAppModalData.releaseDate) || 'the scheduled date'} and notify creator to keep video ready.`}
                    </p>
                  </button>

                  {/* Template Option 1: Video Upload Date, Time, Buying Link & Video Link (Description & Pin Comment) */}
                  <button
                    type="button"
                    onClick={() => {
                      const defaultTime = whatsAppModalData.uploadTime || "6:00 PM";
                      const defaultDate = whatsAppModalData.uploadDate || whatsAppModalData.releaseDate || "Today";
                      const text = getUploadScheduleWhatsAppText(
                        whatsAppModalData.influencerName,
                        whatsAppModalData.productName,
                        {
                          uploadDate: defaultDate,
                          uploadTime: defaultTime,
                          buyingLink: whatsAppModalData.buyingLink || "",
                          facebookDescLink: whatsAppModalData.facebookDescLink || "",
                          facebookPinCommentLink: whatsAppModalData.facebookPinCommentLink || "",
                          instagramBioLink: whatsAppModalData.instagramBioLink || "",
                          instagramWishlink: whatsAppModalData.instagramWishlink || "",
                          youtubeDescLink: whatsAppModalData.youtubeDescLink || "",
                          pinCommentOnly: false
                        },
                        whatsAppModalData.language as any
                      );
                      setWhatsAppModalData(prev => prev ? {
                        ...prev,
                        selectedTemplate: "schedule_upload",
                        uploadDate: defaultDate,
                        uploadTime: defaultTime,
                        customText: text
                      } : null);
                    }}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                      whatsAppModalData.selectedTemplate === "schedule_upload"
                        ? "border-violet-500 bg-violet-50/80 shadow-xs ring-2 ring-violet-500/20"
                        : "border-slate-200 bg-white hover:border-violet-300 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="font-extrabold text-xs text-violet-950 flex items-center gap-1.5">
                        <span>⏰</span>
                        <span>{whatsAppModalData.language === "as" ? "আপল'ড সময় আৰু ক্ৰয় লিংক (বিকল্প ১)" : "Upload Date/Time & Buying Link (Option 1)"}</span>
                      </span>
                      <span className="bg-violet-600 text-white text-[9px] font-black uppercase px-1.5 py-0.2 rounded-full">
                        {whatsAppModalData.language === "as" ? "বিকল্প ১" : "Option 1"}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-snug">
                      {whatsAppModalData.language === "as"
                        ? "ভিডিঅ' আপল'ডৰ তাৰিখ-সময়, ডেচক্ৰিপশ্বন/বায়' আৰু পিন কমেণ্টত ক্ৰয় লিংক দিয়া আৰু ভিডিঅ' লিংক তৎক্ষণাৎ প্ৰেৰণৰ বাৰ্তা"
                        : "Tell creator exact upload date/time, to include Buying Link in description/bio and pinned comment, and share live link."}
                    </p>
                  </button>

                  {/* Template Option 2: Video Upload Date/Time & Buying Link (Pin Comment Only) */}
                  <button
                    type="button"
                    onClick={() => {
                      const defaultTime = whatsAppModalData.uploadTime || "6:00 PM";
                      const defaultDate = whatsAppModalData.uploadDate || whatsAppModalData.releaseDate || "Today";
                      const text = getUploadScheduleWhatsAppText(
                        whatsAppModalData.influencerName,
                        whatsAppModalData.productName,
                        {
                          uploadDate: defaultDate,
                          uploadTime: defaultTime,
                          buyingLink: whatsAppModalData.buyingLink || "",
                          facebookDescLink: whatsAppModalData.facebookDescLink || "",
                          facebookPinCommentLink: whatsAppModalData.facebookPinCommentLink || "",
                          instagramBioLink: whatsAppModalData.instagramBioLink || "",
                          instagramWishlink: whatsAppModalData.instagramWishlink || "",
                          youtubeDescLink: whatsAppModalData.youtubeDescLink || "",
                          pinCommentOnly: true
                        },
                        whatsAppModalData.language as any
                      );
                      setWhatsAppModalData(prev => prev ? {
                        ...prev,
                        selectedTemplate: "schedule_upload_pin_only",
                        uploadDate: defaultDate,
                        uploadTime: defaultTime,
                        customText: text
                      } : null);
                    }}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                      whatsAppModalData.selectedTemplate === "schedule_upload_pin_only"
                        ? "border-purple-600 bg-purple-50/90 shadow-xs ring-2 ring-purple-500/20"
                        : "border-slate-200 bg-white hover:border-purple-300 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="font-extrabold text-xs text-purple-950 flex items-center gap-1.5">
                        <span>📌</span>
                        <span>{whatsAppModalData.language === "as" ? "আপল'ড সময় আৰু ক্ৰয় লিংক (বিকল্প ২: কেৱল পিন)" : "Upload Date/Time & Buying Link (Option 2: Pin Only)"}</span>
                      </span>
                      <span className="bg-purple-600 text-white text-[9px] font-black uppercase px-1.5 py-0.2 rounded-full">
                        {whatsAppModalData.language === "as" ? "বিকল্প ২" : "Pin Only"}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-snug">
                      {whatsAppModalData.language === "as"
                        ? "ভিডিঅ' আপল'ডৰ তাৰিখ-সময়, আৰু আমাৰ প্ৰদান কৰা লিংক আৰু সবিশেষ কেৱল পিন কমেণ্টতহে যোগ কৰাৰ বিশেষ নিৰ্দেশনা"
                        : "Tells creator upload date/time, and to add our provided link and product details ONLY on pinned comment."}
                    </p>
                  </button>

                  {/* Template: Advance Buying Link & Edit Review Submission */}
                  <button
                    type="button"
                    onClick={() => {
                      const defaultTime = whatsAppModalData.uploadTime || "6:00 PM";
                      const defaultDate = whatsAppModalData.uploadDate || whatsAppModalData.releaseDate || "Today";
                      const defaultLink = whatsAppModalData.buyingLink || "";
                      const text = getAdvanceLinkAndEditReviewWhatsAppText(
                        whatsAppModalData.influencerName,
                        whatsAppModalData.productName,
                        {
                          uploadDate: defaultDate,
                          uploadTime: defaultTime,
                          buyingLink: defaultLink
                        },
                        defaultTime,
                        defaultLink,
                        whatsAppModalData.language
                      );
                      setWhatsAppModalData(prev => prev ? {
                        ...prev,
                        selectedTemplate: "advance_link_edit_review",
                        uploadDate: defaultDate,
                        uploadTime: defaultTime,
                        buyingLink: defaultLink,
                        customText: text
                      } : null);
                    }}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                      whatsAppModalData.selectedTemplate === "advance_link_edit_review"
                        ? "border-amber-500 bg-amber-50/90 shadow-xs ring-2 ring-amber-500/20"
                        : "border-slate-200 bg-white hover:border-amber-300 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="font-extrabold text-xs text-amber-950 flex items-center gap-1.5">
                        <span>🔗</span>
                        <span>{whatsAppModalData.language === "as" ? "আগতীয়া লিংক আৰু এডিট জমা" : "Advance Link & Edit Submission"}</span>
                      </span>
                      <span className="bg-amber-600 text-white text-[9px] font-black uppercase px-1.5 py-0.2 rounded-full shadow-2xs">
                        {whatsAppModalData.language === "as" ? "আগতীয়া লিংক" : "Advance Link"}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-snug">
                      {whatsAppModalData.language === "as"
                        ? "এডিটেড ভিডিঅ' জমাৰ পূৰ্বেই ক্ৰয় লিংক প্ৰদান কৰক, কিন্তু পূৰ্বৰ এডিটিং নিৰ্দেশনা অনুসৰি এডিট কৰা আৰু আপল'ডৰ পূৰ্বে ফাইনেল ভিডিঅ' জমা দিয়াৰ চৰ্ত।"
                        : "Give buying link in advance + require video edit per previous notes & mandatory final submission before upload."}
                    </p>
                  </button>

                  {/* Template: Video Upload Reminder */}
                  <button
                    type="button"
                    onClick={() => {
                      const defaultTime = whatsAppModalData.uploadTime || "6:00 PM";
                      const defaultDate = whatsAppModalData.uploadDate || whatsAppModalData.releaseDate || "Today";
                      const text = getVideoUploadReminderWhatsAppText(
                        whatsAppModalData.influencerName,
                        whatsAppModalData.productName,
                        defaultDate,
                        defaultTime,
                        whatsAppModalData.buyingLink,
                        whatsAppModalData.language
                      );
                      setWhatsAppModalData(prev => prev ? {
                        ...prev,
                        selectedTemplate: 'video_upload_reminder',
                        uploadDate: defaultDate,
                        uploadTime: defaultTime,
                        customText: text
                      } : null);
                    }}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                      whatsAppModalData.selectedTemplate === 'video_upload_reminder'
                        ? 'border-sky-500 bg-sky-50/90 shadow-xs ring-2 ring-sky-500/20'
                        : 'border-slate-200 bg-white hover:border-sky-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="font-extrabold text-xs text-sky-950 flex items-center gap-1.5">
                        <Bell className="w-3.5 h-3.5 text-sky-600" />
                        <span>{whatsAppModalData.language === 'as' ? "ভিডিঅ' আপল'ডৰ সোঁৱৰণী" : "Video Upload Reminder"}</span>
                      </span>
                      <span className="bg-sky-600 text-white text-[9px] font-black uppercase px-1.5 py-0.2 rounded-full shadow-2xs flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        <span>{whatsAppModalData.language === 'as' ? "সোঁৱৰণী" : "Reminder"}</span>
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-snug">
                      {whatsAppModalData.language === 'as'
                        ? `${toDisplayDate(whatsAppModalData.uploadDate || whatsAppModalData.releaseDate) || 'নিৰ্ধাৰিত তাৰিখে'} ভিডিঅ' আপল'ড কৰিবলৈ আৰু লাইভ লিংক পঠিয়াবলৈ জৰুৰী সোঁৱৰণী বাৰ্তা`
                        : `Remind creator of scheduled upload on ${toDisplayDate(whatsAppModalData.uploadDate || whatsAppModalData.releaseDate) || 'the scheduled date'} & request live video link.`}
                    </p>
                  </button>

                  {/* Template: Sample Sent with Courier & Tracking ID */}
                  <button
                    type="button"
                    onClick={() => {
                      const text = getSampleDispatchedTrackingWhatsAppText(
                        whatsAppModalData.influencerName,
                        whatsAppModalData.productName,
                        whatsAppModalData.courierName,
                        whatsAppModalData.trackingId,
                        whatsAppModalData.sampleOrderDate || whatsAppModalData.releaseDate,
                        whatsAppModalData.language
                      );
                      setWhatsAppModalData(prev => prev ? {
                        ...prev,
                        selectedTemplate: 'sample_sent_tracking',
                        customText: text
                      } : null);
                    }}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                      whatsAppModalData.selectedTemplate === 'sample_sent_tracking'
                        ? 'border-teal-500 bg-teal-50/80 shadow-xs ring-2 ring-teal-500/20'
                        : 'border-slate-200 bg-white hover:border-teal-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="font-extrabold text-xs text-teal-950 flex items-center gap-1.5">
                        <span>🚚</span>
                        <span>{whatsAppModalData.language === 'as' ? "ছেম্পল প্ৰেৰণ (কুৰিয়াৰ আৰু ট্ৰেকিং)" : "Sample Sent (Courier & Tracking ID)"}</span>
                      </span>
                      <span className="bg-teal-600 text-white text-[9px] font-black uppercase px-1.5 py-0.2 rounded-full">
                        {whatsAppModalData.language === 'as' ? "কুৰিয়াৰ/ট্ৰেকিং" : "Courier/AWB"}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-snug">
                      {whatsAppModalData.language === 'as'
                        ? "প্ৰডাক্ট ছেম্পলটো কুৰিয়াৰ যোগে প্ৰেৰণ কৰা আৰু ট্ৰেকিং নম্বৰ দিয়াৰ বাৰ্তা প্ৰেৰণ কৰক"
                        : "Inform creator that product sample is dispatched via courier with tracking AWB number."}
                    </p>
                  </button>

                  {/* Template 2: Sample Received Check (New Feature for dispatched samples) */}
                  <button
                    type="button"
                    onClick={() => {
                      const text = getSampleReceivedWhatsAppText(whatsAppModalData.influencerName, whatsAppModalData.productName, whatsAppModalData.sampleOrderDate, whatsAppModalData.language);
                      setWhatsAppModalData(prev => prev ? {
                        ...prev,
                        selectedTemplate: 'sample_received',
                        customText: text
                      } : null);
                    }}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                      whatsAppModalData.selectedTemplate === 'sample_received'
                        ? 'border-orange-500 bg-orange-50/80 shadow-xs ring-2 ring-orange-500/20'
                        : 'border-slate-200 bg-white hover:border-orange-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="font-extrabold text-xs text-orange-950 flex items-center gap-1.5">
                        <span>📦</span>
                        <span>{whatsAppModalData.language === 'as' ? "ছেম্পল পোৱা নিশ্চিতকৰণ" : "Sample Received Check"}</span>
                      </span>
                      <span className="bg-orange-500 text-white text-[9px] font-black uppercase px-1.5 py-0.2 rounded-full">
                        {whatsAppModalData.language === 'as' ? "ছেম্পল" : "Sample Check"}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-snug">
                      {whatsAppModalData.language === 'as'
                        ? "প্ৰডাক্ট ছেম্পলটো ক্ৰিয়েটৰে সুৰক্ষিতভাৱে পালে নে নাই নিশ্চিত কৰিবলৈ সুধক"
                        : "Ask creator if they have safely received the dispatched product sample parcel."}
                    </p>
                  </button>

                  {/* Template 3: Video Preparation Follow-up */}
                  <button
                    type="button"
                    onClick={() => {
                      const text = getFollowUpWhatsAppText(whatsAppModalData.influencerName, whatsAppModalData.productName, whatsAppModalData.releaseDate, whatsAppModalData.language);
                      setWhatsAppModalData(prev => prev ? {
                        ...prev,
                        selectedTemplate: 'followup',
                        customText: text
                      } : null);
                    }}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                      whatsAppModalData.selectedTemplate === 'followup'
                        ? 'border-blue-500 bg-blue-50/80 shadow-xs ring-2 ring-blue-500/20'
                        : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="font-extrabold text-xs text-blue-950 flex items-center gap-1.5">
                        <span>📹</span>
                        <span>{whatsAppModalData.language === 'as' ? "ভিডিঅ' প্ৰস্তুতিৰ বুজ লওক" : "Preparation Follow-Up"}</span>
                      </span>
                      <span className="bg-blue-100 text-blue-800 text-[9px] font-black uppercase px-1.5 py-0.2 rounded-full">
                        {whatsAppModalData.language === 'as' ? "ফ'ল'আপ" : "Follow-Up"}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-snug">
                      {whatsAppModalData.language === 'as'
                        ? "ক্ৰিয়েটৰে প্ৰম'শ্বনেল ভিডিঅ'ৰ কাম আৰু প্ৰস্তুতি কেনে চলাইছে বুজ লওক"
                        : "Ask creator if they are currently preparing the promotion video for upload."}
                    </p>
                  </button>

                  {/* Template: Edited Video Ready Check */}
                  <button
                    type="button"
                    onClick={() => {
                      const text = getEditedVideoReadyCheckWhatsAppText(
                        whatsAppModalData.influencerName,
                        whatsAppModalData.productName,
                        whatsAppModalData.releaseDate,
                        whatsAppModalData.language
                      );
                      setWhatsAppModalData(prev => prev ? {
                        ...prev,
                        selectedTemplate: 'edited_video_ready_check',
                        customText: text
                      } : null);
                    }}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                      whatsAppModalData.selectedTemplate === 'edited_video_ready_check'
                        ? 'border-indigo-500 bg-indigo-50/90 shadow-xs ring-2 ring-indigo-500/20'
                        : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="font-extrabold text-xs text-indigo-950 flex items-center gap-1.5">
                        <span>🎬</span>
                        <span>{whatsAppModalData.language === 'as' ? "এডিটেড ভিডিঅ' সাজু নেকি?" : "Edited Video Ready?"}</span>
                      </span>
                      <span className="bg-indigo-600 text-white text-[9px] font-black uppercase px-1.5 py-0.2 rounded-full shadow-2xs">
                        {whatsAppModalData.language === 'as' ? "সাজু নেকি?" : "Ready?"}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-snug">
                      {whatsAppModalData.language === 'as'
                        ? "ক্ৰিয়েটৰক সোধক যে এডিটেড ভিডিঅ'ৰ কাম সম্পূৰ্ণ হৈ সাজু হৈছে নেকি আৰু নিৰীক্ষণৰ বাবে ড্ৰাফট লিংক জমা দিবলৈ কওক"
                        : "Ask creator if their edited video is ready and request draft/cut submission for review."}
                    </p>
                  </button>

                  {/* Template: Video Approved (Upload Date, Time & Buying Link Soon) */}
                  <button
                    type="button"
                    onClick={() => {
                      const text = getVideoApprovedDetailsSoonWhatsAppText(
                        whatsAppModalData.influencerName,
                        whatsAppModalData.productName,
                        whatsAppModalData.language
                      );
                      setWhatsAppModalData(prev => prev ? {
                        ...prev,
                        selectedTemplate: 'video_approved_details_soon',
                        customText: text
                      } : null);
                    }}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                      whatsAppModalData.selectedTemplate === 'video_approved_details_soon'
                        ? 'border-emerald-600 bg-emerald-50/90 shadow-xs ring-2 ring-emerald-500/20'
                        : 'border-slate-200 bg-white hover:border-emerald-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="font-extrabold text-xs text-emerald-950 flex items-center gap-1.5">
                        <span>✅</span>
                        <span>{whatsAppModalData.language === 'as' ? "ভিডিঅ' অনুমোদিত (লিংক আৰু সময় শীঘ্ৰেই)" : "Video Approved (Schedule & Link Soon)"}</span>
                      </span>
                      <span className="bg-emerald-600 text-white text-[9px] font-black uppercase px-1.5 py-0.2 rounded-full shadow-2xs">
                        {whatsAppModalData.language === 'as' ? "অনুমোদিত" : "Approved"}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-snug">
                      {whatsAppModalData.language === 'as'
                        ? "ক্ৰিয়েটৰক জনাওক যে ভিডিঅ'টো অনুমোদিত হৈছে আৰু আমি অতি শীঘ্ৰেই আপল'ড তাৰিখ, সময় আৰু ক্ৰয় লিংক প্ৰদান কৰিম"
                        : "Inform creator that their video is approved and we will share upload date, time & buying link very soon."}
                    </p>
                  </button>

                  {/* Template: Office Hours (10 AM - 6 PM) & Video Feedback Notice */}
                  <button
                    type="button"
                    onClick={() => {
                      const isSunday = typeof whatsAppModalData.isSundayNotice === 'boolean'
                        ? whatsAppModalData.isSundayNotice
                        : new Date().getDay() === 0;
                      const text = getOfficeHoursFeedbackNoticeWhatsAppText(
                        whatsAppModalData.influencerName,
                        whatsAppModalData.productName,
                        isSunday,
                        whatsAppModalData.language
                      );
                      setWhatsAppModalData(prev => prev ? {
                        ...prev,
                        selectedTemplate: 'office_hours_feedback_notice',
                        isSundayNotice: isSunday,
                        customText: text
                      } : null);
                    }}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                      whatsAppModalData.selectedTemplate === 'office_hours_feedback_notice'
                        ? 'border-amber-500 bg-amber-50/90 shadow-xs ring-2 ring-amber-500/20'
                        : 'border-slate-200 bg-white hover:border-amber-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="font-extrabold text-xs text-amber-950 flex items-center gap-1.5">
                        <span>⏰</span>
                        <span>{whatsAppModalData.language === 'as' ? "অফিচ সময় (১০-৬) আৰু ফিডবেক" : "Office Hours & Feedback Notice"}</span>
                      </span>
                      <span className="bg-amber-600 text-white text-[9px] font-black uppercase px-1.5 py-0.2 rounded-full shadow-2xs">
                        10AM - 6PM
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-snug">
                      {whatsAppModalData.language === 'as'
                        ? "অফিচৰ সময় ১০ AM - ৬ PM, সময়ৰ পিছত/দেওবাৰে দলীয় ফিডবেক কাইলৈ দিয়া হ'ব আৰু এতিয়া ব্যক্তিগত উত্তৰ দিয়াৰ জাননী"
                        : "Office hours 10 AM - 6 PM. After hours or Sunday team feedback is given tomorrow; personal reply available now."}
                    </p>
                  </button>

                  {/* Template 4: Guidelines & Talking Points Reminder */}
                  <button
                    type="button"
                    onClick={() => {
                      const text = getGuidelinesWhatsAppText(whatsAppModalData.influencerName, whatsAppModalData.productName, whatsAppModalData.releaseDate, whatsAppModalData.language);
                      setWhatsAppModalData(prev => prev ? {
                        ...prev,
                        selectedTemplate: 'guidelines',
                        customText: text
                      } : null);
                    }}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                      whatsAppModalData.selectedTemplate === 'guidelines'
                        ? 'border-amber-500 bg-amber-50/80 shadow-xs ring-2 ring-amber-500/20'
                        : 'border-slate-200 bg-white hover:border-amber-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="font-extrabold text-xs text-amber-950 flex items-center gap-1.5">
                        <span>📋</span>
                        <span>{whatsAppModalData.language === 'as' ? "গাইডলাইন আৰু টকিং পইণ্ট" : "Brief & Guidelines Reminder"}</span>
                      </span>
                      <span className="bg-amber-100 text-amber-800 text-[9px] font-black uppercase px-1.5 py-0.2 rounded-full">
                        {whatsAppModalData.language === 'as' ? "গাইডলাইন" : "Guidelines"}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-snug">
                      {whatsAppModalData.language === 'as'
                        ? "ভিডিঅ' ৰিলিজৰ সময়ত নিৰ্ধাৰিত মুখ্য পইণ্টসমূহ আৰু লিংকসমূহ সোঁৱৰাই দিয়ক"
                        : "Remind creator about key product highlights and talking points before releasing."}
                    </p>
                  </button>

                  {/* Template 5: Send Payment Details */}
                  <button
                    type="button"
                    onClick={() => {
                      const text = getPaymentDetailsWhatsAppText(
                        whatsAppModalData.influencerName,
                        whatsAppModalData.productName,
                        whatsAppModalData.amount,
                        whatsAppModalData.paymentDetails,
                        whatsAppModalData.language
                      );
                      setWhatsAppModalData(prev => prev ? {
                        ...prev,
                        selectedTemplate: 'payment_details',
                        customText: text
                      } : null);
                    }}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                      whatsAppModalData.selectedTemplate === 'payment_details'
                        ? 'border-emerald-500 bg-emerald-50/80 shadow-xs ring-2 ring-emerald-500/20'
                        : 'border-slate-200 bg-white hover:border-emerald-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="font-extrabold text-xs text-emerald-950 flex items-center gap-1.5">
                        <span>💳</span>
                        <span>{whatsAppModalData.language === 'as' ? "পেমেন্টৰ তথ্য প্ৰেৰণ" : "Send Payment Details"}</span>
                      </span>
                      <span className="bg-emerald-500 text-white text-[9px] font-black uppercase px-1.5 py-0.2 rounded-full">
                        {whatsAppModalData.language === 'as' ? "পেমেন্ট" : "Payment"}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-snug">
                      {whatsAppModalData.language === 'as'
                        ? `ক্ৰিয়েটৰলৈ ₹${(whatsAppModalData.amount || 0).toLocaleString()} ৰ পেমেন্ট প্ৰচেছ আৰু ৰেফাৰেন্সৰ তথ্য প্ৰেৰণ কৰক`
                        : `Send payment clearance details (₹${(whatsAppModalData.amount || 0).toLocaleString()}) and reference to creator.`}
                    </p>
                  </button>

                  {/* Template: Send Influencer Checklist on PDF format */}
                  <button
                    type="button"
                    onClick={() => {
                      const text = getInfluencerChecklistPdfWhatsAppText(
                        whatsAppModalData.influencerName,
                        whatsAppModalData.productName,
                        whatsAppModalData.task?.videoId,
                        whatsAppModalData.language
                      );
                      setWhatsAppModalData(prev => prev ? {
                        ...prev,
                        selectedTemplate: 'checklist_pdf',
                        customText: text
                      } : null);
                      // Auto-sync in the background so the latest checklist uploaded from Central Product Checklist Store is fresh
                      syncChecklistsFromGoogleDrive(accessToken).then(res => {
                        if (res.success) {
                          const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                          setLastChecklistDriveSyncTime(timeStr);
                        }
                      }).catch(() => {});
                    }}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                      whatsAppModalData.selectedTemplate === 'checklist_pdf'
                        ? 'border-rose-500 bg-rose-50/80 shadow-xs ring-2 ring-rose-500/20'
                        : 'border-slate-200 bg-white hover:border-rose-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="font-extrabold text-xs text-rose-950 flex items-center gap-1.5">
                        <span>📄</span>
                        <span>{whatsAppModalData.language === 'as' ? "ইনফ্লুৱেন্সাৰ চেক-লিষ্ট (PDF)" : "Influencer Checklist (PDF)"}</span>
                      </span>
                      <span className="bg-rose-500 text-white text-[9px] font-black uppercase px-1.5 py-0.2 rounded-full shadow-2xs">
                        PDF
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-snug">
                      {whatsAppModalData.language === 'as'
                        ? `"${whatsAppModalData.productName || 'প্ৰডাক্ট'}" ৰ অফিচিয়েল ইনফ্লুৱেন্সাৰ চেক-লিষ্ট PDF ফৰ্মেটত প্ৰেৰণ কৰক`
                        : `Send official Influencer Checklist of related product "${whatsAppModalData.productName || 'Product'}" in PDF format.`}
                    </p>
                  </button>

                  {/* Template 6: Custom Message */}
                  <button
                    type="button"
                    onClick={() => {
                      setWhatsAppModalData(prev => prev ? {
                        ...prev,
                        selectedTemplate: 'custom'
                      } : null);
                    }}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                      whatsAppModalData.selectedTemplate === 'custom'
                        ? 'border-purple-500 bg-purple-50/80 shadow-xs ring-2 ring-purple-500/20'
                        : 'border-slate-200 bg-white hover:border-purple-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="font-extrabold text-xs text-purple-950 flex items-center gap-1.5">
                        <span>✏️</span>
                        <span>{whatsAppModalData.language === 'as' ? "নিজৰ ইচ্ছামতে বাৰ্তা" : "Custom Message"}</span>
                      </span>
                      <span className="bg-purple-100 text-purple-800 text-[9px] font-black uppercase px-1.5 py-0.2 rounded-full">
                        {whatsAppModalData.language === 'as' ? "কাষ্টম" : "Custom"}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-snug">
                      {whatsAppModalData.language === 'as'
                        ? "নিজৰ প্ৰয়োজনীয় বাৰ্তাৰ পাঠ্য স্বতন্ত্ৰভাৱে লিখক বা সলনি কৰক"
                        : "Write or edit your own personalized message text freely."}
                    </p>
                  </button>

                  {/* Template: Video Correction / Edit Request (AI) */}
                  <button
                    type="button"
                    onClick={() => {
                      const feedback = whatsAppModalData.correctionFeedbackText || DEFAULT_CORRECTION_SAMPLE_TEXT;
                      const text = getVideoCorrectionWhatsAppText(
                        whatsAppModalData.influencerName,
                        whatsAppModalData.productName,
                        feedback,
                        whatsAppModalData.language,
                        !!whatsAppModalData.correctionScreenshot
                      );
                      setWhatsAppModalData(prev => prev ? {
                        ...prev,
                        selectedTemplate: 'video_correction',
                        correctionFeedbackText: feedback,
                        customText: text
                      } : null);
                    }}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                      whatsAppModalData.selectedTemplate === 'video_correction'
                        ? 'border-amber-500 bg-amber-50/90 shadow-xs ring-2 ring-amber-500/20'
                        : 'border-slate-200 bg-white hover:border-amber-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="font-extrabold text-xs text-amber-950 flex items-center gap-1.5">
                        <span>✂️</span>
                        <span>{whatsAppModalData.language === 'as' ? "ভিডিঅ' এডিট / সংশোধন (AI)" : "Video Correction / Edit (AI)"}</span>
                      </span>
                      <span className="bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[9px] font-black uppercase px-1.5 py-0.2 rounded-full shadow-2xs flex items-center gap-0.5">
                        <Sparkles className="w-2.5 h-2.5" />
                        <span>AI</span>
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-snug">
                      {whatsAppModalData.language === 'as'
                        ? "টেক্সট বা স্ক্ৰীনশ্বট দি ক্ৰিয়েটৰলৈ এডিট বা সালসলনিৰ বাৰ্তা তৈয়াৰ কৰক"
                        : "Input feedback text or screenshot to request video edit."}
                    </p>
                  </button>
                </div>
              </div>

              {/* Courier & Tracking Details Panel (For Sample Sent & Sample Received templates) */}
              {(whatsAppModalData.selectedTemplate === 'sample_sent_tracking' || whatsAppModalData.selectedTemplate === 'sample_received') && (
                <div className="bg-gradient-to-br from-teal-50/90 via-emerald-50/60 to-cyan-50/90 border border-teal-200/90 rounded-2xl p-4 shadow-sm animate-in fade-in duration-150 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-gradient-to-br from-teal-600 to-emerald-600 text-white rounded-xl shadow-xs">
                        <Truck className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-teal-950 flex items-center gap-1.5">
                          <span>{whatsAppModalData.language === 'as' ? "কুৰিয়াৰ আৰু ট্ৰেকিং তথ্য (Courier & Tracking Details)" : "Courier Partner & Tracking Information"}</span>
                        </h4>
                        <p className="text-[11px] text-teal-700 font-medium">
                          {whatsAppModalData.language === 'as'
                            ? "কুৰিয়াৰ বা ট্ৰেকিং সলনি কৰিলে বাৰ্তাৰ পূৰ্বদৃশ্য স্বয়ংক্ৰিয়ভাৱে সলনি হ'ব"
                            : "Enter courier name and tracking ID to update message preview in real time"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {onUpdateTask && whatsAppModalData.task?.id && (
                        <button
                          type="button"
                          onClick={() => {
                            onUpdateTask(whatsAppModalData.task.id, {
                              sampleSent: true,
                              orderDate: whatsAppModalData.sampleOrderDate || whatsAppModalData.releaseDate,
                              courierName: whatsAppModalData.courierName,
                              trackingId: whatsAppModalData.trackingId
                            } as any);
                            globalToast.success(whatsAppModalData.language === 'as' ? "কুৰিয়াৰ আৰু ট্ৰেকিং তথ্য টাস্কত সংৰক্ষণ কৰা হ'ল!" : "Courier & tracking details saved to task!");
                          }}
                          className="text-[10px] font-black text-teal-800 bg-teal-100 hover:bg-teal-200 border border-teal-300 px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1 shadow-2xs"
                          title="Save courier name and tracking ID to task"
                        >
                          <Save className="w-3 h-3 text-teal-700" />
                          <span>{whatsAppModalData.language === 'as' ? "টাস্কত চেভ কৰক" : "Save to Task"}</span>
                        </button>
                      )}
                      <span className="text-[10px] font-bold uppercase bg-teal-200/80 text-teal-900 px-2 py-0.5 rounded-full border border-teal-300">
                        {whatsAppModalData.language === 'as' ? "ছেম্পল প্ৰেৰণ" : "Sample Dispatched"}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {/* Courier Partner Name */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] font-black text-teal-900 uppercase block">
                          🚚 {whatsAppModalData.language === 'as' ? "কুৰিয়াৰ কোম্পানী (Courier Partner)" : "Courier Partner Name"}
                        </label>
                        {whatsAppModalData.courierName && (
                          <span className="text-[9px] font-bold text-teal-700 bg-teal-100 px-1.5 py-0.2 rounded border border-teal-200">
                            {whatsAppModalData.courierName}
                          </span>
                        )}
                      </div>
                      <input
                        type="text"
                        value={whatsAppModalData.courierName || ''}
                        onChange={(e) => handleUpdateCourierTracking(e.target.value, whatsAppModalData.trackingId || '', whatsAppModalData.sampleOrderDate)}
                        placeholder="e.g. Delhivery, Blue Dart, DTDC"
                        className="w-full text-xs font-sans font-bold bg-white border border-teal-200 rounded-lg px-2.5 py-1.5 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none shadow-inner"
                      />
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {['Delhivery', 'Blue Dart', 'DTDC', 'India Post', 'Shadowfax', 'Xpressbees', 'Ekart'].map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => handleUpdateCourierTracking(c, whatsAppModalData.trackingId || '', whatsAppModalData.sampleOrderDate)}
                            className={`text-[9px] px-1.5 py-0.5 rounded font-bold cursor-pointer transition border ${
                              (whatsAppModalData.courierName || '').toLowerCase() === c.toLowerCase()
                                ? 'bg-teal-600 text-white border-teal-700 shadow-2xs'
                                : 'bg-white hover:bg-teal-50 text-teal-800 border-teal-200'
                            }`}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Tracking ID / AWB */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] font-black text-teal-900 uppercase block">
                          🔢 {whatsAppModalData.language === 'as' ? "ট্ৰেকিং আইডি / AWB নম্বৰ" : "Tracking ID / AWB Number"}
                        </label>
                        {whatsAppModalData.trackingId && (
                          <span className="text-[9px] font-mono font-bold text-teal-700 bg-teal-100 px-1.5 py-0.2 rounded border border-teal-200">
                            AWB
                          </span>
                        )}
                      </div>
                      <div className="relative">
                        <input
                          type="text"
                          value={whatsAppModalData.trackingId || ''}
                          onChange={(e) => handleUpdateCourierTracking(whatsAppModalData.courierName || '', e.target.value, whatsAppModalData.sampleOrderDate)}
                          placeholder="e.g. 142109283719 or DELH12345"
                          className="w-full text-xs font-mono font-bold bg-white border border-teal-200 rounded-lg px-2.5 py-1.5 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none shadow-inner pr-8"
                        />
                        {whatsAppModalData.trackingId && (
                          <button
                            type="button"
                            onClick={() => handleUpdateCourierTracking(whatsAppModalData.courierName || '', '', whatsAppModalData.sampleOrderDate)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold"
                            title="Clear tracking ID"
                          >
                            ×
                          </button>
                        )}
                      </div>
                      <p className="text-[10px] text-teal-600/90 font-medium mt-1 leading-tight">
                        {whatsAppModalData.language === 'as'
                          ? "ক্ৰিয়েটৰে এই নম্বৰেৰে পাৰ্চেলটো কুৰিয়াৰ ৱেবচাইটত অনলাইন ট্ৰেক কৰিব পাৰিব।"
                          : "Creator can use this AWB / tracking number to trace their package online."}
                      </p>
                    </div>

                    {/* Dispatch Date */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] font-black text-teal-900 uppercase block">
                          📅 {whatsAppModalData.language === 'as' ? "প্ৰেৰণৰ তাৰিখ (Dispatch Date)" : "Sample Dispatch Date"}
                        </label>
                        <div className="flex items-center gap-1">
                          {(() => {
                            const now = new Date();
                            const fmt = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
                            const todayStr = fmt(now);
                            return (
                              <button
                                type="button"
                                onClick={() => handleUpdateCourierTracking(whatsAppModalData.courierName || '', whatsAppModalData.trackingId || '', todayStr)}
                                className="text-[9px] px-1.5 py-0.2 bg-white hover:bg-teal-50 text-teal-800 border border-teal-200 rounded font-semibold cursor-pointer"
                              >
                                Today
                              </button>
                            );
                          })()}
                        </div>
                      </div>
                      <input
                        type="date"
                        value={toIsoDate(whatsAppModalData.sampleOrderDate || whatsAppModalData.releaseDate)}
                        onChange={(e) => {
                          const val = e.target.value;
                          const display = toDisplayDate(val);
                          handleUpdateCourierTracking(whatsAppModalData.courierName || '', whatsAppModalData.trackingId || '', display);
                        }}
                        className="w-full text-xs font-mono font-bold bg-white border border-teal-200 rounded-lg px-2.5 py-1.5 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none cursor-pointer shadow-inner"
                      />
                      {(whatsAppModalData.sampleOrderDate || whatsAppModalData.releaseDate) && (
                        <div className="text-[10px] text-teal-700 font-mono mt-0.5">
                          Formatted: <strong>{toDisplayDate(whatsAppModalData.sampleOrderDate || whatsAppModalData.releaseDate)}</strong>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Upload Schedule & Product Buying Link Details Panel */}
              {(whatsAppModalData.selectedTemplate === "schedule_upload" || whatsAppModalData.selectedTemplate === "schedule_upload_pin_only") && (
                <div className="bg-gradient-to-br from-violet-50/90 via-purple-50/60 to-indigo-50/90 border border-violet-200/90 rounded-2xl p-4 shadow-sm animate-in fade-in duration-150 space-y-3.5">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-gradient-to-br from-violet-600 to-indigo-600 text-white rounded-xl shadow-xs">
                        <Calendar className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-violet-950 flex items-center gap-1.5">
                          <span>{whatsAppModalData.language === "as" ? "আপল'ড সময়সূচী আৰু প্লেটফৰ্ম ক্ৰয় লিংক (Upload Schedule & Platform Links)" : "Scheduled Upload Date, Time & Platform Buying Links"}</span>
                        </h4>
                        <p className="text-[11px] text-violet-700">
                          {whatsAppModalData.language === "as"
                            ? "তাৰিখ, সময় বা লিংক সলনি কৰিলে হোৱাটছএপ বাৰ্তাৰ পূৰ্বদৃশ্য তৎক্ষণাৎ সলনি হ'ব"
                            : "Easily edit scheduled upload date, time & viewer buying links with live message preview"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {onUpdateTask && whatsAppModalData.task?.id && (
                        <button
                          type="button"
                          onClick={() => {
                            const effectiveDate = whatsAppModalData.uploadDate || whatsAppModalData.releaseDate;
                            const effectiveTime = whatsAppModalData.uploadTime || "6:00 PM";
                            onUpdateTask(whatsAppModalData.task.id, {
                              releaseDate: effectiveDate,
                              deadline: effectiveDate,
                              uploadTime: effectiveTime,
                              facebookDescLink: whatsAppModalData.facebookDescLink,
                              facebookPinCommentLink: whatsAppModalData.facebookPinCommentLink,
                              instagramBioLink: whatsAppModalData.instagramBioLink,
                              instagramWishlink: whatsAppModalData.instagramWishlink,
                              youtubeDescLink: whatsAppModalData.youtubeDescLink,
                              buyingLink: whatsAppModalData.buyingLink
                            });
                            globalToast.success(whatsAppModalData.language === "as" ? "আপল'ড সময়সূচী আৰু লিংকসমূহ টাস্কত সংৰক্ষণ কৰা হ'ল!" : "Upload schedule & platform links saved to task!");
                          }}
                          className="text-[10px] font-black text-violet-800 bg-violet-100 hover:bg-violet-200 border border-violet-300 px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1 shadow-2xs"
                          title="Save this scheduled upload date, time & platform links to the deliverable task"
                        >
                          <Save className="w-3 h-3 text-violet-700" />
                          <span>{whatsAppModalData.language === "as" ? "টাস্কত চেভ কৰক" : "Save to Task"}</span>
                        </button>
                      )}
                      <span className="text-[10px] font-bold uppercase bg-violet-200/80 text-violet-900 px-2 py-0.5 rounded-full border border-violet-300">
                        {whatsAppModalData.language === "as" ? "নিৰ্দেশনা" : "Mandatory Notice"}
                      </span>
                    </div>
                  </div>

                  {/* 2nd Option vs Option 1 Message Placement Switcher */}
                  <div className="bg-white/90 p-3 rounded-xl border border-violet-200/90 shadow-2xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-black uppercase tracking-wider text-violet-950 flex items-center gap-1.5">
                        <span>✉️</span>
                        <span>{whatsAppModalData.language === 'as' ? "বাৰ্তাৰ বিকল্প (Message Option):" : "Message Option (Buying Link Instruction):"}</span>
                      </span>
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                        whatsAppModalData.selectedTemplate === 'schedule_upload_pin_only'
                          ? 'bg-purple-600 text-white'
                          : 'bg-violet-600 text-white'
                      }`}>
                        {whatsAppModalData.selectedTemplate === 'schedule_upload_pin_only'
                          ? (whatsAppModalData.language === 'as' ? "বিকল্প ২: কেৱল পিন কমেণ্টত" : "Option 2: Pin Comment Only")
                          : (whatsAppModalData.language === 'as' ? "বিকল্প ১: ডেচক্ৰিপশ্বন আৰু পিন" : "Option 1: Desc & Pin Comment")}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const text = resolveDeliverableTemplateText(
                            'schedule_upload',
                            whatsAppModalData.language,
                            whatsAppModalData.influencerName,
                            whatsAppModalData.productName,
                            whatsAppModalData.uploadDate || whatsAppModalData.releaseDate || 'the scheduled date',
                            whatsAppModalData.sampleOrderDate,
                            whatsAppModalData.amount,
                            whatsAppModalData.paymentDetails,
                            whatsAppModalData.task?.videoId,
                            whatsAppModalData.uploadDate || whatsAppModalData.releaseDate || 'the scheduled date',
                            whatsAppModalData.uploadTime || '6:00 PM',
                            whatsAppModalData.buyingLink,
                            whatsAppModalData.facebookDescLink,
                            whatsAppModalData.facebookPinCommentLink,
                            whatsAppModalData.instagramBioLink,
                            whatsAppModalData.instagramWishlink,
                            whatsAppModalData.youtubeDescLink
                          );
                          setWhatsAppModalData(prev => prev ? { ...prev, selectedTemplate: 'schedule_upload', customText: text } : null);
                        }}
                        className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                          whatsAppModalData.selectedTemplate === 'schedule_upload'
                            ? 'bg-violet-100/90 border-violet-500 ring-2 ring-violet-500/20 shadow-xs'
                            : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <span className="font-black text-xs text-violet-950 flex items-center gap-1.5">
                            <span>📝</span>
                            <span>{whatsAppModalData.language === 'as' ? "বিকল্প ১: ডেচক্ৰিপশ্বন, বায়' আৰু পিন" : "Option 1: Description, Bio & Pin"}</span>
                          </span>
                          <span className="bg-violet-600 text-white text-[9px] font-black uppercase px-1.5 py-0.2 rounded-full">
                            {whatsAppModalData.language === 'as' ? "বিকল্প ১" : "Option 1"}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-600 font-medium leading-tight">
                          {whatsAppModalData.language === 'as'
                            ? "ভিডিঅ'ৰ কেপশ্বন/ডেচক্ৰিপশ্বন, বায়' আৰু পিন কমেণ্টত ক্ৰয় লিংক অন্তৰ্ভুক্ত কৰিবলৈ সাধাৰণ নিৰ্দেশনা।"
                            : "Standard instructions to add product buying link in caption/description, bio, and pinned comment."}
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const text = resolveDeliverableTemplateText(
                            'schedule_upload_pin_only',
                            whatsAppModalData.language,
                            whatsAppModalData.influencerName,
                            whatsAppModalData.productName,
                            whatsAppModalData.uploadDate || whatsAppModalData.releaseDate || 'the scheduled date',
                            whatsAppModalData.sampleOrderDate,
                            whatsAppModalData.amount,
                            whatsAppModalData.paymentDetails,
                            whatsAppModalData.task?.videoId,
                            whatsAppModalData.uploadDate || whatsAppModalData.releaseDate || 'the scheduled date',
                            whatsAppModalData.uploadTime || '6:00 PM',
                            whatsAppModalData.buyingLink,
                            whatsAppModalData.facebookDescLink,
                            whatsAppModalData.facebookPinCommentLink,
                            whatsAppModalData.instagramBioLink,
                            whatsAppModalData.instagramWishlink,
                            whatsAppModalData.youtubeDescLink
                          );
                          setWhatsAppModalData(prev => prev ? { ...prev, selectedTemplate: 'schedule_upload_pin_only', customText: text } : null);
                        }}
                        className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                          whatsAppModalData.selectedTemplate === 'schedule_upload_pin_only'
                            ? 'bg-purple-100/90 border-purple-600 ring-2 ring-purple-500/20 shadow-xs'
                            : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <span className="font-black text-xs text-purple-950 flex items-center gap-1.5">
                            <span>📌</span>
                            <span>{whatsAppModalData.language === 'as' ? "বিকল্প ২: কেৱল পিন কমেণ্টত (Pin Only)" : "Option 2: Pin Comment Only"}</span>
                          </span>
                          <span className="bg-purple-600 text-white text-[9px] font-black uppercase px-1.5 py-0.2 rounded-full">
                            {whatsAppModalData.language === 'as' ? "বিকল্প ২" : "2nd Option"}
                          </span>
                        </div>
                        <p className="text-[10px] text-purple-900/90 font-medium leading-tight">
                          {whatsAppModalData.language === 'as'
                            ? "আমাৰ প্ৰদান কৰা লিংক আৰু সবিশেষ কেৱল পিন কমেণ্টতহে যোগ কৰিবলৈ ক্ৰিয়েটৰক কোৱা বিশেষ বাৰ্তা।"
                            : "Tells the influencer to add our provided link and details ONLY on pinned comment."}
                        </p>
                      </button>
                    </div>
                  </div>

                  {/* 1. Date & Time Row */}
                  <div className="bg-white/80 border border-violet-200/80 rounded-xl p-3 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-extrabold text-violet-950 uppercase tracking-wider flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-violet-600" />
                        <span>{whatsAppModalData.language === "as" ? "১. নিৰ্ধাৰিত আপল'ডৰ দিন আৰু সময় (Scheduled Upload Date & Time)" : "1. Scheduled Upload Date & Scheduled Upload Time"}</span>
                      </span>
                      <div className="flex items-center gap-1">
                        {(() => {
                          const now = new Date();
                          const fmt = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
                          const todayStr = fmt(now);
                          const tom = new Date(now); tom.setDate(tom.getDate() + 1);
                          const tomStr = fmt(tom);
                          return (
                            <>
                              <button
                                type="button"
                                onClick={() => handleUpdateDateAndTime(todayStr, whatsAppModalData.uploadTime || "6:00 PM")}
                                className="text-[9px] px-2 py-0.5 bg-violet-50 hover:bg-violet-100 text-violet-800 border border-violet-200 rounded font-bold cursor-pointer transition"
                              >
                                Today
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateDateAndTime(tomStr, whatsAppModalData.uploadTime || "6:00 PM")}
                                className="text-[9px] px-2 py-0.5 bg-violet-50 hover:bg-violet-100 text-violet-800 border border-violet-200 rounded font-bold cursor-pointer transition"
                              >
                                Tomorrow
                              </button>
                            </>
                          );
                        })()}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[10px] font-black text-violet-900 uppercase block">
                            📅 {whatsAppModalData.language === "as" ? "নিৰ্ধাৰিত আপল'ড তাৰিখ (Date Picker)" : "Scheduled Upload Date (Date Picker)"}
                          </label>
                          {(whatsAppModalData.uploadDate || whatsAppModalData.releaseDate) && (
                            <span className="text-[9px] font-mono font-bold text-violet-700 bg-violet-100 px-1.5 py-0.2 rounded border border-violet-200">
                              {toDisplayDate(whatsAppModalData.uploadDate || whatsAppModalData.releaseDate)}
                            </span>
                          )}
                        </div>
                        <input
                          type="date"
                          value={toIsoDate(whatsAppModalData.uploadDate || whatsAppModalData.releaseDate)}
                          onChange={(e) => {
                            const val = e.target.value;
                            const display = toDisplayDate(val);
                            handleUpdateDateAndTime(display, whatsAppModalData.uploadTime || "6:00 PM");
                          }}
                          className="w-full text-xs font-mono font-bold bg-white border border-violet-200 rounded-lg px-2.5 py-1.5 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none cursor-pointer shadow-inner"
                          title="Click to pick scheduled upload date"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[10px] font-black text-violet-900 uppercase block">
                            ⏰ {whatsAppModalData.language === "as" ? "নিৰ্ধাৰিত আপল'ড সময় (Time Picker)" : "Scheduled Upload Time (Time Picker)"}
                          </label>
                          <div className="flex items-center gap-1">
                            <span className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded border ${
                              isInfluencerPreferredTime(whatsAppModalData.uploadTime)
                                ? 'text-amber-900 bg-amber-100 border-amber-300'
                                : 'text-violet-700 bg-violet-100 border-violet-200'
                            }`}>
                              {whatsAppModalData.uploadTime || "6:00 PM"}
                            </span>
                          </div>
                        </div>

                        {/* Mode Selector for Time Picker: Specific Time vs Influencer Preferred Time */}
                        <div className="flex items-center bg-violet-100/70 p-0.5 rounded-lg border border-violet-200 mb-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              const standardTime = whatsAppModalData.uploadTime && !isInfluencerPreferredTime(whatsAppModalData.uploadTime)
                                ? whatsAppModalData.uploadTime
                                : '6:00 PM';
                              handleUpdateDateAndTime(whatsAppModalData.uploadDate || whatsAppModalData.releaseDate || 'the scheduled date', standardTime);
                            }}
                            className={`flex-1 py-1 px-1.5 text-[10px] rounded-md font-bold transition cursor-pointer text-center ${
                              !isInfluencerPreferredTime(whatsAppModalData.uploadTime)
                                ? 'bg-white text-violet-950 font-black shadow-2xs'
                                : 'text-violet-700 hover:text-violet-950'
                            }`}
                          >
                            ⏰ {whatsAppModalData.language === 'as' ? "নিৰ্দিষ্ট সময় (Picker)" : "Specific Time (Picker)"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const preferredLabel = getPreferredTimeOption(whatsAppModalData.influencer, whatsAppModalData.task, whatsAppModalData.language);
                              handleUpdateDateAndTime(
                                whatsAppModalData.uploadDate || whatsAppModalData.releaseDate || 'the scheduled date',
                                preferredLabel
                              );
                            }}
                            className={`flex-1 py-1 px-1.5 text-[10px] rounded-md font-black transition cursor-pointer flex items-center justify-center gap-1 ${
                              isInfluencerPreferredTime(whatsAppModalData.uploadTime)
                                ? 'bg-amber-500 text-white shadow-2xs ring-1 ring-amber-400'
                                : 'text-amber-900 hover:bg-amber-100/60'
                            }`}
                            title="Click to select Influencer's preferred posting time"
                          >
                            <span>⭐</span>
                            <span>{whatsAppModalData.language === 'as' ? "ইনফ্লুৱেন্সাৰৰ সুবিধাৰ সময়" : "Influencer Preferred Time"}</span>
                          </button>
                        </div>

                        {/* Conditional display: Influencer Preferred Selector Card VS standard HTML time picker */}
                        {isInfluencerPreferredTime(whatsAppModalData.uploadTime) ? (
                          <div className="bg-amber-50/90 border border-amber-200 rounded-lg p-2 space-y-1.5 animate-in fade-in duration-100">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold text-amber-950 flex items-center gap-1">
                                <span>⭐</span>
                                <span>{whatsAppModalData.language === 'as' ? "ইনফ্লুৱেন্সাৰৰ সুবিধাৰ সময় নিৰ্বাচিত:" : "Influencer Preferred Time Active:"}</span>
                              </span>
                            </div>
                            <div className="flex items-center gap-1 flex-wrap">
                              <button
                                type="button"
                                onClick={() => {
                                  handleUpdateDateAndTime(
                                    whatsAppModalData.uploadDate || whatsAppModalData.releaseDate || 'the scheduled date',
                                    whatsAppModalData.language === 'as'
                                      ? "আপোনাৰ সুবিধা অনুসৰি সময় (Influencer's Preferred Time)"
                                      : "Influencer's Preferred Time (At your convenience)"
                                  );
                                }}
                                className="px-2 py-0.5 rounded text-[10px] bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold cursor-pointer shadow-2xs"
                              >
                                {whatsAppModalData.language === 'as' ? "সুবিধাৰ সময় (Flexible)" : "At Convenience (Flexible)"}
                              </button>
                              {['6:00 PM', '7:30 PM', '8:00 PM', '9:00 PM'].map((slot) => (
                                <button
                                  key={slot}
                                  type="button"
                                  onClick={() => {
                                    const prefStr = whatsAppModalData.language === 'as'
                                      ? `${slot} (ইনফ্লুৱেন্সাৰৰ সুবিধা অনুসৰি)`
                                      : `${slot} (Influencer's Preferred Time)`;
                                    if (whatsAppModalData.influencer?.id && onUpdateInfluencer) {
                                      onUpdateInfluencer(whatsAppModalData.influencer.id, { preferredTime: slot });
                                    }
                                    if (whatsAppModalData.task?.id && onUpdateTask) {
                                      onUpdateTask(whatsAppModalData.task.id, { influencerPreferredTime: slot, uploadTime: slot });
                                    }
                                    handleUpdateDateAndTime(
                                      whatsAppModalData.uploadDate || whatsAppModalData.releaseDate || 'the scheduled date',
                                      prefStr
                                    );
                                  }}
                                  className="px-2 py-0.5 rounded text-[10px] bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold font-mono cursor-pointer shadow-2xs"
                                >
                                  {slot}
                                </button>
                              ))}
                              <div className="flex items-center gap-1 bg-white border border-amber-300 rounded px-1.5 py-0.5 shadow-2xs">
                                <span className="text-[9px] font-bold text-amber-900">
                                  {whatsAppModalData.language === 'as' ? "অন্য সময়:" : "Custom:"}
                                </span>
                                <input
                                  type="time"
                                  value={to24HourTime(whatsAppModalData.uploadTime || '7:30 PM')}
                                  onChange={(e) => {
                                    const time12 = to12HourTime(e.target.value);
                                    const prefStr = whatsAppModalData.language === 'as'
                                      ? `${time12} (ইনফ্লুৱেন্সাৰৰ সুবিধা অনুসৰি)`
                                      : `${time12} (Influencer's Preferred Time)`;
                                    if (whatsAppModalData.influencer?.id && onUpdateInfluencer) {
                                      onUpdateInfluencer(whatsAppModalData.influencer.id, { preferredTime: time12 });
                                    }
                                    if (whatsAppModalData.task?.id && onUpdateTask) {
                                      onUpdateTask(whatsAppModalData.task.id, { influencerPreferredTime: time12, uploadTime: time12 });
                                    }
                                    handleUpdateDateAndTime(
                                      whatsAppModalData.uploadDate || whatsAppModalData.releaseDate || "the scheduled date",
                                      prefStr
                                    );
                                  }}
                                  className="text-[10px] font-mono font-bold bg-transparent outline-none cursor-pointer text-amber-950"
                                  title="Pick custom influencer preferred time"
                                />
                              </div>
                            </div>
                          </div>
                        ) : (
                          <input
                            type="time"
                            value={to24HourTime(whatsAppModalData.uploadTime || "6:00 PM")}
                            onChange={(e) => {
                              const time12 = to12HourTime(e.target.value);
                              handleUpdateDateAndTime(
                                whatsAppModalData.uploadDate || whatsAppModalData.releaseDate || "the scheduled date",
                                time12
                              );
                            }}
                            className="w-full text-xs font-mono font-bold bg-white border border-violet-200 rounded-lg px-2.5 py-1.5 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none cursor-pointer shadow-inner"
                            title="Click to pick scheduled upload time"
                          />
                        )}
                      </div>
                    </div>

                    {/* Quick Time Selector Chips */}
                    <div className="flex items-center gap-1.5 flex-wrap pt-1.5 border-t border-violet-100">
                      <span className="text-[10px] font-bold text-violet-800">
                        {whatsAppModalData.language === "as" ? "দ্ৰুত সময় বাছনি:" : "Quick Time Pick:"}
                      </span>

                      {/* Option to select Influencer preferred time */}
                      <div className="inline-flex items-center">
                        <button
                          type="button"
                          onClick={() => {
                            const preferredLabel = getPreferredTimeOption(whatsAppModalData.influencer, whatsAppModalData.task, whatsAppModalData.language);
                            handleUpdateDateAndTime(
                              whatsAppModalData.uploadDate || whatsAppModalData.releaseDate || "the scheduled date",
                              preferredLabel
                            );
                          }}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer border flex items-center gap-1 shadow-2xs ${
                            isInfluencerPreferredTime(whatsAppModalData.uploadTime)
                              ? 'bg-amber-500 text-white border-amber-600 shadow-xs ring-1 ring-amber-400 font-extrabold'
                              : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300'
                          }`}
                          title="Select Influencer's preferred posting time"
                        >
                          <span>⭐</span>
                          <span>{whatsAppModalData.language === 'as' ? "ইনফ্লুৱেন্সাৰৰ সুবিধাৰ সময়" : "Influencer Preferred Time"}</span>
                        </button>
                      </div>

                      {["11:00 AM", "1:00 PM", "4:00 PM", "6:00 PM", "7:30 PM", "8:00 PM", "9:00 PM"].map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => handleUpdateDateAndTime(whatsAppModalData.uploadDate || whatsAppModalData.releaseDate || "the scheduled date", t)}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono transition cursor-pointer border ${
                            (whatsAppModalData.uploadTime || "6:00 PM") === t && !isInfluencerPreferredTime(whatsAppModalData.uploadTime)
                              ? "bg-violet-600 text-white border-violet-700 shadow-2xs"
                              : "bg-white hover:bg-violet-100 text-violet-800 border-violet-200"
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 2. Platform Specific Buying Links Box */}
                  <div className="bg-white/80 border border-violet-200/80 rounded-xl p-3 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <span className="text-[11px] font-extrabold text-violet-950 uppercase tracking-wider flex items-center gap-1.5">
                          <LinkIcon className="w-3.5 h-3.5 text-violet-600" />
                          <span>{whatsAppModalData.language === "as" ? "২. দৰ্শকৰ বাবে প্ৰডাক্ট ক্ৰয় লিংক (Product Buying Links for Viewers)" : "2. Product Buying Links for Viewers (Platform Specific)"}</span>
                        </span>
                        <p className="text-[10px] text-slate-500 font-medium">
                          {whatsAppModalData.language === "as"
                            ? "ফেচবুক, ইনষ্টাগ্ৰাম আৰু ইউটিউবৰ বাবে সঠিক লিংক দিয়ক — বাৰ্তাত ক্ৰিয়েটৰক সঠিক ঠাইত দিবলৈ কোৱা হ'ব"
                            : "Add link for Description/Caption & Pin Comment (Facebook), Bio or Wishlink (Instagram), and Description (YouTube)"}
                        </p>
                      </div>

                      {/* Platform Filter Tabs */}
                      <div className="inline-flex rounded-lg bg-violet-100/80 p-0.5 text-[10px] font-extrabold border border-violet-200">
                        {[
                          { id: "all", label: "All Platforms", count: [whatsAppModalData.facebookDescLink, whatsAppModalData.facebookPinCommentLink, whatsAppModalData.instagramBioLink, whatsAppModalData.instagramWishlink, whatsAppModalData.youtubeDescLink, whatsAppModalData.buyingLink].filter(Boolean).length },
                          { id: "facebook", label: "Facebook 📘", count: [whatsAppModalData.facebookDescLink, whatsAppModalData.facebookPinCommentLink].filter(Boolean).length },
                          { id: "instagram", label: "Instagram 📸", count: [whatsAppModalData.instagramBioLink, whatsAppModalData.instagramWishlink].filter(Boolean).length },
                          { id: "youtube", label: "YouTube ▶️", count: [whatsAppModalData.youtubeDescLink].filter(Boolean).length }
                        ].map(tab => (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => handleUpdatePlatformLinks({ activeLinkTab: tab.id as any })}
                            className={`px-2 py-0.5 rounded cursor-pointer transition flex items-center gap-1 ${
                              (whatsAppModalData.activeLinkTab || "all") === tab.id
                                ? "bg-white text-violet-950 shadow-2xs"
                                : "text-violet-700 hover:text-violet-950"
                            }`}
                          >
                            <span>{tab.label}</span>
                            {tab.count > 0 && (
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Facebook Section */}
                    {((whatsAppModalData.activeLinkTab || "all") === "all" || whatsAppModalData.activeLinkTab === "facebook") && (
                      <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-2.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-black text-blue-950 flex items-center gap-1.5">
                            <span className="text-xs">📘</span>
                            <span>Facebook</span>
                            <span className="text-[9px] font-bold text-blue-700 bg-blue-100 px-1.5 py-0.2 rounded">Description / Caption & Pin Comment</span>
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] font-black text-blue-900 block mb-0.5">
                              Link for Description / Caption (Facebook)
                            </label>
                            <input
                              type="text"
                              value={whatsAppModalData.facebookDescLink || ""}
                              onChange={(e) => handleUpdatePlatformLinks({ facebookDescLink: e.target.value })}
                              placeholder="e.g. https://yourstore.com/promo or https://amzn.to/..."
                              className="w-full text-xs font-mono bg-white border border-blue-200 rounded-lg px-2.5 py-1.5 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                            />
                            <span className="text-[9px] text-blue-600 block mt-0.5">
                              {whatsAppModalData.language === "as" ? "ফেচবুকৰ কেপশ্বন বা ডেচক্ৰিপশ্বনত দিবলগীয়া ক্ৰয় লিংক" : "Link for influencer to add in Facebook post caption/description"}
                            </span>
                          </div>

                          <div>
                            <label className="text-[10px] font-black text-blue-900 block mb-0.5">
                              Pin Comment for Facebook
                            </label>
                            <input
                              type="text"
                              value={whatsAppModalData.facebookPinCommentLink || ""}
                              onChange={(e) => handleUpdatePlatformLinks({ facebookPinCommentLink: e.target.value })}
                              placeholder="e.g. https://yourstore.com/deal (pinned comment link)"
                              className="w-full text-xs font-mono bg-white border border-blue-200 rounded-lg px-2.5 py-1.5 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                            />
                            <span className="text-[9px] text-blue-600 block mt-0.5">
                              {whatsAppModalData.language === "as" ? "ফেচবুক কমেণ্টত পিন (Pin) কৰি ৰাখিবলৈ দিয়া ক্ৰয় লিংক" : "Direct buying link influencer will pin at the top of comments"}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Instagram Section */}
                    {((whatsAppModalData.activeLinkTab || "all") === "all" || whatsAppModalData.activeLinkTab === "instagram") && (
                      <div className="bg-pink-50/70 border border-pink-200 rounded-xl p-2.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-black text-pink-950 flex items-center gap-1.5">
                            <span className="text-xs">📸</span>
                            <span>Instagram</span>
                            <span className="text-[9px] font-bold text-pink-700 bg-pink-100 px-1.5 py-0.2 rounded">Link in bio or Wishlink</span>
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] font-black text-pink-900 block mb-0.5">
                              Link in bio (Instagram)
                            </label>
                            <input
                              type="text"
                              value={whatsAppModalData.instagramBioLink || ""}
                              onChange={(e) => handleUpdatePlatformLinks({ instagramBioLink: e.target.value })}
                              placeholder="e.g. https://linktr.ee/yourbrand or store link"
                              className="w-full text-xs font-mono bg-white border border-pink-200 rounded-lg px-2.5 py-1.5 focus:border-pink-500 focus:ring-1 focus:ring-pink-500 outline-none"
                            />
                            <span className="text-[9px] text-pink-600 block mt-0.5">
                              {whatsAppModalData.language === "as" ? "ইনষ্টাগ্ৰাম প্ৰফাইল বায়'ত (Bio) ৰাখিবলৈ দিয়া লিংক" : "Influencer updates profile bio link so reel viewers can shop"}
                            </span>
                          </div>

                          <div>
                            <label className="text-[10px] font-black text-pink-900 block mb-0.5">
                              Wishlink for Instagram
                            </label>
                            <input
                              type="text"
                              value={whatsAppModalData.instagramWishlink || ""}
                              onChange={(e) => handleUpdatePlatformLinks({ instagramWishlink: e.target.value })}
                              placeholder="e.g. https://wishlink.com/collection/..."
                              className="w-full text-xs font-mono bg-white border border-pink-200 rounded-lg px-2.5 py-1.5 focus:border-pink-500 focus:ring-1 focus:ring-pink-500 outline-none"
                            />
                            <span className="text-[9px] text-pink-600 block mt-0.5">
                              {whatsAppModalData.language === "as" ? "ইনষ্টাগ্ৰামৰ বাবে অফিচিয়েল উইশলিংক (Wishlink)" : "Curated Wishlink collection link for Instagram"}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* YouTube Section */}
                    {((whatsAppModalData.activeLinkTab || "all") === "all" || whatsAppModalData.activeLinkTab === "youtube") && (
                      <div className="bg-red-50/70 border border-red-200 rounded-xl p-2.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-black text-red-950 flex items-center gap-1.5">
                            <span className="text-xs">▶️</span>
                            <span>YouTube</span>
                            <span className="text-[9px] font-bold text-red-700 bg-red-100 px-1.5 py-0.2 rounded">Link for Description</span>
                          </span>
                        </div>
                        <div>
                          <label className="text-[10px] font-black text-red-900 block mb-0.5">
                            Link for Description for youtube
                          </label>
                          <input
                            type="text"
                            value={whatsAppModalData.youtubeDescLink || ""}
                            onChange={(e) => handleUpdatePlatformLinks({ youtubeDescLink: e.target.value })}
                            placeholder="e.g. https://yourbrand.com/yt-deal or https://amzn.to/..."
                            className="w-full text-xs font-mono bg-white border border-red-200 rounded-lg px-2.5 py-1.5 focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none"
                          />
                          <span className="text-[9px] text-red-600 block mt-0.5">
                            {whatsAppModalData.language === "as" ? "ইউটিউব ভিডিঅ'ৰ ডেচক্ৰিপশ্বনত দিবলগীয়া প্ৰডাক্ট ক্ৰয়ৰ লিংক" : "Buying link influencer must put prominently in YouTube video description"}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* General Fallback Buying Link */}
                    <div className="pt-1">
                      <label className="text-[10px] font-black text-violet-900 uppercase block mb-0.5">
                        🔗 {whatsAppModalData.language === "as" ? "প্ৰডাক্ট ক্ৰয়ৰ মূল লিংক (Main Product Buying Link - Fallback)" : "Main Product Buying Link (General / Website Store Link)"}
                      </label>
                      <input
                        type="text"
                        value={whatsAppModalData.buyingLink || ""}
                        onChange={(e) => handleUpdatePlatformLinks({ buyingLink: e.target.value })}
                        placeholder="e.g. https://amzn.to/... or https://yourstore.com/product"
                        className="w-full text-xs font-mono bg-white border border-violet-200 rounded-lg px-2.5 py-1.5 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none"
                      />
                    </div>
                  </div>

                  {/* Requirements checklist pill */}
                  <div className="bg-white/90 border border-violet-200 rounded-xl p-2.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[11px] text-violet-900 font-medium">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-violet-600"></span>
                      <span>🛍️ <strong>Product Buying Link</strong> prominently placed in Description / Caption, Pinned Comment, or Bio</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                      <span>📹 Influencer must <strong>share live video link immediately</strong> after upload</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Advance Buying Link & Edit Review Configuration Panel */}
              {whatsAppModalData.selectedTemplate === 'advance_link_edit_review' && (
                <div className="bg-gradient-to-br from-amber-50/95 via-orange-50/70 to-yellow-50/90 border border-amber-300/90 rounded-2xl p-4 shadow-sm animate-in fade-in duration-150 space-y-3.5">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2.5 bg-gradient-to-br from-amber-600 to-orange-600 text-white rounded-xl shadow-xs">
                        <LinkIcon className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-amber-950 flex items-center gap-1.5 flex-wrap">
                          <span>{whatsAppModalData.language === 'as' ? "আগতীয়া ক্ৰয় লিংক আৰু এডিট পৰীক্ষা বাৰ্তা" : "Advance Buying Link & Mandatory Edit Review Submission"}</span>
                          <span className="text-[9px] font-black uppercase bg-amber-500 text-white px-2 py-0.5 rounded-full shadow-2xs">
                            {whatsAppModalData.language === 'as' ? "বাধ্যতামূলক চৰ্ত" : "Mandatory Terms"}
                          </span>
                        </h4>
                        <p className="text-[11px] text-amber-900/90 font-medium">
                          {whatsAppModalData.language === 'as'
                            ? "এডিটেড ভিডিঅ' জমাৰ পূৰ্বেই ক্ৰয় লিংক প্ৰদান কৰক, কিন্তু পূৰ্বৰ নিৰ্দেশনা অনুসৰি এডিট কৰা আৰু আপল'ডৰ পূৰ্বে ফাইনেল ভিডিঅ' জমা দিয়াৰ চৰ্ত দিয়ক।"
                            : "Share buying link in advance + require video edit per previous notes and mandatory final cut review before upload."}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {onUpdateTask && whatsAppModalData.task?.id && (
                        <button
                          type="button"
                          onClick={() => {
                            const effectiveDate = whatsAppModalData.uploadDate || whatsAppModalData.releaseDate;
                            const effectiveTime = whatsAppModalData.uploadTime || "6:00 PM";
                            onUpdateTask(whatsAppModalData.task.id, {
                              releaseDate: effectiveDate,
                              deadline: effectiveDate,
                              uploadTime: effectiveTime,
                              buyingLink: whatsAppModalData.buyingLink
                            });
                            globalToast.success(whatsAppModalData.language === 'as' ? "আপল'ড তাৰিখ, সময় আৰু ক্ৰয় লিংক টাস্কত সংৰক্ষণ কৰা হ'ল!" : "Upload date, time & buying link saved to task!");
                          }}
                          className="text-[10px] font-black text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1 shadow-2xs"
                          title="Save this scheduled upload date, time & buying link to the deliverable task"
                        >
                          <Save className="w-3 h-3 text-amber-800" />
                          <span>{whatsAppModalData.language === 'as' ? "টাস্কত চেভ কৰক" : "Save to Task"}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 3 Required Inputs: Upload Date, Upload Time, Buying Link */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-white/90 p-3 rounded-xl border border-amber-200/90 shadow-2xs">
                    {/* Input 1: Upload Date */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-black text-amber-950 uppercase flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-amber-600" />
                          <span>{whatsAppModalData.language === 'as' ? "আপল'ড তাৰিখ (Upload Date)" : "Upload Date"}</span>
                        </label>
                        <div className="flex items-center gap-1">
                          {(() => {
                            const now = new Date();
                            const fmt = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
                            const todayStr = fmt(now);
                            const tom = new Date(now); tom.setDate(tom.getDate() + 1);
                            const tomStr = fmt(tom);
                            return (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateDateAndTime(todayStr, whatsAppModalData.uploadTime || "6:00 PM")}
                                  className="text-[9px] px-1.5 py-0.2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded font-bold cursor-pointer"
                                >
                                  Today
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateDateAndTime(tomStr, whatsAppModalData.uploadTime || "6:00 PM")}
                                  className="text-[9px] px-1.5 py-0.2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded font-bold cursor-pointer"
                                >
                                  Tomorrow
                                </button>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                      <input
                        type="date"
                        value={toIsoDate(whatsAppModalData.uploadDate || whatsAppModalData.releaseDate)}
                        onChange={(e) => {
                          const val = e.target.value;
                          const display = toDisplayDate(val);
                          handleUpdateDateAndTime(display, whatsAppModalData.uploadTime || "6:00 PM");
                        }}
                        className="w-full text-xs font-mono font-bold bg-white border border-amber-200 rounded-lg px-2.5 py-1.5 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none cursor-pointer shadow-inner"
                      />
                      {(whatsAppModalData.uploadDate || whatsAppModalData.releaseDate) && (
                        <div className="text-[9px] font-mono font-bold text-amber-800">
                          {toDisplayDate(whatsAppModalData.uploadDate || whatsAppModalData.releaseDate)}
                        </div>
                      )}
                    </div>

                    {/* Input 2: Upload Time */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-black text-amber-950 uppercase flex items-center gap-1">
                          <Clock className="w-3 h-3 text-amber-600" />
                          <span>{whatsAppModalData.language === 'as' ? "আপল'ড সময় (Upload Time)" : "Upload Time"}</span>
                        </label>
                        <span className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded border ${
                          isInfluencerPreferredTime(whatsAppModalData.uploadTime)
                            ? 'text-amber-900 bg-amber-100 border-amber-300'
                            : 'text-amber-800 bg-amber-50 border-amber-200'
                        }`}>
                          {whatsAppModalData.uploadTime || "6:00 PM"}
                        </span>
                      </div>
                      {isInfluencerPreferredTime(whatsAppModalData.uploadTime) ? (
                        <div className="flex items-center gap-1 bg-amber-100/70 border border-amber-300 rounded-lg p-1">
                          <span className="text-[9px] font-bold text-amber-900 truncate">⭐ Influencer Preferred</span>
                          <button
                            type="button"
                            onClick={() => handleUpdateDateAndTime(whatsAppModalData.uploadDate || whatsAppModalData.releaseDate || 'the scheduled date', '6:00 PM')}
                            className="text-[9px] px-1 bg-white hover:bg-amber-200 rounded text-amber-900 font-bold ml-auto cursor-pointer"
                          >
                            Switch to Picker
                          </button>
                        </div>
                      ) : (
                        <input
                          type="time"
                          value={to24HourTime(whatsAppModalData.uploadTime || "6:00 PM")}
                          onChange={(e) => {
                            const time12 = to12HourTime(e.target.value);
                            handleUpdateDateAndTime(
                              whatsAppModalData.uploadDate || whatsAppModalData.releaseDate || "the scheduled date",
                              time12
                            );
                          }}
                          className="w-full text-xs font-mono font-bold bg-white border border-amber-200 rounded-lg px-2.5 py-1.5 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none cursor-pointer shadow-inner"
                        />
                      )}
                      {/* Quick Chips */}
                      <div className="flex items-center gap-1 flex-wrap pt-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            const preferredLabel = getPreferredTimeOption(whatsAppModalData.influencer, whatsAppModalData.task, whatsAppModalData.language);
                            handleUpdateDateAndTime(whatsAppModalData.uploadDate || whatsAppModalData.releaseDate || 'the scheduled date', preferredLabel);
                          }}
                          className={`text-[9px] px-1.5 py-0.5 rounded font-bold border cursor-pointer ${
                            isInfluencerPreferredTime(whatsAppModalData.uploadTime)
                              ? 'bg-amber-500 text-white border-amber-600 shadow-2xs'
                              : 'bg-white hover:bg-amber-100 text-amber-900 border-amber-300'
                          }`}
                        >
                          ⭐ Preferred
                        </button>
                        {["1:00 PM", "6:00 PM", "7:30 PM", "9:00 PM"].map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => handleUpdateDateAndTime(whatsAppModalData.uploadDate || whatsAppModalData.releaseDate || 'the scheduled date', t)}
                            className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold border cursor-pointer ${
                              (whatsAppModalData.uploadTime || "6:00 PM") === t && !isInfluencerPreferredTime(whatsAppModalData.uploadTime)
                                ? "bg-amber-600 text-white border-amber-700 shadow-2xs"
                                : "bg-white hover:bg-amber-100 text-amber-900 border-amber-200"
                            }`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Input 3: Buying Link */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-black text-amber-950 uppercase flex items-center gap-1">
                          <LinkIcon className="w-3 h-3 text-amber-600" />
                          <span>{whatsAppModalData.language === 'as' ? "ক্ৰয় লিংক (Buying Link)" : "Buying Link"}</span>
                        </label>
                        {whatsAppModalData.buyingLink && (
                          <a
                            href={whatsAppModalData.buyingLink.startsWith('http') ? whatsAppModalData.buyingLink : `https://${whatsAppModalData.buyingLink}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[9px] text-amber-700 hover:text-amber-900 font-bold flex items-center gap-0.5"
                          >
                            <span>Test</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}
                      </div>
                      <input
                        type="url"
                        value={whatsAppModalData.buyingLink || ""}
                        onChange={(e) => handleUpdatePlatformLinks({ buyingLink: e.target.value })}
                        placeholder="e.g. https://amzn.to/... or product purchase url"
                        className="w-full text-xs font-mono font-bold bg-white border border-amber-200 rounded-lg px-2.5 py-1.5 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none shadow-inner"
                      />
                      <span className="text-[9px] text-amber-800 font-medium block">
                        {whatsAppModalData.language === 'as'
                          ? "ক্ৰিয়েটৰে ভিডিঅ' আপল'ডৰ সময়ত কেপশ্বন/বায়'/পিন কমেণ্টত দিবলৈ আগতীয়াকৈ লিংকটো পায়"
                          : "Influencer receives this buying link in advance to put in caption, bio & pinned comment"}
                      </span>
                    </div>
                  </div>

                  {/* Conditions & Checklist Notice */}
                  <div className="bg-amber-100/70 border border-amber-300 rounded-xl p-2.5 space-y-1.5 text-[11px] text-amber-950">
                    <div className="font-black flex items-center gap-1.5 text-xs text-amber-900 uppercase tracking-wide">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                      <span>{whatsAppModalData.language === 'as' ? "বাৰ্তাত উল্লেখ থকা মূল চৰ্তসমূহ:" : "Key Requirements Enforced in This WhatsApp Message:"}</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[10px] text-amber-900 font-semibold">
                      <div className="flex items-start gap-1.5">
                        <span className="text-amber-600 font-bold">1️⃣</span>
                        <span><strong>Edit Per Previous Feedback:</strong> Video must be revised as per our team's previous editing message.</span>
                      </div>
                      <div className="flex items-start gap-1.5">
                        <span className="text-amber-600 font-bold">2️⃣</span>
                        <span><strong>Submit Final Video Before Upload:</strong> Creator must share the final cut for approval prior to publishing.</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Edited Video Ready Check Banner */}
              {whatsAppModalData.selectedTemplate === 'edited_video_ready_check' && (
                <div className="bg-gradient-to-r from-indigo-50 via-purple-50 to-blue-50 border border-indigo-200 rounded-2xl p-4 shadow-sm animate-in fade-in duration-150 space-y-2.5">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-gradient-to-br from-indigo-600 to-purple-600 text-white rounded-xl shadow-xs">
                        <Video className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-indigo-950 flex items-center gap-1.5">
                          <span>{whatsAppModalData.language === 'as' ? "এডিটেড ভিডিঅ'ৰ বুজ লওক (Edited Video Ready Check)" : "Edited Video Ready Check"}</span>
                        </h4>
                        <p className="text-[11px] text-indigo-800">
                          {whatsAppModalData.language === 'as'
                            ? "ক্ৰিয়েটৰক সোধক যে এডিটেড ভিডিঅ'ৰ কাম সম্পূৰ্ণ হৈ সাজু হৈছে নেকি আৰু নিৰীক্ষণৰ বাবে ড্ৰাফট লিংক প্ৰেৰণ কৰিবলৈ জনাওক।"
                            : "Ask creator if their edited promotional video is ready and request them to share the draft cut for team review."}
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold uppercase bg-indigo-200/80 text-indigo-900 px-2.5 py-0.5 rounded-full border border-indigo-300">
                      {whatsAppModalData.language === 'as' ? "ভিডিঅ' সাজু নেকি" : "Ready Check"}
                    </span>
                  </div>
                  <div className="bg-white/90 border border-indigo-200 rounded-xl p-2.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[11px] text-indigo-950 font-medium">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                      <span>Target Video Release: <strong>{toDisplayDate(whatsAppModalData.releaseDate) || 'Scheduled'}</strong></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-purple-600"></span>
                      <span>📹 Asks creator to <strong>send draft cut for review before publishing</strong></span>
                    </div>
                  </div>
                </div>
              )}

              {/* Video Approved (Upload Date, Time & Buying Link Soon) Banner */}
              {whatsAppModalData.selectedTemplate === 'video_approved_details_soon' && (
                <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-green-50 border border-emerald-300 rounded-2xl p-4 shadow-sm animate-in fade-in duration-150 space-y-2.5">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-gradient-to-br from-emerald-600 to-teal-600 text-white rounded-xl shadow-xs">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-emerald-950 flex items-center gap-1.5">
                          <span>{whatsAppModalData.language === 'as' ? "ভিডিঅ' অনুমোদিত — আপল'ড সময়সূচী আৰু ক্ৰয় লিংক শীঘ্ৰেই" : "Video Approved — Upload Schedule & Buying Link Coming Soon"}</span>
                        </h4>
                        <p className="text-[11px] text-emerald-800">
                          {whatsAppModalData.language === 'as'
                            ? "ক্ৰিয়েটৰক জনাওক যে ভিডিঅ'টো অনুমোদিত হৈছে আৰু আমি অতি শীঘ্ৰেই আপল'ডৰ তাৰিখ, সময় আৰু ক্ৰয় লিংক প্ৰদান কৰিম।"
                            : "Confirm to the influencer that their video is officially approved and we will send their upload date, time & buying link very soon."}
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold uppercase bg-emerald-600 text-white px-2.5 py-0.5 rounded-full shadow-2xs">
                      {whatsAppModalData.language === 'as' ? "অনুমোদিত ✅" : "Video Approved ✅"}
                    </span>
                  </div>
                  <div className="bg-white/90 border border-emerald-200 rounded-xl p-2.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[11px] text-emerald-950 font-medium">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                      <span>✅ Video Status: <strong>Approved by Brand Team</strong></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-teal-600"></span>
                      <span>⏳ Next Step: <strong>Upload Date, Time & Buying Link shared very soon</strong></span>
                    </div>
                  </div>
                </div>
              )}

              {/* Office Hours (10 AM - 6 PM) & Video Feedback Notice Banner */}
              {whatsAppModalData.selectedTemplate === 'office_hours_feedback_notice' && (
                <div className="bg-gradient-to-r from-amber-50 via-orange-50 to-indigo-50 border border-amber-200 rounded-2xl p-4 shadow-sm animate-in fade-in duration-150 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-gradient-to-br from-amber-600 to-orange-600 text-white rounded-xl shadow-xs">
                        <Clock className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-amber-950 flex items-center gap-1.5">
                          <span>{whatsAppModalData.language === 'as' ? "অফিচ সময় (১০ AM - ৬ PM) আৰু ফিডবেক জাননী" : "Office Working Hours & Feedback Notice"}</span>
                        </h4>
                        <p className="text-[11px] text-amber-800">
                          {whatsAppModalData.language === 'as'
                            ? "অফিচৰ সময় পুৱা ১০:০০ বজাৰ পৰা সন্ধিয়া ৬:০০ বজা। সন্ধিয়া ৬ বজাৰ পিছত বা দেওবাৰে দলীয় আনুষ্ঠানিক ফিডবেক কাইলৈ দিয়া হ'ব; ব্যক্তিগতভাৱে এতিয়াও উত্তৰ দিব পাৰিব।"
                            : "Office hours are 10:00 AM to 6:00 PM. Formal team review is done tomorrow (or Monday); personal replies available now."}
                        </p>
                      </div>
                    </div>
                    
                    {/* Sunday Mode Toggle Button */}
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleToggleSundayNotice()}
                        className={`px-3 py-1 text-xs font-black rounded-lg border transition shadow-2xs cursor-pointer flex items-center gap-1.5 ${
                          whatsAppModalData.isSundayNotice
                            ? 'bg-rose-600 text-white border-rose-600 ring-2 ring-rose-400/30'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                        }`}
                        title="Click to toggle Sunday / Weekend Weekly Off notice mode"
                      >
                        <span>📅</span>
                        <span>
                          {whatsAppModalData.isSundayNotice
                            ? (whatsAppModalData.language === 'as' ? "দেওবাৰ বন্ধ সক্ৰিয় (Sunday Off: ON)" : "Sunday Notice: Active")
                            : (whatsAppModalData.language === 'as' ? "দেওবাৰৰ জাননী সক্ৰিয় কৰক" : "Set as Sunday")}
                        </span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px] font-medium text-amber-950">
                    <div className="bg-white/90 border border-amber-200/90 rounded-xl p-2.5 flex items-start gap-2 shadow-2xs">
                      <span className="text-amber-600 font-bold text-xs mt-0.5">⏰</span>
                      <div>
                        <strong className="block text-slate-900">Work Hours: 10 AM – 6 PM</strong>
                        <span className="text-[10px] text-slate-600">Review team is active Monday–Saturday during these hours.</span>
                      </div>
                    </div>
                    <div className="bg-white/90 border border-amber-200/90 rounded-xl p-2.5 flex items-start gap-2 shadow-2xs">
                      <span className="text-indigo-600 font-bold text-xs mt-0.5">☀️</span>
                      <div>
                        <strong className="block text-slate-900">
                          {whatsAppModalData.isSundayNotice ? "Sunday Off (Feedback Monday)" : "Feedback Tomorrow"}
                        </strong>
                        <span className="text-[10px] text-slate-600">
                          {whatsAppModalData.isSundayNotice ? "Review team is off on Sunday; video reviewed on Monday." : "Team feedback provided tomorrow morning."}
                        </span>
                      </div>
                    </div>
                    <div className="bg-white/90 border border-amber-200/90 rounded-xl p-2.5 flex items-start gap-2 shadow-2xs">
                      <span className="text-emerald-600 font-bold text-xs mt-0.5">💬</span>
                      <div>
                        <strong className="block text-slate-900">Personal Reply Available</strong>
                        <span className="text-[10px] text-slate-600">You can personally reply & chat now, but final sign-off is tomorrow.</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Video Upload Reminder Banner */}
              {whatsAppModalData.selectedTemplate === 'video_upload_reminder' && (
                <div className="bg-gradient-to-r from-sky-50 via-blue-50 to-indigo-50 border border-sky-200 rounded-2xl p-4 shadow-sm animate-in fade-in duration-150 space-y-2.5">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-gradient-to-br from-sky-600 to-blue-600 text-white rounded-xl shadow-xs">
                        <Bell className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-sky-950 flex items-center gap-1.5">
                          <span>{whatsAppModalData.language === 'as' ? "ভিডিঅ' আপল'ডৰ সোঁৱৰণী বাৰ্তা (Upload Reminder)" : "Video Upload Deadline Reminder"}</span>
                        </h4>
                        <p className="text-[11px] text-sky-800">
                          {whatsAppModalData.language === 'as'
                            ? "ক্ৰিয়েটৰক সময়মতে ভিডিঅ' আপল'ড কৰিবলৈ আৰু আপল'ডৰ ঠিক পাছতেই লাইভ লিংক প্ৰেৰণ কৰিবলৈ সোঁৱৰাই দিয়ক।"
                            : "Remind creator to upload their promotional video on schedule and submit the live published link immediately."}
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold uppercase bg-sky-200/80 text-sky-900 px-2.5 py-0.5 rounded-full border border-sky-300">
                      {whatsAppModalData.language === 'as' ? "জৰুৰী সোঁৱৰণী" : "Upload Reminder"}
                    </span>
                  </div>
                  <div className="bg-white/90 border border-sky-200 rounded-xl p-2.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[11px] text-sky-950 font-medium">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-sky-600"></span>
                      <span>📅 Upload Scheduled: <strong>{toDisplayDate(whatsAppModalData.uploadDate || whatsAppModalData.releaseDate) || 'As Scheduled'}</strong> at <strong>{whatsAppModalData.uploadTime || '6:00 PM'}</strong></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                      <span>📹 Reminds creator to <strong>share live video link immediately</strong></span>
                    </div>
                  </div>
                </div>
              )}

              {/* Checklist PDF Download Action Banner for Related Video Product */}
              {whatsAppModalData.selectedTemplate === 'checklist_pdf' && (
                <div className="bg-gradient-to-r from-rose-50 via-orange-50 to-amber-50 border border-rose-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs animate-in fade-in duration-150">
                  <div className="flex items-start gap-2.5">
                    <div className="p-2 bg-rose-500 text-white rounded-lg shadow-xs shrink-0 mt-0.5">
                      <FileDown className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h4 className="text-xs font-black text-rose-950 flex items-center gap-1.5 flex-wrap">
                          <span>Checklist PDF: {whatsAppModalData.productName ? `"${whatsAppModalData.productName}"` : 'Related Product'}</span>
                          <span className="text-[10px] font-mono bg-rose-100 text-rose-800 px-1.5 py-0.2 rounded border border-rose-300 font-bold">
                            Checklist-{((whatsAppModalData.productName || 'Product').replace(/[/\\?%*:|"<>]/g, '_').trim())}.pdf
                          </span>
                        </h4>
                        <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                          <Check className="w-2.5 h-2.5" />
                          <span>Identical to Central Store</span>
                        </span>
                        {lastChecklistDriveSyncTime && (
                          <span className="text-[9px] font-mono font-medium text-slate-500">
                            Synced from Drive: {lastChecklistDriveSyncTime}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-rose-800 leading-tight mt-1">
                        {whatsAppModalData.language === 'as'
                          ? "চেন্ট্ৰেল প্ৰডাক্ট ষ্টোৰৰ সৈতে হুবহু একে ইনফ্লুৱেন্সাৰ চেক-লিষ্ট PDF। ডাউনল'ড কৰাৰ সময়ত সদায় গুগল ড্ৰাইভৰ পৰা শেহতীয়া চেক-লিষ্ট স্বয়ংক্ৰিয়ভাৱে চিংক কৰা হয়।"
                          : "Identical to Central Product Checklist store. Always synchronizes the latest checklist uploaded to Google Drive from Central Product Checklist Store."}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleManualSyncChecklistsFromDrive}
                      disabled={isSyncingChecklistPdf}
                      className="px-2.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold text-xs rounded-xl shadow-2xs transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      title="Synchronize latest checklist uploaded to Google Drive"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 text-slate-600 ${isSyncingChecklistPdf ? 'animate-spin' : ''}`} />
                      <span>{isSyncingChecklistPdf ? 'Syncing...' : 'Sync from Drive'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleDownloadAndSendChecklistPdf(
                          whatsAppModalData.task,
                          whatsAppModalData.influencer,
                          whatsAppModalData.influencerName,
                          whatsAppModalData.productName,
                          whatsAppModalData.language,
                          false
                        );
                      }}
                      disabled={isSyncingChecklistPdf}
                      className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 active:scale-95 disabled:opacity-50 text-white font-black text-xs rounded-xl shadow-sm transition flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                      title="Download the Influencer Checklist PDF file (synchronized from Google Drive)"
                    >
                      {isSyncingChecklistPdf ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 text-white animate-spin" />
                          <span>{whatsAppModalData.language === 'as' ? "চিংক আৰু ডাউনল'ড..." : "Syncing & Downloading..."}</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-3.5 h-3.5 text-white" />
                          <span>{whatsAppModalData.language === 'as' ? "PDF ডাউনল'ড কৰক" : "Download PDF File"}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Video Correction / Edit Request Panel (AI Powered) */}
              {whatsAppModalData.selectedTemplate === 'video_correction' && (
                <div className="bg-gradient-to-br from-amber-50/90 via-orange-50/60 to-yellow-50/90 border border-amber-200/90 rounded-2xl p-4 shadow-sm animate-in fade-in duration-150 space-y-3.5">
                  {/* Panel Header */}
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-gradient-to-br from-amber-500 to-orange-600 text-white rounded-xl shadow-xs">
                        <Scissors className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-amber-950 flex items-center gap-1.5 flex-wrap">
                          <span>{whatsAppModalData.language === 'as' ? "ভিডিঅ' সংশোধন বা এডিটৰ নিৰ্দেশনা (Video Correction)" : "Video Correction & Edit Request"}</span>
                          <span className="bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[9px] font-black uppercase px-2 py-0.5 rounded-full shadow-2xs flex items-center gap-1">
                            <Sparkles className="w-2.5 h-2.5" />
                            <span>Gemini 3.8 Flash AI</span>
                          </span>
                        </h4>
                        <p className="text-[11px] text-amber-800">
                          {whatsAppModalData.language === 'as'
                            ? "টেক্সট বা স্ক্ৰীনশ্বট দি ক্ৰিয়েটৰলৈ সৌজন্যমূলক আৰু স্পষ্ট এডিট বা কাটৰ অনুৰোধ প্ৰস্তুত কৰক"
                            : "Input text feedback or video screenshot to generate a clear, courteous edit request"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold uppercase bg-amber-200/80 text-amber-900 px-2 py-0.5 rounded-full border border-amber-300">
                        {whatsAppModalData.language === 'as' ? "এডিট অনুৰোধ" : "Video Edit"}
                      </span>
                    </div>
                  </div>

                  {/* Input 1: Feedback Textarea with Quick Preset Chips */}
                  <div className="bg-white/90 border border-amber-200/90 rounded-xl p-3 space-y-2.5 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-black uppercase text-amber-950 flex items-center gap-1.5">
                        <span>📝</span>
                        <span>{whatsAppModalData.language === 'as' ? "সংশোধন বা এডিটৰ বিৱৰণ (Correction Notes / Feedback):" : "Correction Notes / Requested Edits:"}</span>
                      </label>
                      <span className="text-[10px] font-mono text-amber-700 font-semibold">
                        {(whatsAppModalData.correctionFeedbackText || '').length} chars
                      </span>
                    </div>

                    <textarea
                      rows={3}
                      value={whatsAppModalData.correctionFeedbackText ?? DEFAULT_CORRECTION_SAMPLE_TEXT}
                      onChange={(e) => {
                        const val = e.target.value;
                        setWhatsAppModalData(prev => {
                          if (!prev) return null;
                          const updated = getVideoCorrectionWhatsAppText(
                            prev.influencerName,
                            prev.productName,
                            val,
                            prev.language,
                            !!prev.correctionScreenshot
                          );
                          return {
                            ...prev,
                            correctionFeedbackText: val,
                            customText: updated
                          };
                        });
                      }}
                      placeholder={whatsAppModalData.language === 'as' ? "ক্ৰিয়েটৰে ভিডিঅ'ত কি সলনি বা এডিট কৰিব লাগে লিখক..." : "Describe what needs to be changed, trimmed, or fixed in the video..."}
                      className="w-full text-xs font-sans p-2.5 bg-amber-50/30 border border-amber-200 rounded-lg focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none leading-relaxed text-slate-900 shadow-inner"
                    />

                    {/* Quick Clickable Sample Chips */}
                    <div>
                      <span className="text-[10px] font-extrabold text-amber-900 block mb-1">
                        {whatsAppModalData.language === 'as' ? "দ্ৰুত নিৰ্বাচনৰ বাবে নমুনা (Quick Sample Presets):" : "Quick Sample Presets (Click to Load):"}
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {/* User's Exact Requested Sample */}
                        <button
                          type="button"
                          onClick={() => {
                            const sample = DEFAULT_CORRECTION_SAMPLE_TEXT;
                            setWhatsAppModalData(prev => {
                              if (!prev) return null;
                              const updated = getVideoCorrectionWhatsAppText(
                                prev.influencerName,
                                prev.productName,
                                sample,
                                prev.language,
                                !!prev.correctionScreenshot
                              );
                              return {
                                ...prev,
                                correctionFeedbackText: sample,
                                customText: updated
                              };
                            });
                            globalToast.info('Loaded preset: Avoid repeating platforms');
                          }}
                          className="text-[10px] px-2 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 font-bold transition cursor-pointer flex items-center gap-1 shadow-2xs"
                          title="The influencer has already mentioned the available platforms, so there is no need to mention them again. Please avoid repeating the same information twice."
                        >
                          <span>🎯</span>
                          <span>{whatsAppModalData.language === 'as' ? "প্লেটফৰ্মৰ পুনৰাবৃত্তি এৰাই চলক (Sample)" : "Avoid Repeating Platforms (Sample)"}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const text = "Please adjust the audio balance: the background music is slightly too loud in some parts and overpowers your voice. Please lower the background music by 20-30% so your voiceover is crisp and clear.";
                            setWhatsAppModalData(prev => {
                              if (!prev) return null;
                              const updated = getVideoCorrectionWhatsAppText(
                                prev.influencerName,
                                prev.productName,
                                text,
                                prev.language,
                                !!prev.correctionScreenshot
                              );
                              return {
                                ...prev,
                                correctionFeedbackText: text,
                                customText: updated
                              };
                            });
                            globalToast.info('Loaded preset: Audio balance');
                          }}
                          className="text-[10px] px-2 py-1 rounded-lg bg-white hover:bg-amber-50 text-slate-700 border border-amber-200 font-medium transition cursor-pointer flex items-center gap-1"
                        >
                          <span>🔊</span>
                          <span>{whatsAppModalData.language === 'as' ? "অডিঅ' / মিউজিক বেলেঞ্চ" : "Audio / Music Balance"}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const text = "Please make sure the product name and branding on the bottle/pack are facing directly towards the camera during the showcase shot so viewers can clearly read the label.";
                            setWhatsAppModalData(prev => {
                              if (!prev) return null;
                              const updated = getVideoCorrectionWhatsAppText(
                                prev.influencerName,
                                prev.productName,
                                text,
                                prev.language,
                                !!prev.correctionScreenshot
                              );
                              return {
                                ...prev,
                                correctionFeedbackText: text,
                                customText: updated
                              };
                            });
                            globalToast.info('Loaded preset: Clear product label');
                          }}
                          className="text-[10px] px-2 py-1 rounded-lg bg-white hover:bg-amber-50 text-slate-700 border border-amber-200 font-medium transition cursor-pointer flex items-center gap-1"
                        >
                          <span>🏷️</span>
                          <span>{whatsAppModalData.language === 'as' ? "প্ৰডাক্টৰ লেবেল স্পষ্টকৈ দেখুৱাওক" : "Show Product Label Clearly"}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const text = "Please add a clear Call to Action at the end of the video reminding viewers to check the Link in Bio / pinned comment to purchase the product.";
                            setWhatsAppModalData(prev => {
                              if (!prev) return null;
                              const updated = getVideoCorrectionWhatsAppText(
                                prev.influencerName,
                                prev.productName,
                                text,
                                prev.language,
                                !!prev.correctionScreenshot
                              );
                              return {
                                ...prev,
                                correctionFeedbackText: text,
                                customText: updated
                              };
                            });
                            globalToast.info('Loaded preset: Call to action');
                          }}
                          className="text-[10px] px-2 py-1 rounded-lg bg-white hover:bg-amber-50 text-slate-700 border border-amber-200 font-medium transition cursor-pointer flex items-center gap-1"
                        >
                          <span>🔗</span>
                          <span>{whatsAppModalData.language === 'as' ? "কল টু একশ্বন (CTA) যোগ কৰক" : "Add Call to Action (CTA)"}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const text = "Please trim the first 3 seconds of pause at the beginning so the video hooks the viewer instantly with your opening statement.";
                            setWhatsAppModalData(prev => {
                              if (!prev) return null;
                              const updated = getVideoCorrectionWhatsAppText(
                                prev.influencerName,
                                prev.productName,
                                text,
                                prev.language,
                                !!prev.correctionScreenshot
                              );
                              return {
                                ...prev,
                                correctionFeedbackText: text,
                                customText: updated
                              };
                            });
                            globalToast.info('Loaded preset: Trim intro hook');
                          }}
                          className="text-[10px] px-2 py-1 rounded-lg bg-white hover:bg-amber-50 text-slate-700 border border-amber-200 font-medium transition cursor-pointer flex items-center gap-1"
                        >
                          <span>⚡</span>
                          <span>{whatsAppModalData.language === 'as' ? "প্ৰথম অংশ ট্ৰিম কৰক" : "Trim Intro Hook"}</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Input 2: Video Screenshot Upload / Paste Box */}
                  <div className="bg-white/90 border border-amber-200/90 rounded-xl p-3 space-y-2 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-black uppercase text-amber-950 flex items-center gap-1.5">
                        <ImageIcon className="w-3.5 h-3.5 text-amber-600" />
                        <span>{whatsAppModalData.language === 'as' ? "ভিডিঅ' স্ক্ৰীনশ্বট (ঐচ্ছিক - Screenshot)" : "Video Screenshot (Optional - Image / Frame Reference):"}</span>
                      </label>
                      <span className="text-[10px] text-amber-800 bg-amber-100 px-1.5 py-0.2 rounded font-bold">
                        Ctrl + V to paste anywhere
                      </span>
                    </div>

                    {whatsAppModalData.correctionScreenshot ? (
                      <div className="flex items-center justify-between p-2.5 bg-amber-50/70 border border-amber-300 rounded-xl gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="relative group shrink-0">
                            <img
                              src={whatsAppModalData.correctionScreenshot}
                              alt="Correction screenshot preview"
                              className="w-16 h-12 object-cover rounded-lg border border-amber-300 shadow-xs group-hover:scale-105 transition"
                            />
                            <span className="absolute bottom-0 right-0 bg-black/70 text-white text-[8px] font-mono px-1 rounded-tl">
                              IMG
                            </span>
                          </div>
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-amber-950 block truncate">
                              {whatsAppModalData.correctionScreenshotName || 'video_screenshot.png'}
                            </span>
                            <span className="text-[10px] text-emerald-700 font-semibold flex items-center gap-1 mt-0.5">
                              <Check className="w-3 h-3 text-emerald-600" />
                              <span>Ready for AI visual analysis</span>
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setWhatsAppModalData(prev => prev ? {
                                ...prev,
                                correctionScreenshot: null,
                                correctionScreenshotName: null
                              } : null);
                              globalToast.info('Screenshot removed');
                            }}
                            className="p-1.5 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 rounded-lg text-xs font-bold transition cursor-pointer"
                            title="Remove screenshot"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row items-center justify-between p-3 border-2 border-dashed border-amber-200 hover:border-amber-400 rounded-xl gap-2 transition bg-amber-50/20">
                        <div className="flex items-center gap-2.5 text-left">
                          <div className="p-2 bg-amber-100 text-amber-700 rounded-lg shrink-0">
                            <ImageIcon className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-amber-950">
                              {whatsAppModalData.language === 'as' ? "স্ক্ৰীনশ্বট আপল'ড কৰক বা পেষ্ট কৰক (Ctrl + V)" : "Upload screenshot or paste (Ctrl + V)"}
                            </p>
                            <p className="text-[10px] text-slate-500">
                              {whatsAppModalData.language === 'as'
                                ? "ভিডিঅ'ৰ যি অংশত এডিট কৰিব লাগে তাৰ স্ক্ৰীনশ্বট দিয়ক"
                                : "Attach a video frame, timeline point, or issue screenshot"}
                            </p>
                          </div>
                        </div>

                        <label className="shrink-0 px-3 py-1.5 bg-white hover:bg-amber-50 text-amber-900 border border-amber-300 rounded-lg text-xs font-black shadow-2xs transition cursor-pointer flex items-center gap-1.5">
                          <Paperclip className="w-3.5 h-3.5 text-amber-600" />
                          <span>{whatsAppModalData.language === 'as' ? "ফাইল বাছনি কৰক" : "Browse Image"}</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleScreenshotFile(file);
                            }}
                          />
                        </label>
                      </div>
                    )}
                  </div>

                  {/* Input 3: Tone Selection & AI Generation Trigger Bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                    {/* Tone Options */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-extrabold text-amber-900">
                        {whatsAppModalData.language === 'as' ? "বাৰ্তাৰ সুৰ (Tone):" : "Tone:"}
                      </span>
                      {[
                        { id: 'polite', label: 'Polite & Encouraging' },
                        { id: 'direct', label: 'Direct & Clear' },
                        { id: 'urgent', label: 'Urgent / Pre-Upload' }
                      ].map(t => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            const newTone = t.id as any;
                            setWhatsAppModalData(prev => prev ? { ...prev, correctionTone: newTone } : null);
                            handleGenerateAIVideoCorrectionMessage(whatsAppModalData.correctionFeedbackText, newTone);
                          }}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer border ${
                            (whatsAppModalData.correctionTone || 'polite') === t.id
                              ? 'bg-amber-600 text-white border-amber-700 shadow-2xs'
                              : 'bg-white hover:bg-amber-100 text-amber-900 border-amber-200'
                          }`}
                          title={`Switch tone to ${t.label} and refine with AI`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>

                    {/* Generation Trigger Buttons */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const fallbackText = getVideoCorrectionWhatsAppText(
                            whatsAppModalData.influencerName,
                            whatsAppModalData.productName,
                            whatsAppModalData.correctionFeedbackText,
                            whatsAppModalData.language,
                            !!whatsAppModalData.correctionScreenshot
                          );
                          setWhatsAppModalData(prev => prev ? { ...prev, customText: fallbackText } : null);
                          globalToast.info(whatsAppModalData.language === 'as' ? "দ্ৰুত টেমপ্লেট লোড কৰা হ'ল" : "Loaded quick correction template");
                        }}
                        className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition cursor-pointer shadow-2xs"
                        title="Generate message instantly using local template"
                      >
                        <span>{whatsAppModalData.language === 'as' ? "দ্ৰুত টেমপ্লেট" : "Quick Template"}</span>
                      </button>

                      <button
                        type="button"
                        disabled={whatsAppModalData.isGeneratingCorrection}
                        onClick={() => handleGenerateAIVideoCorrectionMessage()}
                        className="px-4 py-1.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 active:scale-98 disabled:opacity-50 text-white font-black rounded-xl text-xs shadow-md shadow-amber-500/20 transition flex items-center gap-1.5 cursor-pointer"
                        title="Use Gemini AI to transform your correction notes into a natural, creator-friendly WhatsApp message"
                      >
                        {whatsAppModalData.isGeneratingCorrection ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>{whatsAppModalData.language === 'as' ? "AI তৈয়াৰ কৰি আছে..." : "Gemini Generating..."}</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>{whatsAppModalData.language === 'as' ? "AI বাৰ্তা তৈয়াৰ কৰক" : "Generate AI Message"}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Live Editable Message Textarea */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs flex-wrap gap-2">
                  <label className="font-extrabold text-slate-800 flex items-center gap-1.5">
                    <span>{whatsAppModalData.language === 'as' ? "বাৰ্তাৰ পূৰ্বদৃশ্য আৰু পৰিৱৰ্তন (Message Preview)" : "Message Preview & Customization"}</span>
                    <span className="text-[10px] font-normal text-slate-400 font-mono">
                      ({whatsAppModalData.customText.length} chars)
                    </span>
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const text = resolveDeliverableTemplateText(
                          whatsAppModalData.selectedTemplate,
                          whatsAppModalData.language,
                          whatsAppModalData.influencerName,
                          whatsAppModalData.productName,
                          whatsAppModalData.releaseDate,
                          whatsAppModalData.sampleOrderDate,
                          whatsAppModalData.amount,
                          whatsAppModalData.paymentDetails,
                          whatsAppModalData.task?.videoId,
                          whatsAppModalData.uploadDate,
                          whatsAppModalData.uploadTime,
                          whatsAppModalData.buyingLink,
                          whatsAppModalData.facebookDescLink,
                          whatsAppModalData.facebookPinCommentLink,
                          whatsAppModalData.instagramBioLink,
                          whatsAppModalData.instagramWishlink,
                          whatsAppModalData.youtubeDescLink,
                          whatsAppModalData.courierName,
                          whatsAppModalData.trackingId,
                          whatsAppModalData.correctionFeedbackText,
                          !!whatsAppModalData.correctionScreenshot
                        );
                        setWhatsAppModalData(prev => prev ? { ...prev, customText: text } : null);
                        globalToast.info(whatsAppModalData.language === 'as' ? 'বাৰ্তাৰ মূল অসমীয়া ৰূপ পুনৰ লোড কৰা হ’ল' : 'Template reset to default');
                      }}
                      className="text-[11px] font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer transition"
                      title="Reset text to default template"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>{whatsAppModalData.language === 'as' ? "টেমপ্লেট পুনৰায় সেট" : "Reset Template"}</span>
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(whatsAppModalData.customText);
                        globalToast.success('Message text copied to clipboard!');
                      }}
                      className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer transition"
                    >
                      <Copy className="w-3 h-3" />
                      <span>{whatsAppModalData.language === 'as' ? "বাৰ্তা কপি কৰক" : "Copy Message"}</span>
                    </button>
                  </div>
                </div>

                <textarea
                  rows={4}
                  value={whatsAppModalData.customText}
                  onChange={(e) => {
                    const val = e.target.value;
                    setWhatsAppModalData(prev => prev ? { ...prev, customText: val } : null);
                  }}
                  placeholder={whatsAppModalData.language === 'as' ? "হোৱাটছএপ বাৰ্তা লিখক..." : "Type your WhatsApp message..."}
                  className="w-full text-xs font-sans p-3 rounded-xl border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-hidden transition bg-slate-50/50 leading-relaxed text-slate-900"
                />
              </div>
            </div>

            {/* Footer Actions */}
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setWhatsAppModalData(null)}
                className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer"
              >
                {whatsAppModalData.language === 'as' ? "বাতিল (Cancel)" : "Cancel"}
              </button>

              <div className="flex items-center gap-2">
                {(() => {
                  const effectiveMobile = cleanSingleMobileForStorage(whatsAppModalData.influencer?.mobile || (whatsAppModalData.task as any)?.influencerMobile || getKnownMobile(whatsAppModalData.influencerName));
                  if (!effectiveMobile) {
                    return (
                      <button
                        type="button"
                        onClick={() => {
                          const d = whatsAppModalData;
                          setWhatsAppModalData(null);
                          triggerUpdateWhatsAppModal({
                            influencerId: d.influencer?.id || d.task.influencerId,
                            influencerName: d.influencerName,
                            influencerAvatar: d.influencer?.avatar,
                            influencerHandle: d.influencer?.handle,
                            currentMobile: d.influencer?.mobile,
                            messageText: d.customText,
                            contextTitle: d.productName ? `Video Deliverable (${d.productName})` : 'Video Deliverable'
                          });
                        }}
                        className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-black rounded-xl text-xs transition shadow-xs cursor-pointer flex items-center gap-1.5"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>{whatsAppModalData.language === 'as' ? "প্ৰথমে ফোন নম্বৰ যোগ কৰক" : "Add WhatsApp Number First"}</span>
                      </button>
                    );
                  }

                  return (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          openWhatsAppChat({
                            phoneNumber: effectiveMobile,
                            text: whatsAppModalData.customText,
                            preferApp: false,
                            contactName: whatsAppModalData.influencerName
                          });
                          setWhatsAppModalData(null);
                        }}
                        className="px-3.5 py-2 bg-white hover:bg-slate-100 active:scale-98 text-slate-700 font-bold rounded-xl text-xs border border-slate-300 transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                        title="Open WhatsApp Web in a browser tab"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                        <span>WhatsApp Web</span>
                      </button>

                      {whatsAppModalData.selectedTemplate === 'checklist_pdf' && (
                        <button
                          type="button"
                          disabled={isSyncingChecklistPdf}
                          onClick={async () => {
                            await handleDownloadAndSendChecklistPdf(
                              whatsAppModalData.task,
                              whatsAppModalData.influencer,
                              whatsAppModalData.influencerName,
                              whatsAppModalData.productName,
                              whatsAppModalData.language,
                              true
                            );
                            setWhatsAppModalData(null);
                          }}
                          className="px-4 py-2 bg-rose-600 hover:bg-rose-700 active:scale-98 disabled:opacity-50 text-white font-black rounded-xl text-xs shadow-md shadow-rose-500/20 transition flex items-center gap-1.5 cursor-pointer"
                          title="Download latest Influencer Checklist PDF from Google Drive and launch WhatsApp to attach it"
                        >
                          {isSyncingChecklistPdf ? (
                            <>
                              <RefreshCw className="w-4 h-4 text-white animate-spin" />
                              <span>{whatsAppModalData.language === 'as' ? "চিংক আৰু ডাউনল'ড..." : "Syncing & Downloading..."}</span>
                            </>
                          ) : (
                            <>
                              <FileDown className="w-4 h-4 text-white" />
                              <span>{whatsAppModalData.language === 'as' ? "PDF ডাউনল'ড আৰু হোৱাটছএপ" : "Download PDF & Open Chat"}</span>
                            </>
                          )}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          openWhatsAppChat({
                            phoneNumber: effectiveMobile,
                            text: whatsAppModalData.customText,
                            preferApp: true,
                            contactName: whatsAppModalData.influencerName
                          });
                          setWhatsAppModalData(null);
                        }}
                        className="px-5 py-2 bg-[#25D366] hover:bg-[#20ba59] active:scale-98 text-white font-black rounded-xl text-xs shadow-md shadow-emerald-500/20 transition flex items-center gap-2 cursor-pointer"
                        title="Open WhatsApp App directly for chat"
                      >
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                        </svg>
                        <span>{whatsAppModalData.language === 'as' ? "হোৱাটছএপ এপত খোলক (Open WhatsApp App)" : "Open WhatsApp App for Chat"}</span>
                      </button>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
