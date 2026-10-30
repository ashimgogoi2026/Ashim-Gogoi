// Shared HTML Entity Decoder
export const decodeEntities = (str: string): string => {
  if (!str) return '';
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&#([0-9]+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#xb7;/g, '·')
    .replace(/&#064;/g, '@')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
};

// Robust meta tag extractor supporting both property="..." content="..." and content="..." property="..."
export const extractMetaTag = (html: string, propOrName: string): string => {
  if (!html) return '';
  const escaped = propOrName.replace(/[:.]/g, '\\$&');
  const r1 = new RegExp(`<meta\\s+[^>]*?(?:property|name)=["']${escaped}["'][^>]*?content=["']([^"']*)["']`, 'i');
  const r2 = new RegExp(`<meta\\s+[^>]*?content=["']([^"']*)["'][^>]*?(?:property|name)=["']${escaped}["']`, 'i');
  const m1 = html.match(r1);
  if (m1 && m1[1]) return decodeEntities(m1[1]);
  const m2 = html.match(r2);
  if (m2 && m2[1]) return decodeEntities(m2[1]);
  return '';
};

export const extractTagContent = (html: string, tagName: string): string => {
  if (!html) return '';
  const r = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const m = html.match(r);
  return m && m[1] ? decodeEntities(m[1].trim()) : '';
};

// Helper to normalize Indic digits (Bengali/Assamese ০-৯, Hindi/Devanagari ०-९)
export const normalizeIndicDigits = (str: string): string => {
  const bengaliDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  const devanagariDigits = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];
  let res = str;
  for (let i = 0; i < 10; i++) {
    res = res.split(bengaliDigits[i]).join(String(i));
    res = res.split(devanagariDigits[i]).join(String(i));
  }
  return res;
};

// Helper to parse count strings like "47K", "1.2M", "1.4 লাখ", "61 হাজাৰ", "16,500", "1.2 কোটি", "14 lakh"
export const parseCountStr = (rawStr: string): number | undefined => {
  if (!rawStr) return undefined;
  const clean = normalizeIndicDigits(rawStr).replace(/,/g, '').trim().toUpperCase();
  let multiplier = 1;
  if (/লাখ|लाख|LAKH|LAC/.test(clean)) multiplier = 100000;
  else if (/হাজাৰ|হাজার|हज़ार|हजार/.test(clean)) multiplier = 1000;
  else if (/কোটি|करोड़|CRORE|CR/.test(clean)) multiplier = 10000000;
  else if (clean.endsWith('K')) multiplier = 1000;
  else if (clean.endsWith('M')) multiplier = 1000000;
  else if (clean.endsWith('B')) multiplier = 1000000000;

  const numStr = clean.replace(/[^0-9.]/g, '');
  const parsed = parseFloat(numStr);
  if (isNaN(parsed) || parsed <= 0) return undefined;
  const val = Math.floor(parsed * multiplier);
  if (val < 5 || val > 500000000) return undefined;
  return val;
};

