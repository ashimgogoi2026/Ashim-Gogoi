import React, { useState, useEffect, useRef } from 'react';
import { 
  Building2, 
  Image as ImageIcon, 
  Globe, 
  Tag, 
  Sparkles, 
  X, 
  Check, 
  Copy, 
  Eye, 
  Info,
  ShieldCheck,
  Send,
  MessageCircle,
  Link as LinkIcon,
  Trash2,
  Upload,
  Plus,
  Pencil,
  RotateCcw,
  FileImage
} from 'lucide-react';
import { globalToast } from '../lib/toast';
import { safeLocalStorage } from '../lib/safeLocalStorage';
import { 
  getCompanyBrandingConfig, 
  saveCompanyBrandingConfig, 
  CompanyBrandingConfig, 
  attachCompanyBranding,
  copyCompanyLogoToClipboard,
  DEFAULT_COMPANY_BRANDING
} from '../lib/whatsappHelper';

interface CompanyBrandingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (config: CompanyBrandingConfig) => void;
}

interface LogoPreset {
  id?: string;
  name: string;
  url: string;
  isCustom?: boolean;
}

const DEFAULT_PRESET_LOGOS: LogoPreset[] = [
  { id: 'p1', name: 'Modern Abstract Hexagon', url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&auto=format&fit=crop&q=80' },
  { id: 'p2', name: 'Creative Gradient Emblem', url: 'https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?w=400&auto=format&fit=crop&q=80' },
  { id: 'p3', name: 'Minimal Tech Studio', url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&auto=format&fit=crop&q=80' },
  { id: 'p4', name: 'Luxury Rose Gold Badge', url: 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=400&auto=format&fit=crop&q=80' }
];

export default function CompanyBrandingModal({
  isOpen,
  onClose,
  onSaved
}: CompanyBrandingModalProps) {
  const [config, setConfig] = useState<CompanyBrandingConfig>(getCompanyBrandingConfig());
  const [isCopying, setIsCopying] = useState(false);
  const [customLogoInput, setCustomLogoInput] = useState('');
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const [previewPlatform, setPreviewPlatform] = useState<'whatsapp' | 'instagram' | 'facebook'>('whatsapp');
  const [customLogos, setCustomLogos] = useState<LogoPreset[]>(() => {
    try {
      const safeStored = safeLocalStorage.getItem('WA_CUSTOM_LOGOS_GALLERY');
      if (safeStored) return JSON.parse(safeStored);
      const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('WA_CUSTOM_LOGOS_GALLERY') : null;
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      const current = getCompanyBrandingConfig();
      setConfig(current);
      setCustomLogoInput(current.logoUrl || '');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const saveCustomLogosGallery = (logos: LogoPreset[]) => {
    setCustomLogos(logos);
    try {
      const jsonStr = JSON.stringify(logos);
      safeLocalStorage.setItem('WA_CUSTOM_LOGOS_GALLERY', jsonStr);
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem('WA_CUSTOM_LOGOS_GALLERY', jsonStr);
        } catch {}
      }
    } catch {}
  };

  const handleSave = () => {
    const activeLogo = customLogoInput.trim();
    const updated: CompanyBrandingConfig = {
      ...config,
      logoUrl: activeLogo
    };
    saveCompanyBrandingConfig(updated);
    globalToast.success('Company Logo & WhatsApp Branding settings saved!');
    if (onSaved) onSaved(updated);
    onClose();
  };

  const handleCopyLogo = async () => {
    const targetUrl = customLogoInput.trim() || config.logoUrl;
    if (!targetUrl) {
      globalToast.error('No logo image URL to copy!');
      return;
    }
    setIsCopying(true);
    await copyCompanyLogoToClipboard(targetUrl);
    setIsCopying(false);
  };

  // Helper to compress uploaded images via HTML5 Canvas (max 400x400)
  const compressImageFile = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const rawUrl = event.target?.result as string;
        if (!rawUrl) {
          resolve('');
          return;
        }
        const img = new Image();
        img.onload = () => {
          const maxWidth = 400;
          const maxHeight = 400;
          let width = img.width || 300;
          let height = img.height || 300;

          if (width > maxWidth || height > maxHeight) {
            if (width / height > maxWidth / maxHeight) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            } else {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(rawUrl);
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);
          const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
          const compressed = canvas.toDataURL(mimeType, 0.85);
          resolve(compressed || rawUrl);
        };
        img.onerror = () => resolve(rawUrl);
        img.src = rawUrl;
      };
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  };

  // Add Logo via local file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      globalToast.error('Please select a valid image file (PNG, JPG, SVG, WebP)');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      globalToast.error('Image size must be less than 10MB');
      return;
    }

    try {
      const compressedDataUrl = await compressImageFile(file);
      if (compressedDataUrl) {
        setCustomLogoInput(compressedDataUrl);
        setConfig(prev => ({ ...prev, logoUrl: compressedDataUrl }));
        globalToast.success('Company logo image uploaded & optimized successfully!');

        // Also add to custom logo gallery
        const newLogoItem: LogoPreset = {
          id: 'custom_' + Date.now(),
          name: file.name.replace(/\.[^/.]+$/, "") || 'Uploaded Logo',
          url: compressedDataUrl,
          isCustom: true
        };
        const updatedGallery = [newLogoItem, ...customLogos];
        saveCustomLogosGallery(updatedGallery);
      }
    } catch (err) {
      console.error('File upload failed:', err);
      globalToast.error('Failed to process image file');
    }

    // Reset input
    e.target.value = '';
  };

  // Delete Current Logo Image
  const handleDeleteLogo = () => {
    setCustomLogoInput('');
    setConfig(prev => ({ ...prev, logoUrl: '' }));
    globalToast.info('Company logo image deleted');
  };

  // Restore Default Logo Image
  const handleRestoreDefaultLogo = () => {
    const defaultUrl = DEFAULT_COMPANY_BRANDING.logoUrl;
    setCustomLogoInput(defaultUrl);
    setConfig(prev => ({ ...prev, logoUrl: defaultUrl }));
    globalToast.success('Restored default company logo');
  };

  // Delete Custom Logo item from Gallery
  const handleDeleteGalleryLogo = (idToDelete: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = customLogos.filter(item => item.id !== idToDelete);
    saveCustomLogosGallery(updated);
    globalToast.info('Logo removed from gallery');
  };

  // Add current URL to Gallery
  const handleAddCurrentToGallery = () => {
    if (!customLogoInput.trim()) {
      globalToast.error('Enter an image URL or upload a file first!');
      return;
    }
    const newLogoItem: LogoPreset = {
      id: 'custom_' + Date.now(),
      name: config.companyName ? `${config.companyName} Logo` : 'Custom Logo',
      url: customLogoInput.trim(),
      isCustom: true
    };
    saveCustomLogosGallery([newLogoItem, ...customLogos]);
    globalToast.success('Logo added to your custom gallery!');
  };

  const sampleRawMessage = "Hi! Reaching out regarding our upcoming video collaboration campaign. We are excited to work together!";
  const sampleFormattedMessage = attachCompanyBranding(sampleRawMessage, {
    ...config,
    logoUrl: customLogoInput.trim()
  });

  const activeLogoUrl = customLogoInput.trim();
  const allLogos = [...customLogos, ...DEFAULT_PRESET_LOGOS];

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <input 
        type="file" 
        ref={fileInputRef} 
        accept="image/*" 
        className="hidden" 
        onChange={handleFileUpload} 
      />

      <div 
        className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200/80 overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="relative bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-700 text-white p-6 pb-5 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-md border border-white/25 flex items-center justify-center shadow-inner shrink-0 text-white">
                <Building2 className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-400/20 text-emerald-100 border border-emerald-300/30">
                    WhatsApp • Instagram • Facebook Branding Hub
                  </span>
                </div>
                <h3 className="text-xl font-black text-white tracking-tight mt-1">
                  Company Logo & Multi-Platform Signature
                </h3>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer border border-white/20 shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1 text-slate-800">

          {/* Explanation Info Box */}
          <div className="p-4 rounded-2xl bg-emerald-50/80 border border-emerald-200/80 text-xs text-emerald-900 leading-relaxed space-y-2">
            <div className="flex items-center gap-2 font-bold text-emerald-950 text-sm">
              <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>How Company Logos Work in WhatsApp Messages</span>
            </div>
            <p className="text-slate-700">
              Attach your <strong>Company Logo Image</strong> to render interactive link preview cards and branding signatures in WhatsApp chat!
            </p>
          </div>

          {/* Master Enable/Disable Toggle */}
          <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-200 shadow-xs">
            <div>
              <span className="font-black text-sm text-slate-900 block">
                Include Company Branding in WhatsApp Messages
              </span>
              <span className="text-xs text-slate-500">
                Automatically attaches logo preview & signature header to outgoing drafts
              </span>
            </div>
            <button
              type="button"
              onClick={() => setConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors cursor-pointer focus:outline-none ${
                config.enabled ? 'bg-emerald-600' : 'bg-slate-300'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform ${
                  config.enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Company Logo Image Control Box (ADD / EDIT / DELETE) */}
          <div className="p-4 rounded-2xl bg-slate-900 text-white border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileImage className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                  Company Logo Image Management
                </span>
              </div>
              {activeLogoUrl ? (
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Logo Active
                </span>
              ) : (
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  No Logo Image
                </span>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-4 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
              {/* Logo Preview Box */}
              <div className="relative group w-24 h-24 rounded-xl border-2 border-dashed border-slate-700 bg-slate-900 flex items-center justify-center shrink-0 overflow-hidden">
                {activeLogoUrl ? (
                  <>
                    <img 
                      src={activeLogoUrl} 
                      alt="Company Logo Preview" 
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                    <div className="absolute inset-0 bg-slate-950/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold cursor-pointer"
                        title="Edit / Replace Image"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteLogo}
                        className="p-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-[10px] font-bold cursor-pointer"
                        title="Delete Logo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="text-center p-2">
                    <ImageIcon className="w-6 h-6 text-slate-500 mx-auto mb-1" />
                    <span className="text-[9px] text-slate-400 font-semibold block">No Logo</span>
                  </div>
                )}
              </div>

              {/* Logo Action Toolbar */}
              <div className="flex-1 w-full space-y-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  {/* Upload Image Button (ADD / EDIT REPLACEMENT) */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{activeLogoUrl ? 'Replace / Upload Logo' : '+ Add / Upload Logo Image'}</span>
                  </button>

                  {/* Toggle Edit URL Button */}
                  <button
                    type="button"
                    onClick={() => setIsEditingUrl(!isEditingUrl)}
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5 text-teal-400" />
                    <span>{isEditingUrl ? 'Hide URL Input' : 'Edit Image URL'}</span>
                  </button>

                  {/* Delete Logo Image Button */}
                  {activeLogoUrl && (
                    <button
                      type="button"
                      onClick={handleDeleteLogo}
                      className="px-3 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 hover:text-red-200 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                      title="Remove company logo from WhatsApp messages"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      <span>Delete Logo</span>
                    </button>
                  )}

                  {/* Restore Default Logo Button */}
                  {!activeLogoUrl && (
                    <button
                      type="button"
                      onClick={handleRestoreDefaultLogo}
                      className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                      <span>Restore Default Logo</span>
                    </button>
                  )}
                </div>

                {/* Edit URL Input Row */}
                {(isEditingUrl || !activeLogoUrl) && (
                  <div className="space-y-1">
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={customLogoInput}
                        onChange={(e) => {
                          setCustomLogoInput(e.target.value);
                          setConfig(prev => ({ ...prev, logoUrl: e.target.value }));
                        }}
                        placeholder="Paste image URL (https://.../logo.png)"
                        className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs font-mono text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                      />
                      {activeLogoUrl && (
                        <button
                          type="button"
                          onClick={handleAddCurrentToGallery}
                          className="px-3 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer"
                          title="Save to Gallery"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Save to Gallery</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Inputs Section for Text Branding */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Company Name */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-emerald-600" />
                Company / Studio Name
              </label>
              <input
                type="text"
                value={config.companyName}
                onChange={(e) => setConfig(prev => ({ ...prev, companyName: e.target.value }))}
                placeholder="e.g. ACME Influencer Studio"
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition shadow-xs"
              />
            </div>

            {/* Tagline / Subtitle */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-emerald-600" />
                Tagline / Slogan
              </label>
              <input
                type="text"
                value={config.tagline}
                onChange={(e) => setConfig(prev => ({ ...prev, tagline: e.target.value }))}
                placeholder="e.g. Official Creator Collaboration Desk"
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition shadow-xs"
              />
            </div>

            {/* Website URL */}
            <div className="space-y-1.5 md:col-span-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-emerald-600" />
                Official Website / Portfolio Link
              </label>
              <input
                type="url"
                value={config.websiteUrl}
                onChange={(e) => setConfig(prev => ({ ...prev, websiteUrl: e.target.value }))}
                placeholder="https://pro-to-grow.com"
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-mono font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition shadow-xs"
              />
            </div>

          </div>

          {/* Quick Logo Selector Gallery (Select / Add / Delete from Gallery) */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                Logo Gallery & Presets
              </span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs text-emerald-700 hover:text-emerald-800 font-bold flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Upload New Logo</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {allLogos.map((preset, idx) => {
                const isSelected = activeLogoUrl === preset.url;
                return (
                  <div
                    key={preset.id || idx}
                    onClick={() => {
                      setCustomLogoInput(preset.url);
                      setConfig(prev => ({ ...prev, logoUrl: preset.url }));
                    }}
                    className={`relative group p-2 rounded-xl border text-left transition-all flex items-center gap-2 cursor-pointer ${
                      isSelected 
                        ? 'border-emerald-500 bg-emerald-50/80 ring-2 ring-emerald-500/20' 
                        : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
                    }`}
                  >
                    <img 
                      src={preset.url} 
                      alt={preset.name}
                      className="w-9 h-9 rounded-lg object-cover shrink-0 border border-slate-200 bg-white"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                    <div className="min-w-0 flex-1 pr-4">
                      <span className="text-[11px] font-bold text-slate-800 line-clamp-1 block">
                        {preset.name}
                      </span>
                      <span className="text-[9px] text-emerald-700 font-medium">
                        {isSelected ? '✓ Selected' : 'Use Logo'}
                      </span>
                    </div>

                    {/* Delete Custom Logo Button */}
                    {preset.isCustom && preset.id && (
                      <button
                        type="button"
                        onClick={(e) => handleDeleteGalleryLogo(preset.id!, e)}
                        className="absolute top-1 right-1 p-1 rounded-md bg-red-100 hover:bg-red-200 text-red-600 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                        title="Delete this logo from gallery"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Branding Style Selector */}
          <div className="space-y-2 pt-1">
            <span className="block text-xs font-bold uppercase tracking-wider text-slate-600">
              Branding Position & Layout Style
            </span>
            <div className="grid grid-cols-3 gap-2.5">
              {[
                { id: 'header', title: 'Header Block (Default)', desc: 'Website, Logo & Name in top header' },
                { id: 'footer', title: 'Footer Signature', desc: 'Logo at bottom (Website in top header)' },
                { id: 'link_preview', title: 'Rich Card Link', desc: 'Logo preview (Website in top header)' }
              ].map((style) => (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => setConfig(prev => ({ ...prev, brandingStyle: style.id as any }))}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                    config.brandingStyle === style.id
                      ? 'border-emerald-500 bg-emerald-50/80 ring-2 ring-emerald-500/20'
                      : 'border-slate-200 hover:border-slate-300 bg-slate-50'
                  }`}
                >
                  <span className="font-bold text-xs text-slate-900 block">{style.title}</span>
                  <span className="text-[10px] text-slate-500 leading-tight block mt-0.5">{style.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Multi-Platform Live Preview */}
          <div className="space-y-3 pt-2 border-t border-slate-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-emerald-600" />
                Live Multi-Platform Message Preview:
              </span>
              
              {/* Platform Selector Tabs */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setPreviewPlatform('whatsapp')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition-all flex items-center gap-1.5 cursor-pointer ${
                    previewPlatform === 'whatsapp'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  <MessageCircle className="w-3 h-3 fill-current" />
                  <span>WhatsApp</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPreviewPlatform('instagram')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition-all flex items-center gap-1.5 cursor-pointer ${
                    previewPlatform === 'instagram'
                      ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  <Send className="w-3 h-3" />
                  <span>Instagram DM</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPreviewPlatform('facebook')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition-all flex items-center gap-1.5 cursor-pointer ${
                    previewPlatform === 'facebook'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  <Globe className="w-3 h-3" />
                  <span>Facebook</span>
                </button>
              </div>
            </div>

            {/* Platform Chat Box Mock */}
            <div className={`p-4 rounded-2xl border transition-all duration-200 space-y-3 font-sans ${
              previewPlatform === 'whatsapp'
                ? 'bg-[#efeae2] border-slate-300 shadow-inner'
                : previewPlatform === 'instagram'
                ? 'bg-slate-950 border-purple-900/60 shadow-2xl'
                : 'bg-slate-100 border-blue-200 shadow-inner'
            }`}>
              
              {/* Platform Mock Header Badge */}
              <div className="flex items-center justify-between pb-2 border-b border-black/5 text-[11px] font-bold">
                <span className={`flex items-center gap-1.5 ${
                  previewPlatform === 'whatsapp' ? 'text-emerald-800' : previewPlatform === 'instagram' ? 'text-pink-400' : 'text-blue-700'
                }`}>
                  {previewPlatform === 'whatsapp' && '💬 WhatsApp Chat Preview'}
                  {previewPlatform === 'instagram' && '📸 Instagram Direct Message Preview'}
                  {previewPlatform === 'facebook' && '💙 Facebook Messenger Preview'}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {previewPlatform === 'whatsapp' ? 'WhatsApp Web / Mobile' : previewPlatform === 'instagram' ? 'Instagram Direct' : 'Facebook Direct'}
                </span>
              </div>

              {/* Message Bubble */}
              <div className={`max-w-[88%] rounded-2xl p-3.5 shadow-xs space-y-2.5 ml-auto ${
                previewPlatform === 'whatsapp'
                  ? 'bg-[#d9fdd3] text-slate-900 rounded-tr-none border border-emerald-200/60'
                  : previewPlatform === 'instagram'
                  ? 'bg-gradient-to-r from-purple-600 via-pink-600 to-rose-500 text-white rounded-br-none shadow-lg shadow-pink-500/10'
                  : 'bg-blue-600 text-white rounded-br-none shadow-md shadow-blue-500/20'
              }`}>
                
                {/* Logo Image Card */}
                {activeLogoUrl ? (
                  <div className={`rounded-xl overflow-hidden border shadow-xs ${
                    previewPlatform === 'whatsapp' 
                      ? 'border-emerald-300/80 bg-white' 
                      : previewPlatform === 'instagram'
                      ? 'border-white/20 bg-slate-900/90 text-white backdrop-blur-md'
                      : 'border-white/20 bg-white text-slate-900'
                  }`}>
                    <img 
                      src={activeLogoUrl} 
                      alt="Company Logo Preview"
                      className="w-full h-32 object-cover"
                    />
                    <div className={`p-2.5 ${
                      previewPlatform === 'whatsapp'
                        ? 'bg-slate-50 border-t border-slate-100 text-slate-900'
                        : previewPlatform === 'instagram'
                        ? 'bg-slate-900 border-t border-slate-800 text-white'
                        : 'bg-slate-50 border-t border-slate-100 text-slate-900'
                    }`}>
                      <div className="text-xs font-black truncate">
                        {config.companyName || 'Company Name'}
                      </div>
                      <div className={`text-[10px] truncate ${
                        previewPlatform === 'instagram' ? 'text-slate-400' : 'text-slate-500'
                      }`}>
                        {config.tagline || 'Official Collaboration Hub'}
                      </div>
                      {config.websiteUrl && (
                        <div className="text-[10px] font-mono text-emerald-600 hover:underline truncate mt-0.5">
                          🌐 {config.websiteUrl}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className={`p-2.5 rounded-xl border text-[11px] font-medium flex items-center gap-2 ${
                    previewPlatform === 'whatsapp'
                      ? 'bg-amber-50 border-amber-200 text-amber-800'
                      : 'bg-white/10 border-white/20 text-white'
                  }`}>
                    <Info className="w-4 h-4 shrink-0" />
                    <span>No company logo image attached (Text-only signature will be used)</span>
                  </div>
                )}

                {/* Formatted Message Text */}
                <div className={`text-xs whitespace-pre-wrap leading-relaxed font-sans ${
                  previewPlatform === 'whatsapp' ? 'text-slate-800' : 'text-white font-medium'
                }`}>
                  {config.enabled ? sampleFormattedMessage : sampleRawMessage}
                </div>

                <div className={`text-[9px] text-right font-medium ${
                  previewPlatform === 'whatsapp' ? 'text-emerald-800/70' : 'text-white/80'
                }`}>
                  10:42 AM • Delivered
                </div>
              </div>

            </div>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={handleCopyLogo}
            disabled={isCopying || !activeLogoUrl}
            className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-xs font-bold text-slate-700 transition flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
          >
            <Copy className="w-4 h-4 text-emerald-600" />
            <span>Copy Logo Image (Ctrl+V)</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200/70 border border-slate-300 transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2.5 rounded-xl text-xs font-black bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-md shadow-emerald-600/20 hover:shadow-emerald-600/30 transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              <Check className="w-4 h-4" />
              <span>Save Logo Branding Settings</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

