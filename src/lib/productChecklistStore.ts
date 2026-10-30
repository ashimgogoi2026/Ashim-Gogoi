import { ChecklistSection, DEFAULT_CHECKLIST_SECTIONS } from './pdfChecklistGenerator';
import { downloadProductChecklistsFromDrive } from './driveSync';
import { ensureGoogleAccessToken } from './firebaseAuth';

export interface ChecklistDocumentAttachment {
  id: string;
  fileName: string;
  fileType: 'pdf' | 'word' | 'image';
  uploadedAt: string;
  fileSize?: string;
  fileData: string; // Base64 Data URL or link
  extractedText?: string;
}

export interface ProductChecklistConfig {
  productName: string;
  productKey: string; // Normalized lowercase key for matching
  title: string;      // Header title, e.g. "Product - Chocolate Drink"
  description?: string;
  lastUpdated: string;
  sections: ChecklistSection[];
  defaultBdmName?: string;
  bdmSignature?: string;       // Base64 or image data URL for BDM signature
  bdmSignatureData?: string;   // Image data URL for quick rendering
  attachments?: ChecklistDocumentAttachment[];
  notes?: string;
}

// Built-in starter templates for specific products
export const INITIAL_PRODUCT_CHECKLISTS: Record<string, ProductChecklistConfig> = {
  'chocolate drink': {
    productName: 'Chocolate Drink',
    productKey: 'chocolate drink',
    title: 'Product - Chocolate Drink',
    description: 'Guidelines for Chocolate Drink influencer promotion campaigns',
    lastUpdated: new Date().toLocaleDateString('en-GB'),
    defaultBdmName: 'ASHIM GOGOI',
    sections: JSON.parse(JSON.stringify(DEFAULT_CHECKLIST_SECTIONS)),
    attachments: [],
    notes: 'Default brand checklist for Chocolate Drink.'
  },
  'bhim banana oats': {
    productName: 'Bhim Banana Oats',
    productKey: 'bhim banana oats',
    title: 'Product - Bhim Banana Oats',
    description: 'Guidelines for Bhim Banana Oats breakfast & nutrition campaigns',
    lastUpdated: new Date().toLocaleDateString('en-GB'),
    defaultBdmName: 'ASHIM GOGOI',
    sections: [
      {
        id: 'mention',
        title: 'Points to Mention',
        subtitle: 'Key Benefits & Natural Ingredients',
        iconType: 'check',
        items: [
          { id: 'bbo1', text: 'Highlight 100% natural Bhim Banana flakes with premium whole rolled oats', checked: true },
          { id: 'bbo2', text: '100% Vegetarian & No added preservatives', checked: true },
          { id: 'bbo3', text: 'Rich in dietary fiber and potassium for sustained morning energy', checked: true },
          { id: 'bbo4', text: 'Quick and easy 3-minute preparation with warm milk or water', checked: true },
          { id: 'bbo5', text: 'Natural sweetness without refined sugars or artificial flavoring', checked: true },
          { id: 'bbo6', text: 'Ideal healthy breakfast and evening snack for both kids and adults', checked: true }
        ]
      },
      {
        id: 'cta',
        title: 'Call-to-Action',
        iconType: 'target',
        items: [
          { id: 'bbo_c1', text: 'Available on Amazon, Flipkart, and official store www.protogrow.in', checked: true },
          { id: 'bbo_c2', text: 'Direct purchase link pinned in bio & story with sticker', checked: true },
          { id: 'bbo_c3', text: 'For YouTube & Facebook: Link placed in top caption and pinned comment', checked: true }
        ]
      },
      {
        id: 'creation',
        title: 'Points to Follow (Content Creation)',
        iconType: 'video',
        items: [
          { id: 'bbo_cr1', text: 'Show authentic bowl preparation and appetizing texture closeup', checked: true },
          { id: 'bbo_cr2', text: 'Maintain high definition video and clear conversational audio', checked: true },
          { id: 'bbo_cr3', text: 'Display the product pouch/jar prominently during introduction', checked: true }
        ]
      },
      {
        id: 'prohibited',
        title: 'Prohibited / What NOT to Say',
        iconType: 'prohibited',
        items: [
          { id: 'bbo_p1', text: 'Do not claim it as a medicinal cure or therapeutic weight loss substitute', checked: true },
          { id: 'bbo_p2', text: 'Never mention or show competitor breakfast brands', checked: true },
          { id: 'bbo_p3', text: 'Do not use low resolution, dark, or distorted video footage', checked: true }
        ]
      },
      {
        id: 'posting',
        title: 'Posting & Caption Guidelines',
        iconType: 'posting',
        items: [
          { id: 'bbo_po1', text: 'Use official brand hashtags #ProtoGrow #BhimBananaOats #HealthyBreakfast', checked: true },
          { id: 'bbo_po2', text: 'Tag official brand account @protogrow.in in caption and visual reel tag', checked: true },
          { id: 'bbo_po3', text: 'Add Linktree or trackable short link in bio for minimum 7 days', checked: true }
        ]
      }
    ],
    attachments: [],
    notes: 'Focus on natural ingredients and convenient breakfast routine.'
  },
  'high protein oats': {
    productName: 'High Protein Oats',
    productKey: 'high protein oats',
    title: 'Product - High Protein Oats',
    description: 'Guidelines for High Protein Oats fitness & workout campaigns',
    lastUpdated: new Date().toLocaleDateString('en-GB'),
    defaultBdmName: 'ASHIM GOGOI',
    sections: [
      {
        id: 'mention',
        title: 'Points to Mention',
        subtitle: 'Protein Power & Fitness Benefits',
        iconType: 'check',
        items: [
          { id: 'hpo1', text: '22g+ clean protein per serving to support muscle recovery and daily fitness', checked: true },
          { id: 'hpo2', text: 'Blend of premium whey and rolled oats for prolonged satiety', checked: true },
          { id: 'hpo3', text: 'Zero added sugar, 100% vegetarian formulation', checked: true },
          { id: 'hpo4', text: 'Fortified with essential vitamins and digestive enzymes for zero bloating', checked: true },
          { id: 'hpo5', text: 'Perfect as a post-workout recovery meal or high-protein breakfast', checked: true }
        ]
      },
      {
        id: 'cta',
        title: 'Call-to-Action',
        iconType: 'target',
        items: [
          { id: 'hpo_c1', text: 'Check out the product on Amazon, Flipkart, or www.protogrow.in', checked: true },
          { id: 'hpo_c2', text: 'Use creator exclusive promo code for special discount', checked: true },
          { id: 'hpo_c3', text: 'Click link in bio or top pinned comment to order now', checked: true }
        ]
      },
      {
        id: 'creation',
        title: 'Points to Follow (Content Creation)',
        iconType: 'video',
        items: [
          { id: 'hpo_cr1', text: 'Integrate into an active fitness, gym, or morning workout routine', checked: true },
          { id: 'hpo_cr2', text: 'Show measuring scoops and easy shake/bowl preparation', checked: true },
          { id: 'hpo_cr3', text: 'Clear sound design and upbeat lifestyle storytelling format', checked: true }
        ]
      },
      {
        id: 'prohibited',
        title: 'Prohibited / What NOT to Say',
        iconType: 'prohibited',
        items: [
          { id: 'hpo_p1', text: 'Do not promise miraculous instant steroid-like muscle building results', checked: true },
          { id: 'hpo_p2', text: 'Do not compare negatively with other fitness supplements', checked: true }
        ]
      },
      {
        id: 'posting',
        title: 'Posting & Caption Guidelines',
        iconType: 'posting',
        items: [
          { id: 'hpo_po1', text: 'Use campaign hashtags #ProteinOats #ProtoGrowFitness #CleanNutrition', checked: true },
          { id: 'hpo_po2', text: 'Maintain link in Instagram bio / YouTube description for 7 days', checked: true }
        ]
      }
    ],
    attachments: [],
    notes: 'Targets gym-goers, athletes, and active lifestyle creators.'
  }
};