// Helper to extract localized views from text in English, Assamese, Bengali, and Hindi
export const extractViewsFromText = (text: string): number | undefined => {
  if (!text) return undefined;
  const normalized = normalizeIndicDigits(text);

  // 1. Regional pattern: e.g. "১.৪ লাখ টা ভিউ", "৬১ হাজাৰ টা ভিউ", "1.4 lakh views", "60 हजार व्यू", "1.2 কোটি টা ভিউ"
  const regionalMatch = normalized.match(/([\d\.]+)\s*(লাখ|लाख|হাজাৰ|হাজার|हज़ार|हजार|কোটি|करोड़|lakh|lac|crore)\s*(?:টা\s*)?(?:ভিউ|ভিউজ|দেখা\s*হৈছে|দেখা\s*হয়েছে|দেখা\s*হয়েছে|ভিউৰ|ভিউচ্|ভিউয়|व्यू|बार\s*देखा\s*गया|views?|plays?)/i)
                     || normalized.match(/(?:ভিউ|দেখা\s*হৈছে|দেখা\s*হয়েছে|ভিউৰ|ভিউচ্|ভিউয়|व्यू|views?|plays?):\s*([\d\.]+)\s*(লাখ|लाख|হাজাৰ|হাজার|हज़ार|हजार|কোটি|करोड़)?/i);
  if (regionalMatch) {
    const numPart = regionalMatch[1];
    const unitPart = regionalMatch[2] || '';
    const parsed = parseCountStr(`${numPart} ${unitPart}`);
    if (parsed !== undefined) return parsed;
  }

  // 2. Colon / Prefix pattern: e.g. "Views: 140K", "ভিউ: ৪৭K"
  const prefixMatch = normalized.match(/\b(?:views?|plays?|reels?\s*views?|view\s*count|ভিউ|দেখা\s*হৈছে|দেখা\s*হয়েছে|ভিউৰ|व्यू):\s*([\d\.,]+[KMBkmb]?)\b/i);
  if (prefixMatch && prefixMatch[1]) {
    const parsed = parseCountStr(prefixMatch[1]);
    if (parsed !== undefined) return parsed;
  }

  // 3. Standard phrase pattern: e.g. "1.4M views · 12K reactions", "140K views, 3.2K likes", "17K views", "1.4M plays", "61K টা ভিউ"
  const stdMatch = normalized.match(/\b([\d\.,]+[KMBkmb]?)\s*(?:টা\s*)?(?:views?|plays?|watch(?:es)?|people\s+watched|times\s+viewed|times\s+played)\b(?!\s*port)/i);
  if (stdMatch && stdMatch[1]) {
    const parsed = parseCountStr(stdMatch[1]);
    if (parsed !== undefined) return parsed;
  }

  return undefined;
};

// Check for generic Facebook titles / login placeholders
export const isGenericFbTitle = (t?: string): boolean => {
  if (!t) return true;
  const lower = t.toLowerCase().trim();
  return lower.includes('discover popular videos') || 
         lower === 'facebook' || 
         lower === 'video | facebook' || 
         lower === 'watch | facebook' || 
         lower === 'videos | facebook' || 
         lower.startsWith('log in to facebook') ||
         lower.includes('log in or sign up');
};

export const isGenericFbDesc = (d?: string): boolean => {
  if (!d) return true;
  const lower = d.toLowerCase().trim();
  return lower.includes('video is the place to enjoy videos and shows together') ||
         lower.includes('log in to facebook to start sharing') ||
         lower.includes('log into facebook') ||
         lower.includes('connect with friends and the world around you');
};

