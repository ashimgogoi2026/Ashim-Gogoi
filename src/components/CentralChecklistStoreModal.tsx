import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  BookOpen, 
  CheckSquare, 
  FileText, 
  FileDown, 
  FileCheck, 
  Upload, 
  Trash2, 
  Plus, 
  Eye, 
  Download, 
  Sparkles, 
  Check, 
  X, 
  Image as ImageIcon, 
  Layers, 
  Search, 
  Clock, 
  Package, 
  AlertCircle, 
  Save, 
  RotateCcw,
  PenTool,
  CloudUpload,
  CloudDownload,
  Languages,
  ListOrdered,
  ArrowUp,
  ArrowDown,
  Pencil,
  Bot,
  Info,
  Cpu,
  ChevronDown
} from 'lucide-react';
import { 
  ProductChecklistConfig, 
  ChecklistDocumentAttachment, 
  loadAllProductChecklists, 
  saveProductChecklist, 
  saveAllProductChecklists,
  deleteProductChecklist, 
  getProductChecklist, 
  normalizeProductKey, 
  parseExtractedTextIntoSections,
  INITIAL_PRODUCT_CHECKLISTS,
  safeGetItem,
  safeSetItem
} from '../lib/productChecklistStore';
import { ChecklistSection, ChecklistItem, generateInfluencerChecklistPDF } from '../lib/pdfChecklistGenerator';
import { 
  translateChecklistSections, 
  translateProductMetadata, 
  translateTextToAssamese 
} from '../lib/assameseChecklistTranslator';
import { uploadProductChecklistsToDrive, downloadProductChecklistsFromDrive } from '../lib/driveSync';
import { ensureGoogleAccessToken } from '../lib/firebaseAuth';
import { globalToast } from '../lib/toast';

export interface TranslatorModelOption {
  id: string;
  name: string;
  tag: string;
  badgeColor: string;
  description: string;
  highlights: string;
  speed: string;
  quality: string;
}

export const TRANSLATOR_AI_MODELS: TranslatorModelOption[] = [
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    tag: 'Recommended',
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    description: 'Fastest & most natural Assamese translation engine (benchmarked in File 4)',
    highlights: 'Authentic influencer phrasing, natural conversational Assamese, accurate brand rules',
    speed: 'Ultra Fast (~1s)',
    quality: 'Highest Fidelity'
  },
  {
    id: 'gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash Lite',
    tag: 'Fast & Balanced',
    badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
    description: 'High-speed multimodal Flash Lite model with fluent Assamese capabilities',
    highlights: 'Low latency, high quota headroom & structured formatting',
    speed: 'Ultra Fast (<1s)',
    quality: 'Very High'
  },
  {
    id: 'gemini-flash-latest',
    name: 'Gemini Flash Latest',
    tag: 'High Speed',
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
    description: 'Latest Flash model for rapid translation passes',
    highlights: 'Instant generation & lightweight processing',
    speed: 'Instant (<1s)',
    quality: 'High'
  },
  {
    id: 'auto',
    name: 'Auto Smart Failover',
    tag: 'Fail-Safe',
    badgeColor: 'bg-slate-100 text-slate-800 border-slate-200',
    description: 'Tries Gemini 3.8 Flash first, then automatically falls back to Flash Lite if needed',
    highlights: 'Resilient high-availability routing for zero downtime',
    speed: 'Dynamic',
    quality: 'Smart Adaptive'
  }
];

interface CentralChecklistStoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSelectedProduct?: string;
  onApplyToActiveTask?: (sections: ChecklistSection[], productTitle: string, bdmName?: string, bdmSignature?: string) => void;
  availableProducts?: string[];
  accessToken?: string | null;
}

