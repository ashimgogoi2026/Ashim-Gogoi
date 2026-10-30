import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageCircle, Phone, User, X, Send, Copy, Building2, 
  Search, Check, Sparkles, FileText, Image as ImageIcon, ExternalLink, HelpCircle
} from 'lucide-react';
import { globalToast } from '../lib/toast';
import { 
  openWhatsAppChat, 
  cleanSingleMobileForStorage, 
  getDisplayTenDigitMobile, 
  getCompanyBrandingConfig, 
  attachCompanyBranding, 
  copyCompanyLogoToClipboard,
  formatProductForWhatsApp,
  CompanyBrandingConfig
} from '../lib/whatsappHelper';
import CompanyBrandingModal from './CompanyBrandingModal';
import { Influencer } from '../types';

export const OPEN_QUICK_WHATSAPP_EVENT = 'OPEN_QUICK_WHATSAPP_MODAL';

export interface QuickWhatsAppInitData {
  phoneNumber?: string;
  messageText?: string;
  contactName?: string;
}

export function triggerQuickSendWhatsApp(data?: QuickWhatsAppInitData) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent<QuickWhatsAppInitData>(OPEN_QUICK_WHATSAPP_EVENT, {
        detail: data || {},
      })
    );
  }
}

interface QuickSendWhatsAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  influencers?: Influencer[];
  initialData?: QuickWhatsAppInitData | null;
}

const COUNTRY_CODES = [
  { code: '+91', country: 'India', flag: '🇮🇳' },
  { code: '+1', country: 'USA / Canada', flag: '🇺🇸' },
  { code: '+44', country: 'UK', flag: '🇬🇧' },
  { code: '+971', country: 'UAE', flag: '🇦🇪' },
  { code: '+61', country: 'Australia', flag: '🇦🇺' },
  { code: '+65', country: 'Singapore', flag: '🇸🇬' },
  { code: '+49', country: 'Germany', flag: '🇩🇪' },
  { code: '+880', country: 'Bangladesh', flag: '🇧🇩' },
  { code: '', country: 'Custom / Direct', flag: '🌐' }
];

const QUICK_TEMPLATES = [
  {
    label: '👋 Greeting',
    title: 'General Greeting',
    text: 'Hi! Hope you are doing great. Reaching out from our team regarding creator collaborations!'
  },
  {
    label: '💼 Campaign Invite',
    title: 'Campaign Collaboration',
    text: 'Hi! We loved your content profile and would love to collaborate with you on our upcoming brand campaign. Let us know if you are open for new opportunities!'
  },
  {
    label: '📄 Contract Update',
    title: 'Contract & Deliverables',
    text: 'Hi! Sending you a quick update regarding your campaign deliverables and contract agreement. Please check and confirm!'
  },
  {
    label: '💳 Payment Info',
    title: 'Payment Cleared',
    text: 'Hi! Your payment invoice has been processed and cleared from our end. Thank you for working with us!'
  },
  {
    label: '✅ Video Approved (Link & Time Soon)',
    title: 'Video Approved - Upload Date, Time & Buying Link Coming Soon',
    text: 'Hi! 🎉 Great news! Our team has reviewed your promotional video and it is officially APPROVED! ✅\n\n📅 Upload Date, Time & Buying Link Coming Very Soon:\nWe will share your scheduled upload date, exact upload time, and official product buying link with you very soon.\n\n⏳ Please wait until we send you the upload date, time, and buying link before publishing the video publicly. Thank you for your wonderful work!'
  },
  {
    label: '📸 Content Approval',
    title: 'Reel Approval',
    text: 'Hi! We have reviewed your content draft/reel. Everything looks great! You can proceed with publishing.'
  },
  {
    label: '🔗 Advance Link & Edit',
    title: 'Advance Link & Final Video Approval',
    text: 'Hi! We are providing your product buying link in advance before your edited video is submitted to us so you can keep it ready. However, please note that you must edit the video strictly as per our previous editing message and instructions, and before uploading publicly, you must submit the final edited video to us for review and approval.'
  },
  {
    label: '🎬 Video Ready?',
    title: 'Edited Video Ready Check',
    text: 'Hi! Quick check from our team regarding your collaboration video. Could you please confirm if your edited video draft/cut is ready? If yes, please submit the draft to us for review and approval. Thank you!'
  },
  {
    label: '⏰ Office Hours & Feedback',
    title: 'Office Hours & Review Notice (10 AM - 6 PM)',
    text: 'Hi! Hope you are having a wonderful day! Please note that our office team working hours are 10:00 AM to 6:00 PM. Since it is currently outside office hours (or on a weekend/Sunday), our team cannot provide official video review & feedback right now; we will review your video and provide the feedback tomorrow during regular office hours (10:00 AM – 6:00 PM). I can personally chat and reply to you right now to take note of your points, but for the final official review, it will be completed tomorrow by our team. Thank you!'
  }
];

