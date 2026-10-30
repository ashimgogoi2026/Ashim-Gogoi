import { Influencer, Task, Contract, BillingEntry } from '../types';
import { safeLocalStorage } from './safeLocalStorage';
import { cleanSingleMobileForStorage } from './whatsappHelper';
import { getTodayKolkataISO } from './dateUtils';

export interface AutoCreatorSystemStats {
  lastRunAt: string | null;
  duplicatesMergedCount: number;
  duplicateGroupsResolved: number;
  plannerNamesInputtedCount: number;
  missingCreatorsAddedCount: number;
  monitoredTasksCount: number;
  activeCreatorsSyncedCount: number;
  guardedPlannerEntriesCount?: number;
}

export interface AutoCreatorSystemResult {
  hasChanges: boolean;
  updatedInfluencers: Map<string, Partial<Influencer>>;
  newInfluencersToCreate: Influencer[];
  influencerIdsToDelete: { id: string; replacementId: string }[];
  taskUpdates: { id: string; updates: Partial<Task> }[];
  statsDelta: {
    duplicatesMerged: number;
    duplicateGroups: number;
    plannerNamesInputted: number;
    missingCreatorsAdded: number;
    activeCreatorsSynced: number;
  };
  summaryMessages: string[];
}

// ============================================================================
// MONTHLY PLANNER NEW-ENTRY GUARD SYSTEM (ZERO-DELETION & DATA LOCK VAULT)
// ============================================================================
const GUARD_VAULT_STORAGE_KEY = 'MONTHLY_PLANNER_NEW_ENTRY_GUARD_VAULT_V1';
const INTENTIONALLY_DELETED_TASKS_KEY = 'MONTHLY_PLANNER_INTENTIONALLY_DELETED_IDS_V1';

const inMemoryProtectedTasks = new Map<string, Task>();
const inMemoryDeletedTaskIds = new Set<string>();
let isGuardVaultHydrated = false;

const hydrateGuardVaultIfNeeded = () => {
  if (isGuardVaultHydrated) return;
  isGuardVaultHydrated = true;
  try {
    const rawDeleted = safeLocalStorage.getItem(INTENTIONALLY_DELETED_TASKS_KEY);
    if (rawDeleted) {
      const parsed = JSON.parse(rawDeleted);
      if (Array.isArray(parsed)) {
        for (const id of parsed) {
          if (typeof id === 'string' && id) inMemoryDeletedTaskIds.add(id);
        }
      }
    }
  } catch {
    // ignore
  }
  try {
    const rawVault = safeLocalStorage.getItem(GUARD_VAULT_STORAGE_KEY);
    if (rawVault) {
      const parsed = JSON.parse(rawVault);
      if (Array.isArray(parsed)) {
        for (const t of parsed) {
          if (t && typeof t.id === 'string' && !inMemoryDeletedTaskIds.has(t.id)) {
            inMemoryProtectedTasks.set(t.id, t);
          }
        }
      }
    }
  } catch {
    // ignore
  }
};

const persistGuardVault = () => {
  try {
    const allTasks = Array.from(inMemoryProtectedTasks.values()).slice(-1200);
    safeLocalStorage.setItem(GUARD_VAULT_STORAGE_KEY, JSON.stringify(allTasks));
  } catch {
    // ignore storage quota errors
  }
};

/**
 * Registers a newly created or updated Monthly Planner task in the Guard Vault
 * so it can never be deleted or blanked out during Auto-System duplicate merges
 * or Firestore snapshot race conditions.
 */
export const registerMonthlyPlannerProtectedTask = (task: Task): void => {
  if (!task || !task.id) return;
  hydrateGuardVaultIfNeeded();
  inMemoryDeletedTaskIds.delete(task.id);
  const existing = inMemoryProtectedTasks.get(task.id);
  const merged = existing ? mergeTaskPreservingUserData(existing, task) : { ...task };
  inMemoryProtectedTasks.set(task.id, merged);
  persistGuardVault();
};

export const registerMonthlyPlannerProtectedTasksBulk = (tasksList: Task[]): void => {
  if (!Array.isArray(tasksList) || tasksList.length === 0) return;
  hydrateGuardVaultIfNeeded();
  for (const task of tasksList) {
    if (!task || !task.id) continue;
    inMemoryDeletedTaskIds.delete(task.id);
    const existing = inMemoryProtectedTasks.get(task.id);
    const merged = existing ? mergeTaskPreservingUserData(existing, task) : { ...task };
    inMemoryProtectedTasks.set(task.id, merged);
  }
  persistGuardVault();
};

/**
 * Marks task IDs as intentionally deleted by an explicit user action
 * so the Guard System allows intentional deletions while blocking accidental/auto-merge deletions.
 */
export const unregisterIntentionallyDeletedTaskIds = (taskIds: string[]): void => {
  if (!Array.isArray(taskIds) || taskIds.length === 0) return;
  hydrateGuardVaultIfNeeded();
  for (const id of taskIds) {
    if (!id) continue;
    inMemoryDeletedTaskIds.add(id);
    inMemoryProtectedTasks.delete(id);
  }
  try {
    const recentDeleted = Array.from(inMemoryDeletedTaskIds).slice(-2000);
    safeLocalStorage.setItem(INTENTIONALLY_DELETED_TASKS_KEY, JSON.stringify(recentDeleted));
    persistGuardVault();
  } catch {
    // ignore
  }
};

export const isTaskIntentionallyDeleted = (taskId: string): boolean => {
  hydrateGuardVaultIfNeeded();
  return inMemoryDeletedTaskIds.has(taskId);
};

