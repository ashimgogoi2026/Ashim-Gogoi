import { useState, useEffect } from 'react';

/**
 * Utility functions for Indian Standard Time (IST) / Asia/Kolkata timezone formatting
 */

export interface KolkataFormattedTime {
  date: string;
  time: string;
  full: string;
  isoDate: string;
}

export interface VerifiedUploadDateTime {
  isVerified: boolean;
  isoDate?: string;          // YYYY-MM-DD in Asia/Kolkata
  displayDate?: string;      // e.g. 03 Oct 2026
  dmyDate?: string;          // e.g. 03-10-2026
  time?: string;             // e.g. 01:43 PM IST
  source?: string;           // Metadata source label
  runningClockBlocked?: boolean;
  blockReason?: string;
}

/**
 * Synchronously extracts authentic upload timestamp from immutable URL shortcodes / snowflakes
 * (Instagram Reels/Posts, TikTok videos, X/Twitter statuses) in 0ms without network latency.
 */
export function extractInstantUrlUploadDateTime(url?: string | null): VerifiedUploadDateTime | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  const minValidMs = new Date('2010-01-01T00:00:00Z').getTime();
  const maxValidMs = Date.now() + 60 * 1000;

  // 1. Instagram Reel / Post shortcode snowflake decoding
  if (trimmed.includes('instagram.com')) {
    const igMatch = trimmed.match(/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]{8,15})/);
    if (igMatch && igMatch[1]) {
      const rawCode = igMatch[1].slice(0, 11);
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
      let id = 0n;
      let valid = true;
      for (let i = 0; i < rawCode.length; i++) {
        const idx = alphabet.indexOf(rawCode[i]);
        if (idx < 0) {
          valid = false;
          break;
        }
        id = id * 64n + BigInt(idx);
      }
      if (valid && id > 0n) {
        const instaEpoch = 1314220021721n;
        const timeMs = Number((id >> 23n) + instaEpoch);
        if (timeMs >= minValidMs && timeMs <= maxValidMs) {
          const parsed = new Date(timeMs);
          const kolkata = formatToKolkataTime(parsed);
          if (kolkata) {
            const parts = kolkata.isoDate.split('-');
            const dmyDate = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : kolkata.isoDate;
            return {
              isVerified: true,
              isoDate: kolkata.isoDate,
              displayDate: kolkata.date,
              dmyDate,
              time: kolkata.time,
              source: 'Instagram Media Shortcode Metadata'
            };
          }
        }
      }
    }
  }

  // 2. TikTok Video ID snowflake decoding
  if (trimmed.includes('tiktok.com')) {
    const ttMatch = trimmed.match(/\/video\/(\d{15,22})/);
    if (ttMatch && ttMatch[1]) {
      try {
        const tsSec = Number(BigInt(ttMatch[1]) >> 32n);
        const timeMs = tsSec * 1000;
        if (timeMs >= minValidMs && timeMs <= maxValidMs) {
          const parsed = new Date(timeMs);
          const kolkata = formatToKolkataTime(parsed);
          if (kolkata) {
            const parts = kolkata.isoDate.split('-');
            const dmyDate = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : kolkata.isoDate;
            return {
              isVerified: true,
              isoDate: kolkata.isoDate,
              displayDate: kolkata.date,
              dmyDate,
              time: kolkata.time,
              source: 'TikTok Video ID Metadata'
            };
          }
        }
      } catch {}
    }
  }

  // 3. X / Twitter Status ID snowflake decoding
  if (trimmed.includes('twitter.com') || trimmed.includes('x.com')) {
    const twMatch = trimmed.match(/(?:status|statuses)\/(\d{15,22})/);
    if (twMatch && twMatch[1]) {
      try {
        const timeMs = Number((BigInt(twMatch[1]) >> 22n) + 1288834974657n);
        if (timeMs >= minValidMs && timeMs <= maxValidMs) {
          const parsed = new Date(timeMs);
          const kolkata = formatToKolkataTime(parsed);
          if (kolkata) {
            const parts = kolkata.isoDate.split('-');
            const dmyDate = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : kolkata.isoDate;
            return {
              isVerified: true,
              isoDate: kolkata.isoDate,
              displayDate: kolkata.date,
              dmyDate,
              time: kolkata.time,
              source: 'X/Twitter Status Snowflake Metadata'
            };
          }
        }
      } catch {}
    }
  }

  return null;
}

