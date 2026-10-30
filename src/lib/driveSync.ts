import { DataBackupSnapshot } from './gmailBackup';

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  createdTime?: string;
  modifiedTime?: string;
  size?: string;
}

export interface FullWorkspacePayload {
  influencers?: any[];
  campaigns?: any[];
  tasks?: any[];
  messages?: any[];
  contracts?: any[];
  billingEntries?: any[];
  dashboardProducts?: any[];
  savedProducts?: any[];
  selectedMonth?: any;
  selectedYear?: any;
  monthlyTargets?: any[];
  aovEntries?: any[];
  notebookNotes?: any[];
  salesData?: any[];
  salesFileName?: any;
  monthlyBudgets?: any[];
  [key: string]: any;
}

/**
 * Finds or creates a designated folder in Google Drive.
 */
export async function ensureDriveFolder(
  accessToken: string,
  folderName: string = 'Influencer Manager Backup'
): Promise<string> {
  const query = encodeURIComponent(`name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`;

  const searchRes = await fetch(searchUrl, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!searchRes.ok) {
    const errorText = await searchRes.text();
    if (searchRes.status === 403 && (errorText.includes('insufficient') || errorText.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT'))) {
      throw new Error(`Google Drive permission needed: The Google account requires Drive access permission to save backups. Please click Connect/Sign-in to grant Drive access.`);
    }
    throw new Error(`Failed to search folder on Google Drive (HTTP ${searchRes.status}): ${errorText}`);
  }

  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // Create the folder
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });

  if (!createRes.ok) {
    const errorText = await createRes.text();
    throw new Error(`Failed to create folder on Google Drive (HTTP ${createRes.status}): ${errorText}`);
  }

  const createData = await createRes.json();
  return createData.id;
}

/**
 * Uploads a full JSON snapshot backup to Google Drive from any device worldwide.
 */
export async function uploadFullBackupToGoogleDrive(
  accessToken: string,
  payload: FullWorkspacePayload,
  folderName: string = 'Influencer Manager Backup',
  customFileName?: string
): Promise<{ fileId: string; fileName: string; folderId: string }> {
  const folderId = await ensureDriveFolder(accessToken, folderName);

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB').replace(/\//g, '-');
  const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
  const filename = customFileName || `Local_Backup_${dateStr}_${timeStr}.json`;

  const fullDataToSave = {
    ...payload,
    _backupMetadata: {
      exportedAt: now.toISOString(),
      timestamp: now.getTime(),
      version: '3.5',
      deviceTime: now.toLocaleString(),
      clientInfo: typeof navigator !== 'undefined' ? navigator.userAgent : 'web'
    }
  };

  const fileContent = JSON.stringify(fullDataToSave, null, 2);
  const boundary = '-------314159265358979323846' + Date.now();
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelim = `\r\n--${boundary}--`;

  const metadata: any = {
    name: filename,
    mimeType: 'application/json',
  };
  if (folderId) {
    metadata.parents = [folderId];
  }

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    fileContent +
    closeDelim;

  const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartRequestBody,
  });

  if (!uploadRes.ok) {
    const errorText = await uploadRes.text();
    throw new Error(`Google Drive upload failed (HTTP ${uploadRes.status}): ${errorText}`);
  }

  const uploadData = await uploadRes.json();

  // Also update the latest instant sync file in background
  try {
    const instantSyncFiles = await searchSyncFilesOnDrive(accessToken);
    const instantFile = instantSyncFiles.find(f => f.name === 'influencer-manager-instant-sync.json');
    if (instantFile) {
      await updateSyncFileOnDrive(accessToken, instantFile.id, fullDataToSave as any);
    } else {
      await createSyncFileOnDrive(accessToken, 'influencer-manager-instant-sync.json', fullDataToSave as any);
    }
  } catch (syncErr) {
    console.warn('Instant sync file update skipped/warning:', syncErr);
  }

  return {
    fileId: uploadData.id,
    fileName: filename,
    folderId,
  };
}

/**
 * Searches for all backup files across folders and root in Google Drive.
 */