const LOCAL_STORAGE_KEY = 'CENTRAL_PRODUCT_CHECKLISTS_STORE';

// Helper to normalize any input product name or title into a standardized key
export const normalizeProductKey = (raw: string): string => {
  if (!raw || typeof raw !== 'string') return 'general';
  return raw
    .trim()
    .toLowerCase()
    .replace(/^product\s*[-–:]\s*/i, '')
    .trim();
};

// Safe LocalStorage getter
export const safeGetItem = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

// Safe LocalStorage setter
export const safeSetItem = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    console.warn('[ChecklistStore] LocalStorage write error:', err);
  }
};

// In-memory cache
let inMemoryStore: Record<string, ProductChecklistConfig> | null = null;

// Load all product checklists from LocalStorage merged with initial defaults
export const loadAllProductChecklists = (forceReload = false): Record<string, ProductChecklistConfig> => {
  if (inMemoryStore && !forceReload) {
    return inMemoryStore;
  }

  const result: Record<string, ProductChecklistConfig> = { ...INITIAL_PRODUCT_CHECKLISTS };
  const raw = safeGetItem(LOCAL_STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        Object.entries(parsed).forEach(([k, v]) => {
          if (v && typeof v === 'object') {
            const config = v as ProductChecklistConfig;
            const normKey = normalizeProductKey(config.productName || k);
            result[normKey] = {
              ...config,
              productKey: normKey
            };
          }
        });
      }
    } catch (e) {
      console.warn('[ChecklistStore] Failed to parse local store:', e);
    }
  }

  inMemoryStore = result;
  return result;
};

