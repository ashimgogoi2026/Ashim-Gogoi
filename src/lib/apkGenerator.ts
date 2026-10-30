import JSZip from 'jszip';
import { Influencer, Task } from '../types';

export interface CompletedTaskLiteRecord {
  id: string;
  videoId: string;
  title: string;
  influencerId: string;
  influencerName: string;
  influencerMobile: string;
  product: string;
  uploadDate: string;
  dueDate: string;
  status: string;
  views: number;
  clicks: number;
  humanClicks: number;
  ctrPercent: number;
  platform: 'Instagram' | 'Facebook' | 'YouTube' | 'Multi' | 'Video';
  videoLinks: string[];
  shortIoLink: string;
}

export interface AwaitingUploadLiteRecord {
  id: string;
  videoId: string;
  influencerId: string;
  influencerName: string;
  influencerMobile: string;
  product: string;
  scheduledDate: string;
  dueDate: string;
  status: string;
  readyToUpload: boolean;
  sampleSent: boolean;
}

export interface MobileLiteSnapshotPayload {
  generatedAt: string;
  agencyName: string;
  totalCompletedTasks: number;
  totalAwaitingUploads: number;
  totalVideoLinks: number;
  totalViews: number;
  totalClicks: number;
  totalHumanClicks: number;
  overallCtrPercent: number;
  items: CompletedTaskLiteRecord[];
  awaitingItems: AwaitingUploadLiteRecord[];
}

function normalizeUrlForLookup(url?: string): string {
  if (!url || typeof url !== 'string') return '';
  let clean = url.trim();
  if (!clean) return '';
  if (!/^https?:\/\//i.test(clean)) {
    clean = 'https://' + clean;
  }
  try {
    const parsed = new URL(clean);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const path = parsed.pathname.replace(/\/+$/, '');
    return `${host}${path}${parsed.search}`.toLowerCase();
  } catch {
    return clean.toLowerCase().replace(/\/+$/, '');
  }
}

export function detectVideoPlatform(links: string[]): 'Instagram' | 'Facebook' | 'YouTube' | 'Multi' | 'Video' {
  const platforms = new Set<'Instagram' | 'Facebook' | 'YouTube'>();
  for (const link of links) {
    const lower = (link || '').toLowerCase();
    if (lower.includes('instagram.com') || lower.includes('instagr.am')) {
      platforms.add('Instagram');
    } else if (lower.includes('facebook.com') || lower.includes('fb.watch') || lower.includes('fb.com')) {
      platforms.add('Facebook');
    } else if (lower.includes('youtube.com') || lower.includes('youtu.be')) {
      platforms.add('YouTube');
    }
  }
  if (platforms.size > 1) return 'Multi';
  if (platforms.size === 1) return Array.from(platforms)[0];
  return 'Video';
}

