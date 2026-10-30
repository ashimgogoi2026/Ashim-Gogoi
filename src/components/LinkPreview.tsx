import React from 'react';
import { ExternalLink, Link as LinkIcon, Calendar, Clock, Film, ShieldCheck, ShieldAlert } from 'lucide-react';
import { verifyRealUploadDateTime } from '../lib/kolkataTime';

export interface PreviewData {
  title: string;
  description: string;
  image: string;
  domain: string;
  views?: number;
  originalViews?: number;
  viewSource?: string;
  abnormalMonitor?: {
    status?: 'blocked_abnormal' | 'verified_normal' | 'no_public_views';
    isOriginalVerified?: boolean;
    abnormalBlocked?: boolean;
    blockedAbnormalValue?: number;
    blockReason?: string;
    blockedReason?: string;
    originalViews?: number;
    source?: string;
  };
  isReel?: boolean;
  reelPlatform?: string;
  publishedDate?: string;
  publishedTime?: string;
  publishedAt?: string;
  formattedUploadDateTime?: string;
  uploadDateSource?: string;
  isRealUploadDateVerified?: boolean;
  fetchedAt?: number;
  uploadDateGuard?: {
    verified?: boolean;
    source?: string;
    runningClockBlocked?: boolean;
    blockedTimestamp?: string;
    reason?: string;
  };
}

interface LinkPreviewProps {
  url: string;
  data?: PreviewData | null;
  loading?: boolean;
  displayViewsOverride?: number;
  abnormalStoppedInfo?: {
    stoppedValue: number;
    originalValue: number;
    reason: string;
  } | null;
  fallbackTaskMeta?: {
    releaseDate?: string | null;
    uploadTime?: string | null;
    publishedAt?: string | null;
    publishedDate?: string | null;
    publishedTime?: string | null;
  } | null;
}