export default function QuickSendWhatsAppModal({
  isOpen,
  onClose,
  influencers = [],
  initialData = null
}: QuickSendWhatsAppModalProps) {
  const [selectedCountryCode, setSelectedCountryCode] = useState('+91');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [contactName, setContactName] = useState('');
  const [messageText, setMessageText] = useState('');
  const [includeBranding, setIncludeBranding] = useState(true);
  const [searchContactQuery, setSearchContactQuery] = useState('');
  const [showContactDropdown, setShowContactDropdown] = useState(false);
  const [isBrandingModalOpen, setIsBrandingModalOpen] = useState(false);
  const [brandingConfig, setBrandingConfig] = useState<CompanyBrandingConfig>(getCompanyBrandingConfig());
  const [errorMsg, setErrorMsg] = useState('');

  const numberInputRef = useRef<HTMLInputElement>(null);

  // Sync branding config on mount & updates
  useEffect(() => {
    const refreshBranding = () => {
      setBrandingConfig(getCompanyBrandingConfig());
    };
    refreshBranding();
    if (typeof window !== 'undefined') {
      window.addEventListener('company-branding-updated', refreshBranding as EventListener);
      window.addEventListener('storage', refreshBranding);
      return () => {
        window.removeEventListener('company-branding-updated', refreshBranding as EventListener);
        window.removeEventListener('storage', refreshBranding);
      };
    }
  }, [isOpen, isBrandingModalOpen]);

  // Handle initialization when modal opens or initialData changes
  useEffect(() => {
    if (isOpen) {
      setErrorMsg('');
      const initNum = initialData?.phoneNumber || '';
      const initText = initialData?.messageText || '';
      const initName = initialData?.contactName || '';

      setContactName(initName);
      setMessageText(initText);
      setSearchContactQuery('');

      if (initNum) {
        const clean = cleanSingleMobileForStorage(initNum);
        if (clean.startsWith('+')) {
          setSelectedCountryCode('+91');
          setPhoneNumber(getDisplayTenDigitMobile(clean));
        } else {
          setPhoneNumber(initNum);
        }
      } else {
        setPhoneNumber('');
      }

      setTimeout(() => {
        numberInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, initialData]);

  // ESC key listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const getCleanDigits = () => {
    let combined = '';
    const trimmedPhone = phoneNumber.trim();
    if (trimmedPhone.startsWith('+')) {
      combined = trimmedPhone;
    } else if (selectedCountryCode) {
      combined = selectedCountryCode + trimmedPhone;
    } else {
      combined = trimmedPhone;
    }
    return combined.replace(/[^0-9]/g, '');
  };

  const validate = (): string | null => {
    const digits = getCleanDigits();
    if (!digits) {
      return 'Please enter a valid WhatsApp mobile number';
    }
    if (digits.length < 8) {
      return 'Phone number is too short (at least 8-10 digits required)';
    }
    if (digits.length > 15) {
      return 'Phone number is too long (maximum 15 digits according to international E.164 format)';
    }
    return null;
  };

  const handleSelectInfluencer = (inf: Influencer) => {
    const phone = inf.mobileNumber || '';
    const clean = cleanSingleMobileForStorage(phone);
    if (clean) {
      setPhoneNumber(getDisplayTenDigitMobile(clean));
    } else {
      setPhoneNumber('');
    }
    setContactName(inf.name);
    setSearchContactQuery(inf.name);
    setShowContactDropdown(false);
    setErrorMsg('');
  };

  const handleSendWhatsApp = (preferApp: boolean) => {
    const err = validate();
    if (err) {
      setErrorMsg(err);
      return;
    }
    setErrorMsg('');

    const cleanDigits = getCleanDigits();
    
    // Call unified openWhatsAppChat helper
    const success = openWhatsAppChat({
      phoneNumber: cleanDigits,
      text: messageText,
      preferApp,
      contactName: contactName || 'Contact',
      skipBranding: !includeBranding
    });

    if (success) {
      onClose();
    }
  };

  const handleCopyTextOnly = (platformName: string = 'Message') => {
    const formatted = formatProductForWhatsApp(messageText);
    const finalMsg = includeBranding ? attachCompanyBranding(formatted, brandingConfig) : formatted;
    if (!finalMsg.trim()) {
      globalToast.info('Please enter a message or choose a template first.');
      return;
    }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(finalMsg);
      globalToast.success(`${platformName} message copied to clipboard! Ready to paste into chat.`);
    }
  };

  const handleCopyLogo = async () => {
    if (!brandingConfig.logoUrl) {
      globalToast.info('No company logo configured yet. Click "Configure Logo" to set one up.');
      return;
    }
    await copyCompanyLogoToClipboard(brandingConfig.logoUrl);
  };

  // Filtered contacts list for dropdown search
  const filteredInfluencers = influencers.filter((inf) => {
    if (!searchContactQuery.trim()) return true;
    const q = searchContactQuery.toLowerCase();
    return (
      inf.name?.toLowerCase().includes(q) ||
      inf.instagramHandle?.toLowerCase().includes(q) ||
      inf.mobileNumber?.toLowerCase().includes(q)
    );
  }).slice(0, 6);

  const finalFormattedPreview = includeBranding ? attachCompanyBranding(messageText, brandingConfig) : messageText;
  const digitsPreview = getCleanDigits();

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with WhatsApp Branding Gradient */}
        <div className="relative bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white px-6 py-5 shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-white/20 border border-white/30 flex items-center justify-center text-white shadow-inner shrink-0">
                <MessageCircle className="w-6 h-6 fill-white/20" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded-full bg-emerald-400/20 text-emerald-100 border border-emerald-300/30">
                    Quick WhatsApp Messenger
                  </span>
                  <span className="text-[10px] text-teal-100 font-medium hidden sm:inline">
                    • Direct Any Number
                  </span>
                </div>
                <h2 className="text-xl font-black text-white tracking-tight mt-0.5">
                  Send WhatsApp Message
                </h2>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer border border-white/20 shrink-0"
              title="Close modal (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1 text-slate-800">

          {/* Section 1: Contact Search & Phone Number */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            
            {/* Quick Contact Search from Saved Creators */}
            {influencers.length > 0 && (
              <div className="md:col-span-12 relative">
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-1 flex items-center justify-between">
                  <span>Pick Saved Creator / Contact (Optional Search)</span>
                  <span className="text-[10px] text-emerald-600 font-semibold">
                    {influencers.length} contacts available
                  </span>
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search by creator name, @handle or phone number..."
                    value={searchContactQuery}
                    onChange={(e) => {
                      setSearchContactQuery(e.target.value);
                      setShowContactDropdown(true);
                    }}
                    onFocus={() => setShowContactDropdown(true)}
                    className="w-full pl-9 pr-8 py-2 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:bg-white outline-none transition"
                  />
                  {searchContactQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchContactQuery('');
                        setShowContactDropdown(false);
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Dropdown Results */}
                {showContactDropdown && filteredInfluencers.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl z-30 max-h-52 overflow-y-auto divide-y divide-slate-100 animate-in fade-in duration-150">
                    {filteredInfluencers.map((inf) => (
                      <button
                        key={inf.id}
                        type="button"
                        onClick={() => handleSelectInfluencer(inf)}
                        className="w-full p-2.5 text-left hover:bg-emerald-50 transition flex items-center justify-between gap-3 cursor-pointer group"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 font-black text-xs flex items-center justify-center shrink-0 border border-emerald-200">
                            {inf.name ? inf.name.charAt(0).toUpperCase() : 'C'}
                          </div>
                          <div className="truncate">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-xs font-bold text-slate-800 group-hover:text-emerald-900 truncate">
                                {inf.name}
                              </p>
                              {inf.status === 'Future Creator' && (
                                <span className="px-1.5 py-0.2 bg-amber-100 text-amber-800 border border-amber-300 rounded text-[9px] font-black uppercase tracking-wider">
                                  Future Creator
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400 truncate">
                              {inf.instagramHandle ? `@${inf.instagramHandle.replace('@', '')}` : 'Creator'}
                            </p>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <p className="text-xs font-mono font-bold text-emerald-700">
                            {inf.mobileNumber ? getDisplayTenDigitMobile(inf.mobileNumber) : 'No mobile'}
                          </p>
                          <span className="text-[9px] text-slate-400 font-semibold uppercase">
                            Click to autofill
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Mobile Number Entry */}
            <div className="md:col-span-12 space-y-1.5">
              <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700">
                WhatsApp Mobile Number <span className="text-rose-500">*</span>
              </label>

              <div className="flex gap-2 items-center">
                {/* Country Code dropdown */}
                <div className="relative shrink-0">
                  <select
                    value={selectedCountryCode}
                    onChange={(e) => setSelectedCountryCode(e.target.value)}
                    className="appearance-none bg-slate-50 border border-slate-300 hover:border-slate-400 text-slate-800 text-xs font-bold py-2.5 pl-3 pr-7 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none transition cursor-pointer shadow-xs"
                  >
                    {COUNTRY_CODES.map((item, idx) => (
                      <option key={idx} value={item.code}>
                        {item.flag} {item.code ? item.code : 'Other'} ({item.country})
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-[10px]">
                    ▼
                  </div>
                </div>

                {/* Phone Input */}
                <div className="relative flex-1">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Phone className="w-4 h-4 text-emerald-600" />
                  </div>
                  <input
                    ref={numberInputRef}
                    type="tel"
                    placeholder="Enter 10-digit mobile number (e.g. 98765 43210)"
                    value={phoneNumber}
                    onChange={(e) => {
                      setPhoneNumber(e.target.value);
                      if (errorMsg) setErrorMsg('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSendWhatsApp(true);
                      }
                    }}
                    className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-mono font-bold text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition shadow-xs"
                  />
                </div>
              </div>

              {/* Error Message */}
              {errorMsg && (
                <div className="p-2 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-semibold flex items-center gap-1.5 animate-in fade-in">
                  <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                  {errorMsg}
                </div>
              )}

              {/* Number Preview Tag */}
              {digitsPreview.length >= 8 && (
                <div className="flex items-center justify-between text-[11px] font-mono bg-emerald-50 text-emerald-800 border border-emerald-200/80 px-3 py-1.5 rounded-xl mt-1">
                  <span className="font-bold flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Target Number: +{digitsPreview}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded">
                    Validated
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Message Templates & Text Area */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700">
                WhatsApp Message Content
              </label>
              <button
                type="button"
                onClick={() => setMessageText('')}
                className="text-[11px] font-bold text-slate-400 hover:text-rose-600 transition"
              >
                Clear Text
              </button>
            </div>

            {/* Template Buttons */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-500" /> Templates:
              </span>
              {QUICK_TEMPLATES.map((tmpl, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setMessageText(tmpl.text);
                    globalToast.info(`Loaded template: ${tmpl.title}`);
                  }}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 hover:bg-emerald-100 hover:text-emerald-900 border border-slate-200 text-slate-700 transition cursor-pointer shrink-0"
                >
                  {tmpl.label}
                </button>
              ))}
            </div>

            {/* Textarea */}
            <textarea
              rows={4}
              placeholder="Type your custom WhatsApp message here..."
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              className="w-full p-3.5 bg-white border border-slate-300 rounded-2xl text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition leading-relaxed shadow-xs"
            />
          </div>

          {/* Section 3: Company Logo & Branding Configuration */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-50/80 via-teal-50/50 to-slate-50 border border-emerald-200/80 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeBranding}
                  onChange={(e) => setIncludeBranding(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                />
                <span className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-emerald-600" />
                  Attach Company Logo & Signature
                </span>
              </label>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyLogo}
                  className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-100/70 transition flex items-center gap-1 cursor-pointer shadow-2xs"
                  title="Copy Company Logo image file to clipboard for pasting (Ctrl+V) in WhatsApp"
                >
                  <ImageIcon className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Copy Logo Image</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsBrandingModalOpen(true)}
                  className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition flex items-center gap-1 cursor-pointer shadow-2xs"
                  title="Edit Company Logo URL, Name, and Tagline"
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span>Configure Logo</span>
                </button>
              </div>
            </div>

            {/* Active Branding Status Card */}
            {includeBranding && brandingConfig.enabled && (
              <div className="text-[11px] bg-white/90 border border-emerald-200/90 rounded-xl p-2.5 flex items-center justify-between gap-3 text-slate-700 shadow-2xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  {brandingConfig.logoUrl ? (
                    <img
                      src={brandingConfig.logoUrl}
                      alt={brandingConfig.companyName}
                      className="w-7 h-7 rounded-lg object-cover border border-emerald-300 shrink-0"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
                      🏢
                    </div>
                  )}
                  <div className="truncate">
                    <p className="font-extrabold text-slate-900 truncate">{brandingConfig.companyName}</p>
                    <p className="text-[10px] text-slate-500 truncate flex items-center gap-1">
                      <span>{brandingConfig.tagline}</span>
                      {brandingConfig.websiteUrl && (
                        <span className="text-emerald-700 font-semibold">• 🌐 {brandingConfig.websiteUrl}</span>
                      )}
                    </p>
                  </div>
                </div>

                <span className="text-[9px] font-black uppercase text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded-full border border-emerald-300/60 shrink-0">
                  Branding Active
                </span>
              </div>
            )}
          </div>

          {/* Section 4: Live Message Preview */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-emerald-600" /> Live WhatsApp Chat Preview:
            </div>
            
            <div className="p-3.5 bg-slate-900 text-emerald-300 rounded-2xl font-mono text-[11px] leading-relaxed max-h-36 overflow-y-auto whitespace-pre-wrap border border-slate-800 shadow-inner">
              {finalFormattedPreview || <span className="text-slate-500 italic">No message drafted yet. Type above or pick a template.</span>}
            </div>
          </div>

        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-1.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => handleCopyTextOnly('WhatsApp')}
              className="px-3 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 transition flex items-center justify-center gap-1 cursor-pointer shadow-xs"
              title="Copy formatted message text for WhatsApp"
            >
              <Copy className="w-3.5 h-3.5 text-emerald-600" />
              <span>Copy Text</span>
            </button>

            <button
              type="button"
              onClick={() => handleCopyTextOnly('Instagram DM')}
              className="px-2.5 py-2 rounded-xl text-[11px] font-bold text-pink-700 bg-pink-50 hover:bg-pink-100 border border-pink-200 transition flex items-center gap-1 cursor-pointer"
              title="Copy formatted message for Instagram Direct Message"
            >
              <Send className="w-3 h-3 text-pink-600" />
              <span>IG DM</span>
            </button>

            <button
              type="button"
              onClick={() => handleCopyTextOnly('Facebook Messenger')}
              className="px-2.5 py-2 rounded-xl text-[11px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition flex items-center gap-1 cursor-pointer"
              title="Copy formatted message for Facebook Messenger"
            >
              <ExternalLink className="w-3 h-3 text-blue-600" />
              <span>FB</span>
            </button>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200/80 border border-slate-300 transition cursor-pointer"
            >
              Cancel
            </button>

            {/* Send via WhatsApp Web */}
            <button
              type="button"
              onClick={() => handleSendWhatsApp(false)}
              disabled={!phoneNumber.trim()}
              className="px-4 py-2.5 rounded-xl text-xs font-extrabold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-300 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
              title="Open WhatsApp Web in a browser tab"
            >
              <ExternalLink className="w-3.5 h-3.5 text-teal-600" />
              <span>WhatsApp Web</span>
            </button>

            {/* Send via WhatsApp Native App */}
            <button
              type="button"
              onClick={() => handleSendWhatsApp(true)}
              disabled={!phoneNumber.trim()}
              className="px-5 py-2.5 rounded-xl text-xs font-black bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-md shadow-emerald-600/30 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
              title="Launch WhatsApp Application directly for chat"
            >
              <MessageCircle className="w-4 h-4 fill-white/20" />
              <span>Send WhatsApp App</span>
            </button>
          </div>
        </div>

      </div>

      {/* Company Branding Settings Modal */}
      <CompanyBrandingModal
        isOpen={isBrandingModalOpen}
        onClose={() => setIsBrandingModalOpen(false)}
      />
    </div>
  );
}