export async function searchAllBackupFilesOnDrive(accessToken: string): Promise<GoogleDriveFile[]> {
  try {
    const query = encodeURIComponent("(name contains 'Backup' or name contains 'influencer-manager' or name contains 'Local_Backup') and mimeType = 'application/json' and trashed = false");
    const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType,createdTime,modifiedTime,size)&orderBy=modifiedTime desc&pageSize=50`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (response.ok) {
      const data = await response.json();
      return data.files || [];
    }
  } catch (e) {
    console.warn('Broad backup search failed, falling back to specific folders', e);
  }

  return searchSyncFilesOnDrive(accessToken);
}

/**
 * Lists influencer-manager JSON files inside the user's Google Drive.
 */
export async function searchSyncFilesOnDrive(accessToken: string): Promise<GoogleDriveFile[]> {
  const query = encodeURIComponent("name contains 'influencer-manager' and mimeType = 'application/json' and trashed = false");
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType,createdTime,modifiedTime,size)&orderBy=modifiedTime desc`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to list backup documents from Google Drive (HTTP ${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.files || [];
}

/**
 * Creates a brand new backup sync file in Google Drive.
 */
export async function createSyncFileOnDrive(
  accessToken: string,
  fileName: string,
  content: DataBackupSnapshot
): Promise<GoogleDriveFile> {
  // Step 1: Create file metadata
  const metadataUrl = 'https://www.googleapis.com/drive/v3/files';
  const metadataResponse = await fetch(metadataUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: fileName,
      mimeType: 'application/json',
    }),
  });

  if (!metadataResponse.ok) {
    const errorText = await metadataResponse.text();
    throw new Error(`Failed to initialize Google Drive file metadata (HTTP ${metadataResponse.status}): ${errorText}`);
  }

  const fileMetadata = await metadataResponse.json();
  const fileId = fileMetadata.id;

  // Step 2: Upload file contents (Media)
  const mediaUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;
  const mediaResponse = await fetch(mediaUrl, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(content),
  });

  if (!mediaResponse.ok) {
    const errorText = await mediaResponse.text();
    throw new Error(`Failed to write file contents to Google Drive (HTTP ${mediaResponse.status}): ${errorText}`);
  }

  return {
    id: fileId,
    name: fileName,
    mimeType: 'application/json',
  };
}

/**
 * Overwrites/updates an existing sync file in Google Drive with the latest snapshot data.
 */
export async function updateSyncFileOnDrive(
  accessToken: string,
  fileId: string,
  content: DataBackupSnapshot
): Promise<boolean> {
  const mediaUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;
  const response = await fetch(mediaUrl, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(content),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to synchronize content on Google Drive (HTTP ${response.status}): ${errorText}`);
  }

  return true;
}

/**
 * Downloads and parses snapshot content from Google Drive given a fileId.
 */
export async function downloadSyncFileFromDrive(
  accessToken: string,
  fileId: string
): Promise<DataBackupSnapshot> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to download backup content from Google Drive (HTTP ${response.status}): ${errorText}`);
  }

  return await response.json();
}

/**
 * Uploads all product checklists to Google Drive as product-checklists-store.json.
 */