// Save all product checklists to LocalStorage and trigger background server sync
export const saveAllProductChecklists = (store: Record<string, ProductChecklistConfig>): void => {
  inMemoryStore = store;
  safeSetItem(LOCAL_STORAGE_KEY, JSON.stringify(store));

  // Sync to backend server kv-store and /api/product-checklists
  saveChecklistsToServer(store).catch(() => {});

  // Notify active listeners
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('product-checklists-updated', { detail: store }));
  }
};

// Get the specific checklist configuration for a product
export const getProductChecklist = (productName: string, forceReload = true): ProductChecklistConfig => {
  const store = loadAllProductChecklists(forceReload);
  const key = normalizeProductKey(productName);

  if (store[key]) {
    return store[key];
  }

  // Check for partial or fuzzy match
  const matchingKey = Object.keys(store).find(k => k.includes(key) || key.includes(k));
  if (matchingKey && store[matchingKey]) {
    return store[matchingKey];
  }

  // Generate dynamic tailored default configuration for this product
  const cleanDisplayName = productName.replace(/^product\s*[-–:]\s*/i, '').trim() || 'Product';
  const newConfig: ProductChecklistConfig = {
    productName: cleanDisplayName,
    productKey: key,
    title: cleanDisplayName.toLowerCase().startsWith('product') ? cleanDisplayName : `Product - ${cleanDisplayName}`,
    description: `Standard checklist guidelines for ${cleanDisplayName}`,
    lastUpdated: new Date().toLocaleDateString('en-GB'),
    defaultBdmName: 'ASHIM GOGOI',
    bdmSignature: '',
    bdmSignatureData: '',
    sections: JSON.parse(JSON.stringify(DEFAULT_CHECKLIST_SECTIONS)),
    attachments: [],
    notes: `Automatically generated default checklist for ${cleanDisplayName}`
  };

  return newConfig;
};