export function buildMobileLiteSnapshot(
  tasks: Task[],
  influencers: Influencer[],
  agencyName = 'PRO-TO-GROW'
): MobileLiteSnapshotPayload {
  // 1. Read cached live video views from localStorage if available
  const liveViewsMap = new Map<string, number>();
  if (typeof window !== 'undefined') {
    try {
      const rawCache = window.localStorage.getItem('PTG_LIVE_LINK_PREVIEWS_CACHE_V2');
      if (rawCache) {
        const parsed = JSON.parse(rawCache);
        if (parsed && typeof parsed === 'object') {
          Object.entries(parsed).forEach(([url, entry]: [string, any]) => {
            const viewsVal = Number(entry?.data?.views || 0);
            if (viewsVal > 0) {
              liveViewsMap.set(url.trim(), viewsVal);
              liveViewsMap.set(normalizeUrlForLookup(url), viewsVal);
            }
          });
        }
      }
    } catch {
      // ignore storage parse error
    }
  }

  // 2. Read cached Short.io link clicks from localStorage if available
  const shortIoByTaskId = new Map<string, { totalClicks: number; humanClicks: number }>();
  const shortIoByUrl = new Map<string, { totalClicks: number; humanClicks: number }>();
  if (typeof window !== 'undefined') {
    try {
      const rawShortIo = window.localStorage.getItem('SHORT_IO_TRACKED_LINKS');
      if (rawShortIo) {
        const parsedLinks = JSON.parse(rawShortIo);
        if (Array.isArray(parsedLinks)) {
          parsedLinks.forEach((item: any) => {
            const totalClicks = Number(item?.totalClicks || 0);
            const humanClicks = Number(item?.humanClicks || 0);
            if (typeof item?.id === 'string' && item.id.startsWith('planner-')) {
              const tId = item.id.replace(/^planner-/, '');
              shortIoByTaskId.set(tId, { totalClicks, humanClicks });
            }
            if (item?.shortUrl) {
              shortIoByUrl.set(normalizeUrlForLookup(item.shortUrl), { totalClicks, humanClicks });
            }
            if (item?.originalUrl) {
              shortIoByUrl.set(normalizeUrlForLookup(item.originalUrl), { totalClicks, humanClicks });
            }
          });
        }
      }
    } catch {
      // ignore storage parse error
    }
  }

  // 3. Build Influencer lookup map
  const influencerMap = new Map<string, Influencer>();
  influencers.forEach((inf) => {
    if (inf?.id) influencerMap.set(inf.id, inf);
  });

  // 4. Separate Completed Video Tasks vs Awaiting Uploads
  const items: CompletedTaskLiteRecord[] = [];
  const awaitingItems: AwaitingUploadLiteRecord[] = [];
  let totalVideoLinks = 0;
  let totalViews = 0;
  let totalClicks = 0;
  let totalHumanClicks = 0;

  tasks.forEach((task) => {
    if (!task || task.status === 'Cancelled') return;

    const rawLinks = [task.videoLink1, task.videoLink2, task.videoLink3]
      .map((l) => (typeof l === 'string' ? l.trim() : ''))
      .filter(Boolean);

    const inf = influencerMap.get(task.influencerId);
    const influencerName =
      inf?.name ||
      (task as any).influencerName ||
      'Assigned Creator';
    const influencerMobile =
      task.influencerMobile ||
      inf?.mobile ||
      '';

    const product = (
      task.DeliverableProduct ||
      (Array.isArray(task.deliverableProducts) && task.deliverableProducts.length > 0
        ? task.deliverableProducts.join(', ')
        : '') ||
      task.title ||
      inf?.product ||
      'Campaign Video'
    ).trim();

    const isCompletedVideoTask = task.status === 'Completed' || rawLinks.length > 0;

    if (!isCompletedVideoTask) {
      // This task has no uploaded video links yet -> Awaiting Upload
      const scheduledDate = (
        task.videoUploadDate ||
        (task as any).releaseDate ||
        task.dueDate ||
        task.productSentDate ||
        ''
      ).trim();

      awaitingItems.push({
        id: task.id,
        videoId: task.videoId || '',
        influencerId: task.influencerId || '',
        influencerName,
        influencerMobile,
        product,
        scheduledDate,
        dueDate: task.dueDate || '',
        status: task.readyToUpload ? 'Ready to Upload' : (task.status || 'Awaiting Upload'),
        readyToUpload: Boolean(task.readyToUpload),
        sampleSent: Boolean(task.sampleSent || task.productSentDate)
      });
      return;
    }

    // Calculate best views count (max of task.views and summed live link views)
    let summedLinkViews = 0;
    rawLinks.forEach((link) => {
      const v =
        liveViewsMap.get(link) ??
        liveViewsMap.get(normalizeUrlForLookup(link)) ??
        0;
      summedLinkViews += v;
    });
    const resolvedViews = Math.max(Number(task.views || 0), summedLinkViews);

    // Calculate best clicks count
    const shortMatch =
      shortIoByTaskId.get(task.id) ||
      (task.shortIoLink ? shortIoByUrl.get(normalizeUrlForLookup(task.shortIoLink)) : undefined) ||
      (rawLinks[0] ? shortIoByUrl.get(normalizeUrlForLookup(rawLinks[0])) : undefined);

    const resolvedClicks = Math.max(Number(task.clicks || 0), Number(shortMatch?.totalClicks || 0));
    const resolvedHumanClicks =
      Number(shortMatch?.humanClicks || 0) > 0
        ? Number(shortMatch?.humanClicks || 0)
        : resolvedClicks;

    const ctrPercent =
      resolvedViews > 0
        ? Number(((resolvedClicks / resolvedViews) * 100).toFixed(2))
        : 0;

    const uploadDate = (
      task.videoUploadDate ||
      task.dueDate ||
      task.productSentDate ||
      ''
    ).trim();

    const record: CompletedTaskLiteRecord = {
      id: task.id,
      videoId: task.videoId || '',
      title: task.title || product,
      influencerId: task.influencerId || '',
      influencerName,
      influencerMobile,
      product,
      uploadDate,
      dueDate: task.dueDate || '',
      status: task.status === 'Completed' ? 'Completed' : 'Live Video',
      views: resolvedViews,
      clicks: resolvedClicks,
      humanClicks: resolvedHumanClicks,
      ctrPercent,
      platform: detectVideoPlatform(rawLinks),
      videoLinks: rawLinks,
      shortIoLink: (task.shortIoLink || '').trim()
    };

    items.push(record);
    totalVideoLinks += rawLinks.length;
    totalViews += resolvedViews;
    totalClicks += resolvedClicks;
    totalHumanClicks += resolvedHumanClicks;
  });

  // Sort completed tasks newest uploadDate / highest views first
  items.sort((a, b) => {
    const dateA = a.uploadDate || a.dueDate || '';
    const dateB = b.uploadDate || b.dueDate || '';
    if (dateA !== dateB) return dateB.localeCompare(dateA);
    return b.views - a.views;
  });

  // Sort awaiting uploads by scheduledDate / influencerName
  awaitingItems.sort((a, b) => {
    const dateA = a.scheduledDate || a.dueDate || '';
    const dateB = b.scheduledDate || b.dueDate || '';
    if (dateA !== dateB) return dateB.localeCompare(dateA);
    return a.influencerName.localeCompare(b.influencerName);
  });

  const overallCtrPercent =
    totalViews > 0 ? Number(((totalClicks / totalViews) * 100).toFixed(2)) : 0;

  return {
    generatedAt: new Date().toISOString(),
    agencyName,
    totalCompletedTasks: items.length,
    totalAwaitingUploads: awaitingItems.length,
    totalVideoLinks,
    totalViews,
    totalClicks,
    totalHumanClicks,
    overallCtrPercent,
    items,
    awaitingItems
  };
}