export async function uploadProductChecklistsToDrive(
  accessToken: string,
  store: Record<string, any>,
  folderName: string = 'Influencer Manager Backup'
): Promise<{ fileId: string; fileName: string; productCount: number }> {
  let folderId: string | undefined;
  try {
    folderId = await ensureDriveFolder(accessToken, folderName);
  } catch (e) {
    console.warn('[DriveSync] Could not ensure backup folder, uploading to root:', e);
  }

  const fileName = 'product-checklists-store.json';
  const query = encodeURIComponent(`name = '${fileName}' and trashed = false`);
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`;

  const searchRes = await fetch(searchUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!searchRes.ok) {
    const errorText = await searchRes.text();
    throw new Error(`Failed to search Google Drive (HTTP ${searchRes.status}): ${errorText}`);
  }

  const searchData = await searchRes.json();
  const fileId = searchData.files && searchData.files.length > 0 ? searchData.files[0].id : null;

  const count = Object.keys(store || {}).length;
  const now = new Date();
  const filePayload = {
    type: 'ProductChecklistStoreData',
    version: '1.0',
    timestamp: now.toISOString(),
    deviceTime: now.toLocaleString(),
    productCount: count,
    data: store
  };

  const fileContent = JSON.stringify(filePayload, null, 2);
  const boundary = '-------314159265358979323846' + Date.now();
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelim = `\r\n--${boundary}--`;

  const metadata: any = {
    name: fileName,
    mimeType: 'application/json'
  };
  if (folderId && !fileId) {
    metadata.parents = [folderId];
  }

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    fileContent +
    closeDelim;

  const uploadUrl = fileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

  const uploadRes = await fetch(uploadUrl, {
    method: fileId ? 'PATCH' : 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body: multipartRequestBody
  });

  if (!uploadRes.ok) {
    const errorText = await uploadRes.text();
    throw new Error(`Google Drive upload failed (HTTP ${uploadRes.status}): ${errorText}`);
  }

  const uploadData = await uploadRes.json();
  return {
    fileId: uploadData.id || fileId,
    fileName,
    productCount: count
  };
}

/**
 * Downloads and parses product-checklists-store.json from Google Drive.
 */
export async function downloadProductChecklistsFromDrive(
  accessToken: string
): Promise<{ data: Record<string, any>; count: number; timestamp?: string } | null> {
  const fileName = 'product-checklists-store.json';
  const query = encodeURIComponent(`name = '${fileName}' and trashed = false`);
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc`;

  const searchRes = await fetch(searchUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!searchRes.ok) {
    const errorText = await searchRes.text();
    throw new Error(`Failed to search Google Drive (HTTP ${searchRes.status}): ${errorText}`);
  }

  const searchData = await searchRes.json();
  if (!searchData.files || searchData.files.length === 0) {
    return null;
  }

  const fileId = searchData.files[0].id;
  const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const downloadRes = await fetch(downloadUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!downloadRes.ok) {
    const errorText = await downloadRes.text();
    throw new Error(`Failed to download from Google Drive (HTTP ${downloadRes.status}): ${errorText}`);
  }

  const fileData = await downloadRes.json();
  if (fileData && typeof fileData === 'object') {
    if (fileData.type === 'ProductChecklistStoreData' && fileData.data) {
      return {
        data: fileData.data,
        count: Object.keys(fileData.data).length,
        timestamp: fileData.timestamp || fileData.deviceTime
      };
    }
    // Direct store object fallback
    return {
      data: fileData,
      count: Object.keys(fileData).length
    };
  }

  return null;
}

/**
 * Uploads all payment details to Google Drive as influencer-payment-details-store.json.
 */
export async function uploadPaymentDetailsToDrive(
  accessToken: string,
  records: any[],
  deletedIds: string[] = [],
  folderName: string = 'Influencer Manager Backup'
): Promise<{ fileId: string; fileName: string; recordCount: number }> {
  let folderId: string | undefined;
  try {
    folderId = await ensureDriveFolder(accessToken, folderName);
  } catch (e) {
    console.warn('[DriveSync] Could not ensure backup folder, uploading to root:', e);
  }

  const fileName = 'influencer-payment-details-store.json';
  const query = encodeURIComponent(`name = '${fileName}' and trashed = false`);
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`;

  const searchRes = await fetch(searchUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!searchRes.ok) {
    const errorText = await searchRes.text();
    throw new Error(`Failed to search Google Drive (HTTP ${searchRes.status}): ${errorText}`);
  }

  const searchData = await searchRes.json();
  const fileId = searchData.files && searchData.files.length > 0 ? searchData.files[0].id : null;

  const count = (records || []).length;
  const now = new Date();
  const filePayload = {
    type: 'InfluencerPaymentDetailsStoreData',
    version: '1.0',
    timestamp: now.toISOString(),
    deviceTime: now.toLocaleString(),
    recordCount: count,
    deletedIds: deletedIds || [],
    data: records
  };

  const fileContent = JSON.stringify(filePayload, null, 2);
  const boundary = '-------314159265358979323846' + Date.now();
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelim = `\r\n--${boundary}--`;

  const metadata: any = {
    name: fileName,
    mimeType: 'application/json'
  };
  if (folderId && !fileId) {
    metadata.parents = [folderId];
  }

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    fileContent +
    closeDelim;

  const uploadUrl = fileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

  const uploadRes = await fetch(uploadUrl, {
    method: fileId ? 'PATCH' : 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body: multipartRequestBody
  });

  if (!uploadRes.ok) {
    const errorText = await uploadRes.text();
    throw new Error(`Google Drive upload failed (HTTP ${uploadRes.status}): ${errorText}`);
  }

  const uploadData = await uploadRes.json();
  return {
    fileId: uploadData.id || fileId,
    fileName,
    recordCount: count
  };
}

/**
 * Downloads and parses influencer-payment-details-store.json from Google Drive.
 */
export async function downloadPaymentDetailsFromDrive(
  accessToken: string
): Promise<{ data: any[]; deletedIds?: string[]; count: number; timestamp?: string } | null> {
  const fileName = 'influencer-payment-details-store.json';
  const query = encodeURIComponent(`name = '${fileName}' and trashed = false`);
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc`;

  const searchRes = await fetch(searchUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!searchRes.ok) {
    const errorText = await searchRes.text();
    throw new Error(`Failed to search Google Drive (HTTP ${searchRes.status}): ${errorText}`);
  }

  const searchData = await searchRes.json();
  if (!searchData.files || searchData.files.length === 0) {
    return null;
  }

  const fileId = searchData.files[0].id;
  const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const downloadRes = await fetch(downloadUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!downloadRes.ok) {
    const errorText = await downloadRes.text();
    throw new Error(`Failed to download from Google Drive (HTTP ${downloadRes.status}): ${errorText}`);
  }

  const fileData = await downloadRes.json();
  if (fileData && typeof fileData === 'object') {
    if (fileData.type === 'InfluencerPaymentDetailsStoreData' && Array.isArray(fileData.data)) {
      return {
        data: fileData.data,
        deletedIds: Array.isArray(fileData.deletedIds) ? fileData.deletedIds : [],
        count: fileData.data.length,
        timestamp: fileData.timestamp || fileData.deviceTime
      };
    }
    // Direct array fallback
    if (Array.isArray(fileData)) {
      return {
        data: fileData,
        deletedIds: [],
        count: fileData.length
      };
    }
  }

  return null;
}