// Save or update a specific product's checklist configuration
export const saveProductChecklist = (config: ProductChecklistConfig): void => {
  const store = { ...loadAllProductChecklists() };
  const key = normalizeProductKey(config.productName || config.productKey);
  
  const updatedConfig: ProductChecklistConfig = {
    ...config,
    productKey: key,
    lastUpdated: new Date().toLocaleDateString('en-GB') + ' ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  };

  store[key] = updatedConfig;
  saveAllProductChecklists(store);
};

// Delete a product checklist from the store
export const deleteProductChecklist = (productName: string): void => {
  const store = { ...loadAllProductChecklists() };
  const key = normalizeProductKey(productName);
  if (store[key]) {
    delete store[key];
    saveAllProductChecklists(store);
  }
};

// Add an attached reference file (PDF, Word, Image) to a product checklist
export const addDocumentToProduct = (
  productName: string, 
  attachment: ChecklistDocumentAttachment
): ProductChecklistConfig => {
  const config = getProductChecklist(productName);
  const currentAttachments = config.attachments || [];
  const updatedAttachments = [attachment, ...currentAttachments.filter(a => a.id !== attachment.id)];
  
  const updatedConfig: ProductChecklistConfig = {
    ...config,
    attachments: updatedAttachments
  };

  saveProductChecklist(updatedConfig);
  return updatedConfig;
};

// Remove an attached document from a product checklist
export const removeDocumentFromProduct = (
  productName: string, 
  attachmentId: string
): ProductChecklistConfig => {
  const config = getProductChecklist(productName);
  const currentAttachments = config.attachments || [];
  const updatedAttachments = currentAttachments.filter(a => a.id !== attachmentId);

  const updatedConfig: ProductChecklistConfig = {
    ...config,
    attachments: updatedAttachments
  };

  saveProductChecklist(updatedConfig);
  return updatedConfig;
};

// Server synchronization APIs
export const saveChecklistsToServer = async (store: Record<string, ProductChecklistConfig>): Promise<boolean> => {
  try {
    const res = await fetch('/api/product-checklists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store })
    });
    return res.ok;
  } catch (err) {
    console.warn('[ChecklistStore] Server sync failed (will rely on LocalStorage):', err);
    return false;
  }
};

export const syncChecklistsWithServer = async (): Promise<Record<string, ProductChecklistConfig>> => {
  try {
    const res = await fetch('/api/product-checklists');
    if (res.ok) {
      const data = await res.json();
      if (data && data.store && typeof data.store === 'object') {
        const local = loadAllProductChecklists();
        const merged: Record<string, ProductChecklistConfig> = { ...local, ...data.store };
        inMemoryStore = merged;
        safeSetItem(LOCAL_STORAGE_KEY, JSON.stringify(merged));
        return merged;
      }
    }
  } catch (err) {
    console.warn('[ChecklistStore] Server fetch failed:', err);
  }
  return loadAllProductChecklists();
};

/**
 * Synchronizes the latest product checklist store from Google Drive backup
 * (uploaded from Central Product Checklist Store's "Upload to Google Drive" button).
 * Merges drive checklists into the local store and saves them.
 */
export const syncChecklistsFromGoogleDrive = async (
  currentToken?: string | null
): Promise<{ success: boolean; count: number; timestamp?: string; source: 'drive' | 'local' }> => {
  try {
    const token = await ensureGoogleAccessToken(currentToken);
    if (token) {
      const driveBackup = await downloadProductChecklistsFromDrive(token);
      if (driveBackup && driveBackup.data && typeof driveBackup.data === 'object' && Object.keys(driveBackup.data).length > 0) {
        const localStore = loadAllProductChecklists(true);
        const mergedStore: Record<string, ProductChecklistConfig> = { ...localStore };

        Object.entries(driveBackup.data).forEach(([k, v]) => {
          if (v && typeof v === 'object') {
            const config = v as ProductChecklistConfig;
            const normKey = normalizeProductKey(config.productName || config.productKey || k);
            mergedStore[normKey] = {
              ...config,
              productKey: normKey
            };
          }
        });

        saveAllProductChecklists(mergedStore);
        return {
          success: true,
          count: Object.keys(mergedStore).length,
          timestamp: driveBackup.timestamp,
          source: 'drive'
        };
      }
    }
  } catch (err: any) {
    console.warn('[ChecklistStore] Google Drive checklist synchronization failed (using local store):', err?.message || err);
  }
  return {
    success: false,
    count: Object.keys(loadAllProductChecklists(true)).length,
    source: 'local'
  };
};