// Parse views from Facebook HTML payload
export const parseFacebookViewsFromHtml = (html: string, reelId?: string | null): number | undefined => {
  if (!html) return undefined;

  // 1. Text patterns in og:title / og:description e.g. "১.৪ লাখ টা ভিউ | Reel by Debajani Bora Dutta", "1.4M views · 12K reactions"
  const ogTitle = extractMetaTag(html, 'og:title');
  const ogDesc = extractMetaTag(html, 'og:description');
  const desc = extractMetaTag(html, 'description');
  const twDesc = extractMetaTag(html, 'twitter:description');
  const combinedMeta = `${ogTitle} ${ogDesc} ${desc} ${twDesc}`;

  const textViews = extractViewsFromText(combinedMeta);
  if (textViews !== undefined && textViews >= 5) return textViews;

  // 2. Check JSON-LD interactionStatistic / userInteractionCount
  try {
    const jsonLdMatches = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    for (const match of jsonLdMatches) {
      if (match[1]) {
        try {
          const parsed = JSON.parse(match[1]);
          const stat = parsed.interactionStatistic;
          const count = stat?.userInteractionCount || parsed.userInteractionCount || stat?.interactionCount;
          if (count) {
            const num = parseInt(String(count).replace(/[^0-9]/g, ''), 10);
            if (!isNaN(num) && num >= 5 && num <= 500000000) return num;
          }
        } catch (e) {}
      }
    }
  } catch (e) {}

  // 3. Relay / GraphQL SSR JSON counts
  const relayPatterns = [
    /"video_view_count"\s*:\s*"?(\d+)"?/i,
    /"play_count"\s*:\s*"?(\d+)"?/i,
    /"reels_total_plays"\s*:\s*"?(\d+)"?/i,
    /"reels_total_views"\s*:\s*"?(\d+)"?/i,
    /"video_play_count"\s*:\s*"?(\d+)"?/i,
    /"post_view_count"\s*:\s*"?(\d+)"?/i,
    /"views_count"\s*:\s*"?(\d+)"?/i,
    /"unified_play_count"\s*:\s*"?(\d+)"?/i,
    /"video_views"\s*:\s*\{\s*"count"\s*:\s*"?(\d+)"?/i,
    /\\"video_view_count\\"\s*:\s*\\"?(\d+)\\"?/i,
    /\\"play_count\\"\s*:\s*\\"?(\d+)\\"?/i,
    /\\"reels_total_plays\\"\s*:\s*\\"?(\d+)\\"?/i
  ];

  for (const regex of relayPatterns) {
    const m = html.match(regex);
    if (m && m[1]) {
      const val = parseInt(m[1], 10);
      if (!isNaN(val) && val >= 5 && val <= 500000000) return val;
    }
  }

  // 4. Raw text search in stripped HTML (excluding scripts and styles)
  const cleanText = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  const rawTextViews = extractViewsFromText(cleanText);
  if (rawTextViews !== undefined && rawTextViews >= 5) return rawTextViews;

  return undefined;
};

// Robust, high-fidelity Facebook video and reel resolver
export async function resolveFacebookMetadata(rawUrl: string): Promise<{
  views?: number;
  title?: string;
  description?: string;
  image?: string;
  reelId?: string;
  creator?: string;
  publishedDate?: string;
  publishedTime?: string;
  publishedAt?: string;
  formattedUploadDateTime?: string;
}> {
  try {
    let url = rawUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    // Extract any existing numeric ID from URL
    let fbReelId: string | null = null;
    const directNumMatch = url.match(/(?:reel\/|watch\/\?v=|watch\?v=|videos\/|video\.php\?v=)(\d{6,})/i);
    if (directNumMatch && directNumMatch[1]) {
      fbReelId = directNumMatch[1];
    }

    // Follow redirect to resolve share slugs (/share/r/, /share/v/, fb.watch) and obtain destination URL
    let resolvedUrl = url;
    let initialHtml = '';

    try {
      const headOrGet = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'User-Agent': 'Twitterbot/1.0',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Sec-Fetch-Mode': 'navigate'
        },
        signal: AbortSignal.timeout(6000)
      });
      if (headOrGet.ok) {
        initialHtml = await headOrGet.text();
        resolvedUrl = headOrGet.url || url;
      }
    } catch (e) {
      // Continue with url
    }

    // Inspect resolved URL and decoded URL for reel ID
    const checkUrls = [resolvedUrl, decodeURIComponent(resolvedUrl), url, decodeURIComponent(url)];
    for (const u of checkUrls) {
      if (fbReelId) break;
      const m = u.match(/(?:reel\/|watch\/\?v=|watch\?v=|videos\/|video\.php\?v=)(\d{6,})/i)
             || u.match(/next=[^&]*(?:reel%2F|watch%3Fv%3D|videos%2F)(\d{6,})/i);
      if (m && m[1]) {
        fbReelId = m[1];
      }
    }

    // Also check initialHtml for canonical or og:url or android url
    if (!fbReelId && initialHtml) {
      const canonicalMatch = initialHtml.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)
                          || extractMetaTag(initialHtml, 'og:url')
                          || extractMetaTag(initialHtml, 'al:android:url');
      const canonicalStr = typeof canonicalMatch === 'string' ? canonicalMatch : (canonicalMatch && canonicalMatch[1] ? canonicalMatch[1] : '');
      if (canonicalStr) {
        const decoded = decodeURIComponent(canonicalStr);
        const m = decoded.match(/(?:reel\/|watch\/\?v=|videos\/|video\.php\?v=|\/video\/)(\d{6,})/i);
        if (m && m[1]) fbReelId = m[1];
      }
    }

    // Prepare candidate surfaces to query
    const candidateUrls: string[] = [];
    if (fbReelId) {
      candidateUrls.push(`https://www.facebook.com/watch/?v=${fbReelId}`);
      candidateUrls.push(`https://www.facebook.com/reel/${fbReelId}`);
      candidateUrls.push(`https://m.facebook.com/watch/?v=${fbReelId}`);
    }
    if (resolvedUrl && !candidateUrls.includes(resolvedUrl)) {
      candidateUrls.push(resolvedUrl);
    }
    if (url && !candidateUrls.includes(url)) {
      candidateUrls.push(url);
    }

    let combinedHtml = initialHtml;

    // Fetch candidate pages if views/metadata not found yet
    for (const candUrl of candidateUrls) {
      const currentViews = parseFacebookViewsFromHtml(combinedHtml, fbReelId);
      if (currentViews !== undefined) break;

      for (const ua of ['Twitterbot/1.0', 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)']) {
        try {
          const res = await fetch(candUrl, {
            redirect: 'follow',
            headers: {
              'User-Agent': ua,
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9',
              'Sec-Fetch-Mode': 'navigate'
            },
            signal: AbortSignal.timeout(4500)
          });
          if (res.ok) {
            const h = await res.text();
            combinedHtml = `${combinedHtml}\n${h}`;
            const v = parseFacebookViewsFromHtml(combinedHtml, fbReelId);
            if (v !== undefined) break;
          }
        } catch (e) {}
      }
    }

    // Extract meta fields using order-agnostic meta extractor
    const title = extractMetaTag(combinedHtml, 'og:title') || extractMetaTag(combinedHtml, 'twitter:title') || extractTagContent(combinedHtml, 'title');
    const description = extractMetaTag(combinedHtml, 'og:description') || extractMetaTag(combinedHtml, 'twitter:description') || extractMetaTag(combinedHtml, 'description');
    const image = extractMetaTag(combinedHtml, 'og:image') || extractMetaTag(combinedHtml, 'twitter:image');

    // Parse views
    const views = parseFacebookViewsFromHtml(combinedHtml, fbReelId);

    // Clean and enhance Title & Creator
    let finalTitle = title;
    let creatorName: string | undefined = undefined;

    // Check for creator name in description (e.g. "Reel by Debajani Bora Dutta", "Watch Videos from ...", "Video by ...")
    const creatorMatch = (description || '').match(/(?:Reel by|Video by|Watch Videos from)\s+([^·|,\n]+)/i)
                      || combinedHtml.match(/["'](?:owner_name|author_name|creator_name)["']\s*:\s*["']([^"']+)["']/i);
    if (creatorMatch && creatorMatch[1]) {
      creatorName = decodeEntities(creatorMatch[1]).trim();
    }

    // Clean generic title
    const isGeneric = !finalTitle || isGenericFbTitle(finalTitle);
    if (isGeneric) {
      if (creatorName) {
        finalTitle = `${creatorName} - Facebook Reel`;
      } else if (description && !isGenericFbDesc(description)) {
        const firstLine = description.split('\n')[0].replace(/^[0-9\.,KMBkmb\s·]+(?:views?|plays?|reactions?)\s*[·|]?\s*/i, '').trim();
        finalTitle = firstLine ? firstLine.slice(0, 100) : (fbReelId ? `Facebook Reel #${fbReelId.slice(-6)}` : 'Facebook Reel Post');
      } else if (fbReelId) {
        finalTitle = `Facebook Reel #${fbReelId.slice(-6)}`;
      } else {
        finalTitle = 'Facebook Reel Post';
      }
    } else {
      // Strip trailing " | Facebook" or " - Facebook"
      finalTitle = finalTitle.replace(/\s*[|\-]\s*Facebook$/i, '').trim();
    }

    let finalDesc = description;
    if (isGenericFbDesc(finalDesc)) {
      finalDesc = creatorName ? `Facebook Reel video by ${creatorName}` : 'Facebook Reel video';
    }

    // Date extraction from HTML
    let datePublished: string | undefined = undefined;
    let datePublishedAt: string | undefined = undefined;
    const dateMatch = extractMetaTag(combinedHtml, 'video:release_date')
                   || extractMetaTag(combinedHtml, 'og:updated_time')
                   || extractMetaTag(combinedHtml, 'article:published_time')
                   || combinedHtml.match(/"uploadDate"\s*:\s*"([^"]+)"/i)?.[1]
                   || combinedHtml.match(/"datePublished"\s*:\s*"([^"]+)"/i)?.[1];
    if (dateMatch) {
      try {
        const d = new Date(dateMatch);
        if (!isNaN(d.getTime())) {
          datePublishedAt = d.toISOString();
          datePublished = d.toISOString().split('T')[0];
        }
      } catch (e) {}
    }

    return {
      views,
      title: finalTitle,
      description: finalDesc,
      image: image || undefined,
      reelId: fbReelId || undefined,
      creator: creatorName,
      publishedDate: datePublished,
      publishedAt: datePublishedAt
    };
  } catch (err) {
    console.error('[Facebook Resolver Error]:', err);
    return {};
  }
}
