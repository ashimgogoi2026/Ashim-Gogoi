import { safeLocalStorage } from './safeLocalStorage';

export const CURRENT_SCHEMA_VERSION = 2; // Incremented for new updates

export async function runSchemaMigrations(userId: string | null) {
  const suffix = userId ? userId : 'guest';
  const versionKey = `APP_SCHEMA_VERSION_${suffix}`;
  
  const currentVersionStr = safeLocalStorage.getItem(versionKey);
  const currentVersion = currentVersionStr ? parseInt(currentVersionStr, 10) : 1;

  if (currentVersion >= CURRENT_SCHEMA_VERSION) {
    return; // Already up to date
  }

  console.log(`[Schema Migration] Starting migration from v${currentVersion} to v${CURRENT_SCHEMA_VERSION}`);

  // Safe Fallback: Create automated local backup right before any database migration runs
  createPreMigrationBackup(suffix, currentVersion);

  try {
    if (currentVersion < 2) {
      migrateV1toV2(suffix);
    }
    // Add future migrations here (e.g., if currentVersion < 3)

    // Update version after successful migration
    safeLocalStorage.setItem(versionKey, String(CURRENT_SCHEMA_VERSION));
    console.log(`[Schema Migration] Successfully migrated to v${CURRENT_SCHEMA_VERSION}`);
  } catch (error) {
    console.error("[Schema Migration] Migration failed! Attempting to restore fallback...", error);
    restorePreMigrationBackup(suffix, currentVersion);
  }
}

function createPreMigrationBackup(suffix: string, version: number) {
  const backupKey = `SCHEMA_MIGRATION_BACKUP_v${version}_${suffix}`;
  const backupData = {
    influencers: safeLocalStorage.getItem(`INFLUENCER_MANAGER_INFS_${suffix}`),
    campaigns: safeLocalStorage.getItem(`INFLUENCER_MANAGER_CAMPS_${suffix}`),
    tasks: safeLocalStorage.getItem(`INFLUENCER_MANAGER_TSKS_${suffix}`),
    messages: safeLocalStorage.getItem(`INFLUENCER_MANAGER_MSGS_${suffix}`),
    contracts: safeLocalStorage.getItem(`INFLUENCER_MANAGER_CONTS_${suffix}`),
    billingEntries: safeLocalStorage.getItem(`INFLUENCER_MANAGER_BILLS_${suffix}`),
    aovEntries: safeLocalStorage.getItem(`INFLUENCER_MANAGER_AOV_ENTRIES_${suffix}`),
    monthlyTargets: safeLocalStorage.getItem(`INFLUENCER_MANAGER_MONTHLY_TARGETS_${suffix}`),
  };
  
  safeLocalStorage.setItem(backupKey, JSON.stringify(backupData));
  console.log(`[Schema Migration] Created pre-migration backup: ${backupKey}`);
}

function restorePreMigrationBackup(suffix: string, version: number) {
  const backupKey = `SCHEMA_MIGRATION_BACKUP_v${version}_${suffix}`;
  const backupStr = safeLocalStorage.getItem(backupKey);
  
  if (backupStr) {
    try {
      const backupData = JSON.parse(backupStr);
      
      const payload: Record<string, string> = {};
      if (backupData.influencers) payload[`INFLUENCER_MANAGER_INFS_${suffix}`] = backupData.influencers;
      if (backupData.campaigns) payload[`INFLUENCER_MANAGER_CAMPS_${suffix}`] = backupData.campaigns;
      if (backupData.tasks) payload[`INFLUENCER_MANAGER_TSKS_${suffix}`] = backupData.tasks;
      if (backupData.messages) payload[`INFLUENCER_MANAGER_MSGS_${suffix}`] = backupData.messages;
      if (backupData.contracts) payload[`INFLUENCER_MANAGER_CONTS_${suffix}`] = backupData.contracts;
      if (backupData.billingEntries) payload[`INFLUENCER_MANAGER_BILLS_${suffix}`] = backupData.billingEntries;
      if (backupData.aovEntries) payload[`INFLUENCER_MANAGER_AOV_ENTRIES_${suffix}`] = backupData.aovEntries;
      if (backupData.monthlyTargets) payload[`INFLUENCER_MANAGER_MONTHLY_TARGETS_${suffix}`] = backupData.monthlyTargets;
      
      safeLocalStorage.setItems(payload);
      console.log(`[Schema Migration] Successfully restored from backup: ${backupKey}`);
    } catch (e) {
      console.error("[Schema Migration] Failed to parse backup data!", e);
    }
  } else {
    console.warn(`[Schema Migration] No backup found for key: ${backupKey}`);
  }
}

function migrateV1toV2(suffix: string) {
  // Backward & Forward Compatibility: Ensure non-destructive updates.
  // Add 'createdAt' or 'schemaVersion' to existing items if missing to prevent breaking changes.
  
  const influencersStr = safeLocalStorage.getItem(`INFLUENCER_MANAGER_INFS_${suffix}`);
  if (influencersStr) {
    try {
      let influencers = JSON.parse(influencersStr);
      if (Array.isArray(influencers)) {
        influencers = influencers.map(inf => {
          return {
            ...inf,
            schemaVersion: 2, // Tag with new version
            updatedAt: inf.updatedAt || new Date().toISOString(), // Add default fields if missing
            metadata: inf.metadata || {} // Ensure nested objects exist for forward compatibility
          };
        });
        safeLocalStorage.setItem(`INFLUENCER_MANAGER_INFS_${suffix}`, JSON.stringify(influencers));
      }
    } catch (e) {
      console.error("[Schema Migration] Error migrating influencers", e);
      throw e; // trigger fallback
    }
  }

  const campaignsStr = safeLocalStorage.getItem(`INFLUENCER_MANAGER_CAMPS_${suffix}`);
  if (campaignsStr) {
    try {
      let campaigns = JSON.parse(campaignsStr);
      if (Array.isArray(campaigns)) {
        campaigns = campaigns.map(camp => {
          return {
            ...camp,
            schemaVersion: 2,
            updatedAt: camp.updatedAt || new Date().toISOString()
          };
        });
        safeLocalStorage.setItem(`INFLUENCER_MANAGER_CAMPS_${suffix}`, JSON.stringify(campaigns));
      }
    } catch (e) {
      console.error("[Schema Migration] Error migrating campaigns", e);
      throw e;
    }
  }
}