/**
 * Normalize a date string (YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY, MM/DD/YYYY) into ISO YYYY-MM-DD and DD-MM-YYYY
 */
function normalizeHistoricalDateString(rawDate?: string | null): { isoDate: string; dmyDate: string } | null {
  if (!rawDate || typeof rawDate !== 'string') return null;
  const clean = rawDate.trim();
  if (!clean) return null;

  // YYYY-MM-DD
  const isoMatch = clean.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = isoMatch[2].padStart(2, '0');
    const d = isoMatch[3].padStart(2, '0');
    return { isoDate: `${y}-${m}-${d}`, dmyDate: `${d}-${m}-${y}` };
  }

  // DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = clean.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmyMatch) {
    const p1 = parseInt(dmyMatch[1], 10);
    const p2 = parseInt(dmyMatch[2], 10);
    const y = dmyMatch[3];
    const day = String(p1 > 12 ? p1 : p1).padStart(2, '0');
    const month = String(p1 > 12 ? p2 : p2).padStart(2, '0');
    return { isoDate: `${y}-${month}-${day}`, dmyDate: `${day}-${month}-${y}` };
  }

  const parsed = new Date(clean);
  if (!isNaN(parsed.getTime())) {
    const kolkata = formatToKolkataTime(parsed);
    if (kolkata) {
      const parts = kolkata.isoDate.split('-');
      const dmyDate = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : kolkata.isoDate;
      return { isoDate: kolkata.isoDate, dmyDate };
    }
  }

  return null;
}

/**
 * Real Upload Date & Time Guard:
 * Ensures we ONLY display authentic historical video upload dates & times collected from video metadata,
 * and NEVER display the current/running scrape date or time.
 */
