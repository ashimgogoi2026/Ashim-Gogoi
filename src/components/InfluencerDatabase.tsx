import { TriangleAlert } from 'lucide-react';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import Papa from 'papaparse';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Search, MapPin, CalendarCheck, Award, Star, IndianRupee, BarChart3, Mail, PlusCircle, Check, SlidersHorizontal, Info, Trash2, Sparkles, Cloud, MessageCircle, FileSpreadsheet, Download, Users, RefreshCw, Activity, StickyNote, Copy, ArrowRight, X, Calendar, Clock, Video, Eye, ExternalLink, UserCheck, UserPlus, Camera, Laptop, Image as ImageIcon, Clipboard, CheckCircle2, ChevronRight, FileDown, Crop, FolderDown, FileText, File, Paperclip, Film, Music, Link2, UploadCloud, ShieldCheck, ToggleLeft, ToggleRight, Zap } from 'lucide-react';
import { Influencer, Campaign, Task, Message, Contract, BillingEntry } from '../types';
import { AutoCreatorSystemStats } from '../lib/creatorAutoSystem';
import { createSyncFileOnDrive, updateSyncFileOnDrive, searchSyncFilesOnDrive, downloadSyncFileFromDrive } from '../lib/driveSync';
import { globalToast } from '../lib/toast';
import { triggerUpdateWhatsAppModal } from '../lib/whatsappPrompt';
import { openWhatsAppChat, cleanSingleMobileForStorage, formatDisplayPhone, attachCompanyBranding } from '../lib/whatsappHelper';
import GoogleDriveSync from './GoogleDriveSync';
import { User } from 'firebase/auth';
import { googleSignIn } from '../lib/firebaseAuth';
import { safeLocalStorage } from '../lib/safeLocalStorage';
import { formatToKolkataTime } from '../lib/kolkataTime';
import { ChatScreenshotCropModal } from './ChatScreenshotCropModal';
import { formatDateToDMY, getTodayKolkataISO } from '../lib/dateUtils';


const uploadImageToDrive = async (file: File, token: string): Promise<string> => {
  const metadataRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `Signature_${Date.now()}_${file.name}`, mimeType: file.type })
  });
  if (!metadataRes.ok) throw new Error("Drive metadata creation failed");
  const metadata = await metadataRes.json();
  const fileId = metadata.id;
  const mediaRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': file.type },
    body: file
  });
  if (!mediaRes.ok) throw new Error("Drive media upload failed");
  return fileId;
};

const fetchImageFromDrive = async (fileId: string, token: string): Promise<string> => {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) throw new Error("Drive download failed");
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

const COLLECTED_PORTRAITS = [
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=240", // Professional Fitness / Athletics Woman
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=240", // Marcus - Creative / Lifestyle Man
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=240", // Sarah - Business / Tech Woman
  "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=240", // Casual Tech Creative Woman
  "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&q=80&w=240", // Classic Corporate Portrait Man
  "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&q=80&w=240", // Vibrant Lifestyle Explorer Woman
  "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&q=80&w=240", // Casual Developer Man
  "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&q=80&w=240", // Stylized Editorial Fashion Woman
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=240", // Outdoor Minimalist Travel Man
  "https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&q=80&w=240", // Education & Corporate Speaker Woman
  "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&q=80&w=240", // City Street Outdoor Vibe Man
  "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&q=80&w=240", // Optimistic Studio Close-up Woman
  "https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?auto=format&fit=crop&q=80&w=240", // Creative Content Art Lead Man
  "https://images.unsplash.com/photo-1554151228-14d9def656e4?auto=format&fit=crop&q=80&w=240", // Vivid Close-up Portrait Woman
  "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&q=80&w=240"  // Tech Executive Corporate Man
];

const ASSAM_DISTRICTS = [
  "Bajali", "Baksa", "Barpeta", "Biswanath", "Bongaigaon", "Cachar", "Charaideo", "Chirang", "Darrang",
  "Dhemaji", "Dhubri", "Dibrugarh", "Dima Hasao", "Goalpara", "Golaghat", "Hailakandi", "Hojai", "Jorhat",
  "Kamrup Metropolitan", "Kamrup", "Karbi Anglong", "Karimganj", "Kokrajhar", "Lakhimpur", "Majuli",
  "Mangaldai", "Morigaon", "Nagaon", "Nalbari", "Sivasagar", "Sonitpur", "South Salmara-Mankachar", "Tezpur", "Tinsukia",
  "Udalguri", "West Karbi Anglong", "Tamulpur"
];

const INDIA_STATES = [
  "Assam", "Andhra Pradesh", "Arunachal Pradesh", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana",
  "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
  "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
  "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands",
  "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir", "Ladakh",
  "Lakshadweep", "Puducherry"
];

interface InfluencerDatabaseProps {
  initialPage?: 'main' | 'future' | 'all';
  // search?: string;
  // setSearch?: (s: string) => void;
  influencers: Influencer[];
  campaigns: Campaign[];
  tasks: Task[];
  messages: Message[];
  contracts: Contract[];
  billingEntries: BillingEntry[];
  onAssignToCampaign: (influencerId: string, campaignId: string) => void;
  onCreateTask: (influencerId: string) => void;
  onAddInfluencer: (newInfluencer: Omit<Influencer, 'id' | 'perfRanking' | 'rating'> & { status?: Influencer['status'] }) => string | void;
  onUpdateInfluencer?: (influencerId: string, updatedFields: Partial<Influencer>) => void;
  onUpdateTask?: (taskId: string, updatedFields: Partial<Task>) => void;
  onDeleteInfluencer: (influencerId: string, replacementInfluencerId?: string) => void;
  onDeleteAllInfluencers?: () => void;
  isAutoCreatorSystemEnabled?: boolean;
  onToggleAutoCreatorSystem?: (nextVal?: boolean) => void;
  onRunAutoCreatorSystemNow?: () => void;
  autoCreatorSystemStats?: AutoCreatorSystemStats;
  user: User | null;
  accessToken: string | null;
  onRestoreData: (restoredData: any) => void;
  onLoginSuccess: (currentUser: User, token: string) => void;
  onLogoutSuccess: () => void;
  onOpenSync?: () => void;
  floatingNote?: string;
  setFloatingNote?: (note: string) => void;
}

const getAnimatedStatusElement = (status: string | undefined) => {
  switch (status) {
    case 'MESSAGE SENT':
      return (
        <div className="flex items-center gap-1.5 bg-blue-100 px-2.5 py-1 rounded-md border-l-4 border-blue-500 shadow-sm text-xs font-bold text-blue-800" title="Message Sent!">
          <span className="inline-block animate-bounce" style={{animationDuration: '1s'}}>✉️</span>
          <span>SENT</span>
        </div>
      );
    case 'REPLY RECEIVED':
      return (
        <div className="flex items-center gap-1.5 bg-green-100 px-2.5 py-1 rounded-md border-l-4 border-green-500 shadow-sm text-xs font-bold text-green-800" title="Reply Received!">
          <span className="inline-block animate-bounce" style={{animationDuration: '1.2s'}}>💬</span>
          <span>REPLIED</span>
        </div>
      );
    case 'MESSAGE NOT REPLIED':
      return (
        <div className="flex items-center gap-1.5 bg-amber-100 px-2.5 py-1 rounded-md border-l-4 border-amber-500 shadow-sm text-xs font-bold text-amber-800" title="No Reply!">
          <span className="inline-block animate-bounce" style={{animationDuration: '1.5s'}}>🤷‍♂️</span>
          <span>NO REPLY</span>
        </div>
      );
    case 'AGREE FOR VIDEO PROMOTION':
      return (
        <div className="flex items-center gap-1.5 bg-emerald-100 px-2.5 py-1 rounded-md border-l-4 border-emerald-500 shadow-sm text-xs font-bold text-emerald-800" title="Agreed!">
          <span className="inline-block animate-bounce" style={{animationDuration: '1.3s'}}>🤝</span>
          <span>AGREED</span>
        </div>
      );
    case 'NOT AGREE FOR VIDEO PROMOTION':
      return (
        <div className="flex items-center gap-1.5 bg-rose-100 px-2.5 py-1 rounded-md border-l-4 border-rose-500 shadow-sm text-xs font-bold text-rose-800" title="Declined!">
          <span className="inline-block animate-bounce" style={{animationDuration: '1.4s'}}>🛑</span>
          <span>DECLINED</span>
        </div>
      );
    case 'DEMOGRAPHIC PROFILE AND ADDRESS RECEIVED':
      return (
        <div className="flex items-center gap-1.5 bg-purple-100 px-2.5 py-1 rounded-md border-l-4 border-purple-500 shadow-sm text-xs font-bold text-purple-800" title="Profile Received!">
          <span className="inline-block animate-bounce" style={{animationDuration: '1.6s'}}>📦</span>
          <span>RECEIVED</span>
        </div>
      );
    default:
      return null;
  }
};

const getCommunicationStatusColors = (status: string | undefined): string => {
  switch (status) {
    case 'MESSAGE SENT':
      return 'bg-blue-600 text-white border-blue-700 shadow-md';
    case 'REPLY RECEIVED':
      return 'bg-green-600 text-white border-green-700 shadow-md';
    case 'MESSAGE NOT REPLIED':
      return 'bg-amber-600 text-white border-amber-700 shadow-md';
    case 'AGREE FOR VIDEO PROMOTION':
      return 'bg-emerald-600 text-white border-emerald-700 shadow-md';
    case 'NOT AGREE FOR VIDEO PROMOTION':
      return 'bg-rose-600 text-white border-rose-700 shadow-md';
    case 'DEMOGRAPHIC PROFILE AND ADDRESS RECEIVED':
      return 'bg-purple-600 text-white border-purple-700 shadow-md';
    default:
      return 'bg-slate-800 text-white border-slate-900 shadow-md';
  }
};

