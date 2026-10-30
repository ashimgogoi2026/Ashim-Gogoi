import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, Phone, User, Check, X, ExternalLink, AlertTriangle, Send, Copy, Building2 } from 'lucide-react';
import { globalToast } from '../lib/toast';
import { openWhatsAppChat, getKnownMobile, cleanSingleMobileForStorage, getDisplayTenDigitMobile, formatDisplayPhone, formatProductForWhatsApp } from '../lib/whatsappHelper';
import CompanyBrandingModal from './CompanyBrandingModal';

export interface WhatsAppPromptData {
  influencerId: string;
  influencerName: string;
  influencerHandle?: string;
  influencerAvatar?: string;
  currentMobile?: string;
  messageText?: string;
  contextTitle?: string;
  onSuccess?: (savedNumber: string) => void;
}

interface UpdateWhatsAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: WhatsAppPromptData | null;
  onSave: (influencerId: string, mobileNumber: string) => void;
}

const COUNTRY_CODES = [
  { code: '+91', country: 'India', flag: '🇮🇳' },
  { code: '+1', country: 'USA / Canada', flag: '🇺🇸' },
  { code: '+44', country: 'UK', flag: '🇬🇧' },
  { code: '+971', country: 'UAE', flag: '🇦🇪' },
  { code: '+61', country: 'Australia', flag: '🇦🇺' },
  { code: '+65', country: 'Singapore', flag: '🇸🇬' },
  { code: '+49', country: 'Germany', flag: '🇩🇪' },
  { code: '', country: 'Custom / Other', flag: '🌐' }
];

