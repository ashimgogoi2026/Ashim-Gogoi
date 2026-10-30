import React, { useState, useRef } from 'react';
import { HardDrive, RefreshCw, Loader2, UploadCloud, Download, CheckCircle, AlertTriangle, FileDown, FileUp } from 'lucide-react';
import { safeLocalStorage } from '../lib/safeLocalStorage';
import { globalToast } from '../lib/toast';
import { googleSignIn, getGoogleAccessToken } from '../lib/firebaseAuth';
import { dataToCsv, csvToData } from '../lib/csvConverter';
import { searchSyncFilesOnDrive, createSyncFileOnDrive, updateSyncFileOnDrive, downloadSyncFileFromDrive } from '../lib/driveSync';

interface CentralCsvBackupProps {
  influencers: any[];
  campaigns: any[];
  tasks: any[];
  messages: any[];
  contracts: any[];
  billingEntries: any[];
  aovEntries?: any[];
  monthlyTargets?: any[];
  dashboardProducts?: any[];
  savedProducts?: string[];
  notebookNotes?: any[];
  salesData?: any[];
  user?: any;
  accessToken?: string | null;
  onRestoreData: (restoredData: any) => void;
  onLoginSuccess: (user: any, token: string) => void;
}

export default function CentralCsvBackup({
  influencers,
  campaigns,
  tasks,
  messages,
  contracts,
  billingEntries,
  aovEntries = [],
  monthlyTargets = [],
  dashboardProducts = [],
  savedProducts = [],
  notebookNotes = [],
  salesData = [],
  user,
  accessToken,
  onRestoreData,
  onLoginSuccess
}: CentralCsvBackupProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getFullDataPayload = () => ({
    influencers,
    campaigns,
    tasks,
    messages,
    contracts,
    billingEntries,
    aovEntries,
    monthlyTargets,
    dashboardProducts,
    savedProducts,
    notebookNotes,
    salesData
  });

  const handleExport = async () => {
    try {
      setIsExporting(true);
      setErrorMsg('');
      setStatusMsg('Authenticating with Google Drive...');
      
      let token = accessToken;
      if (!user || !token) {
        const { user: newUser, accessToken: newToken } = (await googleSignIn()) || { user: null, accessToken: null };
        token = newToken;
        if (onLoginSuccess && newToken) onLoginSuccess(newUser, newToken as string);
      } else {
        const newToken = await getGoogleAccessToken();
        if (newToken) token = newToken;
      }

      setStatusMsg('Converting data to human-readable CSV format...');
      const payload = getFullDataPayload();
      const csvString = dataToCsv(payload);
      const fileName = `influencer-manager-central-backup-${new Date().toISOString().split('T')[0]}.csv`;
      
      setStatusMsg('Uploading to Google Drive...');
      
      const boundary = 'foo_bar_baz';
      const delimiter = "\r\n--" + boundary + "\r\n";
      const close_delim = "\r\n--" + boundary + "--";

      const metadata = {
        name: fileName,
        mimeType: 'text/csv'
      };

      const multipartRequestBody =
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: text/csv\r\n\r\n' +
        csvString +
        close_delim;

      const url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartRequestBody
      });

      if (!response.ok) {
        throw new Error('Failed to upload CSV to Google Drive');
      }

      setStatusMsg('Backup successfully saved to Google Drive!');
      globalToast.success('Backup successfully saved to Google Drive!');
      setTimeout(() => setStatusMsg(''), 5000);
      
      safeLocalStorage.setItem('LAST_CENTRAL_CSV_BACKUP', new Date().toISOString());
      
    } catch (err: any) {
      console.error(err);
      const msg = err.message || 'An error occurred during export.';
      setErrorMsg(msg);
      globalToast.error(msg);
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async () => {
    try {
      setIsImporting(true);
      setErrorMsg('');
      setStatusMsg('Authenticating with Google Drive...');
      
      let token = accessToken;
      if (!user || !token) {
        const { user: newUser, accessToken: newToken } = (await googleSignIn()) || { user: null, accessToken: null };
        token = newToken;
        if (onLoginSuccess && newToken) onLoginSuccess(newUser, newToken as string);
      } else {
        const newToken = await getGoogleAccessToken();
        if (newToken) token = newToken;
      }

      setStatusMsg('Searching for latest Central CSV backup...');
      const query = encodeURIComponent("name contains 'influencer-manager-central-backup' and mimeType = 'text/csv' and trashed = false");
      const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,createdTime)&orderBy=createdTime desc`;
      
      const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` }});
      const data = await response.json();
      
      if (!data.files || data.files.length === 0) {
        throw new Error('No Central CSV backups found in your Google Drive.');
      }
      
      const latestFile = data.files[0];
      setStatusMsg(`Downloading ${latestFile.name}...`);
      
      const contentRes = await fetch(`https://www.googleapis.com/drive/v3/files/${latestFile.id}?alt=media`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!contentRes.ok) throw new Error('Failed to download CSV content.');
      
      const csvContent = await contentRes.text();
      
      setStatusMsg('Parsing and restoring data...');
      const restoredData = csvToData(csvContent);
      
      onRestoreData(restoredData);
      
      setStatusMsg('Import successful! Data restored.');
      globalToast.success('Import successful! Data restored.');
      setTimeout(() => setStatusMsg(''), 5000);
      
    } catch (err: any) {
      console.error(err);
      const msg = err.message || 'An error occurred during import.';
      setErrorMsg(msg);
      globalToast.error(msg);
    } finally {
      setIsImporting(false);
    }
  };

  const handleLocalExport = () => {
    try {
      setIsExporting(true);
      setErrorMsg('');
      setStatusMsg('Converting data to human-readable CSV format...');
      
      const payload = getFullDataPayload();
      const csvString = dataToCsv(payload);
      const fileName = `influencer-manager-central-backup-${new Date().toISOString().split('T')[0]}.csv`;
      
      const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setStatusMsg('Backup successfully downloaded to local system!');
      globalToast.success('Backup successfully downloaded to local system!');
      setTimeout(() => setStatusMsg(''), 5000);
      
      safeLocalStorage.setItem('LAST_CENTRAL_CSV_BACKUP', new Date().toISOString());
    } catch (err: any) {
      console.error(err);
      const msg = err.message || 'An error occurred during local export.';
      setErrorMsg(msg);
      globalToast.error(msg);
    } finally {
      setIsExporting(false);
    }
  };

  const handleLocalImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleLocalImportChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsImporting(true);
      setErrorMsg('');
      setStatusMsg(`Reading file ${file.name}...`);
      
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const csvContent = event.target?.result as string;
          setStatusMsg('Parsing and restoring data...');
          const restoredData = csvToData(csvContent);
          
          onRestoreData(restoredData);
          
          setStatusMsg('Local import successful! Data restored.');
          globalToast.success('Local import successful! Data restored.');
          setTimeout(() => setStatusMsg(''), 5000);
          
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
        } catch (err: any) {
          console.error(err);
          const msg = err.message || 'An error occurred parsing the file.';
          setErrorMsg(msg);
          globalToast.error(msg);
        } finally {
          setIsImporting(false);
        }
      };
      
      reader.onerror = () => {
        setErrorMsg('Failed to read the file.');
        globalToast.error('Failed to read the file.');
        setIsImporting(false);
      };
      
      reader.readAsText(file);
    } catch (err: any) {
      console.error(err);
      const msg = err.message || 'An error occurred during local import.';
      setErrorMsg(msg);
      globalToast.error(msg);
      setIsImporting(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-150 p-6 shadow-sm mb-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-emerald-100 text-emerald-700 rounded-xl">
          <HardDrive className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-800">Central CSV Backup</h2>
          <p className="text-sm text-slate-500 mt-1">Export your data to a human-readable CSV or import from a previous backup.</p>
        </div>
      </div>
      
      {statusMsg && (
        <div className="mb-6 p-4 bg-emerald-50 text-emerald-800 rounded-xl border border-emerald-100 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-emerald-600" />
          <span className="font-medium text-sm">{statusMsg}</span>
        </div>
      )}
      
      {errorMsg && (
        <div className="mb-6 p-4 bg-red-50 text-red-800 rounded-xl border border-red-100 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <span className="font-medium text-sm">{errorMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <button
          onClick={handleExport}
          disabled={isExporting || isImporting}
          className="flex flex-col items-center justify-center p-6 border-2 border-slate-200 border-dashed rounded-2xl hover:border-emerald-400 hover:bg-emerald-50 transition-all disabled:opacity-50 group"
        >
          {isExporting ? (
            <Loader2 className="w-8 h-8 text-emerald-500 animate-spin mb-3" />
          ) : (
            <UploadCloud className="w-8 h-8 text-slate-400 group-hover:text-emerald-500 mb-3 transition-colors" />
          )}
          <span className="font-bold text-slate-700">Export to Google Drive</span>
          <span className="text-xs text-slate-500 mt-2 text-center">Creates a human-readable multi-table CSV in Cloud</span>
        </button>
        
        <button
          onClick={handleImport}
          disabled={isExporting || isImporting}
          className="flex flex-col items-center justify-center p-6 border-2 border-slate-200 border-dashed rounded-2xl hover:border-indigo-400 hover:bg-indigo-50 transition-all disabled:opacity-50 group"
        >
          {isImporting ? (
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-3" />
          ) : (
            <Download className="w-8 h-8 text-slate-400 group-hover:text-indigo-500 mb-3 transition-colors" />
          )}
          <span className="font-bold text-slate-700">Import from Google Drive</span>
          <span className="text-xs text-slate-500 mt-2 text-center">Restores from the latest Central CSV Backup in Cloud</span>
        </button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          onClick={handleLocalExport}
          disabled={isExporting || isImporting}
          className="flex flex-col items-center justify-center p-6 border-2 border-slate-200 border-dashed rounded-2xl hover:border-teal-400 hover:bg-teal-50 transition-all disabled:opacity-50 group"
        >
          <FileDown className="w-8 h-8 text-slate-400 group-hover:text-teal-500 mb-3 transition-colors" />
          <span className="font-bold text-slate-700">Local Download (CSV)</span>
          <span className="text-xs text-slate-500 mt-2 text-center">Download CSV backup to your computer</span>
        </button>
        
        <button
          onClick={handleLocalImportClick}
          disabled={isExporting || isImporting}
          className="flex flex-col items-center justify-center p-6 border-2 border-slate-200 border-dashed rounded-2xl hover:border-blue-400 hover:bg-blue-50 transition-all disabled:opacity-50 group"
        >
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleLocalImportChange} 
            accept=".csv" 
            className="hidden" 
          />
          <FileUp className="w-8 h-8 text-slate-400 group-hover:text-blue-500 mb-3 transition-colors" />
          <span className="font-bold text-slate-700">Local Import (CSV)</span>
          <span className="text-xs text-slate-500 mt-2 text-center">Restore from a local CSV file</span>
        </button>
      </div>
    </div>
  );
}