export default function InfluencerDatabase({
  // search removed from props
  // setSearch removed from props
  influencers,
  campaigns,
  tasks,
  messages,
  contracts,
  billingEntries,
  onAssignToCampaign,
  onCreateTask,
  onAddInfluencer,
  onUpdateInfluencer,
  onUpdateTask,
  onDeleteInfluencer,
  onDeleteAllInfluencers,
  isAutoCreatorSystemEnabled = true,
  onToggleAutoCreatorSystem,
  onRunAutoCreatorSystemNow,
  autoCreatorSystemStats,
  user,
  accessToken,
  onRestoreData,
  onLoginSuccess,
  onLogoutSuccess,
  onOpenSync,
  floatingNote,
  setFloatingNote,
  initialPage
}: InfluencerDatabaseProps) {
  const [showSyncSection, setShowSyncSection] = useState(false);
  const [databasePage, setDatabasePage] = useState<'main' | 'future' | 'all'>(() => {
    if (initialPage) return initialPage;
    const saved = safeLocalStorage.getItem('INFLUENCER_DB_PAGE');
    if (saved === 'future' || saved === 'all' || saved === 'main') return saved;
    return 'main';
  });
  const [futureCommFilter, setFutureCommFilter] = useState<string>('All');
  const [newCreatorStatus, setNewCreatorStatus] = useState<'Available' | 'Future Creator'>('Future Creator');

  useEffect(() => {
    if (initialPage && (initialPage === 'future' || initialPage === 'main' || initialPage === 'all')) {
      setDatabasePage(initialPage);
    }
  }, [initialPage]);

  const handleSwitchPage = (page: 'main' | 'future' | 'all') => {
    setDatabasePage(page);
    safeLocalStorage.setItem('INFLUENCER_DB_PAGE', page);
  };

  const [search, setSearch] = useState('');
  const [selectedNiche, setSelectedNiche] = useState('All');
  const [minEngagement, setMinEngagement] = useState<number>(0);
  const [showOnlyDuplicates, setShowOnlyDuplicates] = useState(false);
  const [selectedInfluencer, setSelectedInfluencer] = useState<Influencer | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [selectedCampId, setSelectedCampId] = useState('');
  const [showBillModal, setShowBillModal] = useState(false);
  const [billFile, setBillFile] = useState<File | null>(null);
  const [isExtractingBill, setIsExtractingBill] = useState(false);
  const [billData, setBillData] = useState({ invoiceNumber: '', date: new Date().toISOString().split('T')[0], amount: '', services: 'Content Creation & Promotion', signaturePresent: false, signatureImage: '' });
  const [billSuccessMessage, setBillSuccessMessage] = useState<string | null>(null);

  // Screen Capture & Influencer Files Download States for Future Creators
  const [screenCaptureModal, setScreenCaptureModal] = useState<{
    isOpen: boolean;
    influencer: Influencer;
    platform: 'WhatsApp' | 'Instagram' | 'Facebook' | 'General';
    activeTab?: 'capture' | 'influencer_files';
  } | null>(null);

  const [captureModalTab, setCaptureModalTab] = useState<'capture' | 'influencer_files'>('capture');
  const [selectedFileCategory, setSelectedFileCategory] = useState<string>('Received from Influencer');
  const [fileUrlInput, setFileUrlInput] = useState<string>('');
  const [isFetchingUrl, setIsFetchingUrl] = useState<boolean>(false);

  const [isCapturingScreen, setIsCapturingScreen] = useState(false);
  const [capturedPreview, setCapturedPreview] = useState<{
    dataUrl: string;
    fileName: string;
    platform: string;
    fileKind?: string;
    fileSize?: number;
  } | null>(null);

  // Crop Tool Modal state
  const [cropModal, setCropModal] = useState<{
    isOpen: boolean;
    influencer: Influencer;
    imageUrl: string;
    fileName: string;
    platform: string;
    screenshotId?: string;
  } | null>(null);

  const [autoOpenCrop, setAutoOpenCrop] = useState<boolean>(() => {
    return safeLocalStorage.getItem('future_creator_auto_open_crop') === 'true';
  });

  // Gallery viewer for saved screenshots
  const [viewScreenshotsModal, setViewScreenshotsModal] = useState<{
    isOpen: boolean;
    influencer: Influencer;
  } | null>(null);

  // Floating Chat Opened notification bar
  const [activeChatAlert, setActiveChatAlert] = useState<{
    influencer: Influencer;
    platform: 'WhatsApp' | 'Instagram' | 'Facebook';
  } | null>(null);

  // Helper: Trigger direct download to PC
  const triggerBlobDownload = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
  };

  // Helper: Convert Blob to Data URL
  const blobToDataUrl = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // Helper: Process and save blob to PC and influencer profile
  const processAndSaveBlob = async (
    blob: Blob,
    influencer: Influencer,
    platform: string,
    sourceLabel = 'Screen_Capture'
  ) => {
    try {
      const cleanName = (influencer.name || 'Creator').replace(/[^a-zA-Z0-9_-]/g, '_');
      const now = new Date();
      const dateTag = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
      const fileName = `FutureCreator_${cleanName}_${platform}_Chat_${dateTag}.png`;

      // 1. Instantly download directly to PC
      triggerBlobDownload(blob, fileName);

      // 2. Convert to Data URL for in-app preview and storage
      const dataUrl = await blobToDataUrl(blob);

      // 3. Save into creator's chatScreenshots array
      const newScreenshot = {
        id: `ss_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        platform,
        fileName,
        dataUrl,
        capturedAt: new Date().toISOString(),
        source: sourceLabel
      };

      const existingScreenshots = Array.isArray(influencer.chatScreenshots) ? influencer.chatScreenshots : [];
      const updatedScreenshots = [newScreenshot, ...existingScreenshots];

      if (onUpdateInfluencer) {
        onUpdateInfluencer(influencer.id, { chatScreenshots: updatedScreenshots });
      }

      setCapturedPreview({
        dataUrl,
        fileName,
        platform
      });

      if (autoOpenCrop) {
        setCropModal({
          isOpen: true,
          influencer,
          imageUrl: dataUrl,
          fileName,
          platform,
          screenshotId: newScreenshot.id
        });
      }

      globalToast.success(`📸 "${fileName}" downloaded directly to your PC and saved to ${influencer.name}!`);
    } catch (err: any) {
      console.error('[Screenshot Processing Error]', err);
      globalToast.error(`Failed to process screenshot: ${err.message || 'Unknown error'}`);
    }
  };

  // Helper: Handle saving cropped screenshot back to influencer and preview
  const handleSaveCrop = (croppedDataUrl: string, croppedBlob: Blob, newFileName: string) => {
    if (!cropModal) return;
    const targetInfluencer = cropModal.influencer;

    const newScreenshot = {
      id: `ss_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      platform: cropModal.platform,
      fileName: newFileName,
      dataUrl: croppedDataUrl,
      capturedAt: new Date().toISOString(),
      source: 'Cropped_Chat'
    };

    const existingScreenshots = Array.isArray(targetInfluencer.chatScreenshots) ? targetInfluencer.chatScreenshots : [];
    const updatedScreenshots = [newScreenshot, ...existingScreenshots];

    if (onUpdateInfluencer) {
      onUpdateInfluencer(targetInfluencer.id, { chatScreenshots: updatedScreenshots });
    }

    setCapturedPreview({
      dataUrl: croppedDataUrl,
      fileName: newFileName,
      platform: cropModal.platform
    });

    setViewScreenshotsModal(prev => prev ? {
      ...prev,
      influencer: { ...prev.influencer, chatScreenshots: updatedScreenshots }
    } : null);
  };

  // Helper: Process and save any file/image sent by the influencer on WhatsApp, Instagram, Facebook, etc.
  const processAndSaveInfluencerFile = async (
    file: File | Blob,
    influencer: Influencer,
    platform: string,
    categoryLabel = 'Sent by Influencer',
    customFileName?: string
  ) => {
    try {
      const cleanName = (influencer.name || 'Creator').replace(/[^a-zA-Z0-9_-]/g, '_');
      const now = new Date();
      const dateTag = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;

      let rawName = customFileName || ('name' in file ? (file as any).name : `File_${dateTag}`);
      const cleanRawName = rawName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const fileName = `FutureCreator_${cleanName}_${platform}_${cleanRawName.startsWith('FutureCreator_') ? cleanRawName : `${dateTag}_${cleanRawName}`}`;

      // 1. Instantly trigger direct download to PC
      triggerBlobDownload(file, fileName);

      // 2. Convert to Data URL for preview & offline cache
      const dataUrl = await blobToDataUrl(file);

      // 3. Determine file kind
      let fileKind: 'image' | 'pdf' | 'video' | 'audio' | 'document' | 'other' = 'other';
      const mime = (file.type || '').toLowerCase();
      const lowerName = fileName.toLowerCase();

      if (mime.startsWith('image/') || lowerName.match(/\.(png|jpe?g|webp|gif|svg|avif)$/)) {
        fileKind = 'image';
      } else if (mime.includes('pdf') || lowerName.endsWith('.pdf')) {
        fileKind = 'pdf';
      } else if (mime.startsWith('video/') || lowerName.match(/\.(mp4|webm|mov|mkv|avi)$/)) {
        fileKind = 'video';
      } else if (mime.startsWith('audio/') || lowerName.match(/\.(mp3|wav|ogg|m4a|aac)$/)) {
        fileKind = 'audio';
      } else if (
        mime.includes('word') ||
        mime.includes('document') ||
        mime.includes('sheet') ||
        mime.includes('excel') ||
        mime.includes('presentation') ||
        mime.includes('text') ||
        lowerName.match(/\.(docx?|xlsx?|csv|pptx?|txt)$/)
      ) {
        fileKind = 'document';
      }

      const newAttachment = {
        id: `file_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        platform,
        fileName,
        originalName: rawName,
        fileSize: file.size,
        mimeType: file.type || 'application/octet-stream',
        fileKind,
        fileCategory: categoryLabel,
        dataUrl,
        capturedAt: new Date().toISOString(),
        source: `Influencer_${platform}_Sent_File`
      };

      const existingScreenshots = Array.isArray(influencer.chatScreenshots) ? influencer.chatScreenshots : [];
      const updatedScreenshots = [newAttachment, ...existingScreenshots];

      if (onUpdateInfluencer) {
        onUpdateInfluencer(influencer.id, { chatScreenshots: updatedScreenshots });
      }

      setCapturedPreview({
        dataUrl,
        fileName,
        platform,
        fileKind,
        fileSize: file.size
      });

      if (fileKind === 'image' && autoOpenCrop) {
        setCropModal({
          isOpen: true,
          influencer,
          imageUrl: dataUrl,
          fileName,
          platform,
          screenshotId: newAttachment.id
        });
      }

      globalToast.success(`📥 "${fileName}" downloaded directly to your PC and saved to ${influencer.name}!`);
    } catch (err: any) {
      console.error('[Influencer File Processing Error]', err);
      globalToast.error(`Failed to process file: ${err.message || 'Unknown error'}`);
    }
  };

  // Helper: Download file from external URL provided by influencer
  const handleDownloadFromUrl = async (url: string, influencer: Influencer, platform: string, categoryLabel: string) => {
    if (!url || !url.trim()) {
      globalToast.info('Please enter or paste a valid file or image URL.');
      return;
    }
    const cleanUrl = url.trim();
    setIsFetchingUrl(true);
    try {
      globalToast.info('Fetching file from link for PC download...');
      const response = await fetch(cleanUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const urlFileName = cleanUrl.split('/').pop()?.split('?')[0] || `Influencer_Media`;
      await processAndSaveInfluencerFile(blob, influencer, platform, categoryLabel, urlFileName);
      setFileUrlInput('');
    } catch (err: any) {
      try {
        const cleanName = (influencer.name || 'Creator').replace(/[^a-zA-Z0-9_-]/g, '_');
        const a = document.createElement('a');
        a.href = cleanUrl;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.download = `FutureCreator_${cleanName}_${platform}_Download`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => document.body.removeChild(a), 500);
        globalToast.success('Opening file download link directly in your browser!');
        setFileUrlInput('');
      } catch (e) {
        globalToast.error('Could not download file from this URL. Try saving it to PC first, then dropping it here.');
      }
    } finally {
      setIsFetchingUrl(false);
    }
  };

  // Helper: Launch Display Media Screen Capture
  const handleExecuteScreenCapture = async (influencer: Influencer, platform: string) => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      globalToast.error('Screen capture is not supported in this browser. Please use Google Chrome, Edge, or Firefox.');
      return;
    }

    setIsCapturingScreen(true);
    try {
      // Prompt user to select WhatsApp, Instagram, or desktop chat window
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always'
        } as any,
        audio: false
      });

      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      await video.play();

      // Give 250ms for frame buffer to render crisp pixels
      await new Promise(r => setTimeout(r, 250));

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1920;
      canvas.height = video.videoHeight || 1080;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        stream.getTracks().forEach(t => t.stop());
        throw new Error('Canvas 2D context unavailable');
      }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Stop stream immediately so sharing bar turns off cleanly
      stream.getTracks().forEach(track => track.stop());

      canvas.toBlob(async (blob) => {
        if (!blob) {
          globalToast.error('Failed to convert canvas to image blob');
          setIsCapturingScreen(false);
          return;
        }
        await processAndSaveBlob(blob, influencer, platform, 'Window_Capture');
        setIsCapturingScreen(false);
      }, 'image/png', 0.98);
    } catch (err: any) {
      setIsCapturingScreen(false);
      if (err.name === 'NotAllowedError') {
        globalToast.info('Screen capture cancelled or window not selected.');
      } else {
        console.error('[Screen Capture Error]', err);
        globalToast.error(`Capture error: ${err.message || 'Could not capture screen'}`);
      }
    }
  };

  // Helper: Paste from Clipboard (reading clipboard image or shortcut)
  const handlePasteClipboardImage = async (influencer: Influencer, platform: string) => {
    try {
      if (!navigator.clipboard || !navigator.clipboard.read) {
        globalToast.info('Press Ctrl + V on your keyboard inside this window to paste your screenshot.');
        return;
      }
      const items = await navigator.clipboard.read();
      let found = false;
      for (const item of items) {
        const imageType = item.types.find(t => t.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          await processAndSaveBlob(blob, influencer, platform, 'Clipboard_Paste');
          found = true;
          break;
        }
      }
      if (!found) {
        globalToast.info('No screenshot found on clipboard. Use (Win + Shift + S) or (Cmd + Shift + 4) first, then click Paste or press Ctrl + V.');
      }
    } catch (err: any) {
      globalToast.info('Press Ctrl + V on your keyboard inside this dialog to paste screenshot.');
    }
  };

  // Listen to Ctrl+V paste event when screen capture modal is open
  useEffect(() => {
    if (!screenCaptureModal?.isOpen) return;

    const handleWindowPaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          if (file.type.startsWith('image/')) {
            await processAndSaveBlob(file, screenCaptureModal.influencer, screenCaptureModal.platform, 'Keyboard_Paste');
          } else {
            await processAndSaveInfluencerFile(file, screenCaptureModal.influencer, screenCaptureModal.platform, 'Keyboard_Paste');
          }
          break;
        }
      }
    };

    window.addEventListener('paste', handleWindowPaste);
    return () => window.removeEventListener('paste', handleWindowPaste);
  }, [screenCaptureModal]);

  useEffect(() => {
    if (selectedInfluencer && showBillModal) {
      if (selectedInfluencer.lastBillData) {
        setBillData(selectedInfluencer.lastBillData);
      } else {
        setBillData({ invoiceNumber: '', date: new Date().toISOString().split('T')[0], amount: '', services: 'Content Creation & Promotion', signaturePresent: false, signatureImage: '' });
      }
      setBillSuccessMessage(null);
    }
  }, [selectedInfluencer, showBillModal]);

  // Video view & exact upload timestamp tracking state for influencers
  const [videoMetadataMap, setVideoMetadataMap] = useState<Record<string, { loading?: boolean; data?: any }>>({});
  const [isFetchingInfluencerVideos, setIsFetchingInfluencerVideos] = useState(false);

  const getTaskEffectiveViews = (t: Task) => {
    let extractedSum = 0;
    let hasExtracted = false;
    [t.videoLink1, t.videoLink2, t.videoLink3].forEach(link => {
      if (link && videoMetadataMap[link]?.data?.views !== undefined && videoMetadataMap[link]?.data?.views !== null) {
        const v = Number(videoMetadataMap[link].data.views);
        if (!isNaN(v) && v >= 0) {
          extractedSum += v;
          hasExtracted = true;
        }
      }
    });
    if (hasExtracted && extractedSum > 0) {
      return Math.max(extractedSum, t.views || 0);
    }
    return t.views || 0;
  };

  const fetchVideoMetadata = async (url: string, taskId?: string) => {
    if (!url || !url.startsWith('http')) return;
    setVideoMetadataMap(prev => ({
      ...prev,
      [url]: { ...prev[url], loading: true }
    }));
    try {
      const res = await fetch('/api/link-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const json = await res.json();
      if (json.success) {
        setVideoMetadataMap(prev => ({
          ...prev,
          [url]: { loading: false, data: json }
        }));
        if (onUpdateTask) {
          const targetTask = taskId 
            ? tasks.find(t => t.id === taskId) 
            : tasks.find(t => t.videoLink1 === url || t.videoLink2 === url || t.videoLink3 === url);
          if (targetTask) {
            const updates: Partial<Task> = {};
            if (json.publishedTime) {
              updates.uploadTime = json.publishedTime;
            }
            if (json.publishedDate) {
              updates.releaseDate = json.publishedDate;
            }
            const fetchedViews = json.views !== undefined ? json.views : json.data?.views;
            if (fetchedViews !== undefined && fetchedViews !== null) {
              const parsedV = Number(fetchedViews);
              if (!isNaN(parsedV) && parsedV >= 0) {
                let linkViewsSum = 0;
                let hasViews = false;
                [targetTask.videoLink1, targetTask.videoLink2, targetTask.videoLink3].forEach(l => {
                  if (l) {
                    const lViews = l === url ? parsedV : Number(videoMetadataMap[l]?.data?.views || 0);
                    if (lViews > 0) {
                      linkViewsSum += lViews;
                      hasViews = true;
                    }
                  }
                });
                const finalTaskViews = hasViews ? Math.max(linkViewsSum, parsedV) : parsedV;
                updates.views = finalTaskViews;

                const remunerationValue = Math.max(0, Number(targetTask.remuneration) || 0);
                const clicksValue = Math.max(0, Number(targetTask.clicks) || 0);
                const ctrValue = finalTaskViews > 0 ? parseFloat(((clicksValue / finalTaskViews) * 100).toFixed(2)) : 0;
                const cpvValue = finalTaskViews > 0 ? parseFloat((remunerationValue / finalTaskViews).toFixed(3)) : 0;
                updates.ctr = isNaN(ctrValue) ? 0 : ctrValue;
                updates.cpv = isNaN(cpvValue) ? 0 : cpvValue;
              }
            }
            if (Object.keys(updates).length > 0) {
              onUpdateTask(targetTask.id, updates);
            }
          }
        }
      } else {
        setVideoMetadataMap(prev => ({
          ...prev,
          [url]: { loading: false, data: null }
        }));
      }
    } catch {
      setVideoMetadataMap(prev => ({
        ...prev,
        [url]: { loading: false, data: null }
      }));
    }
  };

  const fetchAllVideosForInfluencer = async (infTasks: Task[]) => {
    setIsFetchingInfluencerVideos(true);
    const urls: string[] = [];
    infTasks.forEach(t => {
      [t.videoLink1, t.videoLink2, t.videoLink3].forEach(link => {
        if (link && typeof link === 'string' && link.startsWith('http')) urls.push(link);
      });
    });
    await Promise.all(urls.map(url => fetchVideoMetadata(url)));
    setIsFetchingInfluencerVideos(false);
  };

  useEffect(() => {
    if (selectedInfluencer) {
      const influencerTasks = tasks.filter(t => t.influencerId === selectedInfluencer.id);
      influencerTasks.forEach(t => {
        [t.videoLink1, t.videoLink2, t.videoLink3].forEach(link => {
          if (link && typeof link === 'string' && link.startsWith('http') && !videoMetadataMap[link]) {
            fetchVideoMetadata(link);
          }
        });
      });
    }
  }, [selectedInfluencer?.id, tasks]);

  // Auto-sync extracted live video views directly to tasks store whenever videoMetadataMap updates
  useEffect(() => {
    if (!onUpdateTask || !selectedInfluencer) return;
    const influencerTasks = tasks.filter(t => t.influencerId === selectedInfluencer.id);
    influencerTasks.forEach(t => {
      let extractedSum = 0;
      let hasExtracted = false;
      [t.videoLink1, t.videoLink2, t.videoLink3].forEach(link => {
        if (link && videoMetadataMap[link]?.data?.views !== undefined && videoMetadataMap[link]?.data?.views !== null) {
          const v = Number(videoMetadataMap[link].data.views);
          if (!isNaN(v) && v >= 0) {
            extractedSum += v;
            hasExtracted = true;
          }
        }
      });

      if (hasExtracted && extractedSum > 0 && extractedSum !== t.views) {
        const remunerationValue = Math.max(0, Number(t.remuneration) || 0);
        const clicksValue = Math.max(0, Number(t.clicks) || 0);
        const ctrValue = extractedSum > 0 ? parseFloat(((clicksValue / extractedSum) * 100).toFixed(2)) : 0;
        const cpvValue = extractedSum > 0 ? parseFloat((remunerationValue / extractedSum).toFixed(3)) : 0;
        
        onUpdateTask(t.id, {
          views: extractedSum,
          ctr: isNaN(ctrValue) ? 0 : ctrValue,
          cpv: isNaN(cpvValue) ? 0 : cpvValue,
        });
      }
    });
  }, [videoMetadataMap, selectedInfluencer?.id, tasks, onUpdateTask]);


  // DM Template State
  const [dmTemplate, setDmTemplate] = useState<string>(() => {
    return safeLocalStorage.getItem('INFLUENCER_MANAGER_DM_TEMPLATE') || "Hi {name},\n\nWe love your content and would like to collaborate with you! Please let us know if you're interested.\n\nBest,\nPro-To-Grow Team";
  });
  const [showDmTemplateEditor, setShowDmTemplateEditor] = useState(false);

  const [dmTemplate2, setDmTemplate2] = useState<string>(() => {
    return safeLocalStorage.getItem('INFLUENCER_MANAGER_DM_TEMPLATE_2') || "Hi {name},\n\nFollowing up on my previous message. Let me know if you are open to collaborating!\n\nBest,\nPro-To-Grow Team";
  });
  const [showDmTemplate2Editor, setShowDmTemplate2Editor] = useState(false);

  useEffect(() => {
    safeLocalStorage.setItem('INFLUENCER_MANAGER_DM_TEMPLATE', dmTemplate);
  }, [dmTemplate]);

  useEffect(() => {
    safeLocalStorage.setItem('INFLUENCER_MANAGER_DM_TEMPLATE_2', dmTemplate2);
  }, [dmTemplate2]);

  // Sourced creator form states
  const [showAddCreatorForm, setShowAddCreatorForm] = useState(false);
  const [newCreatorName, setNewCreatorName] = useState('');
  const [newCreatorSex, setNewCreatorSex] = useState<'Male' | 'Female' | 'Others'>('Female');
  const [isCustomAvatarUploaded, setIsCustomAvatarUploaded] = useState(false);
  const [newCreatorFacebook, setNewCreatorFacebook] = useState('');
  const [newCreatorInstagram, setNewCreatorInstagram] = useState('');
  const [newCreatorYoutube, setNewCreatorYoutube] = useState('');
  
  const [smartPasteText, setSmartPasteText] = useState('');
  const [isSmartParsing, setIsSmartParsing] = useState(false);
  const [smartParseError, setSmartParseError] = useState<string | null>(null);
  const [newCreatorAvatar, setNewCreatorAvatar] = useState('https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=240'); 
  const [newCreatorNiche, setNewCreatorNiche] = useState('');
  const [newCreatorFollowers, setNewCreatorFollowers] = useState('');
  const [isCollectingFollowers, setIsCollectingFollowers] = useState(false);
  const [followerCollectionStatus, setFollowerCollectionStatus] = useState<{
    total: number;
    formatted: string;
    breakdown?: { instagram: number; youtube: number; facebook: number };
    verified?: boolean;
    details?: string;
  } | null>(null);

  const formatFollowerMetric = (val: number | string): string => {
    const num = typeof val === 'number' ? val : parseFloat(val) || 0;
    if (num >= 1000000000) return `${(num / 1000000000).toFixed(1).replace(/\.0$/, '')}B`;
    if (num >= 1000000) return `${(num / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1).replace(/\.0$/, '')}K`;
    return String(num || 0);
  };

  // Helper to parse country code and phone number for UI inputs
  const parsePhoneCountryAndNumber = (rawPhone?: string): { countryCode: string; number: string } => {
    if (!rawPhone) return { countryCode: '+91', number: '' };
    let str = String(rawPhone).trim();
    const knownCodes = ['+91', '+1', '+44', '+61', '+81', '+49', '+33', '+55', '+65', '+971', '+27'];

    for (const code of knownCodes) {
      if (str.startsWith(code)) {
        const rest = str.slice(code.length).trim().replace(/^[\s\-]+/, '');
        return { countryCode: code, number: rest };
      }
    }

    if (str.startsWith('00')) {
      str = '+' + str.slice(2);
      for (const code of knownCodes) {
        if (str.startsWith(code)) {
          const rest = str.slice(code.length).trim().replace(/^[\s\-]+/, '');
          return { countryCode: code, number: rest };
        }
      }
    }

    const digits = str.replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('91')) {
      const main = digits.slice(2);
      return { countryCode: '+91', number: `${main.slice(0, 5)} ${main.slice(5)}` };
    }
    if (digits.length === 10) {
      return { countryCode: '+91', number: `${digits.slice(0, 5)} ${digits.slice(5)}` };
    }
    if (digits.length === 11 && digits.startsWith('0')) {
      const main = digits.slice(1);
      return { countryCode: '+91', number: `${main.slice(0, 5)} ${main.slice(5)}` };
    }

    return { countryCode: '+91', number: str };
  };

  // Helper to immediately extract phone numbers if found in pasted text or URLs
  const extractQuickPhoneFromText = (text: string): { primary?: string; secondary?: string } => {
    if (!text) return {};
    const labeledRegex = /(?:whatsapp|wa|mob|mobile|call|ph|phone|tel|contact|booking|collab|collaboration|manager)[^\w\d+]{1,6}((?:(?:\+|00)\d{1,3}[\s\-]?)?(?:\(?\d{2,5}\)?[\s\-]?)?\d{3,5}[\s\-]?\d{3,5})/gi;
    const found: string[] = [];
    let m;
    while ((m = labeledRegex.exec(text)) !== null) {
      const clean = m[1].replace(/[\.,;:!?'")\]]+$/, '').trim();
      if (clean.replace(/\D/g, '').length >= 8) found.push(clean);
    }
    const indianRegex = /(?:(?:\+|00)91[\s\-]?)?(?:0)?[6-9]\d{4}[\s\-]?\d{5}\b/g;
    while ((m = indianRegex.exec(text)) !== null) {
      const clean = m[0].replace(/[\.,;:!?'")\]]+$/, '').trim();
      if (clean.replace(/\D/g, '').length >= 10) found.push(clean);
    }
    const unique = Array.from(new Set(found));
    return { primary: unique[0], secondary: unique[1] };
  };

  // Dedicated Real Follower Collector: Queries backend scrapers & live search grounding
  const handleCollectRealFollowers = async (overrideParams?: {
    facebook?: string;
    instagram?: string;
    youtube?: string;
    name?: string;
  }): Promise<number> => {
    const fb = (overrideParams?.facebook !== undefined ? overrideParams.facebook : newCreatorFacebook).trim();
    const ig = (overrideParams?.instagram !== undefined ? overrideParams.instagram : newCreatorInstagram).trim();
    const yt = (overrideParams?.youtube !== undefined ? overrideParams.youtube : newCreatorYoutube).trim();
    const nm = (overrideParams?.name !== undefined ? overrideParams.name : newCreatorName).trim();

    if (!fb && !ig && !yt && !nm) {
      return 0;
    }

    setIsCollectingFollowers(true);
    try {
      const response = await fetch('/api/collect-creator-followers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nm,
          instagramLink: ig,
          youtubeLink: yt,
          facebookLink: fb,
          text: smartPasteText
        })
      });

      if (!response.ok) throw new Error(`Follower collector responded with ${response.status}`);
      const resData = await response.json();

      if (resData && resData.success) {
        const total = Number(resData.totalFollowers) || 0;
        if (total > 0) {
          setNewCreatorFollowers(String(total));
          globalToast.success(`⚡ Verified ${resData.formattedTotal || formatFollowerMetric(total)} Real Followers for ${nm || 'Creator'}!`);
        } else {
          globalToast.info("Could not auto-detect live followers. You can manually enter the count.");
        }
        setFollowerCollectionStatus({
          total,
          formatted: resData.formattedTotal || formatFollowerMetric(total),
          breakdown: resData.breakdown,
          verified: resData.verified,
          details: resData.sourceDetails
        });

        // Automatically detect and populate mobile numbers from creator's public profile/bio
        if (resData.detectedMobile) {
          const parsedPrimary = parsePhoneCountryAndNumber(resData.detectedMobile);
          if (!newCreatorMobile.trim()) {
            setSelectedCountryCode(parsedPrimary.countryCode);
            setNewCreatorMobile(parsedPrimary.number);
            globalToast.success(`📱 Auto-detected contact number from profile: ${resData.detectedMobile}`);
          }
        }
        if (resData.detectedSecondaryMobile) {
          const parsedSecondary = parsePhoneCountryAndNumber(resData.detectedSecondaryMobile);
          if (!newCreatorSecondaryMobile.trim()) {
            setSelectedSecondaryCountryCode(parsedSecondary.countryCode);
            setNewCreatorSecondaryMobile(parsedSecondary.number);
            setShowSecondaryMobile(true);
            globalToast.info(`📱 Auto-detected second mobile: ${resData.detectedSecondaryMobile}`);
          }
        }

        // Sync individual platform states
        if (resData.breakdown) {
          if (resData.breakdown.instagram > 0) {
            setInstaFollowers(formatFollowerMetric(resData.breakdown.instagram));
          }
          if (resData.breakdown.youtube > 0) {
            setYoutubeFollowers(formatFollowerMetric(resData.breakdown.youtube));
          }
          if (resData.breakdown.facebook > 0) {
            setFacebookFollowers(formatFollowerMetric(resData.breakdown.facebook));
          }
        }
        return total;
      }
    } catch (err: any) {
      console.error('Error collecting live creator followers:', err);
      globalToast.error(`Could not collect followers: ${err.message || 'Check connection'}`);
    } finally {
      setIsCollectingFollowers(false);
    }
    return 0;
  };
  const [newCreatorEngagement, setNewCreatorEngagement] = useState('4.5');
  const [newCreatorAddress, setNewCreatorAddress] = useState('');
  const [newCreatorCost, setNewCreatorCost] = useState('');
  const [newCreatorROI, setNewCreatorROI] = useState('3.2');
  const [newCreatorMobile, setNewCreatorMobile] = useState('');
  const [selectedCountryCode, setSelectedCountryCode] = useState('+91');
  const [newCreatorSecondaryMobile, setNewCreatorSecondaryMobile] = useState('');
  const [selectedSecondaryCountryCode, setSelectedSecondaryCountryCode] = useState('+91');
  const [showSecondaryMobile, setShowSecondaryMobile] = useState(false);
  const [newCreatorEntryDate, setNewCreatorEntryDate] = useState(() => getTodayKolkataISO());

  // Server-side links analysis for Onboarding Creator
  const [onboardingLinkAnalysis, setOnboardingLinkAnalysis] = useState<any>(null);
  const [isOnboardingAnalyzing, setIsOnboardingAnalyzing] = useState(false);
  const [onboardingAnalysisError, setOnboardingAnalysisError] = useState<string | null>(null);

  const handleSmartParse = async () => {
    if (!smartPasteText.trim()) return;
    setSmartParseError(null);
    setIsSmartParsing(true);
    try {
      const response = await fetch('/api/parse-creator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: smartPasteText })
      });
      if (!response.ok) throw new Error(`Server responded with ${response.status}`);
      const resData = await response.json();
      if (resData.success && resData.data) {
        const d = resData.data;
        let extractedName = (d.name && d.name.toLowerCase() !== 'unknown' && d.name.toLowerCase() !== 'extracted creator') ? d.name.toUpperCase() : '';
        
        const extractHandle = (url: string) => {
          if (!url) return null;
          try {
            if (url.startsWith('@')) return url.replace(/^@/, '');
            if (!url.includes('.') && !url.includes('/')) return url;
            
            let cleanUrl = url;
            if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
              cleanUrl = 'https://' + cleanUrl;
            }
            const u = new URL(cleanUrl);
            const username = u.pathname.replace(/\/$/, '').split('/').pop();
            return username && !username.includes('.php') ? username.replace(/^@/, '') : null;
          } catch(e) {
            return null;
          }
        };

        if (!extractedName && d.instagramLink) {
          const handle = extractHandle(d.instagramLink);
          if (handle) extractedName = handle.toUpperCase();
        }
        if (!extractedName && d.facebookLink) {
          const handle = extractHandle(d.facebookLink);
          if (handle) extractedName = handle.toUpperCase();
        }
        if (!extractedName && d.youtubeLink) {
          const handle = extractHandle(d.youtubeLink);
          if (handle) extractedName = handle.toUpperCase();
        }
        
        if (extractedName) setNewCreatorName(extractedName);
        
        if (d.sex) {
          const s = d.sex.toString().toLowerCase();
          if (s === 'male') setNewCreatorSex('Male');
          else if (s === 'female') setNewCreatorSex('Female');
          else setNewCreatorSex('Others');
        }
        if (d.facebookLink) setNewCreatorFacebook(d.facebookLink);
        if (d.instagramLink) setNewCreatorInstagram(d.instagramLink);
        if (d.youtubeLink) setNewCreatorYoutube(d.youtubeLink);
        if (d.niche) setNewCreatorNiche(d.niche);
        
        // Handle Real Total Followers collected by backend engine
        const realFollowerCount = Number(d.totalFollowers || d.followers) || 0;
        if (realFollowerCount > 0) {
          setNewCreatorFollowers(String(realFollowerCount));
          setFollowerCollectionStatus({
            total: realFollowerCount,
            formatted: d.formattedFollowers || formatFollowerMetric(realFollowerCount),
            breakdown: d.breakdown,
            verified: d.followerVerified ?? true,
            details: d.followerDetails || `Verified real live follower count for ${extractedName || 'creator'}`
          });
        } else if (d.facebookLink || d.instagramLink || d.youtubeLink) {
          // If parse-creator returned 0 but links exist, trigger live follower collection immediately
          handleCollectRealFollowers({
            facebook: d.facebookLink,
            instagram: d.instagramLink,
            youtube: d.youtubeLink,
            name: extractedName
          });
        }

        if (d.breakdown) {
          if (d.breakdown.instagram > 0) setInstaFollowers(formatFollowerMetric(d.breakdown.instagram));
          if (d.breakdown.youtube > 0) setYoutubeFollowers(formatFollowerMetric(d.breakdown.youtube));
          if (d.breakdown.facebook > 0) setFacebookFollowers(formatFollowerMetric(d.breakdown.facebook));
        }

        if (d.mobile) {
          const parts = String(d.mobile).split(/[\/|,\n]+/).map(p => p.trim()).filter(Boolean);
          if (parts.length > 1) {
            const p1 = parsePhoneCountryAndNumber(parts[0]);
            setSelectedCountryCode(p1.countryCode);
            setNewCreatorMobile(p1.number);

            const p2 = parsePhoneCountryAndNumber(parts[1]);
            setSelectedSecondaryCountryCode(p2.countryCode);
            setNewCreatorSecondaryMobile(p2.number);
            setShowSecondaryMobile(true);
            globalToast.success(`📱 Auto-detected primary & secondary contact numbers!`);
          } else {
            const p1 = parsePhoneCountryAndNumber(d.mobile);
            setSelectedCountryCode(p1.countryCode);
            setNewCreatorMobile(p1.number);
            globalToast.success(`📱 Auto-detected contact number: ${d.mobile}`);
          }
        }
        if (d.secondaryMobile) {
          const p2 = parsePhoneCountryAndNumber(d.secondaryMobile);
          setSelectedSecondaryCountryCode(p2.countryCode);
          setNewCreatorSecondaryMobile(p2.number);
          setShowSecondaryMobile(true);
        }
        if (d.costPerPost) setNewCreatorCost(String(d.costPerPost));
        if (d.averageROI) setNewCreatorROI(String(d.averageROI));
        
        // Auto-run link analysis if links were populated
        if (d.facebookLink || d.instagramLink || d.youtubeLink) {
           setTimeout(() => {
              // Wait for state updates then trigger analyze
              document.getElementById('audit-links-btn')?.click();
           }, 500);
        }
        
        setSmartPasteText(''); // Clear on success
      } else {
        throw new Error(resData.error || 'Failed to parse');
      }
    } catch (err: any) {
      setSmartParseError(err.message || 'Error parsing details');
    } finally {
      setIsSmartParsing(false);
    }
  };

  const handleOnboardingAnalyze = async () => {
    setOnboardingAnalysisError(null);
    setIsOnboardingAnalyzing(true);
    try {
      const response = await fetch('/api/analyze-social-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          links: [
            {
              id: 'onboarding-temp-id',
              facebook: newCreatorFacebook.trim(),
              instagram: newCreatorInstagram.trim(),
              youtube: newCreatorYoutube.trim()
            }
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`Server responded with status ${response.status}`);
      }

      const resData = await response.json();
      if (resData.success && resData.analyses && resData.analyses.length > 0) {
        const analysis = resData.analyses[0];
        setOnboardingLinkAnalysis(analysis);

        // Auto-detect and populate mobile if discovered
        if (analysis.detectedMobile && !newCreatorMobile.trim()) {
          const parsedPrimary = parsePhoneCountryAndNumber(analysis.detectedMobile);
          setSelectedCountryCode(parsedPrimary.countryCode);
          setNewCreatorMobile(parsedPrimary.number);
          globalToast.success(`📱 Auto-detected contact number from profile audit: ${analysis.detectedMobile}`);
        }
        if (analysis.detectedSecondaryMobile && !newCreatorSecondaryMobile.trim()) {
          const parsedSecondary = parsePhoneCountryAndNumber(analysis.detectedSecondaryMobile);
          setSelectedSecondaryCountryCode(parsedSecondary.countryCode);
          setNewCreatorSecondaryMobile(parsedSecondary.number);
          setShowSecondaryMobile(true);
          globalToast.info(`📱 Auto-detected second mobile: ${analysis.detectedSecondaryMobile}`);
        }
      } else {
        throw new Error('Server returned invalid or empty analysis data');
      }
    } catch (err: any) {
      console.error('Error on Sourced Creator link analysis:', err);
      setOnboardingAnalysisError(err?.message || 'Failed to complete server-side analysis');
    } finally {
      setIsOnboardingAnalyzing(false);
    }
  };

  // Google Sheets Export Logic
  
  // Creator Database Auto-Synchronize State & Instant Engine
  const [isAutoSyncEnabled, setIsAutoSyncEnabled] = useState<boolean>(() => {
    const val = safeLocalStorage.getItem('INFLUENCER_MANAGER_DRIVE_AUTOSYNC');
    return val !== 'false'; // Defaults to true
  });
  const [isAutoSavingDb, setIsAutoSavingDb] = useState(false);
  const [isSyncingDb, setIsSyncingDb] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  const lastInfluencersHash = useRef<string>('');

  // Instant Sync Executor: writes to Google Drive immediately without delay
  const executeInstantSync = useCallback(async (currentInfs: Influencer[]) => {
    if (!isAutoSyncEnabled || !accessToken || currentInfs.length === 0) return;
    try {
      setIsAutoSavingDb(true);
      const fileName = 'influencer-manager-creator-db-only.json';
      const existingFiles = await searchSyncFilesOnDrive(accessToken);
      const targetFile = existingFiles.find(f => f.name === fileName);
      
      if (targetFile) {
        await updateSyncFileOnDrive(accessToken, targetFile.id, { influencers: currentInfs } as any);
      } else {
        await createSyncFileOnDrive(accessToken, fileName, { influencers: currentInfs } as any);
      }
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setLastSyncTime(timeStr);
      globalToast.success("Creator database synchronized instantly!");
    } catch (err) {
      console.error("Instant auto-sync creator DB error:", err);
    } finally {
      setIsAutoSavingDb(false);
    }
  }, [isAutoSyncEnabled, accessToken]);

  // Reactive Instant Auto-Save logic (triggers immediately when influencers change)
  useEffect(() => {
    const currentHash = JSON.stringify(influencers);
    
    // Seed hash if empty to prevent auto-sync on mount
    if (!lastInfluencersHash.current) {
      lastInfluencersHash.current = currentHash;
      return;
    }
    
    if (currentHash === lastInfluencersHash.current) {
      return;
    }
    
    // Update ref so we don't trigger again for this state
    lastInfluencersHash.current = currentHash;

    if (!isAutoSyncEnabled || !accessToken || influencers.length === 0) return;
    
    // Execute instantly without any 3-second delay
    executeInstantSync(influencers);
  }, [influencers, isAutoSyncEnabled, accessToken, executeInstantSync]);

  // Listen to CREATOR_DATA_UPDATED_INSTANT_SYNC event for instantaneous sync
  useEffect(() => {
    const handleInstantSyncEvent = () => {
      if (isAutoSyncEnabled && accessToken && influencers.length > 0) {
        executeInstantSync(influencers);
      }
    };
    window.addEventListener('CREATOR_DATA_UPDATED_INSTANT_SYNC', handleInstantSyncEvent);
    return () => window.removeEventListener('CREATOR_DATA_UPDATED_INSTANT_SYNC', handleInstantSyncEvent);
  }, [isAutoSyncEnabled, accessToken, influencers, executeInstantSync]);


  const handleSyncFromDrive = async () => {
    if (!accessToken) {
      alert("Please connect to Google Workspace (Cloud Sync tab) first to sync from Drive.");
      return;
    }
    try {
      setIsSyncingDb(true);
      const fileName = 'influencer-manager-creator-db-only.json';
      const existingFiles = await searchSyncFilesOnDrive(accessToken);
      const targetFile = existingFiles.find(f => f.name === fileName);
      
      if (!targetFile) {
        alert("No creator database backup found on Google Drive.");
        return;
      }
      
      const parsed = await downloadSyncFileFromDrive(accessToken, targetFile.id) as any;
      if (parsed && parsed.influencers) {
        onRestoreData({ influencers: parsed.influencers });
        globalToast.success("Creator database synced from Google Drive successfully!");
      } else {
        alert("Invalid data format in Drive backup.");
      }
    } catch (err) {
      console.error("Sync error:", err);
      alert("Failed to sync from Drive.");
    } finally {
      setIsSyncingDb(false);
    }
  };

  const [isExporting, setIsExporting] = useState(false);
  const [exportSpreadsheetUrl, setExportSpreadsheetUrl] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExportToGoogleSheets = async () => {
    setExportError(null);
    setExportSpreadsheetUrl(null);
    setIsExporting(true);

    let activeToken = accessToken;
    if (!activeToken) {
      const confirmAuth = window.confirm("Exporting to Google Sheets requires connecting your Google Account. Would you like to connect now?");
      if (!confirmAuth) {
        setIsExporting(false);
        return;
      }
      try {
        const result = await googleSignIn();
        if (result) {
          onLoginSuccess(result.user, result.accessToken);
          activeToken = result.accessToken;
        } else {
          throw new Error("Failed to receive authentication token.");
        }
      } catch (err: any) {
        console.error("Auth error:", err);
        setExportError(err?.message || "Authentication failed. Please grant required permissions.");
        setIsExporting(false);
        return;
      }
    }

    if (!activeToken) {
      setExportError("Authentication required to export to Google Sheets.");
      setIsExporting(false);
      return;
    }

    try {
      const timestamp = new Date().toLocaleDateString('en-GB', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      const title = `Influencer Manager Sourced Creator Database (${timestamp})`;
      
      const createResponse = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${activeToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          properties: {
            title: title
          }
        })
      });

      if (!createResponse.ok) {
        const errText = await createResponse.text();
        throw new Error(`Sheets creation failed: ${errText}`);
      }

      const sheetData = await createResponse.json();
      const spreadsheetId = sheetData.spreadsheetId;
      const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

      const headers = [
        "Creator ID", 
        "Creator Name", 
        "Primary Handle", 
        "Audience Niche", 
        "Follower Count", 
        "Engagement Rate", 
        "Location / Hub", 
        "Gender Profile", 
        "Cost Per Post (INR)", 
        "Average ROI", 
        "Active Status", 
        "Mobile Number", 
        "Facebook Profile", 
        "Instagram Profile", 
        "YouTube Channel", 
        "Database Perf-Ranking"
      ];

      const rows = filteredInfluencers.map(inf => [
        inf.id,
        inf.name,
        inf.handle,
        inf.niche,
        inf.followers,
        `${inf.engagementRate}%`,
        inf.location,
        inf.gender || 'N/A',
        inf.costPerPost,
        `${inf.averageROI}x`,
        inf.status,
        inf.mobile || '',
        inf.facebookLink || '',
        inf.instagramLink || '',
        inf.youtubeLink || '',
        inf.perfRanking || 'N/A'
      ]);

      const valuesMatrix = [headers, ...rows];
      const range = `Sheet1!A1:P${valuesMatrix.length}`;
      
      const writeResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${activeToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          range: range,
          majorDimension: "ROWS",
          values: valuesMatrix
        })
      });

      if (!writeResponse.ok) {
        const writeErrText = await writeResponse.text();
        throw new Error(`Failed to write database values to Google Sheets: ${writeErrText}`);
      }

      setExportSpreadsheetUrl(spreadsheetUrl);
    } catch (err: any) {
      console.error("Export to Google Sheets error:", err);
      setExportError(err?.message || "Failed to create or write Google Sheet.");
    } finally {
      setIsExporting(false);
    }
  };

  // Creator profile edit states
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [editSex, setEditSex] = useState<'Male' | 'Female' | 'Others'>('Female');
  const [editHandle, setEditHandle] = useState('');
  const [editNiche, setEditNiche] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editFollowers, setEditFollowers] = useState('');
  const [editCostPerPost, setEditCostPerPost] = useState('');
  const [editMobile, setEditMobile] = useState('');
  const [editSecondaryMobile, setEditSecondaryMobile] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const [editFacebook, setEditFacebook] = useState('');
  const [editInstagram, setEditInstagram] = useState('');
  const [editYoutube, setEditYoutube] = useState('');
  const [tempNote, setTempNote] = useState('');

  const [editBankName, setEditBankName] = useState('');
  const [editAccountName, setEditAccountName] = useState('');
  const [editAccountNumber, setEditAccountNumber] = useState('');
  const [editIfsc, setEditIfsc] = useState('');
  const [editPan, setEditPan] = useState('');
  const [editBillingName, setEditBillingName] = useState('');
  const [editBillingAddress, setEditBillingAddress] = useState('');

  const [editBillToName, setEditBillToName] = useState('');
  const [editBillToAddress, setEditBillToAddress] = useState('');
  const [editBillToPhone, setEditBillToPhone] = useState('');

  const [editInfluencerSignature, setEditInfluencerSignature] = useState('');
  const [editInfluencerSigData, setEditInfluencerSigData] = useState('');
  const [isUploadingSignature, setIsUploadingSignature] = useState(false);
  const [editEntryDate, setEditEntryDate] = useState('');


  const [instaFollowers, setInstaFollowers] = useState('150K');
  const [facebookFollowers, setFacebookFollowers] = useState('120K');
  const [youtubeFollowers, setYoutubeFollowers] = useState('');
  
  const [isAnalyzingProfileId, setIsAnalyzingProfileId] = useState<string | null>(null);

  const handleRealTimeAnalyze = async (influencer: Influencer) => {
    if (!influencer) return;
    setIsAnalyzingProfileId(influencer.id);
    setSuccessMsg(null);
    try {
      const payload = [{
        id: influencer.id,
        facebook: influencer.facebookLink,
        instagram: influencer.instagramLink,
        youtube: influencer.youtubeLink
      }];
      
      const response = await fetch('/api/analyze-social-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ links: payload })
      });
      
      if (response.ok) {
        const resData = await response.json();
        if (resData.success && resData.analyses && resData.analyses.length > 0) {
          const result = resData.analyses[0];
          const updates: Partial<Influencer> = {
            linkAnalysis: {
              facebook: result.facebook,
              instagram: result.instagram,
              youtube: result.youtube,
              summary: result.summary,
              lastChecked: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            }
          };

          let mobileNote = '';
          if (result.detectedMobile && !influencer.mobile) {
            const cleanMob = cleanSingleMobileForStorage(result.detectedMobile);
            updates.mobile = cleanMob;
            updates.whatsapp = cleanMob;
            updates.phone = cleanMob;
            mobileNote = `Auto-detected & added mobile: ${cleanMob}`;
          }
          if (result.detectedSecondaryMobile && !influencer.secondaryMobile && updates.mobile !== result.detectedSecondaryMobile) {
            const cleanSec = cleanSingleMobileForStorage(result.detectedSecondaryMobile);
            updates.secondaryMobile = cleanSec;
            if (!mobileNote) {
              mobileNote = `Auto-detected & added second mobile: ${cleanSec}`;
            }
          }

          if (onUpdateInfluencer) {
            onUpdateInfluencer(influencer.id, updates);
          }
          if (mobileNote) {
            globalToast.success(`📱 ${mobileNote}`);
          }
          setSuccessMsg(mobileNote ? `Profile analysis complete! ${mobileNote}` : "Real-time profile analysis completed successfully.");

          // Force update local selectedInfluencer if currently selected.
          if (selectedInfluencer && selectedInfluencer.id === influencer.id) {
             setSelectedInfluencer((prev: any) => prev ? {
               ...prev,
               ...updates
             } : null);
          }
        }
      }
    } catch (error) {
      console.error('Failed to run real-time analysis', error);
      alert('Analysis tool encountered an error. Please try again.');
    } finally {
      setIsAnalyzingProfileId(null);
      setTimeout(() => setSuccessMsg(null), 4000);
    }
  };

  useEffect(() => {
    if (selectedInfluencer) {
      setEditName(selectedInfluencer.name || '');
      setEditSex(selectedInfluencer.gender || 'Female');
      setEditHandle(selectedInfluencer.handle || '');
      setEditNiche(selectedInfluencer.niche || '');
      setEditLocation(selectedInfluencer.location || '');
      setEditFollowers(selectedInfluencer.followers ? selectedInfluencer.followers.toString() : '');
      setEditCostPerPost(selectedInfluencer.costPerPost ? selectedInfluencer.costPerPost.toString() : '');
      setEditMobile(selectedInfluencer.mobile || '');
      setEditSecondaryMobile(selectedInfluencer.secondaryMobile || selectedInfluencer.alternateMobile || '');
      setEditAvatar(selectedInfluencer.avatar || '');
      setEditFacebook(selectedInfluencer.facebookLink || '');
      setEditInstagram(selectedInfluencer.instagramLink || '');
      setEditYoutube(selectedInfluencer.youtubeLink || '');
      setTempNote(selectedInfluencer.notes || '');
      
      setEditBankName(selectedInfluencer.bankDetails?.bankName || '');
      setEditBillingName(selectedInfluencer.billingName || selectedInfluencer.name || '');
      setEditBillingAddress(selectedInfluencer.billingAddress || selectedInfluencer.location || '');

      setEditBillToName(selectedInfluencer.billToName || '');
      setEditBillToAddress(selectedInfluencer.billToAddress || '');
      setEditBillToPhone(selectedInfluencer.billToPhone || '');

      const sig = selectedInfluencer.influencerSignature || '';
      setEditInfluencerSignature(sig);
      if (sig.startsWith('gdrive:')) {
        setEditInfluencerSigData('');
        if (accessToken) {
          fetchImageFromDrive(sig.replace('gdrive:', ''), accessToken)
            .then(data => setEditInfluencerSigData(data))
            .catch(err => console.error("Failed to load signature", err));
        }
      } else {
        setEditInfluencerSigData(sig);
      }

      setEditAccountName(selectedInfluencer.bankDetails?.accountName || '');
      setEditAccountNumber(selectedInfluencer.bankDetails?.accountNumber || '');
      setEditIfsc(selectedInfluencer.bankDetails?.ifsc || '');
      setEditPan(selectedInfluencer.bankDetails?.pan || '');

      const defaultEntryDate = selectedInfluencer.entryDate || 
        (selectedInfluencer.status === 'Future Creator' ? getTodayKolkataISO() : 
          (selectedInfluencer.id && selectedInfluencer.id.startsWith('inf-') ? (() => {
            const ts = parseInt(selectedInfluencer.id.split('-')[1]);
            if (!isNaN(ts) && ts > 1000000) {
              try {
                return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts));
              } catch { return ''; }
            }
            return '';
          })() : ''));
      setEditEntryDate(defaultEntryDate || '');

      setIsEditingProfile(false);
    }
  }, [selectedInfluencer]);

  const handleSaveProfileEdit = () => {
    if (!editName.trim() || !editHandle.trim()) {
      alert("Name and Handle are required fields!");
      return;
    }

    const updated = {
      name: editName.trim(),
      gender: editSex,
      handle: editHandle.trim().startsWith('@') ? editHandle.trim() : `@${editHandle.trim()}`,
      entryDate: editEntryDate.trim() || undefined,
      niche: editNiche.trim(),
      location: editLocation.trim(),
      followers: parseInt(editFollowers) || 0,
      costPerPost: parseInt(editCostPerPost) || 0,
      mobile: editMobile.trim() || undefined,
      secondaryMobile: editSecondaryMobile.trim() || undefined,
      avatar: editAvatar,
      facebookLink: editFacebook.trim() || undefined,
      instagramLink: editInstagram.trim() || undefined,
      youtubeLink: editYoutube.trim() || undefined,
      linkAnalysis: undefined, // clear previous audits to trigger immediate fresh check
      
      billingName: editBillingName.trim() || undefined,
      billingAddress: editBillingAddress.trim() || undefined,

      billToName: editBillToName.trim() || undefined,
      billToAddress: editBillToAddress.trim() || undefined,
      billToPhone: editBillToPhone.trim() || undefined,

      influencerSignature: editInfluencerSignature || undefined,
      bankDetails: {
        bankName: editBankName.trim() || undefined,
        accountName: editAccountName.trim() || undefined,
        accountNumber: editAccountNumber.trim() || undefined,
        ifsc: editIfsc.trim() || undefined,
        pan: editPan.trim() || undefined,
      }
    };

    if (onUpdateInfluencer) {
      onUpdateInfluencer(selectedInfluencer!.id, updated);
      setSelectedInfluencer({
        ...selectedInfluencer!,
        ...updated
      });
      setIsEditingProfile(false);
    } else {
      alert("Update function is not available.");
    }
  };

  useEffect(() => {
    if (!isCustomAvatarUploaded) {
      if (newCreatorSex === 'Female') {
        setNewCreatorAvatar('https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=240');
      } else if (newCreatorSex === 'Male') {
        setNewCreatorAvatar('https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=240');
      } else {
        setNewCreatorAvatar('https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=240');
      }
    }
  }, [newCreatorSex, isCustomAvatarUploaded]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const data = results.data as any[];
        let addedCount = 0;
        let skippedCount = 0;
        
        data.forEach(row => {
          const newInf: any = {
            ...row,
            name: (row.name || row.Name || 'Unknown').toUpperCase(),
            handle: row.handle || row.Handle || '@unknown',
            avatar: row.avatar || row.Avatar || COLLECTED_PORTRAITS[Math.floor(Math.random() * COLLECTED_PORTRAITS.length)],
            niche: row.niche || row.Niche || 'General Lifestyle',
            followers: parseInt(row.followers || row.Followers || '0', 10),
            engagementRate: parseFloat(row.engagementRate || row.EngagementRate || '0'),
            location: row.location || row.Location || '',
            costPerPost: parseFloat(row.costPerPost || row.CostPerPost || '0'),
            averageROI: parseFloat(row.averageROI || row.AverageROI || '0'),
            mobile: row.mobile || row.Mobile || row.phone || row.Phone || '',
            secondaryMobile: row.secondaryMobile || row['Secondary Mobile'] || row.alternateMobile || row['Alternate Mobile'] || row.phone2 || row.Phone2 || '',
            gender: row.gender || row.Gender || 'Others',
            facebookLink: row.facebookLink || row.FacebookLink || '',
            instagramLink: row.instagramLink || row.InstagramLink || '',
            youtubeLink: row.youtubeLink || row.YoutubeLink || '',
            notes: row.notes || row.Notes || '',
            status: row.status || row.Status,
            entryDate: row.entryDate || row.EntryDate || row['Entry Date'] || getTodayKolkataISO(),
            topDemographics: row.topDemographics ? (typeof row.topDemographics === 'string' ? JSON.parse(row.topDemographics) : row.topDemographics) : [
              { ageRange: '18-24', percentage: 45 },
              { ageRange: '25-34', percentage: 40 }
            ],
            platforms: row.platforms ? (typeof row.platforms === 'string' ? JSON.parse(row.platforms) : row.platforms) : [
              { name: 'Instagram', followers: row.followers || row.Followers || '10K' }
            ]
          };
          delete newInf.id;
          delete newInf.perfRanking;
          delete newInf.rating;

          const isDuplicate = influencers.some(inf => {
            const cleanInfMobile = inf.mobile ? inf.mobile.trim() : '';
            const cleanInfSecMobile = inf.secondaryMobile ? inf.secondaryMobile.trim() : '';
            if (newInf.mobile && (cleanInfMobile === newInf.mobile.trim() || cleanInfSecMobile === newInf.mobile.trim())) return true;
            if (newInf.secondaryMobile && (cleanInfMobile === newInf.secondaryMobile.trim() || cleanInfSecMobile === newInf.secondaryMobile.trim())) return true;
            if (newInf.instagramLink && inf.instagramLink && newInf.instagramLink.trim() === inf.instagramLink.trim()) return true;
            if (newInf.youtubeLink && inf.youtubeLink && newInf.youtubeLink.trim() === inf.youtubeLink.trim()) return true;
            if (newInf.facebookLink && inf.facebookLink && newInf.facebookLink.trim() === inf.facebookLink.trim()) return true;
            if (inf.name.trim().toLowerCase() === newInf.name.trim().toLowerCase()) return true;
            return false;
          });

          if (isDuplicate) {
            skippedCount++;
            return;
          }

          onAddInfluencer(newInf);
          addedCount++;
        });

        if (fileInputRef.current) fileInputRef.current.value = '';
        if (skippedCount > 0) {
          alert(`Successfully imported ${addedCount} creators! ${skippedCount} creators were skipped because they already exist.`);
        } else {
          alert(`Successfully imported ${addedCount} creators from CSV!`);
        }
      },
      error: (error: any) => {
        console.error("Error parsing CSV:", error);
        alert("Failed to parse CSV file.");
      }
    });
  };

  const handleExportCSV = () => {
    if (influencers.length === 0) {
      alert("No creators to export.");
      return;
    }
    const csv = Papa.unparse(influencers.map(inf => ({
      ...inf,
      Name: inf.name,
      Handle: inf.handle,
      'Entry Date': formatDateToDMY(inf.entryDate) || inf.entryDate || '',
      Mobile: inf.mobile || '',
      'Secondary Mobile': inf.secondaryMobile || inf.alternateMobile || '',
      Status: inf.status || '',
      Notes: inf.notes || ''
    })));
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `creator_database_${new Date().toLocaleString('en-GB').replace(/[\/:]/g, '-').replace(', ', '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleAddNewCreatorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCreatorName.trim()) {
      globalToast.error("Please enter the Creator Name required field!");
      return;
    }

    const fullMobile = newCreatorMobile.trim() ? `${selectedCountryCode} ${newCreatorMobile.trim()}` : '';
    const fullSecondaryMobile = newCreatorSecondaryMobile.trim() ? `${selectedSecondaryCountryCode} ${newCreatorSecondaryMobile.trim()}` : '';
    const isDuplicate = influencers.some(inf => {
      const cleanInfMobile = inf.mobile ? inf.mobile.trim() : '';
      const cleanInfSecMobile = inf.secondaryMobile ? inf.secondaryMobile.trim() : '';
      if (fullMobile && (cleanInfMobile === fullMobile || cleanInfSecMobile === fullMobile)) return true;
      if (fullSecondaryMobile && (cleanInfMobile === fullSecondaryMobile || cleanInfSecMobile === fullSecondaryMobile)) return true;
      if (newCreatorInstagram.trim() && inf.instagramLink && newCreatorInstagram.trim() === inf.instagramLink.trim()) return true;
      if (newCreatorYoutube.trim() && inf.youtubeLink && newCreatorYoutube.trim() === inf.youtubeLink.trim()) return true;
      if (newCreatorFacebook.trim() && inf.facebookLink && newCreatorFacebook.trim() === inf.facebookLink.trim()) return true;
      if (inf.name.trim().toLowerCase() === newCreatorName.trim().toLowerCase()) return true;
      return false;
    });

    if (isDuplicate) {
      globalToast.warning("Double entry detected! A creator with this name, mobile, or social link already exists in the database.");
      return;
    }

    // Always ensure and collect the real total followers across platforms
    let finalFollowers = parseInt(newCreatorFollowers) || 0;
    const hasSocialLink = Boolean(newCreatorInstagram.trim() || newCreatorYoutube.trim() || newCreatorFacebook.trim());

    if ((!finalFollowers || finalFollowers === 0 || !followerCollectionStatus) && hasSocialLink) {
      try {
        const liveCollected = await Promise.race([
          handleCollectRealFollowers(),
          new Promise<number>((r) => setTimeout(() => r(0), 4500))
        ]);
        if (liveCollected > 0) {
          finalFollowers = liveCollected;
        }
      } catch (e) {
        console.warn('Real follower auto-collection error on submit:', e);
      }
    }

    if (!finalFollowers && followerCollectionStatus?.total) {
      finalFollowers = followerCollectionStatus.total;
    }

    // Compute handle from profile links or fallback name string
    let computedHandle = '';
    const firstActiveLink = newCreatorInstagram || newCreatorYoutube || newCreatorFacebook;
    if (firstActiveLink) {
      try {
        const parsed = new URL(firstActiveLink.startsWith('http') ? firstActiveLink : 'https://' + firstActiveLink);
        const parts = parsed.pathname.split('/').filter(Boolean);
        if (parts.length > 0) {
          const trailing = parts[parts.length - 1].split('?')[0];
          computedHandle = trailing.startsWith('@') ? trailing : '@' + trailing;
          if (computedHandle === '@channel' || computedHandle === '@c' || computedHandle === '@user') {
            const second = parts[parts.length - 2];
            computedHandle = second ? (second.startsWith('@') ? second : '@' + second) : '@creator';
          }
        }
      } catch (err) {
        // safe bypass
      }
    }
    if (!computedHandle || computedHandle === '@') {
      computedHandle = '@' + newCreatorName.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    }

    // Build platform list with real collected follower metrics
    const platforms: { name: 'Instagram' | 'TikTok' | 'YouTube' | 'Twitter' | 'Facebook'; followers: string }[] = [];
    if (newCreatorInstagram.trim()) {
      const igFollowerStr = followerCollectionStatus?.breakdown?.instagram 
        ? formatFollowerMetric(followerCollectionStatus.breakdown.instagram) 
        : (instaFollowers.trim() || formatFollowerMetric(finalFollowers || 1000));
      platforms.push({ name: 'Instagram', followers: igFollowerStr });
    }
    if (newCreatorFacebook.trim()) {
      const fbFollowerStr = followerCollectionStatus?.breakdown?.facebook 
        ? formatFollowerMetric(followerCollectionStatus.breakdown.facebook) 
        : (facebookFollowers.trim() || formatFollowerMetric(finalFollowers || 1000));
      platforms.push({ name: 'Facebook', followers: fbFollowerStr });
    }
    if (newCreatorYoutube.trim()) {
      const ytFollowerStr = followerCollectionStatus?.breakdown?.youtube 
        ? formatFollowerMetric(followerCollectionStatus.breakdown.youtube) 
        : (youtubeFollowers.trim() || formatFollowerMetric(finalFollowers || 1000));
      platforms.push({ name: 'YouTube', followers: ytFollowerStr });
    }
    if (platforms.length === 0) {
      platforms.push({ name: 'Instagram', followers: formatFollowerMetric(finalFollowers || 1000) });
    }

    const topDemographics = [
      { ageRange: '18-24', percentage: 45 },
      { ageRange: '25-34', percentage: 40 },
      { ageRange: '35+', percentage: 15 }
    ];

    const fullLocation = newCreatorAddress.trim();

    onAddInfluencer({
      name: newCreatorName.trim().toUpperCase(),
      gender: newCreatorSex,
      handle: computedHandle,
      avatar: newCreatorAvatar,
      niche: newCreatorNiche.trim() || 'General Lifestyle',
      followers: finalFollowers,
      engagementRate: parseFloat(newCreatorEngagement) || 4.5,
      location: fullLocation,
      topDemographics,
      platforms,
      costPerPost: parseInt(newCreatorCost) || 0,
      averageROI: parseFloat(newCreatorROI) || 3.2,
      mobile: newCreatorMobile.trim() ? `${selectedCountryCode} ${newCreatorMobile.trim()}` : undefined,
      secondaryMobile: newCreatorSecondaryMobile.trim() ? `${selectedSecondaryCountryCode} ${newCreatorSecondaryMobile.trim()}` : undefined,
      facebookLink: newCreatorFacebook.trim() || undefined,
      instagramLink: newCreatorInstagram.trim() || undefined,
      youtubeLink: newCreatorYoutube.trim() || undefined,
      linkAnalysis: onboardingLinkAnalysis ? {
        facebook: onboardingLinkAnalysis.facebook,
        instagram: onboardingLinkAnalysis.instagram,
        youtube: onboardingLinkAnalysis.youtube,
        summary: onboardingLinkAnalysis.summary,
        lastChecked: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      } : undefined,
      status: newCreatorStatus,
      entryDate: newCreatorEntryDate.trim() || getTodayKolkataISO()
    });

    setNewCreatorName('');
    setNewCreatorSex('Female');
    setIsCustomAvatarUploaded(false);
    setNewCreatorFacebook('');
    setNewCreatorInstagram('');
    setNewCreatorYoutube('');
    setOnboardingLinkAnalysis(null);
    setNewCreatorAddress('');
    setNewCreatorNiche('');
    setNewCreatorFollowers('');
    setNewCreatorEntryDate(getTodayKolkataISO());
    setFollowerCollectionStatus(null);
    setNewCreatorEngagement('4.5');
    setNewCreatorCost('800');
    setNewCreatorROI('3.2');
    setNewCreatorMobile('');
    setNewCreatorSecondaryMobile('');
    setSelectedCountryCode('+91');
    setSelectedSecondaryCountryCode('+91');
    setShowSecondaryMobile(false);
    setInstaFollowers('');
    setFacebookFollowers('');
    setYoutubeFollowers('');
    
    // Switch to corresponding page to show the new entry
    if (newCreatorStatus === 'Future Creator') {
      handleSwitchPage('future');
      globalToast.success(`Successfully onboarded "${newCreatorName.trim()}" into Future Creators with ${formatFollowerMetric(finalFollowers)} Followers!`);
    } else {
      handleSwitchPage('main');
      globalToast.success(`Successfully onboarded "${newCreatorName.trim()}" into Active Database with ${formatFollowerMetric(finalFollowers)} Followers!`);
    }
    setShowAddCreatorForm(false);
  };

  // Extract unique niches
  const niches = ['All', ...Array.from(new Set(influencers.filter(i => i && i.niche).map(i => i.niche)))];

  // --- Duplicate Detection ---
  const duplicateWarnings: any[] = [];
  const groupedByName = new Map();
  const groupedByHandle = new Map();
  const groupedByMobile = new Map();

  influencers.forEach(inf => {
    if (inf.name && typeof inf.name === 'string' && inf.name.trim()) {
      const key = inf.name.trim().toLowerCase();
      if (!groupedByName.has(key)) groupedByName.set(key, []);
      groupedByName.get(key).push(inf);
    }
    if (inf.handle && typeof inf.handle === 'string' && inf.handle.trim() && inf.handle.trim() !== '@influencer') {
      const key = inf.handle.trim().toLowerCase();
      if (!groupedByHandle.has(key)) groupedByHandle.set(key, []);
      groupedByHandle.get(key).push(inf);
    }
    if (inf.mobile && typeof inf.mobile === 'string' && inf.mobile.trim()) {
      const key = inf.mobile.replace(/[^0-9]/g, '');
      if (key && key.length > 5) {
          if (!groupedByMobile.has(key)) groupedByMobile.set(key, []);
          groupedByMobile.get(key).push(inf);
      }
    }
    const secMobile = inf.secondaryMobile || inf.alternateMobile;
    if (secMobile && typeof secMobile === 'string' && secMobile.trim()) {
      const key = secMobile.replace(/[^0-9]/g, '');
      if (key && key.length > 5) {
          if (!groupedByMobile.has(key)) groupedByMobile.set(key, []);
          groupedByMobile.get(key).push(inf);
      }
    }
  });

  const generateDuplicateWarnings = (groupMap: any, reasonPrefix: any) => {
    groupMap.forEach((group: any, key: any) => {
      // Deduplicate the group by id
      const uniqueGroup = Array.from(new Map(group.map((item: any) => [item.id, item])).values());
      if (uniqueGroup.length > 1) {
        duplicateWarnings.push({
          key: `${reasonPrefix}-${key}`,
          group: uniqueGroup,
          reason: `Duplicate ${reasonPrefix} used in ${uniqueGroup.length} profiles.`,
          names: Array.from(new Set(uniqueGroup.map((g: any) => g.name || 'Unnamed'))).join(', ')
        });
      }
    });
  };
  generateDuplicateWarnings(groupedByName, 'Name');
  generateDuplicateWarnings(groupedByHandle, 'Handle');
  generateDuplicateWarnings(groupedByMobile, 'Mobile');

  const duplicateIds = new Set<string>();
  duplicateWarnings.forEach(w => w.group.forEach((g: any) => duplicateIds.add(g.id)));

  const latestRestoredInfluencerIds = (() => {
    const restored = influencers.filter(inf => inf.notes?.includes('Added from Monthly Planner'));
    if (restored.length === 0) return new Set<string>();
    
    const getTimestamp = (id: string) => {
      const parts = id.split('-');
      if (parts.length >= 2) {
        const ts = parseInt(parts[1], 10);
        if (!isNaN(ts) && ts > 1000000) return ts;
      }
      return 0;
    };
    
    let maxTs = 0;
    let hasValidTimestamps = false;
    
    restored.forEach(inf => {
      const ts = getTimestamp(inf.id);
      if (ts > 0) hasValidTimestamps = true;
      if (ts > maxTs) maxTs = ts;
    });
    
    const latestIds = new Set<string>();
    
    if (hasValidTimestamps) {
      restored.forEach(inf => {
        if (getTimestamp(inf.id) > 0 && (maxTs - getTimestamp(inf.id) < 5000)) {
          latestIds.add(inf.id);
        }
      });
    } else {
      // Fallback: just use the last one in the array
      latestIds.add(restored[restored.length - 1].id);
    }
    
    return latestIds;
  })();

  // Counts
  const activeCount = influencers.filter(i => i && i.status !== 'Future Creator').length;
  const futureCount = influencers.filter(i => i && i.status === 'Future Creator').length;
  const allCount = influencers.length;

  // Pipeline communication status counts for Future Creators
  const futureSentCount = influencers.filter(i => i?.status === 'Future Creator' && i.communicationStatus === 'MESSAGE SENT').length;
  const futureRepliedCount = influencers.filter(i => i?.status === 'Future Creator' && i.communicationStatus === 'REPLY RECEIVED').length;
  const futureNoReplyCount = influencers.filter(i => i?.status === 'Future Creator' && i.communicationStatus === 'MESSAGE NOT REPLIED').length;
  const futureAgreedCount = influencers.filter(i => i?.status === 'Future Creator' && i.communicationStatus === 'AGREE FOR VIDEO PROMOTION').length;
  const futureDeclinedCount = influencers.filter(i => i?.status === 'Future Creator' && i.communicationStatus === 'NOT AGREE FOR VIDEO PROMOTION').length;
  const futureReceivedCount = influencers.filter(i => i?.status === 'Future Creator' && i.communicationStatus === 'DEMOGRAPHIC PROFILE AND ADDRESS RECEIVED').length;

  // Filtering
  let filteredInfluencers = influencers.filter(i => {
    if (!i) return false;
    const isFuture = i.status === 'Future Creator';

    // Page filter
    if (databasePage === 'main' && isFuture) return false;
    if (databasePage === 'future' && !isFuture) return false;

    // Future Communication status filter
    if (databasePage === 'future' && futureCommFilter !== 'All') {
      if (futureCommFilter === 'NOT_SET') {
        if (i.communicationStatus) return false;
      } else if (i.communicationStatus !== futureCommFilter) {
        return false;
      }
    }
        
    const nameStr = (i.name || '').toString().toLowerCase();
    const handleStr = (i.handle || '').toString().toLowerCase();
    const locationStr = (i.location || '').toString().toLowerCase();
    const entryDateStr = (i.entryDate || '').toString().toLowerCase();
    const entryDateDMY = formatDateToDMY(i.entryDate).toLowerCase();
    const nicheStr = i.niche || '';
    const rateNum = typeof i.engagementRate === 'number' ? i.engagementRate : 0;

    const matchesSearch = nameStr.includes(search.toLowerCase()) || 
                          handleStr.includes(search.toLowerCase()) ||
                          locationStr.includes(search.toLowerCase()) ||
                          entryDateStr.includes(search.toLowerCase()) ||
                          entryDateDMY.includes(search.toLowerCase());
    const matchesNiche = selectedNiche === 'All' || nicheStr === selectedNiche;
    const matchesEngagement = rateNum >= minEngagement;
    if (showOnlyDuplicates && !duplicateIds.has(i.id)) return false;
    return matchesSearch && matchesNiche && matchesEngagement;
  });

  if (showOnlyDuplicates) {
    const groupedByName = new Map<string, any>();
    filteredInfluencers.forEach(inf => {
      const nameKey = (inf.name || 'Unnamed').trim().toLowerCase();
      if (!groupedByName.has(nameKey)) {
        groupedByName.set(nameKey, { ...inf, _duplicateCount: 1 });
      } else {
        groupedByName.get(nameKey)._duplicateCount++;
      }
    });
    filteredInfluencers = Array.from(groupedByName.values()).map(g => {
       if (g._duplicateCount > 1) {
          return { ...g, name: `${g.name} (${g._duplicateCount} Entries)` };
       }
       return g;
    });
  }

  // Always sort creators alphabetically A-Z by name
  filteredInfluencers = [...filteredInfluencers].sort((a, b) => {
    const nameA = (a.name || '').trim();
    const nameB = (b.name || '').trim();
    return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
  });

  const handleCampaignAssignSubmit = (infId: string) => {
    if (!selectedCampId) return;
    onAssignToCampaign(infId, selectedCampId);
    
    const campName = campaigns.find(c => c.id === selectedCampId)?.name || 'Campaign';
    const infName = influencers.find(inf => inf.id === infId)?.name || 'Influencer';
    
    setSuccessMsg(`Successfully assigned ${infName} to "${campName}"!`);
    setSelectedCampId('');
    setTimeout(() => setSuccessMsg(null), 4000);
  };



  const handleMergeToLatestRestored = () => {
    if (!onUpdateInfluencer || !onDeleteInfluencer) return;
    if (!window.confirm("Are you sure you want to merge duplicates into the most recently restored entries?")) return;
    
    executeMerge(true);
  };

  const handleMergeAllDuplicates = () => {
    if (!onUpdateInfluencer || !onDeleteInfluencer) return;
    if (!window.confirm("Are you sure you want to merge all detected duplicate creator entries? This action cannot be undone.")) return;
    
    executeMerge(false);
  };

  const executeMerge = (useLatestRestored: boolean) => {
    if (!onUpdateInfluencer || !onDeleteInfluencer) return;
    const groupsToMerge: any[] = [];
    duplicateWarnings.forEach((warning: any) => {
      groupsToMerge.push(warning.group);
    });

    const processedIds = new Set<string>();
    const idsToDelete: { id: string; replacementId: string }[] = [];
    
    groupsToMerge.forEach((group: any) => {
      const itemsToMerge = group.filter((t: any) => !processedIds.has(t.id));
      if (itemsToMerge.length < 2) return;
        
      itemsToMerge.forEach((t: any) => processedIds.add(t.id));
        
      let baseItem = itemsToMerge[0];

      if (useLatestRestored) {
        let maxTs = -1;
        const getTimestamp = (id: string) => {
          const parts = id.split('-');
          if (parts.length >= 2) {
            const ts = parseInt(parts[1], 10);
            if (!isNaN(ts)) return ts;
          }
          return 0;
        };

        let hasRestored = false;
        for (const t of itemsToMerge) {
          if (t.notes?.includes('Added from Monthly Planner')) {
            hasRestored = true;
            const ts = getTimestamp(t.id);
            if (ts > maxTs) {
              maxTs = ts;
              baseItem = t;
            }
          }
        }
        
        if (!hasRestored) {
          // Fallback to highest score
          let maxScore = -1;
          for (const t of itemsToMerge) {
            let score = 0;
            Object.keys(t).forEach(key => {
              const val = t[key];
              if (val && val !== 'Unknown' && val !== 'Unnamed' && val !== 'Unnamed Creator' && val !== 'General' && val !== 'Future Creator' && val !== 0) {
                if (Array.isArray(val) && val.length === 0) return;
                if (typeof val === 'string' && val.trim() === '') return;
                score++;
              }
            });
            if (score > maxScore) {
              maxScore = score;
              baseItem = t;
            }
          }
        }
      } else {
        let maxScore = -1;
        for (const t of itemsToMerge) {
          let score = 0;
          Object.keys(t).forEach(key => {
            const val = t[key];
            if (val && val !== 'Unknown' && val !== 'Unnamed' && val !== 'Unnamed Creator' && val !== 'General' && val !== 'Future Creator' && val !== 0) {
              if (Array.isArray(val) && val.length === 0) return;
              if (typeof val === 'string' && val.trim() === '') return;
              score++;
            }
          });
          if (score > maxScore) {
            maxScore = score;
            baseItem = t;
          }
        }
      }
        
      const mergedData: any = { ...baseItem };
        
      itemsToMerge.forEach((t: any) => {
        if (t.id === baseItem.id) return;
          
        Object.keys(t).forEach(key => {
          if (!mergedData[key] && t[key]) {
            mergedData[key] = t[key];
          } else if (typeof mergedData[key] === 'string' && mergedData[key].trim() === '' && t[key] && typeof t[key] === 'string' && t[key].trim() !== '') {
            mergedData[key] = t[key];
          } else if (Array.isArray(mergedData[key]) && mergedData[key].length === 0 && Array.isArray(t[key]) && t[key].length > 0) {
            mergedData[key] = t[key];
          }
        });
          
        if ((!mergedData.name || mergedData.name === 'Unnamed' || mergedData.name === 'Unnamed Creator') && t.name) {
             mergedData.name = t.name;
        }

        if (mergedData.location === 'Unknown' && t.location && t.location !== 'Unknown') {
             mergedData.location = t.location;
        }
        if (mergedData.niche === 'General' && t.niche && t.niche !== 'General') {
             mergedData.niche = t.niche;
        }
        if (mergedData.status === 'Future Creator' && t.status && t.status !== 'Future Creator') {
             mergedData.status = t.status;
        } else if (mergedData.status === 'Available' && t.status === 'Active') {
             mergedData.status = t.status;
        }

        if ((!mergedData.costPerPost || mergedData.costPerPost === 0) && t.costPerPost && t.costPerPost > 0) {
             mergedData.costPerPost = t.costPerPost;
        }
          
        if (t.costPerPost && mergedData.costPerPost && t.costPerPost > mergedData.costPerPost) {
             mergedData.costPerPost = t.costPerPost;
        }

        if (t.mobile) {
             const single = cleanSingleMobileForStorage(t.mobile);
             if (single) {
                 mergedData.mobile = single;
             }
        }

        // Always sync WhatsApp and phone number fields so no data is lost
        if (mergedData.mobile) {
             mergedData.whatsapp = mergedData.mobile;
             mergedData.whatsappNumber = mergedData.mobile;
             mergedData.phone = mergedData.mobile;
             mergedData.mobileNumber = mergedData.mobile;
        }

        // Preserve billing, bank details, and samples if present
        ['billingName', 'billingAddress', 'bankDetails', 'panNumber', 'gstNumber', 'tdsRate'].forEach(bField => {
             if (t[bField] && !mergedData[bField]) {
                 mergedData[bField] = t[bField];
             }
        });

        if (t.sampleDetails && Array.isArray(t.sampleDetails) && t.sampleDetails.length > 0) {
             const currentSamples = mergedData.sampleDetails || [];
             const existingKeys = new Set(currentSamples.map((s: any) => `${s.productName || ''}-${s.orderDate || ''}-${s.orderId || ''}`));
             const uniqueSamples = t.sampleDetails.filter((s: any) => !existingKeys.has(`${s.productName || ''}-${s.orderDate || ''}-${s.orderId || ''}`));
             mergedData.sampleDetails = [...currentSamples, ...uniqueSamples];
        }
          
        ['facebookLink', 'instagramLink', 'youtubeLink'].forEach(linkField => {
             if (t[linkField] && t[linkField] !== mergedData[linkField]) {
                 if (mergedData[linkField]) {
                     if (!mergedData[linkField].includes(t[linkField])) {
                         mergedData[linkField] = mergedData[linkField] + ' | ' + t[linkField];
                     }
                 } else {
                     mergedData[linkField] = t[linkField];
                 }
             }
        });

        if (t.notes && t.notes !== mergedData.notes) {
             if (mergedData.notes) {
                 if (!mergedData.notes.includes(t.notes)) {
                     mergedData.notes = mergedData.notes + ' | ' + t.notes;
                 }
             } else {
                 mergedData.notes = t.notes;
             }
        }
        
        if (t.platforms && Array.isArray(t.platforms)) {
             if (!mergedData.platforms || mergedData.platforms.length === 0 || (mergedData.platforms.length === 1 && mergedData.platforms[0].followers === '0')) {
                 mergedData.platforms = [...t.platforms];
             }
        }
        
        if (t.topDemographics && Array.isArray(t.topDemographics)) {
             if (!mergedData.topDemographics || mergedData.topDemographics.length === 0 || (mergedData.topDemographics.length === 1 && mergedData.topDemographics[0].percentage === 100 && mergedData.topDemographics[0].ageRange === '18-24')) {
                 mergedData.topDemographics = [...t.topDemographics];
             }
        }

        idsToDelete.push({ id: t.id, replacementId: baseItem.id });
      });
        
      onUpdateInfluencer?.(baseItem.id, mergedData);
    });

    idsToDelete.forEach(item => {
      onDeleteInfluencer?.(item.id, item.replacementId);
    });
      
    if (idsToDelete.length > 0) {
       setSuccessMsg(`Successfully merged ${groupsToMerge.length} duplicate groups and removed ${idsToDelete.length} redundant entries!`);
    }
    setShowOnlyDuplicates(false);
    setTimeout(() => setSuccessMsg(null), 4000);
  };



  const handleExtractBill = async () => {
    if (!billFile) return;
    setIsExtractingBill(true);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Data = (reader.result as string).split(',')[1];
        const res = await fetch('/api/file-analysis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            instructions: 'Extract bill/invoice details and return a JSON object with strictly these keys: invoiceNumber (string), date (string YYYY-MM-DD), amount (number as string without currency symbol), services (string summarizing the work), signaturePresent (boolean indicating if a handwritten signature is visible). Do not return markdown, just raw JSON.',
            fileParts: [{
              name: billFile.name,
              mimeType: billFile.type,
              data: base64Data
            }]
          })
        });
        const data = await res.json();
        if (data.success && data.result) {
           try {
              const cleaned = data.result.replace(/```json/g, '').replace(/```/g, '').trim();
              const parsed = JSON.parse(cleaned);
              setBillData(prev => ({
                 ...prev,
                 invoiceNumber: parsed.invoiceNumber || prev.invoiceNumber,
                 date: parsed.date || prev.date,
                 amount: parsed.amount || prev.amount,
                 services: parsed.services || prev.services,
                 signaturePresent: parsed.signaturePresent || false
              }));
           } catch(e) { console.error('Parse error', e); }
        }
        setIsExtractingBill(false);
      };
      reader.readAsDataURL(billFile);
    } catch(err) {
      console.error(err);
      setIsExtractingBill(false);
    }
  };

  const handleGeneratePDF = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (selectedInfluencer && onUpdateInfluencer) {
      onUpdateInfluencer(selectedInfluencer.id, { lastBillData: billData });
    }
    if (!selectedInfluencer) return;
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text('INVOICE / BILL', 105, 20, { align: 'center' });
    
    doc.setFontSize(12);
    doc.text(`Date: ${billData.date}`, 14, 40);
    doc.text(`Invoice #: ${billData.invoiceNumber || 'N/A'}`, 14, 48);
    
    doc.text('Billed To:', 14, 65);
    doc.setFontSize(10);
    doc.text('Pro-To-Grow Team', 14, 72);

    doc.setFontSize(12);
    doc.text('From (Influencer):', 120, 65);
    doc.setFontSize(10);
    doc.text(selectedInfluencer.name || '', 120, 72);
    doc.text(selectedInfluencer.location || '', 120, 78);
    
    autoTable(doc, {
      startY: 95,
      head: [['Description', 'Amount']],
      body: [
        [billData.services || 'Content Creation', `Rs. ${billData.amount}`]
      ],
      theme: 'grid'
    });
    
    const finalY = (doc as any).lastAutoTable.finalY || 110;
    
    doc.setFontSize(12);
    doc.text(`Total Amount: Rs. ${billData.amount}`, 14, finalY + 15);
    
    if (billData.signatureImage) {
      doc.text('Signature:', 14, finalY + 35);
      doc.addImage(billData.signatureImage, 'PNG', 14, finalY + 40, 40, 20);
    } else if (billData.signaturePresent) {
      doc.text('Signature: (Verified on original document)', 14, finalY + 35);
    }
    
    try {
      doc.save(`Bill_${selectedInfluencer.name.replace(/\s+/g, '_')}_${billData.date}.pdf`);
      setBillSuccessMessage('Bill generated and data safely stored in profile!');
    } catch (err) {
      console.error(err);
      setBillSuccessMessage('Data saved to profile! (PDF download blocked by browser)');
    }
    setTimeout(() => setBillSuccessMessage(null), 5000);
  };

  return (
    <div id="influencer-db-container" className="space-y-6">
      {duplicateWarnings.length > 0 && (
        <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-lg shadow-sm">
          <div className="flex items-start gap-3">
            <TriangleAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-amber-900">Duplicate Entries Detected</h3>
                <div className="flex gap-2 self-start">
                  <button
                    onClick={() => setShowOnlyDuplicates(prev => !prev)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded shadow-sm transition ${
                      showOnlyDuplicates
                        ? 'bg-amber-900 text-amber-50 hover:bg-amber-800'
                        : 'bg-amber-200 text-amber-900 hover:bg-amber-300'
                    }`}
                  >
                    {showOnlyDuplicates ? 'SHOW ALL CREATORS' : 'SHOW ONLY DUPLICATES'}
                  </button>
                  <button
                    onClick={handleMergeToLatestRestored}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-fuchsia-600 hover:bg-fuchsia-700 text-white text-xs font-bold rounded shadow-sm transition"
                  >
                    Merge to Latest Restored
                  </button>
                  <button
                    onClick={handleMergeAllDuplicates}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded shadow-sm transition"
                  >
                    Merge All Duplicates
                  </button>
                </div>
              </div>
              <p className="text-xs text-amber-700 mt-1">Please review the following duplicates to avoid data fragmentation:</p>
              <ul className="mt-2 space-y-1.5">
                {duplicateWarnings.map(warning => (
                  <li key={warning.key} className="text-xs text-amber-800 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-amber-400 rounded-full inline-block shrink-0" />
                    <strong>{warning.names}</strong>: {warning.reason}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
      {/* Page Navigation Switcher: Active Database vs FUTURE CREATOR */}
      <div className="bg-white/95 backdrop-blur-md p-2.5 rounded-2xl border border-gray-200/80 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleSwitchPage('main')}
            className={`flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider transition-all duration-200 cursor-pointer ${
              databasePage === 'main'
                ? 'bg-gradient-to-r from-violet-600 via-fuchsia-600 to-pink-500 text-white shadow-md shadow-fuchsia-500/25 scale-[1.02]'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Active Database</span>
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-black ${
              databasePage === 'main' ? 'bg-white/25 text-white' : 'bg-gray-100 text-gray-700'
            }`}>
              {activeCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleSwitchPage('future')}
            className={`flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider transition-all duration-200 cursor-pointer ${
              databasePage === 'future'
                ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/25 scale-[1.02]'
                : 'text-gray-600 hover:text-gray-900 hover:bg-blue-50/70'
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
            <span>FUTURE CREATOR</span>
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-black ${
              databasePage === 'future' ? 'bg-white/25 text-white' : 'bg-blue-100 text-blue-800'
            }`}>
              {futureCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleSwitchPage('all')}
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 cursor-pointer ${
              databasePage === 'all'
                ? 'bg-gray-900 text-white shadow-md scale-[1.02]'
                : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
            }`}
          >
            <span>All ({allCount})</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto">
          {/* Quick ON/OFF Button for Automated Duplicate Merge & Monthly Planner Monitor */}
          <button
            type="button"
            onClick={() => onToggleAutoCreatorSystem?.(!isAutoCreatorSystemEnabled)}
            className={`inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider shadow-md hover:scale-[1.02] active:scale-95 transition-all cursor-pointer border ${
              isAutoCreatorSystemEnabled
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-emerald-500 shadow-emerald-500/20'
                : 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
            }`}
            title="Turn ON or OFF the Automated Duplicate Entry Correction/Merge & Monthly Planner Influencer Name Monitor"
          >
            {isAutoCreatorSystemEnabled ? (
              <ToggleRight className="w-5 h-5 text-emerald-200" />
            ) : (
              <ToggleLeft className="w-5 h-5 text-slate-400" />
            )}
            <span>Auto Merge & Planner Monitor: {isAutoCreatorSystemEnabled ? 'ON' : 'OFF'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setNewCreatorStatus(databasePage === 'future' ? 'Future Creator' : 'Available');
              setNewCreatorEntryDate(getTodayKolkataISO());
              setShowAddCreatorForm(true);
            }}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider text-white shadow-md hover:scale-[1.02] active:scale-95 transition-all cursor-pointer ${
              databasePage === 'future'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700'
                : 'bg-gradient-to-r from-fuchsia-600 to-pink-600 hover:from-fuchsia-700 hover:to-pink-700'
            }`}
          >
            <PlusCircle className="w-4 h-4" />
            <span>{databasePage === 'future' ? 'Add Future Creator' : 'Add Creator'}</span>
          </button>
        </div>
      </div>

      {/* Automated Duplicate Correction/Merge & Monthly Planner Influencer Name Monitor Panel */}
      <div className={`rounded-2xl border p-4 shadow-md transition-all duration-300 ${
        isAutoCreatorSystemEnabled
          ? 'bg-gradient-to-r from-emerald-950 via-teal-950 to-slate-900 border-emerald-500/40 text-white'
          : 'bg-slate-50 border-slate-200 text-slate-800'
      }`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className={`p-3 rounded-xl border shrink-0 ${
              isAutoCreatorSystemEnabled
                ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300'
                : 'bg-slate-200 border-slate-300 text-slate-500'
            }`}>
              <ShieldCheck className={`w-6 h-6 ${isAutoCreatorSystemEnabled ? 'animate-pulse' : ''}`} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm sm:text-base font-black uppercase tracking-wider">
                  Automated Duplicate Merge & Monthly Planner Influencer Monitor
                </h2>
                <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest border ${
                  isAutoCreatorSystemEnabled
                    ? 'bg-emerald-500/25 border-emerald-400/50 text-emerald-200'
                    : 'bg-slate-200 border-slate-300 text-slate-600'
                }`}>
                  {isAutoCreatorSystemEnabled ? '● ACTIVE GUARD' : '○ PAUSED'}
                </span>
                <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
                  isAutoCreatorSystemEnabled
                    ? 'bg-cyan-500/20 border-cyan-400/40 text-cyan-200'
                    : 'bg-slate-100 border-slate-300 text-slate-600'
                }`} title="Protects all newly entered Monthly Planner tasks and fields from being deleted or overwritten during duplicate merges">
                  🛡️ Planner New-Entry Guard: ON
                </span>
                {autoCreatorSystemStats?.lastRunAt && (
                  <span className={`text-[11px] font-mono ${isAutoCreatorSystemEnabled ? 'text-emerald-300/80' : 'text-slate-500'}`}>
                    Last Checked: {autoCreatorSystemStats.lastRunAt}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {/* Live Metrics Counters */}
            <div className={`grid grid-cols-3 gap-2 text-center px-3 py-1.5 rounded-xl border ${
              isAutoCreatorSystemEnabled
                ? 'bg-white/5 border-white/10'
                : 'bg-white border-slate-200'
            }`}>
              <div className="px-2">
                <div className={`text-[10px] font-bold uppercase tracking-wider ${isAutoCreatorSystemEnabled ? 'text-teal-300/80' : 'text-slate-500'}`}>
                  Planner Names Input
                </div>
                <div className="text-sm font-black font-mono">
                  {autoCreatorSystemStats?.plannerNamesInputtedCount ?? 0}
                </div>
              </div>
              <div className={`px-2 border-l ${isAutoCreatorSystemEnabled ? 'border-white/10' : 'border-slate-200'}`}>
                <div className={`text-[10px] font-bold uppercase tracking-wider ${isAutoCreatorSystemEnabled ? 'text-cyan-300/80' : 'text-slate-500'}`}>
                  Creators Auto-Added
                </div>
                <div className="text-sm font-black font-mono">
                  {autoCreatorSystemStats?.missingCreatorsAddedCount ?? 0}
                </div>
              </div>
              <div className={`px-2 border-l ${isAutoCreatorSystemEnabled ? 'border-white/10' : 'border-slate-200'}`}>
                <div className={`text-[10px] font-bold uppercase tracking-wider ${isAutoCreatorSystemEnabled ? 'text-indigo-300/80' : 'text-slate-500'}`}>
                  Planner Monitored
                </div>
                <div className="text-sm font-black font-mono">
                  {tasks.length}
                </div>
              </div>
            </div>

            {/* Manual Trigger Button */}
            <button
              type="button"
              onClick={() => onRunAutoCreatorSystemNow?.()}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer border shadow-sm hover:scale-[1.02] active:scale-95 ${
                isAutoCreatorSystemEnabled
                  ? 'bg-white/15 hover:bg-white/25 text-white border-white/25'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-700'
              }`}
              title="Run duplicate correction & Monthly Planner missing influencer name auto-input right now"
            >
              <Zap className="w-4 h-4 text-amber-300" />
              <span>Scan & Fix Now</span>
            </button>

            {/* Primary ON / OFF Button */}
            <button
              type="button"
              onClick={() => onToggleAutoCreatorSystem?.(!isAutoCreatorSystemEnabled)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer border shadow-md hover:scale-[1.02] active:scale-95 ${
                isAutoCreatorSystemEnabled
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 border-emerald-300'
                  : 'bg-slate-800 hover:bg-slate-700 text-white border-slate-700'
              }`}
            >
              {isAutoCreatorSystemEnabled ? (
                <>
                  <ToggleRight className="w-5 h-5 text-slate-950" />
                  <span>Auto System: ON</span>
                </>
              ) : (
                <>
                  <ToggleLeft className="w-5 h-5 text-slate-300" />
                  <span>Auto System: OFF</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className={`flex flex-col md:flex-row md:items-center md:justify-between gap-4 rounded-2xl p-6 shadow-xl relative overflow-hidden transition-all duration-300 ${
        databasePage === 'future'
          ? 'bg-gradient-to-r from-blue-700 via-indigo-700 to-violet-800'
          : databasePage === 'all'
          ? 'bg-gradient-to-r from-slate-900 via-purple-900 to-violet-900'
          : 'bg-gradient-to-r from-violet-600 via-fuchsia-600 to-pink-500'
      }`}>
        <div className="absolute top-0 right-0 w-64 h-64 bg-white rounded-full mix-blend-overlay filter blur-3xl opacity-20 -mr-16 -mt-16 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-white rounded-full mix-blend-overlay filter blur-3xl opacity-10 -ml-16 -mb-16 pointer-events-none" />
        
        <div className="flex items-center gap-4 relative z-10">
          <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-sm border border-white/30 text-white shadow-sm">
            {databasePage === 'future' ? (
              <Sparkles className="w-8 h-8 stroke-[2] text-amber-300 animate-pulse" />
            ) : (
              <Users className="w-8 h-8 stroke-[2]" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-3xl font-black font-sans text-white tracking-tight drop-shadow-md">
                {databasePage === 'future' ? 'FUTURE CREATOR PIPELINE' : databasePage === 'all' ? 'All Creators Directory' : 'Creator Database'}
              </h1>
              {databasePage === 'future' && (
                <span className="px-2.5 py-0.5 text-[11px] bg-amber-400 text-blue-950 font-black rounded-full uppercase tracking-wider shadow-sm">
                  Prospections & Leads
                </span>
              )}
            </div>
            <p className="text-sm text-fuchsia-50 font-medium mt-1">
              {databasePage === 'future'
                ? 'Manage prospect creators, communication stages, demographic data, and lead status before bringing them into active roster.'
                : databasePage === 'all'
                ? 'Complete combined view of active creators and future creator prospects.'
                : 'Search, filter, and review top-tier creators across prime niche audiences.'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 relative z-10 items-center">
          <div className="bg-white/20 backdrop-blur-sm text-white border border-white/30 px-3 py-1.5 rounded-lg text-sm font-black shadow-sm whitespace-nowrap">
            {databasePage === 'future'
              ? `Total: ${futureCount} Future Creators`
              : databasePage === 'all'
              ? `Total: ${allCount} Total Creators`
              : `Total: ${activeCount} Active Creators`}
          </div>
          
          <button
            onClick={handleExportToGoogleSheets}
            disabled={isExporting}
            className="inline-flex items-center gap-2 bg-gradient-to-r from-emerald-400 to-teal-500 hover:from-emerald-500 hover:to-teal-600 text-white disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2.5 rounded-xl text-xs md:text-sm font-black uppercase tracking-wider transition-all duration-300 shadow-md hover:shadow-lg hover:scale-[1.02] cursor-pointer border border-emerald-400"
          >
            {isExporting ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Exporting...</span>
              </>
            ) : (
              <>
                <FileSpreadsheet className="w-4 h-4 text-white" />
                <span>Google Sheet</span>
              </>
            )}
          </button>

          <button
            onClick={() => {
              if (onOpenSync) {
                onOpenSync();
              } else {
                setShowSyncSection(!showSyncSection);
              }
            }}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs md:text-sm font-black uppercase tracking-wider transition-all duration-300 border cursor-pointer bg-white/10 border-white/30 text-white hover:bg-white/20 shadow-md backdrop-blur-sm`}
          >
            <Cloud className="w-4 h-4 text-fuchsia-200 animate-pulse" />
            <span>Cloud Sync</span>
          </button>

          {/* Instant Auto-Sync Indicator & Toggle */}
          <button
            type="button"
            onClick={() => {
              const nextState = !isAutoSyncEnabled;
              setIsAutoSyncEnabled(nextState);
              safeLocalStorage.setItem('INFLUENCER_MANAGER_DRIVE_AUTOSYNC', String(nextState));
              globalToast.info(nextState ? "⚡ Creator Database Auto-Sync ENABLED (Instant Real-time Mode)" : "Creator Database Auto-Sync PAUSED");
              if (nextState) {
                executeInstantSync(influencers);
              }
            }}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs md:text-sm font-black uppercase tracking-wider transition-all duration-300 border cursor-pointer shadow-md backdrop-blur-sm ${
              isAutoSyncEnabled
                ? 'bg-emerald-500/25 border-emerald-300 text-white hover:bg-emerald-500/35 shadow-emerald-500/20'
                : 'bg-white/10 border-white/30 text-white/70 hover:bg-white/20'
            }`}
            title={isAutoSyncEnabled ? "Auto-Synchronize is ON: New details (including WhatsApp numbers, rates, notes) update & sync instantly" : "Click to enable Instant Auto-Synchronize"}
          >
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isAutoSyncEnabled ? 'bg-emerald-300 shadow-sm shadow-emerald-400 animate-pulse' : 'bg-gray-400'}`} />
            <RefreshCw className={`w-4 h-4 text-emerald-200 ${isAutoSavingDb ? 'animate-spin' : ''}`} />
            <span>Auto-Sync: {isAutoSyncEnabled ? 'ON' : 'OFF'}</span>
            {lastSyncTime && isAutoSyncEnabled && (
              <span className="text-[10px] text-emerald-200 font-mono hidden xl:inline">({lastSyncTime})</span>
            )}
          </button>

          <input 
            type="file" 
            accept=".csv" 
            ref={fileInputRef} 
            onChange={handleImportCSV} 
            className="hidden" 
            id="csv-upload" 
          />
          <label 
            htmlFor="csv-upload"
            className="inline-flex items-center gap-2 bg-white text-emerald-600 hover:bg-emerald-50 px-4 py-2.5 rounded-xl text-xs md:text-sm font-black uppercase tracking-wider transition-all duration-300 shadow-md hover:shadow-lg hover:scale-[1.02] cursor-pointer border border-white"
          >
            <FileSpreadsheet className="w-4 h-4" /> Import CSV
          </label>

          <button 
            onClick={handleExportCSV}
            className="inline-flex items-center gap-2 bg-white text-blue-600 hover:bg-blue-50 px-4 py-2.5 rounded-xl text-xs md:text-sm font-black uppercase tracking-wider transition-all duration-300 shadow-md hover:shadow-lg hover:scale-[1.02] cursor-pointer border border-white"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>

          <button 
            onClick={handleSyncFromDrive}
            disabled={isSyncingDb}
            className="inline-flex items-center gap-2 bg-white text-indigo-600 hover:bg-indigo-50 px-4 py-2.5 rounded-xl text-xs md:text-sm font-black uppercase tracking-wider transition-all duration-300 shadow-md hover:shadow-lg hover:scale-[1.02] cursor-pointer border border-white disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncingDb ? 'animate-spin' : ''}`} /> {isSyncingDb ? 'Syncing...' : 'Sync from Drive'}
          </button>


          {onDeleteAllInfluencers && influencers.length > 0 && (
            <button 
              onClick={() => {
                if (window.confirm("Are you sure you want to delete ALL creators? This action cannot be undone.")) {
                  onDeleteAllInfluencers();
                }
              }}
              className="inline-flex items-center gap-2 bg-white text-red-600 hover:bg-red-50 px-4 py-2.5 rounded-xl text-xs md:text-sm font-black uppercase tracking-wider transition-all duration-300 shadow-md hover:shadow-lg hover:scale-[1.02] cursor-pointer border border-white"
            >
              <Trash2 className="w-4 h-4" /> Clear All
            </button>
          )}

          <button 
            onClick={() => {
              setNewCreatorStatus(databasePage === 'future' ? 'Future Creator' : 'Available');
              setNewCreatorEntryDate(getTodayKolkataISO());
              setShowAddCreatorForm(true);
            }}
            className="inline-flex items-center gap-2 bg-white text-fuchsia-600 hover:bg-fuchsia-50 px-4 py-2.5 rounded-xl text-xs md:text-sm font-black uppercase tracking-wider transition-all duration-300 shadow-md hover:shadow-lg hover:scale-[1.02] cursor-pointer border border-white"
          >
            <PlusCircle className="w-4 h-4" /> Add Creator
          </button>
        </div>
      </div>

      {/* Floating Note Generator */}
      {setFloatingNote && (
        <div className="bg-gradient-to-r from-amber-100 to-yellow-100 border border-yellow-300 p-5 rounded-2xl shadow-sm flex flex-col md:flex-row items-start md:items-center gap-5 transition-all">
          <div className="bg-yellow-200 p-3 rounded-xl text-yellow-700 shadow-sm border border-yellow-300 relative">
            <StickyNote className="w-6 h-6 animate-pulse" />
            <div className="absolute top-0 right-0 w-2.5 h-2.5 bg-red-500 rounded-full animate-ping" />
          </div>
          <div className="flex-1 space-y-1">
            <h3 className="text-sm font-black text-yellow-900 tracking-tight uppercase">Global Broadcast Note</h3>
            <p className="text-xs font-semibold text-yellow-700">Add a flashing note that floats across all pages. Type something below to activate.</p>
          </div>
          <div className="flex-1 w-full md:w-auto flex items-center gap-2">
            <input
              type="text"
              placeholder="E.g., Follow up with tech creators today!"
              className="flex-1 px-4 py-2.5 border-2 border-yellow-400 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 bg-white text-yellow-950 font-bold placeholder-yellow-400 shadow-inner"
              value={floatingNote || ''}
              onChange={(e) => {
                setFloatingNote(e.target.value);
                if (e.target.value) {
                  safeLocalStorage.setItem('INFLUENCER_MANAGER_FLOATING_NOTE', e.target.value);
                } else {
                  safeLocalStorage.removeItem('INFLUENCER_MANAGER_FLOATING_NOTE');
                }
              }}
            />
            {floatingNote && (
              <button
                onClick={() => {
                  setFloatingNote('');
                  safeLocalStorage.removeItem('INFLUENCER_MANAGER_FLOATING_NOTE');
                }}
                className="p-2.5 text-rose-500 bg-white hover:bg-rose-50 border-2 border-rose-200 hover:border-rose-400 rounded-xl transition shadow-sm active:scale-95 cursor-pointer"
                title="Delete Global Note"
              >
                <Trash2 className="w-4 h-4 font-bold" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Export to Google Sheets Result Banners */}
      {exportSpreadsheetUrl && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl shadow-xs space-y-3 animate-fade-in">
          <div className="flex items-start justify-between">
            <div className="flex gap-2.5">
              <span className="text-xl">🎉</span>
              <div>
                <p className="text-xs font-bold text-emerald-900 uppercase tracking-wide">Google Sheet Export Successful!</p>
                <p className="text-[11px] text-emerald-700">A brand new sourced creator spreadsheet was populated and published successfully using your active credentials.</p>
              </div>
            </div>
            <button 
              type="button" 
              onClick={() => setExportSpreadsheetUrl(null)}
              className="text-emerald-500 hover:text-emerald-800 font-bold transition text-xs pr-1 cursor-pointer"
            >
              ✕
            </button>
          </div>
          <div className="flex gap-3">
            <a 
              href={exportSpreadsheetUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 px-3.5 py-1.5 rounded-lg text-white font-bold text-xs uppercase tracking-wide transition border border-emerald-700 cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> Open Google Sheet ↗
            </a>
          </div>
        </div>
      )}

      {exportError && (
        <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-xl shadow-xs flex justify-between items-start animate-fade-in">
          <div className="flex gap-2.5">
            <span className="text-xl">⚠️</span>
            <div>
              <p className="text-xs font-bold text-red-900 uppercase tracking-wide">Spreadsheet Export Failed</p>
              <p className="text-[11px] text-red-700 font-mono">{exportError}</p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={() => setExportError(null)}
            className="text-red-400 hover:text-red-800 font-bold transition text-xs pr-1 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {showSyncSection && (
        <div className="animate-fade-in transition-all">
          <GoogleDriveSync
            influencers={influencers}
            campaigns={campaigns}
            tasks={tasks}
            messages={messages}
            contracts={contracts}
            billingEntries={billingEntries}
            user={user}
            accessToken={accessToken}
            onRestoreData={onRestoreData}
            onLoginSuccess={onLoginSuccess}
            onLogoutSuccess={onLogoutSuccess}
          />
        </div>
      )}







      {/* Future Creator Pipeline Communication Status Filter */}
      {databasePage === 'future' && (
        <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-violet-50 border border-indigo-200/80 p-4 rounded-2xl shadow-sm flex flex-col gap-2.5 animate-fade-in">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-indigo-600 text-white rounded-lg shadow-xs">
                <MessageCircle className="w-4 h-4" />
              </span>
              <span className="text-xs font-black text-indigo-950 uppercase tracking-widest font-mono">
                Pipeline Communication Stages
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const target = influencers.find(i => i.status === 'Future Creator');
                  if (target) {
                    setCapturedPreview(null);
                    setScreenCaptureModal({
                      isOpen: true,
                      influencer: target,
                      platform: 'WhatsApp'
                    });
                  } else {
                    globalToast.info('Please add or select a Future Creator first.');
                  }
                }}
                className="px-2.5 py-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg text-[11px] font-black uppercase tracking-wider shadow-xs transition flex items-center gap-1.5 cursor-pointer hover:scale-105 active:scale-95"
                title="Capture screen shot of previous WhatsApp/IG/FB chat and download to PC"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Screen Capture Chat</span>
              </button>

              {futureCommFilter !== 'All' && (
                <button
                  type="button"
                  onClick={() => setFutureCommFilter('All')}
                  className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 underline uppercase tracking-wider cursor-pointer"
                >
                  Show All Stages ({futureCount})
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {[
              { key: 'All', label: 'All Future', count: futureCount, badgeBg: 'bg-indigo-600 text-white' },
              { key: 'MESSAGE SENT', label: '📨 Sent', count: futureSentCount, badgeBg: 'bg-blue-600 text-white' },
              { key: 'REPLY RECEIVED', label: '💬 Replied', count: futureRepliedCount, badgeBg: 'bg-green-600 text-white' },
              { key: 'MESSAGE NOT REPLIED', label: '⏳ No Reply', count: futureNoReplyCount, badgeBg: 'bg-amber-600 text-white' },
              { key: 'AGREE FOR VIDEO PROMOTION', label: '✅ Agreed', count: futureAgreedCount, badgeBg: 'bg-emerald-600 text-white' },
              { key: 'NOT AGREE FOR VIDEO PROMOTION', label: '❌ Declined', count: futureDeclinedCount, badgeBg: 'bg-rose-600 text-white' },
              { key: 'DEMOGRAPHIC PROFILE AND ADDRESS RECEIVED', label: '📦 Received Address', count: futureReceivedCount, badgeBg: 'bg-purple-600 text-white' },
            ].map(stage => (
              <button
                key={stage.key}
                type="button"
                onClick={() => setFutureCommFilter(stage.key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-150 cursor-pointer flex items-center gap-2 shadow-xs ${
                  futureCommFilter === stage.key
                    ? `${stage.badgeBg} shadow-sm ring-2 ring-indigo-400 scale-[1.03]`
                    : 'bg-white text-gray-700 hover:bg-indigo-100/70 border border-indigo-200'
                }`}
              >
                <span>{stage.label}</span>
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  futureCommFilter === stage.key ? 'bg-white/25 text-white' : 'bg-gray-100 text-gray-700'
                }`}>
                  {stage.count}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-gradient-to-br from-violet-50 to-fuchsia-50 rounded-2xl border border-fuchsia-200 p-5 shadow-md relative">
        <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
          <div className="absolute -left-16 -bottom-16 w-32 h-32 bg-violet-300 rounded-full mix-blend-multiply opacity-20 filter blur-3xl"></div>
          <div className="absolute -right-16 -top-16 w-32 h-32 bg-fuchsia-300 rounded-full mix-blend-multiply opacity-20 filter blur-3xl"></div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 relative z-10">
          <div className="lg:col-span-4 relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-fuchsia-400">
              <Search className="w-5 h-5 drop-shadow-sm" />
            </span>
            <input
              type="text"
              placeholder="Search by name, handle, or location..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-fuchsia-200/70 shadow-sm rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500 focus:border-fuchsia-500 transition-all font-semibold text-gray-800 placeholder:font-medium placeholder:text-gray-400"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search.length > 0 && (
              <div className="absolute top-full left-0 mt-2 w-full z-50 bg-red-600 border border-red-700 text-white text-[10px] px-3 py-2 rounded-lg shadow-lg font-bold animate-pulse flex items-center justify-between">
                <span className="flex items-center gap-1.5"><Search className="w-3.5 h-3.5" /> SEARCH ACTIVE: "{search}" - Clear to see all records</span>
                <button onClick={() => setSearch('')} className="text-red-100 hover:text-white ml-2 bg-red-700 hover:bg-red-800 p-1 rounded-full transition-colors" title="Clear search">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          <div className="lg:col-span-3">
            <select
              className="w-full px-3 py-2.5 bg-white border border-fuchsia-200/70 shadow-sm rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500 focus:border-fuchsia-500 transition-all font-bold text-gray-800 appearance-none hover:bg-gray-50"
              value={selectedNiche}
              onChange={(e) => setSelectedNiche(e.target.value)}
            >
              <option disabled>Filter by Niche</option>
              {niches.map(n => (
                <option key={n} value={n}>{n === 'All' ? 'All Niches' : n}</option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-5 flex items-center gap-4 bg-white/60 p-2.5 rounded-xl border border-fuchsia-200/50 shadow-sm backdrop-blur-sm">
            <div className="flex-1 flex items-center gap-3 pl-2">
              <SlidersHorizontal className="w-4 h-4 text-fuchsia-600 shrink-0" />
              <span className="text-xs text-fuchsia-950 font-black whitespace-nowrap tracking-wider font-mono">Eng. Rate: {minEngagement}%+</span>
              <input
                type="range"
                min="0"
                max="8"
                step="0.5"
                className="w-full h-2 bg-fuchsia-200 rounded-lg appearance-none cursor-pointer accent-fuchsia-600 hover:accent-fuchsia-500 transition-all"
                value={minEngagement}
                onChange={(e) => setMinEngagement(parseFloat(e.target.value))}
              />
            </div>
            <button 
              className="px-4 py-1.5 text-xs font-black uppercase text-fuchsia-600 bg-white hover:bg-fuchsia-50 hover:text-fuchsia-700 rounded-lg transition-colors border border-fuchsia-200 shadow-sm"
              onClick={() => { setSearch(''); setSelectedNiche('All'); setMinEngagement(0); }}
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {true && (
        <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white border border-indigo-100 shadow-sm rounded-xl p-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-black text-indigo-900 uppercase tracking-widest flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-indigo-500" /> DM Template 1
              </h3>
              <div className="flex items-center gap-2">
                <button 
                  className="p-1 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 rounded transition-colors"
                  title="Copy Branded Template"
                  onClick={() => {
                    const branded = attachCompanyBranding(dmTemplate);
                    navigator.clipboard.writeText(branded).then(() => {
                      globalToast.success('Company-branded DM Template 1 copied to clipboard!');
                    }).catch(()=>{});
                  }}
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button 
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 underline uppercase tracking-wider"
                  onClick={() => setShowDmTemplateEditor(!showDmTemplateEditor)}
                >
                  {showDmTemplateEditor ? 'Close' : 'Edit'}
                </button>
              </div>
            </div>
            
            {showDmTemplateEditor ? (
              <div className="space-y-3 animate-fade-in">
                <p className="text-xs text-gray-500 font-medium">
                  Use <span className="font-mono bg-gray-100 px-1 rounded text-gray-700">{`{name}`}</span> to inject the creator's first name.
                </p>
                <textarea
                  className="w-full h-32 p-3 text-sm border border-indigo-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-indigo-50/30 font-medium text-gray-800"
                  value={dmTemplate}
                  onChange={(e) => setDmTemplate(e.target.value)}
                />
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-100 p-3 rounded-lg text-sm text-gray-600 font-medium whitespace-pre-wrap min-h-[6rem]">
                {dmTemplate || 'No template set. Click edit to create one.'}
              </div>
            )}
          </div>

          <div className="bg-white border border-indigo-100 shadow-sm rounded-xl p-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-black text-indigo-900 uppercase tracking-widest flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-indigo-500" /> DM Template 2
              </h3>
              <div className="flex items-center gap-2">
                <button 
                  className="p-1 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 rounded transition-colors"
                  title="Copy Branded Template"
                  onClick={() => {
                    const branded = attachCompanyBranding(dmTemplate2);
                    navigator.clipboard.writeText(branded).then(() => {
                      globalToast.success('Company-branded DM Template 2 copied to clipboard!');
                    }).catch(()=>{});
                  }}
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button 
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 underline uppercase tracking-wider"
                  onClick={() => setShowDmTemplate2Editor(!showDmTemplate2Editor)}
                >
                  {showDmTemplate2Editor ? 'Close' : 'Edit'}
                </button>
              </div>
            </div>
            
            {showDmTemplate2Editor ? (
              <div className="space-y-3 animate-fade-in">
                <p className="text-xs text-gray-500 font-medium">
                  Use <span className="font-mono bg-gray-100 px-1 rounded text-gray-700">{`{name}`}</span> to inject the creator's first name.
                </p>
                <textarea
                  className="w-full h-32 p-3 text-sm border border-indigo-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-indigo-50/30 font-medium text-gray-800"
                  value={dmTemplate2}
                  onChange={(e) => setDmTemplate2(e.target.value)}
                />
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-100 p-3 rounded-lg text-sm text-gray-600 font-medium whitespace-pre-wrap min-h-[6rem]">
                {dmTemplate2 || 'No template set. Click edit to create one.'}
              </div>
            )}
          </div>
        </div>
      )}

      {successMsg && (
        <div className="bg-emerald-51 border border-emerald-200 text-emerald-800 p-3.5 rounded-lg text-sm flex items-center gap-2 animate-fade-in">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Spreadsheet Row Layout */}
      <div className="flex flex-col gap-3">
        {filteredInfluencers.map((inf, index) => (
          <div 
            key={inf.id} 
            className={`bg-white rounded-lg border transition-all duration-300 shadow-sm hover:shadow-md cursor-pointer flex flex-col xl:flex-row xl:items-stretch justify-between overflow-hidden group w-full ${selectedInfluencer?.id === inf.id ? 'ring-2 ring-fuchsia-500 border-transparent shadow-fuchsia-500/20' : 'border-slate-200 hover:border-fuchsia-300'}`}
            onClick={() => setSelectedInfluencer(inf)}
          >
            <div className="p-2.5 flex-1 min-w-0 relative bg-gradient-to-r from-white to-violet-50/20 flex flex-col xl:flex-row xl:items-center gap-2 xl:gap-3">
              <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-fuchsia-100 to-transparent rounded-bl-full opacity-50 pointer-events-none transition-opacity group-hover:opacity-100 xl:hidden"></div>
              
              {/* Creator Info */}
              <div className="flex items-start justify-between gap-2 relative z-10 xl:w-[22%] shrink min-w-0">
                <div className="flex items-center gap-2.5 w-full">
                  {/* Serial Number */}
                  <div className="w-5 h-5 flex items-center justify-center rounded-md bg-white text-slate-500 font-bold font-mono text-[9px] shrink-0 border border-slate-200 shadow-sm">
                    {index + 1}
                  </div>
                  <div className="relative shrink-0">
                    <div className="absolute inset-0 bg-gradient-to-tr from-violet-500 to-fuchsia-500 rounded-full blur-[2px] opacity-70 group-hover:blur-md transition-all"></div>
                    <img 
                      src={inf.avatar} 
                      alt={inf.name} 
                      className="w-9 h-9 rounded-full object-cover border-[2px] border-white relative z-10" 
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div className="min-w-0 flex flex-col items-start w-full">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onUpdateInfluencer) {
                          onUpdateInfluencer(inf.id, { status: inf.status === 'Available' ? 'Future Creator' : 'Available' });
                        }
                      }}
                      title="Click to toggle status"
                      className={`px-1.5 py-0.5 mb-0.5 text-[8px] leading-tight uppercase font-black tracking-widest rounded shadow-sm cursor-pointer transition-all hover:scale-105 active:scale-95 ${
                        inf.status === 'Active' ? 'bg-gradient-to-r from-rose-500 to-pink-500 text-white hover:from-rose-600 hover:to-pink-600' :
                        inf.status === 'Available' ? 'bg-gradient-to-r from-emerald-400 to-teal-500 text-white hover:from-emerald-500 hover:to-teal-600' :
                        inf.status === 'Future Creator' ? 'bg-gradient-to-r from-blue-400 to-indigo-500 text-white hover:from-blue-500 hover:to-indigo-600' :
                        'bg-gradient-to-r from-amber-400 to-orange-500 text-white hover:from-amber-500 hover:to-orange-600'
                      }`}>
                      {inf.status}
                    </button>
                    <h3 className="font-black text-gray-900 flex items-center gap-1 text-sm group-hover:text-fuchsia-700 transition-colors truncate max-w-full">
                      <span className="truncate">{inf.name}</span>
                      {inf.perfRanking <= 2 && <span className="p-0.5 bg-amber-100 rounded-full shrink-0" title="Top Performer"><Award className="w-3 h-3 text-amber-500 fill-amber-500" /></span>}
                      {inf.notes?.includes('Added from Monthly Planner') && (
                        <div className="flex items-center gap-1" title="Restored from Monthly Planner">
                          <span 
                            className={`p-0.5 rounded-full shrink-0 ${latestRestoredInfluencerIds.has(inf.id) ? 'bg-red-100 animate-pulse' : 'bg-blue-100'}`} 
                          >
                            <CalendarCheck className={`w-3 h-3 ${latestRestoredInfluencerIds.has(inf.id) ? 'text-red-600' : 'text-blue-500'}`} />
                          </span>
                          {(() => {
                            const parts = inf.id.split('-');
                            if (parts.length >= 2) {
                              const ts = parseInt(parts[1], 10);
                              if (!isNaN(ts) && ts > 1000000) {
                                return (
                                  <span className="text-[9px] text-gray-400 font-medium whitespace-nowrap xl:hidden 2xl:inline-block">
                                    {new Date(ts).toLocaleDateString('en-GB', {month:'short', day:'numeric'})} {new Date(ts).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                  </span>
                                );
                              }
                            }
                            return null;
                          })()}
                        </div>
                      )}
                    </h3>
                    <p className="text-[10px] text-violet-600 font-mono font-bold truncate max-w-full">{inf.handle}</p>
                    {(() => {
                      const displayDate = formatDateToDMY(inf.entryDate) || (inf.id && inf.id.startsWith('inf-') ? (() => {
                        const ts = parseInt(inf.id.split('-')[1]);
                        return (!isNaN(ts) && ts > 1000000) ? formatDateToDMY(new Date(ts)) : '';
                      })() : '');
                      if (!displayDate && inf.status !== 'Future Creator' && databasePage !== 'future') return null;
                      const dateToShow = displayDate || formatDateToDMY(new Date());
                      return (
                        <div className="flex items-center gap-1 text-[9px] font-mono text-emerald-800 bg-emerald-50 border border-emerald-200/90 px-1.5 py-0.5 rounded mt-0.5 w-fit font-bold shadow-2xs" title={`Creator Entry Date: ${dateToShow}`}>
                          <Calendar className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                          <span>Entry: <strong>{dateToShow}</strong></span>
                        </div>
                      );
                    })()}
                    {(() => {
                      const infTasks = tasks.filter(t => t.influencerId === inf.id && (t.videoLink1 || t.videoLink2 || t.videoLink3 || t.releaseDate));
                      if (infTasks.length > 0) {
                        const firstTask = infTasks[0];
                        const link = firstTask.videoLink1 || firstTask.videoLink2 || firstTask.videoLink3;
                        const pData = link ? videoMetadataMap[link]?.data : null;
                        const kolkata = pData?.publishedAt ? formatToKolkataTime(pData.publishedAt) : null;
                        const uDate = kolkata?.isoDate || pData?.publishedDate || firstTask.releaseDate;
                        const uTime = kolkata?.time || pData?.publishedTime || firstTask.uploadTime;
                        if (!uDate && !uTime) return null;
                        return (
                          <div className="flex items-center gap-1.5 text-[9px] font-mono bg-purple-100/90 border border-purple-300 px-2 py-0.5 rounded-md mt-1 truncate max-w-full shadow-2xs" title={`Latest Deliverable (IST / Kolkata): ${uDate || ''} ${uTime ? 'at ' + uTime : ''}`.trim()}>
                            <Video className="w-2.5 h-2.5 text-purple-700 shrink-0" />
                            {uDate && <strong className="font-black text-gray-950">{uDate}</strong>}
                            {uTime && (
                              <span className="flex items-center gap-1 bg-white/90 border border-purple-200 px-1.5 py-0.5 rounded border-l border-purple-300 pl-1.5 shrink-0">
                                <Clock className="w-2.5 h-2.5 text-fuchsia-700" />
                                <strong className="font-black text-fuchsia-950">{uTime}</strong>
                              </span>
                            )}
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                </div>
              </div>

              {/* Location & Niche */}
              <div className="mt-2 xl:mt-0 space-y-1.5 relative z-10 xl:w-[12%] shrink min-w-0">
                <div className="flex items-center gap-1.5 text-[10px] text-gray-600 font-medium">
                  <div className="p-0.5 bg-violet-100 text-violet-600 rounded shrink-0"><MapPin className="w-3 h-3" /></div>
                  <span className="truncate">{inf.location}</span>
                </div>
                <div className="text-[9px] bg-fuchsia-100/50 px-2 py-0.5 rounded inline-block text-fuchsia-700 font-bold border border-fuchsia-200 uppercase tracking-wide truncate max-w-full">
                  {inf.niche}
                </div>
              </div>

              {/* Stats Box */}
              <div className="flex items-center justify-around gap-1 mt-3 xl:mt-0 bg-gradient-to-r from-white to-violet-50 px-2 py-1.5 rounded-lg border border-violet-100 text-center shadow-sm relative z-10 group-hover:border-violet-200 transition-colors xl:w-[14%] shrink min-w-0">
                <div>
                  <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Followers</div>
                  <div className="text-xs font-black text-violet-900 font-mono">
                    {inf.followers >= 1000000 ? `${(inf.followers / 1000000).toFixed(1)}M` : `${inf.followers / 1000}K`}
                  </div>
                </div>
                <div className="w-px h-6 bg-violet-100"></div>
                <div>
                  <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Engagement</div>
                  <div className="text-xs font-black text-fuchsia-600 font-mono">
                    {inf.engagementRate}%
                  </div>
                </div>
              </div>

              {/* Mini platforms list */}
              <div className="flex flex-wrap gap-1.5 mt-3 xl:mt-0 relative z-10 xl:w-[16%] shrink min-w-0">
                { (inf.platforms || []).map((p: any, idx: any) => (
                  <span key={idx} className="bg-white border border-violet-200 px-1.5 py-0.5 rounded text-[9px] font-bold text-slate-600 font-mono flex items-center gap-1 shadow-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500" />
                    {p.name.substring(0, 2)}: {Number(p.followers) >= 1000 ? `${(Number(p.followers) / 1000).toFixed(0)}k` : p.followers}
                  </span>
                ))}
              </div>

              {/* Dynamic Profiles Audited Verification Status */}
              <div className="mt-3 xl:mt-0 pt-3 xl:pt-0 border-t xl:border-t-0 border-violet-100 space-y-1.5 text-left relative z-10 xl:flex-1 min-w-0">
                <div className="text-[9px] font-black text-violet-400 uppercase tracking-widest flex items-center justify-between">
                  <span>Roster</span>
                  {inf.linkAnalysis?.lastChecked && (
                    <span className="text-[8px] text-fuchsia-500 font-mono font-bold lowercase scale-90 origin-right bg-fuchsia-50 px-1 rounded truncate">audited: {inf.linkAnalysis.lastChecked}</span>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {inf.facebookLink ? inf.facebookLink.split('|').map((link: any) => link.trim()).filter(Boolean).map((link: any, i: any) => (
                    <a
                      key={'fb'+i}
                      href={link}
                      target="_blank"
                      rel="no-referrer"
                      onClick={(e) => e.stopPropagation()}
                      className={`text-[9px] px-1.5 py-0.5 font-black rounded transition-all border flex items-center gap-1 cursor-pointer shadow-sm ${
                        inf.linkAnalysis?.facebook?.valid === false
                          ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-500 hover:text-white'
                          : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-500 hover:text-white'
                      }`}
                      title={inf.linkAnalysis?.facebook?.issues?.join(', ') || 'Facebook link remains verified healthy'}
                    >
                      FB{i > 0 ? (i+1) : ''} {inf.linkAnalysis?.facebook && !inf.linkAnalysis.facebook.valid ? '⚠️' : '✓'}
                    </a>
                  )) : null}

                  {inf.instagramLink ? inf.instagramLink.split('|').map((link: any) => link.trim()).filter(Boolean).map((link: any, i: any) => (
                    <a
                      key={'ig'+i}
                      href={link}
                      target="_blank"
                      rel="no-referrer"
                      onClick={(e) => e.stopPropagation()}
                      className={`text-[9px] px-1.5 py-0.5 font-black rounded transition-all border flex items-center gap-1 cursor-pointer shadow-sm ${
                        inf.linkAnalysis?.instagram?.valid === false
                          ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-500 hover:text-white'
                          : 'bg-gradient-to-r from-purple-50 to-pink-50 text-purple-700 border-purple-200 hover:from-purple-500 hover:to-pink-500 hover:text-white hover:border-transparent'
                      }`}
                      title={inf.linkAnalysis?.instagram?.issues?.join(', ') || 'Instagram link remains verified healthy'}
                    >
                      IG{i > 0 ? (i+1) : ''} {inf.linkAnalysis?.instagram && !inf.linkAnalysis.instagram.valid ? '⚠️' : '✓'}
                    </a>
                  )) : null}

                  {inf.youtubeLink ? inf.youtubeLink.split('|').map((link: any) => link.trim()).filter(Boolean).map((link: any, i: any) => (
                    <a
                      key={'yt'+i}
                      href={link}
                      target="_blank"
                      rel="no-referrer"
                      onClick={(e) => e.stopPropagation()}
                      className={`text-[9px] px-1.5 py-0.5 font-black rounded transition-all border flex items-center gap-1 cursor-pointer shadow-sm ${
                        inf.linkAnalysis?.youtube?.valid === false
                          ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-500 hover:text-white'
                          : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-600 hover:text-white'
                      }`}
                      title={inf.linkAnalysis?.youtube?.issues?.join(', ') || 'YouTube channel remains verified healthy'}
                    >
                      YT{i > 0 ? (i+1) : ''} {inf.linkAnalysis?.youtube && !inf.linkAnalysis.youtube.valid ? '⚠️' : '✓'}
                    </a>
                  )) : null}
                </div>
              </div>

              {/* Status Update Component for Future mode */}
              {inf.status === 'Future Creator' && (
                <div className="mt-3 xl:mt-0 pt-3 xl:pt-0 border-t xl:border-t-0 border-violet-100 relative z-10 xl:w-[15%] shrink min-w-0" onClick={(e) => e.stopPropagation()}>
                  <div className="text-[9px] font-black text-violet-500 uppercase tracking-widest mb-1.5 truncate">Communication</div>
                  <select
                    className={`w-full text-[10px] p-1.5 border rounded-lg font-black focus:outline-none focus:ring-2 focus:ring-violet-400 transition-colors uppercase tracking-wide cursor-pointer ${getCommunicationStatusColors(inf.communicationStatus)}`}
                    value={inf.communicationStatus || ''}
                    onChange={(e) => {
                      e.stopPropagation();
                      if (onUpdateInfluencer) {
                        onUpdateInfluencer(inf.id, { communicationStatus: e.target.value as any });
                      }
                    }}
                  >
                    <option value="">-- Set Status --</option>
                    <option value="MESSAGE SENT">📨 SENT</option>
                    <option value="REPLY RECEIVED">💬 REPLIED</option>
                    <option value="MESSAGE NOT REPLIED">⏳ NO REPLY</option>
                    <option value="AGREE FOR VIDEO PROMOTION">✅ AGREED</option>
                    <option value="NOT AGREE FOR VIDEO PROMOTION">❌ DECLINED</option>
                    <option value="DEMOGRAPHIC PROFILE AND ADDRESS RECEIVED">📦 RECEIVED</option>
                  </select>
                  {inf.communicationStatus && (
                    <div className="mt-1 flex items-center justify-end gap-1">
                      {getAnimatedStatusElement(inf.communicationStatus)}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Card Footer Actions */}
            <div className="bg-gradient-to-r from-violet-100/50 to-fuchsia-100/50 px-2 py-3 xl:py-3 xl:w-[160px] border-t xl:border-t-0 xl:border-l border-violet-100 flex flex-row xl:flex-col items-center justify-between xl:justify-center gap-2 relative z-10 shrink-0 h-full" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-center text-xs font-mono font-black text-violet-900 bg-white/60 px-2 py-1 rounded-md shadow-sm border border-violet-100 w-auto xl:w-full">
                <IndianRupee className="w-3.5 h-3.5 text-fuchsia-600 inline -mt-0.5 mr-0.5" />
                <span>{inf.costPerPost}/post</span>
              </div>
              <div className="flex items-center justify-center gap-1.5 w-auto xl:w-full flex-wrap">
                {inf.mobile ? (() => {
                  const singleMobile = cleanSingleMobileForStorage(inf.mobile);
                  return (
                    <button
                      type="button"
                      title={`Open WhatsApp chat with ${inf.name}`}
                      className="p-1.5 bg-gradient-to-r from-emerald-400 to-teal-500 hover:from-emerald-500 hover:to-teal-600 border border-emerald-400 text-white rounded-lg shadow-sm transition-all hover:scale-105 active:scale-95 flex items-center justify-center font-bold cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        const firstName = inf.name ? inf.name.split(' ')[0] : 'Creator';
                        const rawMsg = dmTemplate ? dmTemplate.replace(/{name}/gi, firstName) : `Hi ${firstName}! Reaching out regarding creator collaboration!`;
                        openWhatsAppChat({
                          phoneNumber: singleMobile,
                          text: rawMsg,
                          preferApp: true,
                          contactName: inf.name
                        });
                        setActiveChatAlert({ influencer: inf, platform: 'WhatsApp' });
                        if (onUpdateInfluencer && inf.status === 'Future Creator') {
                          const updateData: any = { messageSentAt: new Date().toISOString() };
                          if (!inf.communicationStatus || inf.communicationStatus === 'MESSAGE SENT') {
                            updateData.communicationStatus = 'MESSAGE SENT';
                          }
                          onUpdateInfluencer(inf.id, updateData);
                        }
                      }}
                    >
                      <MessageCircle className="w-4 h-4" />
                    </button>
                  );
                })() : (
                    <button
                      type="button"
                      onClick={() => {
                        triggerUpdateWhatsAppModal({
                          influencerId: inf.id,
                          influencerName: inf.name,
                          influencerHandle: inf.handle,
                          influencerAvatar: inf.avatar,
                          currentMobile: inf.mobile,
                          contextTitle: 'Creator Directory'
                        });
                      }}
                      title="Add or update WhatsApp contact"
                      className="p-1.5 bg-emerald-50/50 hover:bg-emerald-100/70 border border-emerald-200 text-emerald-600 hover:text-emerald-700 hover:border-emerald-300 rounded-lg shadow-xs transition-all hover:scale-105 active:scale-95 flex items-center justify-center cursor-pointer"
                    >
                      <MessageCircle className="w-4 h-4" />
                    </button>
                  )}
                  {(inf.secondaryMobile || inf.alternateMobile) && (() => {
                    const secMobile = cleanSingleMobileForStorage(inf.secondaryMobile || inf.alternateMobile);
                    return (
                      <button
                        type="button"
                        title={`Open WhatsApp chat with ${inf.name}'s Second Mobile / Manager (${secMobile})`}
                        className="p-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 border border-amber-400 text-white rounded-lg shadow-sm transition-all hover:scale-105 active:scale-95 flex items-center justify-center font-bold cursor-pointer relative"
                        onClick={(e) => {
                          e.stopPropagation();
                          const firstName = inf.name ? inf.name.split(' ')[0] : 'Creator';
                          const rawMsg = dmTemplate ? dmTemplate.replace(/{name}/gi, firstName) : `Hi! Reaching out regarding creator ${inf.name} collaboration!`;
                          openWhatsAppChat({
                            phoneNumber: secMobile,
                            text: rawMsg,
                            preferApp: true,
                            contactName: `${inf.name} (Alt / Manager)`
                          });
                          setActiveChatAlert({ influencer: inf, platform: 'WhatsApp' });
                        }}
                      >
                        <MessageCircle className="w-4 h-4" />
                        <span className="absolute -top-1 -right-1 text-[8px] bg-red-650 text-white rounded-full px-1 font-mono font-bold leading-none py-0.5">2</span>
                      </button>
                    );
                  })()}
                  {inf.instagramLink && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          let link = inf.instagramLink || '';
                          let username = '';
                          
                          if (link.startsWith('@')) username = link.replace(/^@/, '');
                          else if (!link.includes('/') && !link.includes('.')) username = link;
                          else {
                            try {
                              let clean = link;
                              if (!clean.startsWith('http')) clean = 'https://' + clean;
                              const u = new URL(clean);
                              if (u.pathname.includes('profile.php')) {
                                username = u.searchParams.get('id') || '';
                              } else {
                                username = u.pathname.replace(/\/$/, '').split('/').pop() || '';
                              }
                            } catch (err) {}
                          }
                          
                          const targetUrl = username ? `https://ig.me/m/${username}` : (link.startsWith('http') ? link : `https://${link}`);
                          
                          const firstName = inf.name ? inf.name.split(' ')[0] : 'Creator';
                          const msg = dmTemplate ? dmTemplate.replace(/{name}/gi, firstName) : `Hi ${firstName}! Reaching out regarding creator collaboration!`;
                          const brandedMsg = attachCompanyBranding(msg);

                          window.open(targetUrl, '_blank', 'noopener,noreferrer');
                          navigator.clipboard.writeText(brandedMsg).then(() => {
                            globalToast.success(`Branded message copied for Instagram DM with ${firstName}!`);
                          }).catch(() => {});

                          setActiveChatAlert({ influencer: inf, platform: 'Instagram' });
                          if (onUpdateInfluencer) {
                            const updateData: any = { messageSentAt: new Date().toISOString() };
                            if (!inf.communicationStatus || inf.communicationStatus === 'MESSAGE SENT') {
                              updateData.communicationStatus = 'MESSAGE SENT';
                            }
                            onUpdateInfluencer(inf.id, updateData);
                          }
                        }}
                        title="Copy Company Branded Template & Open Instagram DM"
                        className="px-2 py-1.5 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 border border-transparent text-white rounded-lg text-[9px] uppercase tracking-widest shadow-sm transition-all hover:scale-105 active:scale-95 flex items-center justify-center font-black"
                      >
                        IG DM
                      </button>
                    )}
                    {inf.facebookLink && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          let link = inf.facebookLink || '';
                          let username = '';
                          
                          if (link.startsWith('@')) username = link.replace(/^@/, '');
                          else if (!link.includes('/') && !link.includes('.')) username = link;
                          else {
                            try {
                              let clean = link;
                              if (!clean.startsWith('http')) clean = 'https://' + clean;
                              const u = new URL(clean);
                              if (u.pathname.includes('profile.php')) {
                                username = u.searchParams.get('id') || '';
                              } else {
                                username = u.pathname.replace(/\/$/, '').split('/').pop() || '';
                              }
                            } catch (err) {}
                          }
                          
                          const targetUrl = username ? `https://m.me/${username}` : (link.startsWith('http') ? link : `https://${link}`);
                          
                          const firstName = inf.name ? inf.name.split(' ')[0] : 'Creator';
                          const msg = dmTemplate ? dmTemplate.replace(/{name}/gi, firstName) : `Hi ${firstName}! Reaching out regarding creator collaboration!`;
                          const brandedMsg = attachCompanyBranding(msg);

                          window.open(targetUrl, '_blank', 'noopener,noreferrer');
                          navigator.clipboard.writeText(brandedMsg).then(() => {
                            globalToast.success(`Branded message copied for Facebook Messenger with ${firstName}!`);
                          }).catch(() => {});

                          setActiveChatAlert({ influencer: inf, platform: 'Facebook' });
                          if (onUpdateInfluencer) {
                            const updateData: any = { messageSentAt: new Date().toISOString() };
                            if (!inf.communicationStatus || inf.communicationStatus === 'MESSAGE SENT') {
                              updateData.communicationStatus = 'MESSAGE SENT';
                            }
                            onUpdateInfluencer(inf.id, updateData);
                          }
                        }}
                        title="Copy Company Branded Template & Open Facebook Message"
                        className="px-2 py-1.5 bg-blue-600 hover:bg-blue-700 border border-transparent text-white rounded-lg text-[9px] uppercase tracking-widest shadow-sm transition-all hover:scale-105 active:scale-95 flex items-center justify-center font-black"
                      >
                        FB DM
                      </button>
                    )}

                  {/* Dedicated Chat Screen Capture & Download to PC Button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCapturedPreview(null);
                      setScreenCaptureModal({
                        isOpen: true,
                        influencer: inf,
                        platform: inf.mobile ? 'WhatsApp' : inf.instagramLink ? 'Instagram' : inf.facebookLink ? 'Facebook' : 'General'
                      });
                    }}
                    title="Capture Chat Screenshot & Download to PC"
                    className="p-1.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg shadow-sm transition-all hover:scale-105 active:scale-95 flex items-center justify-center font-bold cursor-pointer"
                  >
                    <Camera className="w-4 h-4" />
                  </button>

                  {/* Saved Screenshots Gallery Badge Button */}
                  {Array.isArray(inf.chatScreenshots) && inf.chatScreenshots.length > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setViewScreenshotsModal({ isOpen: true, influencer: inf });
                      }}
                      title={`View & Re-download ${inf.chatScreenshots.length} saved chat screenshot(s)`}
                      className="px-1.5 py-1 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 rounded-lg text-[9px] font-black uppercase tracking-wider shadow-2xs transition-all hover:scale-105 active:scale-95 flex items-center gap-1 cursor-pointer"
                    >
                      <ImageIcon className="w-3.5 h-3.5 text-amber-600" />
                      <span>{inf.chatScreenshots.length}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Are you sure you want to remove "${inf.name}" from the database?`)) {
                        onDeleteInfluencer(inf.id);
                      }
                    }}
                    title="Remove Creator"
                    className="p-1.5 bg-white border border-rose-200 hover:border-rose-400 hover:bg-rose-50 rounded-lg text-rose-500 shadow-sm transition-all hover:scale-105 active:scale-95 cursor-pointer flex items-center justify-center"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  
              </div>
              
              <div className="flex flex-col gap-1.5 w-full">
                {inf.status === 'Future Creator' ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onUpdateInfluencer) {
                        onUpdateInfluencer(inf.id, { status: 'Available' });
                        globalToast.success(`🎉 "${inf.name}" successfully promoted to Active Creator Database!`);
                      }
                    }}
                    title="Promote to Active Creator Database"
                    className="w-full px-2 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-lg text-[9px] font-black uppercase tracking-wider shadow-sm transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Activate Creator</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onUpdateInfluencer) {
                        onUpdateInfluencer(inf.id, { status: 'Future Creator' });
                        globalToast.info(`Moved "${inf.name}" to Future Creators Pipeline.`);
                      }
                    }}
                    title="Move this creator to Future Creators Pipeline"
                    className="w-full px-2 py-1 bg-white hover:bg-indigo-50 border border-indigo-200 text-indigo-700 hover:text-indigo-900 rounded-lg text-[8px] font-black uppercase tracking-wider transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <span>→ Move to Future</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setSelectedInfluencer(inf)}
                  className="w-full px-2 py-1.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white border-transparent rounded-lg text-[9px] font-black uppercase tracking-wider shadow-sm hover:shadow-md transition-all hover:scale-105 active:scale-95 cursor-pointer text-center flex items-center justify-center"
                >
                  Analyze Stats
                </button>
              </div>
            </div>
          </div>
        ))}

        {filteredInfluencers.length === 0 && (
          <div className="col-span-full bg-gradient-to-br from-violet-50 to-fuchsia-50 rounded-2xl border-2 border-dashed border-fuchsia-200 p-12 text-center text-gray-500 shadow-inner">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm text-fuchsia-400">
              <Sparkles className="w-8 h-8" />
            </div>
            <p className="font-black text-violet-900 text-lg">
              {databasePage === 'future' ? 'No Future Creators found.' : 'No creators match your filters.'}
            </p>
            <p className="text-sm text-fuchsia-600 font-medium mt-1">
              {databasePage === 'future' 
                ? 'Add prospect creators to track outreach, communication stages, demographic data, and lead status.' 
                : 'Try resetting the engagement or category filters to expand your search.'}
            </p>
            {databasePage === 'future' && (
              <button
                type="button"
                onClick={() => {
                  setNewCreatorStatus('Future Creator');
                  setShowAddCreatorForm(true);
                }}
                className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md hover:shadow-lg hover:scale-105 transition cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" /> Add Future Creator
              </button>
            )}
          </div>
        )}
      </div>

      {/* Profile Detail Slide-in Side Drawer / Modal */}
      {selectedInfluencer && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end bg-black/40 backdrop-blur-xs transition">
          <div className="absolute inset-0" onClick={() => setSelectedInfluencer(null)} />
          <div className="relative w-full max-w-lg bg-white h-full shadow-2xl flex flex-col justify-between animate-slide-left z-10">
            
            {/* Header */}
            <div className="p-6 border-b border-fuchsia-100 flex items-center justify-between bg-gradient-to-r from-violet-600 via-fuchsia-600 to-pink-500 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white rounded-full mix-blend-overlay filter blur-3xl opacity-20 pointer-events-none" />
              
              <div className="flex items-center gap-4 relative z-10">
                <img 
                  src={selectedInfluencer.avatar} 
                  alt={selectedInfluencer.name} 
                  className="w-16 h-16 rounded-full object-cover border-[3px] border-white shadow-md bg-white" 
                  referrerPolicy="no-referrer"
                />
                <div>
                  <h2 className="text-2xl font-black flex items-center gap-1.5 text-white drop-shadow-sm">
                    {selectedInfluencer.name}
                  </h2>
                  <p className="text-sm text-fuchsia-100 font-mono font-bold tracking-wide">{selectedInfluencer.handle}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedInfluencer(null)}
                className="w-10 h-10 rounded-full border border-white/30 bg-white/10 hover:bg-white/20 flex items-center justify-center text-white font-bold cursor-pointer backdrop-blur-sm transition-all relative z-10"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Content (Edit Mode or Normal Mode) */}
            {isEditingProfile ? (
              <div className="p-6 flex-1 overflow-y-auto space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-red-600 uppercase tracking-wider font-mono">Full Name *</label>
                  <input
                    type="text"
                    required
                    className="w-full text-xs text-gray-700 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 bg-white"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-red-600 uppercase tracking-wider font-mono">Sex / Gender *</label>
                  <div className="flex gap-2">
                    {(['Male', 'Female', 'Others'] as const).map((genderVal) => (
                      <button
                        key={genderVal}
                        type="button"
                        onClick={() => setEditSex(genderVal)}
                        className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition border cursor-pointer text-center ${
                          editSex === genderVal
                            ? 'bg-red-600 text-white border-transparent shadow-inner'
                            : 'bg-white text-gray-750 border-gray-300 hover:bg-red-50/40 hover:text-red-700'
                        }`}
                      >
                        {genderVal}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-red-600 uppercase tracking-wider font-mono">Profile Handle *</label>
                  <input
                    type="text"
                    required
                    className="w-full text-xs text-gray-700 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 bg-white"
                    value={editHandle}
                    onChange={(e) => setEditHandle(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-red-600 uppercase tracking-wider font-mono">Niche Category</label>
                  <input
                    type="text"
                    className="w-full text-xs text-gray-700 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 bg-white"
                    value={editNiche}
                    onChange={(e) => setEditNiche(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-red-600 uppercase tracking-wider font-mono">Location</label>
                  <input
                    type="text"
                    className="w-full text-xs text-gray-700 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 bg-white"
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-red-600 uppercase tracking-wider font-mono">Entry Date (IST)</label>
                    <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-mono font-bold">
                      {formatDateToDMY(editEntryDate) || 'DD/MM/YYYY'}
                    </span>
                  </div>
                  <input
                    type="date"
                    className="w-full text-xs text-gray-700 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 bg-white font-mono"
                    value={editEntryDate}
                    onChange={(e) => setEditEntryDate(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-red-600 uppercase tracking-wider font-mono">Total Followers</label>
                    <button
                      type="button"
                      onClick={async () => {
                        const fb = editFacebook || selectedInfluencer?.facebookLink || '';
                        const ig = editInstagram || selectedInfluencer?.instagramLink || '';
                        const yt = editYoutube || selectedInfluencer?.youtubeLink || '';
                        const nm = editName || selectedInfluencer?.name || '';
                        if (!fb && !ig && !yt && !nm) {
                          globalToast.info("Please provide at least a creator name or social link to sync followers.");
                          return;
                        }
                        globalToast.info("⚡ Synchronizing verified follower count...");
                        try {
                          const res = await fetch('/api/collect-creator-followers', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name: nm, instagramLink: ig, youtubeLink: yt, facebookLink: fb })
                          });
                          const data = await res.json();
                          if (data && data.success && data.totalFollowers > 0) {
                            setEditFollowers(String(data.totalFollowers));
                            globalToast.success(`⚡ Verified ${data.formattedTotal} real followers for ${nm || 'creator'}!`);
                          } else {
                            globalToast.info("Could not auto-fetch follower count. You can manually enter it below.");
                          }
                        } catch (e: any) {
                          globalToast.error(`Follower sync failed: ${e.message || 'Check network'}`);
                        }
                      }}
                      className="text-[9px] font-bold font-mono px-2 py-0.5 rounded bg-red-100 hover:bg-red-600 hover:text-white text-red-750 transition flex items-center gap-1 cursor-pointer"
                    >
                      <Sparkles className="w-2.5 h-2.5 text-amber-400" />
                      ⚡ Sync Real Followers
                    </button>
                  </div>
                  <input
                    type="number"
                    className="w-full text-xs text-gray-700 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 bg-white"
                    value={editFollowers}
                    onChange={(e) => setEditFollowers(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-red-600 uppercase tracking-wider font-mono">Cost Per Post (₹)</label>
                  <input
                    type="number"
                    className="w-full text-xs text-gray-700 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 bg-white"
                    value={editCostPerPost}
                    onChange={(e) => setEditCostPerPost(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-red-600 uppercase tracking-wider font-mono">Mobile Number (Primary)</label>
                  <input
                    type="tel"
                    placeholder="e.g. +91 98765 43210"
                    className="w-full text-xs text-gray-700 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 bg-white"
                    value={editMobile}
                    onChange={(e) => setEditMobile(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-red-600 uppercase tracking-wider font-mono">Secondary / Alternate Mobile</label>
                    <span className="text-[9px] bg-red-100 text-red-700 px-1.5 py-0.2 rounded-full font-bold font-sans">Alt / Manager</span>
                  </div>
                  <input
                    type="tel"
                    placeholder="e.g. +91 98765 43211 (Manager or alternate line)"
                    className="w-full text-xs text-gray-700 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 bg-white"
                    value={editSecondaryMobile}
                    onChange={(e) => setEditSecondaryMobile(e.target.value)}
                  />
                </div>

                <div className="bg-gray-50 border border-gray-200 p-4 rounded-xl space-y-3">
                  <div className="text-[10px] font-black text-gray-740 uppercase tracking-widest border-b border-gray-200 pb-1">
                    Edit Social Platform Profile Links
                  </div>
                  
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Facebook Link</label>
                    <input
                      type="url"
                      placeholder="e.g. https://www.facebook.com/profile"
                      className="w-full text-xs text-gray-700 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 bg-white"
                      value={editFacebook}
                      onChange={(e) => setEditFacebook(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Instagram Link</label>
                    <input
                      type="url"
                      placeholder="e.g. https://www.instagram.com/username"
                      className="w-full text-xs text-gray-700 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 bg-white"
                      value={editInstagram}
                      onChange={(e) => setEditInstagram(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">YouTube Link</label>
                    <input
                      type="url"
                      placeholder="e.g. https://www.youtube.com/@channel"
                      className="w-full text-xs text-gray-700 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 bg-white"
                      value={editYoutube}
                      onChange={(e) => setEditYoutube(e.target.value)}
                    />
                  </div>
                </div>


                <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-3 mt-4">
                  <label className="text-xs font-bold text-red-600 uppercase tracking-widest font-mono">Billing Profile</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Bill From Name</label>
                      <input
                        type="text"
                        placeholder="e.g. John Doe / Creator LLC"
                        className="w-full text-xs text-gray-700 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 bg-white"
                        value={editBillingName}
                        onChange={(e) => setEditBillingName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Bill From Address</label>
                      <input
                        type="text"
                        placeholder="e.g. 123 Main St, City, Country"
                        className="w-full text-xs text-gray-700 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 bg-white"
                        value={editBillingAddress}
                        onChange={(e) => setEditBillingAddress(e.target.value)}
                      />
                    </div>
                  </div>
                  
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Bill To Name</label>
                      <input
                        type="text"
                        placeholder="e.g. PROTOGROW CORP LLP"
                        className="w-full text-xs text-gray-700 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 bg-white"
                        value={editBillToName}
                        onChange={(e) => setEditBillToName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Bill To Phone</label>
                      <input
                        type="text"
                        placeholder="e.g. 8724044420"
                        className="w-full text-xs text-gray-700 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 bg-white"
                        value={editBillToPhone}
                        onChange={(e) => setEditBillToPhone(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-1 mt-3">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Bill To Address</label>
                    <input
                      type="text"
                      placeholder="e.g. HOUSE NO 22..."
                      className="w-full text-xs text-gray-700 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 bg-white"
                      value={editBillToAddress}
                      onChange={(e) => setEditBillToAddress(e.target.value)}
                    />
                  </div>

<div className="pt-2 border-t border-gray-200 mt-3">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2 block">Creator Signature Image</label>
                    
                    <div className="flex flex-col sm:flex-row gap-3">
                      {editInfluencerSigData ? (
                        <div className="relative group shrink-0">
                          <img src={editInfluencerSigData} alt="Signature Preview" className="h-16 w-32 object-contain bg-white border border-gray-200 rounded p-1 shadow-sm" />
                          <button
                            type="button"
                            onClick={() => {
                              setEditInfluencerSigData('');
                              setEditInfluencerSignature('');
                            }}
                            className="absolute -top-2 -right-2 bg-red-100 hover:bg-red-200 text-red-600 rounded-full p-1 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Remove Signature"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="h-16 w-32 bg-gray-100 border border-gray-200 border-dashed rounded flex items-center justify-center text-gray-400 text-[10px] shrink-0 font-medium">
                          No Signature
                        </div>
                      )}

                      <div className="flex flex-col justify-center gap-1.5 flex-1">
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          id="influencer-sig-upload"
                          onChange={async (e) => {
                            if (!accessToken) {
                              alert("Please sign in with Google to upload images directly to Drive.");
                              return;
                            }
                            const file = e.target.files?.[0];
                            if (file) {
                              // Show local preview immediately
                              const reader = new FileReader();
                              reader.onload = (re) => setEditInfluencerSigData(re.target?.result as string);
                              reader.readAsDataURL(file);
                              
                              try {
                                setIsUploadingSignature(true);
                                const fileId = await uploadImageToDrive(file, accessToken);
                                setEditInfluencerSignature('gdrive:' + fileId);
                              } catch (error) {
                                console.error("Upload error", error);
                                alert("Failed to upload signature to Google Drive.");
                                setEditInfluencerSigData('');
                                setEditInfluencerSignature('');
                              } finally {
                                setIsUploadingSignature(false);
                                e.target.value = '';
                              }
                            }
                          }}
                        />
                        <label
                          htmlFor="influencer-sig-upload"
                          className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 ${isUploadingSignature ? 'bg-gray-200 text-gray-500' : 'bg-blue-50 hover:bg-blue-100 text-blue-700'} rounded-lg text-xs font-bold border border-blue-200 shadow-sm cursor-pointer transition-colors max-w-[200px]`}
                        >
                          {isUploadingSignature ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              Uploading...
                            </>
                          ) : (
                            <>
                              <Cloud className="w-3.5 h-3.5" />
                              Upload to Drive
                            </>
                          )}
                        </label>
                        <p className="text-[9px] text-gray-500 leading-tight">
                          Signature will be securely stored in your Google Drive and auto-embedded into future PDF Bills.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-3 mt-4">
                  <label className="text-xs font-bold text-red-600 uppercase tracking-widest font-mono">Bank Details for Billing</label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Account Name</label>
                      <input
                        type="text"
                        placeholder="e.g. John Doe"
                        className="w-full text-xs text-gray-700 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 bg-white"
                        value={editAccountName}
                        onChange={(e) => setEditAccountName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Bank Name</label>
                      <input
                        type="text"
                        placeholder="e.g. HDFC Bank"
                        className="w-full text-xs text-gray-700 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 bg-white"
                        value={editBankName}
                        onChange={(e) => setEditBankName(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Account Number</label>
                    <input
                      type="text"
                      className="w-full text-xs text-gray-700 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 bg-white"
                      value={editAccountNumber}
                      onChange={(e) => setEditAccountNumber(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">IFSC Code</label>
                      <input
                        type="text"
                        className="w-full text-xs text-gray-700 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 bg-white uppercase"
                        value={editIfsc}
                        onChange={(e) => setEditIfsc(e.target.value.toUpperCase())}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">PAN Number</label>
                      <input
                        type="text"
                        className="w-full text-xs text-gray-700 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 bg-white uppercase"
                        value={editPan}
                        onChange={(e) => setEditPan(e.target.value.toUpperCase())}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-bold text-red-600 uppercase tracking-widest font-mono">Profile Picture</label>
                  <div className="space-y-1 bg-gray-50 border border-gray-200 rounded-xl p-3 flex flex-col sm:flex-row gap-3 items-center">
                    {editAvatar ? (
                      <img src={editAvatar} alt="Preview" className="w-12 h-12 rounded-full object-cover border" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-[10px] text-gray-500">No Image</div>
                    )}
                    <div className="flex-1 w-full space-y-1">
                      <label className="text-[10px] uppercase font-bold text-gray-500 block">Upload Profile Photo (Optional)</label>
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              if (typeof reader.result === 'string') {
                                setEditAvatar(reader.result);
                              }
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                        className="text-xs text-gray-700 file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-red-50 file:text-red-700 hover:file:bg-red-100 cursor-pointer w-full"
                      />
                      <p className="text-[9px] text-gray-400">Select an image or customize the URL link below</p>
                    </div>
                  </div>
                  <input
                    type="text"
                    placeholder="Or enter custom image URL directly..."
                    className="w-full text-xs text-gray-700 px-3 py-2 border border-gray-350 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 bg-white"
                    value={editAvatar}
                    onChange={(e) => setEditAvatar(e.target.value)}
                  />
                </div>
              </div>
            ) : (
              <div className="p-6 flex-1 overflow-y-auto space-y-6">
                
                {/* Stat Pill List */}
                {(() => {
                  const influencerTasks = tasks.filter(t => t.influencerId === selectedInfluencer.id);
                  const totalInfluencerSampleCost = influencerTasks.reduce((sum, t) => sum + (t.sampleCost || 0), 0);
                  
                  return (
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      <div className="p-3 bg-red-50 text-center rounded-lg border border-red-100">
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Reach Score</p>
                        <p className="text-base font-bold font-mono text-red-750 mt-1">
                          {selectedInfluencer.followers >= 1000000 ? `${(selectedInfluencer.followers / 1000000).toFixed(1)}M` : `${selectedInfluencer.followers / 1000}K`}
                        </p>
                      </div>
                      <div className="p-3 bg-gray-50 text-center rounded-lg border border-gray-100">
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Avg ROI</p>
                        <p className="text-base font-bold font-mono text-gray-800 mt-1">{selectedInfluencer.averageROI}x</p>
                      </div>
                      <div className="p-3 bg-gray-50 text-center rounded-lg border border-gray-100">
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Global Rank</p>
                        <p className="text-base font-bold font-mono text-gray-855 mt-1">#{selectedInfluencer.perfRanking}</p>
                      </div>
                      <div className="p-3 bg-indigo-50 text-center rounded-lg border border-indigo-100" title="Synchronized real-time Sample Cost budget assigned to this creator's active planner campaigns">
                        <p className="text-[10px] text-indigo-800 font-bold uppercase tracking-wider">Sample Cost</p>
                        <p className="text-base font-bold font-mono text-indigo-900 mt-1">₹{totalInfluencerSampleCost.toLocaleString()}</p>
                      </div>
                    </div>
                  );
                })()}

                {/* Bio & Location Details */}
                <div className="space-y-2.5">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest font-mono">Profile Details</h4>
                  <div className="space-y-1.5 text-sm text-gray-650">
                    <p><strong>Niche Category:</strong> {selectedInfluencer.niche}</p>
                    <p><strong>Sex / Gender:</strong> <span className="px-2 py-0.5 text-xs font-bold font-mono bg-red-50 text-red-700 border border-red-100 rounded-md inline-block">{selectedInfluencer.gender || 'Female'}</span></p>
                    <p><strong>Location:</strong> {selectedInfluencer.location}</p>
                    {(() => {
                      const entryVal = selectedInfluencer.entryDate || (selectedInfluencer.id && selectedInfluencer.id.startsWith('inf-') ? (() => {
                        const ts = parseInt(selectedInfluencer.id.split('-')[1]);
                        return (!isNaN(ts) && ts > 1000000) ? formatDateToDMY(new Date(ts)) : '';
                      })() : '');
                      if (!entryVal && selectedInfluencer.status !== 'Future Creator') return null;
                      const dateToShow = entryVal ? formatDateToDMY(entryVal) : formatDateToDMY(new Date());
                      return (
                        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg my-1">
                          <Calendar className="w-4 h-4 text-emerald-600 shrink-0" />
                          <div className="text-xs font-mono">
                            <span className="text-[10px] uppercase font-bold text-emerald-800 block">Entry Date</span>
                            <span className="font-black text-emerald-950">{dateToShow}</span>
                          </div>
                        </div>
                      );
                    })()}
                    {selectedInfluencer.mobile && (
                      <div className="flex items-center justify-between gap-2 bg-gray-50/90 px-3 py-2 rounded-lg border border-gray-200/90 my-1">
                        <div>
                          <span className="text-[10px] font-bold uppercase text-gray-500 block font-mono">Primary Mobile</span>
                          <span className="text-xs font-mono font-bold text-gray-800">{selectedInfluencer.mobile}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              const single = cleanSingleMobileForStorage(selectedInfluencer.mobile);
                              openWhatsAppChat({ phoneNumber: single, contactName: selectedInfluencer.name });
                            }}
                            className="px-2 py-1 bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-bold rounded-md flex items-center gap-1 transition shadow-2xs cursor-pointer"
                          >
                            <MessageCircle className="w-3 h-3" />
                            <span>WhatsApp</span>
                          </button>
                          <a
                            href={`tel:${cleanSingleMobileForStorage(selectedInfluencer.mobile)}`}
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold rounded-md flex items-center gap-1 transition border border-slate-200"
                          >
                            <span>Call</span>
                          </a>
                        </div>
                      </div>
                    )}
                    {(selectedInfluencer.secondaryMobile || selectedInfluencer.alternateMobile) && (
                      <div className="flex items-center justify-between gap-2 bg-amber-50/80 px-3 py-2 rounded-lg border border-amber-200/90 my-1">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold uppercase text-amber-800 block font-mono">Secondary Mobile</span>
                            <span className="text-[9px] bg-amber-100 text-amber-900 font-bold px-1.5 py-0.2 rounded-full">Alt / Manager</span>
                          </div>
                          <span className="text-xs font-mono font-bold text-gray-800">{selectedInfluencer.secondaryMobile || selectedInfluencer.alternateMobile}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              const single = cleanSingleMobileForStorage(selectedInfluencer.secondaryMobile || selectedInfluencer.alternateMobile);
                              openWhatsAppChat({ phoneNumber: single, contactName: `${selectedInfluencer.name} (Alt / Manager)` });
                            }}
                            className="px-2 py-1 bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-bold rounded-md flex items-center gap-1 transition shadow-2xs cursor-pointer"
                          >
                            <MessageCircle className="w-3 h-3" />
                            <span>WhatsApp</span>
                          </button>
                          <a
                            href={`tel:${cleanSingleMobileForStorage(selectedInfluencer.secondaryMobile || selectedInfluencer.alternateMobile)}`}
                            className="px-2 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 text-[10px] font-bold rounded-md flex items-center gap-1 transition border border-amber-200"
                          >
                            <span>Call</span>
                          </a>
                        </div>
                      </div>
                    )}
                    <p><strong>Established Fee Rate:</strong> ₹{selectedInfluencer.costPerPost} per deliverables batch</p>
                    <p className="flex items-center gap-1">
                      <strong>Creator Rating:</strong> 
                      <span className="flex items-center text-amber-500 gap-0.5 ml-1">
                        {Array.from({ length: 5 }).map((_, index) => (
                          <Star 
                            key={index}
                            className={`w-3.5 h-3.5 fill-current ${index < Math.floor(selectedInfluencer.rating || 4.5) ? 'text-amber-500' : 'text-gray-200'}`} 
                          />
                        ))}
                        <span className="text-xs font-mono text-gray-600 font-bold ml-1">{(selectedInfluencer.rating || 4.5).toFixed(1)}</span>
                      </span>
                    </p>

                    {/* Highly polished verification diagnostics card */}
                    <div className="bg-red-50/20 border border-red-100 p-3.5 rounded-xl space-y-2.5 mt-2.5">
                      <div className="text-[10px] items-center font-black text-red-650 uppercase tracking-widest border-b border-red-100/60 pb-1.5 flex justify-between">
                        <span>Profile Links & Verification</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleRealTimeAnalyze(selectedInfluencer)}
                            disabled={isAnalyzingProfileId === selectedInfluencer.id}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-0.5 px-2 rounded flex items-center gap-1 transition-colors normal-case tracking-normal disabled:opacity-50"
                          >
                            {isAnalyzingProfileId === selectedInfluencer.id ? (
                              <>
                                <RefreshCw className="w-3 h-3 animate-spin" />
                                <span>Analyzing...</span>
                              </>
                            ) : (
                              <>
                                <Activity className="w-3 h-3" />
                                <span>Analyze Profile Now</span>
                              </>
                            )}
                          </button>
                          {selectedInfluencer.linkAnalysis?.lastChecked && (
                            <span className="text-[9px] text-gray-500 font-mono normal-case font-normal ml-2">Last audited: {selectedInfluencer.linkAnalysis.lastChecked}</span>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2 text-xs">
                        {/* Facebook */}
                        <div className="flex items-center justify-between gap-1 flex-wrap sm:flex-nowrap">
                          <span className="font-mono font-bold text-gray-505 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-600" /> Facebook:
                          </span>
                          {selectedInfluencer.facebookLink ? (
                            <div className="flex items-center gap-2">
                              <a 
                                href={selectedInfluencer.facebookLink} 
                                target="_blank" 
                                rel="no-referrer"
                                className="text-blue-650 hover:underline hover:text-black line-clamp-1 max-w-[170px] font-medium"
                              >
                                {selectedInfluencer.facebookLink}
                              </a>
                              {selectedInfluencer.linkAnalysis?.facebook ? (
                                <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase shrink-0 ${selectedInfluencer.linkAnalysis.facebook.valid ? 'bg-emerald-50 text-emerald-700 border border-emerald-250' : 'bg-red-50 text-red-700 border border-red-150'}`} title={selectedInfluencer.linkAnalysis.facebook.issues.join(', ') || 'Valid standard profile'}>
                                  {selectedInfluencer.linkAnalysis.facebook.valid ? 'Verified' : 'Invalid'}
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded text-[8px] font-mono bg-amber-50 text-amber-700 border border-amber-150 tracking-wider font-bold">Unchecked</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400 font-medium italic">Unconfigured</span>
                          )}
                        </div>

                        {/* Instagram */}
                        <div className="flex items-center justify-between gap-1 flex-wrap sm:flex-nowrap">
                          <span className="font-mono font-bold text-gray-505 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-600" /> Instagram:
                          </span>
                          {selectedInfluencer.instagramLink ? (
                            <div className="flex items-center gap-2">
                              <a 
                                href={selectedInfluencer.instagramLink} 
                                target="_blank" 
                                rel="no-referrer"
                                className="text-rose-650 hover:underline hover:text-black line-clamp-1 max-w-[170px] font-medium"
                              >
                                {selectedInfluencer.instagramLink}
                              </a>
                              {selectedInfluencer.linkAnalysis?.instagram ? (
                                <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase shrink-0 ${selectedInfluencer.linkAnalysis.instagram.valid ? 'bg-emerald-50 text-emerald-700 border border-emerald-250' : 'bg-red-50 text-red-700 border border-red-150'}`} title={selectedInfluencer.linkAnalysis.instagram.issues.join(', ') || 'Valid standard profile'}>
                                  {selectedInfluencer.linkAnalysis.instagram.valid ? 'Verified' : 'Invalid'}
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded text-[8px] font-mono bg-amber-50 text-amber-700 border border-amber-150 tracking-wider font-bold">Unchecked</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400 font-medium italic">Unconfigured</span>
                          )}
                        </div>

                        {/* YouTube */}
                        <div className="flex items-center justify-between gap-1 flex-wrap sm:flex-nowrap">
                          <span className="font-mono font-bold text-gray-505 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-655" /> YouTube Channel:
                          </span>
                          {selectedInfluencer.youtubeLink ? (
                            <div className="flex items-center gap-2">
                              <a 
                                href={selectedInfluencer.youtubeLink} 
                                target="_blank" 
                                rel="no-referrer"
                                className="text-red-650 hover:underline hover:text-black line-clamp-1 max-w-[170px] font-medium"
                              >
                                {selectedInfluencer.youtubeLink}
                              </a>
                              {selectedInfluencer.linkAnalysis?.youtube ? (
                                <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase shrink-0 ${selectedInfluencer.linkAnalysis.youtube.valid ? 'bg-emerald-50 text-emerald-700 border border-emerald-250' : 'bg-red-50 text-red-700 border border-red-150'}`} title={selectedInfluencer.linkAnalysis.youtube.issues.join(', ') || 'Valid standard channel'}>
                                  {selectedInfluencer.linkAnalysis.youtube.valid ? 'Verified' : 'Invalid'}
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded text-[8px] font-mono bg-amber-50 text-amber-700 border border-amber-150 tracking-wider font-bold">Unchecked</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400 font-medium italic">Unconfigured</span>
                          )}
                        </div>
                      </div>

                      {selectedInfluencer.linkAnalysis?.summary && (
                        <div className="text-[10px] text-gray-500 italic bg-white px-2.5 py-1.5 border border-red-100 rounded leading-normal">
                          <strong className="text-red-750">Analysis Report:</strong> {selectedInfluencer.linkAnalysis.summary}
                        </div>
                      )}
                    </div>

                  </div>
                </div>

                {/* Tracked Live Video Deliverables & Exact Upload Timestamps */}
                {(() => {
                  const influencerTasks = tasks.filter(t => t.influencerId === selectedInfluencer.id);
                  const totalViews = influencerTasks.reduce((sum, t) => sum + getTaskEffectiveViews(t), 0);
                  const totalClicks = influencerTasks.reduce((sum, t) => sum + (t.clicks || 0), 0);
                  const hasDeliverables = influencerTasks.length > 0;
                  
                  return (
                    <div className="space-y-3 pt-3 border-t border-gray-100">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Video className="w-4 h-4 text-indigo-600" />
                          <h4 className="text-xs font-bold text-gray-800 uppercase tracking-widest font-mono">
                            Tracked Videos & Exact Upload Times
                          </h4>
                          <span className="px-2 py-0.5 text-[9px] font-bold font-mono bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full">
                            {influencerTasks.length} {influencerTasks.length === 1 ? 'Deliverable' : 'Deliverables'}
                          </span>
                        </div>
                        {hasDeliverables && (
                          <button
                            type="button"
                            onClick={() => fetchAllVideosForInfluencer(influencerTasks)}
                            disabled={isFetchingInfluencerVideos}
                            className="text-[10px] font-bold font-mono text-indigo-700 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded flex items-center gap-1 transition disabled:opacity-50 cursor-pointer shadow-2xs"
                            title="Re-check live views and exact upload date & time from links"
                          >
                            <RefreshCw className={`w-3 h-3 ${isFetchingInfluencerVideos ? 'animate-spin text-indigo-600' : ''}`} />
                            <span>{isFetchingInfluencerVideos ? 'Fetching...' : 'Refresh Upload Info'}</span>
                          </button>
                        )}
                      </div>

                      {hasDeliverables ? (
                        <div className="space-y-3">
                          {/* Aggregated view stats pill */}
                          <div className="grid grid-cols-3 gap-2 bg-gradient-to-r from-indigo-50/70 via-purple-50/70 to-pink-50/70 p-3 rounded-xl border border-indigo-100">
                            <div>
                              <p className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">Total Recorded Views</p>
                              <p className="text-base font-black font-mono text-indigo-700 mt-0.5 flex items-center gap-1">
                                <Eye className="w-3.5 h-3.5 text-indigo-500" />
                                {totalViews.toLocaleString()}
                              </p>
                            </div>
                            <div>
                              <p className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">Total Clicks</p>
                              <p className="text-base font-black font-mono text-rose-600 mt-0.5">
                                {totalClicks.toLocaleString()}
                              </p>
                            </div>
                            <div>
                              <p className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">Average CTR</p>
                              <p className="text-base font-black font-mono text-emerald-700 mt-0.5">
                                {totalViews > 0 ? ((totalClicks / totalViews) * 100).toFixed(2) : 0}%
                              </p>
                            </div>
                          </div>

                          {/* Deliverables Cards */}
                          <div className="space-y-2.5">
                            {influencerTasks.map((t) => {
                              const videoLinks = [
                                { url: t.videoLink1, label: 'Video 1' },
                                { url: t.videoLink2, label: 'Video 2' },
                                { url: t.videoLink3, label: 'Video 3' }
                              ].filter(l => Boolean(l.url && typeof l.url === 'string' && l.url.trim()));

                              return (
                                <div key={t.id} className="bg-white border border-gray-200 rounded-xl p-3 shadow-2xs hover:border-indigo-300 transition">
                                  <div className="flex items-start justify-between gap-2 mb-2">
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-gray-900">{t.title || 'Untitled Deliverable'}</span>
                                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase font-mono ${
                                          t.status === 'Completed' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                          t.status === 'In Progress' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                                          'bg-gray-100 text-gray-600 border border-gray-200'
                                        }`}>
                                          {t.status}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-2 text-[10px] text-gray-500 font-mono mt-0.5">
                                        <span>Scheduled: <strong className="text-gray-700">{formatDateToDMY(t.releaseDate) || 'Not set'}</strong></span>
                                        {t.remuneration ? (
                                          <span className="text-rose-600 font-bold">• ₹{t.remuneration.toLocaleString()} Fee</span>
                                        ) : null}
                                      </div>
                                    </div>
                                    
                                    <div className="text-right">
                                      <div className="text-xs font-black font-mono text-indigo-700 flex items-center gap-1 justify-end">
                                        <Eye className="w-3 h-3 text-indigo-500" />
                                        {getTaskEffectiveViews(t).toLocaleString()}
                                      </div>
                                      <div className="text-[9px] text-gray-400 font-mono">Live Views</div>
                                    </div>
                                  </div>

                                  {/* Video Links & Exact Upload Timestamps */}
                                  {videoLinks.length > 0 ? (
                                    <div className="space-y-2 mt-2 pt-2 border-t border-gray-100">
                                      {videoLinks.map((linkItem, lIdx) => {
                                        const preview = videoMetadataMap[linkItem.url]?.data;
                                        const isLoading = videoMetadataMap[linkItem.url]?.loading;
                                        const kolkata = preview?.publishedAt ? formatToKolkataTime(preview.publishedAt) : null;
                                        const exactDate = kolkata?.isoDate || preview?.publishedDate;
                                        const exactTime = kolkata?.time || preview?.publishedTime || t.uploadTime;
                                        const viewsFromLink = preview?.views;

                                        return (
                                          <div key={lIdx} className="bg-gray-50/80 border border-gray-200/70 rounded-lg p-2.5 text-xs space-y-1.5">
                                            <div className="flex items-center justify-between gap-2 flex-wrap">
                                              <div className="flex items-center gap-1.5 min-w-0">
                                                <span className="font-bold text-[10px] font-mono text-indigo-600 uppercase bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 shrink-0">
                                                  {linkItem.label}
                                                </span>
                                                <a
                                                  href={linkItem.url}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="text-blue-600 hover:underline hover:text-blue-800 font-mono text-[11px] truncate max-w-[180px] sm:max-w-[240px] flex items-center gap-1"
                                                  title={linkItem.url}
                                                >
                                                  <ExternalLink className="w-3 h-3 shrink-0" />
                                                  <span className="truncate">{linkItem.url}</span>
                                                </a>
                                              </div>

                                              <button
                                                type="button"
                                                onClick={() => fetchVideoMetadata(linkItem.url, t.id)}
                                                disabled={isLoading}
                                                className="text-[9px] text-gray-500 hover:text-indigo-600 font-mono flex items-center gap-1 p-1 hover:bg-gray-200/50 rounded transition disabled:opacity-50 cursor-pointer"
                                                title="Collect original upload date & time from video source (IST / Kolkata)"
                                              >
                                                <RefreshCw className={`w-2.5 h-2.5 ${isLoading ? 'animate-spin text-indigo-600' : ''}`} />
                                                <span>{isLoading ? 'Collecting...' : 'Check Source'}</span>
                                              </button>
                                            </div>

                                            {/* Exact Upload Timestamp Row */}
                                            <div className="flex items-center flex-wrap gap-2 pt-1">
                                              <div className="flex items-center gap-1.5 text-xs font-mono bg-white border border-gray-300 px-2.5 py-1 rounded-md shadow-xs">
                                                <Calendar className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                                                <span className="text-gray-500 font-black uppercase text-[10px] tracking-tight">Upload Date:</span>
                                                {exactDate ? (
                                                  <strong className="text-gray-950 font-black text-xs tracking-tight bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200">{exactDate}</strong>
                                                ) : (
                                                  <span className="text-gray-400 italic font-normal text-[11px]">
                                                    {isLoading ? 'Collecting from source...' : 'Pending check'}
                                                  </span>
                                                )}
                                              </div>

                                              <div className={`flex items-center gap-2 text-xs font-mono px-2.5 py-1 rounded-md border shadow-xs ${
                                                exactTime ? 'bg-fuchsia-100/90 text-fuchsia-950 border-fuchsia-300 font-black' : 'bg-gray-50 text-gray-500 border-gray-200'
                                              }`}>
                                                <Clock className={`w-3.5 h-3.5 shrink-0 ${exactTime ? 'text-fuchsia-700' : 'text-gray-400'}`} />
                                                <span className={exactTime ? 'text-fuchsia-900 font-black uppercase text-[10px] tracking-tight' : 'text-gray-500 font-bold'}>Upload Time (IST):</span>
                                                {exactTime ? (
                                                  <strong className="text-fuchsia-950 font-black text-xs tracking-tight bg-white px-2 py-0.5 rounded border border-fuchsia-300 shadow-2xs">{exactTime}</strong>
                                                ) : (
                                                  <span className="text-gray-400 italic font-normal text-[11px]">
                                                    {isLoading ? 'Collecting...' : 'Pending source fetch'}
                                                  </span>
                                                )}
                                                {onUpdateTask && (
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      const val = prompt('Edit original upload time in Indian Standard Time (e.g. 10:30 AM IST, 02:30 PM IST):', exactTime || '');
                                                      if (val && val.trim()) {
                                                        onUpdateTask(t.id, { uploadTime: val.trim() });
                                                      }
                                                    }}
                                                    className="ml-1 text-[10px] font-sans font-bold text-fuchsia-800 hover:text-fuchsia-950 underline cursor-pointer"
                                                    title="Click to edit upload time in Indian Standard Time"
                                                  >
                                                    Edit
                                                  </button>
                                                )}
                                              </div>

                                              {viewsFromLink !== undefined && (
                                                <div className="flex items-center gap-1 text-[10px] font-mono bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-1 rounded font-bold shadow-2xs ml-auto">
                                                  <Eye className="w-3 h-3 text-emerald-600 shrink-0" />
                                                  <span>{viewsFromLink.toLocaleString()} Live Views</span>
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between flex-wrap gap-2 text-[11px]">
                                      <span className="text-gray-400 italic">No video link attached to this deliverable yet.</span>
                                      <div className="flex items-center gap-2">
                                        <div className="flex items-center gap-1.5 text-xs font-mono bg-white border border-gray-300 px-2.5 py-1 rounded shadow-2xs">
                                          <Calendar className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                                          <span className="text-gray-500 font-black uppercase text-[10px]">Scheduled:</span>
                                          <strong className="text-gray-950 font-black">{formatDateToDMY(t.releaseDate) || 'Not set'}</strong>
                                        </div>
                                        {t.uploadTime && (
                                          <div className="flex items-center gap-1.5 text-xs font-mono bg-fuchsia-100 border border-fuchsia-300 px-2.5 py-1 rounded shadow-2xs text-fuchsia-950">
                                            <Clock className="w-3.5 h-3.5 text-fuchsia-700 shrink-0" />
                                            <span className="text-fuchsia-800 font-black uppercase text-[10px]">Time:</span>
                                            <strong className="text-fuchsia-950 font-black">{t.uploadTime}</strong>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-4 text-center space-y-2">
                          <Video className="w-6 h-6 text-gray-400 mx-auto" />
                          <p className="text-xs text-gray-600 font-medium">No video deliverables assigned to this creator yet</p>
                          <p className="text-[10px] text-gray-400 leading-relaxed max-w-sm mx-auto">
                            When tasks or video links are scheduled in the Monthly Planner, their live views and exact upload date & time will appear here automatically.
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              onCreateTask(selectedInfluencer.id);
                              setSelectedInfluencer(null);
                            }}
                            className="inline-flex items-center gap-1 text-xs font-bold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition mt-1 cursor-pointer"
                          >
                            <PlusCircle className="w-3.5 h-3.5" />
                            <span>Create New Task</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Audience Demographics */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest font-mono">Audience Age Demographics</h4>
                  <div className="space-y-2 bg-gray-50 p-4 rounded-lg border border-gray-100">
                    {selectedInfluencer.topDemographics.map((demo: any, idx: any) => (
                      <div key={idx} className="space-y-1">
                        <div className="flex justify-between text-xs text-gray-700 font-medium">
                          <span>Age Segment: {demo.ageRange}</span>
                          <span>{demo.percentage}%</span>
                        </div>
                        <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                          <div 
                            className="bg-red-600 h-full rounded-full transition-all" 
                            style={{ width: `${demo.percentage}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Platform Distribution Specifics */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest font-mono">Active Networks & Feed Size</h4>
                  <div className="grid grid-cols-2 gap-3">
                    {selectedInfluencer.platforms.map((p: any, idx: any) => (
                      <div key={idx} className="p-3 bg-red-50/40 rounded-lg border border-red-100/50 flex flex-col justify-center">
                        <span className="text-xs text-gray-500 font-medium">{p.name}</span>
                        <span className="text-lg font-bold text-red-750 font-mono mt-0.5">{p.followers}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Editable Profile Note */}
                <div className="space-y-3 pt-4 border-t border-gray-100">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest font-mono">Creator Internal Note</h4>
                    <button
                      type="button"
                      onClick={() => {
                        const dateStamp = new Date().toLocaleDateString('en-GB') + ' ' + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) + ' - ';
                        setTempNote(prev => prev ? prev + '\n' + dateStamp : dateStamp);
                      }}
                      className="text-[9px] font-bold font-mono text-fuchsia-700 bg-fuchsia-100 hover:bg-fuchsia-200 px-2 py-1 rounded transition"
                    >
                      + Add Date Stamp
                    </button>
                  </div>
                  <div className="flex flex-col gap-2">
                    <textarea 
                      value={tempNote}
                      onChange={(e) => setTempNote(e.target.value)}
                      placeholder="Leave an internal note for this creator..."
                      className="w-full text-xs p-3 rounded-lg border border-gray-200 bg-gray-50/50 shadow-inner focus:outline-none focus:ring-2 focus:ring-fuchsia-500 font-sans min-h-[80px] text-gray-700"
                    />
                    {tempNote !== (selectedInfluencer.notes || '') && (
                      <button
                        type="button"
                        onClick={() => {
                          if (onUpdateInfluencer) {
                            onUpdateInfluencer(selectedInfluencer.id, { notes: tempNote });
                            setSelectedInfluencer({ ...selectedInfluencer, notes: tempNote });
                            setSuccessMsg("Creator note saved successfully!");
                            setTimeout(() => setSuccessMsg(null), 3000);
                          }
                        }}
                        className="self-end px-3 py-1.5 bg-gradient-to-r from-fuchsia-600 to-indigo-600 hover:from-fuchsia-700 hover:to-indigo-700 text-white rounded-md text-[10px] uppercase font-bold tracking-wider transition shadow-sm cursor-pointer"
                      >
                        Save Note
                      </button>
                    )}
                  </div>
                </div>

                {/* Assign to active campaigns quick action */}
                <div className="space-y-3 pt-4 border-t border-gray-100">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest font-mono">Assign to Direct Campaign</h4>
                  <div className="flex gap-2">
                    <select
                      className="flex-1 text-xs text-gray-700 font-medium px-3 py-2 border border-gray-250 rounded-lg bg-white"
                      value={selectedCampId}
                      onChange={(e) => setSelectedCampId(e.target.value)}
                    >
                      <option value="">-- Choose active campaign --</option>
                      {campaigns.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleCampaignAssignSubmit(selectedInfluencer.id)}
                      className="px-3 py-2 bg-red-600 hover:bg-red-710 text-white rounded-lg text-xs font-semibold cursor-pointer"
                    >
                      Assign Now
                    </button>
                  </div>
                </div>

              </div>
            )}

            {/* Bottom Actions */}
            {isEditingProfile ? (
              <div className="p-6 border-t border-gray-100 bg-gray-50 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsEditingProfile(false)}
                  className="flex-1 py-2.5 bg-white border border-gray-200 hover:bg-gray-100 text-gray-700 rounded-lg text-xs font-bold uppercase transition tracking-wider cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveProfileEdit}
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold uppercase transition tracking-wider cursor-pointer"
                >
                  Save Profile
                </button>
              </div>
            ) : (
              <div className="p-6 border-t border-gray-100 bg-gray-50 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Are you sure you want to remove "${selectedInfluencer.name}" from the database?`)) {
                      onDeleteInfluencer(selectedInfluencer.id);
                      setSelectedInfluencer(null);
                    }
                  }}
                  className="py-2.5 px-3 bg-red-50 hover:bg-red-100 text-red-750 font-bold border border-red-200 rounded-lg text-[10px] uppercase tracking-wider transition flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Remove
                </button>

                <button
                  type="button"
                  onClick={() => setIsEditingProfile(true)}
                  className="py-2.5 px-3 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-bold rounded-lg text-[10px] uppercase tracking-wider transition flex items-center gap-1 cursor-pointer"
                >
                  ✏️ Edit Profile
                </button>
                <button
                  type="button"
                  onClick={() => setShowBillModal(true)}
                  className="py-2.5 px-3 bg-blue-50 hover:bg-blue-100 text-blue-750 font-bold border border-blue-200 rounded-lg text-[10px] uppercase tracking-wider transition flex items-center gap-1 cursor-pointer"
                >
                  📄 Generate PDF Bill
                </button>

                {selectedInfluencer.mobile ? (
                  <button
                    type="button"
                    onClick={() => {
                      const firstName = selectedInfluencer.name ? selectedInfluencer.name.split(' ')[0] : 'Creator';
                      const textToSend = dmTemplate ? dmTemplate.replace(/{name}/gi, firstName) : `Hi ${firstName}! Reaching out regarding creator collaboration!`;
                      openWhatsAppChat({
                        phoneNumber: selectedInfluencer.mobile,
                        text: textToSend,
                        preferApp: true,
                        contactName: selectedInfluencer.name
                      });
                      if (onUpdateInfluencer && selectedInfluencer.status === 'Future Creator') {
                        const updateData: any = { messageSentAt: new Date().toISOString() };
                        if (!selectedInfluencer.communicationStatus || selectedInfluencer.communicationStatus === 'MESSAGE SENT') {
                          updateData.communicationStatus = 'MESSAGE SENT';
                        }
                        onUpdateInfluencer(selectedInfluencer.id, updateData);
                        setSelectedInfluencer({ ...selectedInfluencer, ...updateData });
                      }
                    }}
                    title="Open WhatsApp chat in app"
                    className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-[10px] uppercase tracking-wider transition flex items-center gap-1 cursor-pointer shadow-xs"
                  >
                    <MessageCircle className="w-3.5 h-3.5 fill-emerald-100/50" /> WhatsApp
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      triggerUpdateWhatsAppModal({
                        influencerId: selectedInfluencer.id,
                        influencerName: selectedInfluencer.name,
                        influencerHandle: selectedInfluencer.handle,
                        influencerAvatar: selectedInfluencer.avatar,
                        currentMobile: selectedInfluencer.mobile,
                        contextTitle: 'Creator Profile'
                      });
                    }}
                    title="Add or update WhatsApp contact number"
                    className="py-2.5 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold border border-emerald-300 rounded-lg text-[10px] uppercase tracking-wider transition flex items-center gap-1 cursor-pointer"
                  >
                    <MessageCircle className="w-3.5 h-3.5 fill-emerald-500/20" /> WhatsApp
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setCapturedPreview(null);
                    setScreenCaptureModal({
                      isOpen: true,
                      influencer: selectedInfluencer,
                      platform: selectedInfluencer.mobile ? 'WhatsApp' : selectedInfluencer.instagramLink ? 'Instagram' : selectedInfluencer.facebookLink ? 'Facebook' : 'General'
                    });
                  }}
                  title="Capture chat screenshot & download directly to PC"
                  className="py-2.5 px-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-lg text-[10px] uppercase tracking-wider transition flex items-center gap-1 cursor-pointer shadow-xs"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Capture Chat Screenshot</span>
                </button>

                {Array.isArray(selectedInfluencer.chatScreenshots) && selectedInfluencer.chatScreenshots.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setViewScreenshotsModal({ isOpen: true, influencer: selectedInfluencer });
                    }}
                    title="View saved chat screenshots"
                    className="py-2.5 px-3 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 font-black rounded-lg text-[10px] uppercase tracking-wider transition flex items-center gap-1 cursor-pointer shadow-xs"
                  >
                    <ImageIcon className="w-3.5 h-3.5 text-amber-600" />
                    <span>Screenshots ({selectedInfluencer.chatScreenshots.length})</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    onCreateTask(selectedInfluencer.id);
                    setSelectedInfluencer(null);
                  }}
                  className="py-2.5 px-3 bg-gray-100 border border-gray-200 hover:bg-gray-200 text-gray-700 rounded-lg text-[10px] uppercase tracking-wider font-bold transition cursor-pointer"
                >
                  Create Task
                </button>
              </div>
            )}

          </div>
        </div>
      )}      {/* Add New Sourced Creator Slide-in Drawer / Modal */}
      {showAddCreatorForm && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end bg-black/40 backdrop-blur-xs transition">
          <div className="absolute inset-0" onClick={() => setShowAddCreatorForm(false)} />
          <form 
            onSubmit={handleAddNewCreatorSubmit} 
            className="relative w-full max-w-lg bg-white h-full shadow-2xl flex flex-col justify-between animate-slide-left z-10 border-l-[6px] border-fuchsia-500"
          >
            {/* Drawer Header */}
            <div className="p-6 border-b border-fuchsia-100 flex items-center justify-between bg-gradient-to-r from-fuchsia-600 via-pink-600 to-rose-500 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white rounded-full mix-blend-overlay filter blur-3xl opacity-20 pointer-events-none" />
              
              <div className="flex items-center gap-3 relative z-10">
                <div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm border border-white/30 shadow-sm text-white">
                  <PlusCircle className="w-6 h-6 animate-pulse" />
                </div>
                <h2 className="text-xl font-black font-sans tracking-tight text-white drop-shadow-sm">Sourced Creator Onboarding</h2>
              </div>
              <button 
                type="button"
                onClick={() => setShowAddCreatorForm(false)}
                className="w-10 h-10 rounded-full border border-white/30 bg-white/10 hover:bg-white/20 flex items-center justify-center text-white font-bold cursor-pointer transition relative z-10 backdrop-blur-sm"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Form Content */}
            <div className="p-6 flex-1 overflow-y-auto space-y-4 bg-white">
              {successMsg && (
                <div className="p-3 bg-red-50 text-red-700 text-xs font-bold rounded-lg border border-red-200 flex items-center gap-1.5 animate-pulse">
                  <Check className="w-4 h-4 text-red-600" /> {successMsg}
                </div>
              )}

              <div className="space-y-4">
                <div className="bg-fuchsia-50 border border-fuchsia-200 rounded-xl p-4">
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-[10px] font-bold text-fuchsia-700 uppercase tracking-wider flex items-center gap-1"><Activity className="w-3.5 h-3.5" /> AI Smart Auto-Fill</label>
                  </div>
                  <textarea
                    placeholder="Paste a creator's Facebook, YouTube, Instagram link or their media kit here..."
                    className="w-full text-xs text-gray-700 px-3 py-2 border border-fuchsia-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-fuchsia-500 bg-white min-h-[60px]"
                    value={smartPasteText}
                    onChange={(e) => setSmartPasteText(e.target.value)}
                  />
                  <div className="flex justify-between items-center mt-2">
                    <div className="text-[10px] text-fuchsia-600 font-medium">Auto-extracts name, links, followers & more</div>
                    <button
                      type="button"
                      onClick={handleSmartParse}
                      disabled={isSmartParsing || !smartPasteText.trim()}
                      className={`px-3 py-1.5 rounded-md text-[10px] font-bold font-mono tracking-wide transition flex items-center gap-1.5 ${
                        isSmartParsing || !smartPasteText.trim()
                          ? 'bg-fuchsia-200 text-fuchsia-400 cursor-not-allowed'
                          : 'bg-fuchsia-600 text-white hover:bg-fuchsia-700'
                      }`}
                    >
                      {isSmartParsing ? 'Extracting...' : 'Extract Fields'}
                    </button>
                  </div>
                  {smartParseError && (
                    <div className="mt-2 p-2 bg-red-50 text-red-700 rounded text-[10px] font-mono">
                      Error: {smartParseError}
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-red-600 uppercase tracking-wider font-mono">Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Elena Rostova"
                    className="w-full text-xs text-gray-700 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 bg-white"
                    value={newCreatorName}
                    onChange={(e) => setNewCreatorName(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-red-600 uppercase tracking-wider font-mono">Creator Type / Target Page *</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setNewCreatorStatus('Available')}
                      className={`py-2 px-3 rounded-lg text-xs font-bold transition border cursor-pointer text-center flex items-center justify-center gap-1.5 ${
                        newCreatorStatus === 'Available'
                          ? 'bg-emerald-600 text-white border-transparent shadow-inner'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-emerald-50/40 hover:text-emerald-700'
                      }`}
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>Active Database</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewCreatorStatus('Future Creator')}
                      className={`py-2 px-3 rounded-lg text-xs font-bold transition border cursor-pointer text-center flex items-center justify-center gap-1.5 ${
                        newCreatorStatus === 'Future Creator'
                          ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-transparent shadow-inner'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-indigo-50/40 hover:text-indigo-700'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                      <span>Future Creator</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-red-600 uppercase tracking-wider font-mono">Entry Date (Auto-stamped)</label>
                    <span className="text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full font-mono font-bold flex items-center gap-1">
                      <Calendar className="w-2.5 h-2.5 text-emerald-600" />
                      <span>{formatDateToDMY(newCreatorEntryDate) || 'Today'}</span>
                    </span>
                  </div>
                  <input
                    type="date"
                    className="w-full text-xs text-gray-700 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 bg-white font-mono"
                    value={newCreatorEntryDate}
                    onChange={(e) => setNewCreatorEntryDate(e.target.value)}
                  />
                  <p className="text-[10px] text-gray-500 font-mono">
                    Entry date is automatically added on every new influencer.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-red-600 uppercase tracking-wider font-mono">Sex / Gender *</label>
                  <div className="flex gap-2">
                    {(['Male', 'Female', 'Others'] as const).map((genderVal) => (
                      <button
                        key={genderVal}
                        type="button"
                        onClick={() => setNewCreatorSex(genderVal)}
                        className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition border cursor-pointer text-center ${
                          newCreatorSex === genderVal
                            ? 'bg-red-600 text-white border-transparent shadow-inner'
                            : 'bg-white text-gray-750 border-gray-300 hover:bg-red-50/40 hover:text-red-700'
                        }`}
                      >
                        {genderVal}
                      </button>
                    ))}
                  </div>
                </div>
                
                <div className="bg-red-50/20 border border-red-100 p-4 rounded-xl space-y-3">
                  <div className="text-[10px] font-black text-red-700 uppercase tracking-wider font-mono border-b border-red-100/50 pb-1 flex justify-between items-center">
                    <span>Social Platform Profile Links</span>
                    <button
                      type="button"
                      onClick={() => handleCollectRealFollowers()}
                      disabled={isCollectingFollowers || (!newCreatorFacebook.trim() && !newCreatorInstagram.trim() && !newCreatorYoutube.trim())}
                      className={`text-[9px] font-bold font-mono px-2 py-0.5 rounded transition flex items-center gap-1 ${
                        isCollectingFollowers
                          ? 'bg-amber-100 text-amber-800 animate-pulse'
                          : (!newCreatorFacebook.trim() && !newCreatorInstagram.trim() && !newCreatorYoutube.trim())
                          ? 'text-gray-450 cursor-not-allowed'
                          : 'bg-red-100 text-red-750 hover:bg-red-600 hover:text-white cursor-pointer'
                      }`}
                    >
                      <Sparkles className="w-2.5 h-2.5 text-amber-400" />
                      {isCollectingFollowers ? 'Collecting...' : '⚡ Collect Real Followers'}
                    </button>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-600 uppercase tracking-widest flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 bg-red-600 rounded-full inline-block" /> Facebook Link
                    </label>
                    <input
                      type="url"
                      placeholder="e.g. https://www.facebook.com/profile"
                      className="w-full text-xs text-gray-750 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 bg-white"
                      value={newCreatorFacebook}
                      onChange={(e) => {
                        const val = e.target.value;
                        setNewCreatorFacebook(val);
                        const quick = extractQuickPhoneFromText(val);
                        if (quick.primary && !newCreatorMobile.trim()) {
                          const p = parsePhoneCountryAndNumber(quick.primary);
                          setSelectedCountryCode(p.countryCode);
                          setNewCreatorMobile(p.number);
                          globalToast.success(`📱 Auto-detected mobile number: ${quick.primary}`);
                        }
                        if (quick.secondary && !newCreatorSecondaryMobile.trim()) {
                          const p2 = parsePhoneCountryAndNumber(quick.secondary);
                          setSelectedSecondaryCountryCode(p2.countryCode);
                          setNewCreatorSecondaryMobile(p2.number);
                          setShowSecondaryMobile(true);
                        }
                      }}
                      onBlur={() => {
                        if (newCreatorFacebook.trim()) {
                          handleCollectRealFollowers({ facebook: newCreatorFacebook });
                        }
                      }}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-600 uppercase tracking-widest flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 bg-red-600 rounded-full inline-block" /> Instagram Link
                    </label>
                    <input
                      type="url"
                      placeholder="e.g. https://www.instagram.com/username"
                      className="w-full text-xs text-gray-750 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 bg-white"
                      value={newCreatorInstagram}
                      onChange={(e) => {
                        const val = e.target.value;
                        setNewCreatorInstagram(val);
                        const quick = extractQuickPhoneFromText(val);
                        if (quick.primary && !newCreatorMobile.trim()) {
                          const p = parsePhoneCountryAndNumber(quick.primary);
                          setSelectedCountryCode(p.countryCode);
                          setNewCreatorMobile(p.number);
                          globalToast.success(`📱 Auto-detected mobile number: ${quick.primary}`);
                        }
                        if (quick.secondary && !newCreatorSecondaryMobile.trim()) {
                          const p2 = parsePhoneCountryAndNumber(quick.secondary);
                          setSelectedSecondaryCountryCode(p2.countryCode);
                          setNewCreatorSecondaryMobile(p2.number);
                          setShowSecondaryMobile(true);
                        }
                      }}
                      onBlur={() => {
                        if (newCreatorInstagram.trim()) {
                          handleCollectRealFollowers({ instagram: newCreatorInstagram });
                        }
                      }}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-600 uppercase tracking-widest flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 bg-red-600 rounded-full inline-block" /> YouTube Link
                    </label>
                    <input
                      type="url"
                      placeholder="e.g. https://www.youtube.com/@channel"
                      className="w-full text-xs text-gray-750 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 bg-white"
                      value={newCreatorYoutube}
                      onChange={(e) => {
                        const val = e.target.value;
                        setNewCreatorYoutube(val);
                        const quick = extractQuickPhoneFromText(val);
                        if (quick.primary && !newCreatorMobile.trim()) {
                          const p = parsePhoneCountryAndNumber(quick.primary);
                          setSelectedCountryCode(p.countryCode);
                          setNewCreatorMobile(p.number);
                          globalToast.success(`📱 Auto-detected mobile number: ${quick.primary}`);
                        }
                        if (quick.secondary && !newCreatorSecondaryMobile.trim()) {
                          const p2 = parsePhoneCountryAndNumber(quick.secondary);
                          setSelectedSecondaryCountryCode(p2.countryCode);
                          setNewCreatorSecondaryMobile(p2.number);
                          setShowSecondaryMobile(true);
                        }
                      }}
                      onBlur={() => {
                        if (newCreatorYoutube.trim()) {
                          handleCollectRealFollowers({ youtube: newCreatorYoutube });
                        }
                      }}
                    />
                  </div>

                  {/* Highly polished server-side verification section */}
                  <div className="pt-2 border-t border-red-100/60 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Server Link Audit Engine</span>
                      <button
                        type="button"
                        disabled={isOnboardingAnalyzing || (!newCreatorFacebook.trim() && !newCreatorInstagram.trim() && !newCreatorYoutube.trim())}
                        onClick={handleOnboardingAnalyze}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono tracking-wide transition flex items-center gap-1.5 border cursor-pointer ${
                          isOnboardingAnalyzing
                            ? 'bg-gray-150 border-gray-200 text-gray-400'
                            : (!newCreatorFacebook.trim() && !newCreatorInstagram.trim() && !newCreatorYoutube.trim())
                            ? 'bg-gray-50 border-gray-250 text-gray-400 cursor-not-allowed'
                            : 'bg-red-50 border-red-200 text-red-700 hover:bg-red-600 hover:text-white hover:border-transparent'
                        }`}
                      >
                        {isOnboardingAnalyzing ? (
                          <>
                            <span className="inline-block w-2.5 h-2.5 border-2 border-red-650 border-t-transparent rounded-full animate-spin" />
                            Auditing On Server...
                          </>
                        ) : (
                          '🔬 Perform Server AI Audit'
                        )}
                      </button>
                    </div>

                    {onboardingAnalysisError && (
                      <div className="p-2 bg-red-50 text-red-700 rounded text-xs font-mono">
                        Error: {onboardingAnalysisError}
                      </div>
                    )}

                    {onboardingLinkAnalysis && (
                      <div className="bg-white border border-red-100 p-3 rounded-lg space-y-2 text-[11px] animate-fade-in shadow-xs">
                        <div className="text-[9px] font-black text-red-600 uppercase tracking-wider flex justify-between">
                          <span>Server Analysis Diagnostic Report</span>
                          <span className="lowercase font-normal text-gray-400 font-mono">audited on-the-fly</span>
                        </div>

                        <div className="space-y-1.5 font-mono text-gray-700">
                          {/* FB */}
                          <div className="flex justify-between items-center bg-gray-50/50 p-1 rounded">
                            <span>Facebook:</span>
                            {newCreatorFacebook.trim() ? (
                              <span className={`px-1 rounded text-[8px] font-bold uppercase ${onboardingLinkAnalysis.facebook.valid ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                                {onboardingLinkAnalysis.facebook.valid ? `Valid (@${onboardingLinkAnalysis.facebook.handle || 'profile'})` : 'Invalid'}
                              </span>
                            ) : (
                              <span className="text-gray-450 italic">unconfigured</span>
                            )}
                          </div>

                          {/* IG */}
                          <div className="flex justify-between items-center bg-gray-50/50 p-1 rounded">
                            <span>Instagram:</span>
                            {newCreatorInstagram.trim() ? (
                              <span className={`px-1 rounded text-[8px] font-bold uppercase ${onboardingLinkAnalysis.instagram.valid ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                                {onboardingLinkAnalysis.instagram.valid ? `Valid (@${onboardingLinkAnalysis.instagram.handle || 'profile'})` : 'Invalid'}
                              </span>
                            ) : (
                              <span className="text-gray-450 italic">unconfigured</span>
                            )}
                          </div>

                          {/* YT */}
                          <div className="flex justify-between items-center bg-gray-50/50 p-1 rounded">
                            <span>YouTube:</span>
                            {newCreatorYoutube.trim() ? (
                              <span className={`px-1 rounded text-[8px] font-bold uppercase ${onboardingLinkAnalysis.youtube.valid ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                                {onboardingLinkAnalysis.youtube.valid ? `Valid (@${onboardingLinkAnalysis.youtube.handle || 'channel'})` : 'Invalid'}
                              </span>
                            ) : (
                              <span className="text-gray-450 italic">unconfigured</span>
                            )}
                          </div>
                        </div>

                        {onboardingLinkAnalysis.summary && (
                          <div className="pt-2 border-t border-gray-100 text-[10px] text-gray-500 italic leading-snug">
                            <strong className="text-red-700 font-sans not-italic">AI Summary:</strong> {onboardingLinkAnalysis.summary}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>



              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-red-600 uppercase tracking-wider font-mono">Niche Category</label>
                  <input
                    type="text"
                    placeholder="e.g. Technology & Tech Gadgets"
                    className="w-full text-xs text-gray-750 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 bg-white"
                    value={newCreatorNiche}
                    onChange={(e) => setNewCreatorNiche(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-red-600 uppercase tracking-wider font-mono">Address</label>
                  <input
                    type="text"
                    placeholder="e.g. Zoo Road, Tiniali"
                    className="w-full text-xs text-gray-750 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 bg-white"
                    value={newCreatorAddress}
                    onChange={(e) => setNewCreatorAddress(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-red-600 uppercase tracking-wider font-mono">Primary Mobile Number (Optional)</label>
                    {!showSecondaryMobile && (
                      <button
                        type="button"
                        onClick={() => setShowSecondaryMobile(true)}
                        className="text-[10px] font-bold text-red-650 hover:text-red-700 bg-red-50 hover:bg-red-100 px-2 py-0.5 rounded border border-red-200 transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <PlusCircle className="w-3 h-3 text-red-600" />
                        <span>+ Add Second Mobile</span>
                      </button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <select
                      className="w-[120px] text-xs text-gray-700 px-2 py-2 border border-gray-300 bg-white rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-red-600 transition"
                      value={selectedCountryCode}
                      onChange={(e) => setSelectedCountryCode(e.target.value)}
                    >
                      <option value="+91">🇮🇳 +91 (IN)</option>
                      <option value="+1">🇺🇸 +1 (US)</option>
                      <option value="+44">🇬🇧 +44 (UK)</option>
                      <option value="+61">🇦🇺 +61 (AU)</option>
                      <option value="+81">🇯🇵 +81 (JP)</option>
                      <option value="+49">🇩🇪 +49 (DE)</option>
                      <option value="+33">🇫🇷 +33 (FR)</option>
                      <option value="+55">🇧🇷 +55 (BR)</option>
                      <option value="+65">🇸🇬 +65 (SG)</option>
                      <option value="+971">🇦🇪 +971 (AE)</option>
                      <option value="+27">🇿🇦 +27 (ZA)</option>
                    </select>
                    <input
                      type="tel"
                      placeholder="e.g. 98765 43210"
                      className="flex-1 min-w-0 text-xs text-gray-700 px-3 py-2 border border-gray-300 bg-white rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-red-600 transition"
                      value={newCreatorMobile}
                      onChange={(e) => setNewCreatorMobile(e.target.value)}
                    />
                  </div>
                  <p className="text-[10px] text-gray-500 font-sans flex items-center gap-1 mt-0.5">
                    <Sparkles className="w-3 h-3 text-amber-500 shrink-0" />
                    <span>Auto-detects from creator&apos;s public profile, Instagram/Facebook bio &amp; YouTube channel info automatically.</span>
                  </p>
                </div>

                {/* Option to add second mobile number */}
                {showSecondaryMobile && (
                  <div className="space-y-1.5 bg-red-50/50 p-3 rounded-xl border border-red-200 shadow-2xs animate-fadeIn">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <label className="text-xs font-bold text-red-650 uppercase tracking-wider font-mono">Second Mobile Number (Optional)</label>
                        <span className="text-[9px] bg-red-100 text-red-700 font-bold px-1.5 py-0.2 rounded-full font-sans">Alternate / Manager</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setNewCreatorSecondaryMobile('');
                          setShowSecondaryMobile(false);
                        }}
                        className="text-[10px] font-bold text-gray-400 hover:text-red-600 transition flex items-center gap-0.5 cursor-pointer px-1 py-0.5 rounded hover:bg-red-100/50"
                        title="Remove second mobile number"
                      >
                        <X className="w-3 h-3" />
                        <span>Remove</span>
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <select
                        className="w-[120px] text-xs text-gray-700 px-2 py-2 border border-gray-300 bg-white rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-red-600 transition"
                        value={selectedSecondaryCountryCode}
                        onChange={(e) => setSelectedSecondaryCountryCode(e.target.value)}
                      >
                        <option value="+91">🇮🇳 +91 (IN)</option>
                        <option value="+1">🇺🇸 +1 (US)</option>
                        <option value="+44">🇬🇧 +44 (UK)</option>
                        <option value="+61">🇦🇺 +61 (AU)</option>
                        <option value="+81">🇯🇵 +81 (JP)</option>
                        <option value="+49">🇩🇪 +49 (DE)</option>
                        <option value="+33">🇫🇷 +33 (FR)</option>
                        <option value="+55">🇧🇷 +55 (BR)</option>
                        <option value="+65">🇸🇬 +65 (SG)</option>
                        <option value="+971">🇦🇪 +971 (AE)</option>
                        <option value="+27">🇿🇦 +27 (ZA)</option>
                      </select>
                      <input
                        type="tel"
                        placeholder="e.g. 98765 43211 (Manager or alternate calling line)"
                        className="flex-1 min-w-0 text-xs text-gray-700 px-3 py-2 border border-gray-300 bg-white rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-red-600 transition"
                        value={newCreatorSecondaryMobile}
                        onChange={(e) => setNewCreatorSecondaryMobile(e.target.value)}
                      />
                    </div>
                    <p className="text-[10px] text-gray-500 font-sans">
                      Secondary WhatsApp or direct calling line for creator's talent manager or emergency contact.
                    </p>
                  </div>
                )}
              </div>

              {/* Total Followers (Real Live Count) Card */}
              <div className="space-y-1.5 bg-gradient-to-r from-red-50/60 via-white to-fuchsia-50/60 p-3.5 rounded-xl border border-red-200 shadow-2xs">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-red-650 uppercase tracking-wider font-mono flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-red-600" />
                    <span>Real Total Followers *</span>
                    <span className="text-[9px] bg-red-100 text-red-700 px-1.5 py-0.2 rounded-full font-bold font-sans">Verified</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => handleCollectRealFollowers()}
                    disabled={isCollectingFollowers || (!newCreatorFacebook.trim() && !newCreatorInstagram.trim() && !newCreatorYoutube.trim() && !newCreatorName.trim())}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-bold font-mono tracking-wide transition flex items-center gap-1.5 border ${
                      isCollectingFollowers
                        ? 'bg-amber-100 text-amber-800 border-amber-300 animate-pulse'
                        : (!newCreatorFacebook.trim() && !newCreatorInstagram.trim() && !newCreatorYoutube.trim() && !newCreatorName.trim())
                        ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                        : 'bg-red-600 hover:bg-red-700 text-white border-transparent cursor-pointer shadow-2xs'
                    }`}
                  >
                    {isCollectingFollowers ? (
                      <>
                        <span className="inline-block w-2.5 h-2.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        <span>Collecting Real Followers...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3 h-3 text-amber-300" />
                        <span>⚡ Collect Real Followers</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="number"
                    placeholder="Auto-collected or enter count..."
                    className="flex-1 text-xs text-gray-800 font-mono font-bold px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 bg-white"
                    value={newCreatorFollowers}
                    onChange={(e) => {
                      setNewCreatorFollowers(e.target.value);
                      if (followerCollectionStatus) {
                        setFollowerCollectionStatus(prev => prev ? {
                          ...prev,
                          total: parseInt(e.target.value) || 0,
                          formatted: formatFollowerMetric(parseInt(e.target.value) || 0)
                        } : null);
                      }
                    }}
                  />
                  {newCreatorFollowers && Number(newCreatorFollowers) > 0 && (
                    <div className="px-3 py-2 bg-red-100/70 border border-red-200 text-red-800 rounded-lg text-xs font-mono font-black shrink-0">
                      ≈ {formatFollowerMetric(Number(newCreatorFollowers))}
                    </div>
                  )}
                </div>

                {followerCollectionStatus && (
                  <div className="mt-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-[10px] text-emerald-800 flex items-start gap-1.5 animate-fade-in shadow-2xs">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div className="flex-1 space-y-1">
                      <div className="font-bold flex items-center justify-between">
                        <span>Real Total Reach: {followerCollectionStatus.formatted} Followers</span>
                        <span className="px-1.5 py-0.2 bg-emerald-200 text-emerald-900 rounded font-mono text-[9px] uppercase font-bold">Live Data</span>
                      </div>
                      {followerCollectionStatus.breakdown && (
                        <div className="flex flex-wrap gap-2 text-[9px] font-mono text-emerald-700 pt-0.5 border-t border-emerald-200/60">
                          {followerCollectionStatus.breakdown.instagram > 0 && (
                            <span className="bg-white/80 px-1.5 py-0.5 rounded border border-emerald-200">
                              📷 Instagram: {formatFollowerMetric(followerCollectionStatus.breakdown.instagram)}
                            </span>
                          )}
                          {followerCollectionStatus.breakdown.youtube > 0 && (
                            <span className="bg-white/80 px-1.5 py-0.5 rounded border border-emerald-200">
                              ▶️ YouTube: {formatFollowerMetric(followerCollectionStatus.breakdown.youtube)}
                            </span>
                          )}
                          {followerCollectionStatus.breakdown.facebook > 0 && (
                            <span className="bg-white/80 px-1.5 py-0.5 rounded border border-emerald-200">
                              👤 Facebook: {formatFollowerMetric(followerCollectionStatus.breakdown.facebook)}
                            </span>
                          )}
                        </div>
                      )}
                      {followerCollectionStatus.details && (
                        <p className="text-[9px] text-emerald-750 italic leading-tight">{followerCollectionStatus.details}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-red-600 uppercase tracking-wider font-mono">Est Cost per post (₹)</label>
                <input
                  type="number"
                  placeholder="e.g. 800"
                  className="w-full text-xs text-gray-700 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 bg-white"
                  value={newCreatorCost}
                  onChange={(e) => setNewCreatorCost(e.target.value)}
                />
              </div>

              {/* Custom Optional Profile Picture Upload option */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-red-600 uppercase tracking-widest font-mono">Profile Picture (Optional)</label>
                <div className="space-y-1 bg-gray-50 border border-gray-200 rounded-xl p-3 flex flex-col sm:flex-row gap-3 items-center">
                  {newCreatorAvatar ? (
                    <img src={newCreatorAvatar} alt="Preview" className="w-12 h-12 rounded-full object-cover border" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-[10px] text-gray-500">No Image</div>
                  )}
                  <div className="flex-1 w-full space-y-1">
                    <label className="text-[10px] uppercase font-bold text-gray-500 block">Upload Profile Photo</label>
                    <input 
                       type="file" 
                       accept="image/*" 
                       onChange={(e) => {
                         const file = e.target.files?.[0];
                         if (file) {
                           const reader = new FileReader();
                           reader.onloadend = () => {
                             if (typeof reader.result === 'string') {
                               setNewCreatorAvatar(reader.result);
                               setIsCustomAvatarUploaded(true);
                             }
                           };
                           reader.readAsDataURL(file);
                         }
                       }}
                       className="text-xs text-gray-700 file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-red-50 file:text-red-700 hover:file:bg-red-100 cursor-pointer w-full"
                    />
                    <p className="text-[9px] text-gray-400">Select any image folder/file or paste a URL below</p>
                  </div>
                </div>
                <input
                  type="text"
                  placeholder="Or enter image URL directly..."
                  className="w-full text-xs text-gray-700 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 bg-white"
                  value={newCreatorAvatar}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNewCreatorAvatar(val);
                    if (val.trim()) {
                      setIsCustomAvatarUploaded(true);
                    } else {
                      setIsCustomAvatarUploaded(false);
                    }
                  }}
                />
              </div>

            </div>

            {/* Drawer Footer */}
            <div className="p-6 border-t border-red-100 bg-red-50/20 flex gap-3">
              <button
                type="button"
                onClick={() => setShowAddCreatorForm(false)}
                className="flex-1 py-2.5 bg-white border-2 border-red-600 text-red-650 hover:bg-red-50 rounded-lg text-sm font-bold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isCollectingFollowers}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-lg text-sm font-bold transition shadow-sm cursor-pointer flex items-center justify-center gap-2"
              >
                {isCollectingFollowers ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Collecting Real Followers & Onboarding...</span>
                  </>
                ) : (
                  'Submit Profile'
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Bill Generator Modal */}
      {showBillModal && selectedInfluencer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="absolute inset-0" />
          <div className="bg-white rounded-2xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden shadow-2xl relative z-10">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <h2 className="text-lg font-black text-gray-800">Generate PDF Bill for {selectedInfluencer.name}</h2>
              <button onClick={() => { setShowBillModal(false); setBillSuccessMessage(null); }} className="text-gray-400 hover:text-red-500 transition-colors p-1 bg-white rounded-full border border-gray-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-white">
              {/* Step 1: Upload Existing Bill */}
              <div className="p-4 border-2 border-dashed border-blue-200 rounded-xl bg-blue-50/50 text-center">
                <Cloud className="w-8 h-8 text-blue-400 mx-auto mb-2" />
                <h3 className="text-sm font-bold text-blue-900 mb-1">Upload Original Bill/Invoice</h3>
                <p className="text-xs text-blue-700 mb-4">Upload an image or PDF and our AI will extract all details automatically (including signature detection).</p>
                
                <div className="flex flex-col items-center gap-3">
                  <input 
                    type="file" 
                    accept="image/*,application/pdf" 
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                         setBillFile(e.target.files[0]);
                      }
                    }}
                    className="text-xs text-gray-700 file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-bold file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer"
                  />
                  {billFile && (
                    <button 
                      onClick={handleExtractBill}
                      disabled={isExtractingBill}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow transition-colors flex items-center gap-2"
                    >
                      {isExtractingBill ? 'Extracting via AI...' : 'Extract Data Automatically'}
                    </button>
                  )}
                </div>
              </div>

              {/* Step 2: Form Data */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-gray-800 border-b pb-2">Bill Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-gray-500">Invoice Number</label>
                    <input type="text" value={billData.invoiceNumber} onChange={(e) => setBillData(prev => ({...prev, invoiceNumber: e.target.value}))} className="w-full text-xs px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="e.g. INV-001" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-gray-500">Date</label>
                    <input type="date" value={billData.date} onChange={(e) => setBillData(prev => ({...prev, date: e.target.value}))} className="w-full text-xs px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-gray-500">Amount (Rs.)</label>
                    <input type="number" value={billData.amount} onChange={(e) => setBillData(prev => ({...prev, amount: e.target.value}))} className="w-full text-xs px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="e.g. 5000" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-gray-500">Services Description</label>
                    <input type="text" value={billData.services} onChange={(e) => setBillData(prev => ({...prev, services: e.target.value}))} className="w-full text-xs px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="e.g. Instagram Reel Promotion" />
                  </div>
                </div>
                
                <div className="p-3 bg-gray-50 border rounded-lg flex items-center justify-between mt-2">
                   <div>
                     <span className="text-xs font-bold text-gray-700 block">Original Signature Detected?</span>
                     <span className="text-[10px] text-gray-500">Did the AI detect a signature on the uploaded bill?</span>
                   </div>
                   <div className="flex items-center gap-2">
                     <span className="text-xs font-bold">{billData.signaturePresent ? '✅ Yes' : '❌ No'}</span>
                     <button onClick={() => setBillData(prev => ({...prev, signaturePresent: !prev.signaturePresent}))} className="text-[10px] bg-white border px-2 py-1 rounded">Toggle</button>
                   </div>
                </div>
                
                <div className="space-y-1 mt-4">
                  <label className="text-[10px] uppercase font-bold text-gray-500">Upload Actual Signature Image (Optional)</label>
                  <p className="text-[9px] text-gray-400">If you want a physical signature pasted on the PDF, upload it here.</p>
                  <input 
                    type="file" 
                    accept="image/*"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        const reader = new FileReader();
                        reader.onloadend = () => {
                           setBillData(prev => ({...prev, signatureImage: reader.result as string}));
                        };
                        reader.readAsDataURL(e.target.files[0]);
                      }
                    }}
                    className="text-xs text-gray-700 w-full"
                  />
                </div>
              </div>
            </div>

            {billSuccessMessage && (
              <div className="mx-6 mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg flex items-center justify-between shadow-sm animate-in fade-in zoom-in duration-300">
                <div className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-emerald-600" />
                  <span className="text-sm font-bold">{billSuccessMessage}</span>
                </div>
              </div>
            )}

            <div className="p-4 border-t border-gray-100 flex gap-3 bg-gray-50">
               <button onClick={() => { setShowBillModal(false); setBillSuccessMessage(null); }} className="flex-1 py-2 bg-white border border-gray-300 rounded-lg text-sm font-bold text-gray-700 hover:bg-gray-50 transition">Cancel</button>
               <button type="button" onClick={handleGeneratePDF} className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold shadow transition flex items-center justify-center gap-2">📄 Save & Download PDF Bill</button>
            </div>
          </div>
        </div>
      )}

      {/* Screen Capture Assistant Modal */}
      {screenCaptureModal?.isOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden my-auto animate-scale-up">
            {/* Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-xl backdrop-blur-xs">
                  {captureModalTab === 'influencer_files' ? (
                    <FolderDown className="w-6 h-6 text-white" />
                  ) : (
                    <Camera className="w-6 h-6 text-white" />
                  )}
                </div>
                <div>
                  <h3 className="text-base font-black tracking-tight text-white flex items-center gap-2">
                    <span>Chat Capture &amp; Influencer Files Downloader</span>
                    <span className="text-[10px] uppercase font-bold bg-white/25 px-2 py-0.5 rounded-full">
                      Direct PC Downloader
                    </span>
                  </h3>
                  <p className="text-xs text-blue-100 mt-0.5 font-medium">
                    Capture chat proof or download images, videos, audio &amp; files sent by <strong>{screenCaptureModal.influencer.name}</strong> on WhatsApp, Instagram &amp; Facebook.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setScreenCaptureModal(null);
                  setCapturedPreview(null);
                }}
                className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mode Tabs */}
            <div className="flex border-b border-slate-200 bg-slate-50 px-6 pt-2 gap-2">
              <button
                type="button"
                onClick={() => setCaptureModalTab('capture')}
                className={`pb-2.5 px-3.5 text-xs font-bold border-b-2 transition flex items-center gap-1.5 cursor-pointer ${
                  captureModalTab === 'capture'
                    ? 'border-indigo-600 text-indigo-700 font-extrabold bg-white rounded-t-lg shadow-2xs'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                <span>📸 Chat Screen Capture</span>
              </button>
              <button
                type="button"
                onClick={() => setCaptureModalTab('influencer_files')}
                className={`pb-2.5 px-3.5 text-xs font-bold border-b-2 transition flex items-center gap-1.5 cursor-pointer ${
                  captureModalTab === 'influencer_files'
                    ? 'border-indigo-600 text-indigo-700 font-extrabold bg-white rounded-t-lg shadow-2xs'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <FolderDown className="w-3.5 h-3.5 text-purple-600" />
                <span>📥 Influencer Sent Files &amp; Media</span>
                {Array.isArray(screenCaptureModal.influencer.chatScreenshots) && screenCaptureModal.influencer.chatScreenshots.length > 0 && (
                  <span className="text-[10px] bg-purple-100 text-purple-800 px-1.5 py-0.2 rounded-full font-black">
                    {screenCaptureModal.influencer.chatScreenshots.length}
                  </span>
                )}
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Common Platform Selector */}
              <div className="flex items-center justify-between bg-slate-50 border border-slate-200 p-2.5 rounded-xl">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Target Chat Platform:
                </span>
                <div className="flex items-center gap-1.5">
                  {(['WhatsApp', 'Instagram', 'Facebook', 'General'] as const).map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setScreenCaptureModal(prev => prev ? { ...prev, platform: p } : null)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                        screenCaptureModal.platform === p
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                      }`}
                    >
                      {p === 'WhatsApp' && '💬 WhatsApp'}
                      {p === 'Instagram' && '📸 Instagram'}
                      {p === 'Facebook' && '👤 Facebook'}
                      {p === 'General' && '📁 General'}
                    </button>
                  ))}
                </div>
              </div>

              {captureModalTab === 'capture' ? (
                <>
                  {/* Explanatory Guideline Box */}
                  <div className="p-3.5 bg-blue-50/80 border border-blue-200 rounded-xl text-xs text-blue-950 flex items-start gap-2.5">
                    <Sparkles className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-bold text-blue-900">
                        How Direct Screen Capture Works:
                      </p>
                      <p className="text-[11px] text-blue-800 leading-relaxed">
                        Browser security requires you to choose the chat window to screenshot. Click <strong>&quot;Select Window &amp; Capture&quot;</strong> below, click your WhatsApp or Instagram chat window, and the app will <strong>instantly save and download the PNG directly to your PC</strong>!
                      </p>
                      <p className="text-[11px] text-indigo-700 font-semibold">
                        💡 Tip: If you already snipped a screenshot with Windows (<kbd className="bg-white px-1.5 py-0.5 rounded border border-blue-200 font-mono text-[10px]">Win + Shift + S</kbd>) or Mac (<kbd className="bg-white px-1.5 py-0.5 rounded border border-blue-200 font-mono text-[10px]">Cmd + Shift + 4</kbd>), simply press <kbd className="bg-white px-1.5 py-0.5 rounded border border-blue-200 font-mono text-[10px]">Ctrl + V</kbd> or click <strong>&quot;Paste from Clipboard&quot;</strong>!
                      </p>
                    </div>
                  </div>

                  {/* Action Buttons Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Method 1: Browser Display Media Screen Capture */}
                    <button
                      type="button"
                      onClick={() => handleExecuteScreenCapture(screenCaptureModal.influencer, screenCaptureModal.platform)}
                      disabled={isCapturingScreen}
                      className="p-4 bg-gradient-to-br from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 active:scale-98 disabled:opacity-50 text-white rounded-xl shadow-md transition-all flex flex-col items-center justify-center gap-2 cursor-pointer group text-center"
                    >
                      <div className="p-3 bg-white/20 rounded-full group-hover:scale-110 transition">
                        <Laptop className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <span className="block font-black text-sm tracking-wide">
                          {isCapturingScreen ? 'Capturing Window...' : '1-Click Screen / Window Capture'}
                        </span>
                        <span className="block text-[11px] text-blue-100 font-medium mt-0.5">
                          Select WhatsApp / IG window &amp; auto-download
                        </span>
                      </div>
                    </button>

                    {/* Method 2: Paste from Clipboard */}
                    <button
                      type="button"
                      onClick={() => handlePasteClipboardImage(screenCaptureModal.influencer, screenCaptureModal.platform)}
                      className="p-4 bg-white border-2 border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50/50 active:scale-98 text-indigo-950 rounded-xl shadow-sm transition-all flex flex-col items-center justify-center gap-2 cursor-pointer group text-center"
                    >
                      <div className="p-3 bg-indigo-100 rounded-full group-hover:scale-110 transition">
                        <Clipboard className="w-6 h-6 text-indigo-600" />
                      </div>
                      <div>
                        <span className="block font-black text-sm tracking-wide text-indigo-900">
                          Paste from Clipboard (Ctrl + V)
                        </span>
                        <span className="block text-[11px] text-slate-500 font-medium mt-0.5">
                          Paste screenshot from Snipping Tool
                        </span>
                      </div>
                    </button>
                  </div>

                  {/* Method 3: Upload from Computer */}
                  <div className="p-3 border border-dashed border-slate-300 rounded-xl bg-slate-50 flex items-center justify-between text-xs text-slate-600">
                    <span className="font-medium">Have an existing screenshot image file on your PC?</span>
                    <label className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 rounded-lg font-bold text-xs shadow-xs transition cursor-pointer flex items-center gap-1.5">
                      <FileDown className="w-3.5 h-3.5" />
                      <span>Choose File</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            processAndSaveBlob(e.target.files[0], screenCaptureModal.influencer, screenCaptureModal.platform, 'File_Upload');
                          }
                        }}
                      />
                    </label>
                  </div>

                  {/* Auto-Open Crop Checkbox */}
                  <div className="flex items-center justify-between px-3 py-2 bg-indigo-50/60 border border-indigo-200/60 rounded-xl text-xs text-indigo-950">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={autoOpenCrop}
                        onChange={(e) => {
                          setAutoOpenCrop(e.target.checked);
                          safeLocalStorage.setItem('future_creator_auto_open_crop', e.target.checked ? 'true' : 'false');
                        }}
                        className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                      />
                      <span className="font-bold text-indigo-900 flex items-center gap-1.5">
                        <Crop className="w-3.5 h-3.5 text-indigo-600" />
                        Auto-open Crop tool immediately after capturing screenshot
                      </span>
                    </label>
                  </div>
                </>
              ) : (
                <>
                  {/* TAB 2: Influencer Sent Files & Media Panel */}
                  <div className="space-y-4">
                    {/* Category Selector */}
                    <div className="bg-purple-50/70 border border-purple-200 p-3 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-purple-900 flex items-center gap-1.5">
                          <Paperclip className="w-3.5 h-3.5 text-purple-600" />
                          Tag / Category for Received File:
                        </span>
                        <span className="text-[10px] text-purple-700 font-medium">
                          Auto-names downloaded PC file
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          'Product Photo / Sample Proof',
                          'Media Kit / Rate Card PDF',
                          'Contract / Agreement Draft',
                          'Payment Receipt / Invoice',
                          'Voice Note / Audio',
                          'Video Reel / Clip',
                          'General Chat File'
                        ].map(cat => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setSelectedFileCategory(cat)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                              selectedFileCategory === cat
                                ? 'bg-purple-600 text-white shadow-xs'
                                : 'bg-white text-slate-700 border border-purple-200 hover:bg-purple-100/60'
                            }`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Drag-and-drop Multi-File Dropzone */}
                    <div
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                          Array.from(e.dataTransfer.files).forEach(f => {
                            processAndSaveInfluencerFile(f, screenCaptureModal.influencer, screenCaptureModal.platform, selectedFileCategory);
                          });
                        }
                      }}
                      className="border-2 border-dashed border-indigo-300 hover:border-indigo-500 bg-indigo-50/40 hover:bg-indigo-50/70 rounded-2xl p-6 text-center transition flex flex-col items-center justify-center gap-2.5 cursor-pointer group"
                    >
                      <div className="p-3 bg-white rounded-full shadow-xs border border-indigo-200 group-hover:scale-110 transition">
                        <UploadCloud className="w-7 h-7 text-indigo-600" />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-slate-900">
                          Drop Influencer Files or Images Here
                        </h4>
                        <p className="text-xs text-slate-600 mt-1 max-w-md mx-auto">
                          Supports <strong>Photos, PDFs, Word docs, Excel sheets, Videos (MP4), Voice notes (MP3/WAV)</strong> sent by {screenCaptureModal.influencer.name}.
                        </p>
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <label className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-xs font-extrabold shadow-sm transition cursor-pointer flex items-center gap-1.5">
                          <FolderDown className="w-4 h-4" />
                          <span>Select Files from PC</span>
                          <input
                            type="file"
                            multiple
                            className="hidden"
                            onChange={(e) => {
                              if (e.target.files && e.target.files.length > 0) {
                                Array.from(e.target.files).forEach(f => {
                                  processAndSaveInfluencerFile(f, screenCaptureModal.influencer, screenCaptureModal.platform, selectedFileCategory);
                                });
                              }
                            }}
                          />
                        </label>
                      </div>

                      <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
                        <span>💡 You can also copy an image or file in WhatsApp / Instagram and press</span>
                        <kbd className="bg-white px-1.5 py-0.5 rounded border border-slate-300 font-mono text-[10px] text-slate-700">Ctrl + V</kbd>
                      </div>
                    </div>

                    {/* URL Link Import Option */}
                    <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-800 flex items-center gap-1.5">
                          <Link2 className="w-3.5 h-3.5 text-blue-600" />
                          Download File or Image from Web URL:
                        </span>
                        <span className="text-[11px] text-slate-500">
                          Cloud drive, direct media link, or image URL
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="url"
                          placeholder="https://... (paste link to image, document or video sent by creator)"
                          value={fileUrlInput}
                          onChange={(e) => setFileUrlInput(e.target.value)}
                          className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-hidden focus:border-indigo-500"
                        />
                        <button
                          type="button"
                          onClick={() => handleDownloadFromUrl(fileUrlInput, screenCaptureModal.influencer, screenCaptureModal.platform, selectedFileCategory)}
                          disabled={isFetchingUrl || !fileUrlInput.trim()}
                          className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer shrink-0"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>{isFetchingUrl ? 'Fetching...' : 'Download to PC'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Live Preview of Recently Captured Screenshot or Downloaded File */}
              {capturedPreview && (
                <div className="p-4 bg-emerald-50 border-2 border-emerald-300 rounded-xl space-y-3 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-emerald-900 font-extrabold text-xs">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>File Downloaded Directly to Your PC!</span>
                    </div>
                    <span className="text-[10px] font-mono text-emerald-700 bg-white px-2 py-0.5 rounded border border-emerald-200">
                      {capturedPreview.fileName}
                    </span>
                  </div>

                  {/* Render based on file kind */}
                  {capturedPreview.fileKind === 'pdf' || capturedPreview.fileName?.toLowerCase().endsWith('.pdf') ? (
                    <div className="p-4 bg-white border border-emerald-200 rounded-lg flex items-center gap-3">
                      <FileText className="w-10 h-10 text-rose-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate">{capturedPreview.fileName}</p>
                        <p className="text-[11px] text-slate-500">PDF Document • Downloaded to PC</p>
                      </div>
                      <a
                        href={capturedPreview.dataUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-md text-xs font-bold flex items-center gap-1 transition"
                      >
                        <Eye className="w-3 h-3" />
                        <span>Open PDF</span>
                      </a>
                    </div>
                  ) : capturedPreview.fileKind === 'video' || capturedPreview.fileName?.toLowerCase().match(/\.(mp4|webm|mov)$/) ? (
                    <div className="max-h-56 overflow-hidden rounded-lg border border-emerald-200 bg-slate-900 flex items-center justify-center p-1">
                      <video src={capturedPreview.dataUrl} controls className="max-h-52 w-auto mx-auto rounded" />
                    </div>
                  ) : capturedPreview.fileKind === 'audio' || capturedPreview.fileName?.toLowerCase().match(/\.(mp3|wav|ogg|m4a)$/) ? (
                    <div className="p-4 bg-white border border-emerald-200 rounded-lg flex flex-col gap-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                        <Music className="w-4 h-4 text-emerald-600" />
                        <span>Voice Note / Audio File</span>
                      </div>
                      <audio src={capturedPreview.dataUrl} controls className="w-full" />
                    </div>
                  ) : capturedPreview.fileKind === 'document' || capturedPreview.fileName?.toLowerCase().match(/\.(docx?|xlsx?|csv|txt)$/) ? (
                    <div className="p-4 bg-white border border-emerald-200 rounded-lg flex items-center gap-3">
                      <FileSpreadsheet className="w-10 h-10 text-blue-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate">{capturedPreview.fileName}</p>
                        <p className="text-[11px] text-slate-500">Office Document • Downloaded to PC</p>
                      </div>
                    </div>
                  ) : (
                    <div className="max-h-56 overflow-hidden rounded-lg border border-emerald-200 bg-slate-900 flex items-center justify-center">
                      <img
                        src={capturedPreview.dataUrl}
                        alt="Captured Media Preview"
                        className="max-h-56 w-auto object-contain mx-auto"
                      />
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                    <span className="text-[11px] text-emerald-800 font-medium">
                      Saved to {screenCaptureModal.influencer.name}&apos;s profile &amp; your PC Downloads.
                    </span>
                    <div className="flex items-center gap-2">
                      {(!capturedPreview.fileKind || capturedPreview.fileKind === 'image') && (
                        <button
                          type="button"
                          onClick={() => {
                            setCropModal({
                              isOpen: true,
                              influencer: screenCaptureModal.influencer,
                              imageUrl: capturedPreview.dataUrl,
                              fileName: capturedPreview.fileName,
                              platform: capturedPreview.platform
                            });
                          }}
                          className="px-3 py-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-lg text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                          title="Crop image area and download to PC"
                        >
                          <Crop className="w-3.5 h-3.5" />
                          <span>Crop Image</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          const a = document.createElement('a');
                          a.href = capturedPreview.dataUrl;
                          a.download = capturedPreview.fileName;
                          a.click();
                        }}
                        className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition flex items-center gap-1 cursor-pointer"
                      >
                        <Download className="w-3 h-3" />
                        <span>Re-download</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              {Array.isArray(screenCaptureModal.influencer.chatScreenshots) && screenCaptureModal.influencer.chatScreenshots.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setViewScreenshotsModal({ isOpen: true, influencer: screenCaptureModal.influencer });
                  }}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 cursor-pointer"
                >
                  <FolderDown className="w-3.5 h-3.5" />
                  <span>View All Saved Media &amp; Files ({screenCaptureModal.influencer.chatScreenshots.length})</span>
                </button>
              ) : (
                <span className="text-xs text-slate-400">No previous files saved yet.</span>
              )}
              <button
                type="button"
                onClick={() => {
                  setScreenCaptureModal(null);
                  setCapturedPreview(null);
                }}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Saved Chat Screenshots Gallery Modal */}
      {viewScreenshotsModal?.isOpen && (
        <div className="fixed inset-0 z-[110] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden my-auto animate-scale-up">
            {/* Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-xl backdrop-blur-xs">
                  <FolderDown className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-black tracking-tight text-white flex items-center gap-2">
                    <span>Chat Media &amp; Received Files Gallery</span>
                    <span className="text-[10px] uppercase font-bold bg-white/25 px-2 py-0.5 rounded-full">
                      {viewScreenshotsModal.influencer.name}
                    </span>
                  </h3>
                  <p className="text-xs text-amber-100 mt-0.5 font-medium">
                    Review, download to PC, crop images, or audit files sent by the creator
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {Array.isArray(viewScreenshotsModal.influencer.chatScreenshots) && viewScreenshotsModal.influencer.chatScreenshots.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const list = viewScreenshotsModal.influencer.chatScreenshots || [];
                      list.forEach((item: any, i: number) => {
                        setTimeout(() => {
                          const a = document.createElement('a');
                          a.href = item.dataUrl;
                          a.download = item.fileName || `FutureCreator_File_${i + 1}`;
                          document.body.appendChild(a);
                          a.click();
                          setTimeout(() => {
                            if (document.body.contains(a)) document.body.removeChild(a);
                          }, 300);
                        }, i * 350);
                      });
                      globalToast.success(`Downloading ${list.length} item(s) to your PC!`);
                    }}
                    className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                    title="Download all screenshots & files to your PC"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Download All to PC</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setViewScreenshotsModal(null)}
                  className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition cursor-pointer"
                  title="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Gallery Grid */}
            <div className="p-6 max-h-[70vh] overflow-y-auto">
              {Array.isArray(viewScreenshotsModal.influencer.chatScreenshots) && viewScreenshotsModal.influencer.chatScreenshots.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {viewScreenshotsModal.influencer.chatScreenshots.map((ss: any, idx: number) => {
                    const isPdf = ss.fileKind === 'pdf' || ss.fileName?.toLowerCase().endsWith('.pdf');
                    const isVideo = ss.fileKind === 'video' || ss.fileName?.toLowerCase().match(/\.(mp4|webm|mov)$/);
                    const isAudio = ss.fileKind === 'audio' || ss.fileName?.toLowerCase().match(/\.(mp3|wav|ogg|m4a)$/);
                    const isDoc = ss.fileKind === 'document' || ss.fileName?.toLowerCase().match(/\.(docx?|xlsx?|csv|txt)$/);
                    const isImage = !isPdf && !isVideo && !isAudio && !isDoc;

                    return (
                      <div key={ss.id || idx} className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50 shadow-xs flex flex-col">
                        {/* Media Container based on type */}
                        {isPdf ? (
                          <div className="bg-slate-900 h-44 flex flex-col items-center justify-center p-4 text-center">
                            <FileText className="w-12 h-12 text-rose-500 mb-1" />
                            <span className="text-xs font-bold text-white line-clamp-1 max-w-[220px]">{ss.originalName || ss.fileName}</span>
                            <span className="text-[10px] text-rose-300 font-mono mt-0.5">PDF Document</span>
                            <a
                              href={ss.dataUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-2.5 px-3 py-1 bg-white/20 hover:bg-white/30 text-white rounded-md text-[11px] font-bold flex items-center gap-1 transition"
                            >
                              <Eye className="w-3 h-3" /> View / Open PDF
                            </a>
                          </div>
                        ) : isVideo ? (
                          <div className="bg-slate-900 h-44 flex flex-col items-center justify-center p-2">
                            <video src={ss.dataUrl} controls className="max-h-36 max-w-full rounded" />
                          </div>
                        ) : isAudio ? (
                          <div className="bg-slate-900 h-44 flex flex-col items-center justify-center p-4 text-center">
                            <Music className="w-10 h-10 text-emerald-400 mb-2" />
                            <audio src={ss.dataUrl} controls className="w-full max-w-[220px]" />
                            <span className="text-[10px] text-slate-300 font-mono mt-1">Audio / Voice Note</span>
                          </div>
                        ) : isDoc ? (
                          <div className="bg-slate-900 h-44 flex flex-col items-center justify-center p-4 text-center">
                            <FileSpreadsheet className="w-12 h-12 text-blue-400 mb-1" />
                            <span className="text-xs font-bold text-white line-clamp-1 max-w-[220px]">{ss.originalName || ss.fileName}</span>
                            <span className="text-[10px] text-blue-300 font-mono mt-0.5">Office / Document</span>
                          </div>
                        ) : (
                          <div className="bg-slate-900 h-44 flex items-center justify-center overflow-hidden relative group">
                            <img
                              src={ss.dataUrl}
                              alt={ss.fileName || `Screenshot ${idx + 1}`}
                              className="max-h-44 w-auto object-contain transition duration-200 group-hover:scale-105"
                            />
                            <a
                              href={ss.dataUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-bold transition"
                            >
                              <Eye className="w-4 h-4 mr-1" /> View Full Size
                            </a>
                          </div>
                        )}

                        <div className="p-3 bg-white flex-1 flex flex-col justify-between space-y-2">
                          <div>
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-100 text-blue-800">
                                {ss.platform || 'Chat'}
                              </span>
                              {ss.fileCategory && (
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-purple-100 text-purple-800">
                                  {ss.fileCategory}
                                </span>
                              )}
                              <span className="text-[10px] text-slate-400 font-mono">
                                {ss.capturedAt ? new Date(ss.capturedAt).toLocaleDateString('en-GB') : ''}
                              </span>
                            </div>
                            <p className="text-xs font-bold text-slate-800 truncate mt-1" title={ss.fileName}>
                              {ss.fileName}
                            </p>
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                            <div className="flex items-center gap-1.5">
                              {isImage && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCropModal({
                                      isOpen: true,
                                      influencer: viewScreenshotsModal.influencer,
                                      imageUrl: ss.dataUrl,
                                      fileName: ss.fileName || `Chat_Screenshot_${idx + 1}.png`,
                                      platform: ss.platform || 'Chat',
                                      screenshotId: ss.id
                                    });
                                  }}
                                  className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-md text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
                                  title="Crop image area and download to PC"
                                >
                                  <Crop className="w-3 h-3" />
                                  <span>Crop</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => {
                                  const a = document.createElement('a');
                                  a.href = ss.dataUrl;
                                  a.download = ss.fileName || `Chat_Screenshot_${idx + 1}.png`;
                                  a.click();
                                  globalToast.success('File downloading to PC!');
                                }}
                                className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-md text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
                              >
                                <Download className="w-3 h-3" />
                                <span>Download to PC</span>
                              </button>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm('Delete this saved file from the creator profile?')) {
                                  const filtered = (viewScreenshotsModal.influencer.chatScreenshots || []).filter((_: any, i: number) => i !== idx);
                                  if (onUpdateInfluencer) {
                                    onUpdateInfluencer(viewScreenshotsModal.influencer.id, { chatScreenshots: filtered });
                                  }
                                  setViewScreenshotsModal(prev => prev ? { ...prev, influencer: { ...prev.influencer, chatScreenshots: filtered } } : null);
                                  globalToast.info('Item removed from profile.');
                                }
                              }}
                              className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-md transition cursor-pointer"
                              title="Delete Item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-8 text-center text-slate-400 space-y-3">
                  <Camera className="w-10 h-10 mx-auto text-slate-300" />
                  <p className="text-sm font-medium">No chat screenshots saved for this creator yet.</p>
                  <button
                    type="button"
                    onClick={() => {
                      const inf = viewScreenshotsModal.influencer;
                      setViewScreenshotsModal(null);
                      setScreenCaptureModal({ isOpen: true, influencer: inf, platform: 'WhatsApp' });
                    }}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition"
                  >
                    📸 Capture First Screenshot
                  </button>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <span className="text-xs text-slate-500 font-medium">
                Total: <strong>{(viewScreenshotsModal.influencer.chatScreenshots || []).length}</strong> screenshot(s)
              </span>
              <button
                type="button"
                onClick={() => setViewScreenshotsModal(null)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Chat Opened Alert Bar */}
      {activeChatAlert && (
        <div className="fixed bottom-5 right-5 z-[90] bg-slate-900/95 backdrop-blur-md text-white p-4 rounded-2xl shadow-2xl border border-slate-700 max-w-sm animate-slide-up space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-blue-600 rounded-xl text-white shrink-0">
                <Camera className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-black text-white leading-tight">
                  Chat opened with {activeChatAlert.influencer.name}!
                </p>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  Ready to capture previous {activeChatAlert.platform} chat?
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveChatAlert(null)}
              className="text-slate-400 hover:text-white p-1 transition"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                const alertData = activeChatAlert;
                setActiveChatAlert(null);
                setCapturedPreview(null);
                setScreenCaptureModal({
                  isOpen: true,
                  influencer: alertData.influencer,
                  platform: alertData.platform
                });
                // Trigger screen capture prompt immediately
                setTimeout(() => {
                  handleExecuteScreenCapture(alertData.influencer, alertData.platform);
                }, 100);
              }}
              className="flex-1 py-1.5 px-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg text-xs font-bold shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Capture &amp; Download to PC</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveChatAlert(null)}
              className="py-1.5 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Interactive Screenshot Cropper Modal */}
      {cropModal?.isOpen && (
        <ChatScreenshotCropModal
          isOpen={cropModal.isOpen}
          onClose={() => setCropModal(null)}
          imageUrl={cropModal.imageUrl}
          fileName={cropModal.fileName}
          influencerName={cropModal.influencer.name}
          platform={cropModal.platform}
          onSaveCrop={handleSaveCrop}
        />
      )}
    </div>
  );
}