export default function UpdateWhatsAppModal({
  isOpen,
  onClose,
  data,
  onSave
}: UpdateWhatsAppModalProps) {
  const [selectedCountryCode, setSelectedCountryCode] = useState('+91');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isBrandingModalOpen, setIsBrandingModalOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Initialize or reset form state whenever data changes or modal opens
  useEffect(() => {
    if (isOpen && data) {
      setErrorMsg('');
      setIsSaving(false);
      const singleNum = cleanSingleMobileForStorage(data.currentMobile || getKnownMobile(data.influencerName) || '');
      
      if (singleNum) {
        setSelectedCountryCode('+91');
        setPhoneNumber(getDisplayTenDigitMobile(singleNum));
      } else {
        setSelectedCountryCode('+91');
        setPhoneNumber('');
      }

      // Auto-focus input after modal transition
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, data]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !data) return null;

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

  const getFullFormattedNumber = () => {
    const trimmedPhone = phoneNumber.trim();
    let raw = trimmedPhone;
    if (!trimmedPhone.startsWith('+') && selectedCountryCode) {
      raw = `${selectedCountryCode}${trimmedPhone}`;
    }
    return cleanSingleMobileForStorage(raw);
  };

  const validate = (): string | null => {
    const digits = getCleanDigits();
    if (!digits) {
      return 'Please enter a valid WhatsApp mobile number';
    }
    if (digits.length < 8) {
      return 'The phone number appears too short (at least 8-10 digits required)';
    }
    if (digits.length > 15) {
      return 'The phone number appears too long (maximum 15 digits according to E.164)';
    }
    return null;
  };

  const handleSaveOnly = () => {
    const err = validate();
    if (err) {
      setErrorMsg(err);
      return;
    }
    setErrorMsg('');
    setIsSaving(true);

    const formatted = getFullFormattedNumber();
    onSave(data.influencerId, formatted);
    const isAutoSync = typeof window !== 'undefined' ? (localStorage.getItem('INFLUENCER_MANAGER_DRIVE_AUTOSYNC') !== 'false') : true;
    globalToast.success(`WhatsApp number for ${data.influencerName} saved ${isAutoSync ? '& synchronized instantly!' : 'successfully!'}`);
    if (data.onSuccess) {
      data.onSuccess(formatted);
    }
    setIsSaving(false);
    onClose();
  };

  const handleSaveAndOpenWhatsApp = () => {
    const err = validate();
    if (err) {
      setErrorMsg(err);
      return;
    }
    setErrorMsg('');
    setIsSaving(true);

    const formatted = getFullFormattedNumber();
    const cleanDigits = getCleanDigits();

    // 1. Save to database / state
    onSave(data.influencerId, formatted);
    const isAutoSync = typeof window !== 'undefined' ? (localStorage.getItem('INFLUENCER_MANAGER_DRIVE_AUTOSYNC') !== 'false') : true;
    globalToast.success(`WhatsApp number updated ${isAutoSync ? '& synchronized instantly!' : '!'}`);

    // 2. Open WhatsApp Native App for Chat (not the web!)
    openWhatsAppChat({
      phoneNumber: cleanDigits,
      text: data.messageText || '',
      preferApp: true,
      contactName: data.influencerName || 'Creator'
    });

    if (data.onSuccess) {
      data.onSuccess(formatted);
    }
    setIsSaving(false);
    onClose();
  };

  const cleanDigitsPreview = getCleanDigits();

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200/80 overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Decorative Banner with WhatsApp Gradient */}
        <div className="relative bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white p-6 pb-5 overflow-hidden">
          {/* Subtle background glow effect */}
          <div className="absolute -top-12 -right-12 w-40 h-40 bg-emerald-400/20 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-teal-300/20 rounded-full blur-xl pointer-events-none" />

          <div className="relative z-10 flex items-start justify-between gap-3">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-md border border-white/25 flex items-center justify-center shadow-inner shrink-0 text-white">
                <MessageCircle className="w-6 h-6 fill-white/30" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-400/20 text-emerald-100 border border-emerald-300/30">
                    WhatsApp Contact Required
                  </span>
                  {data.contextTitle && (
                    <span className="text-[10px] font-semibold text-teal-100/90 truncate max-w-[150px]">
                      • {data.contextTitle}
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-black text-white tracking-tight mt-1">
                  Update WhatsApp Number
                </h3>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer border border-white/20 shrink-0"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1 text-slate-800">
          
          {/* Influencer Profile Card */}
          <div className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 shadow-xs">
            {data.influencerAvatar ? (
              <img
                src={data.influencerAvatar}
                alt={data.influencerName}
                className="w-12 h-12 rounded-full object-cover border-2 border-emerald-500/40 shadow-xs shrink-0"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-500 text-white font-black text-lg flex items-center justify-center shadow-xs shrink-0 border-2 border-white">
                {data.influencerName ? data.influencerName.charAt(0).toUpperCase() : <User className="w-6 h-6" />}
              </div>
            )}

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-black text-sm text-slate-900 leading-tight">
                  {data.influencerName || 'Selected Influencer'}
                </span>
                {data.influencerHandle && (
                  <span className="text-xs font-semibold text-slate-400">
                    ({data.influencerHandle.startsWith('@') ? data.influencerHandle : `@${data.influencerHandle}`})
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                  <AlertTriangle className="w-3 h-3 text-amber-600" /> No active WhatsApp number
                </span>
              </div>
            </div>
          </div>

          {/* Prompt instruction */}
          <div className="text-xs text-slate-600 leading-relaxed">
            Please enter the official WhatsApp mobile number for this creator. Once saved, it will be permanently attached to their profile and synced to your database for instant messaging.
          </div>

          {/* Auto-Sync status indicator */}
          {(() => {
            const isAutoSync = typeof window !== 'undefined' ? (localStorage.getItem('INFLUENCER_MANAGER_DRIVE_AUTOSYNC') !== 'false') : true;
            return (
              <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-emerald-50/80 border border-emerald-200/80 text-[11px] text-emerald-800 shadow-xs">
                <span className="flex items-center gap-1.5 font-bold">
                  <span className={`w-2 h-2 rounded-full ${isAutoSync ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />
                  Instant Auto-Sync: {isAutoSync ? 'ACTIVE' : 'PAUSED'}
                </span>
                <span className="text-[10px] text-emerald-700 font-medium">
                  {isAutoSync ? '⚡ Syncs instantly to Cloud Database & Drive' : 'Updates stored locally'}
                </span>
              </div>
            );
          })()}

          {/* Input field with country code prefix */}
          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
              WhatsApp Mobile Number
            </label>

            <div className="flex gap-2 items-center">
              {/* Country Code selector */}
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

              {/* Number Input */}
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Phone className="w-4 h-4 text-emerald-600" />
                </div>
                <input
                  ref={inputRef}
                  type="tel"
                  placeholder="e.g. 98765 43210"
                  value={phoneNumber}
                  onChange={(e) => {
                    setPhoneNumber(e.target.value);
                    if (errorMsg) setErrorMsg('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveAndOpenWhatsApp();
                    }
                  }}
                  className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-mono font-semibold text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition shadow-xs"
                />
              </div>
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div className="flex items-center gap-1.5 text-xs text-rose-600 font-semibold mt-1.5 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-lg animate-in fade-in">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Quick helper / preview */}
            {cleanDigitsPreview.length >= 8 && (
              <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 bg-emerald-50/60 border border-emerald-100 px-3 py-1.5 rounded-xl font-mono mt-1">
                <span className="flex items-center gap-1 text-emerald-800 font-semibold truncate">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  WhatsApp App: +{cleanDigitsPreview}
                </span>
                <span className="text-[10px] text-emerald-700 bg-emerald-100/70 px-1.5 py-0.5 rounded font-bold uppercase shrink-0">
                  Ready to link
                </span>
              </div>
            )}
          </div>

          {/* Message Preview (if there is an outgoing message context) */}
          {data.messageText && (
            <div className="space-y-1.5 pt-1">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <Send className="w-3 h-3 text-emerald-600" /> Outgoing Message Preview:
              </div>
              <div className="text-xs bg-slate-50 border border-slate-200 p-3 rounded-xl font-sans text-slate-700 max-h-24 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                {formatProductForWhatsApp(data.messageText)}
              </div>
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2.5">
          <button
            type="button"
            onClick={() => setIsBrandingModalOpen(true)}
            className="px-3.5 py-2.5 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200/80 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
            title="Configure Company Logo & Branding in WhatsApp messages"
          >
            <Building2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Company Logo & Signature</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200/70 border border-slate-300 transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSaveOnly}
              disabled={isSaving || !phoneNumber.trim()}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-white text-emerald-700 hover:bg-emerald-50 border border-emerald-300 hover:border-emerald-400 transition-all shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save Number Only
            </button>

            <button
              type="button"
              onClick={handleSaveAndOpenWhatsApp}
              disabled={isSaving || !phoneNumber.trim()}
              className="px-5 py-2.5 rounded-xl text-xs font-black bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-md shadow-emerald-600/20 hover:shadow-emerald-600/30 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
            >
              <MessageCircle className="w-4 h-4 fill-white/20" />
              <span>Save & Open WhatsApp App</span>
            </button>
          </div>
        </div>
      </div>

      <CompanyBrandingModal
        isOpen={isBrandingModalOpen}
        onClose={() => setIsBrandingModalOpen(false)}
      />
    </div>
  );
}