/**
 * Merges two snapshots of the same Monthly Planner task, ensuring that
 * newly entered non-empty data (product title, dates, remuneration, orderId, links, views, clicks, creator name)
 * is never lost or overwritten with empty values.
 */
export const mergeTaskPreservingUserData = (olderOrVaultTask: Task, incomingTask: Task): Task => {
  const result: Task = { ...olderOrVaultTask, ...incomingTask };

  // Never allow a valid product title to be overwritten by 'Untitled' or empty string
  if (
    (!incomingTask.title || incomingTask.title === 'Untitled') &&
    olderOrVaultTask.title &&
    olderOrVaultTask.title !== 'Untitled'
  ) {
    result.title = olderOrVaultTask.title;
  }

  // Preserve string fields if incoming is empty/blank
  const protectedStringFields: (keyof Task)[] = [
    'deadline',
    'releaseDate',
    'orderId',
    'orderDate',
    'orderPlatform',
    'videoLink1',
    'videoLink2',
    'videoLink3',
    'shortIoLink',
    'videoId',
    'influencerMobile',
    'secondaryInfluencerName',
    'influencerId',
    'campaignId'
  ];

  for (const field of protectedStringFields) {
    const incVal = incomingTask[field];
    const oldVal = olderOrVaultTask[field];
    const isIncEmpty =
      incVal === undefined ||
      incVal === null ||
      String(incVal).trim() === '' ||
      (field === 'influencerId' && String(incVal).trim() === 'unknown');
    const isOldValid =
      oldVal !== undefined &&
      oldVal !== null &&
      String(oldVal).trim() !== '' &&
      !(field === 'influencerId' && String(oldVal).trim() === 'unknown');

    if (isIncEmpty && isOldValid) {
      (result as any)[field] = oldVal;
    }
  }

  // Preserve numeric fields if incoming dropped to 0 while older had a non-zero value
  const protectedNumericFields: (keyof Task)[] = [
    'remuneration',
    'sampleCost',
    'views',
    'clicks',
    'conversions'
  ];
  for (const nField of protectedNumericFields) {
    const incNum = Number(incomingTask[nField] || 0);
    const oldNum = Number(olderOrVaultTask[nField] || 0);
    if (incNum === 0 && oldNum > 0) {
      (result as any)[nField] = oldNum;
    }
  }

  return result;
};

/**
 * Guards Monthly Planner tasks against any accidental deletion or data loss
 * during Auto-System duplicate merging or Firestore snapshot syncs.
 */
export const guardAndRestoreMonthlyPlannerTasks = (
  incomingTasks: Task[],
  localPrevTasks: Task[] = []
): { guardedTasks: Task[]; restoredTasks: Task[] } => {
  hydrateGuardVaultIfNeeded();

  // First, register all current localPrevTasks that aren't deleted into our reference map
  const referenceById = new Map<string, Task>();
  for (const [id, vaultTask] of inMemoryProtectedTasks.entries()) {
    if (!inMemoryDeletedTaskIds.has(id)) {
      referenceById.set(id, vaultTask);
    }
  }
  for (const localTask of localPrevTasks) {
    if (localTask && localTask.id && !inMemoryDeletedTaskIds.has(localTask.id)) {
      const prevRef = referenceById.get(localTask.id);
      referenceById.set(
        localTask.id,
        prevRef ? mergeTaskPreservingUserData(prevRef, localTask) : localTask
      );
    }
  }

  const incomingIds = new Set<string>();
  const guardedTasks: Task[] = [];
  const restoredTasks: Task[] = [];

  for (const incTask of incomingTasks) {
    if (!incTask || !incTask.id) continue;
    if (inMemoryDeletedTaskIds.has(incTask.id)) continue;
    incomingIds.add(incTask.id);

    const refTask = referenceById.get(incTask.id);
    const safeTask = refTask ? mergeTaskPreservingUserData(refTask, incTask) : incTask;
    guardedTasks.push(safeTask);
    inMemoryProtectedTasks.set(safeTask.id, safeTask);
  }

  // Any task in localPrevTasks (or recently created in the guard vault) that is missing
  // from incomingTasks and was NOT intentionally deleted is automatically restored!
  const localPrevIds = new Set(localPrevTasks.map(t => t?.id).filter(Boolean));
  for (const [id, refTask] of referenceById.entries()) {
    if (incomingIds.has(id) || inMemoryDeletedTaskIds.has(id)) continue;

    // Restore if it was present in localPrevTasks OR created recently within the last 15 minutes
    const createdAtMs = refTask.createdAt ? new Date(refTask.createdAt).getTime() : 0;
    const isRecentlyCreated = createdAtMs > 0 && Date.now() - createdAtMs < 15 * 60 * 1000;
    if (localPrevIds.has(id) || isRecentlyCreated) {
      guardedTasks.push(refTask);
      restoredTasks.push(refTask);
      incomingIds.add(id);
    }
  }

  return { guardedTasks, restoredTasks };
};

export const normalizeCreatorName = (name: string | undefined | null): string => {
  if (!name) return '';
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
};

export const normalizeStrictKey = (val: string | undefined | null): string => {
  if (!val) return '';
  return String(val)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
};

export const normalizeHandle = (handle: string | undefined | null): string => {
  if (!handle) return '';
  const cleaned = String(handle).trim().toLowerCase().replace(/^@+/, '').replace(/\s+/g, '');
  if (!cleaned || cleaned === 'unknown' || cleaned === 'n/a' || cleaned === 'na') return '';
  return cleaned;
};