/**
 * Generates a self-contained, mobile-optimized standalone HTML application
 * containing Completed Video Tasks, Awaiting Uploads (Count, Influencer Name & Product), Views, and Clicks.
 */
export function generateMobileLiteHtml(
  snapshot: MobileLiteSnapshotPayload,
  serverOrigin = ''
): string {
  const safeJson = JSON.stringify(snapshot).replace(/<\//g, '<\\/');
  const safeOrigin = (serverOrigin || '').replace(/\/+$/, '');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
  <meta name="theme-color" content="#0f172a" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="PTG Tasks & Views" />
  <title>${snapshot.agencyName} • Tasks, Awaiting Uploads, Views & Clicks</title>
  <style>
    :root {
      --bg: #090d16;
      --card: #111827;
      --card-border: #1e293b;
      --text: #f8fafc;
      --muted: #94a3b8;
      --emerald: #10b981;
      --rose: #fb7185;
      --cyan: #06b6d4;
      --amber: #f59e0b;
      --indigo: #6366f1;
    }
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      padding-bottom: 84px;
    }
    .app-header {
      position: sticky;
      top: 0;
      z-index: 40;
      background: rgba(15, 23, 42, 0.94);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--card-border);
      padding: 14px 16px 12px;
    }
    .header-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .brand-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .brand-icon {
      width: 34px;
      height: 34px;
      border-radius: 10px;
      background: linear-gradient(135deg, #10b981, #06b6d4);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 900;
      font-size: 14px;
      color: #042f2e;
    }
    .brand-title {
      font-size: 15px;
      font-weight: 800;
      letter-spacing: -0.02em;
      margin: 0;
    }
    .brand-sub {
      font-size: 10px;
      color: var(--emerald);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-weight: 700;
      margin: 2px 0 0;
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
      padding: 12px 16px 6px;
    }
    @media (min-width: 400px) {
      .kpi-grid {
        grid-template-columns: repeat(4, 1fr);
      }
    }
    .kpi-card {
      background: var(--card);
      border: 1px solid var(--card-border);
      border-radius: 14px;
      padding: 10px 10px;
      text-align: left;
      cursor: pointer;
    }
    .kpi-label {
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--muted);
    }
    .kpi-val {
      font-size: 17px;
      font-weight: 900;
      margin-top: 3px;
      letter-spacing: -0.02em;
    }
    .kpi-sub {
      font-size: 9px;
      color: var(--muted);
      margin-top: 2px;
    }
    .controls {
      padding: 8px 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .search-input {
      width: 100%;
      background: var(--card);
      border: 1px solid var(--card-border);
      color: var(--text);
      padding: 10px 12px;
      border-radius: 12px;
      font-size: 13px;
      outline: none;
    }
    .filter-row {
      display: flex;
      gap: 6px;
      overflow-x: auto;
      padding-bottom: 2px;
    }
    .chip {
      border: 1px solid var(--card-border);
      background: var(--card);
      color: var(--muted);
      padding: 6px 11px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 700;
      white-space: nowrap;
      cursor: pointer;
    }
    .chip.active {
      background: #10b98122;
      color: #34d399;
      border-color: #10b98166;
    }
    .list-container {
      padding: 6px 16px 24px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .task-card {
      background: var(--card);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .task-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 8px;
    }
    .creator-name {
      font-size: 14px;
      font-weight: 800;
      color: #fff;
      margin: 0;
    }
    .product-name {
      font-size: 12px;
      color: #38bdf8;
      font-weight: 700;
      margin: 3px 0 0;
    }
    .badge {
      font-size: 10px;
      font-weight: 800;
      padding: 3px 8px;
      border-radius: 8px;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .badge-completed {
      background: rgba(16, 185, 129, 0.16);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.35);
    }
    .badge-awaiting {
      background: rgba(244, 63, 94, 0.16);
      color: #fb7185;
      border: 1px solid rgba(244, 63, 94, 0.35);
    }
    .metrics-row {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      background: rgba(15, 23, 42, 0.65);
      border: 1px solid rgba(51, 65, 85, 0.45);
      border-radius: 12px;
      padding: 8px 10px;
    }
    .metric-box {
      display: flex;
      flex-direction: column;
    }
    .metric-box span:first-child {
      font-size: 9px;
      text-transform: uppercase;
      color: var(--muted);
      font-weight: 700;
    }
    .metric-box strong {
      font-size: 14px;
      font-weight: 900;
      margin-top: 2px;
    }
    .links-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
      justify-content: space-between;
    }
    .btn-link {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      text-decoration: none;
      font-size: 11px;
      font-weight: 700;
      padding: 6px 10px;
      border-radius: 9px;
      background: rgba(56, 189, 248, 0.14);
      color: #38bdf8;
      border: 1px solid rgba(56, 189, 248, 0.3);
    }
    .btn-short {
      background: rgba(245, 158, 11, 0.14);
      color: #fbbf24;
      border-color: rgba(245, 158, 11, 0.3);
    }
    .bottom-nav {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 50;
      background: rgba(15, 23, 42, 0.96);
      backdrop-filter: blur(12px);
      border-top: 1px solid var(--card-border);
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      padding: 8px 10px calc(8px + env(safe-area-inset-bottom));
      gap: 6px;
    }
    .nav-btn {
      background: transparent;
      border: 1px solid transparent;
      color: var(--muted);
      border-radius: 12px;
      padding: 8px 4px;
      font-size: 10px;
      font-weight: 800;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3px;
    }
    .nav-btn.active {
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      border-color: rgba(16, 185, 129, 0.35);
    }
    .bar-track {
      width: 100%;
      height: 6px;
      background: #1e293b;
      border-radius: 4px;
      overflow: hidden;
      margin-top: 6px;
    }
    .bar-fill {
      height: 100%;
      border-radius: 4px;
    }
    .empty-state {
      text-align: center;
      padding: 40px 20px;
      color: var(--muted);
      font-size: 13px;
    }
  </style>
</head>
<body>
  <header class="app-header">
    <div class="header-top">
      <div class="brand-badge">
        <div class="brand-icon">PTG</div>
        <div>
          <h1 class="brand-title">${snapshot.agencyName} LITE</h1>
          <p class="brand-sub">Completed • Awaiting Uploads • Views • Clicks</p>
        </div>
      </div>
      <div style="text-align:right">
        <span class="badge badge-completed" id="record-count-badge">0 Tasks</span>
      </div>
    </div>
  </header>

  <section class="kpi-grid">
    <div class="kpi-card" data-jump="tasks">
      <div class="kpi-label">Completed</div>
      <div class="kpi-val" style="color:#34d399" id="kpi-tasks">0</div>
      <div class="kpi-sub" id="kpi-links">0 Videos</div>
    </div>
    <div class="kpi-card" data-jump="awaiting">
      <div class="kpi-label">Awaiting Upload</div>
      <div class="kpi-val" style="color:#fb7185" id="kpi-awaiting">0</div>
      <div class="kpi-sub">Pending Videos</div>
    </div>
    <div class="kpi-card" data-jump="views">
      <div class="kpi-label">Total Views</div>
      <div class="kpi-val" style="color:#38bdf8" id="kpi-views">0</div>
      <div class="kpi-sub" id="kpi-avg-views">0 avg/task</div>
    </div>
    <div class="kpi-card" data-jump="clicks">
      <div class="kpi-label">Total Clicks</div>
      <div class="kpi-val" style="color:#fbbf24" id="kpi-clicks">0</div>
      <div class="kpi-sub" id="kpi-ctr">0% CTR</div>
    </div>
  </section>

  <section class="controls">
    <input
      type="search"
      id="search-input"
      class="search-input"
      placeholder="Search influencer name, product, video ID..."
    />
    <div class="filter-row" id="platform-filters">
      <button class="chip active" data-platform="ALL">All Platforms</button>
      <button class="chip" data-platform="Instagram">Instagram</button>
      <button class="chip" data-platform="Facebook">Facebook</button>
      <button class="chip" data-platform="YouTube">YouTube</button>
    </div>
  </section>

  <main class="list-container" id="main-list"></main>

  <nav class="bottom-nav">
    <button class="nav-btn active" data-tab="tasks">
      <span>✅ Completed</span>
    </button>
    <button class="nav-btn" data-tab="awaiting">
      <span>⏳ Awaiting</span>
    </button>
    <button class="nav-btn" data-tab="views">
      <span>👁️ Views</span>
    </button>
    <button class="nav-btn" data-tab="clicks">
      <span>🔗 Clicks</span>
    </button>
  </nav>

  <script>
    window.__PTG_SNAPSHOT__ = ${safeJson};
    window.__PTG_ORIGIN__ = "${safeOrigin}";

    (function() {
      let state = {
        tab: 'tasks',
        search: '',
        platform: 'ALL',
        items: (window.__PTG_SNAPSHOT__ && window.__PTG_SNAPSHOT__.items) || [],
        awaitingItems: (window.__PTG_SNAPSHOT__ && window.__PTG_SNAPSHOT__.awaitingItems) || []
      };

      const fmt = (n) => Number(n || 0).toLocaleString('en-IN');

      function getFilteredCompleted() {
        const q = state.search.trim().toLowerCase();
        return state.items.filter((item) => {
          if (state.platform !== 'ALL' && item.platform !== state.platform && item.platform !== 'Multi') {
            return false;
          }
          if (!q) return true;
          return (
            (item.influencerName || '').toLowerCase().includes(q) ||
            (item.product || '').toLowerCase().includes(q) ||
            (item.title || '').toLowerCase().includes(q) ||
            (item.videoId || '').toLowerCase().includes(q)
          );
        });
      }

      function getFilteredAwaiting() {
        const q = state.search.trim().toLowerCase();
        return state.awaitingItems.filter((item) => {
          if (!q) return true;
          return (
            (item.influencerName || '').toLowerCase().includes(q) ||
            (item.product || '').toLowerCase().includes(q) ||
            (item.videoId || '').toLowerCase().includes(q)
          );
        });
      }

      function setActiveTab(tabName) {
        state.tab = tabName;
        document.querySelectorAll('.bottom-nav .nav-btn').forEach((b) => {
          if (b.getAttribute('data-tab') === tabName) b.classList.add('active');
          else b.classList.remove('active');
        });
        render();
      }

      function render() {
        const filtered = getFilteredCompleted();
        const filteredAwaiting = getFilteredAwaiting();
        const totalTasks = filtered.length;
        const totalAwaiting = filteredAwaiting.length;
        const totalLinks = filtered.reduce((acc, i) => acc + (i.videoLinks ? i.videoLinks.length : 0), 0);
        const totalViews = filtered.reduce((acc, i) => acc + Number(i.views || 0), 0);
        const totalClicks = filtered.reduce((acc, i) => acc + Number(i.clicks || 0), 0);
        const avgViews = totalTasks > 0 ? Math.round(totalViews / totalTasks) : 0;
        const ctr = totalViews > 0 ? ((totalClicks / totalViews) * 100).toFixed(2) : '0.00';

        document.getElementById('record-count-badge').textContent =
          state.tab === 'awaiting' ? fmt(totalAwaiting) + ' Awaiting' : fmt(totalTasks) + ' Completed';
        document.getElementById('kpi-tasks').textContent = fmt(totalTasks);
        document.getElementById('kpi-links').textContent = fmt(totalLinks) + ' Video Links';
        document.getElementById('kpi-awaiting').textContent = fmt(totalAwaiting);
        document.getElementById('kpi-views').textContent = fmt(totalViews);
        document.getElementById('kpi-avg-views').textContent = fmt(avgViews) + ' avg/task';
        document.getElementById('kpi-clicks').textContent = fmt(totalClicks);
        document.getElementById('kpi-ctr').textContent = ctr + '% CTR';

        const container = document.getElementById('main-list');

        if (state.tab === 'awaiting') {
          if (filteredAwaiting.length === 0) {
            container.innerHTML = '<div class="empty-state">No awaiting uploads match your filter.</div>';
            return;
          }
          container.innerHTML =
            '<div class="task-card" style="border-color:rgba(244,63,94,0.4);background:rgba(136,19,55,0.18)">' +
              '<div style="display:flex;justify-content:space-between;align-items:center">' +
                '<span style="font-size:11px;font-weight:800;text-transform:uppercase;color:#fda4af">Number of Awaiting Uploads</span>' +
                '<strong style="font-size:18px;font-weight:900;color:#fb7185">' + fmt(totalAwaiting) + ' Pending</strong>' +
              '</div>' +
            '</div>' +
            filteredAwaiting.map((item, idx) => {
              return '<div class="task-card">' +
                '<div class="task-top">' +
                  '<div>' +
                    '<div style="font-size:10px;color:#94a3b8;font-weight:700;text-transform:uppercase">Influencer Name</div>' +
                    '<h3 class="creator-name">#' + (idx + 1) + ' • ' + (item.influencerName || 'Creator') + '</h3>' +
                    '<div style="font-size:10px;color:#94a3b8;font-weight:700;text-transform:uppercase;margin-top:6px">Product</div>' +
                    '<p class="product-name">' + (item.product || 'Campaign Product') + '</p>' +
                  '</div>' +
                  '<span class="badge badge-awaiting">' + (item.status || 'Awaiting Upload') + '</span>' +
                '</div>' +
                (item.scheduledDate || item.dueDate
                  ? '<div style="font-size:10px;color:#94a3b8;font-weight:700">Scheduled / Due: ' + (item.scheduledDate || item.dueDate) + '</div>'
                  : '') +
              '</div>';
            }).join('');
          return;
        }

        if (filtered.length === 0) {
          container.innerHTML = '<div class="empty-state">No completed video tasks match your filter.</div>';
          return;
        }

        if (state.tab === 'tasks') {
          container.innerHTML = filtered.map((item) => {
            const linksHtml = (item.videoLinks || []).map((url, idx) =>
              '<a class="btn-link" href="' + url + '" target="_blank" rel="noopener">▶ Video ' + (idx + 1) + '</a>'
            ).join('');
            const shortHtml = item.shortIoLink
              ? '<a class="btn-link btn-short" href="' + item.shortIoLink + '" target="_blank" rel="noopener">🔗 Tracking Link</a>'
              : '';
            return '<div class="task-card">' +
              '<div class="task-top">' +
                '<div>' +
                  '<h3 class="creator-name">' + (item.influencerName || 'Creator') + '</h3>' +
                  '<p class="product-name">' + (item.product || item.title || 'Campaign') + '</p>' +
                '</div>' +
                '<span class="badge badge-completed">' + (item.videoId ? '#' + item.videoId : 'Completed') + '</span>' +
              '</div>' +
              '<div class="metrics-row">' +
                '<div class="metric-box"><span>Views</span><strong style="color:#38bdf8">' + fmt(item.views) + '</strong></div>' +
                '<div class="metric-box"><span>Clicks</span><strong style="color:#fbbf24">' + fmt(item.clicks) + '</strong></div>' +
                '<div class="metric-box"><span>CTR %</span><strong style="color:#34d399">' + (item.ctrPercent || 0) + '%</strong></div>' +
              '</div>' +
              '<div class="links-row">' +
                '<div style="display:flex;gap:6px;flex-wrap:wrap">' + linksHtml + shortHtml + '</div>' +
                '<span style="font-size:10px;color:#94a3b8;font-weight:700">' + (item.uploadDate || item.dueDate || '') + '</span>' +
              '</div>' +
            '</div>';
          }).join('');
        } else if (state.tab === 'views') {
          const sortedViews = [...filtered].sort((a, b) => (b.views || 0) - (a.views || 0));
          const maxViews = Math.max(1, sortedViews[0]?.views || 1);
          container.innerHTML = sortedViews.map((item, idx) => {
            const pct = Math.min(100, Math.round(((item.views || 0) / maxViews) * 100));
            return '<div class="task-card">' +
              '<div class="task-top">' +
                '<div>' +
                  '<h3 class="creator-name">#' + (idx + 1) + ' • ' + item.influencerName + '</h3>' +
                  '<p class="product-name">' + item.product + ' (' + item.platform + ')</p>' +
                '</div>' +
                '<strong style="font-size:16px;color:#38bdf8;font-weight:900">' + fmt(item.views) + ' views</strong>' +
              '</div>' +
              '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%;background:linear-gradient(90deg,#06b6d4,#3b82f6)"></div></div>' +
            '</div>';
          }).join('');
        } else {
          const sortedClicks = [...filtered].sort((a, b) => (b.clicks || 0) - (a.clicks || 0));
          const maxClicks = Math.max(1, sortedClicks[0]?.clicks || 1);
          container.innerHTML = sortedClicks.map((item, idx) => {
            const pct = Math.min(100, Math.round(((item.clicks || 0) / maxClicks) * 100));
            return '<div class="task-card">' +
              '<div class="task-top">' +
                '<div>' +
                  '<h3 class="creator-name">#' + (idx + 1) + ' • ' + item.influencerName + '</h3>' +
                  '<p class="product-name">' + item.product + ' • ' + (item.ctrPercent || 0) + '% CTR</p>' +
                '</div>' +
                '<strong style="font-size:16px;color:#fbbf24;font-weight:900">' + fmt(item.clicks) + ' clicks</strong>' +
              '</div>' +
              '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%;background:linear-gradient(90deg,#f59e0b,#10b981)"></div></div>' +
            '</div>';
          }).join('');
        }
      }

      document.getElementById('search-input').addEventListener('input', (e) => {
        state.search = e.target.value || '';
        render();
      });

      document.querySelectorAll('#platform-filters .chip').forEach((btn) => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#platform-filters .chip').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          state.platform = btn.getAttribute('data-platform') || 'ALL';
          render();
        });
      });

      document.querySelectorAll('.bottom-nav .nav-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          setActiveTab(btn.getAttribute('data-tab') || 'tasks');
        });
      });

      document.querySelectorAll('.kpi-card[data-jump]').forEach((card) => {
        card.addEventListener('click', () => {
          setActiveTab(card.getAttribute('data-jump') || 'tasks');
        });
      });

      render();
    })();
  </script>