export const CentralChecklistStoreModal: React.FC<CentralChecklistStoreModalProps> = ({
  isOpen,
  onClose,
  initialSelectedProduct,
  onApplyToActiveTask,
  availableProducts = [],
  accessToken
}) => {
  const [store, setStore] = useState<Record<string, ProductChecklistConfig>>(() => loadAllProductChecklists());
  const [selectedKey, setSelectedKey] = useState<string>('chocolate drink');
  const [searchTerm, setSearchTerm] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingSig, setIsSavingSig] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDriveUploading, setIsDriveUploading] = useState(false);
  const [isDriveSyncing, setIsDriveSyncing] = useState(false);
  const [lastDriveSyncTime, setLastDriveSyncTime] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [selectedTranslatorModel, setSelectedTranslatorModel] = useState<string>(() => {
    return safeGetItem('central_checklist_translator_model') || 'gemini-3.8-flash';
  });
  const [lastUsedModel, setLastUsedModel] = useState<string | null>(null);
  const [showModelInfoModal, setShowModelInfoModal] = useState<boolean>(false);
  const [isGeneratingSamplePdf, setIsGeneratingSamplePdf] = useState(false);
  const [isGeneratingInfluencerPdf, setIsGeneratingInfluencerPdf] = useState(false);
  const [isParsingDoc, setIsParsingDoc] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<ChecklistDocumentAttachment | null>(null);
  const [showAddProductInput, setShowAddProductInput] = useState(false);
  const [newProductName, setNewProductName] = useState('');

  // Add Point Dialog State with Line Selection Option
  const [addPointModal, setAddPointModal] = useState<{
    isOpen: boolean;
    sectionIndex: number;
    sectionTitle: string;
    totalPoints: number;
    text: string;
    targetLine: number; // 1-indexed line position
    checked: boolean;
  } | null>(null);

  // Remove Point Dialog State with Line Selection Option
  const [removePointModal, setRemovePointModal] = useState<{
    isOpen: boolean;
    sectionIndex: number;
    sectionTitle: string;
    targetLine: number; // 1-indexed line position
  } | null>(null);

  // Edit Point Dialog State with Line Position and Section Options
  const [editPointModal, setEditPointModal] = useState<{
    isOpen: boolean;
    sectionIndex: number;
    itemIndex: number;
    sectionTitle: string;
    originalText: string;
    text: string;
    targetLine: number; // 1-indexed line position
    targetSectionIndex: number;
    checked: boolean;
  } | null>(null);

  // Active product form states
  const [activeProductName, setActiveProductName] = useState('');
  const [activeProductTitle, setActiveProductTitle] = useState('');
  const [activeDescription, setActiveDescription] = useState('');
  const [activeBdmName, setActiveBdmName] = useState('ASHIM GOGOI');
  const [activeBdmSignature, setActiveBdmSignature] = useState('');
  const [isDrawingSig, setIsDrawingSig] = useState(false);
  const [isDrawingActive, setIsDrawingActive] = useState(false);
  const [activeNotes, setActiveNotes] = useState('');
  const [activeSections, setActiveSections] = useState<ChecklistSection[]>([]);
  const [activeAttachments, setActiveAttachments] = useState<ChecklistDocumentAttachment[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const sigFileInputRef = useRef<HTMLInputElement>(null);
  const sigCanvasRef = useRef<HTMLCanvasElement>(null);

  // Sync store when modal opens or initialSelectedProduct changes
  useEffect(() => {
    if (isOpen) {
      const freshStore = loadAllProductChecklists();
      setStore(freshStore);

      const targetKey = initialSelectedProduct ? normalizeProductKey(initialSelectedProduct) : 'chocolate drink';
      if (freshStore[targetKey]) {
        setSelectedKey(targetKey);
      } else if (Object.keys(freshStore).length > 0) {
        setSelectedKey(Object.keys(freshStore)[0]);
      }
    }
  }, [isOpen, initialSelectedProduct]);

  // When selected product changes, populate active editor
  useEffect(() => {
    if (!selectedKey) return;
    const config = store[selectedKey] || getProductChecklist(selectedKey);
    setActiveProductName(config.productName || selectedKey);
    setActiveProductTitle(config.title || (config.productName.toLowerCase().startsWith('product') ? config.productName : `Product - ${config.productName}`));
    setActiveDescription(config.description || '');
    setActiveBdmName(config.defaultBdmName || 'ASHIM GOGOI');
    setActiveBdmSignature(config.bdmSignatureData || config.bdmSignature || '');
    setIsDrawingSig(false);
    setActiveNotes(config.notes || '');
    setActiveSections(JSON.parse(JSON.stringify(config.sections || [])));
    setActiveAttachments(config.attachments || []);
    setHasUnsavedChanges(false);
  }, [selectedKey, store]);

  // Combined product keys: from store + availableProducts from monthly planner / scheduler
  const allProductKeys = useMemo(() => {
    const keysMap = new Map<string, { key: string; name: string }>();

    // From store
    Object.values(store).forEach(c => {
      const k = normalizeProductKey(c.productName || c.productKey);
      keysMap.set(k, { key: k, name: c.productName || k });
    });

    // From available app products
    availableProducts.forEach(p => {
      if (p && typeof p === 'string' && p.trim()) {
        const k = normalizeProductKey(p);
        if (!keysMap.has(k)) {
          keysMap.set(k, { key: k, name: p.trim() });
        }
      }
    });

    return Array.from(keysMap.values());
  }, [store, availableProducts]);

  // Filtered products list
  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return allProductKeys;
    const q = searchTerm.toLowerCase();
    return allProductKeys.filter(p => p.name.toLowerCase().includes(q) || p.key.includes(q));
  }, [allProductKeys, searchTerm]);

  // Upload all product checklists to Google Drive
  const handleUploadToGoogleDrive = async () => {
    setIsDriveUploading(true);
    try {
      globalToast.info('Connecting to Google Drive...');
      const token = await ensureGoogleAccessToken(accessToken);
      if (!token) {
        throw new Error('Google authentication is required to access Google Drive.');
      }

      globalToast.info('Uploading product checklists to Google Drive...');
      const currentStore = loadAllProductChecklists();
      const res = await uploadProductChecklistsToDrive(token, currentStore);
      
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setLastDriveSyncTime(timeStr);
      globalToast.success(`Successfully uploaded ${res.productCount} product checklists to Google Drive!`);
    } catch (err: any) {
      console.error('[Drive Upload Error]', err);
      globalToast.error(`Upload to Google Drive failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsDriveUploading(false);
    }
  };

  // Synchronize product checklists from Google Drive
  const handleSynchronizeFromGoogleDrive = async () => {
    setIsDriveSyncing(true);
    try {
      globalToast.info('Connecting to Google Drive...');
      const token = await ensureGoogleAccessToken(accessToken);
      if (!token) {
        throw new Error('Google authentication is required to access Google Drive.');
      }

      globalToast.info('Fetching product checklists from Google Drive...');
      const result = await downloadProductChecklistsFromDrive(token);

      if (!result || !result.data || Object.keys(result.data).length === 0) {
        globalToast.error('No product checklists store backup found on Google Drive.');
        return;
      }

      // Merge and save to local store
      const localStore = loadAllProductChecklists();
      const mergedStore: Record<string, ProductChecklistConfig> = {
        ...localStore,
        ...result.data
      };

      saveAllProductChecklists(mergedStore);
      setStore(mergedStore);

      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setLastDriveSyncTime(timeStr);
      globalToast.success(`Successfully synchronized ${result.count} product checklists from Google Drive!`);
    } catch (err: any) {
      console.error('[Drive Sync Error]', err);
      globalToast.error(`Synchronization failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsDriveSyncing(false);
    }
  };

  // Translate current checklist content into Assamese (অসমীয়া)
  const handleTranslateToAssamese = async () => {
    if (!activeSections || activeSections.length === 0) {
      globalToast.error('No checklist sections available to translate.');
      return;
    }

    setIsTranslating(true);
    const chosenMeta = TRANSLATOR_AI_MODELS.find(m => m.id === selectedTranslatorModel);
    globalToast.info(`Translating entire checklist to Assamese using ${chosenMeta?.name || selectedTranslatorModel}... (অসমীয়া কৰা হৈছে)`);

    try {
      let translatedData: any = null;
      let usedModelName: string = selectedTranslatorModel;

      try {
        const response = await fetch('/api/translate-checklist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: activeProductTitle,
            description: activeDescription,
            notes: activeNotes,
            sections: activeSections,
            targetLanguage: 'Assamese',
            model: selectedTranslatorModel
          })
        });

        const resData = await response.json();
        if (resData && resData.success && resData.data) {
          translatedData = resData.data;
          if (resData.usedModel) {
            usedModelName = resData.usedModel;
          }
        }
      } catch (networkErr) {
        console.warn('[Assamese Translation API Network fallback]', networkErr);
      }

      // If server didn't provide data or failed, use local comprehensive translation engine
      if (!translatedData || !Array.isArray(translatedData.sections) || translatedData.sections.length === 0) {
        const meta = translateProductMetadata(activeProductTitle, activeDescription, activeNotes);
        const localSections = translateChecklistSections(activeSections);
        translatedData = {
          title: meta.title,
          description: meta.description,
          notes: meta.notes,
          sections: localSections
        };
      }

      // Helper to ensure text has Assamese without corrupting already translated text containing English parentheticals
      const ensureAssamese = (text?: string, fallback?: string): string => {
        const target = (text || fallback || '').trim();
        if (!target) return '';
        if (/[\u0980-\u09FF]/.test(target)) {
          return target;
        }
        return translateTextToAssamese(target);
      };

      // Final pass: Guarantee that every title, subtitle, and every single point is converted to Assamese
      if (translatedData.title) {
        setActiveProductTitle(ensureAssamese(translatedData.title, activeProductTitle));
      }
      if (translatedData.description) {
        setActiveDescription(ensureAssamese(translatedData.description, activeDescription));
      }
      if (translatedData.notes) {
        setActiveNotes(ensureAssamese(translatedData.notes, activeNotes));
      }

      if (translatedData.sections && Array.isArray(translatedData.sections)) {
        const finalizedSections: ChecklistSection[] = translatedData.sections.map((sec: any, sIdx: number) => {
          const origSec = activeSections[sIdx] || {};
          const secTitle = ensureAssamese(sec.title, origSec.title);
          const secSubtitle = ensureAssamese(sec.subtitle, origSec.subtitle);

          const origItems = origSec.items || [];
          const secItems = Array.isArray(sec.items) ? sec.items : origItems;

          const finalizedItems: ChecklistItem[] = secItems.map((it: any, iIdx: number) => {
            const origItem = origItems[iIdx] || {};
            let textVal = (it.text || origItem.text || '').trim();
            const hasAssameseChars = /[\u0980-\u09FF]/.test(textVal);
            if (!hasAssameseChars || textVal === origItem.text) {
              textVal = translateTextToAssamese(textVal);
            }
            return {
              id: it.id || origItem.id || `item_${sIdx}_${iIdx}`,
              checked: typeof it.checked === 'boolean' ? it.checked : (origItem.checked ?? true),
              text: textVal
            };
          });

          return {
            id: sec.id || origSec.id || `sec_${sIdx}`,
            title: secTitle,
            subtitle: secSubtitle,
            iconType: sec.iconType || origSec.iconType || 'check',
            items: finalizedItems
          };
        });

        setActiveSections(finalizedSections);
      }

      setHasUnsavedChanges(true);
      setLastUsedModel(usedModelName);
      const modelInfo = TRANSLATOR_AI_MODELS.find(m => m.id === usedModelName);
      globalToast.success(`All words and points successfully converted to Assamese via ${modelInfo ? modelInfo.name : usedModelName}! Click Save to keep changes.`);
    } catch (err: any) {
      console.error('[Translation Error]', err);
      // Failsafe: apply client-side translation engine immediately
      const meta = translateProductMetadata(activeProductTitle, activeDescription, activeNotes);
      const localSections = translateChecklistSections(activeSections);
      setActiveProductTitle(meta.title);
      if (meta.description) setActiveDescription(meta.description);
      if (meta.notes) setActiveNotes(meta.notes);
      setActiveSections(localSections);
      setHasUnsavedChanges(true);
      setLastUsedModel('Local Linguistic Engine');
      globalToast.success('Converted to Assamese using offline linguistic engine! Click Save to keep changes.');
    } finally {
      setIsTranslating(false);
    }
  };

  // Save current product checklist
  const handleSaveProduct = async () => {
    if (!activeProductName.trim()) {
      globalToast.error('Product Name is required.');
      return;
    }

    setIsSaving(true);
    try {
      const key = normalizeProductKey(activeProductName);
      const updatedConfig: ProductChecklistConfig = {
        productName: activeProductName.trim(),
        productKey: key,
        title: activeProductTitle.trim() || `Product - ${activeProductName.trim()}`,
        description: activeDescription.trim(),
        defaultBdmName: activeBdmName.trim() || 'ASHIM GOGOI',
        bdmSignature: activeBdmSignature,
        bdmSignatureData: activeBdmSignature,
        notes: activeNotes.trim(),
        sections: activeSections,
        attachments: activeAttachments,
        lastUpdated: new Date().toLocaleDateString('en-GB') + ' ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
      };

      saveProductChecklist(updatedConfig);
      setStore(prev => ({ ...prev, [key]: updatedConfig }));
      setSelectedKey(key);

      if (activeBdmSignature) {
        safeSetItem('COMPANY_BDM_SIGNATURE', activeBdmSignature);
      }
      if (activeBdmName) {
        safeSetItem('COMPANY_BDM_NAME', activeBdmName.trim().toUpperCase());
      }

      setHasUnsavedChanges(false);
      globalToast.success(`Saved checklist & BDM signature for "${activeProductName}" to Central Store!`);
    } catch (err: any) {
      globalToast.error(`Failed to save: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Dedicated Save BDM Signature Option
  const handleSaveBdmSignature = async () => {
    if (!activeProductName.trim()) {
      globalToast.error('Product Name is required.');
      return;
    }

    setIsSavingSig(true);
    try {
      const key = normalizeProductKey(activeProductName);
      const existing = store[key] || getProductChecklist(activeProductName);
      const updatedConfig: ProductChecklistConfig = {
        ...existing,
        productName: activeProductName.trim(),
        productKey: key,
        title: activeProductTitle.trim() || `Product - ${activeProductName.trim()}`,
        defaultBdmName: activeBdmName.trim() || 'ASHIM GOGOI',
        bdmSignature: activeBdmSignature,
        bdmSignatureData: activeBdmSignature,
        sections: activeSections.length > 0 ? activeSections : existing.sections,
        attachments: activeAttachments,
        lastUpdated: new Date().toLocaleDateString('en-GB') + ' ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
      };

      saveProductChecklist(updatedConfig);
      setStore(prev => ({ ...prev, [key]: updatedConfig }));

      if (activeBdmSignature) {
        safeSetItem('COMPANY_BDM_SIGNATURE', activeBdmSignature);
      }
      if (activeBdmName) {
        safeSetItem('COMPANY_BDM_NAME', activeBdmName.trim().toUpperCase());
      }

      setHasUnsavedChanges(false);
      globalToast.success(`Saved BDM signature for "${activeProductName}" to Central Store!`);
    } catch (err: any) {
      globalToast.error(`Failed to save signature: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsSavingSig(false);
    }
  };

  // Signature image upload handler
  const handleSignatureImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      globalToast.error('Please select an image file (PNG, JPG, WEBP, or SVG).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        setActiveBdmSignature(dataUrl);
        setHasUnsavedChanges(true);
        globalToast.success('Signature image selected! Click "Save BDM Signature" to store.');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Canvas drawing handlers
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = ('touches' in e) ? e.touches[0].clientX : e.clientX;
    const clientY = ('touches' in e) ? e.touches[0].clientY : e.clientY;
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    setIsDrawingActive(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawingActive) return;
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = ('touches' in e) ? e.touches[0].clientX : e.clientX;
    const clientY = ('touches' in e) ? e.touches[0].clientY : e.clientY;
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawingActive) return;
    setIsDrawingActive(false);
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx?.closePath();
  };

  const clearCanvas = () => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const acceptDrawnSignature = () => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    setActiveBdmSignature(dataUrl);
    setIsDrawingSig(false);
    setHasUnsavedChanges(true);
    globalToast.success('Drawn signature adopted! Click "Save BDM Signature" to store.');
  };

  // Add new product
  const handleCreateNewProduct = () => {
    if (!newProductName.trim()) return;
    const key = normalizeProductKey(newProductName);
    const initialConfig = getProductChecklist(newProductName.trim());
    saveProductChecklist(initialConfig);
    setStore(prev => ({ ...prev, [key]: initialConfig }));
    setSelectedKey(key);
    setNewProductName('');
    setShowAddProductInput(false);
    globalToast.success(`Added product "${newProductName.trim()}" to Central Store!`);
  };

  // Delete product
  const handleDeleteProduct = (keyToDelete: string) => {
    const config = store[keyToDelete];
    const name = config?.productName || keyToDelete;
    if (!window.confirm(`Are you sure you want to remove the central checklist configuration for "${name}"?`)) {
      return;
    }

    deleteProductChecklist(keyToDelete);
    setStore(prev => {
      const next = { ...prev };
      delete next[keyToDelete];
      return next;
    });

    const remainingKeys = Object.keys(store).filter(k => k !== keyToDelete);
    if (remainingKeys.length > 0) {
      setSelectedKey(remainingKeys[0]);
    }
    globalToast.info(`Removed checklist for "${name}".`);
  };

  // Reset to default
  const handleResetToDefault = () => {
    const defaultTemplate = INITIAL_PRODUCT_CHECKLISTS[selectedKey] || INITIAL_PRODUCT_CHECKLISTS['chocolate drink'];
    if (!window.confirm('Reset this product checklist back to default preset guidelines?')) return;

    setActiveSections(JSON.parse(JSON.stringify(defaultTemplate.sections)));
    setHasUnsavedChanges(true);
    globalToast.info('Checklist sections reset to standard defaults.');
  };

  // Handle file upload (PDF, Word, Image)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    
    // Validate format
    const isPdf = ext === 'pdf';
    const isWord = ext === 'docx' || ext === 'doc';
    const isImage = ['png', 'jpg', 'jpeg', 'webp', 'svg'].includes(ext);

    if (!isPdf && !isWord && !isImage) {
      globalToast.error('Please upload a PDF, Word document (.docx/.doc), or Image file (.png, .jpg, .webp).');
      return;
    }

    setIsUploading(true);
    try {
      // Convert to Base64
      const reader = new FileReader();
      const base64Data: string = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const sizeStr = file.size > 1024 * 1024 
        ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` 
        : `${Math.round(file.size / 1024)} KB`;

      let extractedText = '';

      // If Word or PDF, extract text using server parser
      if (isWord || isPdf) {
        try {
          setIsParsingDoc(true);
          const parseRes = await fetch('/api/parse-checklist-document', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileData: base64Data,
              fileName: file.name,
              fileType: isWord ? 'word' : (isPdf ? 'pdf' : 'image')
            })
          });

          if (parseRes.ok) {
            const parseData = await parseRes.json();
            extractedText = parseData.extractedText || '';
          }
        } catch (pErr) {
          console.warn('[DocUpload] Text extraction notice:', pErr);
        } finally {
          setIsParsingDoc(false);
        }
      }

      const newAttachment: ChecklistDocumentAttachment = {
        id: `doc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        fileName: file.name,
        fileType: isWord ? 'word' : (isPdf ? 'pdf' : 'image'),
        uploadedAt: new Date().toLocaleDateString('en-GB') + ' ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        fileSize: sizeStr,
        fileData: base64Data,
        extractedText
      };

      const updatedAttachments = [newAttachment, ...activeAttachments];
      setActiveAttachments(updatedAttachments);
      setHasUnsavedChanges(true);

      // Auto-prompt to apply extracted text if text was detected
      if (extractedText && extractedText.length > 30) {
        if (window.confirm(`Successfully uploaded "${file.name}"! Would you like to automatically parse and apply its points to the Checklist Guidelines?`)) {
          const parsedSections = parseExtractedTextIntoSections(extractedText);
          setActiveSections(parsedSections);
          globalToast.success(`Parsed ${file.name} into Checklist Guidelines! Click "Save to Central Store" to confirm.`);
        } else {
          globalToast.success(`Attached "${file.name}" to ${activeProductName}.`);
        }
      } else {
        globalToast.success(`Uploaded "${file.name}" successfully.`);
      }
    } catch (err: any) {
      globalToast.error(`Upload failed: ${err?.message || 'File read error'}`);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Remove attachment
  const handleRemoveAttachment = (attId: string) => {
    setActiveAttachments(prev => prev.filter(a => a.id !== attId));
    setHasUnsavedChanges(true);
    globalToast.info('Attachment removed.');
  };

  // Apply extracted text from an existing attachment
  const handleApplyAttachmentText = (att: ChecklistDocumentAttachment) => {
    if (!att.extractedText) {
      globalToast.info('No readable text extracted for this document.');
      return;
    }

    if (window.confirm(`Apply checklist points extracted from "${att.fileName}"? This will update the section criteria below.`)) {
      const parsed = parseExtractedTextIntoSections(att.extractedText);
      setActiveSections(parsed);
      setHasUnsavedChanges(true);
      globalToast.success('Applied document points to checklist sections!');
    }
  };

  // Section items editing
  const handleItemTextChange = (sIdx: number, iIdx: number, val: string) => {
    setActiveSections(prev => {
      const next = [...prev];
      next[sIdx].items[iIdx].text = val;
      return next;
    });
    setHasUnsavedChanges(true);
  };

  const handleItemToggle = (sIdx: number, iIdx: number, checked: boolean) => {
    setActiveSections(prev => {
      const next = [...prev];
      next[sIdx].items[iIdx].checked = checked;
      return next;
    });
    setHasUnsavedChanges(true);
  };

  // Open Add Point Modal with Line Selection option
  const handleOpenAddPoint = (sIdx: number) => {
    const sec = activeSections[sIdx];
    const totalCount = sec?.items?.length || 0;
    setAddPointModal({
      isOpen: true,
      sectionIndex: sIdx,
      sectionTitle: sec?.title || `Section ${sIdx + 1}`,
      totalPoints: totalCount,
      text: '',
      targetLine: totalCount + 1, // Default to end of section (Line N+1)
      checked: true,
    });
  };

  // Open Remove Point Modal with Line Selection option
  const handleOpenRemovePoint = (sIdx: number) => {
    const sec = activeSections[sIdx];
    const totalCount = sec?.items?.length || 0;
    if (totalCount === 0) {
      globalToast.info('This section does not have any points to remove.');
      return;
    }
    setRemovePointModal({
      isOpen: true,
      sectionIndex: sIdx,
      sectionTitle: sec?.title || `Section ${sIdx + 1}`,
      targetLine: 1, // Default to Line 1
    });
  };

  // Confirm and insert point at chosen line
  const handleConfirmAddPoint = () => {
    if (!addPointModal || !addPointModal.text.trim()) return;
    const { sectionIndex: sIdx, text, targetLine, checked } = addPointModal;

    setActiveSections(prev => {
      const next = [...prev];
      const section = { ...next[sIdx], items: [...next[sIdx].items] };
      const items = section.items;

      // 1-based line number to 0-based insert index
      const insertIndex = Math.max(0, Math.min(items.length, targetLine - 1));

      const newItem: ChecklistItem = {
        id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        text: text.trim(),
        checked: checked,
      };

      items.splice(insertIndex, 0, newItem);
      next[sIdx] = section;
      return next;
    });

    setHasUnsavedChanges(true);
    setAddPointModal(null);
  };

  // Confirm and remove point at chosen line
  const handleConfirmRemovePoint = () => {
    if (!removePointModal) return;
    const { sectionIndex: sIdx, targetLine } = removePointModal;
    const sec = activeSections[sIdx];
    if (!sec || !sec.items || sec.items.length === 0) {
      setRemovePointModal(null);
      return;
    }
    const lineIdx = Math.max(0, Math.min(sec.items.length - 1, targetLine - 1));
    const removedText = sec.items[lineIdx]?.text || '';

    setActiveSections(prev => {
      const next = [...prev];
      const section = { ...next[sIdx], items: [...next[sIdx].items] };
      section.items.splice(lineIdx, 1);
      next[sIdx] = section;
      return next;
    });

    setHasUnsavedChanges(true);
    globalToast.info(`Removed Line #${lineIdx + 1}${removedText ? `: "${removedText.slice(0, 30)}${removedText.length > 30 ? '...' : ''}"` : ''}`);

    const remainingCount = sec.items.length - 1;
    if (remainingCount <= 0) {
      setRemovePointModal(null);
    } else {
      setRemovePointModal(prev => prev ? {
        ...prev,
        targetLine: Math.min(prev.targetLine, remainingCount)
      } : null);
    }
  };

  // Move item up or down by line
  const handleMoveItem = (sIdx: number, fromIdx: number, direction: 'up' | 'down') => {
    const toIdx = direction === 'up' ? fromIdx - 1 : fromIdx + 1;
    setActiveSections(prev => {
      const next = [...prev];
      const section = { ...next[sIdx], items: [...next[sIdx].items] };
      if (toIdx < 0 || toIdx >= section.items.length) return prev;
      const [moved] = section.items.splice(fromIdx, 1);
      section.items.splice(toIdx, 0, moved);
      next[sIdx] = section;
      return next;
    });
    setHasUnsavedChanges(true);
  };

  const handleDeleteItem = (sIdx: number, iIdx: number) => {
    const sec = activeSections[sIdx];
    const itemText = sec?.items[iIdx]?.text || '';
    setActiveSections(prev => {
      const next = [...prev];
      const section = { ...next[sIdx], items: [...next[sIdx].items] };
      section.items.splice(iIdx, 1);
      next[sIdx] = section;
      return next;
    });
    setHasUnsavedChanges(true);
    globalToast.info(`Removed point #${iIdx + 1}${itemText ? `: "${itemText.slice(0, 30)}${itemText.length > 30 ? '...' : ''}"` : ''}`);
  };

  // Open Edit Point Modal
  const handleOpenEditPoint = (sIdx: number, iIdx: number) => {
    const sec = activeSections[sIdx];
    const item = sec?.items[iIdx];
    if (!item) return;

    setEditPointModal({
      isOpen: true,
      sectionIndex: sIdx,
      itemIndex: iIdx,
      sectionTitle: sec.title || `Section ${sIdx + 1}`,
      originalText: item.text,
      text: item.text,
      targetLine: iIdx + 1,
      targetSectionIndex: sIdx,
      checked: item.checked ?? true,
    });
  };

  // Confirm and save edited point
  const handleConfirmEditPoint = () => {
    if (!editPointModal) return;
    const { sectionIndex: sIdx, itemIndex: iIdx, text, targetLine, targetSectionIndex: targetSIdx, checked } = editPointModal;

    if (!text.trim()) {
      globalToast.error('Point description cannot be empty.');
      return;
    }

    setActiveSections(prev => {
      const next = [...prev];
      if (sIdx === targetSIdx) {
        const section = { ...next[sIdx], items: [...next[sIdx].items] };
        const items = section.items;
        const [existingItem] = items.splice(iIdx, 1);
        if (!existingItem) return prev;

        const updatedItem: ChecklistItem = {
          ...existingItem,
          text: text.trim(),
          checked: checked,
        };

        const insertIndex = Math.max(0, Math.min(items.length, targetLine - 1));
        items.splice(insertIndex, 0, updatedItem);
        next[sIdx] = section;
        return next;
      } else {
        const sourceSection = { ...next[sIdx], items: [...next[sIdx].items] };
        const [existingItem] = sourceSection.items.splice(iIdx, 1);
        if (!existingItem) return prev;
        next[sIdx] = sourceSection;

        const targetSection = { ...next[targetSIdx], items: [...next[targetSIdx].items] };
        const updatedItem: ChecklistItem = {
          ...existingItem,
          text: text.trim(),
          checked: checked,
        };

        const insertIndex = Math.max(0, Math.min(targetSection.items.length, targetLine - 1));
        targetSection.items.splice(insertIndex, 0, updatedItem);
        next[targetSIdx] = targetSection;
        return next;
      }
    });

    setHasUnsavedChanges(true);
    globalToast.success(`Updated point at Line #${targetLine}`);
    setEditPointModal(null);
  };

  // Generate Sample PDF for this product
  const handleDownloadSamplePdf = async () => {
    setIsGeneratingSamplePdf(true);
    try {
      await generateInfluencerChecklistPDF({
        productTitle: activeProductTitle || `Product - ${activeProductName}`,
        influencerName: 'Sample Creator',
        date: new Date().toLocaleDateString('en-GB'),
        bdmName: activeBdmName,
        bdmSignatureBase64: activeBdmSignature,
        videoNo: 'SAMPLE-01',
        fileName: 'Checklist-Sample.pdf',
        sections: activeSections
      });
      globalToast.success(`Downloaded sample Checklist PDF for ${activeProductName}!`);
    } catch (err: any) {
      console.error('[Download Sample PDF Error]', err);
      globalToast.error(`PDF generation failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsGeneratingSamplePdf(false);
    }
  };

  // Generate Influencer Checklist PDF for this product
  // As requested:
  // - Do not show Video id, Influencer, Date, BDM details, and signature option
  // - At the top Show checklist generate date and time
  // - Other detail to be same as sample button
  // - Name the output pdf file as Checklist-(PRODUCT NAME)
  // - Mandatory: All checklist boxes in the output must be completely blank
  const handleDownloadInfluencerChecklistPdf = async () => {
    setIsGeneratingInfluencerPdf(true);
    try {
      const rawProdName = (activeProductName || selectedKey || 'Product').trim();
      const safeProdName = rawProdName.replace(/[/\\?%*:|"<>]/g, '_').trim();
      const outFileName = `Checklist-${safeProdName}.pdf`;

      // Guarantee that all checklist boxes are completely blank for the Influencer Checklist
      const blankSections: ChecklistSection[] = (activeSections || []).map(section => ({
        ...section,
        items: (section.items || []).map(item => ({
          ...item,
          checked: false
        }))
      }));

      await generateInfluencerChecklistPDF({
        productTitle: activeProductTitle || `Product - ${activeProductName}`,
        fileName: outFileName,
        sections: blankSections,
        hideMetadataAndSignature: true,
        showGeneratedDateTime: true,
        allCheckboxesBlank: true
      });
      globalToast.success(`Downloaded Influencer Checklist: ${outFileName}!`);
    } catch (err: any) {
      console.error('[Download Influencer Checklist Error]', err);
      globalToast.error(`Influencer Checklist PDF failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsGeneratingInfluencerPdf(false);
    }
  };

  // Apply to active task if opened from bill payment modal
  const handleApplyToActiveTask = () => {
    if (onApplyToActiveTask) {
      onApplyToActiveTask(
        activeSections, 
        activeProductTitle || `Product - ${activeProductName}`,
        activeBdmName,
        activeBdmSignature
      );
      globalToast.success(`Applied "${activeProductName}" checklist & BDM signature to current task!`);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-5 font-sans backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[94vh] border border-slate-200 flex flex-col overflow-hidden">
        
        {/* Top Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200 bg-gradient-to-r from-emerald-50 via-teal-50/50 to-white sticky top-0 z-10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shadow-sm">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 tracking-tight">
                  Central Product Checklist Store
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-mono font-bold">
                  {allProductKeys.length} Products Configured
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Centralized store for product-specific guidelines, CTAs, prohibitions, and uploaded PDF/Word/Image reference docs
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              disabled={isDriveUploading || isDriveSyncing}
              onClick={handleUploadToGoogleDrive}
              className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
              title="Upload entire product checklist store to Google Drive"
            >
              <CloudUpload className="w-3.5 h-3.5" />
              <span>{isDriveUploading ? 'Uploading...' : 'Upload to Google Drive'}</span>
            </button>
            <button
              disabled={isDriveUploading || isDriveSyncing}
              onClick={handleSynchronizeFromGoogleDrive}
              className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
              title="Synchronize product checklist store from Google Drive"
            >
              <CloudDownload className="w-3.5 h-3.5" />
              <span>{isDriveSyncing ? 'Syncing...' : 'Synchronize'}</span>
            </button>
            <button
              onClick={() => setShowAddProductInput(prev => !prev)}
              className="px-2.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Product</span>
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition cursor-pointer"
              title="Close Store"
            >
              ✕
            </button>
          </div>
        </div>

        {/* New Product Inline Bar */}
        {showAddProductInput && (
          <div className="p-3 bg-emerald-50/70 border-b border-emerald-200/80 flex items-center gap-2 shrink-0 animate-in slide-in-from-top-2">
            <Package className="w-4 h-4 text-emerald-600 shrink-0" />
            <input
              type="text"
              placeholder="Enter new product name (e.g. Peanut Butter, Multivitamin Tabs)..."
              value={newProductName}
              onChange={e => setNewProductName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateNewProduct()}
              className="flex-1 text-xs px-3 py-1.5 bg-white border border-emerald-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 font-semibold"
              autoFocus
            />
            <button
              onClick={handleCreateNewProduct}
              disabled={!newProductName.trim()}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition cursor-pointer"
            >
              Create Product Preset
            </button>
            <button
              onClick={() => setShowAddProductInput(false)}
              className="px-2 py-1.5 text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Modal Main Body (Two-Pane Split) */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden text-xs bg-slate-50/50">
          
          {/* Left Pane: Product Catalog List */}
          <div className="w-full md:w-64 border-r border-slate-200 bg-white flex flex-col shrink-0">
            {/* Search Bar */}
            <div className="p-3 border-b border-slate-100">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search products..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none transition"
                />
              </div>
            </div>

            {/* Products List */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-1.5 space-y-1">
              {filteredProducts.map(item => {
                const isSelected = item.key === selectedKey;
                const conf = store[item.key];
                const totalItems = conf?.sections?.reduce((acc, s) => acc + (s.items?.length || 0), 0) || 0;
                const docCount = conf?.attachments?.length || 0;

                return (
                  <div
                    key={item.key}
                    onClick={() => {
                      if (hasUnsavedChanges) {
                        if (!window.confirm('You have unsaved edits for this product. Discard and switch?')) return;
                      }
                      setSelectedKey(item.key);
                    }}
                    className={`p-2.5 rounded-xl cursor-pointer transition flex items-center justify-between gap-2 select-none ${
                      isSelected 
                        ? 'bg-emerald-50/80 border border-emerald-300/80 shadow-3xs text-emerald-950 font-bold' 
                        : 'hover:bg-slate-50 border border-transparent text-slate-700 font-medium'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <Package className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-emerald-600' : 'text-slate-400'}`} />
                        <span className="truncate text-xs font-semibold">{item.name}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400">
                        <span>{totalItems} points</span>
                        {docCount > 0 && (
                          <span className="px-1.5 py-0.2 bg-teal-100 text-teal-800 font-bold rounded">
                            {docCount} docs
                          </span>
                        )}
                      </div>
                    </div>
                    {isSelected && (
                      <div className="w-1.5 h-4 bg-emerald-500 rounded-full shrink-0"></div>
                    )}
                  </div>
                );
              })}

              {filteredProducts.length === 0 && (
                <div className="p-6 text-center text-slate-400 italic">
                  No products found.
                </div>
              )}
            </div>
          </div>

          {/* Right Pane: Selected Product Checklist Manager */}
          <div className="flex-1 flex flex-col overflow-y-auto p-4 sm:p-6 space-y-5 bg-white">
            
            {/* Product Meta Header Card */}
            <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200/90 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-4 bg-emerald-500 rounded-full"></div>
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Product Configuration
                  </h4>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDeleteProduct(selectedKey)}
                    className="text-[10px] font-bold text-rose-600 hover:text-rose-700 hover:underline flex items-center gap-1 cursor-pointer"
                    title="Delete product configuration"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Delete Product</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Product Display Name</label>
                  <input
                    type="text"
                    value={activeProductName}
                    onChange={e => { setActiveProductName(e.target.value); setHasUnsavedChanges(true); }}
                    className="w-full text-xs font-bold bg-white border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500 outline-none"
                    placeholder="e.g. Chocolate Drink"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Document Title Header</label>
                  <input
                    type="text"
                    value={activeProductTitle}
                    onChange={e => { setActiveProductTitle(e.target.value); setHasUnsavedChanges(true); }}
                    className="w-full text-xs font-bold bg-white border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500 outline-none"
                    placeholder="e.g. Product - Chocolate Drink"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Default BDM / Approacher</label>
                  <input
                    type="text"
                    value={activeBdmName}
                    onChange={e => { setActiveBdmName(e.target.value.toUpperCase()); setHasUnsavedChanges(true); }}
                    className="w-full text-xs font-bold uppercase bg-white border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Description / Scope</label>
                  <input
                    type="text"
                    value={activeDescription}
                    onChange={e => { setActiveDescription(e.target.value); setHasUnsavedChanges(true); }}
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500 outline-none"
                    placeholder="Brief description of this product promotion"
                  />
                </div>
              </div>
            </div>

            {/* BDM Signature Save Option Card */}
            <div className="bg-gradient-to-r from-indigo-50/70 via-slate-50/70 to-emerald-50/70 p-4 rounded-xl border border-indigo-200/80 space-y-3 shadow-3xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-indigo-150/80 pb-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-3xs">
                    <PenTool className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                      <span>BDM Signature Save Option</span>
                      {activeBdmSignature ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-300 flex items-center gap-1">
                          <Check className="w-2.5 h-2.5" />
                          <span>Custom Signature Stored</span>
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-slate-200/70 text-slate-700 text-[10px] font-medium border border-slate-300">
                          Default Cursive Script: "A Gogoi"
                        </span>
                      )}
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Store authorized BDM signature for <span className="font-bold text-slate-700">{activeProductName}</span>. Automatically applied to generated Influencer Checklist PDFs.
                    </p>
                  </div>
                </div>

                {/* Direct Action Buttons */}
                <div className="flex items-center gap-2 shrink-0">
                  <input
                    ref={sigFileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleSignatureImageUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => sigFileInputRef.current?.click()}
                    className="px-2.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-3xs cursor-pointer"
                    title="Upload signature image file (PNG/JPG/SVG)"
                  >
                    <Upload className="w-3.5 h-3.5 text-slate-500" />
                    <span>Upload Image</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsDrawingSig(prev => !prev)}
                    className={`px-2.5 py-1.5 border rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-3xs cursor-pointer ${
                      isDrawingSig
                        ? 'bg-indigo-100 border-indigo-400 text-indigo-900'
                        : 'bg-white hover:bg-indigo-50 border-indigo-200 text-indigo-700'
                    }`}
                    title="Draw signature using mouse, finger, or stylus"
                  >
                    <PenTool className="w-3.5 h-3.5" />
                    <span>{isDrawingSig ? 'Close Pad' : 'Draw Signature'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveBdmSignature}
                    disabled={isSavingSig}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-xs cursor-pointer"
                    title="Save this signature directly to the Central Product Checklist Store"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{isSavingSig ? 'Saving...' : 'Save BDM Signature'}</span>
                  </button>
                </div>
              </div>

              {/* Drawing Pad (when active) */}
              {isDrawingSig && (
                <div className="p-3 bg-white border border-indigo-200 rounded-xl space-y-2 shadow-inner">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                      <PenTool className="w-3 h-3 text-indigo-600" />
                      Sign below with your mouse, finger, or pen:
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={clearCanvas}
                        className="px-2 py-0.5 text-[11px] text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded font-medium cursor-pointer"
                      >
                        Clear
                      </button>
                      <button
                        type="button"
                        onClick={acceptDrawnSignature}
                        className="px-2.5 py-0.5 text-[11px] bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded shadow-3xs cursor-pointer"
                      >
                        Adopt Drawn Signature
                      </button>
                    </div>
                  </div>
                  <canvas
                    ref={sigCanvasRef}
                    width={500}
                    height={120}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                    className="w-full h-28 border border-dashed border-indigo-300 rounded-lg bg-slate-50/50 cursor-crosshair touch-none"
                  />
                </div>
              )}

              {/* Signature Visual Preview Row */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200">
                <div className="flex items-center gap-3">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">
                    Active Preview:
                  </div>
                  {activeBdmSignature ? (
                    <div className="h-12 px-3 py-1 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-center">
                      <img 
                        src={activeBdmSignature} 
                        alt="BDM Signature Preview" 
                        className="h-10 max-w-[200px] object-contain" 
                      />
                    </div>
                  ) : (
                    <div className="h-12 px-4 py-1 bg-slate-50 border border-dashed border-slate-300 rounded-lg flex items-center justify-center">
                      <span className="text-xs text-slate-400 italic">
                        No signature attached
                      </span>
                    </div>
                  )}
                  <div className="text-[11px] text-slate-500">
                    {activeBdmSignature ? (
                      <span>Custom graphic signature attached for <strong className="text-slate-800">{activeBdmName}</strong></span>
                    ) : (
                      <span>No BDM signature stored for this product in Central Store</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {activeBdmSignature && (
                    <button
                      type="button"
                      onClick={() => { 
                        setActiveBdmSignature(''); 
                        setHasUnsavedChanges(true); 
                        // Also clear from store config for this product if already stored
                        const key = normalizeProductKey(activeProductName);
                        const existing = store[key] || getProductChecklist(activeProductName);
                        const updated = { ...existing, bdmSignature: '', bdmSignatureData: '' };
                        saveProductChecklist(updated);
                        setStore(prev => ({ ...prev, [key]: updated }));
                        globalToast.info(`Custom BDM signature removed for "${activeProductName}".`);
                      }}
                      className="px-2 py-1 text-[11px] text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded font-bold cursor-pointer transition"
                    >
                      Remove Custom
                    </button>
                  )}
                  {safeGetItem('COMPANY_BDM_SIGNATURE') && safeGetItem('COMPANY_BDM_SIGNATURE') !== activeBdmSignature && (
                    <button
                      type="button"
                      onClick={() => { 
                        setActiveBdmSignature(safeGetItem('COMPANY_BDM_SIGNATURE') || ''); 
                        setHasUnsavedChanges(true); 
                        globalToast.info('Filled with Company Default BDM Signature.');
                      }}
                      className="px-2 py-1 text-[11px] text-indigo-700 hover:bg-indigo-50 border border-indigo-200 rounded font-semibold cursor-pointer transition"
                      title="Use the saved company-wide BDM signature"
                    >
                      Use Stored Company Default
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Document Upload & Reference Files Hub */}
            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/40 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/60 pb-2">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <Upload className="w-3.5 h-3.5 text-teal-600" />
                    Upload & Update Checklist Data (PDF, Word, Image)
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Attach official brand guidelines in .pdf, .docx, or image formats. Extracted text can be parsed directly into checklist criteria.
                  </p>
                </div>
                
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.docx,.doc,image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading || isParsingDoc}
                    className="px-3 py-1.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{isUploading ? 'Uploading...' : isParsingDoc ? 'Parsing Text...' : 'Upload File (PDF / Word / Image)'}</span>
                  </button>
                </div>
              </div>

              {/* Attachments List */}
              {activeAttachments.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  {activeAttachments.map(att => (
                    <div 
                      key={att.id}
                      className="p-2.5 bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-3 shadow-3xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {att.fileType === 'pdf' && (
                          <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center font-bold text-[10px] shrink-0">
                            PDF
                          </div>
                        )}
                        {att.fileType === 'word' && (
                          <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[10px] shrink-0">
                            DOC
                          </div>
                        )}
                        {att.fileType === 'image' && (
                          <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 overflow-hidden">
                            {att.fileData.startsWith('data:image') ? (
                              <img src={att.fileData} alt="Thumb" className="w-full h-full object-cover" />
                            ) : (
                              <ImageIcon className="w-4 h-4" />
                            )}
                          </div>
                        )}

                        <div className="min-w-0">
                          <p className="font-bold text-xs text-slate-800 truncate" title={att.fileName}>
                            {att.fileName}
                          </p>
                          <p className="text-[10px] text-slate-400 font-medium">
                            {att.fileSize || ''} • {att.uploadedAt}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {/* View Preview */}
                        <button
                          onClick={() => setPreviewAttachment(att)}
                          className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition cursor-pointer"
                          title="Preview document"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        {/* Parse & Apply Text */}
                        {att.extractedText && (
                          <button
                            onClick={() => handleApplyAttachmentText(att)}
                            className="p-1.5 text-teal-600 hover:text-teal-800 hover:bg-teal-50 rounded-md transition cursor-pointer"
                            title="Auto-Parse text into Checklist Guidelines"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Download Original */}
                        <a
                          href={att.fileData}
                          download={att.fileName}
                          className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition cursor-pointer"
                          title="Download file"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>

                        {/* Delete Attachment */}
                        <button
                          onClick={() => handleRemoveAttachment(att.id)}
                          className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-md transition cursor-pointer"
                          title="Remove file"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 border border-dashed border-slate-200 rounded-xl bg-white text-center text-slate-400 text-xs">
                  No reference documents uploaded for this product yet. Click the button above to attach brand guides (.pdf, .docx, images).
                </div>
              )}
            </div>

            {/* Checklist Guidelines & Sections Editor */}
            <div className="space-y-4">
              <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 border-b border-slate-200 pb-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                      <CheckSquare className="w-3.5 h-3.5 text-emerald-600" />
                      Checklist Guidelines & Criteria ({activeProductName})
                    </h4>
                    {lastUsedModel && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200 shadow-3xs">
                        <Sparkles className="w-3 h-3 text-amber-600" />
                        Translated with {TRANSLATOR_AI_MODELS.find(m => m.id === lastUsedModel)?.name || lastUsedModel}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Configure the exact bullet points, benefits, and instructions for creators for this specific product
                  </p>
                </div>

                <div className="flex items-center flex-wrap gap-2">
                  <button
                    onClick={handleDownloadInfluencerChecklistPdf}
                    disabled={isGeneratingInfluencerPdf}
                    className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 text-indigo-700 border border-indigo-200 rounded-md text-[11px] font-bold flex items-center gap-1 shadow-3xs transition cursor-pointer"
                    title={`Generate and download Influencer Checklist PDF for ${activeProductName}`}
                  >
                    <FileCheck className="w-3.5 h-3.5 text-indigo-600" />
                    <span>{isGeneratingInfluencerPdf ? 'Generating...' : 'Influencer Checklist'}</span>
                  </button>

                  {/* Translator AI Model Selection & Convert Action Cluster */}
                  <div className="inline-flex items-center rounded-lg border border-amber-300 bg-amber-50/80 p-1 shadow-3xs">
                    {/* Model Dropdown Selector */}
                    <div className="flex items-center px-1.5 py-0.5 text-amber-900 border-r border-amber-200/90 gap-1.5">
                      <Bot className="w-4 h-4 text-amber-700 shrink-0" />
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] font-black text-amber-800 uppercase tracking-wider leading-none">Translator AI Model</span>
                          <button
                            type="button"
                            onClick={() => setShowModelInfoModal(true)}
                            className="text-amber-600 hover:text-amber-900 p-0.5 transition cursor-pointer"
                            title="View AI Model specifications and details"
                          >
                            <Info className="w-2.5 h-2.5" />
                          </button>
                        </div>
                        <select
                          value={selectedTranslatorModel}
                          onChange={(e) => {
                            const newModel = e.target.value;
                            setSelectedTranslatorModel(newModel);
                            safeSetItem('central_checklist_translator_model', newModel);
                            const opt = TRANSLATOR_AI_MODELS.find(m => m.id === newModel);
                            globalToast.info(`Translator AI Model set to ${opt?.name || newModel}`);
                          }}
                          className="bg-transparent text-[11px] font-black text-amber-950 focus:outline-none cursor-pointer pr-1 leading-tight border-none"
                          title="Select which Gemini AI model performs Assamese translation"
                        >
                          {TRANSLATOR_AI_MODELS.map(m => (
                            <option key={m.id} value={m.id} className="text-slate-900 bg-white font-medium">
                              {m.name} ({m.tag})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Convert Button */}
                    <button
                      onClick={handleTranslateToAssamese}
                      disabled={isTranslating}
                      className="ml-1 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 disabled:opacity-50 text-white rounded-md text-[11px] font-bold flex items-center gap-1.5 shadow-3xs transition cursor-pointer"
                      title={`Translate checklist to Assamese using ${TRANSLATOR_AI_MODELS.find(m => m.id === selectedTranslatorModel)?.name || selectedTranslatorModel}`}
                    >
                      <Languages className="w-3.5 h-3.5" />
                      <span>{isTranslating ? 'অনুবাদ হৈ আছে...' : 'Convert to Assamese (অসমীয়া)'}</span>
                    </button>
                  </div>

                  <button
                    onClick={handleResetToDefault}
                    className="px-2 py-1.5 text-slate-500 hover:text-slate-700 border border-slate-200 rounded-md text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition"
                    title="Reset to default preset"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset Defaults</span>
                  </button>
                </div>
              </div>

              {/* Sections List */}
              <div className="space-y-3.5">
                {activeSections.map((sec, sIdx) => (
                  <div key={sec.id} className="border border-slate-200 rounded-xl p-3.5 bg-white space-y-3 shadow-3xs">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <div className="flex items-center gap-2 font-bold text-slate-900 text-xs">
                        {sec.iconType === 'check' && <span className="p-1 bg-emerald-100 text-emerald-700 rounded-md text-[10px]">✅</span>}
                        {sec.iconType === 'target' && <span className="p-1 bg-rose-100 text-rose-700 rounded-md text-[10px]">🎯</span>}
                        {sec.iconType === 'video' && <span className="p-1 bg-slate-100 text-slate-700 rounded-md text-[10px]">🎥</span>}
                        {sec.iconType === 'prohibited' && <span className="p-1 bg-red-100 text-red-700 rounded-md text-[10px]">🚫</span>}
                        {sec.iconType === 'posting' && <span className="p-1 bg-indigo-100 text-indigo-700 rounded-md text-[10px]">📱</span>}
                        <span>{sec.title}</span>
                        {sec.subtitle && (
                          <span className="text-[10px] text-slate-400 font-normal italic">
                            ({sec.subtitle})
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleOpenAddPoint(sIdx)}
                          className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/80 rounded-md text-[10px] font-bold flex items-center gap-1 transition cursor-pointer shadow-3xs"
                          title="Add point to a specific line in this section"
                        >
                          <Plus className="w-3 h-3 text-emerald-700" />
                          <span>Add Point</span>
                        </button>

                        <button
                          onClick={() => handleOpenRemovePoint(sIdx)}
                          disabled={sec.items.length === 0}
                          className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 disabled:opacity-40 disabled:hover:bg-rose-50 text-rose-800 border border-rose-200/80 rounded-md text-[10px] font-bold flex items-center gap-1 transition cursor-pointer shadow-3xs"
                          title="Remove a point / choose which line to remove from this section"
                        >
                          <Trash2 className="w-3 h-3 text-rose-700" />
                          <span>Remove Point</span>
                        </button>
                      </div>
                    </div>

                    {/* Section items */}
                    <div className="space-y-1.5">
                      {sec.items.map((item, iIdx) => (
                        <div key={item.id} className="flex items-center gap-2 group/item hover:bg-slate-50/80 p-1 rounded-lg transition border border-transparent hover:border-slate-100">
                          {/* Line Number Badge */}
                          <span 
                            className="w-6 h-5 rounded flex items-center justify-center bg-slate-100 text-slate-500 font-mono text-[10px] font-bold shrink-0 border border-slate-200/70"
                            title={`Line ${iIdx + 1}`}
                          >
                            #{iIdx + 1}
                          </span>
                          <input
                            type="checkbox"
                            checked={item.checked}
                            onChange={e => handleItemToggle(sIdx, iIdx, e.target.checked)}
                            className="rounded text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5 cursor-pointer shrink-0"
                            title="Default checked in PDF"
                          />
                          <input
                            type="text"
                            value={item.text}
                            onChange={e => handleItemTextChange(sIdx, iIdx, e.target.value)}
                            className="flex-1 text-xs border border-transparent hover:border-slate-200 focus:border-emerald-500 rounded px-2 py-1 outline-none text-slate-800 transition bg-transparent focus:bg-white"
                          />
                          <div className="flex items-center gap-1 shrink-0">
                            {/* Reorder arrows */}
                            <div className="flex items-center opacity-40 group-hover/item:opacity-100 transition">
                              <button
                                onClick={() => handleMoveItem(sIdx, iIdx, 'up')}
                                disabled={iIdx === 0}
                                className="text-slate-500 hover:text-slate-800 disabled:opacity-20 p-1 transition cursor-pointer hover:bg-slate-100 rounded"
                                title={`Move up to Line ${iIdx}`}
                              >
                                <ArrowUp className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => handleMoveItem(sIdx, iIdx, 'down')}
                                disabled={iIdx === sec.items.length - 1}
                                className="text-slate-500 hover:text-slate-800 disabled:opacity-20 p-1 transition cursor-pointer hover:bg-slate-100 rounded"
                                title={`Move down to Line ${iIdx + 2}`}
                              >
                                <ArrowDown className="w-3 h-3" />
                              </button>
                            </div>

                            {/* Edit Point action */}
                            <button
                              type="button"
                              onClick={() => handleOpenEditPoint(sIdx, iIdx)}
                              className="px-2 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200/80 rounded transition cursor-pointer flex items-center gap-1 text-[10px] font-bold shadow-3xs"
                              title={`Edit point (Line ${iIdx + 1})`}
                            >
                              <Pencil className="w-3 h-3 text-blue-600" />
                              <span>Edit</span>
                            </button>

                            {/* Remove Point action - clear & accessible */}
                            <button
                              type="button"
                              onClick={() => handleDeleteItem(sIdx, iIdx)}
                              className="px-1.5 py-0.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer flex items-center gap-1 text-[10px] font-medium border border-transparent hover:border-rose-200"
                              title={`Remove point (Line ${iIdx + 1})`}
                            >
                              <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                              <span className="hidden sm:inline text-[10px] text-rose-600 font-semibold">Remove</span>
                            </button>
                          </div>
                        </div>
                      ))}

                      {sec.items.length === 0 && (
                        <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-dashed border-slate-200">
                          <p className="text-[11px] text-slate-400 italic">No points in this section.</p>
                          <button
                            onClick={() => handleOpenAddPoint(sIdx)}
                            className="text-[11px] text-emerald-700 hover:text-emerald-800 font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Plus className="w-3 h-3" /> Add Point (Line 1)
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Modal Bottom Sticky Actions */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3 sticky bottom-0 z-10 shrink-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            {hasUnsavedChanges ? (
              <span className="flex items-center gap-1.5 text-amber-600 font-bold">
                <AlertCircle className="w-3.5 h-3.5" />
                Unsaved modifications pending
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
                <Check className="w-3.5 h-3.5" />
                All changes saved to Central Store
              </span>
            )}
            {lastDriveSyncTime && (
              <span className="text-[11px] text-blue-600 font-medium ml-2">
                • Drive Synced: {lastDriveSyncTime}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              disabled={isDriveUploading || isDriveSyncing}
              onClick={handleUploadToGoogleDrive}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-3xs transition cursor-pointer"
              title="Upload entire product checklist store to Google Drive"
            >
              <CloudUpload className="w-3.5 h-3.5" />
              <span>{isDriveUploading ? 'Uploading...' : 'Upload to Google Drive'}</span>
            </button>

            <button
              disabled={isDriveUploading || isDriveSyncing}
              onClick={handleSynchronizeFromGoogleDrive}
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-3xs transition cursor-pointer"
              title="Synchronize product checklist store from Google Drive"
            >
              <CloudDownload className="w-3.5 h-3.5" />
              <span>{isDriveSyncing ? 'Syncing...' : 'Synchronize'}</span>
            </button>

            <button
              onClick={handleDownloadSamplePdf}
              disabled={isGeneratingSamplePdf}
              className="px-3 py-2 bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-50 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-3xs transition cursor-pointer"
              title="Download preview PDF"
            >
              <FileDown className="w-3.5 h-3.5 text-slate-500" />
              <span>{isGeneratingSamplePdf ? 'Generating...' : 'Sample PDF'}</span>
            </button>

            <button
              onClick={handleDownloadInfluencerChecklistPdf}
              disabled={isGeneratingInfluencerPdf}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
              title={`Download Influencer Checklist PDF for ${activeProductName} (Checklist-${activeProductName}.pdf)`}
            >
              <FileCheck className="w-3.5 h-3.5" />
              <span>{isGeneratingInfluencerPdf ? 'Generating...' : 'Influencer Checklist'}</span>
            </button>

            {onApplyToActiveTask && (
              <button
                onClick={handleApplyToActiveTask}
                className="px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold shadow-xs flex items-center gap-1.5 transition cursor-pointer"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>Apply to Task</span>
              </button>
            )}

            <button
              onClick={handleSaveProduct}
              disabled={isSaving}
              className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg text-xs font-bold shadow-md flex items-center gap-1.5 transition cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Saving...' : 'Save to Central Store'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Attachment Preview Modal */}
      {previewAttachment && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 p-4 font-sans backdrop-blur-md">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden shadow-2xl border border-slate-300">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-teal-600" />
                <span className="font-bold text-xs text-slate-900 truncate">{previewAttachment.fileName}</span>
              </div>
              <button
                onClick={() => setPreviewAttachment(null)}
                className="w-7 h-7 rounded-full hover:bg-slate-200 text-slate-500 flex items-center justify-center text-xs font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-4 flex-1 overflow-y-auto text-xs bg-slate-100 flex items-center justify-center">
              {previewAttachment.fileType === 'image' ? (
                <img src={previewAttachment.fileData} alt="Preview" className="max-h-[60vh] max-w-full rounded-lg shadow-sm object-contain" />
              ) : previewAttachment.fileType === 'pdf' ? (
                <iframe src={previewAttachment.fileData} title="PDF Preview" className="w-full h-[60vh] rounded-lg border bg-white" />
              ) : (
                <div className="w-full h-full p-4 bg-white rounded-lg border font-mono text-xs whitespace-pre-wrap overflow-y-auto max-h-[60vh]">
                  {previewAttachment.extractedText || 'Word Document uploaded. Click download or apply parsed text.'}
                </div>
              )}
            </div>

            <div className="p-3 border-t border-slate-200 bg-white flex justify-end gap-2">
              <a
                href={previewAttachment.fileData}
                download={previewAttachment.fileName}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg font-bold text-xs flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" /> Download
              </a>
              <button
                onClick={() => setPreviewAttachment(null)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-bold text-xs"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Point with Line Selection Modal */}
      {addPointModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 p-4 font-sans backdrop-blur-md animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-200 flex flex-col animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-emerald-50 via-teal-50/50 to-white">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-3xs">
                  <ListOrdered className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">Add Checklist Point</h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Section: <span className="text-emerald-700 font-bold">{addPointModal.sectionTitle}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setAddPointModal(null)}
                className="w-7 h-7 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center text-xs font-bold transition cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4 text-xs">
              {/* Point Text */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Point Requirement / Description <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={addPointModal.text}
                  onChange={e => setAddPointModal(prev => prev ? { ...prev, text: e.target.value } : null)}
                  onKeyDown={e => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                      e.preventDefault();
                      handleConfirmAddPoint();
                    }
                  }}
                  rows={3}
                  placeholder="Enter checklist requirement (e.g., 'Show clear 3-second product close-up', Assamese: 'পণ্যৰ সুবিধাৰ বিষয়ে কওক', etc.)..."
                  className="w-full text-xs border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-800 transition"
                  autoFocus
                />
                <p className="text-[10px] text-slate-400 mt-1">Tip: Press Ctrl+Enter or Cmd+Enter to quickly save</p>
              </div>

              {/* Line Position Selection (Option to choose which line the point will add) */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <span>Which line to add to?</span>
                    <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                      Line #{addPointModal.targetLine}
                    </span>
                  </label>
                  <span className="text-[11px] text-slate-500 font-medium">
                    Current lines: {addPointModal.totalPoints}
                  </span>
                </div>

                {/* Dropdown with descriptions */}
                <select
                  value={addPointModal.targetLine}
                  onChange={e => {
                    const val = Number(e.target.value);
                    setAddPointModal(prev => prev ? { ...prev, targetLine: val } : null);
                  }}
                  className="w-full text-xs border border-slate-300 bg-white rounded-lg p-2 text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none cursor-pointer"
                >
                  {Array.from({ length: addPointModal.totalPoints + 1 }, (_, idx) => idx + 1).map(lineNum => {
                    let desc = `Line ${lineNum}`;
                    if (lineNum === 1) {
                      desc += addPointModal.totalPoints === 0 ? ' (First point in this section)' : ' (At the top of the list)';
                    } else if (lineNum === addPointModal.totalPoints + 1) {
                      desc += ' (At the end / bottom)';
                    } else {
                      const existingItem = activeSections[addPointModal.sectionIndex]?.items[lineNum - 1];
                      const snippet = existingItem ? existingItem.text.slice(0, 32) : '';
                      desc += ` (Before: "${snippet}${existingItem && existingItem.text.length > 32 ? '...' : ''}")`;
                    }
                    return (
                      <option key={lineNum} value={lineNum}>
                        {desc}
                      </option>
                    );
                  })}
                </select>

                {/* Quick Selection Buttons & Stepper */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200/70">
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <span className="text-slate-500 font-medium">Quick jump:</span>
                    <button
                      type="button"
                      onClick={() => setAddPointModal(prev => prev ? { ...prev, targetLine: 1 } : null)}
                      className={`px-2 py-0.5 rounded border text-[11px] font-medium transition cursor-pointer ${
                        addPointModal.targetLine === 1
                          ? 'bg-emerald-600 text-white border-emerald-600 font-bold shadow-3xs'
                          : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      Top (Line 1)
                    </button>
                    {addPointModal.totalPoints > 1 && (
                      <button
                        type="button"
                        onClick={() => setAddPointModal(prev => prev ? { ...prev, targetLine: Math.ceil((prev.totalPoints + 1) / 2) } : null)}
                        className={`px-2 py-0.5 rounded border text-[11px] font-medium transition cursor-pointer ${
                          addPointModal.targetLine === Math.ceil((addPointModal.totalPoints + 1) / 2)
                            ? 'bg-emerald-600 text-white border-emerald-600 font-bold shadow-3xs'
                            : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        Middle (Line {Math.ceil((addPointModal.totalPoints + 1) / 2)})
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setAddPointModal(prev => prev ? { ...prev, targetLine: prev.totalPoints + 1 } : null)}
                      className={`px-2 py-0.5 rounded border text-[11px] font-medium transition cursor-pointer ${
                        addPointModal.targetLine === addPointModal.totalPoints + 1
                          ? 'bg-emerald-600 text-white border-emerald-600 font-bold shadow-3xs'
                          : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      Bottom (Line {addPointModal.totalPoints + 1})
                    </button>
                  </div>

                  {/* Stepper Buttons */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setAddPointModal(prev => prev ? { ...prev, targetLine: Math.max(1, prev.targetLine - 1) } : null)}
                      disabled={addPointModal.targetLine <= 1}
                      className="w-6 h-6 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-30 text-slate-700 font-bold flex items-center justify-center cursor-pointer"
                      title="Previous line"
                    >
                      -
                    </button>
                    <span className="w-8 text-center font-mono font-bold text-slate-800">
                      #{addPointModal.targetLine}
                    </span>
                    <button
                      type="button"
                      onClick={() => setAddPointModal(prev => prev ? { ...prev, targetLine: Math.min(prev.totalPoints + 1, prev.targetLine + 1) } : null)}
                      disabled={addPointModal.targetLine >= addPointModal.totalPoints + 1}
                      className="w-6 h-6 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-30 text-slate-700 font-bold flex items-center justify-center cursor-pointer"
                      title="Next line"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Placement Feedback banner */}
                <div className="bg-emerald-50/80 border border-emerald-200/80 rounded-lg p-2 text-[11px] text-emerald-900 flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>
                    {addPointModal.targetLine === 1 && addPointModal.totalPoints > 0 ? (
                      <>Will be inserted as <strong>Line 1</strong> at the top. (Existing lines shift down)</>
                    ) : addPointModal.targetLine === addPointModal.totalPoints + 1 ? (
                      <>Will be appended at the bottom as <strong>Line {addPointModal.targetLine}</strong>.</>
                    ) : (
                      <>Will be placed at <strong>Line {addPointModal.targetLine}</strong> (before <em>&ldquo;{activeSections[addPointModal.sectionIndex]?.items[addPointModal.targetLine - 1]?.text.slice(0, 30)}...&rdquo;</em>).</>
                    )}
                  </span>
                </div>
              </div>

              {/* PDF Checked default */}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={addPointModal.checked}
                  onChange={e => setAddPointModal(prev => prev ? { ...prev, checked: e.target.checked } : null)}
                  className="rounded text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5 cursor-pointer"
                />
                <span className="text-slate-700 font-medium text-xs">
                  Checked by default in generated PDF (recommended)
                </span>
              </label>
            </div>

            {/* Footer Buttons */}
            <div className="p-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setAddPointModal(null)}
                className="px-3.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg font-bold text-xs transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAddPoint}
                disabled={!addPointModal.text.trim()}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Point at Line {addPointModal.targetLine}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Point with Line Selection Modal */}
      {removePointModal && activeSections[removePointModal.sectionIndex] && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 p-4 font-sans backdrop-blur-md animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-200 flex flex-col animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-rose-50 via-red-50/50 to-white">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shadow-3xs">
                  <Trash2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">Remove Checklist Point</h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Section: <span className="text-rose-700 font-bold">{removePointModal.sectionTitle}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setRemovePointModal(null)}
                className="w-7 h-7 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center text-xs font-bold transition cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4 text-xs">
              {/* Line selection option */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <span>Which line do you want to remove?</span>
                    <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                      Line #{removePointModal.targetLine}
                    </span>
                  </label>
                  <span className="text-[11px] text-slate-500 font-medium">
                    Total points: {activeSections[removePointModal.sectionIndex]?.items.length || 0}
                  </span>
                </div>

                {/* Dropdown with descriptions */}
                <select
                  value={removePointModal.targetLine}
                  onChange={e => {
                    const val = Number(e.target.value);
                    setRemovePointModal(prev => prev ? { ...prev, targetLine: val } : null);
                  }}
                  className="w-full text-xs border border-slate-300 bg-white rounded-lg p-2 text-slate-800 font-medium focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 outline-none cursor-pointer"
                >
                  {activeSections[removePointModal.sectionIndex]?.items.map((item, idx) => (
                    <option key={item.id || idx} value={idx + 1}>
                      Line {idx + 1}: {item.text ? item.text.slice(0, 50) + (item.text.length > 50 ? '...' : '') : '(Empty point)'}
                    </option>
                  ))}
                </select>

                {/* Quick Selection Buttons & Stepper */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200/70">
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <span className="text-slate-500 font-medium">Select:</span>
                    <button
                      type="button"
                      onClick={() => setRemovePointModal(prev => prev ? { ...prev, targetLine: 1 } : null)}
                      className={`px-2 py-0.5 rounded border text-[11px] font-medium transition cursor-pointer ${
                        removePointModal.targetLine === 1
                          ? 'bg-rose-600 text-white border-rose-600 font-bold shadow-3xs'
                          : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      Top (Line 1)
                    </button>
                    {(activeSections[removePointModal.sectionIndex]?.items.length || 0) > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const total = activeSections[removePointModal.sectionIndex]?.items.length || 1;
                          setRemovePointModal(prev => prev ? { ...prev, targetLine: Math.ceil(total / 2) } : null);
                        }}
                        className={`px-2 py-0.5 rounded border text-[11px] font-medium transition cursor-pointer ${
                          removePointModal.targetLine === Math.ceil((activeSections[removePointModal.sectionIndex]?.items.length || 1) / 2)
                            ? 'bg-rose-600 text-white border-rose-600 font-bold shadow-3xs'
                            : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        Middle
                      </button>
                    )}
                    {(activeSections[removePointModal.sectionIndex]?.items.length || 0) > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const total = activeSections[removePointModal.sectionIndex]?.items.length || 1;
                          setRemovePointModal(prev => prev ? { ...prev, targetLine: total } : null);
                        }}
                        className={`px-2 py-0.5 rounded border text-[11px] font-medium transition cursor-pointer ${
                          removePointModal.targetLine === (activeSections[removePointModal.sectionIndex]?.items.length || 1)
                            ? 'bg-rose-600 text-white border-rose-600 font-bold shadow-3xs'
                            : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        Bottom (Line {activeSections[removePointModal.sectionIndex]?.items.length || 1})
                      </button>
                    )}
                  </div>

                  {/* Stepper Buttons */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setRemovePointModal(prev => prev ? { ...prev, targetLine: Math.max(1, prev.targetLine - 1) } : null)}
                      disabled={removePointModal.targetLine <= 1}
                      className="w-6 h-6 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-30 text-slate-700 font-bold flex items-center justify-center cursor-pointer"
                      title="Previous line"
                    >
                      -
                    </button>
                    <span className="w-8 text-center font-mono font-bold text-slate-800">
                      #{removePointModal.targetLine}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const total = activeSections[removePointModal.sectionIndex]?.items.length || 1;
                        setRemovePointModal(prev => prev ? { ...prev, targetLine: Math.min(total, prev.targetLine + 1) } : null);
                      }}
                      disabled={removePointModal.targetLine >= (activeSections[removePointModal.sectionIndex]?.items.length || 1)}
                      className="w-6 h-6 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-30 text-slate-700 font-bold flex items-center justify-center cursor-pointer"
                      title="Next line"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {/* Point preview being removed */}
              {(() => {
                const sec = activeSections[removePointModal.sectionIndex];
                const selectedItem = sec?.items[removePointModal.targetLine - 1];
                return (
                  <div className="p-3 bg-rose-50/70 border border-rose-200 rounded-xl space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-rose-800 font-bold">
                      <span className="flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                        Selected Point to Remove:
                      </span>
                      <span className="font-mono bg-rose-200/70 px-1.5 py-0.5 rounded text-rose-900">
                        Line #{removePointModal.targetLine}
                      </span>
                    </div>
                    <div className="p-2.5 bg-white rounded-lg border border-rose-100 text-xs text-slate-800 italic">
                      &ldquo;{selectedItem?.text || 'No text'}&rdquo;
                    </div>
                    <p className="text-[10px] text-rose-600">
                      Note: Once removed, any points below Line #{removePointModal.targetLine} will shift up by 1 position.
                    </p>
                  </div>
                );
              })()}

              {/* All points list inside modal for quick 1-click removal */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-slate-700">Or click Remove on any point below:</span>
                  <span className="text-[10px] text-slate-400">
                    {activeSections[removePointModal.sectionIndex]?.items.length} points
                  </span>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1 border border-slate-200 rounded-lg p-2 bg-slate-50/50">
                  {activeSections[removePointModal.sectionIndex]?.items.map((it, idx) => (
                    <div 
                      key={it.id || idx}
                      className={`flex items-center justify-between gap-2 p-1.5 rounded-md border text-xs transition ${
                        idx + 1 === removePointModal.targetLine 
                          ? 'bg-rose-50 border-rose-300 text-rose-900 font-medium' 
                          : 'bg-white border-slate-200/80 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="w-5 h-5 rounded flex items-center justify-center bg-slate-100 text-slate-600 font-mono text-[10px] font-bold shrink-0">
                          #{idx + 1}
                        </span>
                        <span className="truncate text-xs">
                          {it.text || '(Empty text)'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          handleDeleteItem(removePointModal.sectionIndex, idx);
                          const remaining = (activeSections[removePointModal.sectionIndex]?.items.length || 1) - 1;
                          if (remaining <= 0) {
                            setRemovePointModal(null);
                          } else {
                            setRemovePointModal(prev => prev ? {
                              ...prev,
                              targetLine: Math.min(prev.targetLine, remaining)
                            } : null);
                          }
                        }}
                        className="px-2 py-0.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded text-[10px] font-bold flex items-center gap-1 transition cursor-pointer shrink-0"
                        title={`Delete Line ${idx + 1}`}
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Remove</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="p-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setRemovePointModal(null)}
                className="px-3.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg font-bold text-xs transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRemovePoint}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-sm"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove Line #{removePointModal.targetLine}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Point Modal with Line Selection Option */}
      {editPointModal && activeSections[editPointModal.sectionIndex] && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 p-4 font-sans backdrop-blur-md animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-200 flex flex-col animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-blue-50 via-indigo-50/50 to-white">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shadow-3xs">
                  <Pencil className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">Edit Checklist Point</h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Section: <span className="text-blue-700 font-bold">{editPointModal.sectionTitle}</span> • <span className="text-slate-600 font-semibold">Currently Line #{editPointModal.itemIndex + 1}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEditPointModal(null)}
                className="w-7 h-7 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center text-xs font-bold transition cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4 text-xs">
              {/* Point Text */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Point Requirement / Description <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={editPointModal.text}
                  onChange={e => setEditPointModal(prev => prev ? { ...prev, text: e.target.value } : null)}
                  onKeyDown={e => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                      e.preventDefault();
                      handleConfirmEditPoint();
                    }
                  }}
                  rows={3}
                  placeholder="Enter checklist requirement description..."
                  className="w-full text-xs border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800 transition"
                  autoFocus
                />
                <div className="flex items-center justify-between mt-1 text-[10px] text-slate-400">
                  <span>Tip: Press Ctrl+Enter or Cmd+Enter to quickly save</span>
                  <span>{editPointModal.text.length} characters</span>
                </div>
              </div>

              {/* Section selector if multiple sections exist */}
              {activeSections.length > 1 && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Section
                  </label>
                  <select
                    value={editPointModal.targetSectionIndex}
                    onChange={e => {
                      const newSIdx = Number(e.target.value);
                      const targetSec = activeSections[newSIdx];
                      const total = (targetSec?.items?.length || 0) + (newSIdx === editPointModal.sectionIndex ? 0 : 1);
                      setEditPointModal(prev => prev ? {
                        ...prev,
                        targetSectionIndex: newSIdx,
                        targetLine: Math.min(prev.targetLine, Math.max(1, total))
                      } : null);
                    }}
                    className="w-full text-xs border border-slate-300 bg-white rounded-lg p-2 text-slate-800 font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none cursor-pointer"
                  >
                    {activeSections.map((sec, idx) => (
                      <option key={sec.id || idx} value={idx}>
                        {sec.title || `Section ${idx + 1}`} ({sec.items.length} points)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Line Position Selection */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <span>Which line should this point be on?</span>
                    <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                      Line #{editPointModal.targetLine}
                    </span>
                  </label>
                  <span className="text-[11px] text-slate-500 font-medium">
                    {editPointModal.targetSectionIndex === editPointModal.sectionIndex 
                      ? `Total lines: ${activeSections[editPointModal.sectionIndex]?.items.length || 0}`
                      : `Total lines in destination: ${(activeSections[editPointModal.targetSectionIndex]?.items.length || 0) + 1}`}
                  </span>
                </div>

                {/* Dropdown with descriptions */}
                {(() => {
                  const targetSec = activeSections[editPointModal.targetSectionIndex];
                  const totalCount = editPointModal.targetSectionIndex === editPointModal.sectionIndex
                    ? (targetSec?.items?.length || 1)
                    : (targetSec?.items?.length || 0) + 1;

                  return (
                    <select
                      value={editPointModal.targetLine}
                      onChange={e => {
                        const val = Number(e.target.value);
                        setEditPointModal(prev => prev ? { ...prev, targetLine: val } : null);
                      }}
                      className="w-full text-xs border border-slate-300 bg-white rounded-lg p-2 text-slate-800 font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none cursor-pointer"
                    >
                      {Array.from({ length: totalCount }, (_, idx) => idx + 1).map(lineNum => {
                        let desc = `Line ${lineNum}`;
                        if (lineNum === 1) {
                          desc += ' (Top of section)';
                        } else if (lineNum === totalCount) {
                          desc += ' (Bottom of section)';
                        }
                        if (editPointModal.targetSectionIndex === editPointModal.sectionIndex && lineNum === editPointModal.itemIndex + 1) {
                          desc += ' [Current Position]';
                        }
                        return (
                          <option key={lineNum} value={lineNum}>
                            {desc}
                          </option>
                        );
                      })}
                    </select>
                  );
                })()}

                {/* Quick Selection Buttons & Stepper */}
                {(() => {
                  const targetSec = activeSections[editPointModal.targetSectionIndex];
                  const totalCount = editPointModal.targetSectionIndex === editPointModal.sectionIndex
                    ? (targetSec?.items?.length || 1)
                    : (targetSec?.items?.length || 0) + 1;

                  return (
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200/70">
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <span className="text-slate-500 font-medium">Quick jump:</span>
                        <button
                          type="button"
                          onClick={() => setEditPointModal(prev => prev ? { ...prev, targetLine: 1 } : null)}
                          className={`px-2 py-0.5 rounded border text-[11px] font-medium transition cursor-pointer ${
                            editPointModal.targetLine === 1
                              ? 'bg-blue-600 text-white border-blue-600 font-bold shadow-3xs'
                              : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                        >
                          Top (Line 1)
                        </button>
                        {totalCount > 1 && (
                          <button
                            type="button"
                            onClick={() => setEditPointModal(prev => prev ? { ...prev, targetLine: Math.ceil(totalCount / 2) } : null)}
                            className={`px-2 py-0.5 rounded border text-[11px] font-medium transition cursor-pointer ${
                              editPointModal.targetLine === Math.ceil(totalCount / 2)
                                ? 'bg-blue-600 text-white border-blue-600 font-bold shadow-3xs'
                                : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                            }`}
                          >
                            Middle (Line {Math.ceil(totalCount / 2)})
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setEditPointModal(prev => prev ? { ...prev, targetLine: totalCount } : null)}
                          className={`px-2 py-0.5 rounded border text-[11px] font-medium transition cursor-pointer ${
                            editPointModal.targetLine === totalCount
                              ? 'bg-blue-600 text-white border-blue-600 font-bold shadow-3xs'
                              : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                        >
                          Bottom (Line {totalCount})
                        </button>
                      </div>

                      {/* Stepper Buttons */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setEditPointModal(prev => prev ? { ...prev, targetLine: Math.max(1, prev.targetLine - 1) } : null)}
                          disabled={editPointModal.targetLine <= 1}
                          className="w-6 h-6 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-30 text-slate-700 font-bold flex items-center justify-center cursor-pointer"
                          title="Previous line"
                        >
                          -
                        </button>
                        <span className="w-8 text-center font-mono font-bold text-slate-800">
                          #{editPointModal.targetLine}
                        </span>
                        <button
                          type="button"
                          onClick={() => setEditPointModal(prev => prev ? { ...prev, targetLine: Math.min(totalCount, prev.targetLine + 1) } : null)}
                          disabled={editPointModal.targetLine >= totalCount}
                          className="w-6 h-6 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-30 text-slate-700 font-bold flex items-center justify-center cursor-pointer"
                          title="Next line"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* PDF Checked default */}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={editPointModal.checked}
                  onChange={e => setEditPointModal(prev => prev ? { ...prev, checked: e.target.checked } : null)}
                  className="rounded text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5 cursor-pointer"
                />
                <span className="text-slate-700 font-medium text-xs">
                  Checked by default in sample PDF
                </span>
              </label>
            </div>

            {/* Footer Buttons */}
            <div className="p-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditPointModal(null)}
                className="px-3.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg font-bold text-xs transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmEditPoint}
                disabled={!editPointModal.text.trim()}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-sm"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Changes</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Translator AI Model Selection & Info Modal */}
      {showModelInfoModal && (
        <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden my-auto animate-scale-up">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-xl backdrop-blur-xs">
                  <Bot className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-black tracking-tight text-white flex items-center gap-2">
                    <span>Translator AI Model Selection</span>
                    <span className="text-[10px] uppercase font-bold bg-white/20 px-2 py-0.5 rounded-full">
                      Gemini Multimodal
                    </span>
                  </h3>
                  <p className="text-xs text-amber-100 mt-0.5 font-medium">
                    Select which AI model translates product checklists into authentic Assamese (অসমীয়া লিপি)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowModelInfoModal(false)}
                className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Benchmark Recommendation Banner */}
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs text-emerald-950">
                  <p className="font-bold text-emerald-900">
                    Recommended Model: Gemini 3.8 Flash
                  </p>
                  <p className="mt-0.5 text-emerald-800 leading-relaxed text-[11px]">
                    In our side-by-side benchmark with your original checklist (01) and translation tests, <strong>Gemini 3.8 Flash</strong> produced the most authentic, natural Assamese phrasing for influencer instructions (e.g. <em>&quot;কনটেন্ট বনোৱাৰ সময়ত&quot;</em>, <em>&quot;বয়ামটোৰ ঢাকনি খোলা অৱস্থাত এৰি নথব&quot;</em>, <em>&quot;কাহিনী কোৱাৰ ধৰণে&quot;</em>).
                  </p>
                </div>
              </div>

              {/* Models List */}
              <div className="space-y-3">
                {TRANSLATOR_AI_MODELS.map((m) => {
                  const isSelected = selectedTranslatorModel === m.id;
                  return (
                    <div
                      key={m.id}
                      onClick={() => {
                        setSelectedTranslatorModel(m.id);
                        safeSetItem('central_checklist_translator_model', m.id);
                        globalToast.success(`Selected ${m.name} as primary translator model!`);
                      }}
                      className={`p-4 rounded-xl border-2 transition cursor-pointer relative ${
                        isSelected
                          ? 'border-amber-500 bg-amber-50/60 shadow-sm'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                            isSelected ? 'border-amber-600 bg-amber-600' : 'border-slate-300 bg-white'
                          }`}>
                            {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-slate-900 text-sm">
                                {m.name}
                              </span>
                              <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${m.badgeColor}`}>
                                {m.tag}
                              </span>
                            </div>
                            <p className="text-xs text-slate-600 mt-1 leading-snug font-medium">
                              {m.description}
                            </p>
                          </div>
                        </div>

                        {isSelected && (
                          <span className="text-[11px] font-bold text-amber-700 bg-amber-100/90 px-2 py-0.5 rounded-md shrink-0">
                            Active
                          </span>
                        )}
                      </div>

                      <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-700">Strength:</span>
                          <span>{m.highlights}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 font-medium">
                          <span className="text-slate-600">Speed: <b className="text-slate-800">{m.speed}</b></span>
                          <span>•</span>
                          <span className="text-slate-600">Quality: <b className="text-slate-800">{m.quality}</b></span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <span className="text-xs text-slate-500 font-medium">
                Current: <strong className="text-slate-800">{TRANSLATOR_AI_MODELS.find(m => m.id === selectedTranslatorModel)?.name}</strong>
              </span>
              <button
                type="button"
                onClick={() => setShowModelInfoModal(false)}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-sm"
              >
                Confirm & Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
