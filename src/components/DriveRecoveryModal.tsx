import React, { useState, useEffect } from 'react';
import { X, FileJson, Loader2, Download, AlertTriangle, Search, RefreshCw, UploadCloud, CheckCircle2 } from 'lucide-react';
import { GoogleDriveFile, downloadSyncFileFromDrive, searchAllBackupFilesOnDrive } from '../lib/driveSync';
import { googleSignIn } from '../lib/firebaseAuth';

interface DriveRecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  accessToken: string | null;
  onRestore: (data: any) => void;
  onLoginSuccess?: (user: any, token: string) => void;
}

export default function DriveRecoveryModal({ isOpen, onClose, accessToken, onRestore, onLoginSuccess }: DriveRecoveryModalProps) {
  const [files, setFiles] = useState<GoogleDriveFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoredSuccessMessage, setRestoredSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && accessToken) {
      fetchBackupFiles();
    }
  }, [isOpen, accessToken]);

  const fetchBackupFiles = async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      // 1. Search comprehensively for all backup files in Google Drive
      const allFiles = await searchAllBackupFilesOnDrive(accessToken);
      
      // Also check specific backup folder files
      const folderNames = ['Influencer Manager Backup', 'Influencer Manager Data'];
      const folderFileLists: GoogleDriveFile[] = [];

      for (const folderName of folderNames) {
        try {
          const folderQuery = encodeURIComponent(`name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
          const folderRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${folderQuery}&fields=files(id)`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });
          if (folderRes.ok) {
            const folderData = await folderRes.json();
            if (folderData.files && folderData.files.length > 0) {
              const folderId = folderData.files[0].id;
              const filesQuery = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
              const filesRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${filesQuery}&fields=files(id,name,mimeType,createdTime,modifiedTime,size)&orderBy=modifiedTime desc`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
              });
              if (filesRes.ok) {
                const filesData = await filesRes.json();
                if (filesData.files) {
                  folderFileLists.push(...filesData.files);
                }
              }
            }
          }
        } catch (fErr) {
          console.warn(`Folder search for ${folderName} warning:`, fErr);
        }
      }

      // Merge and deduplicate by file ID
      const fileMap = new Map<string, GoogleDriveFile>();
      [...folderFileLists, ...allFiles].forEach(f => {
        if (!fileMap.has(f.id)) {
          fileMap.set(f.id, f);
        }
      });

      const mergedFiles = Array.from(fileMap.values());
      // Sort by modifiedTime desc
      mergedFiles.sort((a, b) => {
        const timeA = new Date(a.modifiedTime || a.createdTime || 0).getTime();
        const timeB = new Date(b.modifiedTime || b.createdTime || 0).getTime();
        return timeB - timeA;
      });

      setFiles(mergedFiles);
    } catch (err: any) {
      console.error("Failed to fetch backup files", err);
      setError("Failed to load files from Google Drive.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignIn = async () => {
    try {
      const result = await googleSignIn();
      if (result && onLoginSuccess) {
        onLoginSuccess(result.user, result.accessToken);
      }
    } catch (err: any) {
      setError(err.message || 'Login failed');
    }
  };

  const handleDownloadFile = async (file: GoogleDriveFile, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!accessToken) return;
    setIsRestoring(true);
    setError(null);
    try {
      const data = await downloadSyncFileFromDrive(accessToken, file.id);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error("Failed to download file", err);
      setError(`Failed to download ${file.name}. Ensure it's a valid backup file.`);
    } finally {
      setIsRestoring(false);
    }
  };

  const handleRestoreFile = async (file: GoogleDriveFile) => {
    if (!accessToken) return;
    if (!window.confirm(`Are you sure you want to restore workspace data from "${file.name}"? Current unsaved local data will be replaced with this backup.`)) {
      return;
    }

    setIsRestoring(true);
    setError(null);
    try {
      const data = await downloadSyncFileFromDrive(accessToken, file.id);
      onRestore(data);
      setRestoredSuccessMessage(`Successfully restored backup from "${file.name}"!`);
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      console.error("Failed to restore file", err);
      setError(`Failed to restore ${file.name}: ${err.message}`);
    } finally {
      setIsRestoring(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between p-5 border-b border-gray-150 bg-gray-50/50">
          <div>
            <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
              <img src="https://upload.wikimedia.org/wikipedia/commons/1/12/Google_Drive_icon_%282020%29.svg" alt="Google Drive" className="w-5 h-5" />
              Recover from Google Drive
            </h2>
            <p className="text-xs text-gray-500 font-medium mt-0.5">Select a backup file from your Google Drive backups across all your devices</p>
          </div>
          <div className="flex items-center gap-2">
            {accessToken && (
              <button
                onClick={fetchBackupFiles}
                disabled={isLoading}
                title="Refresh File List"
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {restoredSuccessMessage && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-5 py-3 flex items-center gap-2 text-emerald-800 text-xs font-bold animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{restoredSuccessMessage}</span>
          </div>
        )}

        <div className="p-5 overflow-y-auto flex-1 bg-gray-50/30">
          {!accessToken ? (
            <div className="text-center py-10 flex flex-col items-center">
              <AlertTriangle className="w-10 h-10 text-orange-500 mb-3" />
              <p className="text-sm text-gray-700 font-bold mb-1">Not Connected to Google Drive</p>
              <p className="text-xs text-gray-500 max-w-sm mx-auto mb-4">You need to sign in with your Google account to browse and recover backups from any device.</p>
              <button
                onClick={handleSignIn}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md transition-colors"
              >
                <UploadCloud className="w-4 h-4" />
                <span>Sign in with Google</span>
              </button>
            </div>
          ) : isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-gray-400">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              <span className="text-sm font-bold text-gray-600">Loading your Google Drive backups...</span>
            </div>
          ) : error ? (
            <div className="py-10 flex flex-col items-center justify-center text-red-500">
              <AlertTriangle className="w-10 h-10 mb-3 opacity-80" />
              <span className="text-sm font-bold">{error}</span>
              <button onClick={fetchBackupFiles} className="mt-4 text-xs font-bold bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200">
                Try Again
              </button>
            </div>
          ) : files.length === 0 ? (
            <div className="text-center py-12 flex flex-col items-center bg-white border border-gray-200 border-dashed rounded-xl">
              <Search className="w-10 h-10 text-gray-300 mb-3" />
              <p className="text-sm font-bold text-gray-800">No backup files found</p>
              <p className="text-xs text-gray-500 mt-1">We couldn't find any backup files in your Google Drive yet. Click "Drive Backup" or "Combo Save" to create one.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {files.map((file) => (
                <div 
                  key={file.id} 
                  className={`flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-white border border-gray-200 hover:border-blue-300 hover:shadow-sm rounded-xl transition-all gap-3 ${isRestoring ? 'opacity-50 pointer-events-none' : ''}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2.5 bg-blue-100 text-blue-600 rounded-lg shrink-0">
                      <FileJson className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-gray-900 truncate" title={file.name}>{file.name}</h4>
                      <p className="text-[11px] text-gray-500 mt-0.5 font-medium">
                        {file.modifiedTime ? new Date(file.modifiedTime).toLocaleString('en-GB') : 'Saved on Drive'} 
                        {file.size ? <span className="ml-2 text-gray-400 font-mono">({(parseInt(file.size) / 1024).toFixed(1)} KB)</span> : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    <button 
                      onClick={(e) => handleDownloadFile(file, e)}
                      title="Download JSON copy"
                      className="flex items-center gap-1 text-[11px] font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 px-2.5 py-1.5 rounded-lg transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download</span>
                    </button>
                    <button 
                      onClick={() => handleRestoreFile(file)}
                      title="Restore data directly to dashboard"
                      className="flex items-center gap-1 text-[11px] font-bold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-colors shadow-sm"
                    >
                      <UploadCloud className="w-3.5 h-3.5" />
                      <span>Restore to App</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {isRestoring && (
          <div className="absolute inset-0 bg-white/70 backdrop-blur-[2px] flex items-center justify-center z-10">
            <div className="bg-white p-5 rounded-2xl shadow-xl flex items-center gap-3 border border-gray-200">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              <span className="text-sm font-bold text-gray-800">Processing Google Drive backup...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