</body>
</html>`;
}

/**
 * Requests a signed Android .apk package from the backend (/api/mobile-lite/build-apk)
 * or falls back to building a valid client-side .apk archive via JSZip.
 */
export async function downloadSignedAndroidApk(
  snapshot: MobileLiteSnapshotPayload
): Promise<{ filename: string; sizeBytes: number }> {
  const filename = 'PTG-Completed-Tasks-Views-Clicks.apk';
  const serverOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const htmlContent = generateMobileLiteHtml(snapshot, serverOrigin);

  try {
    // 1. Prepare installable V1+V2 signed APK on backend and trigger direct HTTP download
    const prepRes = await fetch('/api/mobile-lite/prepare-apk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agencyName: snapshot.agencyName,
        snapshot,
        htmlContent
      })
    });

    if (prepRes.ok) {
      const prepData = await prepRes.json();
      if (prepData?.success && prepData?.downloadUrl) {
        const a = document.createElement('a');
        a.href = prepData.downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return {
          filename: prepData.filename || filename,
          sizeBytes: Number(prepData.sizeBytes || 0)
        };
      }
    }

    // 2. Fallback: stream APK directly from /api/mobile-lite/build-apk
    const response = await fetch('/api/mobile-lite/build-apk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agencyName: snapshot.agencyName,
        snapshot,
        htmlContent
      })
    });

    if (response.ok) {
      const blob = await response.blob();
      if (blob.size > 0) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        return { filename, sizeBytes: blob.size };
      }
    }
  } catch (err) {
    console.warn('Server APK build endpoint unreachable, using client-side APK packager:', err);
  }

  // Client-side fallback APK builder using JSZip
  const zip = new JSZip();
  zip.file('assets/index.html', htmlContent);
  zip.file('assets/snapshot.json', JSON.stringify(snapshot, null, 2));
  zip.file(
    'META-INF/MANIFEST.MF',
    [
      'Manifest-Version: 1.0',
      'Created-By: 1.0 (PTG Android APK Packager)',
      'Package-Name: com.protogrow.completedtasks',
      ''
    ].join('\r\n')
  );

  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.android.package-archive',
    compression: 'DEFLATE'
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);

  return { filename, sizeBytes: blob.size };
}

/**
 * Downloads the standalone single-file HTML mobile application.
 */
export function downloadStandaloneMobileHtmlApp(snapshot: MobileLiteSnapshotPayload): void {
  const serverOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const html = generateMobileLiteHtml(snapshot, serverOrigin);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'PTG-Completed-Tasks-Views-Clicks-Mobile.html';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Generates and downloads a complete Capacitor Android Studio project (.zip)
 * pre-loaded with the Completed Video Tasks, Awaiting Uploads, Views & Clicks Lite application.
 */
export async function downloadCapacitorAndroidStudioZip(
  snapshot: MobileLiteSnapshotPayload
): Promise<void> {
  const serverOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const html = generateMobileLiteHtml(snapshot, serverOrigin);
  const zip = new JSZip();

  zip.file('www/index.html', html);
  zip.file('www/snapshot.json', JSON.stringify(snapshot, null, 2));

  zip.file(
    'package.json',
    JSON.stringify(
      {
        name: 'ptg-completed-tasks-views-clicks-apk',
        version: '1.0.0',
        description: 'Android APK for Completed Video Tasks, Awaiting Uploads, Views, and Clicks',
        scripts: {
          'init:android': 'npm install && npx cap add android && npx cap sync',
          'open:android': 'npx cap open android',
          'build:apk': 'npx cap sync android && cd android && ./gradlew assembleDebug'
        },
        dependencies: {
          '@capacitor/android': '^6.0.0',
          '@capacitor/core': '^6.0.0'
        },
        devDependencies: {
          '@capacitor/cli': '^6.0.0'
        }
      },
      null,
      2
    )
  );

  zip.file(
    'capacitor.config.json',
    JSON.stringify(
      {
        appId: 'com.protogrow.completedtasks',
        appName: 'PTG Tasks & Views',
        webDir: 'www',
        bundledWebRuntime: false
      },
      null,
      2
    )
  );

  zip.file(
    'BUILD_APK_WINDOWS.bat',
    [
      '@echo off',
      'echo ========================================================',
      'echo Building PTG Completed Video Tasks, Views ^& Clicks APK',
      'echo ========================================================',
      'call npm install',
      'call npx cap add android',
      'call npx cap sync android',
      'cd android && call gradlew.bat assembleDebug',
      'echo.',
      'echo APK Ready at: android\\app\\build\\outputs\\apk\\debug\\app-debug.apk',
      'pause'
    ].join('\r\n')
  );

  zip.file(
    'README_APK.md',
    [
      '# PTG Completed Video Tasks, Awaiting Uploads, Views & Clicks — Android APK Project',
      '',
      'This project builds a dedicated Android `.apk` containing **Completed Video Tasks, Awaiting Uploads (Influencer Name & Product), Video Views, and Link Clicks**.',
      '',
      '## Quick 1-Command Build',
      '1. Run `npm install`',
      '2. Run `npm run init:android`',
      '3. Run `npm run build:apk` (or `npm run open:android` to build in Android Studio)',
      '',
      'Your installable APK will be output to `android/app/build/outputs/apk/debug/app-debug.apk`.'
    ].join('\n')
  );

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'PTG-Completed-Tasks-Views-Clicks-Android-Project.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