export function verifyRealUploadDateTime(
  data?: {
    publishedAt?: string | null;
    publishedDate?: string | null;
    publishedTime?: string | null;
    uploadDateSource?: string | null;
    isRealUploadDateVerified?: boolean;
    fetchedAt?: number;
    uploadDateGuard?: {
      verified?: boolean;
      source?: string;
      runningClockBlocked?: boolean;
      blockedTimestamp?: string;
      reason?: string;
    };
  } | null,
  url?: string | null,
  fallbackTaskMeta?: {
    releaseDate?: string | null;
    uploadTime?: string | null;
    publishedAt?: string | null;
    publishedDate?: string | null;
    publishedTime?: string | null;
  } | null
): VerifiedUploadDateTime {
  const guardInfo = data?.uploadDateGuard;
  const referenceNow = typeof data?.fetchedAt === 'number' && data.fetchedAt > 0 ? data.fetchedAt : Date.now();
  const minValidMs = new Date('2010-01-01T00:00:00Z').getTime();

  // 1. Check server-extracted publishedAt ISO timestamp
  const candidatePublishedAt = data?.publishedAt || fallbackTaskMeta?.publishedAt;
  const candidatePublishedDate = data?.publishedDate || fallbackTaskMeta?.publishedDate;
  const candidatePublishedTime = data?.publishedTime || fallbackTaskMeta?.publishedTime;

  if (candidatePublishedAt) {
    const parsed = new Date(candidatePublishedAt);
    const tsMs = parsed.getTime();
    if (!isNaN(tsMs)) {
      if (tsMs >= minValidMs && tsMs <= Date.now() + 60 * 1000) {
        const isImmutableSnowflake = Boolean(
          data?.uploadDateSource && /Media ID|Snowflake|Shortcode|Scoped|Creation Time|Publish Time/i.test(data.uploadDateSource)
        );
        if (isImmutableSnowflake || Math.abs(referenceNow - tsMs) >= 180 * 1000) {
          const kolkata = formatToKolkataTime(parsed);
          const isoDate = candidatePublishedDate || kolkata?.isoDate;
          const parts = isoDate ? isoDate.split('-') : [];
          const dmyDate = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : isoDate;
          const authenticTime = candidatePublishedTime || kolkata?.time || undefined;

          return {
            isVerified: true,
            isoDate,
            displayDate: kolkata?.date || dmyDate,
            dmyDate,
            time: authenticTime,
            source: data?.uploadDateSource || guardInfo?.source || 'Video Metadata',
            runningClockBlocked: Boolean(guardInfo?.runningClockBlocked),
            blockReason: guardInfo?.reason
          };
        }
      }
    }
  }

  // 2. Check server-extracted publishedDate (YYYY-MM-DD)
  if (candidatePublishedDate) {
    const norm = normalizeHistoricalDateString(candidatePublishedDate);
    if (norm) {
      return {
        isVerified: true,
        isoDate: norm.isoDate,
        displayDate: norm.dmyDate,
        dmyDate: norm.dmyDate,
        time: candidatePublishedTime || undefined,
        source: data?.uploadDateSource || guardInfo?.source || 'Video Metadata',
        runningClockBlocked: Boolean(guardInfo?.runningClockBlocked),
        blockReason: guardInfo?.reason
      };
    }
  }

  // 3. Instant URL Shortcode / Snowflake extraction (Instagram / TikTok / X)
  if (url) {
    const instantUrlMeta = extractInstantUrlUploadDateTime(url);
    if (instantUrlMeta && instantUrlMeta.isVerified) {
      return instantUrlMeta;
    }
  }

  // 4. Fallback to recorded task releaseDate / uploadTime if available (never a live running clock)
  if (fallbackTaskMeta?.releaseDate) {
    const norm = normalizeHistoricalDateString(fallbackTaskMeta.releaseDate);
    if (norm) {
      const cleanTime = fallbackTaskMeta.uploadTime?.trim();
      const formattedTime = cleanTime
        ? (cleanTime.toUpperCase().includes('IST') ? cleanTime : `${cleanTime} IST`)
        : undefined;
      return {
        isVerified: true,
        isoDate: norm.isoDate,
        displayDate: norm.dmyDate,
        dmyDate: norm.dmyDate,
        time: formattedTime,
        source: 'Recorded Release Metadata',
        runningClockBlocked: Boolean(guardInfo?.runningClockBlocked),
        blockReason: guardInfo?.reason
      };
    }
  }

  if (guardInfo?.runningClockBlocked) {
    return {
      isVerified: false,
      runningClockBlocked: true,
      blockReason: guardInfo.reason || 'Blocked current/running clock timestamp'
    };
  }

  return {
    isVerified: false,
    runningClockBlocked: Boolean(guardInfo?.runningClockBlocked),
    blockReason: guardInfo?.reason
  };
}

/**
 * Format any ISO date string or Date object into Asia/Kolkata (IST) time
 */
export function formatToKolkataTime(input?: string | Date | null): KolkataFormattedTime | null {
  if (!input) return null;
  const d = typeof input === 'string' ? new Date(input) : input;
  if (isNaN(d.getTime())) return null;

  try {
    const time = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).format(d).toUpperCase() + ' IST';

    const date = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    }).format(d);

    const isoDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(d);

    return {
      date,
      time,
      full: `${date} at ${time}`,
      isoDate
    };
  } catch (err) {
    return null;
  }
}

/**
 * React hook to get a live real-time Indian Standard Time (IST / Asia/Kolkata) clock
 */
export function useLiveKolkataClock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  try {
    const timeString = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(now).toUpperCase();

    const dateString = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    }).format(now);

    return {
      timeString: `${timeString} IST`,
      dateString,
      fullString: `${dateString} • ${timeString} IST`
    };
  } catch (err) {
    return {
      timeString: now.toLocaleTimeString() + ' IST',
      dateString: now.toLocaleDateString(),
      fullString: `${now.toLocaleDateString()} ${now.toLocaleTimeString()} IST`
    };
  }
}