export interface ExpenditureBillsCloudStorePayload {
  activeBill: any;
  savedBills: any[];
  customHolidays?: any[];
  outstationPresets?: any[];
  smartDefaults?: any;
  updatedAt?: string;
}

export interface DriveExpenditureFileItem {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  webViewLink?: string;
  webContentLink?: string;
  size?: string;
}

/**
 * Uploads the complete Monthly Expenditure Bills store (monthly-expenditure-bills-store.json)
 * AND an individual editable bill JSON file (Expenditure_Bill_<Month>_<Name>.json) to Google Drive.
 */
export async function uploadExpenditureBillsStoreToDrive(
  accessToken: string,
  payload: ExpenditureBillsCloudStorePayload,
  folderName: string = 'Influencer Manager Backup'
): Promise<{
  storeFileId: string;
  storeFileName: string;
  billFileId?: string;
  billFileName?: string;
  webViewLink?: string;
  billCount: number;
  timestamp: string;
}> {
  let folderId: string | undefined;
  try {
    folderId = await ensureDriveFolder(accessToken, folderName);
  } catch (e) {
    console.warn('[DriveSync] Could not ensure backup folder for expenditure bills, uploading to root:', e);
  }

  const storeFileName = 'monthly-expenditure-bills-store.json';
  const query = encodeURIComponent(`name = '${storeFileName}' and trashed = false`);
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,webViewLink)`;

  const searchRes = await fetch(searchUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!searchRes.ok) {
    const errorText = await searchRes.text();
    throw new Error(`Failed to search Google Drive (HTTP ${searchRes.status}): ${errorText}`);
  }

  const searchData = await searchRes.json();
  const existingStoreFileId =
    searchData.files && searchData.files.length > 0 ? searchData.files[0].id : null;

  const now = new Date();
  const savedBillsList = Array.isArray(payload.savedBills) ? payload.savedBills : [];
  const storeBody = {
    type: 'MonthlyExpenditureBillsStoreData',
    version: '1.0',
    timestamp: now.toISOString(),
    deviceTime: now.toLocaleString(),
    billCount: savedBillsList.length,
    activeBill: payload.activeBill || null,
    savedBills: savedBillsList,
    customHolidays: Array.isArray(payload.customHolidays) ? payload.customHolidays : [],
    outstationPresets: Array.isArray(payload.outstationPresets) ? payload.outstationPresets : [],
    smartDefaults: payload.smartDefaults || null
  };

  const storeContent = JSON.stringify(storeBody, null, 2);
  const boundary = '-------314159265358979323846' + Date.now();
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelim = `\r\n--${boundary}--`;

  const storeMetadata: any = {
    name: storeFileName,
    mimeType: 'application/json'
  };
  if (folderId && !existingStoreFileId) {
    storeMetadata.parents = [folderId];
  }

  const multipartStoreBody =
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    JSON.stringify(storeMetadata) +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    storeContent +
    closeDelim;

  const storeUploadUrl = existingStoreFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingStoreFileId}?uploadType=multipart&fields=id,name,webViewLink`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink';

  const storeUploadRes = await fetch(storeUploadUrl, {
    method: existingStoreFileId ? 'PATCH' : 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body: multipartStoreBody
  });

  if (!storeUploadRes.ok) {
    const errorText = await storeUploadRes.text();
    throw new Error(`Google Drive store upload failed (HTTP ${storeUploadRes.status}): ${errorText}`);
  }

  const storeUploadData = await storeUploadRes.json();

  // Also upload/update an individual JSON file for the active bill so it can be re-edited individually
  let billFileId: string | undefined;
  let billFileName: string | undefined;
  let billWebViewLink: string | undefined;

  if (payload.activeBill && payload.activeBill.billMonthLabel) {
    const cleanMonth = String(payload.activeBill.billMonthLabel || 'Bill')
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanName = String(payload.activeBill.name || 'Employee')
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '_');
    billFileName = `Expenditure_Bill_${cleanMonth}_${cleanName}.json`;

    const billQuery = encodeURIComponent(`name = '${billFileName}' and trashed = false`);
    const billSearchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${billQuery}&fields=files(id,name,webViewLink)`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }
    );

    if (billSearchRes.ok) {
      const billSearchData = await billSearchRes.json();
      const existingBillId =
        billSearchData.files && billSearchData.files.length > 0 ? billSearchData.files[0].id : null;

      const singleBillPayload = {
        type: 'SingleMonthlyExpenditureBill',
        version: '1.0',
        timestamp: now.toISOString(),
        bill: payload.activeBill
      };

      const billBoundary = '-------314159265358979323846bill' + Date.now();
      const billDelimiter = `\r\n--${billBoundary}\r\n`;
      const billCloseDelim = `\r\n--${billBoundary}--`;

      const billMetadata: any = {
        name: billFileName,
        mimeType: 'application/json'
      };
      if (folderId && !existingBillId) {
        billMetadata.parents = [folderId];
      }

      const multipartBillBody =
        billDelimiter +
        'Content-Type: application/json\r\n\r\n' +
        JSON.stringify(billMetadata) +
        billDelimiter +
        'Content-Type: application/json\r\n\r\n' +
        JSON.stringify(singleBillPayload, null, 2) +
        billCloseDelim;

      const billUploadUrl = existingBillId
        ? `https://www.googleapis.com/upload/drive/v3/files/${existingBillId}?uploadType=multipart&fields=id,name,webViewLink`
        : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink';

      const billUploadRes = await fetch(billUploadUrl, {
        method: existingBillId ? 'PATCH' : 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${billBoundary}`
        },
        body: multipartBillBody
      });

      if (billUploadRes.ok) {
        const billUploadData = await billUploadRes.json();
        billFileId = billUploadData.id || existingBillId;
        billWebViewLink = billUploadData.webViewLink;
      }
    }
  }

  return {
    storeFileId: storeUploadData.id || existingStoreFileId,
    storeFileName,
    billFileId,
    billFileName,
    webViewLink: billWebViewLink || storeUploadData.webViewLink,
    billCount: savedBillsList.length,
    timestamp: now.toISOString()
  };
}

/**
 * Uploads a generated Monthly Expenditure Bill PDF (base64 string) directly to Google Drive.
 */
export async function uploadExpenditurePdfToDrive(
  accessToken: string,
  pdfBase64: string,
  pdfFileName: string,
  folderName: string = 'Influencer Manager Backup'
): Promise<{
  fileId: string;
  fileName: string;
  webViewLink?: string;
  webContentLink?: string;
  modifiedTime?: string;
}> {
  let folderId: string | undefined;
  try {
    folderId = await ensureDriveFolder(accessToken, folderName);
  } catch (e) {
    console.warn('[DriveSync] Could not ensure backup folder for PDF, uploading to root:', e);
  }

  const safeName = pdfFileName.replace(/'/g, "\\'");
  const query = encodeURIComponent(`name = '${safeName}' and trashed = false`);
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,webViewLink,webContentLink)`;

  const searchRes = await fetch(searchUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!searchRes.ok) {
    const errorText = await searchRes.text();
    throw new Error(`Failed to search Google Drive for PDF (HTTP ${searchRes.status}): ${errorText}`);
  }

  const searchData = await searchRes.json();
  const existingFileId =
    searchData.files && searchData.files.length > 0 ? searchData.files[0].id : null;

  const boundary = '-------314159265358979323846pdf' + Date.now();
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelim = `\r\n--${boundary}--`;

  const metadata: any = {
    name: pdfFileName,
    mimeType: 'application/pdf'
  };
  if (folderId && !existingFileId) {
    metadata.parents = [folderId];
  }

  const cleanBase64 = pdfBase64.includes(',') ? pdfBase64.split(',')[1] : pdfBase64;

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/pdf\r\n' +
    'Content-Transfer-Encoding: base64\r\n\r\n' +
    cleanBase64 +
    closeDelim;

  const uploadUrl = existingFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart&fields=id,name,modifiedTime,webViewLink,webContentLink`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime,webViewLink,webContentLink';

  const uploadRes = await fetch(uploadUrl, {
    method: existingFileId ? 'PATCH' : 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body: multipartRequestBody
  });

  if (!uploadRes.ok) {
    const errorText = await uploadRes.text();
    throw new Error(`Google Drive PDF upload failed (HTTP ${uploadRes.status}): ${errorText}`);
  }

  const uploadData = await uploadRes.json();
  return {
    fileId: uploadData.id || existingFileId,
    fileName: pdfFileName,
    webViewLink: uploadData.webViewLink,
    webContentLink: uploadData.webContentLink,
    modifiedTime: uploadData.modifiedTime
  };
}

/**
 * Downloads and parses monthly-expenditure-bills-store.json from Google Drive.
 */
export async function downloadExpenditureBillsStoreFromDrive(
  accessToken: string
): Promise<{
  activeBill: any | null;
  savedBills: any[];
  customHolidays: any[];
  outstationPresets: any[];
  smartDefaults: any | null;
  timestamp?: string;
  fileId: string;
} | null> {
  const fileName = 'monthly-expenditure-bills-store.json';
  const query = encodeURIComponent(`name = '${fileName}' and trashed = false`);
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc`;

  const searchRes = await fetch(searchUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!searchRes.ok) {
    const errorText = await searchRes.text();
    throw new Error(`Failed to search Google Drive (HTTP ${searchRes.status}): ${errorText}`);
  }

  const searchData = await searchRes.json();
  if (!searchData.files || searchData.files.length === 0) {
    return null;
  }

  const fileId = searchData.files[0].id;
  const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const downloadRes = await fetch(downloadUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!downloadRes.ok) {
    const errorText = await downloadRes.text();
    throw new Error(`Failed to download expenditure bills store (HTTP ${downloadRes.status}): ${errorText}`);
  }

  const fileData = await downloadRes.json();
  if (fileData && typeof fileData === 'object') {
    return {
      activeBill: fileData.activeBill || null,
      savedBills: Array.isArray(fileData.savedBills) ? fileData.savedBills : [],
      customHolidays: Array.isArray(fileData.customHolidays) ? fileData.customHolidays : [],
      outstationPresets: Array.isArray(fileData.outstationPresets) ? fileData.outstationPresets : [],
      smartDefaults: fileData.smartDefaults || null,
      timestamp: fileData.timestamp || fileData.deviceTime || searchData.files[0].modifiedTime,
      fileId
    };
  }

  return null;
}

/**
 * Lists all Monthly Expenditure Bill files (editable JSON bills, sync store, and generated A4 PDFs) on Google Drive.
 */
export async function listExpenditureBillFilesOnDrive(
  accessToken: string
): Promise<DriveExpenditureFileItem[]> {
  const query = encodeURIComponent(
    `(name contains 'Expenditure_Bill_' or name contains 'MONTHLY_EXPENDATURE_' or name = 'monthly-expenditure-bills-store.json') and trashed = false`
  );
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType,modifiedTime,webViewLink,webContentLink,size)&orderBy=modifiedTime desc&pageSize=50`;

  const res = await fetch(searchUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to list expenditure files on Google Drive (HTTP ${res.status}): ${errorText}`);
  }

  const data = await res.json();
  return Array.isArray(data.files) ? data.files : [];
}

/**
 * Downloads a single Expenditure_Bill_*.json file from Google Drive by fileId for re-editing.
 */
export async function downloadSingleExpenditureBillFileFromDrive(
  accessToken: string,
  fileId: string
): Promise<any | null> {
  const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const res = await fetch(downloadUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to download bill file from Google Drive (HTTP ${res.status}): ${errorText}`);
  }

  const data = await res.json();
  if (!data || typeof data !== 'object') return null;

  if (data.type === 'SingleMonthlyExpenditureBill' && data.bill) {
    return data.bill;
  }
  if (data.type === 'MonthlyExpenditureBillsStoreData' && data.activeBill) {
    return data.activeBill;
  }
  if (Array.isArray(data.rows) && data.billMonthLabel) {
    return data;
  }
  return null;
}