// Intelligent Text Parser to convert raw extracted document lines (Word/PDF/Text) into structured Checklist Sections
export const parseExtractedTextIntoSections = (rawText: string): ChecklistSection[] => {
  if (!rawText || !rawText.trim()) {
    return JSON.parse(JSON.stringify(DEFAULT_CHECKLIST_SECTIONS));
  }

  const lines = rawText
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0 && !/^page\s+\d+/i.test(l));

  const mentionItems: { id: string; text: string; checked: boolean }[] = [];
  const ctaItems: { id: string; text: string; checked: boolean }[] = [];
  const creationItems: { id: string; text: string; checked: boolean }[] = [];
  const prohibitedItems: { id: string; text: string; checked: boolean }[] = [];
  const postingItems: { id: string; text: string; checked: boolean }[] = [];

  let currentCategory: 'mention' | 'cta' | 'creation' | 'prohibited' | 'posting' = 'mention';

  lines.forEach((line, idx) => {
    const clean = line.replace(/^[•\-*–—\d+.)\]\s]+/, '').trim();
    if (!clean) return;

    const lower = clean.toLowerCase();

    // Check for section headers
    if (lower.includes('point to mention') || lower.includes('points to mention') || lower.includes('benefits') || lower.includes('key points')) {
      currentCategory = 'mention';
      return;
    }
    if (lower.includes('call to action') || lower.includes('cta') || lower.includes('buy link') || lower.includes('where to buy')) {
      currentCategory = 'cta';
      return;
    }
    if (lower.includes('point to follow') || lower.includes('content creation') || lower.includes('video quality') || lower.includes('audio quality') || lower.includes('shooting')) {
      currentCategory = 'creation';
      return;
    }
    if (lower.includes('prohibited') || lower.includes('not to say') || lower.includes('don\'t') || lower.includes('restrictions') || lower.includes('avoid')) {
      currentCategory = 'prohibited';
      return;
    }
    if (lower.includes('posting') || lower.includes('caption') || lower.includes('hashtag') || lower.includes('tagging') || lower.includes('link in bio')) {
      currentCategory = 'posting';
      return;
    }

    // Assign line to current category based on content keywords if headers aren't explicit
    let targetCat = currentCategory;
    if (lower.includes('amazon') || lower.includes('flipkart') || lower.includes('website') || lower.includes('discount') || lower.includes('coupon') || lower.includes('link in bio')) {
      targetCat = 'cta';
    } else if (lower.includes('prohibit') || lower.includes('do not') || lower.includes('never') || lower.includes('avoid') || lower.includes('competitor')) {
      targetCat = 'prohibited';
    } else if (lower.includes('hashtag') || lower.includes('tag @') || lower.includes('caption') || lower.includes('linktree') || lower.includes('wishlink')) {
      targetCat = 'posting';
    } else if (lower.includes('lighting') || lower.includes('camera') || lower.includes('audio') || lower.includes('storytelling') || lower.includes('aesthetic') || lower.includes('resolution')) {
      targetCat = 'creation';
    }

    const item = { id: `parsed_${Date.now()}_${idx}`, text: clean, checked: true };
    if (targetCat === 'mention') mentionItems.push(item);
    else if (targetCat === 'cta') ctaItems.push(item);
    else if (targetCat === 'creation') creationItems.push(item);
    else if (targetCat === 'prohibited') prohibitedItems.push(item);
    else if (targetCat === 'posting') postingItems.push(item);
  });

  // Fallback defaults if any section ended up empty
  const defaultSections: ChecklistSection[] = JSON.parse(JSON.stringify(DEFAULT_CHECKLIST_SECTIONS));

  return [
    {
      id: 'mention',
      title: 'Points to Mention',
      subtitle: 'Benefits & Product Specifications',
      iconType: 'check',
      items: mentionItems.length > 0 ? mentionItems : defaultSections[0].items
    },
    {
      id: 'cta',
      title: 'Call-to-Action',
      iconType: 'target',
      items: ctaItems.length > 0 ? ctaItems : defaultSections[1].items
    },
    {
      id: 'creation',
      title: 'Points to Follow (Content Creation)',
      iconType: 'video',
      items: creationItems.length > 0 ? creationItems : defaultSections[2].items
    },
    {
      id: 'prohibited',
      title: 'Prohibited / What NOT to Say',
      iconType: 'prohibited',
      items: prohibitedItems.length > 0 ? prohibitedItems : defaultSections[3].items
    },
    {
      id: 'posting',
      title: 'Posting & Caption Guidelines',
      iconType: 'posting',
      items: postingItems.length > 0 ? postingItems : defaultSections[4].items
    }
  ];
};