export const normalizePhone10 = (phone: string | undefined | null): string => {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length < 10) return '';
  const last10 = digits.slice(-10);
  if (/^0+$/.test(last10)) return '';
  return last10;
};

export const normalizeSocialUrl = (url: string | undefined | null): string => {
  if (!url) return '';
  const trimmed = String(url).trim().toLowerCase();
  if (!trimmed || trimmed === 'n/a' || trimmed === 'none' || trimmed === '-') return '';
  const clean = trimmed
    .replace(/^https?:\/\/(www\.|m\.)?/, '')
    .split('?')[0]
    .replace(/\/+$/, '');
  if (
    !clean ||
    clean === 'instagram.com' ||
    clean === 'youtube.com' ||
    clean === 'facebook.com' ||
    clean === 'fb.com' ||
    clean === 'youtu.be'
  ) {
    return '';
  }
  return clean;
};

export const extractSocialHandleFromVideoUrl = (url: string | undefined | null): string => {
  if (!url) return '';
  try {
    const trimmed = String(url).trim();
    if (!trimmed) return '';
    const u = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    const host = u.hostname.toLowerCase();
    const parts = u.pathname.split('/').filter(Boolean);
    if (host.includes('instagram.com') && parts.length > 0) {
      const first = parts[0].toLowerCase();
      if (!['reel', 'reels', 'p', 'tv', 'stories', 'explore', 'share'].includes(first)) {
        return normalizeHandle(first);
      }
    }
    if (host.includes('youtube.com') && parts.length > 0) {
      if (parts[0].startsWith('@')) {
        return normalizeHandle(parts[0]);
      }
    }
  } catch {
    // ignore invalid URLs
  }
  return '';
};

const isInvalidPlaceholderName = (name: string | undefined | null): boolean => {
  if (!name) return true;
  const lower = String(name).trim().toLowerCase();
  return (
    !lower ||
    lower === 'unknown' ||
    lower === 'unknown creator' ||
    lower === 'unassigned' ||
    lower === 'n/a' ||
    lower === 'na' ||
    lower === 'none' ||
    lower === 'null' ||
    lower === 'undefined' ||
    lower === 'click to select creator' ||
    lower.includes('click to select')
  );
};

const scoreInfluencerCompleteness = (inf: Influencer, taskCountByInfId: Map<string, number>): number => {
  let score = 0;
  const linkedTasks = taskCountByInfId.get(inf.id) || 0;
  if (linkedTasks > 0) score += 50 + Math.min(linkedTasks * 5, 50);
  if (inf.status && inf.status !== 'Future Creator') score += 35;
  if (normalizePhone10(inf.mobile)) score += 20;
  if (normalizePhone10(inf.secondaryMobile)) score += 10;
  if (normalizeSocialUrl(inf.instagramLink)) score += 15;
  if (normalizeSocialUrl(inf.youtubeLink)) score += 15;
  if (normalizeSocialUrl(inf.facebookLink)) score += 10;
  if (inf.followers && inf.followers > 0) score += 12;
  if (inf.costPerPost && inf.costPerPost > 0) score += 12;
  if (inf.bankDetails && (inf.bankDetails.accountNumber || inf.bankDetails.upiId)) score += 25;
  if (inf.billingName || inf.billingAddress) score += 15;
  if (inf.influencerSignature) score += 15;
  if (inf.chatScreenshots && inf.chatScreenshots.length > 0) score += 20;
  if (inf.sampleDetails && (inf.sampleDetails.productName || inf.sampleDetails.trackingId)) score += 15;
  if (inf.notes && inf.notes.trim().length > 5 && !inf.notes.includes('Auto-restored')) score += 8;
  if (inf.location && inf.location !== 'Unknown' && inf.location !== 'India') score += 8;
  if (inf.district || inf.state) score += 6;
  return score;
};

/**
 * Loads backup influencer name mappings and task snapshots from safeLocalStorage
 * so missing Monthly Planner influencer names can be recovered automatically.
 */