export default function LinkPreview({
  url,
  data,
  loading,
  displayViewsOverride,
  abnormalStoppedInfo,
  fallbackTaskMeta
}: LinkPreviewProps) {
  if (!url) return null;

  const isFacebookReel =
    url.includes('facebook.com/reel') ||
    url.includes('facebook.com/share/r/') ||
    url.includes('facebook.com/share/v/') ||
    url.includes('fb.watch');
  const isYouTubeShort = url.includes('youtube.com/shorts') || url.includes('youtu.be');
  const isInstagramReel = url.includes('instagram.com/reel') || url.includes('instagram.com/reels') || url.includes('instagram.com/p/');
  const isTikTok = url.includes('tiktok.com');
  const isReel = isFacebookReel || isYouTubeShort || isInstagramReel || isTikTok || Boolean(data?.isReel);

  const getReelBadge = () => {
    if (isFacebookReel || data?.reelPlatform === 'Facebook Reel') {
      return { label: 'Facebook Reel', color: 'bg-blue-600 text-white border-blue-700' };
    }
    if (isYouTubeShort || data?.reelPlatform === 'YouTube Short') {
      return { label: 'YouTube Short', color: 'bg-red-600 text-white border-red-700' };
    }
    if (isInstagramReel || data?.reelPlatform === 'Instagram Reel') {
      return { label: 'Instagram Reel', color: 'bg-gradient-to-r from-purple-600 to-pink-600 text-white border-purple-700' };
    }
    if (isTikTok || data?.reelPlatform === 'TikTok Reel') {
      return { label: 'TikTok Reel', color: 'bg-black text-white border-gray-800' };
    }
    return { label: 'Reel Video', color: 'bg-indigo-600 text-white border-indigo-700' };
  };

  const reelBadge = isReel ? getReelBadge() : null;
  const verifiedUpload = verifyRealUploadDateTime(data, url, fallbackTaskMeta);

  const renderUploadDateBadge = () => {
    if (!verifiedUpload.isVerified) {
      if (verifiedUpload.runningClockBlocked) {
        return (
          <div
            className="flex items-center gap-1 text-[10px] font-mono bg-amber-50 border border-amber-200 text-amber-800 px-2 py-0.5 rounded-md"
            title={verifiedUpload.blockReason || 'Upload Date Guard blocked current/running timestamp'}
          >
            <ShieldCheck className="w-3 h-3 text-amber-600 shrink-0" />
            <span>Upload Date Guard: Running clock stopped</span>
          </div>
        );
      }
      return null;
    }

    return (
      <div
        className="flex items-center flex-wrap gap-1.5 text-xs font-mono bg-amber-50/80 border border-amber-200/90 px-2 py-0.5 rounded-md shadow-2xs"
        title={`Real Video Upload Date & Time (${verifiedUpload.source || 'Video Metadata'}): ${verifiedUpload.dmyDate || verifiedUpload.isoDate}${verifiedUpload.time ? ` at ${verifiedUpload.time}` : ''}`}
      >
        <div className="flex items-center gap-1">
          <Calendar className="w-3 h-3 text-indigo-600 shrink-0" />
          <span className="text-[9px] font-black text-gray-600 uppercase tracking-tight">Video Uploaded:</span>
          <strong className="font-black text-gray-950 text-[11px] tracking-tight bg-white px-1 rounded border border-gray-200">
            {verifiedUpload.dmyDate || verifiedUpload.isoDate}
          </strong>
        </div>
        {verifiedUpload.time && (
          <div className="flex items-center gap-1 pl-1.5 border-l border-amber-300">
            <Clock className="w-3 h-3 text-fuchsia-600 shrink-0" />
            <strong className="font-black text-fuchsia-950 bg-fuchsia-100 px-1 rounded border border-fuchsia-300 text-[10px]">
              {verifiedUpload.time}
            </strong>
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-2 text-xs text-gray-500 bg-indigo-50/40 p-2.5 rounded-xl border border-indigo-100">
        <div className="flex items-center gap-2 animate-pulse">
          <div className="w-10 h-10 bg-indigo-200/60 rounded-lg flex items-center justify-center flex-shrink-0 text-indigo-400">
            <Film className="w-5 h-5 animate-spin" />
          </div>
          <div className="flex-1 space-y-1.5">
            <div className="h-3 bg-indigo-200/60 rounded w-3/4" />
            <div className="h-2.5 bg-indigo-200/40 rounded w-1/2 flex items-center gap-1">
              <span className="text-[10px] text-indigo-600 font-mono font-bold">Verifying video metadata & upload date...</span>
            </div>
          </div>
        </div>
        {verifiedUpload.isVerified && (
          <div className="pt-1.5 border-t border-indigo-100/80 flex items-center justify-between flex-wrap gap-1.5">
            {renderUploadDateBadge()}
          </div>
        )}
      </div>
    );
  }

  if (!data) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="flex flex-col gap-2 text-xs bg-gray-50 hover:bg-gray-100 border border-gray-100 p-2.5 rounded-xl transition overflow-hidden group">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-gray-200 rounded-lg flex items-center justify-center flex-shrink-0 text-gray-400 group-hover:text-blue-500 transition">
            {isReel ? <Film className="w-4 h-4 text-indigo-600" /> : <LinkIcon className="w-4 h-4" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              {reelBadge && (
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shadow-2xs font-mono uppercase ${reelBadge.color}`}>
                  🎬 {reelBadge.label}
                </span>
              )}
              <p className="text-gray-600 truncate group-hover:text-blue-600 transition font-mono text-[11px]">{url}</p>
            </div>
          </div>
        </div>
        {verifiedUpload.isVerified && (
          <div className="pt-1.5 border-t border-gray-200/70 flex items-center justify-between flex-wrap gap-1.5">
            {renderUploadDateBadge()}
          </div>
        )}
      </a>
    );
  }

  const effectiveOriginalViews = displayViewsOverride !== undefined
    ? displayViewsOverride
    : (data.originalViews !== undefined ? data.originalViews : data.views);

  const serverBlockedVal = data.abnormalMonitor?.abnormalBlocked ? data.abnormalMonitor.blockedAbnormalValue : undefined;
  const activeAbnormalStop = abnormalStoppedInfo || (serverBlockedVal ? {
    stoppedValue: serverBlockedVal,
    originalValue: effectiveOriginalViews || 0,
    reason: data.abnormalMonitor?.blockReason || 'Abnormal view stopped by monitor'
  } : null);

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block text-left bg-white hover:bg-gray-50 border border-gray-200/90 rounded-xl overflow-hidden transition shadow-xs group">
      {data.image && (
        <div className="w-full h-36 bg-gray-900 overflow-hidden relative">
          <img src={data.image} alt="Preview" className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
          
          {reelBadge && (
            <div className="absolute top-2 left-2 shadow-md">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 font-mono uppercase tracking-wider backdrop-blur-md ${reelBadge.color}`}>
                <Film className="w-3 h-3" /> {reelBadge.label}
              </span>
            </div>
          )}

          {activeAbnormalStop && (
            <div
              className="absolute top-2 right-2 bg-rose-600/95 backdrop-blur-md text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg flex items-center gap-1 border border-rose-300/40 font-mono"
              title={activeAbnormalStop.reason}
            >
              <ShieldAlert className="w-3 h-3 text-rose-100 shrink-0" />
              <span>Stopped Abnormal: {activeAbnormalStop.stoppedValue.toLocaleString('en-IN')}</span>
            </div>
          )}

          {effectiveOriginalViews !== undefined && effectiveOriginalViews > 0 && (
            <div
              className="absolute bottom-2 right-2 bg-black/85 backdrop-blur-md text-white text-xs font-bold px-2.5 py-1 rounded-lg shadow-lg flex items-center gap-1.5 border border-emerald-400/30 font-mono"
              title={data.viewSource ? `Original View Source: ${data.viewSource}` : 'Verified Original Views'}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>{effectiveOriginalViews.toLocaleString('en-IN')} original views</span>
            </div>
          )}
        </div>
      )}
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <h4 className="font-bold text-gray-900 text-xs sm:text-sm line-clamp-1 group-hover:text-blue-600 transition flex-1">
            {data.title || url}
          </h4>
          {!data.image && reelBadge && (
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border font-mono uppercase shrink-0 ${reelBadge.color}`}>
              🎬 {reelBadge.label}
            </span>
          )}
        </div>

        {data.description && (
          <p className="text-[11px] text-gray-500 mt-1 line-clamp-2 leading-relaxed">{data.description}</p>
        )}

        {activeAbnormalStop && (
          <div className="mt-2 flex items-center justify-between gap-1.5 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1 text-[10px] font-mono text-rose-800">
            <div className="flex items-center gap-1 min-w-0">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-600 shrink-0" />
              <span className="truncate font-bold">
                Abnormal Stopped: <span className="line-through text-rose-500">{activeAbnormalStop.stoppedValue.toLocaleString('en-IN')}</span>
              </span>
            </div>
            <span className="font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded shrink-0">
              Original: {activeAbnormalStop.originalValue > 0 ? activeAbnormalStop.originalValue.toLocaleString('en-IN') : 'Verified Only'}
            </span>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 mt-2.5 pt-2 border-t border-gray-100">
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-gray-400 uppercase tracking-wider">
            <ExternalLink className="w-3 h-3" />
            <span>{data.domain || new URL(url.startsWith('http') ? url : 'https://' + url).hostname}</span>
          </div>

          {/* Original Reel Views Badge */}
          {effectiveOriginalViews !== undefined && effectiveOriginalViews > 0 && (
            <div
              className="text-[11px] font-bold text-emerald-800 flex items-center gap-1 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-lg shadow-2xs font-mono"
              title={data.viewSource ? `Verified Source: ${data.viewSource}` : 'Original Views from video link'}
            >
              <ShieldCheck className="w-3 h-3 text-emerald-600" />
              <span>{effectiveOriginalViews.toLocaleString('en-IN')} original views</span>
            </div>
          )}

          {renderUploadDateBadge()}
        </div>
      </div>
    </a>
  );
}