const loadRecoveryMapsFromStorage = () => {
  const shortIoTaskNameMap = new Map<string, string>(); // task.id -> creatorName
  const shortIoUrlNameMap = new Map<string, string>(); // shortIoLink -> creatorName
  const backupTaskNameById = new Map<string, string>(); // task.id -> creatorName
  const backupTaskNameByVideoId = new Map<string, string>(); // videoId(lower) -> creatorName
  const backupInfNameById = new Map<string, string>(); // inf.id -> inf.name

  try {
    // 1. Load backup influencers first so we can resolve old influencerIds
    const infKeys = [
      'INFLUENCER_MANAGER_INFS',
      'INFLUENCER_MANAGER_INFS_guest',
      'SYS_MEMORY_LAST_RECOVERY_RESERVE'
    ];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('INFLUENCER_MANAGER_INFS_') || k.includes('BACKUP'))) {
        if (!infKeys.includes(k)) infKeys.push(k);
      }
    }

    for (const key of infKeys) {
      const raw = safeLocalStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        const list = Array.isArray(parsed)
          ? parsed
          : parsed?.influencers && Array.isArray(parsed.influencers)
          ? parsed.influencers
          : parsed?.data?.influencers && Array.isArray(parsed.data.influencers)
          ? parsed.data.influencers
          : [];
        for (const inf of list) {
          if (inf && inf.id && inf.name && !isInvalidPlaceholderName(inf.name)) {
            backupInfNameById.set(String(inf.id), String(inf.name).trim());
          }
        }
      } catch {
        // ignore malformed JSON
      }
    }

    // 2. Load SHORT_IO_TRACKED_LINKS which stores { id: `planner-${t.id}`, url: t.shortIoLink, label: `${infName} - ${t.title}` }
    const rawShortIo = safeLocalStorage.getItem('SHORT_IO_TRACKED_LINKS');
    if (rawShortIo) {
      const links = JSON.parse(rawShortIo);
      if (Array.isArray(links)) {
        for (const item of links) {
          if (!item || typeof item.label !== 'string') continue;
          const labelParts = item.label.split(' - ');
          const candidateName = labelParts[0]?.trim();
          if (candidateName && !isInvalidPlaceholderName(candidateName)) {
            if (typeof item.id === 'string' && item.id.startsWith('planner-')) {
              const taskId = item.id.slice('planner-'.length);
              if (taskId) shortIoTaskNameMap.set(taskId, candidateName);
            }
            if (typeof item.url === 'string' && item.url.trim()) {
              shortIoUrlNameMap.set(item.url.trim().toLowerCase(), candidateName);
            }
          }
        }
      }
    }

    // 3. Load task backup snapshots
    const taskKeys = [
      'MONTHLY_PLANNER_SECURE_BACKUP',
      'SYS_MEMORY_LAST_RECOVERY_RESERVE',
      'INFLUENCER_MANAGER_TSKS',
      'INFLUENCER_MANAGER_TSKS_guest'
    ];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('INFLUENCER_MANAGER_TSKS_')) {
        if (!taskKeys.includes(k)) taskKeys.push(k);
      }
    }

    for (const key of taskKeys) {
      const raw = safeLocalStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        const taskList = Array.isArray(parsed)
          ? parsed
          : parsed?.tasks && Array.isArray(parsed.tasks)
          ? parsed.tasks
          : parsed?.data?.tasks && Array.isArray(parsed.data.tasks)
          ? parsed.data.tasks
          : [];
        for (const bt of taskList) {
          if (!bt) continue;
          const directName =
            bt.secondaryInfluencerName ||
            bt.influencerName ||
            bt.creatorName ||
            bt.Creator ||
            bt['INFLUENCER NAME'] ||
            (bt.influencerId && backupInfNameById.get(String(bt.influencerId))) ||
            '';
          if (directName && !isInvalidPlaceholderName(directName)) {
            const cleanName = String(directName).trim();
            if (bt.id && !backupTaskNameById.has(String(bt.id))) {
              backupTaskNameById.set(String(bt.id), cleanName);
            }
            if (bt.videoId && !backupTaskNameByVideoId.has(String(bt.videoId).trim().toLowerCase())) {
              backupTaskNameByVideoId.set(String(bt.videoId).trim().toLowerCase(), cleanName);
            }
          }
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore storage errors
  }

  return {
    shortIoTaskNameMap,
    shortIoUrlNameMap,
    backupTaskNameById,
    backupTaskNameByVideoId,
    backupInfNameById
  };
};

export function analyzeAndComputeAutoMergeAndPlannerSync(
  influencers: Influencer[],
  tasks: Task[],
  contracts: Contract[] = [],
  billingEntries: BillingEntry[] = []
): AutoCreatorSystemResult {
  const updatedInfluencers = new Map<string, Partial<Influencer>>();
  const newInfluencersToCreate: Influencer[] = [];
  const influencerIdsToDelete: { id: string; replacementId: string }[] = [];
  const taskUpdates: { id: string; updates: Partial<Task> }[] = [];
  const summaryMessages: string[] = [];

  let duplicatesMerged = 0;
  let duplicateGroups = 0;
  let plannerNamesInputted = 0;
  let missingCreatorsAdded = 0;
  let activeCreatorsSynced = 0;

  // Count tasks per influencer ID
  const taskCountByInfId = new Map<string, number>();
  for (const t of tasks) {
    if (t.influencerId) {
      taskCountByInfId.set(t.influencerId, (taskCountByInfId.get(t.influencerId) || 0) + 1);
    }
  }

  // ============================================================================
  // PART 1: AUTOMATED DUPLICATE DETECTION, CORRECTION & LOSSLESS MERGE
  // ============================================================================
  const n = influencers.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (i: number, j: number) => {
    const rootI = find(i);
    const rootJ = find(j);
    if (rootI !== rootJ) {
      parent[rootJ] = rootI;
    }
  };

  // Register all Monthly Planner tasks into the New-Entry Guard Vault so no task or field can ever be lost
  registerMonthlyPlannerProtectedTasksBulk(tasks);

  const byStrictName = new Map<string, number>();
  const byHandle = new Map<string, number>();
  const byPhone = new Map<string, number>();
  const bySocialUrl = new Map<string, number>();

  for (let i = 0; i < n; i++) {
    const inf = influencers[i];
    if (!inf) continue;

    // 1. Strict Name match (ignoring case, extra spaces, and punctuation)
    const nameKey = normalizeStrictKey(inf.name);
    if (nameKey && nameKey.length >= 2 && !isInvalidPlaceholderName(inf.name)) {
      if (byStrictName.has(nameKey)) {
        union(byStrictName.get(nameKey)!, i);
      } else {
        byStrictName.set(nameKey, i);
      }
    }

    // 2. Handle match (only if handle is not generic and names are identical or one is empty)
    const handleKey = normalizeHandle(inf.handle);
    if (handleKey && handleKey.length >= 3) {
      if (byHandle.has(handleKey)) {
        const prevIdx = byHandle.get(handleKey)!;
        const prevInf = influencers[prevIdx];
        const prevNameKey = normalizeStrictKey(prevInf.name);
        if (
          !nameKey ||
          !prevNameKey ||
          nameKey === prevNameKey ||
          handleKey === nameKey
        ) {
          union(prevIdx, i);
        }
      } else {
        byHandle.set(handleKey, i);
      }
    }

    // 3. 10-digit Mobile match (only if names are identical or one is empty)
    const phones = [normalizePhone10(inf.mobile), normalizePhone10(inf.secondaryMobile)].filter(Boolean);
    for (const p of phones) {
      if (byPhone.has(p)) {
        const prevIdx = byPhone.get(p)!;
        const prevInf = influencers[prevIdx];
        const prevNameKey = normalizeStrictKey(prevInf.name);
        if (
          !nameKey ||
          !prevNameKey ||
          nameKey === prevNameKey
        ) {
          union(prevIdx, i);
        }
      } else {
        byPhone.set(p, i);
      }
    }

    // 4. Social URL match
    const socials = [
      normalizeSocialUrl(inf.instagramLink),
      normalizeSocialUrl(inf.youtubeLink),
      normalizeSocialUrl(inf.facebookLink)
    ].filter(Boolean);
    for (const sUrl of socials) {
      if (bySocialUrl.has(sUrl)) {
        union(bySocialUrl.get(sUrl)!, i);
      } else {
        bySocialUrl.set(sUrl, i);
      }
    }
  }

  const clusters = new Map<number, Influencer[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root)!.push(influencers[i]);
  }

  // Track effective influencers after deduplication
  const effectiveInfluencersById = new Map<string, Influencer>();
  const duplicateIdToMasterId = new Map<string, string>();

  for (const group of clusters.values()) {
    if (group.length === 1) {
      const single = { ...group[0] };
      effectiveInfluencersById.set(single.id, single);
      continue;
    }

    // Sort group descending by completeness score so the richest / active profile is master
    const sorted = [...group].sort((a, b) => {
      const scoreB = scoreInfluencerCompleteness(b, taskCountByInfId);
      const scoreA = scoreInfluencerCompleteness(a, taskCountByInfId);
      if (scoreB !== scoreA) return scoreB - scoreA;
      return String(a.id).localeCompare(String(b.id));
    });

    const master = sorted[0];
    const duplicates = sorted.slice(1);
    const merged: Influencer = { ...master };
    const patch: Partial<Influencer> = {};

    // Ensure clean uppercase name
    if (merged.name) {
      const upperName = merged.name.trim().toUpperCase();
      if (upperName !== merged.name) {
        merged.name = upperName;
        patch.name = upperName;
      }
    }

    for (const dup of duplicates) {
      duplicateIdToMasterId.set(dup.id, master.id);
      influencerIdsToDelete.push({ id: dup.id, replacementId: master.id });
      duplicatesMerged++;

      // Status promotion: if any duplicate was active (not 'Future Creator'), ensure master is active
      if (merged.status === 'Future Creator' && dup.status && dup.status !== 'Future Creator') {
        merged.status = dup.status;
        patch.status = dup.status;
      }

      // Merge mobile & secondaryMobile losslessly
      const masterMob = normalizePhone10(merged.mobile);
      const masterSecMob = normalizePhone10(merged.secondaryMobile);
      const dupPhones = [dup.mobile, dup.secondaryMobile].filter(Boolean) as string[];
      for (const rawP of dupPhones) {
        const clean10 = normalizePhone10(rawP);
        if (!clean10) continue;
        const formatted = cleanSingleMobileForStorage(rawP);
        if (!masterMob) {
          merged.mobile = formatted;
          patch.mobile = formatted;
        } else if (clean10 !== masterMob && !masterSecMob) {
          merged.secondaryMobile = formatted;
          patch.secondaryMobile = formatted;
        }
      }

      // Merge scalar string fields
      const stringFields: (keyof Influencer)[] = [
        'handle',
        'email',
        'instagramLink',
        'youtubeLink',
        'facebookLink',
        'billingName',
        'billingAddress',
        'influencerSignature',
        'niche',
        'subCategory',
        'location',
        'district',
        'state',
        'gender',
        'age',
        'language',
        'communicationStatus',
        'entryDate'
      ];
      for (const field of stringFields) {
        const curVal = merged[field];
        const dupVal = dup[field];
        const isPlaceholder =
          !curVal ||
          curVal === 'Unknown' ||
          curVal === 'General' ||
          curVal === 'India' ||
          (field === 'avatar' && String(curVal).includes('ui-avatars.com'));
        if (isPlaceholder && dupVal && dupVal !== 'Unknown' && dupVal !== 'General') {
          (merged as any)[field] = dupVal;
          (patch as any)[field] = dupVal;
        }
      }

      // Avatar: prefer real portrait/uploaded avatar over ui-avatars
      if (
        (!merged.avatar || merged.avatar.includes('ui-avatars.com')) &&
        dup.avatar &&
        !dup.avatar.includes('ui-avatars.com')
      ) {
        merged.avatar = dup.avatar;
        patch.avatar = dup.avatar;
      }

      // Numeric fields: keep highest non-zero value
      if ((dup.followers || 0) > (merged.followers || 0)) {
        merged.followers = dup.followers;
        patch.followers = dup.followers;
      }
      if ((dup.costPerPost || 0) > (merged.costPerPost || 0)) {
        merged.costPerPost = dup.costPerPost;
        patch.costPerPost = dup.costPerPost;
      }
      if ((dup.engagementRate || 0) > (merged.engagementRate || 0)) {
        merged.engagementRate = dup.engagementRate;
        patch.engagementRate = dup.engagementRate;
      }
      if ((dup.averageROI || 0) > (merged.averageROI || 0)) {
        merged.averageROI = dup.averageROI;
        patch.averageROI = dup.averageROI;
      }

      // Complex objects: bankDetails, lastBillData, sampleDetails, chatScreenshots
      if (dup.bankDetails) {
        if (!merged.bankDetails || (!merged.bankDetails.accountNumber && !merged.bankDetails.upiId)) {
          merged.bankDetails = { ...dup.bankDetails };
          patch.bankDetails = { ...dup.bankDetails };
        }
      }
      if (dup.lastBillData && !merged.lastBillData) {
        merged.lastBillData = { ...dup.lastBillData };
        patch.lastBillData = { ...dup.lastBillData };
      }
      if (dup.sampleDetails && !merged.sampleDetails) {
        merged.sampleDetails = { ...dup.sampleDetails };
        patch.sampleDetails = { ...dup.sampleDetails };
      }
      if (dup.chatScreenshots && dup.chatScreenshots.length > 0) {
        const existingShots = merged.chatScreenshots || [];
        const existingShotIds = new Set(existingShots.map((s: any) => s.id));
        const combinedShots = [...existingShots];
        let addedShot = false;
        for (const s of dup.chatScreenshots) {
          if (!existingShotIds.has(s.id)) {
            combinedShots.push(s);
            existingShotIds.add(s.id);
            addedShot = true;
          }
        }
        if (addedShot) {
          merged.chatScreenshots = combinedShots;
          patch.chatScreenshots = combinedShots;
        }
      }

      // Merge notes without losing distinct information
      if (dup.notes && dup.notes.trim() && dup.notes.trim() !== (merged.notes || '').trim()) {
        const curNotes = (merged.notes || '').trim();
        const dupNotes = dup.notes.trim();
        if (!curNotes) {
          merged.notes = dupNotes;
          patch.notes = dupNotes;
        } else if (!curNotes.toLowerCase().includes(dupNotes.toLowerCase())) {
          const combined = `${curNotes} | ${dupNotes}`;
          merged.notes = combined;
          patch.notes = combined;
        }
      }
    }

    duplicateGroups++;
    if (Object.keys(patch).length > 0) {
      updatedInfluencers.set(master.id, patch);
    }
    effectiveInfluencersById.set(master.id, merged);
  }

  // Build fast lookup indexes for the deduplicated Influencer pool
  const infByStrictName = new Map<string, Influencer>();
  const infByHandle = new Map<string, Influencer>();
  const infByPhone = new Map<string, Influencer>();

  const registerInfInLookups = (inf: Influencer) => {
    const nk = normalizeStrictKey(inf.name);
    if (nk) infByStrictName.set(nk, inf);
    const hk = normalizeHandle(inf.handle);
    if (hk) infByHandle.set(hk, inf);
    const p1 = normalizePhone10(inf.mobile);
    if (p1) infByPhone.set(p1, inf);
    const p2 = normalizePhone10(inf.secondaryMobile);
    if (p2) infByPhone.set(p2, inf);
  };

  for (const inf of effectiveInfluencersById.values()) {
    registerInfInLookups(inf);
  }

  // Also map known task sibling clues (e.g., tasks that already have a valid influencer and videoLink/orderId)
  const infByOrderId = new Map<string, Influencer>();
  const infByVideoHandle = new Map<string, Influencer>();
  for (const t of tasks) {
    const resolvedId = duplicateIdToMasterId.get(t.influencerId) || t.influencerId;
    const inf = resolvedId ? effectiveInfluencersById.get(resolvedId) : undefined;
    if (inf) {
      if (t.orderId && t.orderId.trim().length > 3) {
        infByOrderId.set(t.orderId.trim().toLowerCase(), inf);
      }
      for (const link of [t.videoLink1, t.videoLink2, t.videoLink3]) {
        const vh = extractSocialHandleFromVideoUrl(link);
        if (vh) infByVideoHandle.set(vh, inf);
      }
    }
  }

  const recoveryMaps = loadRecoveryMapsFromStorage();

  // ============================================================================
  // PART 2: MONTHLY PLANNER INFLUENCER MONITOR & MISSING NAME AUTO-INPUT
  // (GUARDED: NEVER DELETES TASKS OR OVERWRITES NEWLY ENTERED PLANNER FIELDS)
  // ============================================================================
  const todayISO = getTodayKolkataISO();

  for (const t of tasks) {
    const rawInfId = t.influencerId ? String(t.influencerId).trim() : '';
    const mappedInfId = duplicateIdToMasterId.get(rawInfId) || rawInfId;
    const existingInf = mappedInfId ? effectiveInfluencersById.get(mappedInfId) : undefined;

    if (existingInf) {
      // Task points to a known creator in the database (either directly or via duplicate merge)
      // GUARD RULE: Only remap influencerId (when duplicate was merged) or fill missing secondaryInfluencerName / influencerMobile.
      // Never delete or overwrite any newly entered task fields!
      const taskPatch: Partial<Task> = {};
      if (mappedInfId !== rawInfId) {
        taskPatch.influencerId = existingInf.id;
      }
      const currentSecName = (t.secondaryInfluencerName || '').trim();
      if (isInvalidPlaceholderName(currentSecName) || mappedInfId !== rawInfId) {
        if (currentSecName !== existingInf.name) {
          taskPatch.secondaryInfluencerName = existingInf.name;
          plannerNamesInputted++;
        }
      }
      // Sync mobile if missing on task
      if (!t.influencerMobile && existingInf.mobile) {
        taskPatch.influencerMobile = existingInf.mobile;
      }

      if (Object.keys(taskPatch).length > 0) {
        taskUpdates.push({ id: t.id, updates: taskPatch });
      }

      // Ensure creator assigned to Monthly Planner is active ('Available') so they are never hidden in Monthly Planner dropdowns
      if (existingInf.status === 'Future Creator' || !existingInf.status) {
        existingInf.status = 'Available';
        const prevPatch = updatedInfluencers.get(existingInf.id) || {};
        updatedInfluencers.set(existingInf.id, { ...prevPatch, status: 'Available' });
        activeCreatorsSynced++;
      }

      // If task has a mobile number and creator does not, sync it to creator
      if (t.influencerMobile && !normalizePhone10(existingInf.mobile)) {
        const cleanMob = cleanSingleMobileForStorage(t.influencerMobile);
        if (normalizePhone10(cleanMob)) {
          existingInf.mobile = cleanMob;
          const prevPatch = updatedInfluencers.get(existingInf.id) || {};
          updatedInfluencers.set(existingInf.id, { ...prevPatch, mobile: cleanMob });
        }
      }
      continue;
    }

    // --------------------------------------------------------------------------
    // CASE 2: Influencer is MISSING or UNLINKED on Monthly Planner task `t`
    // Run the 7-stage automatic recovery & resolution pipeline
    // --------------------------------------------------------------------------
    let recoveredName = '';
    let matchedCreator: Influencer | undefined = undefined;

    // Stage 1: Check task's own secondary/backup name fields
    const candidateTaskNames = [
      t.secondaryInfluencerName,
      t.influencerName,
      (t as any).creatorName,
      (t as any).Creator,
      (t as any)['INFLUENCER NAME']
    ];
    for (const cand of candidateTaskNames) {
      if (cand && !isInvalidPlaceholderName(cand)) {
        recoveredName = String(cand).trim();
        break;
      }
    }

    // Stage 2: Check SHORT_IO_TRACKED_LINKS by task ID or shortIoLink URL
    if (!recoveredName) {
      const fromShortIoId = recoveryMaps.shortIoTaskNameMap.get(t.id);
      if (fromShortIoId && !isInvalidPlaceholderName(fromShortIoId)) {
        recoveredName = fromShortIoId;
      } else if (t.shortIoLink) {
        const fromShortIoUrl = recoveryMaps.shortIoUrlNameMap.get(t.shortIoLink.trim().toLowerCase());
        if (fromShortIoUrl && !isInvalidPlaceholderName(fromShortIoUrl)) {
          recoveredName = fromShortIoUrl;
        }
      }
    }

    // Stage 3: Check local storage backup snapshots by task.id, videoId, or old influencerId
    if (!recoveredName) {
      const fromBackupTask = recoveryMaps.backupTaskNameById.get(t.id);
      if (fromBackupTask && !isInvalidPlaceholderName(fromBackupTask)) {
        recoveredName = fromBackupTask;
      } else if (t.videoId) {
        const fromBackupVid = recoveryMaps.backupTaskNameByVideoId.get(t.videoId.trim().toLowerCase());
        if (fromBackupVid && !isInvalidPlaceholderName(fromBackupVid)) {
          recoveredName = fromBackupVid;
        }
      }
      if (!recoveredName && rawInfId) {
        const fromBackupInf = recoveryMaps.backupInfNameById.get(rawInfId);
        if (fromBackupInf && !isInvalidPlaceholderName(fromBackupInf)) {
          recoveredName = fromBackupInf;
        }
      }
    }

    // Stage 4: Check task's `influencerMobile` against Creator Database
    if (!matchedCreator && t.influencerMobile) {
      const p10 = normalizePhone10(t.influencerMobile);
      if (p10 && infByPhone.has(p10)) {
        matchedCreator = infByPhone.get(p10);
        if (!recoveredName && matchedCreator) {
          recoveredName = matchedCreator.name;
        }
      }
    }

    // Stage 5: Check social handle from videoLink1/2/3 or sibling Order ID
    if (!matchedCreator && !recoveredName) {
      for (const link of [t.videoLink1, t.videoLink2, t.videoLink3]) {
        const vh = extractSocialHandleFromVideoUrl(link);
        if (vh) {
          if (infByHandle.has(vh)) {
            matchedCreator = infByHandle.get(vh);
            recoveredName = matchedCreator!.name;
            break;
          }
          if (infByVideoHandle.has(vh)) {
            matchedCreator = infByVideoHandle.get(vh);
            recoveredName = matchedCreator!.name;
            break;
          }
        }
      }
      if (!matchedCreator && t.orderId && t.orderId.trim().length > 3) {
        const byOrd = infByOrderId.get(t.orderId.trim().toLowerCase());
        if (byOrd) {
          matchedCreator = byOrd;
          recoveredName = byOrd.name;
        }
      }
    }

    // Stage 6: Check contracts / billingEntries referencing rawInfId
    if (!matchedCreator && !recoveredName && rawInfId) {
      const matchingContract = contracts.find(c => c.influencerId === rawInfId);
      if (matchingContract && (matchingContract as any).influencerName) {
        recoveredName = String((matchingContract as any).influencerName).trim();
      }
      if (!recoveredName) {
        const matchingBill = billingEntries.find(b => b.influencerId === rawInfId);
        if (matchingBill && (matchingBill as any).influencerName) {
          recoveredName = String((matchingBill as any).influencerName).trim();
        }
      }
    }

    // Stage 7: If rawInfId itself is a human name (not a generated `inf-...` or `unknown`)
    if (!recoveredName && rawInfId && !rawInfId.startsWith('inf-') && !isInvalidPlaceholderName(rawInfId)) {
      recoveredName = rawInfId;
    }

    // Now resolve `recoveredName` to an existing or newly created creator in Creator Database (exact match only)
    if (!matchedCreator && recoveredName) {
      const strictKey = normalizeStrictKey(recoveredName);
      const handleKey = normalizeHandle(recoveredName);
      matchedCreator =
        (strictKey ? infByStrictName.get(strictKey) : undefined) ||
        (handleKey ? infByHandle.get(handleKey) : undefined);
    }

    if (matchedCreator) {
      // Link task to the matched creator & input the influencer name on Monthly Planner
      taskUpdates.push({
        id: t.id,
        updates: {
          influencerId: matchedCreator.id,
          secondaryInfluencerName: matchedCreator.name,
          ...(matchedCreator.mobile && !t.influencerMobile ? { influencerMobile: matchedCreator.mobile } : {})
        }
      });
      plannerNamesInputted++;

      // Ensure matched creator is active ('Available') so Monthly Planner displays it in dropdowns
      if (matchedCreator.status === 'Future Creator' || !matchedCreator.status) {
        matchedCreator.status = 'Available';
        const prevPatch = updatedInfluencers.get(matchedCreator.id) || {};
        updatedInfluencers.set(matchedCreator.id, { ...prevPatch, status: 'Available' });
        activeCreatorsSynced++;
      }
    } else if (recoveredName && !isInvalidPlaceholderName(recoveredName)) {
      // Creator exists on Monthly Planner task / backup, but is missing from Creator Database!
      // Automatically create and link the creator in Creator Database.
      const formattedName = recoveredName.trim().toUpperCase();
      const handleSlug = recoveredName.trim().replace(/\s+/g, '').toLowerCase();
      const newInfId = rawInfId && rawInfId.startsWith('inf-')
        ? rawInfId
        : `inf-auto-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

      const newCreator: Influencer = {
        id: newInfId,
        name: formattedName,
        handle: `@${handleSlug}`,
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(formattedName)}&background=random`,
        niche: 'Lifestyle',
        followers: 10000,
        engagementRate: 3.5,
        location: 'Assam',
        costPerPost: t.remuneration || 0,
        averageROI: 2.5,
        status: 'Available',
        entryDate: todayISO,
        perfRanking: effectiveInfluencersById.size + newInfluencersToCreate.length + 1,
        rating: 4.5,
        mobile: t.influencerMobile ? cleanSingleMobileForStorage(t.influencerMobile) : '',
        instagramLink: t.videoLink1 && t.videoLink1.includes('instagram.com') ? t.videoLink1 : '',
        youtubeLink: t.videoLink1 && (t.videoLink1.includes('youtube.com') || t.videoLink1.includes('youtu.be')) ? t.videoLink1 : '',
        facebookLink: t.videoLink1 && (t.videoLink1.includes('facebook.com') || t.videoLink1.includes('fb.')) ? t.videoLink1 : '',
        platforms: [{ name: (t.platform as any) || 'Instagram', followers: '10K' }],
        topDemographics: [{ ageRange: '18-24', percentage: 45 }],
        notes: 'Auto-synced & restored from Monthly Planner by Creator Auto-System'
      };

      newInfluencersToCreate.push(newCreator);
      effectiveInfluencersById.set(newCreator.id, newCreator);
      registerInfInLookups(newCreator);
      missingCreatorsAdded++;

      taskUpdates.push({
        id: t.id,
        updates: {
          influencerId: newCreator.id,
          secondaryInfluencerName: newCreator.name
        }
      });
      plannerNamesInputted++;
    }
  }

  if (duplicatesMerged > 0) {
    summaryMessages.push(`Merged ${duplicatesMerged} duplicate creator entr${duplicatesMerged === 1 ? 'y' : 'ies'} (${duplicateGroups} group${duplicateGroups === 1 ? '' : 's'})`);
  }
  if (plannerNamesInputted > 0) {
    summaryMessages.push(`Auto-inputted/synced ${plannerNamesInputted} influencer name${plannerNamesInputted === 1 ? '' : 's'} in Monthly Planner`);
  }
  if (missingCreatorsAdded > 0) {
    summaryMessages.push(`Auto-added ${missingCreatorsAdded} missing Monthly Planner creator${missingCreatorsAdded === 1 ? '' : 's'} to Creator Database`);
  }
  if (activeCreatorsSynced > 0) {
    summaryMessages.push(`Activated ${activeCreatorsSynced} creator${activeCreatorsSynced === 1 ? '' : 's'} for Monthly Planner visibility`);
  }

  const hasChanges =
    updatedInfluencers.size > 0 ||
    newInfluencersToCreate.length > 0 ||
    influencerIdsToDelete.length > 0 ||
    taskUpdates.length > 0;

  return {
    hasChanges,
    updatedInfluencers,
    newInfluencersToCreate,
    influencerIdsToDelete,
    taskUpdates,
    statsDelta: {
      duplicatesMerged,
      duplicateGroups,
      plannerNamesInputted,
      missingCreatorsAdded,
      activeCreatorsSynced
    },
    summaryMessages
  };
}
