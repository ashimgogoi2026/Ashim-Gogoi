import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  Calendar as CalendarIcon, Plus, Trash2, Edit3, FileText, 
  ChevronLeft, ChevronRight, X, Pin, Download, Upload, FileSpreadsheet, Copy, UserPlus, Search,
  Instagram, Facebook, Youtube, Target
, RefreshCw, CloudUpload, ExternalLink, ChevronDown, Cloud, RotateCcw, History, Undo2, CheckCircle2, AlertCircle, TriangleAlert, MessageCircle,
  Bookmark, Star, Globe, Link2, Check, GripVertical } from 'lucide-react';
import Papa from 'papaparse';
import { Note, Influencer, Campaign as CampaignType, Task, ImportantLink } from '../types';
import { safeLocalStorage } from '../lib/safeLocalStorage';
import { getGoogleAccessToken } from '../lib/firebaseAuth';
import { triggerUpdateWhatsAppModal } from '../lib/whatsappPrompt';
import { openWhatsAppChat, cleanSingleMobileForStorage } from '../lib/whatsappHelper';
import { formatDateToDMY } from '../lib/dateUtils';



interface CalendarNotebookProps {
  accessToken?: string | null;
  notes?: Note[];
  setNotes?: React.Dispatch<React.SetStateAction<Note[]>>;
  user?: any;
  influencers: Influencer[];
  campaigns: CampaignType[];
  wizardProducts?: string[];
  onAddInfluencer?: (influencer: Omit<Influencer, 'id' | 'perfRanking' | 'rating'> & { status?: Influencer['status'] }) => void;
  onUpdateInfluencer?: (id: string, updates: Partial<Influencer>) => void;
  tasks?: Task[];
  setTasks?: React.Dispatch<React.SetStateAction<Task[]>>;
  onUpdateTask?: (id: string, updates: Partial<Task>) => void;
  monthlyTargets?: any[];
  setMonthlyTargets?: React.Dispatch<React.SetStateAction<any[]>>;
}

export default function SmartAINotebook({ 
  accessToken,
  influencers, 
  campaigns, 
  wizardProducts = [], 
  onAddInfluencer, 
  onUpdateInfluencer, 
  tasks, 
  setTasks, 
  onUpdateTask, 
  monthlyTargets = [], 
  setMonthlyTargets, 
  notes = [], 
  setNotes = () => {}, 
  user 
}: CalendarNotebookProps) {
  useEffect(() => {
    let needsMigration = false;
    const migratedNotes = notes.map(n => {
      if (n.date && n.date.endsWith('-AddressBook') && n.date !== 'Global-AddressBook') {
        needsMigration = true;
        return { ...n, date: 'Global-AddressBook' };
      }
      return n;
    });
    if (needsMigration) {
      setNotes(migratedNotes);
    }
  }, []);

  const handleAddToCreatorDatabase = (note: Note) => {
    if (!onAddInfluencer) return;
    const name = note.creatorName || note.title || 'Addressbook Contact';
    const mobileNum = (note.mobileNumber || '').trim();

    // Check if creator exists by name, mobile, or social link
    const existingInfluencer = influencers.find(inf => {
      if (inf.name && name && inf.name.trim().toLowerCase() === name.trim().toLowerCase()) return true;
      if (mobileNum && inf.mobile && inf.mobile.trim() === mobileNum) return true;
      if (mobileNum && (inf as any).whatsapp && String((inf as any).whatsapp).trim() === mobileNum) return true;
      return false;
    });

    if (existingInfluencer) {
      const updates: any = {};
      let hasUpdates = false;

      // Location / Address
      if ((!existingInfluencer.location || existingInfluencer.location.trim() === '') && note.address) {
        updates.location = note.address;
        updates.address = note.address;
        hasUpdates = true;
      }

      // Mobile / WhatsApp number
      if (note.mobileNumber && note.mobileNumber.trim()) {
        const cleanNum = note.mobileNumber.trim();
        if (cleanNum) {
          const single = cleanSingleMobileForStorage(cleanNum);
          updates.mobile = single;
          updates.whatsapp = single;
          updates.whatsappNumber = single;
          updates.phone = single;
          updates.mobileNumber = single;
          hasUpdates = true;
        }
      }

      // Social Links
      ['instagramLink', 'facebookLink', 'youtubeLink'].forEach((field: string) => {
        const noteLink = (note as any)[field];
        if (noteLink && noteLink.trim()) {
          const existingLink = (existingInfluencer as any)[field];
          if (!existingLink || existingLink.trim() === '') {
            updates[field] = noteLink.trim();
            hasUpdates = true;
          } else if (!existingLink.includes(noteLink.trim())) {
            updates[field] = `${existingLink} | ${noteLink.trim()}`;
            hasUpdates = true;
          }
        }
      });

      // Cost per post
      if (note.costPerPost && (!existingInfluencer.costPerPost || note.costPerPost > existingInfluencer.costPerPost)) {
        updates.costPerPost = note.costPerPost;
        hasUpdates = true;
      }

      // Notes / Description
      if (note.content && note.content.trim()) {
        if (!existingInfluencer.notes || existingInfluencer.notes.trim() === '') {
          updates.notes = note.content;
          hasUpdates = true;
        } else if (!existingInfluencer.notes.includes(note.content.trim())) {
          updates.notes = `${existingInfluencer.notes}\n\n${note.content}`;
          hasUpdates = true;
        }
      }

      // Sample details
      if (note.sampleDetails && Array.isArray(note.sampleDetails) && note.sampleDetails.length > 0) {
        const existingSamples = (existingInfluencer as any).sampleDetails || [];
        updates.sampleDetails = [...existingSamples, ...note.sampleDetails];
        hasUpdates = true;
      }

      if (hasUpdates) {
        if (onUpdateInfluencer) {
          onUpdateInfluencer(existingInfluencer.id, updates);
          alert(`Creator "${name}" already existed in Creator Database. Updated missing details including WhatsApp number (${note.mobileNumber || 'N/A'}), address, links, and samples!`);
        } else {
          alert(`Creator "${name}" already existed. Unable to update missing details.`);
        }
      } else {
        alert(`Double entry detected! Creator "${name}" already exists with complete WhatsApp and contact details.`);
      }
      return;
    }

    // Build complete notes content including samples if available
    let notesContent = note.content || '';
    if (note.sampleDetails && Array.isArray(note.sampleDetails) && note.sampleDetails.length > 0) {
      const sampleSummary = note.sampleDetails.map((s: any) => `${s.productName || s.product || 'Sample'} (₹${s.cost || 0})`).join(', ');
      notesContent += notesContent ? `\n\nSamples: ${sampleSummary}` : `Samples: ${sampleSummary}`;
    }

    const cleanMobile = (note.mobileNumber || '').trim();
    const handleName = (note.instagramLink ? note.instagramLink.split('/').filter(Boolean).pop()?.replace('@', '') : '') || name.toLowerCase().replace(/\s+/g, '_');

    onAddInfluencer({
      name: name,
      handle: handleName,
      avatar: 'https://images.unsplash.com/photo-1518020382113-a7e8fc38eac9?w=150&h=150&fit=crop&crop=faces&q=80',
      niche: 'Lifestyle',
      followers: 10000,
      engagementRate: 2.0,
      location: note.address || '',
      address: note.address || '',
      topDemographics: [{ ageRange: '18-24', percentage: 100 }],
      platforms: [{ name: 'Instagram', followers: '10K' }],
      costPerPost: note.costPerPost || 0,
      averageROI: 1,
      status: 'Available',
      mobile: cleanMobile,
      whatsapp: cleanMobile,
      whatsappNumber: cleanMobile,
      phone: cleanMobile,
      mobileNumber: cleanMobile,
      instagramLink: note.instagramLink || '',
      facebookLink: note.facebookLink || '',
      youtubeLink: note.youtubeLink || '',
      notes: notesContent,
      sampleDetails: note.sampleDetails || [],
      targetMonth: note.targetMonth || '',
      targetYear: note.targetYear || ''
    });
    
    alert(`Creator "${name}" with WhatsApp number (${cleanMobile || 'N/A'}) and full Addressbook details added to the Creator Database successfully!`);
  };

  const handleDownloadAddressbookCSV = () => {
    let records: any[] = [];
    
    const sanitizeText = (text: any) => {
      if (!text) return '';
      return String(text).replace(/[\r\n]+/g, ', ').trim();
    };
    
    notesForSelectedDate.forEach(note => {
      records.push({
        'id': sanitizeText(note.id),
        'Name': sanitizeText(note.creatorName || note.title),
        'Mobile Number': sanitizeText(note.mobileNumber),
        'Address': sanitizeText(note.address),
        'Cost Per Post': sanitizeText(note.costPerPost),
        'Instagram': sanitizeText(note.instagramLink),
        'Facebook': sanitizeText(note.facebookLink),
        'YouTube': sanitizeText(note.youtubeLink),
        'sampleDetails': note.sampleDetails && note.sampleDetails.length > 0 ? JSON.stringify(note.sampleDetails) : ''
      });
    });

    if (records.length === 0) {
      alert('No address book records found.');
      return;
    }

    const csv = Papa.unparse(records);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `AddressBook_${selectedDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadSamplesCSV = () => {
    let records: any[] = [];
    let totalCost = 0;
    
    const sanitizeText = (text: any) => {
      if (!text) return '';
      return String(text).replace(/[\r\n]+/g, ', ').trim();
    };
    
    notesForSelectedDate.forEach(note => {
      if (note.sampleDetails && note.sampleDetails.length > 0) {
        note.sampleDetails.forEach((sample: any) => {
          if (csvStartDate && sample.orderDate) {
            const sDate = new Date(sample.orderDate).getTime();
            const filterDate = new Date(csvStartDate).getTime();
            if (!isNaN(sDate) && !isNaN(filterDate) && sDate < filterDate) {
              return; // Skip samples before the selected date
            }
          }
          
          const cost = typeof sample.cost === 'number' ? sample.cost : (parseFloat(sample.cost as string) || 0);
          totalCost += cost;
          records.push({
            'Creator Name': sanitizeText(note.creatorName || note.title),
            'Mobile Number': sanitizeText(note.mobileNumber),
            'Address': sanitizeText(note.address),
            'Platform': sanitizeText(sample.platform),
            'Cost': sanitizeText(sample.cost),
            'Order ID': sanitizeText(sample.orderId),
            'Order Date': sanitizeText(sample.orderDate),
            'Product': sanitizeText(sample.product),
            'Sub Category': sanitizeText(sample.subCategory)
          });
        });
      }
    });

    if (records.length === 0) {
      alert('No sample records found in the visible address book entries.');
      return;
    }

    // Sort by Order Date (old to new)
    records.sort((a, b) => {
      const dateA = new Date(a['Order Date']).getTime();
      const dateB = new Date(b['Order Date']).getTime();
      if (isNaN(dateA) && isNaN(dateB)) return 0;
      if (isNaN(dateA)) return 1;
      if (isNaN(dateB)) return -1;
      return dateA - dateB;
    });

    // Add total row at the end
    records.push({
      'Creator Name': 'TOTAL COST',
      'Mobile Number': '',
      'Address': '',
      'Platform': '',
      'Cost': totalCost.toFixed(2),
      'Order ID': '',
      'Order Date': '',
      'Product': '',
      'Sub Category': ''
    });

    const csvString = Papa.unparse(records);
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Sample_Records_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleOpenDriveSheet = (urlToOpen?: string) => {
    const targetUrl = urlToOpen || extractionMessage?.url;
    if (!targetUrl) {
      alert("Spreadsheet URL is not available. Please try running the extraction again.");
      return;
    }
    const opened = window.open(targetUrl, '_blank', 'noopener,noreferrer');
    if (!opened || opened.closed || typeof opened.closed === 'undefined') {
      try {
        if (window.top && window.top !== window) {
          window.top.open(targetUrl, '_blank', 'noopener,noreferrer');
        } else {
          window.location.assign(targetUrl);
        }
      } catch (e) {
        window.location.assign(targetUrl);
      }
    }
  };

  const handleExtractSamplesToGoogleSheets = async () => {
    let token = accessToken || getGoogleAccessToken();
    if (!token) {
      const msg = "Please sign in with Google first using the 'Cloud Backup & Restore' button at the top right to enable Google Sheet extraction!";
      setExtractionMessage({
        type: 'error',
        text: msg
      });
      alert(msg);
      return;
    }

    setIsExtractingSheets(true);
    setExtractionMessage(null);

    try {
      // 1. Create a new Spreadsheet file
      const createSpreadsheetResponse = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          properties: {
            title: `Influencer Manager Samples Extraction - ${selectedDate} (${new Date().toISOString().split('T')[0]})`
          }
        })
      });

      if (!createSpreadsheetResponse.ok) {
        const errorText = await createSpreadsheetResponse.text();
        throw new Error(`Failed to create spreadsheet: ${createSpreadsheetResponse.statusText}. Details: ${errorText}`);
      }

      const spreadsheet = await createSpreadsheetResponse.json();
      const spreadsheetId = spreadsheet.spreadsheetId;
      const spreadsheetUrl = spreadsheet.spreadsheetUrl || (spreadsheetId ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` : '');
      const firstSheetName = spreadsheet.sheets && spreadsheet.sheets.length > 0 
        ? spreadsheet.sheets[0].properties.title 
        : 'Sheet1';

      // 2. Prepare headers and rows of sample records
      const sheetData = [
        [
          'Serial No',
          'Creator Name',
          'Mobile Number',
          'Address',
          'Platform',
          'Cost (₹)',
          'Order ID',
          'Order Date',
          'Product',
          'Sub Category'
        ]
      ];

      let records: any[] = [];
      let totalCost = 0;
      
      const sanitizeText = (text: any) => {
        if (!text) return '';
        return String(text).replace(/[\r\n]+/g, ', ').trim();
      };
      
      notesForSelectedDate.forEach(note => {
        if (note.sampleDetails && note.sampleDetails.length > 0) {
          note.sampleDetails.forEach((sample: any) => {
            if (csvStartDate && sample.orderDate) {
              const sDate = new Date(sample.orderDate).getTime();
              const filterDate = new Date(csvStartDate).getTime();
              if (!isNaN(sDate) && !isNaN(filterDate) && sDate < filterDate) {
                return; // Skip samples before the selected date
              }
            }
            
            const cost = typeof sample.cost === 'number' ? sample.cost : (parseFloat(sample.cost as string) || 0);
            totalCost += cost;
            records.push({
              'Creator Name': sanitizeText(note.creatorName || note.title),
              'Mobile Number': sanitizeText(note.mobileNumber),
              'Address': sanitizeText(note.address),
              'Platform': sanitizeText(sample.platform),
              'Cost': sanitizeText(sample.cost),
              'Order ID': sanitizeText(sample.orderId),
              'Order Date': sanitizeText(sample.orderDate),
              'Product': sanitizeText(sample.product),
              'Sub Category': sanitizeText(sample.subCategory)
            });
          });
        }
      });

      if (records.length === 0) {
        const msg = 'No sample records found in the visible address book entries to extract.';
        setExtractionMessage({
          type: 'error',
          text: msg
        });
        alert(msg);
        setIsExtractingSheets(false);
        return;
      }

      // Sort by Order Date (old to new)
      records.sort((a, b) => {
        const dateA = new Date(a['Order Date']).getTime();
        const dateB = new Date(b['Order Date']).getTime();
        if (isNaN(dateA) && isNaN(dateB)) return 0;
        if (isNaN(dateA)) return 1;
        if (isNaN(dateB)) return -1;
        return dateA - dateB;
      });

      records.forEach((r, idx) => {
        sheetData.push([
          (idx + 1).toString(),
          r['Creator Name'],
          r['Mobile Number'],
          r['Address'],
          r['Platform'],
          r['Cost'],
          r['Order ID'],
          r['Order Date'],
          r['Product'],
          r['Sub Category']
        ]);
      });

      // Add summary/totals row
      sheetData.push([
        'TOTAL COST',
        '-',
        '-',
        '-',
        '-',
        totalCost.toFixed(2),
        '-',
        '-',
        '-',
        '-'
      ]);

      // 3. Write data to the spreadsheet
      const writeResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          valueInputOption: 'USER_ENTERED',
          data: [
            {
              range: `'${firstSheetName}'!A1`,
              majorDimension: 'ROWS',
              values: sheetData
            }
          ]
        })
      });

      if (!writeResponse.ok) {
        const errorText = await writeResponse.text();
        throw new Error(`Failed to write values: ${writeResponse.statusText}. Details: ${errorText}`);
      }

      setExtractionMessage({
        type: 'success',
        text: 'Successfully extracted to Google Sheets!',
        url: spreadsheetUrl
      });
      try {
        if (spreadsheetUrl) {
          window.open(spreadsheetUrl, '_blank', 'noopener,noreferrer');
        }
      } catch (e) {
        console.log('Auto popup blocked:', e);
      }
    } catch (err: any) {
      console.error(err);
      setExtractionMessage({
        type: 'error',
        text: `Extraction error: ${err.message || err}`
      });
    } finally {
      setIsExtractingSheets(false);
    }
  };

  const handleUploadAddressBookToDrive = async () => {
    let token = accessToken;
    if (!token) {
      try {
        token = await getGoogleAccessToken();
      } catch (e) {
        // ignore
      }
    }
    if (!token) {
      alert('Connect Google Drive to use this feature.');
      return;
    }

    setIsDriveSyncing(true);
    try {
      const payload = notes.filter(n => n.date.includes('-AddressBook'));

      const fileData = {
        type: 'AddressBookData',
        version: '1.0',
        timestamp: new Date().toISOString(),
        data: payload
      };

      const query = encodeURIComponent("name = 'influencer-addressbook-data.json' and trashed = false");
      const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`;
      
      const searchRes = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      const searchData = await searchRes.json();
      let fileId = searchData.files && searchData.files.length > 0 ? searchData.files[0].id : null;

      const fileContent = JSON.stringify(fileData);
      const metadata = {
        name: 'influencer-addressbook-data.json',
        mimeType: 'application/json'
      };

      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', new Blob([fileContent], { type: 'application/json' }));

      let uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
      let method = 'POST';

      if (fileId) {
        uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`;
        method = 'PATCH';
      }

      const uploadRes = await fetch(uploadUrl, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: form
      });

      if (!uploadRes.ok) {
        throw new Error('Upload failed.');
      }

      alert('Successfully uploaded Address Book to Google Drive.');
    } catch (err: any) {
      console.error(err);
      alert(`Upload failed: ${err.message}`);
    } finally {
      setIsDriveSyncing(false);
    }
  };

  const handleSyncAddressBookFromDrive = async () => {
    let token = accessToken;
    if (!token) {
      try {
        token = await getGoogleAccessToken();
      } catch (e) {
        // ignore
      }
    }
    if (!token) {
      alert('Connect Google Drive to use this feature.');
      return;
    }

    setIsDriveSyncing(true);
    try {
      const query = encodeURIComponent("name = 'influencer-addressbook-data.json' and trashed = false");
      const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`;
      
      const searchRes = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      const searchData = await searchRes.json();
      const fileId = searchData.files && searchData.files.length > 0 ? searchData.files[0].id : null;

      if (!fileId) {
        alert('No synced Address Book data found in Google Drive.');
        setIsDriveSyncing(false);
        return;
      }

      const downloadRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!downloadRes.ok) throw new Error('Failed to download file.');

      const fileData = await downloadRes.json();
      if (fileData.type !== 'AddressBookData' || !Array.isArray(fileData.data)) {
        throw new Error('Invalid file format.');
      }

      if (setNotes) {
        const notesNotSelected = notes.filter(n => !(n.date || '').includes('-AddressBook'));
        const notesForSelected = notes.filter(n => (n.date || '').includes('-AddressBook'));
        
        const mergedMap = new Map();
        notesForSelected.forEach(n => {
            if (!n.id) n.id = crypto.randomUUID();
            mergedMap.set(n.id, n);
        });
        
        const getTs = (obj: any) => {
            if (obj && obj.lastUpdated) {
                const t = new Date(obj.lastUpdated).getTime();
                if (!isNaN(t)) return t;
            }
            if (obj && obj.timestamp) {
                const t = new Date(obj.timestamp).getTime();
                if (!isNaN(t)) return t;
            }
            return 0;
        };

        let addedCount = 0;
        let updatedCount = 0;
        fileData.data.forEach((n: any) => {
           const driveNote = { ...n, id: n.id || crypto.randomUUID() };
           const existingNote = mergedMap.get(driveNote.id);
           
           if (!existingNote) {
              mergedMap.set(driveNote.id, driveNote);
              addedCount++;
           } else {
              const driveTs = getTs(driveNote);
              const existTs = getTs(existingNote);
              if (driveTs > existTs) {
                  mergedMap.set(driveNote.id, { ...existingNote, ...driveNote });
                  updatedCount++;
              }
           }
        });

        const finalMergedSelectedNotes = Array.from(mergedMap.values());
        
        setNotes([...notesNotSelected, ...finalMergedSelectedNotes]);
        alert(`Successfully updated! Added ${addedCount} new entries, updated ${updatedCount} existing entries. Your other records were safely preserved.`);
      }
    } catch (err: any) {
      console.error(err);
      alert(`Sync failed: ${err.message}`);
    } finally {
      setIsDriveSyncing(false);
    }
  };

  const handleUploadMonthlyTargetToDrive = async () => {
    let token = accessToken;
    if (!token) {
      try {
        token = await getGoogleAccessToken();
      } catch (e) {
        // ignore
      }
    }
    if (!token) {
      alert('Connect Google Drive to use this feature.');
      return;
    }

    setIsDriveSyncing(true);
    try {
      const payload = notes.filter(n => (n.date || '').includes('-MonthlyTarget'));

      const fileData = {
        type: 'MonthlyTargetData',
        version: '1.0',
        timestamp: new Date().toISOString(),
        data: payload
      };

      const query = encodeURIComponent("name = 'influencer-monthlytarget-data.json' and trashed = false");
      const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`;
      
      const searchRes = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      const searchData = await searchRes.json();
      let fileId = searchData.files && searchData.files.length > 0 ? searchData.files[0].id : null;

      const fileContent = JSON.stringify(fileData);
      const metadata = {
        name: 'influencer-monthlytarget-data.json',
        mimeType: 'application/json'
      };

      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', new Blob([fileContent], { type: 'application/json' }));

      let uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
      let method = 'POST';

      if (fileId) {
        uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`;
        method = 'PATCH';
      }

      const uploadRes = await fetch(uploadUrl, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: form
      });

      if (!uploadRes.ok) {
        throw new Error('Upload failed.');
      }

      alert('Successfully uploaded Monthly Target to Google Drive.');
    } catch (err: any) {
      console.error(err);
      alert(`Upload failed: ${err.message}`);
    } finally {
      setIsDriveSyncing(false);
    }
  };

  const handleSyncMonthlyTargetFromDrive = async () => {
    let token = accessToken;
    if (!token) {
      try {
        token = await getGoogleAccessToken();
      } catch (e) {
        // ignore
      }
    }
    if (!token) {
      alert('Connect Google Drive to use this feature.');
      return;
    }

    setIsDriveSyncing(true);
    try {
      const query = encodeURIComponent("name = 'influencer-monthlytarget-data.json' and trashed = false");
      const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`;
      
      const searchRes = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      const searchData = await searchRes.json();
      const fileId = searchData.files && searchData.files.length > 0 ? searchData.files[0].id : null;

      if (!fileId) {
        alert('No synced Monthly Target data found in Google Drive.');
        setIsDriveSyncing(false);
        return;
      }

      const downloadRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!downloadRes.ok) throw new Error('Failed to download file.');

      const fileData = await downloadRes.json();
      if (fileData.type !== 'MonthlyTargetData' || !Array.isArray(fileData.data)) {
        throw new Error('Invalid file format.');
      }

      if (setNotes) {
        const notesNotSelected = notes.filter(n => !(n.date || '').includes('-MonthlyTarget'));
        const notesForSelected = notes.filter(n => (n.date || '').includes('-MonthlyTarget'));
        
        const mergedMap = new Map();
        notesForSelected.forEach(n => {
            if (!n.id) n.id = crypto.randomUUID();
            mergedMap.set(n.id, n);
        });
        
        const getTs = (obj: any) => {
            if (obj && obj.lastUpdated) {
                const t = new Date(obj.lastUpdated).getTime();
                if (!isNaN(t)) return t;
            }
            if (obj && obj.timestamp) {
                const t = new Date(obj.timestamp).getTime();
                if (!isNaN(t)) return t;
            }
            return 0;
        };

        let addedCount = 0;
        let updatedCount = 0;
        fileData.data.forEach((n: any) => {
           const driveNote = { ...n, id: n.id || crypto.randomUUID() };
           const existingNote = mergedMap.get(driveNote.id);
           
           if (!existingNote) {
              mergedMap.set(driveNote.id, driveNote);
              addedCount++;
           } else {
              const driveTs = getTs(driveNote);
              const existTs = getTs(existingNote);
              if (driveTs > existTs) {
                  mergedMap.set(driveNote.id, { ...existingNote, ...driveNote });
                  updatedCount++;
              }
           }
        });

        const finalMergedSelectedNotes = Array.from(mergedMap.values());
        
        setNotes([...notesNotSelected, ...finalMergedSelectedNotes]);
        alert(`Successfully updated! Added ${addedCount} new entries, updated ${updatedCount} existing entries. Your other records were safely preserved.`);
      }
    } catch (err: any) {
      console.error(err);
      alert(`Sync failed: ${err.message}`);
    } finally {
      setIsDriveSyncing(false);
    }
  };

  const handleUploadCalendarNotebookToDrive = async () => {
    let token = accessToken;
    if (!token) {
      try {
        token = await getGoogleAccessToken();
      } catch (e) {
        // ignore
      }
    }
    if (!token) {
      alert('Connect Google Drive to use this feature.');
      return;
    }

    setIsDriveSyncing(true);
    try {
      // Strictly ONLY include date-wise notes (e.g. 1st of Oct, 2nd Oct, 3rd Oct: 2026-10-01, 2026-10-02, 2026-10-03...)
      // Other options like MONTHLY TARGET, ADDRESS BOOK, NEW DIRECTION, etc. are completely excluded and unaffected.
      const payload = notes.filter(n => /^\d{4}-\d{2}-\d{2}$/.test(n.date || ''));

      const fileData = {
        type: 'CalendarDateWiseNotesData',
        version: '1.0',
        timestamp: new Date().toISOString(),
        data: payload
      };

      const query = encodeURIComponent("name = 'influencer-calendarnotebook-data.json' and trashed = false");
      const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`;
      
      const searchRes = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      const searchData = await searchRes.json();
      let fileId = searchData.files && searchData.files.length > 0 ? searchData.files[0].id : null;

      const fileContent = JSON.stringify(fileData);
      const metadata = {
        name: 'influencer-calendarnotebook-data.json',
        mimeType: 'application/json'
      };

      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', new Blob([fileContent], { type: 'application/json' }));

      let uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
      let method = 'POST';

      if (fileId) {
        uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`;
        method = 'PATCH';
      }

      const uploadRes = await fetch(uploadUrl, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: form
      });

      if (!uploadRes.ok) {
        throw new Error('Upload failed.');
      }

      alert(`Successfully uploaded ${payload.length} Date-wise Notes (1st, 2nd, 3rd...) to Google Drive. (Other sections like MONTHLY TARGET & ADDRESS BOOK were not affected).`);
    } catch (err: any) {
      console.error(err);
      alert(`Upload failed: ${err.message}`);
    } finally {
      setIsDriveSyncing(false);
    }
  };

  const handleSyncCalendarNotebookFromDrive = async () => {
    let token = accessToken;
    if (!token) {
      try {
        token = await getGoogleAccessToken();
      } catch (e) {
        // ignore
      }
    }
    if (!token) {
      alert('Connect Google Drive to use this feature.');
      return;
    }

    setIsDriveSyncing(true);
    try {
      const query = encodeURIComponent("name = 'influencer-calendarnotebook-data.json' and trashed = false");
      const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`;
      
      const searchRes = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      const searchData = await searchRes.json();
      const fileId = searchData.files && searchData.files.length > 0 ? searchData.files[0].id : null;

      if (!fileId) {
        alert('No synced Date-wise Notes data found in Google Drive.');
        setIsDriveSyncing(false);
        return;
      }

      const downloadRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!downloadRes.ok) throw new Error('Failed to download file.');

      const fileData = await downloadRes.json();
      if ((fileData.type !== 'CalendarDateWiseNotesData' && fileData.type !== 'CalendarNotebookData') || !Array.isArray(fileData.data)) {
        throw new Error('Invalid file format.');
      }

      if (setNotes) {
        // CRITICAL: Strictly preserve all non-date options (MONTHLY TARGET, ADDRESS BOOK, NEW DIRECTION, TASK FOR RECOVERY, etc.)
        const nonDateNotes = notes.filter(n => !/^\d{4}-\d{2}-\d{2}$/.test(n.date || ''));
        const dateNotes = notes.filter(n => /^\d{4}-\d{2}-\d{2}$/.test(n.date || ''));
        
        const mergedMap = new Map();
        dateNotes.forEach(n => {
            if (!n.id) n.id = crypto.randomUUID();
            mergedMap.set(n.id, n);
        });
        
        const getTs = (obj: any) => {
            if (obj && obj.lastUpdated) {
                const t = new Date(obj.lastUpdated).getTime();
                if (!isNaN(t)) return t;
            }
            if (obj && obj.timestamp) {
                const t = new Date(obj.timestamp).getTime();
                if (!isNaN(t)) return t;
            }
            return 0;
        };

        let addedCount = 0;
        let updatedCount = 0;
        // Strictly filter to only process date-wise notes from Google Drive
        fileData.data.forEach((n: any) => {
           if (!/^\d{4}-\d{2}-\d{2}$/.test(n.date || '')) {
             return; // Do not ingest or overwrite any non-date notes
           }
           const driveNote = { ...n, id: n.id || crypto.randomUUID() };
           const existingNote = mergedMap.get(driveNote.id);
           
           if (!existingNote) {
              mergedMap.set(driveNote.id, driveNote);
              addedCount++;
           } else {
              const driveTs = getTs(driveNote);
              const existTs = getTs(existingNote);
              if (driveTs > existTs) {
                  mergedMap.set(driveNote.id, { ...existingNote, ...driveNote });
                  updatedCount++;
              }
           }
        });

        const finalMergedCalendarNotes = Array.from(mergedMap.values());
        
        setNotes([...nonDateNotes, ...finalMergedCalendarNotes]);
        alert(`Successfully updated! Added ${addedCount} new date-wise notes, updated ${updatedCount} existing date-wise notes. All other options (MONTHLY TARGET, ADDRESS BOOK, etc.) were safely preserved and not affected.`);
      }
    } catch (err: any) {
      console.error(err);
      alert(`Sync failed: ${err.message}`);
    } finally {
      setIsDriveSyncing(false);
    }
  };

  const handleAddAllToCreatorDatabase = () => {
    if (!onAddInfluencer) return;
    const notesToAdd = notesForSelectedDate.filter(n => n.creatorName || n.title);
    if (notesToAdd.length === 0) {
      alert("No creators found to add.");
      return;
    }
    
    let addedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    notesToAdd.forEach(note => {
      const name = note.creatorName || note.title;
      const cleanMobile = (note.mobileNumber || '').trim();
      
      const existingInfluencer = influencers.find(inf => {
        if (inf.name && name && inf.name.trim().toLowerCase() === name.trim().toLowerCase()) return true;
        if (cleanMobile && inf.mobile && inf.mobile.trim() === cleanMobile) return true;
        if (cleanMobile && (inf as any).whatsapp && String((inf as any).whatsapp).trim() === cleanMobile) return true;
        return false;
      });

      if (existingInfluencer) {
        const updates: any = {};
        let hasUpdates = false;

        // Sync Mobile / WhatsApp
        if (cleanMobile) {
          const single = cleanSingleMobileForStorage(cleanMobile);
          updates.mobile = single;
          updates.whatsapp = single;
          updates.whatsappNumber = single;
          updates.phone = single;
          updates.mobileNumber = single;
          hasUpdates = true;
        }

        // Sync Location / Address
        if ((!existingInfluencer.location || existingInfluencer.location.trim() === '') && note.address) {
          updates.location = note.address;
          updates.address = note.address;
          hasUpdates = true;
        }

        // Sync Links
        ['instagramLink', 'facebookLink', 'youtubeLink'].forEach((field: string) => {
          const noteLink = (note as any)[field];
          if (noteLink && noteLink.trim()) {
            const existingLink = (existingInfluencer as any)[field];
            if (!existingLink || existingLink.trim() === '') {
              updates[field] = noteLink.trim();
              hasUpdates = true;
            } else if (!existingLink.includes(noteLink.trim())) {
              updates[field] = `${existingLink} | ${noteLink.trim()}`;
              hasUpdates = true;
            }
          }
        });

        // Sync Cost
        if (note.costPerPost && (!existingInfluencer.costPerPost || note.costPerPost > existingInfluencer.costPerPost)) {
          updates.costPerPost = note.costPerPost;
          hasUpdates = true;
        }

        // Sync Notes & Samples
        if (note.content && note.content.trim()) {
          if (!existingInfluencer.notes || existingInfluencer.notes.trim() === '') {
            updates.notes = note.content;
            hasUpdates = true;
          } else if (!existingInfluencer.notes.includes(note.content.trim())) {
            updates.notes = `${existingInfluencer.notes}\n\n${note.content}`;
            hasUpdates = true;
          }
        }

        if (note.sampleDetails && Array.isArray(note.sampleDetails) && note.sampleDetails.length > 0) {
          const existingSamples = (existingInfluencer as any).sampleDetails || [];
          updates.sampleDetails = [...existingSamples, ...note.sampleDetails];
          hasUpdates = true;
        }

        if (hasUpdates && onUpdateInfluencer) {
          onUpdateInfluencer(existingInfluencer.id, updates);
          updatedCount++;
        } else {
          skippedCount++;
        }
        return;
      }

      // Add New Creator
      const products = note.sampleDetails?.map((s: any) => {
        let p = s.product || s.productName || '';
        if (s.subCategory) p += ` (${s.subCategory})`;
        return p;
      }).filter(Boolean).join(', ');

      let notesContent = note.content || '';
      if (products) {
        notesContent += (notesContent ? '\n\nProducts: ' + products : 'Products: ' + products);
      }

      const handleName = (note.instagramLink ? note.instagramLink.split('/').filter(Boolean).pop()?.replace('@', '') : '') || name.toLowerCase().replace(/\s+/g, '_');

      onAddInfluencer({
        name: name,
        handle: handleName,
        avatar: 'https://images.unsplash.com/photo-1518020382113-a7e8fc38eac9?w=150&h=150&fit=crop&crop=faces&q=80',
        niche: 'Lifestyle',
        followers: 10000,
        engagementRate: 2.0,
        location: note.address || '',
        address: note.address || '',
        topDemographics: [{ ageRange: '18-24', percentage: 100 }],
        platforms: [{ name: 'Instagram', followers: '10K' }],
        costPerPost: note.costPerPost || 0,
        averageROI: 1,
        status: 'Available',
        mobile: cleanMobile,
        whatsapp: cleanMobile,
        whatsappNumber: cleanMobile,
        phone: cleanMobile,
        mobileNumber: cleanMobile,
        instagramLink: note.instagramLink || '',
        facebookLink: note.facebookLink || '',
        youtubeLink: note.youtubeLink || '',
        notes: notesContent,
        sampleDetails: note.sampleDetails || [],
        targetMonth: note.targetMonth || '',
        targetYear: note.targetYear || ''
      });
      addedCount++;
    });
    
    let msg = ``;
    if (addedCount > 0) msg += `✅ ${addedCount} creator(s) added to Creator Database! `;
    if (updatedCount > 0) msg += `🔄 ${updatedCount} existing creator(s) updated with missing WhatsApp & contact details! `;
    if (skippedCount > 0) msg += `ℹ️ ${skippedCount} creator(s) already up to date.`;
    alert(msg.trim() || 'Process complete.');
  };

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date();
    return new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().split('T')[0];
  });
  
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);

  const [noteTitle, setNoteTitle] = useState<string>('');
  const [noteContent, setNoteContent] = useState<string>('');
  const [noteCreatorName, setNoteCreatorName] = useState<string>('');
  const [noteAddress, setNoteAddress] = useState<string>('');
  const [noteMobileNumber, setNoteMobileNumber] = useState<string>('');
  const [noteCostPerPost, setNoteCostPerPost] = useState<string>('');
  const [noteInstagram, setNoteInstagram] = useState<string>('');
  const [noteFacebook, setNoteFacebook] = useState<string>('');
  const [noteYoutube, setNoteYoutube] = useState<string>('');
  const [noteTargetMonth, setNoteTargetMonth] = useState<string>('');
  const [noteTargetYear, setNoteTargetYear] = useState<string>('');
  const [noteTargetProduct, setNoteTargetProduct] = useState<string>('');
  const [noteTargetSalesRevenue, setNoteTargetSalesRevenue] = useState<string>('');
  const [noteTargetVideos, setNoteTargetVideos] = useState<string>('');
  const [noteProductTargets, setNoteProductTargets] = useState<Array<{ productName: string, salesRevenue: string, videos: string }>>([]);
  const [addressBookSearchQuery, setAddressBookSearchQuery] = useState<string>('');
  const [showOnlyAddressBookDuplicates, setShowOnlyAddressBookDuplicates] = useState<boolean>(false);
  const [addressBookToolsPos, setAddressBookToolsPos] = useState({ x: typeof window !== 'undefined' ? Math.max(16, window.innerWidth - 660) : 400, y: 90 });
  const [isDriveSyncing, setIsDriveSyncing] = useState(false);
  const [csvStartDate, setCsvStartDate] = useState<string>(() => safeLocalStorage.getItem('INFLUENCER_MANAGER_CSV_START_DATE') || '');
  const [showCsvDatePrompt, setShowCsvDatePrompt] = useState<boolean>(false);
  const [isExtractingSheets, setIsExtractingSheets] = useState(false);
  const [extractionMessage, setExtractionMessage] = useState<{ type: 'success' | 'error'; text: string; url?: string } | null>(null);
  const isDraggingAddressBookTools = useRef(false);
  const addressBookToolsDragStartPos = useRef({ x: 0, y: 0 });
  // --- Important Links (Quick Access & Bookmarks) & Vibrant Distinct Color Palettes ---
  interface QuickLinkColorTheme {
    id: string;
    name: string;
    bg: string;
    hoverBg: string;
    border: string;
    text: string;
    badgeBg: string;
    badgeText: string;
    pin: string;
    accent: string;
  }

  const QUICK_LINK_COLOR_PALETTES: QuickLinkColorTheme[] = [
    {
      id: 'emerald',
      name: 'Emerald Green',
      bg: 'bg-emerald-600',
      hoverBg: 'hover:bg-emerald-700',
      border: 'border-emerald-500',
      text: 'text-white',
      badgeBg: 'bg-emerald-700',
      badgeText: 'text-white',
      pin: 'text-amber-200 fill-amber-200',
      accent: '#059669',
    },
    {
      id: 'blue',
      name: 'Royal Blue',
      bg: 'bg-blue-600',
      hoverBg: 'hover:bg-blue-700',
      border: 'border-blue-500',
      text: 'text-white',
      badgeBg: 'bg-blue-700',
      badgeText: 'text-white',
      pin: 'text-amber-200 fill-amber-200',
      accent: '#2563eb',
    },
    {
      id: 'purple',
      name: 'Rich Purple',
      bg: 'bg-purple-600',
      hoverBg: 'hover:bg-purple-700',
      border: 'border-purple-500',
      text: 'text-white',
      badgeBg: 'bg-purple-700',
      badgeText: 'text-white',
      pin: 'text-amber-200 fill-amber-200',
      accent: '#9333ea',
    },
    {
      id: 'rose',
      name: 'Vivid Rose',
      bg: 'bg-rose-600',
      hoverBg: 'hover:bg-rose-700',
      border: 'border-rose-500',
      text: 'text-white',
      badgeBg: 'bg-rose-700',
      badgeText: 'text-white',
      pin: 'text-amber-200 fill-amber-200',
      accent: '#e11d48',
    },
    {
      id: 'amber',
      name: 'Deep Amber',
      bg: 'bg-amber-600',
      hoverBg: 'hover:bg-amber-700',
      border: 'border-amber-500',
      text: 'text-white',
      badgeBg: 'bg-amber-700',
      badgeText: 'text-white',
      pin: 'text-amber-100 fill-amber-100',
      accent: '#d97706',
    },
    {
      id: 'cyan',
      name: 'Ocean Cyan',
      bg: 'bg-cyan-700',
      hoverBg: 'hover:bg-cyan-800',
      border: 'border-cyan-600',
      text: 'text-white',
      badgeBg: 'bg-cyan-800',
      badgeText: 'text-white',
      pin: 'text-amber-200 fill-amber-200',
      accent: '#0e7490',
    },
    {
      id: 'indigo',
      name: 'Electric Indigo',
      bg: 'bg-indigo-600',
      hoverBg: 'hover:bg-indigo-700',
      border: 'border-indigo-500',
      text: 'text-white',
      badgeBg: 'bg-indigo-700',
      badgeText: 'text-white',
      pin: 'text-amber-200 fill-amber-200',
      accent: '#4f46e5',
    },
    {
      id: 'fuchsia',
      name: 'Hot Fuchsia',
      bg: 'bg-fuchsia-600',
      hoverBg: 'hover:bg-fuchsia-700',
      border: 'border-fuchsia-500',
      text: 'text-white',
      badgeBg: 'bg-fuchsia-700',
      badgeText: 'text-white',
      pin: 'text-amber-200 fill-amber-200',
      accent: '#c026d3',
    },
    {
      id: 'teal',
      name: 'Deep Teal',
      bg: 'bg-teal-600',
      hoverBg: 'hover:bg-teal-700',
      border: 'border-teal-500',
      text: 'text-white',
      badgeBg: 'bg-teal-700',
      badgeText: 'text-white',
      pin: 'text-amber-200 fill-amber-200',
      accent: '#0d9488',
    },
    {
      id: 'red',
      name: 'Vibrant Red',
      bg: 'bg-red-600',
      hoverBg: 'hover:bg-red-700',
      border: 'border-red-500',
      text: 'text-white',
      badgeBg: 'bg-red-700',
      badgeText: 'text-white',
      pin: 'text-amber-200 fill-amber-200',
      accent: '#dc2626',
    },
    {
      id: 'violet',
      name: 'Violet Dream',
      bg: 'bg-violet-600',
      hoverBg: 'hover:bg-violet-700',
      border: 'border-violet-500',
      text: 'text-white',
      badgeBg: 'bg-violet-700',
      badgeText: 'text-white',
      pin: 'text-amber-200 fill-amber-200',
      accent: '#7c3aed',
    },
    {
      id: 'slate',
      name: 'Dark Slate',
      bg: 'bg-slate-700',
      hoverBg: 'hover:bg-slate-800',
      border: 'border-slate-600',
      text: 'text-white',
      badgeBg: 'bg-slate-800',
      badgeText: 'text-white',
      pin: 'text-amber-200 fill-amber-200',
      accent: '#334155',
    },
  ];

  const getQuickLinkColor = (link: ImportantLink, index: number): QuickLinkColorTheme => {
    if (link.color) {
      const matched = QUICK_LINK_COLOR_PALETTES.find(
        p => p.id === link.color || p.accent.toLowerCase() === link.color?.toLowerCase()
      );
      if (matched) return matched;
    }
    return QUICK_LINK_COLOR_PALETTES[index % QUICK_LINK_COLOR_PALETTES.length];
  };

  const DEFAULT_IMPORTANT_LINKS: ImportantLink[] = [
    {
      id: 'link_default_1',
      title: 'Google Drive',
      url: 'https://drive.google.com',
      category: 'Work & Sheets',
      description: 'Shared influencer folders, agreements, and campaign media files',
      pinned: true,
      color: 'blue',
      createdAt: new Date().toISOString()
    },
    {
      id: 'link_default_2',
      title: 'Google Sheets',
      url: 'https://sheets.google.com',
      category: 'Work & Sheets',
      description: 'Master tracking spreadsheets, orders, and finance logs',
      pinned: true,
      color: 'emerald',
      createdAt: new Date().toISOString()
    },
    {
      id: 'link_default_3',
      title: 'YouTube Creator Studio',
      url: 'https://studio.youtube.com',
      category: 'Social & Portals',
      description: 'Channel dashboard, analytics, and video performance',
      pinned: true,
      color: 'red',
      createdAt: new Date().toISOString()
    },
    {
      id: 'link_default_4',
      title: 'Instagram Business',
      url: 'https://www.instagram.com',
      category: 'Social & Portals',
      description: 'Creator profiles, collaboration DMs, and campaign tags',
      pinned: false,
      color: 'fuchsia',
      createdAt: new Date().toISOString()
    }
  ];

  const sortLinksAlphabetically = (links: ImportantLink[]): ImportantLink[] => {
    return [...links].sort((a, b) => 
      (a.title || '').trim().localeCompare((b.title || '').trim(), undefined, { sensitivity: 'base', numeric: true })
    );
  };

  const [importantLinks, setImportantLinks] = useState<ImportantLink[]>(() => {
    try {
      const saved = safeLocalStorage.getItem('CALENDAR_NOTEBOOK_IMPORTANT_LINKS');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return sortLinksAlphabetically(parsed);
      }
    } catch (e) {
      console.error('Failed to parse saved important links:', e);
    }
    return sortLinksAlphabetically(DEFAULT_IMPORTANT_LINKS);
  });

  const [showImportantLinksModal, setShowImportantLinksModal] = useState<boolean>(false);
  const [linkSearchQuery, setLinkSearchQuery] = useState<string>('');
  const [linkCategoryFilter, setLinkCategoryFilter] = useState<string>('All');
  const [linkLetterFilter, setLinkLetterFilter] = useState<string>('All');
  const [isAddingLink, setIsAddingLink] = useState<boolean>(false);
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);

  // Form states for creating / editing links
  const [formLinkTitle, setFormLinkTitle] = useState<string>('');
  const [formLinkUrl, setFormLinkUrl] = useState<string>('');
  const [formLinkCategory, setFormLinkCategory] = useState<string>('Work & Sheets');
  const [formLinkDescription, setFormLinkDescription] = useState<string>('');
  const [formLinkPinned, setFormLinkPinned] = useState<boolean>(true);
  const [formLinkColor, setFormLinkColor] = useState<string>('');

  // Quick feedback for copying
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);

  // Save links to localStorage whenever updated - ALWAYS kept alphabetical
  const saveLinksToStorage = (updatedLinks: ImportantLink[]) => {
    const sorted = sortLinksAlphabetically(updatedLinks);
    setImportantLinks(sorted);
    try {
      safeLocalStorage.setItem('CALENDAR_NOTEBOOK_IMPORTANT_LINKS', JSON.stringify(sorted));
    } catch (err) {
      console.error('Failed to save important links:', err);
    }
  };

  const handleCopyLink = (url: string, id: string) => {
    let cleanUrl = url.trim();
    if (!/^https?:\/\//i.test(cleanUrl)) {
      cleanUrl = 'https://' + cleanUrl;
    }
    try {
      navigator.clipboard.writeText(cleanUrl);
      setCopiedLinkId(id);
      setTimeout(() => setCopiedLinkId(null), 2000);
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  };

  const handleTogglePinLink = (id: string) => {
    const updated = importantLinks.map(l => l.id === id ? { ...l, pinned: !l.pinned } : l);
    saveLinksToStorage(updated);
  };

  const handleDeleteLink = (id: string, title: string) => {
    if (window.confirm(`Are you sure you want to delete "${title}" from Important Links?`)) {
      const updated = importantLinks.filter(l => l.id !== id);
      saveLinksToStorage(updated);
      if (editingLinkId === id) {
        setEditingLinkId(null);
        setIsAddingLink(false);
      }
    }
  };

  const handleStartEditLink = (link: ImportantLink) => {
    setEditingLinkId(link.id);
    setFormLinkTitle(link.title);
    setFormLinkUrl(link.url);
    setFormLinkCategory(link.category || 'Work & Sheets');
    setFormLinkDescription(link.description || '');
    setFormLinkPinned(!!link.pinned);
    setFormLinkColor(link.color || '');
    setIsAddingLink(true);
    setShowImportantLinksModal(true);
  };

  const handleSaveLinkForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formLinkTitle.trim()) {
      alert('Please provide a title for the link.');
      return;
    }
    let formattedUrl = formLinkUrl.trim();
    if (!formattedUrl) {
      alert('Please provide a valid URL.');
      return;
    }
    if (!/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = 'https://' + formattedUrl;
    }

    if (editingLinkId) {
      const updated = importantLinks.map(l => l.id === editingLinkId ? {
        ...l,
        title: formLinkTitle.trim(),
        url: formattedUrl,
        category: formLinkCategory.trim() || 'Work & Sheets',
        description: formLinkDescription.trim(),
        pinned: formLinkPinned,
        color: formLinkColor || undefined
      } : l);
      saveLinksToStorage(updated);
    } else {
      const newLink: ImportantLink = {
        id: 'link_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        title: formLinkTitle.trim(),
        url: formattedUrl,
        category: formLinkCategory.trim() || 'Work & Sheets',
        description: formLinkDescription.trim(),
        pinned: formLinkPinned,
        color: formLinkColor || undefined,
        createdAt: new Date().toISOString()
      };
      saveLinksToStorage([newLink, ...importantLinks]);
    }

    // Reset form
    setEditingLinkId(null);
    setIsAddingLink(false);
    setFormLinkTitle('');
    setFormLinkUrl('');
    setFormLinkCategory('Work & Sheets');
    setFormLinkDescription('');
    setFormLinkPinned(true);
    setFormLinkColor('');
  };

  const handleResetDefaultLinks = () => {
    if (window.confirm('Reset important links to default presets? Your custom links will be replaced with standard presets.')) {
      saveLinksToStorage(DEFAULT_IMPORTANT_LINKS);
    }
  };

  const handleExportImportantLinks = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(importantLinks, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", `Important_Links_${new Date().toISOString().split('T')[0]}.json`);
    dlAnchorElem.click();
  };

  const handleImportImportantLinks = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (Array.isArray(parsed)) {
          const valid = parsed.filter(p => p.title && p.url);
          if (valid.length > 0) {
            saveLinksToStorage([...valid, ...importantLinks.filter(orig => !valid.some(v => v.id === orig.id))]);
            alert(`Successfully imported ${valid.length} important links!`);
          } else {
            alert('No valid links found in the selected file.');
          }
        }
      } catch (err) {
        alert('Invalid JSON file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleUploadImportantLinksToDrive = async () => {
    let token = accessToken;
    if (!token) {
      try {
        token = await getGoogleAccessToken();
      } catch (e) {
        // ignore
      }
    }
    if (!token) {
      alert('Connect Google Drive to use this feature.');
      return;
    }

    setIsDriveSyncing(true);
    try {
      const fileData = {
        type: 'ImportantLinksData',
        version: '1.0',
        timestamp: new Date().toISOString(),
        data: importantLinks
      };

      const query = encodeURIComponent("name = 'influencer-important-links.json' and trashed = false");
      const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`;
      
      const searchRes = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      const searchData = await searchRes.json();
      let fileId = searchData.files && searchData.files.length > 0 ? searchData.files[0].id : null;

      const fileContent = JSON.stringify(fileData);
      const metadata = {
        name: 'influencer-important-links.json',
        mimeType: 'application/json'
      };

      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', new Blob([fileContent], { type: 'application/json' }));

      let uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
      let method = 'POST';

      if (fileId) {
        uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`;
        method = 'PATCH';
      }

      const uploadRes = await fetch(uploadUrl, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: form
      });

      if (!uploadRes.ok) {
        throw new Error('Upload failed.');
      }

      alert(`☁️ Successfully saved ${importantLinks.length} Important Links & Bookmarks to Google Drive!`);
    } catch (err: any) {
      console.error(err);
      alert(`Upload failed: ${err.message}`);
    } finally {
      setIsDriveSyncing(false);
    }
  };

  const handleSyncImportantLinksFromDrive = async () => {
    let token = accessToken;
    if (!token) {
      try {
        token = await getGoogleAccessToken();
      } catch (e) {
        // ignore
      }
    }
    if (!token) {
      alert('Connect Google Drive to use this feature.');
      return;
    }

    setIsDriveSyncing(true);
    try {
      const query = encodeURIComponent("name = 'influencer-important-links.json' and trashed = false");
      const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`;
      
      const searchRes = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      const searchData = await searchRes.json();
      const fileId = searchData.files && searchData.files.length > 0 ? searchData.files[0].id : null;

      if (!fileId) {
        alert('No synced Important Links data found in Google Drive.');
        setIsDriveSyncing(false);
        return;
      }

      const downloadRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!downloadRes.ok) throw new Error('Failed to download file.');

      const fileData = await downloadRes.json();
      if (fileData.type !== 'ImportantLinksData' || !Array.isArray(fileData.data)) {
        throw new Error('Invalid file format.');
      }

      const driveLinks: ImportantLink[] = fileData.data;
      let addedCount = 0;
      let updatedCount = 0;

      const mergedMap = new Map<string, ImportantLink>();
      // First populate with existing local links
      importantLinks.forEach(l => {
        mergedMap.set(l.id || l.url, l);
      });

      // Merge Drive links
      driveLinks.forEach(dl => {
        if (!dl.title || !dl.url) return;
        const key = dl.id || dl.url;
        if (mergedMap.has(key)) {
          mergedMap.set(key, { ...mergedMap.get(key)!, ...dl });
          updatedCount++;
        } else {
          mergedMap.set(key, dl);
          addedCount++;
        }
      });

      const mergedList = Array.from(mergedMap.values());
      saveLinksToStorage(mergedList);

      alert(`🔄 Successfully updated from Google Drive!\nTotal: ${mergedList.length} links (${addedCount} added, ${updatedCount} updated).`);
    } catch (err: any) {
      console.error(err);
      alert(`Sync failed: ${err.message}`);
    } finally {
      setIsDriveSyncing(false);
    }
  };

  // Filtered links for the modal - ALWAYS sorted alphabetically by title
  const filteredImportantLinks = useMemo(() => {
    const filtered = importantLinks.filter(l => {
      const matchesSearch = !linkSearchQuery.trim() || 
        l.title.toLowerCase().includes(linkSearchQuery.toLowerCase()) ||
        l.url.toLowerCase().includes(linkSearchQuery.toLowerCase()) ||
        (l.category && l.category.toLowerCase().includes(linkSearchQuery.toLowerCase())) ||
        (l.description && l.description.toLowerCase().includes(linkSearchQuery.toLowerCase()));
      
      const matchesCategory = linkCategoryFilter === 'All' || l.category === linkCategoryFilter;
      return matchesSearch && matchesCategory;
    });
    return sortLinksAlphabetically(filtered);
  }, [importantLinks, linkSearchQuery, linkCategoryFilter]);

  // Pinned quick links for the quick access strip - ALWAYS sorted alphabetically by title
  const displayedQuickLinks = useMemo(() => {
    const pinned = importantLinks.filter(l => l.pinned);
    const source = pinned.length > 0 ? pinned : importantLinks;
    return sortLinksAlphabetically(source);
  }, [importantLinks]);

  const getLinkFirstLetter = (title: string): string => {
    const clean = (title || '').trim();
    if (!clean) return '#';
    const firstChar = clean[0].toUpperCase();
    return /^[A-Z]$/.test(firstChar) ? firstChar : '#';
  };

  const groupLinksByLetter = (links: ImportantLink[]): { letter: string; links: ImportantLink[] }[] => {
    const map = new Map<string, ImportantLink[]>();
    links.forEach(link => {
      const letter = getLinkFirstLetter(link.title);
      if (!map.has(letter)) {
        map.set(letter, []);
      }
      map.get(letter)!.push(link);
    });

    const sortedLetters = Array.from(map.keys()).sort((a, b) => {
      if (a === '#') return 1;
      if (b === '#') return -1;
      return a.localeCompare(b);
    });

    return sortedLetters.map(letter => ({
      letter,
      links: map.get(letter)!
    }));
  };

  // Grouped links divided by letter (A, B, C...) for modal display
  const groupedImportantLinks = useMemo(() => {
    let list = filteredImportantLinks;
    if (linkLetterFilter !== 'All') {
      list = list.filter(l => getLinkFirstLetter(l.title) === linkLetterFilter);
    }
    return groupLinksByLetter(list);
  }, [filteredImportantLinks, linkLetterFilter]);

  // Available letters from currently filtered links (for quick jump / filter bar)
  const availableLetters = useMemo(() => {
    const set = new Set<string>();
    filteredImportantLinks.forEach(l => set.add(getLinkFirstLetter(l.title)));
    return Array.from(set).sort((a, b) => {
      if (a === '#') return 1;
      if (b === '#') return -1;
      return a.localeCompare(b);
    });
  }, [filteredImportantLinks]);

  // Grouped quick links divided by letter (A, B, C...) for the quick access strip
  const groupedDisplayedQuickLinks = useMemo(() => {
    return groupLinksByLetter(displayedQuickLinks);
  }, [displayedQuickLinks]);

  const handleAddressBookToolsPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, input, select, textarea, a')) return;
    isDraggingAddressBookTools.current = true;
    addressBookToolsDragStartPos.current = { x: e.clientX - addressBookToolsPos.x, y: e.clientY - addressBookToolsPos.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleAddressBookToolsPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingAddressBookTools.current) {
      let newX = e.clientX - addressBookToolsDragStartPos.current.x;
      let newY = e.clientY - addressBookToolsDragStartPos.current.y;
      
      if (typeof window !== 'undefined') {
        const widgetWidth = Math.min(650, window.innerWidth - 30);
        newX = Math.max(8, Math.min(window.innerWidth - widgetWidth - 8, newX));
        newY = Math.max(8, Math.min(window.innerHeight - 80, newY));
      }
      
      setAddressBookToolsPos({ x: newX, y: newY });
    }
  };

  const handleAddressBookToolsPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingAddressBookTools.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const [addingSampleToNoteId, setAddingSampleToNoteId] = useState<string | null>(null);
  const [editingSampleId, setEditingSampleId] = useState<string | null>(null);
  const [samplePlatform, setSamplePlatform] = useState<'PTG' | 'AMAJON' | 'FLIPKART' | 'OTHER'>('PTG');
  const [sampleCost, setSampleCost] = useState<string>('');
  const [sampleOrderId, setSampleOrderId] = useState<string>('');
  const [sampleOrderDate, setSampleOrderDate] = useState<string>('');
  const [sampleProduct, setSampleProduct] = useState<string>('');
  const [sampleSubCategory, setSampleSubCategory] = useState<string>('');

  const [sampleToDelete, setSampleToDelete] = useState<{noteId: string, sampleId: string} | null>(null);
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null);

  // Recovery of last deleted note or addressbook data
  const [deletedItems, setDeletedItems] = useState<Array<{
    id: string;
    timestamp: number;
    type: 'note' | 'contact' | 'bulk_addressbook' | 'sample';
    title: string;
    originalDate: string;
    previewText?: string;
    noteData?: Note;
    notesData?: Note[];
    sampleData?: {
      noteId: string;
      sample: any;
    };
  }>>(() => {
    try {
      const stored = safeLocalStorage.getItem('INFLUENCER_MANAGER_NOTEBOOK_DELETED_ITEMS');
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      console.error('Failed to parse deleted notebook items:', e);
      return [];
    }
  });

  const [lastDeletedToast, setLastDeletedToast] = useState<{
    id: string;
    timestamp: number;
    type: 'note' | 'contact' | 'bulk_addressbook' | 'sample';
    title: string;
    originalDate: string;
    previewText?: string;
    noteData?: Note;
    notesData?: Note[];
    sampleData?: {
      noteId: string;
      sample: any;
    };
  } | null>(null);

  const [recoverySuccessMessage, setRecoverySuccessMessage] = useState<string | null>(null);
  const [showRecoveryBinModal, setShowRecoveryBinModal] = useState<boolean>(false);
  const [recoveryModalFilter, setRecoveryModalFilter] = useState<'all' | 'addressbook' | 'calendar'>('all');

  // Modal state for sending Monthly Target to set any month
  const [sendTargetModal, setSendTargetModal] = useState<{
    isOpen: boolean;
    note: Note | null;
    selectedTargetIndex: number | 'all';
    selectedMonth: string;
    selectedYear: string;
    replaceExisting: boolean;
  } | null>(null);

  const handleOpenSendTargetModal = (note: Note, targetIndex: number | 'all' = 'all') => {
    const currentYear = String(new Date().getFullYear());
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentMonth = monthNames[new Date().getMonth()];
    
    setSendTargetModal({
      isOpen: true,
      note,
      selectedTargetIndex: targetIndex,
      selectedMonth: note.targetMonth || currentMonth,
      selectedYear: note.targetYear || currentYear,
      replaceExisting: false
    });
  };

  const addDeletedRecord = (item: {
    id: string;
    timestamp: number;
    type: 'note' | 'contact' | 'bulk_addressbook' | 'sample';
    title: string;
    originalDate: string;
    previewText?: string;
    noteData?: Note;
    notesData?: Note[];
    sampleData?: {
      noteId: string;
      sample: any;
    };
  }) => {
    setDeletedItems(prev => {
      const updated = [item, ...prev].slice(0, 50);
      try {
        safeLocalStorage.setItem('INFLUENCER_MANAGER_NOTEBOOK_DELETED_ITEMS', JSON.stringify(updated));
      } catch (err) {
        console.error('Failed to save deleted notebook items to storage:', err);
      }
      return updated;
    });
    setLastDeletedToast(item);
  };

  const handleRecoverItem = (record: {
    id: string;
    timestamp: number;
    type: 'note' | 'contact' | 'bulk_addressbook' | 'sample';
    title: string;
    originalDate: string;
    previewText?: string;
    noteData?: Note;
    notesData?: Note[];
    sampleData?: {
      noteId: string;
      sample: any;
    };
  }) => {
    if (record.type === 'note' || record.type === 'contact') {
      if (record.noteData) {
        const itemToRestore = {
          ...record.noteData,
          lastUpdated: new Date().toISOString()
        };
        setNotes(prev => {
          const filtered = prev.filter(n => n.id !== itemToRestore.id);
          return [itemToRestore, ...filtered];
        });
        if (record.noteData.date) {
          setSelectedDate(record.noteData.date);
        }
      }
    } else if (record.type === 'bulk_addressbook') {
      if (record.notesData && record.notesData.length > 0) {
        setNotes(prev => {
          const existingIds = new Set(prev.map(n => n.id));
          const toAdd = record.notesData!.filter(n => !existingIds.has(n.id));
          return [...toAdd, ...prev];
        });
        setSelectedDate(record.originalDate || 'Global-AddressBook');
      }
    } else if (record.type === 'sample') {
      if (record.sampleData) {
        setNotes(prev => prev.map(n => {
          if (n.id === record.sampleData!.noteId) {
            const currentSamples = n.sampleDetails || [];
            if (currentSamples.some((s: any) => s.id === record.sampleData!.sample.id)) return n;
            return {
              ...n,
              lastUpdated: new Date().toISOString(),
              sampleDetails: [...currentSamples, record.sampleData!.sample]
            };
          }
          return n;
        }));
      }
    }

    setDeletedItems(prev => {
      const updated = prev.filter(d => d.id !== record.id);
      try {
        safeLocalStorage.setItem('INFLUENCER_MANAGER_NOTEBOOK_DELETED_ITEMS', JSON.stringify(updated));
      } catch (err) {
        console.error('Failed to update deleted storage:', err);
      }
      return updated;
    });

    if (lastDeletedToast?.id === record.id) {
      setLastDeletedToast(null);
    }
    setRecoverySuccessMessage(`Successfully recovered "${record.title}"!`);
    setTimeout(() => setRecoverySuccessMessage(null), 4000);
  };

  const deletedAddressBookItems = useMemo(() => {
    return deletedItems.filter(d => 
      d.type === 'contact' || 
      d.type === 'bulk_addressbook' || 
      (d.originalDate && d.originalDate.includes('-AddressBook'))
    );
  }, [deletedItems]);

  const deletedCalendarItems = useMemo(() => {
    return deletedItems.filter(d => 
      d.type === 'note' && 
      (!d.originalDate || !d.originalDate.includes('-AddressBook'))
    );
  }, [deletedItems]);

  const lastDeletedAddressBookItem = deletedAddressBookItems[0] || null;
  const lastDeletedCalendarItem = deletedCalendarItems[0] || null;

  const handleRecoverLastDeleted = (scopeFilter?: 'calendar' | 'addressbook') => {
    let target: any = undefined;
    if (scopeFilter === 'addressbook') {
      target = lastDeletedAddressBookItem || deletedItems[0];
    } else if (scopeFilter === 'calendar') {
      target = lastDeletedCalendarItem || deletedItems[0];
    } else {
      target = deletedItems[0];
    }

    if (!target) {
      alert("No deleted records available to recover.");
      return;
    }
    handleRecoverItem(target);
  };

  const handleRecoverAll = (scope?: 'all' | 'addressbook' | 'calendar') => {
    const itemsToRecover = deletedItems.filter(item => {
      if (scope === 'addressbook') {
        return item.type === 'contact' || item.type === 'bulk_addressbook' || (item.originalDate && item.originalDate.includes('-AddressBook'));
      }
      if (scope === 'calendar') {
        return item.type === 'note' && (!item.originalDate || !item.originalDate.includes('-AddressBook'));
      }
      return true;
    });

    if (itemsToRecover.length === 0) return;

    itemsToRecover.forEach(item => {
      handleRecoverItem(item);
    });

    setShowRecoveryBinModal(false);
  };

  const handleClearRecoveryHistory = () => {
    if (!window.confirm('Are you sure you want to permanently clear all recovery history? This cannot be undone.')) return;
    setDeletedItems([]);
    safeLocalStorage.removeItem('INFLUENCER_MANAGER_NOTEBOOK_DELETED_ITEMS');
    setLastDeletedToast(null);
  };

  const handleRemoveSingleHistoryItem = (id: string) => {
    setDeletedItems(prev => {
      const updated = prev.filter(d => d.id !== id);
      try {
        safeLocalStorage.setItem('INFLUENCER_MANAGER_NOTEBOOK_DELETED_ITEMS', JSON.stringify(updated));
      } catch (err) {
        console.error('Failed to update deleted storage:', err);
      }
      return updated;
    });
    if (lastDeletedToast?.id === id) {
      setLastDeletedToast(null);
    }
  };

  // Keyboard shortcut Ctrl+Z / Cmd+Z to recover last deleted item
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        const target = e.target as HTMLElement;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
          return;
        }
        if (deletedItems.length > 0) {
          e.preventDefault();
          if (selectedDate.includes('-AddressBook')) {
            handleRecoverLastDeleted('addressbook');
          } else {
            handleRecoverLastDeleted('calendar');
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deletedItems, selectedDate, lastDeletedAddressBookItem, lastDeletedCalendarItem]);


  const handleSaveSample = (noteId: string) => {
    if (!sampleOrderId.trim() || !sampleOrderDate) {
      alert("Please provide Order ID and Order Date");
      return;
    }
    
    setNotes(prev => {
      const newNotes = prev.map(n => {
      if (n.id === noteId) {
        if (editingSampleId) {
          return {
            ...n,
            lastUpdated: new Date().toISOString(),
            sampleDetails: (n.sampleDetails || []).map((s: any) => s.id === editingSampleId ? {
              ...s,
              platform: samplePlatform,
              cost: sampleCost,
              orderId: sampleOrderId,
              orderDate: sampleOrderDate,
              product: sampleProduct.trim(),
              subCategory: sampleSubCategory.trim()
            } : s)
          };
        } else {
          n.lastUpdated = new Date().toISOString();
          const newSample = {
            id: 'sample_' + Math.random().toString(36).substring(2, 11),
            platform: samplePlatform,
            cost: sampleCost,
            orderId: sampleOrderId,
            orderDate: sampleOrderDate,
            product: sampleProduct.trim(),
            subCategory: sampleSubCategory.trim()
          };
          return {
            ...n,
            sampleDetails: [...(n.sampleDetails || []), newSample]
          };
        }
      }
      return n;
      });
      
      return newNotes;
    });
    
    setAddingSampleToNoteId(null);
    setEditingSampleId(null);
    setSamplePlatform('PTG');
    setSampleCost('');
    setSampleOrderId('');
    setSampleOrderDate('');
    setSampleProduct('');
    setSampleSubCategory('');
  };


  const handleSendToTask = (sample: any) => {
    if (!tasks) {
      alert("Tasks data is not available. Please make sure tasks are passed to the notebook.");
      return;
    }
    const videoId = window.prompt("Enter VIDEO ID of the task to attach this sample data:");
    if (!videoId) return;

    const targetTaskIndex = tasks.findIndex(t => t.videoId === videoId);
    if (targetTaskIndex === -1) {
      alert(`No task found with VIDEO ID: ${videoId}`);
      return;
    }

    let parsedCost = Number(sample.cost);
    if (isNaN(parsedCost)) parsedCost = 0;
    
    const updates = {
      sampleCost: parsedCost || null,
      orderId: sample.orderId || sample.sampleOrderId || sample.OrderId || '',
      orderDate: sample.orderDate || sample.sampleOrderDate || sample.OrderDate || '',
      sampleOrderId: sample.orderId || sample.sampleOrderId || sample.OrderId || '',
      sampleOrderDate: sample.orderDate || sample.sampleOrderDate || sample.OrderDate || '',
      orderPlatform: sample.platform === 'AMAJON' ? 'AMAZON' : sample.platform,
      needsSample: false,
      sampleSent: true
    };

    if (onUpdateTask) {
      onUpdateTask(tasks[targetTaskIndex].id, updates);
    } else if (setTasks) {
      const updatedTasks = [...tasks];
      updatedTasks[targetTaskIndex] = {
        ...updatedTasks[targetTaskIndex],
        ...updates
      };
      setTasks(updatedTasks);
    }
    
    alert(`Sample data successfully linked to task with VIDEO ID: ${videoId}`);
  };

  
  const handleDeleteSample = (noteId: string, sampleId: string) => {
    const targetNote = notes.find(n => n.id === noteId);
    const targetSample = (targetNote?.sampleDetails || []).find((s: any) => s.id === sampleId);
    if (targetNote && targetSample) {
      addDeletedRecord({
        id: 'del_sample_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        timestamp: Date.now(),
        type: 'sample',
        title: `Sample: ${targetSample.product || targetSample.orderId || 'Order Item'}`,
        originalDate: targetNote.date || selectedDate,
        previewText: `Order ID: ${targetSample.orderId} | Cost: ₹${targetSample.cost || 0}`,
        sampleData: {
          noteId,
          sample: targetSample
        }
      });
    }

    setNotes(prev => prev.map(n => n.id === noteId ? {
      ...n,
      lastUpdated: new Date().toISOString(),
      sampleDetails: (n.sampleDetails || []).filter((s: any) => s.id !== sampleId)
    } : n));
    setSampleToDelete(null);
  };

  
  const [planningNote, setPlanningNote] = useState<string>(() => {
    return safeLocalStorage.getItem('INFLUENCER_MANAGER_NEXT_MONTH_PLANNING_NOTE') || '';
  });

  useEffect(() => {
    safeLocalStorage.setItem('INFLUENCER_MANAGER_NEXT_MONTH_PLANNING_NOTE', planningNote);
  }, [planningNote]);

  // Floating Note state sync
  const handlePinAsFloating = (content: string) => {
    safeLocalStorage.setItem('INFLUENCER_MANAGER_FLOATING_NOTE', content);
    window.dispatchEvent(new Event('floating-note-changed'));
    alert('Pinned as active floating flashing note!');
  };

  const handleSyncToMonthlyTargets = (
    note: Note, 
    overrideMonth?: string, 
    overrideYear?: string, 
    replaceMode: boolean = false,
    selectedTargetIndex: number | 'all' = 'all'
  ) => {
    if (!setMonthlyTargets) {
      alert("Monthly Targets manager is not available.");
      return;
    }

    const rawMonth = overrideMonth || note.targetMonth;
    const rawYear = overrideYear || note.targetYear;

    if (!rawMonth || !rawYear) {
      alert("Please ensure a Target Month and Year are specified.");
      return;
    }

    const monthMap: Record<string, string> = {
      'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'May': '05', 'Jun': '06',
      'Jul': '07', 'Aug': '08', 'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12',
      'January': '01', 'February': '02', 'March': '03', 'April': '04', 'June': '06',
      'July': '07', 'August': '08', 'September': '09', 'October': '10', 'November': '11', 'December': '12',
      '1': '01', '2': '02', '3': '03', '4': '04', '5': '05', '6': '06',
      '7': '07', '8': '08', '9': '09',
      '01': '01', '02': '02', '03': '03', '04': '04', '05': '05', '06': '06',
      '07': '07', '08': '08', '09': '09', '10': '10', '11': '11', '12': '12'
    };
    const month = monthMap[rawMonth] || rawMonth;
    const year = String(rawYear);

    const monthDisplayNames: Record<string, string> = {
      '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr', '05': 'May', '06': 'Jun',
      '07': 'Jul', '08': 'Aug', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec'
    };
    const displayMonth = monthDisplayNames[month] || rawMonth;

    let targetsToAdd: any[] = [];
    
    // Add primary target if selected (targetIndex === 'all' or 0)
    if ((selectedTargetIndex === 'all' || selectedTargetIndex === 0) && note.targetProduct) {
      targetsToAdd.push({
        id: `target-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        productName: note.targetProduct,
        target: note.targetSalesRevenue || 0,
        videoTarget: note.targetVideos || 0,
        month,
        year
      });
    }

    // Add additional targets if selected
    if (note.productTargets && note.productTargets.length > 0) {
      note.productTargets.forEach((pt: any, idx: number) => {
        if (selectedTargetIndex === 'all' || selectedTargetIndex === (idx + 1)) {
          if (pt.productName) {
            targetsToAdd.push({
              id: `target-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
              productName: pt.productName,
              target: pt.salesRevenue || 0,
              videoTarget: pt.videos || 0,
              month,
              year
            });
          }
        }
      });
    }

    if (targetsToAdd.length === 0) {
      alert("No product targets found in this note. Please add product targets first.");
      return;
    }

    setMonthlyTargets(prev => {
      let updated = [...(prev || [])];
      let addedCount = 0;
      let updatedCount = 0;

      if (replaceMode) {
        if (selectedTargetIndex === 'all') {
          updated = updated.filter(t => !(t.month === month && t.year === year));
        } else {
          const productNames = targetsToAdd.map(t => (t.productName || '').trim().toLowerCase());
          updated = updated.filter(t => !(t.month === month && t.year === year && productNames.includes((t.productName || '').trim().toLowerCase())));
        }
        updated.push(...targetsToAdd);
        addedCount = targetsToAdd.length;
      } else {
        targetsToAdd.forEach(newT => {
          const existingIndex = updated.findIndex(t => (t.productName || '').trim().toLowerCase() === (newT.productName || '').trim().toLowerCase() && t.month === newT.month && t.year === newT.year);
          if (existingIndex >= 0) {
            updated[existingIndex] = { ...updated[existingIndex], target: newT.target, videoTarget: newT.videoTarget };
            updatedCount++;
          } else {
            updated.push(newT);
            addedCount++;
          }
        });
      }

      // Sync to localStorage
      try {
        const savedSuffix = safeLocalStorage.getItem('APP_USER_SUFFIX') || 'guest';
        safeLocalStorage.setItem(`INFLUENCER_MANAGER_MONTHLY_TARGETS_${savedSuffix}`, JSON.stringify(updated));
        safeLocalStorage.setItem('INFLUENCER_MANAGER_MONTHLY_TARGETS', JSON.stringify(updated));
      } catch {}

      alert(`🎯 Successfully set Monthly Targets for ${displayMonth} ${year}!\n${addedCount} targets added, ${updatedCount} existing targets updated.`);
      return updated;
    });

    if (sendTargetModal?.isOpen) {
      setSendTargetModal(null);
    }
  };

const handleRestoreFromRecovery = (note: Note) => {
    if (!setTasks) {
       alert("Task restoration is not available in this context.");
       return;
    }
    if (!window.confirm("WARNING: This will replace all existing tasks in the Monthly Planner with the tasks from this backup. Proceed?")) return;
    
    try {
      const recoveredTasks = JSON.parse(note.content);
      if (Array.isArray(recoveredTasks)) {
         setTasks(recoveredTasks);
         alert("Successfully recovered tasks to Monthly Planner.");
      } else {
         alert("Invalid backup data structure.");
      }
    } catch(e) {
      console.error(e);
      alert("Failed to parse backup data.");
    }
  };

  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedDate.includes('-AddressBook')) {
      if (!noteTitle.trim()) {
        alert("Please provide a Title!");
        return;
      }

      // Automatic Duplicate Entry Detector on Save
      const checkName = (noteCreatorName || noteTitle).trim().toLowerCase();
      const checkMobileDigits = noteMobileNumber.replace(/[^0-9]/g, '');
      const normalizeHandle = (url?: string) => {
        if (!url) return '';
        let v = url.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/^(instagram\.com\/|facebook\.com\/|youtube\.com\/(c\/|user\/|@)?)/, '').replace(/\/+$/, '').replace(/^@/, '');
        return v;
      };
      const checkInsta = normalizeHandle(noteInstagram);
      const checkFb = normalizeHandle(noteFacebook);
      const checkYt = normalizeHandle(noteYoutube);

      const isDuplicate = notes.some(n => {
        if (editingNote && n.id === editingNote.id) return false;
        if (!n.date || !n.date.includes('-AddressBook')) return false;

        if (checkMobileDigits && checkMobileDigits.length >= 6 && n.mobileNumber) {
          const nDigits = n.mobileNumber.replace(/[^0-9]/g, '');
          if (nDigits.length >= 6) {
            const last1 = nDigits.length > 10 ? nDigits.slice(-10) : nDigits;
            const last2 = checkMobileDigits.length > 10 ? checkMobileDigits.slice(-10) : checkMobileDigits;
            if (last1 === last2) return true;
          }
        }

        const nName = (n.creatorName || n.title || '').trim().toLowerCase();
        if (checkName && nName && checkName === nName && checkName !== 'untitled' && checkName !== 'untitled contact') {
          return true;
        }

        if (checkInsta && n.instagramLink && normalizeHandle(n.instagramLink) === checkInsta) return true;
        if (checkFb && n.facebookLink && normalizeHandle(n.facebookLink) === checkFb) return true;
        if (checkYt && n.youtubeLink && normalizeHandle(n.youtubeLink) === checkYt) return true;

        return false;
      });

      if (isDuplicate) {
        if (!window.confirm("Double entry detected! A creator with this name, mobile, or social link already exists in the Addressbook. Do you want to proceed anyway?")) {
          return;
        }
      }
    } else if (selectedDate.includes('-MonthlyTarget')) {
      if (!noteTitle.trim()) {
        alert("Please provide a Title!");
        return;
      }
    } else {
      if (!noteTitle.trim() || !noteContent.trim()) {
        alert("Please provide both a Title and Content!");
        return;
      }
    }

    if (editingNote) {
      setNotes(prev => prev.map(n => n.id === editingNote.id ? {
        ...n,
        title: noteTitle.trim(),
        content: noteContent.trim(),
        creatorName: noteCreatorName.trim(),
        address: noteAddress.trim(),
        mobileNumber: noteMobileNumber.trim(),
        costPerPost: noteCostPerPost ? Number(noteCostPerPost) : undefined,
        instagramLink: noteInstagram.trim(),
        facebookLink: noteFacebook.trim(),
        youtubeLink: noteYoutube.trim(),
        targetMonth: selectedDate.includes('-MonthlyTarget') ? noteTargetMonth : undefined,
        targetYear: selectedDate.includes('-MonthlyTarget') ? noteTargetYear : undefined,
        targetProduct: selectedDate.includes('-MonthlyTarget') ? noteTargetProduct : undefined,
        targetSalesRevenue: selectedDate.includes('-MonthlyTarget') ? (noteTargetSalesRevenue ? parseFloat(noteTargetSalesRevenue) : undefined) : undefined,
        targetVideos: selectedDate.includes('-MonthlyTarget') ? (noteTargetVideos ? parseInt(noteTargetVideos) : undefined) : undefined,
        productTargets: selectedDate.includes('-MonthlyTarget') ? noteProductTargets.map((pt: any) => ({ productName: pt.productName, salesRevenue: pt.salesRevenue ? parseFloat(pt.salesRevenue) : undefined, videos: pt.videos ? parseInt(pt.videos) : undefined })) : undefined,
        lastUpdated: new Date().toISOString(),
      } : n));
      setEditingNote(null);
    } else {
      const newNote: Note = {
        id: 'note_' + Math.random().toString(36).substring(2, 11),
        title: noteTitle.trim(),
        content: noteContent.trim(),
        creatorName: noteCreatorName.trim(),
        address: noteAddress.trim(),
        mobileNumber: noteMobileNumber.trim(),
        costPerPost: noteCostPerPost ? Number(noteCostPerPost) : undefined,
        instagramLink: noteInstagram.trim(),
        facebookLink: noteFacebook.trim(),
        youtubeLink: noteYoutube.trim(),
        targetMonth: selectedDate.includes('-MonthlyTarget') ? noteTargetMonth : undefined,
        targetYear: selectedDate.includes('-MonthlyTarget') ? noteTargetYear : undefined,
        targetProduct: selectedDate.includes('-MonthlyTarget') ? noteTargetProduct : undefined,
        targetSalesRevenue: selectedDate.includes('-MonthlyTarget') ? (noteTargetSalesRevenue ? parseFloat(noteTargetSalesRevenue) : undefined) : undefined,
        targetVideos: selectedDate.includes('-MonthlyTarget') ? (noteTargetVideos ? parseInt(noteTargetVideos) : undefined) : undefined,
        productTargets: selectedDate.includes('-MonthlyTarget') ? noteProductTargets.map((pt: any) => ({ productName: pt.productName, salesRevenue: pt.salesRevenue ? parseFloat(pt.salesRevenue) : undefined, videos: pt.videos ? parseInt(pt.videos) : undefined })) : undefined,
        date: selectedDate,
        lastUpdated: new Date().toISOString(),
        keywords: []
      };
      setNotes(prev => [...prev, newNote]);
      
    }

    setNoteTitle('');
    setNoteContent('');
    setNoteCreatorName('');
    setNoteAddress('');
    setNoteMobileNumber('');
    setNoteCostPerPost('');
    setNoteInstagram('');
    setNoteFacebook('');
    setNoteYoutube('');
    setNoteTargetMonth('');
    setNoteTargetYear('');
    setNoteTargetProduct('');
    setNoteTargetSalesRevenue('');
    setNoteTargetVideos('');
    setNoteProductTargets([]);
    setIsCreating(false);
  };

  const handleStartEdit = (note: Note) => {
    setEditingNote(note);
    setNoteTitle(note.title);
    setNoteContent(note.content);
    setNoteCreatorName(note.creatorName || '');
    setNoteAddress(note.address || '');
    setNoteMobileNumber(note.mobileNumber || '');
    setNoteCostPerPost(note.costPerPost !== undefined ? String(note.costPerPost) : '');
    setNoteInstagram(note.instagramLink || '');
    setNoteFacebook(note.facebookLink || '');
    setNoteYoutube(note.youtubeLink || '');
    setNoteTargetMonth(note.targetMonth || '');
    setNoteTargetYear(note.targetYear || '');
    setNoteTargetProduct(note.targetProduct || '');
    setNoteTargetSalesRevenue(note.targetSalesRevenue !== undefined ? String(note.targetSalesRevenue) : '');
    setNoteTargetVideos(note.targetVideos !== undefined ? String(note.targetVideos) : '');
    setNoteProductTargets(note.productTargets ? note.productTargets.map((pt: any) => ({ productName: pt.productName, salesRevenue: pt.salesRevenue !== undefined ? String(pt.salesRevenue) : '', videos: pt.videos !== undefined ? String(pt.videos) : '' })) : []);
    setIsCreating(true);
  };

  const confirmDeleteNote = (id: string) => {
    const targetNote = notes.find(n => n.id === id);
    if (targetNote) {
      const isContact = (targetNote.date || '').includes('-AddressBook');
      addDeletedRecord({
        id: 'del_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        timestamp: Date.now(),
        type: isContact ? 'contact' : 'note',
        title: targetNote.creatorName || targetNote.title || (isContact ? 'Untitled Contact' : 'Untitled Note'),
        originalDate: targetNote.date || selectedDate,
        previewText: targetNote.address || targetNote.content || targetNote.mobileNumber || '',
        noteData: targetNote
      });
    }

    setNotes(prev => prev.filter(n => n.id !== id));
    
    if (editingNote && editingNote.id === id) {
      setEditingNote(null);
      setIsCreating(false);
    }
    setNoteToDelete(null);
  };
  
  const handleDeleteNote = (id: string) => {
    setNoteToDelete(id);
  };

  const handleImportSampleDetailsCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const data = results.data as any[];
        let addedCount = 0;
        
        setNotes(prevNotes => {
          const newNotes = [...prevNotes];
          const updatedIds: string[] = [];
          const addedNotes: any[] = [];
          data.forEach(row => {
            const isEmpty = Object.values(row).every(v => !v || v.toString().trim() === '');
            if (isEmpty) return;

            const name = row['Name'] || row['Creator Name'] || row.creatorName;
            const mobile = row['Mobile Number'] || row.mobileNumber;

            // Find matching note in the current address book (selectedDate)
            const noteIndex = newNotes.findIndex(n => 
              n.date === selectedDate && 
              ((mobile && n.mobileNumber === mobile) || (name && (n.creatorName === name || n.title === name)))
            );

            if (noteIndex >= 0) {
              const note = newNotes[noteIndex];
              const newSample = {
                id: 'sample_' + Math.random().toString(36).substr(2, 9),
                platform: row['Platform'] || row.platform || 'PTG',
                cost: row['Cost'] !== undefined ? row['Cost'] : (row.cost || 0),
                orderId: row['Order ID'] || row.orderId || '',
                orderDate: row['Order Date'] || row['Date'] || row.orderDate || '',
                product: row['Product'] || row.product || '',
                subCategory: row['Sub Category'] || row.subCategory || ''
              };

              newNotes[noteIndex] = {
                ...note,
                sampleDetails: [...(note.sampleDetails || []), newSample]
              };
              addedCount++;
            }
          });
          return newNotes;
        });

        if (e.target) e.target.value = '';
        alert(`Successfully imported ${addedCount} sample details to address book entries!`);
      },
      error: (error) => {
        console.error('Error parsing CSV:', error);
        alert('Failed to parse CSV file.');
      }
    });
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const data = results.data as any[];
        let addedCount = 0;
        const importedNotes: Note[] = [];
        
        data.forEach(row => {
          const isEmpty = Object.values(row).every(v => !v || v.toString().trim() === '');
          if (isEmpty) return;
          
          let parsedSampleDetails = [];
          try { if (row.sampleDetails) parsedSampleDetails = JSON.parse(row.sampleDetails); } catch(e){}
          
          let parsedProductTargets = [];
          try { if (row.productTargets) parsedProductTargets = JSON.parse(row.productTargets); } catch(e){}

          const importedName = row['Name'] || row.creatorName || row.title || 'Untitled';
          const importedMobile = row['Mobile Number'] || row.mobileNumber || undefined;
          const importedAddress = row['Address'] || row.address || undefined;
          const rawCost = row['Cost Per Post'] !== undefined ? row['Cost Per Post'] : row.costPerPost;
          const importedCost = rawCost !== undefined && rawCost !== '' && !isNaN(Number(rawCost)) ? Number(rawCost) : undefined;
          const importedInsta = row['Instagram'] || row.instagramLink || undefined;
          const importedFb = row['Facebook'] || row.facebookLink || undefined;
          const importedYt = row['YouTube'] || row.youtubeLink || undefined;

          const newNote: Note = {
            id: row.id || 'note_' + Math.random().toString(36).substring(2, 11),
            title: importedName,
            content: row.content || '',
            date: row.date || selectedDate,
            keywords: row.keywords ? row.keywords.split('|') : [],
            creatorName: importedName,
            mobileNumber: importedMobile,
            address: importedAddress,
            costPerPost: importedCost,
            instagramLink: importedInsta,
            facebookLink: importedFb,
            youtubeLink: importedYt,
            sampleDetails: parsedSampleDetails.length > 0 ? parsedSampleDetails : undefined,
            targetMonth: row.targetMonth || undefined,
            targetYear: row.targetYear || undefined,
            targetProduct: row.targetProduct || undefined,
            targetSalesRevenue: row.targetSalesRevenue !== undefined && row.targetSalesRevenue !== '' && !isNaN(Number(row.targetSalesRevenue)) ? Number(row.targetSalesRevenue) : undefined,
            targetVideos: row.targetVideos !== undefined && row.targetVideos !== '' && !isNaN(Number(row.targetVideos)) ? Number(row.targetVideos) : undefined,
            productTargets: parsedProductTargets.length > 0 ? parsedProductTargets : undefined,
            lastUpdated: row.lastUpdated || undefined
          };
          importedNotes.push(newNote);
          addedCount++;
        });

        setNotes(prev => {
          const prevMap = new Map(prev.map(n => [n.id, n]));
          importedNotes.forEach(n => prevMap.set(n.id, n));
          return Array.from(prevMap.values());
        });
        
        alert(`Successfully imported ${addedCount} notes!`);
      },
      error: (error: any) => {
        console.error("Error parsing CSV:", error);
        alert("Failed to parse CSV file.");
      }
    });
  };

  const handleExportCSV = () => {
    if (notes.length === 0) {
      alert("No notes to export.");
      return;
    }
    const csv = Papa.unparse(notes.map(n => ({
      id: n.id,
      title: n.title,
      content: n.content,
      date: n.date,
      keywords: n.keywords?.join('|') || '',
      creatorName: n.creatorName || '',
      mobileNumber: n.mobileNumber || '',
      address: n.address || '',
      costPerPost: n.costPerPost ?? '',
      instagramLink: n.instagramLink || '',
      facebookLink: n.facebookLink || '',
      youtubeLink: n.youtubeLink || '',
      sampleDetails: n.sampleDetails && n.sampleDetails.length > 0 ? JSON.stringify(n.sampleDetails) : '',
      targetMonth: n.targetMonth || '',
      targetYear: n.targetYear || '',
      targetProduct: n.targetProduct || '',
      targetSalesRevenue: n.targetSalesRevenue ?? '',
      targetVideos: n.targetVideos ?? '',
      productTargets: n.productTargets && n.productTargets.length > 0 ? JSON.stringify(n.productTargets) : '',
      lastUpdated: n.lastUpdated || ''
    })));
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `Calendar_Notebook_Notes_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();

  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  // --- Address Book Automatic Duplicate Detection ---
  const addressBookDuplicateWarnings: Array<{
    key: string;
    reasonPrefix: string;
    group: Note[];
    reason: string;
    names: string;
  }> = useMemo(() => {
    if (!selectedDate.includes('-AddressBook')) return [];

    const warnings: Array<{
      key: string;
      reasonPrefix: string;
      group: Note[];
      reason: string;
      names: string;
    }> = [];

    const groupedByName = new Map<string, Note[]>();
    const groupedByHandle = new Map<string, Note[]>();
    const groupedByMobile = new Map<string, Note[]>();

    const addressBookEntries = notes.filter(n => n.date && n.date.includes('-AddressBook'));

    const normalizeHandle = (url?: string) => {
      if (!url) return '';
      let str = url.trim().toLowerCase();
      str = str.replace(/^https?:\/\/(www\.)?/, '');
      str = str.replace(/^(instagram\.com\/|facebook\.com\/|youtube\.com\/(c\/|user\/|@)?)/, '');
      str = str.replace(/\/+$/, '');
      str = str.replace(/^@/, '');
      return str;
    };

    addressBookEntries.forEach(note => {
      const name = (note.creatorName || note.title || '').trim();
      if (name && typeof name === 'string' && name.toLowerCase() !== 'untitled' && name.toLowerCase() !== 'untitled contact') {
        const key = name.toLowerCase();
        if (!groupedByName.has(key)) groupedByName.set(key, []);
        groupedByName.get(key)!.push(note);
      }

      const rawHandle = normalizeHandle(note.instagramLink) || normalizeHandle(note.youtubeLink) || normalizeHandle(note.facebookLink);
      if (rawHandle && rawHandle.length > 2) {
        if (!groupedByHandle.has(rawHandle)) groupedByHandle.set(rawHandle, []);
        groupedByHandle.get(rawHandle)!.push(note);
      }

      if (note.mobileNumber && typeof note.mobileNumber === 'string' && note.mobileNumber.trim()) {
        const digits = note.mobileNumber.replace(/[^0-9]/g, '');
        if (digits && digits.length > 5) {
          const key = digits.length > 10 ? digits.slice(-10) : digits;
          if (!groupedByMobile.has(key)) groupedByMobile.set(key, []);
          groupedByMobile.get(key)!.push(note);
        }
      }
    });

    const generateDuplicateWarnings = (groupMap: Map<string, Note[]>, reasonPrefix: string) => {
      groupMap.forEach((group, key) => {
        // Deduplicate the group by id
        const uniqueGroup = Array.from(new Map(group.map(item => [item.id, item])).values());
        if (uniqueGroup.length > 1) {
          warnings.push({
            key: `${reasonPrefix}-${key}`,
            reasonPrefix,
            group: uniqueGroup,
            reason: `Duplicate ${reasonPrefix} used in ${uniqueGroup.length} profiles.`,
            names: Array.from(new Set(uniqueGroup.map(g => g.creatorName || g.title || 'Unnamed'))).join(', ')
          });
        }
      });
    };

    generateDuplicateWarnings(groupedByName, 'Name');
    generateDuplicateWarnings(groupedByHandle, 'Handle');
    generateDuplicateWarnings(groupedByMobile, 'Mobile');

    return warnings;
  }, [notes, selectedDate]);

  const addressBookDuplicateIds = useMemo(() => {
    const duplicateIds = new Set<string>();
    addressBookDuplicateWarnings.forEach(w => w.group.forEach(g => duplicateIds.add(g.id)));
    return duplicateIds;
  }, [addressBookDuplicateWarnings]);

  const handleAddressBookMergeToLatestRestored = () => {
    if (!window.confirm("Are you sure you want to merge duplicates into the most recently restored entries?")) return;
    executeAddressBookMerge(true);
  };

  const handleAddressBookMergeAllDuplicates = () => {
    if (!window.confirm("Are you sure you want to merge all detected duplicate creator entries? This action cannot be undone.")) return;
    executeAddressBookMerge(false);
  };

  const executeAddressBookMerge = (useLatestRestored: boolean, specificGroup?: Note[]) => {
    const groupsToMerge: Note[][] = specificGroup
      ? [specificGroup]
      : addressBookDuplicateWarnings.map(w => w.group);

    if (groupsToMerge.length === 0) {
      alert("No duplicate entries found to merge.");
      return;
    }

    const processedIds = new Set<string>();
    const idsToDelete: string[] = [];
    const notesToUpdate: Note[] = [];
    const deletedNotesForRecovery: Note[] = [];

    groupsToMerge.forEach((group: Note[]) => {
      const itemsToMerge = group.filter((t: Note) => !processedIds.has(t.id));
      if (itemsToMerge.length < 2) return;

      itemsToMerge.forEach((t: Note) => processedIds.add(t.id));

      let baseItem = itemsToMerge[0];

      if (useLatestRestored) {
        let maxTs = -1;
        const getTimestamp = (n: Note) => {
          if (n.lastUpdated) {
            const parsed = new Date(n.lastUpdated).getTime();
            if (!isNaN(parsed) && parsed > 0) return parsed;
          }
          const parts = n.id.split('_');
          if (parts.length >= 2) {
            const ts = parseInt(parts[1], 10);
            if (!isNaN(ts) && ts > 1000000) return ts;
          }
          return 0;
        };

        let hasRestored = false;
        for (const t of itemsToMerge) {
          if (t.content?.includes('Added from') || t.content?.includes('Restored') || t.content?.includes('Monthly Planner')) {
            hasRestored = true;
            const ts = getTimestamp(t);
            if (ts > maxTs) {
              maxTs = ts;
              baseItem = t;
            }
          }
        }

        if (!hasRestored) {
          // Fallback to highest timestamp or completeness score
          for (const t of itemsToMerge) {
            const ts = getTimestamp(t);
            if (ts > maxTs) {
              maxTs = ts;
              baseItem = t;
            }
          }
        }
      } else {
        let maxScore = -1;
        for (const t of itemsToMerge) {
          let score = 0;
          Object.keys(t).forEach(key => {
            const val = (t as any)[key];
            if (val && val !== 'Unknown' && val !== 'Unnamed' && val !== 'Untitled' && val !== 'Untitled Contact' && val !== 0) {
              if (Array.isArray(val) && val.length === 0) return;
              if (typeof val === 'string' && val.trim() === '') return;
              score++;
            }
          });
          if (t.sampleDetails && t.sampleDetails.length > 0) {
            score += t.sampleDetails.length;
          }
          if (score > maxScore) {
            maxScore = score;
            baseItem = t;
          }
        }
      }

      const mergedData: Note = { ...baseItem };

      itemsToMerge.forEach((t: Note) => {
        if (t.id === baseItem.id) return;

        Object.keys(t).forEach(key => {
          const val = (t as any)[key];
          if (!(mergedData as any)[key] && val) {
            (mergedData as any)[key] = val;
          } else if (typeof (mergedData as any)[key] === 'string' && (mergedData as any)[key].trim() === '' && typeof val === 'string' && val.trim() !== '') {
            (mergedData as any)[key] = val;
          } else if (Array.isArray((mergedData as any)[key]) && (mergedData as any)[key].length === 0 && Array.isArray(val) && val.length > 0) {
            (mergedData as any)[key] = val;
          }
        });

        if ((!mergedData.creatorName || mergedData.creatorName === 'Unnamed' || mergedData.creatorName === 'Untitled' || mergedData.creatorName === 'Untitled Contact') && t.creatorName) {
          mergedData.creatorName = t.creatorName;
        }
        if ((!mergedData.title || mergedData.title === 'Unnamed' || mergedData.title === 'Untitled') && t.title) {
          mergedData.title = t.title;
        }

        if (t.address && t.address !== mergedData.address) {
          if (mergedData.address) {
            if (!mergedData.address.toLowerCase().includes(t.address.toLowerCase())) {
              if (t.address.length > mergedData.address.length) {
                mergedData.address = t.address;
              }
            }
          } else {
            mergedData.address = t.address;
          }
        }

        if ((!mergedData.costPerPost || mergedData.costPerPost === 0) && t.costPerPost && t.costPerPost > 0) {
          mergedData.costPerPost = t.costPerPost;
        }
        if (t.costPerPost && mergedData.costPerPost && t.costPerPost > mergedData.costPerPost) {
          mergedData.costPerPost = t.costPerPost;
        }

        if (t.mobileNumber) {
          const single = cleanSingleMobileForStorage(t.mobileNumber);
          if (single) {
            mergedData.mobileNumber = single;
          }
        }

        // Ensure WhatsApp fields are explicitly populated and preserved
        if (mergedData.mobileNumber) {
          (mergedData as any).whatsapp = mergedData.mobileNumber;
          (mergedData as any).whatsappNumber = mergedData.mobileNumber;
          (mergedData as any).phone = mergedData.mobileNumber;
        }

        (['facebookLink', 'instagramLink', 'youtubeLink'] as const).forEach(linkField => {
          if (t[linkField] && t[linkField] !== mergedData[linkField]) {
            if (mergedData[linkField]) {
              if (!mergedData[linkField]!.includes(t[linkField]!)) {
                mergedData[linkField] = mergedData[linkField] + ' | ' + t[linkField];
              }
            } else {
              mergedData[linkField] = t[linkField];
            }
          }
        });

        if (t.content && t.content !== mergedData.content) {
          if (mergedData.content) {
            if (!mergedData.content.includes(t.content)) {
              mergedData.content = mergedData.content + ' | ' + t.content;
            }
          } else {
            mergedData.content = t.content;
          }
        }

        if (t.sampleDetails && Array.isArray(t.sampleDetails) && t.sampleDetails.length > 0) {
          const currentSamples = mergedData.sampleDetails || [];
          const existingSampleKeys = new Set(currentSamples.map((s: any) => `${s.productName || ''}-${s.orderDate || ''}-${s.orderId || ''}`));
          const uniqueNewSamples = t.sampleDetails.filter((s: any) => !existingSampleKeys.has(`${s.productName || ''}-${s.orderDate || ''}-${s.orderId || ''}`));
          mergedData.sampleDetails = [...currentSamples, ...uniqueNewSamples];
        }

        idsToDelete.push(t.id);
        deletedNotesForRecovery.push(t);
      });

      mergedData.lastUpdated = new Date().toISOString();
      notesToUpdate.push(mergedData);
    });

    if (idsToDelete.length === 0) {
      alert("No duplicate records were merged.");
      return;
    }

    // Add deleted items to recovery bin so user can recover if needed!
    addDeletedRecord({
      id: 'del_merge_' + Date.now(),
      timestamp: Date.now(),
      type: 'bulk_addressbook',
      title: `Merged ${idsToDelete.length} Duplicate Contacts`,
      originalDate: selectedDate,
      previewText: `Merged ${idsToDelete.length} duplicate entries into ${notesToUpdate.length} consolidated profile(s)`,
      notesData: deletedNotesForRecovery
    });

    setNotes(prev => {
      const deleteSet = new Set(idsToDelete);
      const updateMap = new Map(notesToUpdate.map(n => [n.id, n]));
      return prev
        .filter(n => !deleteSet.has(n.id))
        .map(n => updateMap.has(n.id) ? updateMap.get(n.id)! : n);
    });

    setRecoverySuccessMessage(`Successfully merged ${idsToDelete.length} duplicate contact entries!`);
    setTimeout(() => setRecoverySuccessMessage(null), 5000);
  };

  const rawNotesForSelectedDate = notes.filter(n => n.date === selectedDate);
  let filteredNotesForSelectedDate = selectedDate.includes('-AddressBook') && addressBookSearchQuery.trim()
    ? rawNotesForSelectedDate.filter(n => 
        (n.title && n.title.toLowerCase().includes(addressBookSearchQuery.toLowerCase())) ||
        (n.creatorName && n.creatorName.toLowerCase().includes(addressBookSearchQuery.toLowerCase())) ||
        (n.mobileNumber && n.mobileNumber.toLowerCase().includes(addressBookSearchQuery.toLowerCase())) ||
        (n.address && n.address.toLowerCase().includes(addressBookSearchQuery.toLowerCase())) ||
        (n.content && n.content.toLowerCase().includes(addressBookSearchQuery.toLowerCase()))
      )
    : rawNotesForSelectedDate;

  if (selectedDate.includes('-AddressBook') && showOnlyAddressBookDuplicates) {
    filteredNotesForSelectedDate = filteredNotesForSelectedDate.filter(n => addressBookDuplicateIds.has(n.id));
  }

  // Sort Addressbook entries alphabetically A-Z by creator name / title
  if (selectedDate.includes('-AddressBook')) {
    filteredNotesForSelectedDate = [...filteredNotesForSelectedDate].sort((a, b) => {
      const nameA = (a.creatorName || a.title || '').trim();
      const nameB = (b.creatorName || b.title || '').trim();
      return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
    });
  }

  const notesForSelectedDate = filteredNotesForSelectedDate;
  const addressBookTotalSampleCost = notesForSelectedDate.reduce((sum, note) => {
    if (note.sampleDetails && note.sampleDetails.length > 0) {
      return sum + note.sampleDetails.reduce((s: any, sample: any) => {
        if (csvStartDate && sample.orderDate) {
          const sDate = new Date(sample.orderDate).getTime();
          const filterDate = new Date(csvStartDate).getTime();
          if (!isNaN(sDate) && !isNaN(filterDate) && sDate < filterDate) {
            return s;
          }
        }
        return s + (typeof sample.cost === 'number' ? sample.cost : (parseFloat(sample.cost as string) || 0));
      }, 0);
    }
    return sum;
  }, 0);

  const getNoteCountForDay = (day: number) => {
    const dString = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return notes.filter(n => n.date === dString).length;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-br from-violet-600 via-fuchsia-600 to-rose-500 p-6 rounded-2xl shadow-lg border border-violet-400 text-white">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-white/20 backdrop-blur-md text-white rounded-xl shadow-inner border border-white/30">
            <CalendarIcon className="w-8 h-8 drop-shadow-md" />
          </div>
          <div>
            <h2 className="text-3xl font-black tracking-tight drop-shadow-sm">Calendar Notebook</h2>
            <p className="text-sm font-bold text-white/80 drop-shadow-sm">Track and log important notes by date. Set global flashing notes for urgent reminders.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Calendar Notebook Drive Sync Buttons (Top Banner - strictly only for Date-wise notes like 1st, 2nd, 3rd...) */}
          {selectedDate.match(/^\d{4}-\d{2}-\d{2}$/) && (
            <div className="flex items-center bg-white/20 backdrop-blur-md rounded-lg border border-white/30 overflow-hidden divide-x divide-white/20 shrink-0 shadow-sm">
              <button
                disabled={isDriveSyncing}
                onClick={handleUploadCalendarNotebookToDrive}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold transition-colors text-white hover:bg-white/20 ${isDriveSyncing ? 'opacity-70 cursor-wait' : ''}`}
                title="Save Date-Wise Notes (1st, 2nd, 3rd...) to Google Drive"
                aria-label="Save Date-Wise Notes to Google Drive"
              >
                <CloudUpload className={`w-4 h-4 ${isDriveSyncing ? 'animate-pulse' : ''}`} />
                <span className="hidden sm:inline">SAVE TO DRIVE</span>
              </button>
              <button
                disabled={isDriveSyncing}
                onClick={handleSyncCalendarNotebookFromDrive}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold transition-colors text-white hover:bg-white/20 ${isDriveSyncing ? 'opacity-70 cursor-wait' : ''}`}
                title="Update Date-Wise Notes (1st, 2nd, 3rd...) to Google Drive"
                aria-label="Update Date-Wise Notes to Google Drive"
              >
                <RefreshCw className={`w-4 h-4 ${isDriveSyncing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">UPDATE FROM DRIVE</span>
              </button>
            </div>
          )}

          <input 
            type="file" 
            accept=".csv" 
            ref={fileInputRef} 
            onChange={handleImportCSV} 
            className="hidden" 
            id="notebook-csv-upload" 
          />
          <label 
            htmlFor="notebook-csv-upload"
            className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 backdrop-blur-md text-white text-xs font-bold px-4 py-2 rounded-lg cursor-pointer transition-colors shadow-sm border border-white/30 whitespace-nowrap"
            title="Import Notes from CSV"
          >
            <Upload className="w-4 h-4" />
            IMPORT
          </label>
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 bg-white text-violet-900 hover:bg-violet-50 text-xs font-bold px-4 py-2 rounded-lg cursor-pointer transition-colors shadow-sm border border-transparent whitespace-nowrap"
            title="Export Notes to CSV"
          >
            <Download className="w-4 h-4" />
            EXPORT
          </button>
          {/* Important Links Button */}
          <button
            type="button"
            onClick={() => setShowImportantLinksModal(true)}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black px-4 py-2 rounded-lg cursor-pointer transition-all shadow-md border border-indigo-500 whitespace-nowrap active:scale-95"
            title="Keep and open important links for easy access"
          >
            <Bookmark className="w-4 h-4 fill-white text-white" />
            <span className="text-white font-black">IMPORTANT LINKS</span>
            <span className="ml-0.5 px-1.5 py-0.5 bg-black/30 text-white rounded-full text-[10px] font-black">
              {importantLinks.length}
            </span>
          </button>
        </div>
      </div>

      {/* Important Links Quick Access Strip */}
      <div className="bg-gradient-to-r from-amber-50 via-yellow-50 to-orange-50 border-2 border-amber-200/90 rounded-2xl p-3 shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <button
              type="button"
              onClick={() => setShowImportantLinksModal(true)}
              className="flex items-center gap-2 text-xs font-black text-white uppercase tracking-wider bg-slate-900 hover:bg-black px-3.5 py-1.5 rounded-xl border border-slate-700 shrink-0 cursor-pointer transition shadow-md active:scale-95"
              title="Click to view and manage all Important Links (Always displayed alphabetically A-Z)"
            >
              <Bookmark className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              <span className="text-white font-black tracking-wide">Quick Links</span>
              <span className="px-2 py-0.5 bg-amber-500 text-slate-950 rounded-full text-[10px] font-black">
                {importantLinks.length}
              </span>
              <span className="text-[10px] bg-white/15 px-1.5 py-0.5 rounded text-amber-200 font-bold uppercase tracking-wider">
                A-Z
              </span>
            </button>

            {/* Pinned Links or Quick Pills divided by letter A, B, C */}
            {importantLinks.length === 0 ? (
              <span className="text-xs text-amber-800 font-medium italic">
                No saved links yet. Click "+ Add Link" to bookmark key sheets, drives, and dashboards for instant 1-click access!
              </span>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                {groupedDisplayedQuickLinks.map(({ letter, links: groupLinks }) => (
                  <div 
                    key={letter}
                    className="flex items-center gap-1.5 bg-amber-200/50 border border-amber-300 rounded-xl px-2 py-1 shadow-2xs"
                  >
                    <span 
                      className="w-5 h-5 rounded-md bg-amber-700 text-white font-black text-[11px] flex items-center justify-center shrink-0 shadow-xs"
                      title={`Links under "${letter}"`}
                    >
                      {letter}
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {groupLinks.map((link, idx) => {
                        const theme = getQuickLinkColor(link, idx);
                        const href = link.url.startsWith('http') ? link.url : `https://${link.url}`;
                        const isCopied = copiedLinkId === link.id;

                        return (
                          <div
                            key={link.id}
                            className={`group flex items-center ${theme.bg} ${theme.hoverBg} border ${theme.border} rounded-xl px-3 py-1.5 text-xs shadow-md transition-all gap-2 transform hover:-translate-y-0.5 hover:shadow-lg active:scale-95`}
                            style={{ backgroundColor: link.color && link.color.startsWith('#') ? link.color : undefined }}
                          >
                            {link.pinned && <Pin className="w-3.5 h-3.5 text-amber-200 fill-amber-200 shrink-0 drop-shadow-xs" />}
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-black text-white hover:text-white/95 flex items-center gap-1.5 truncate max-w-[160px] sm:max-w-[240px] tracking-wide"
                              title={`Open ${link.title} (${link.url})${link.description ? ` - ${link.description}` : ''}`}
                            >
                              <span className="truncate text-white font-black drop-shadow-xs">{link.title}</span>
                              <ExternalLink className="w-3.5 h-3.5 text-white/90 group-hover:text-white shrink-0 drop-shadow-xs" />
                            </a>
                            <div className="flex items-center gap-0.5 shrink-0 bg-black/25 rounded-lg p-0.5 ml-0.5">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCopyLink(link.url, link.id);
                                }}
                                className="text-white/80 hover:text-white hover:bg-white/20 p-1 rounded cursor-pointer transition shrink-0"
                                title="Copy URL to clipboard"
                                aria-label={`Copy URL for ${link.title}`}
                              >
                                {isCopied ? (
                                  <Check className="w-3 h-3 text-emerald-200 stroke-[2.5]" />
                                ) : (
                                  <Copy className="w-3 h-3 text-white" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStartEditLink(link);
                                }}
                                className="text-white/80 hover:text-white hover:bg-white/25 p-1 rounded cursor-pointer transition shrink-0"
                                title={`Edit "${link.title}"`}
                                aria-label={`Edit ${link.title}`}
                              >
                                <Edit3 className="w-3 h-3 text-white" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteLink(link.id, link.title);
                                }}
                                className="text-white/80 hover:text-rose-200 hover:bg-rose-600/50 p-1 rounded cursor-pointer transition shrink-0"
                                title={`Delete "${link.title}"`}
                                aria-label={`Delete ${link.title}`}
                              >
                                <Trash2 className="w-3 h-3 text-white" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end md:self-center flex-wrap">
            {/* Google Drive Mini Buttons - White words on color backgrounds */}
            <div className="flex items-center rounded-xl overflow-hidden shadow-xs border border-slate-200 shrink-0 gap-1" title="Google Drive Cloud Sync">
              <button
                type="button"
                disabled={isDriveSyncing}
                onClick={handleUploadImportantLinksToDrive}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-black transition-all bg-blue-600 hover:bg-blue-700 text-white rounded-l-xl active:scale-95 cursor-pointer ${
                  isDriveSyncing ? 'opacity-60 cursor-wait' : ''
                }`}
                title="Save Important Links to Google Drive"
                aria-label="Save Important Links to Google Drive"
              >
                <CloudUpload className={`w-3.5 h-3.5 ${isDriveSyncing ? 'animate-pulse text-white' : 'text-white'}`} />
                <span className="hidden sm:inline text-[11px] font-black uppercase tracking-wider text-white">Save to Drive</span>
              </button>
              <button
                type="button"
                disabled={isDriveSyncing}
                onClick={handleSyncImportantLinksFromDrive}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-black transition-all bg-indigo-600 hover:bg-indigo-700 text-white rounded-r-xl active:scale-95 cursor-pointer ${
                  isDriveSyncing ? 'opacity-60 cursor-wait' : ''
                }`}
                title="Update data from Google Drive"
                aria-label="Update data from Google Drive"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isDriveSyncing ? 'animate-spin text-white' : 'text-white'}`} />
                <span className="hidden sm:inline text-[11px] font-black uppercase tracking-wider text-white">Update from Drive</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setIsAddingLink(true);
                setEditingLinkId(null);
                setFormLinkTitle('');
                setFormLinkUrl('');
                setFormLinkCategory('Work & Sheets');
                setFormLinkDescription('');
                setFormLinkPinned(true);
                setFormLinkColor('');
                setShowImportantLinksModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-black bg-amber-600 hover:bg-amber-700 active:scale-95 text-white rounded-xl shadow-sm border border-amber-500 transition cursor-pointer"
              title="Add a new link to Important Links"
            >
              <Plus className="w-3.5 h-3.5 text-white" />
              <span className="text-white font-black">Add Link</span>
            </button>
            <button
              type="button"
              onClick={() => setShowImportantLinksModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-black bg-slate-800 hover:bg-slate-900 text-white border border-slate-700 rounded-xl shadow-sm transition cursor-pointer active:scale-95"
              title="Open Important Links manager"
            >
              <span className="text-white font-black">Manage All ({importantLinks.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Prominent Google Sheets extraction alert message */}
      {extractionMessage && (
        <div
          className={`p-4 rounded-2xl border-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl transition-all animate-fade-in ${
            extractionMessage.type === 'success' 
              ? 'bg-gradient-to-r from-emerald-50 via-teal-50 to-green-50 border-emerald-300 text-emerald-900' 
              : 'bg-gradient-to-r from-rose-50 via-red-50 to-orange-50 border-rose-300 text-rose-900'
          }`}
          id="extraction-alert-top-banner"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-2xl flex-shrink-0">{extractionMessage.type === 'success' ? '📊' : '⚠️'}</span>
            <div>
              <p className="text-sm font-black tracking-wide break-words">{extractionMessage.text}</p>
              {extractionMessage.type === 'success' && (
                <p className="text-xs text-emerald-700 font-semibold mt-0.5">
                  Your address book sample records have been extracted into Google Sheets.
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {extractionMessage.url && (
              <>
                <button
                  type="button"
                  onClick={() => handleOpenDriveSheet(extractionMessage.url)}
                  className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs py-2 px-4 rounded-xl shadow-md hover:shadow-lg transition-all cursor-pointer uppercase tracking-wider"
                  title="Open Spreadsheet in Google Drive"
                  id="open-drive-sheet-top-btn"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>OPEN DRIVE SHEET</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (extractionMessage.url) {
                      navigator.clipboard.writeText(extractionMessage.url);
                      alert('Spreadsheet link copied to clipboard!');
                    }
                  }}
                  className="inline-flex items-center gap-1.5 bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-xs py-2 px-3 rounded-xl shadow-sm transition-all cursor-pointer"
                  title="Copy Spreadsheet URL"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Link</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setExtractionMessage(null)}
              className="text-gray-400 hover:text-gray-700 p-1.5 rounded-lg hover:bg-black/5 cursor-pointer ml-1"
              title="Dismiss"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Calendar Grid */}
        <div className="lg:col-span-2 bg-gradient-to-br from-blue-50 to-indigo-100 rounded-2xl border-2 border-indigo-200 p-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-fuchsia-300/20 rounded-full blur-3xl -mr-20 -mt-20"></div>
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-400/20 rounded-full blur-3xl -ml-20 -mb-20"></div>
          
          <div className="flex items-center justify-between mb-6 relative z-10">
            <h3 className="text-2xl font-black text-indigo-900 drop-shadow-sm uppercase tracking-tight">
              {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
            </h3>
            <div className="flex gap-2">
              <button onClick={prevMonth} className="p-2 bg-white/60 hover:bg-white text-indigo-700 rounded-lg cursor-pointer shadow-sm transition"><ChevronLeft className="w-5 h-5"/></button>
              <button onClick={() => setCurrentDate(new Date())} className="px-4 py-1.5 text-sm font-black bg-gradient-to-r from-indigo-500 to-blue-500 text-white rounded-lg shadow-md hover:shadow-lg transition cursor-pointer tracking-wider uppercase">Today</button>
              <button onClick={nextMonth} className="p-2 bg-white/60 hover:bg-white text-indigo-700 rounded-lg cursor-pointer shadow-sm transition"><ChevronRight className="w-5 h-5"/></button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center mb-2 relative z-10">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} className="text-xs font-black text-indigo-400 uppercase tracking-wider">{d}</div>
            ))}
          </div>
          
          <div className="grid grid-cols-7 gap-2 relative z-10">
            {Array.from({ length: firstDayOfMonth }).map((_, i) => (
              <div key={`empty-${i}`} className="p-2 rounded-xl text-center bg-white/40 text-gray-300"></div>
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dString = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const isSelected = selectedDate === dString;
              const count = getNoteCountForDay(day);

              return (
                <button
                  key={day}
                  onClick={() => { setSelectedDate(dString); setIsCreating(false); setEditingNote(null); }}
                  className={`relative p-3 rounded-xl border-2 flex w-full flex-col items-center gap-1 cursor-pointer transition-all ${
                    isSelected 
                      ? 'bg-gradient-to-br from-fuchsia-500 to-rose-500 border-rose-400 text-white shadow-lg transform scale-110 z-20' 
                      : 'bg-white border-white/50 text-indigo-900 hover:border-fuchsia-300 hover:bg-fuchsia-50 hover:text-fuchsia-700 shadow-sm'
                  }`}
                >
                  <span className="text-base font-black">{day}</span>
                  {count > 0 && (
                     <span className={`w-2 h-2 rounded-full shadow-sm ${isSelected ? 'bg-white' : 'bg-rose-500'}`}></span>
                  )}
                </button>
              )
            })}
            
            {/* Extra Button */}
            <button
              key="extra"
              onClick={() => {
                const extraDString = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-Extra`;
                setSelectedDate(extraDString);
                setIsCreating(false);
                setEditingNote(null);
              }}
              className={`relative p-3 rounded-xl border-2 flex w-full flex-col items-center justify-center gap-1 cursor-pointer transition-all col-span-7 mt-1 ${
                selectedDate === `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-Extra`
                  ? 'bg-gradient-to-br from-fuchsia-500 to-rose-500 border-rose-400 text-white shadow-lg transform scale-[1.02] z-20'
                  : 'bg-white border-white/50 text-indigo-900 hover:border-fuchsia-300 hover:bg-fuchsia-50 hover:text-fuchsia-700 shadow-sm'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <span className="text-sm font-black uppercase tracking-widest">Extra</span>
                {notes.filter(n => n.date === `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-Extra`).length > 0 && (
                  <span className={`w-2 h-2 rounded-full shadow-sm ${selectedDate === `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-Extra` ? 'bg-white' : 'bg-rose-500'}`}></span>
                )}
              </div>
            </button>
            
            {/* Monthly Target Button */}
            <button
              key="monthly-target"
              onClick={() => {
                const mtDString = `${currentDate.getFullYear()}-MonthlyTarget`;
                setSelectedDate(mtDString);
                setIsCreating(false);
                setEditingNote(null);
              }}
              className={`relative p-3 rounded-xl border-2 flex w-full flex-col items-center justify-center gap-1 cursor-pointer transition-all col-span-7 mt-1 ${
                selectedDate === `${currentDate.getFullYear()}-MonthlyTarget`
                  ? 'bg-gradient-to-br from-indigo-500 to-blue-500 border-blue-400 text-white shadow-lg transform scale-[1.02] z-20'
                  : 'bg-white border-white/50 text-indigo-900 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 shadow-sm'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <span className="text-sm font-black uppercase tracking-widest">Monthly Target</span>
                {notes.filter(n => n.date === `${currentDate.getFullYear()}-MonthlyTarget`).length > 0 && (
                  <span className={`w-2 h-2 rounded-full shadow-sm ${selectedDate === `${currentDate.getFullYear()}-MonthlyTarget` ? 'bg-white' : 'bg-blue-500'}`}></span>
                )}
              </div>
            </button>
            
            {/* New Direction Button */}
            <button
              key="new-direction"
              onClick={() => {
                const ndDString = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-NewDirection`;
                setSelectedDate(ndDString);
                setIsCreating(false);
                setEditingNote(null);
              }}
              className={`relative p-3 rounded-xl border-2 flex w-full flex-col items-center justify-center gap-1 cursor-pointer transition-all col-span-7 mt-1 ${
                selectedDate === `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-NewDirection`
                  ? 'bg-gradient-to-br from-emerald-500 to-teal-500 border-teal-400 text-white shadow-lg transform scale-[1.02] z-20'
                  : 'bg-white border-white/50 text-indigo-900 hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700 shadow-sm'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <span className="text-sm font-black uppercase tracking-widest">New Direction</span>
                {notes.filter(n => n.date === `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-NewDirection`).length > 0 && (
                  <span className={`w-2 h-2 rounded-full shadow-sm ${selectedDate === `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-NewDirection` ? 'bg-white' : 'bg-teal-500'}`}></span>
                )}
              </div>
            </button>

            {/* Address Book Button */}
            <button
              key="address-book"
              onClick={() => {
                const abDString = `Global-AddressBook`;
                setSelectedDate(abDString);
                setIsCreating(false);
                setEditingNote(null);
              }}
              className={`relative p-3 rounded-xl border-2 flex w-full flex-col items-center justify-center gap-1 cursor-pointer transition-all col-span-7 mt-1 ${
                selectedDate === `Global-AddressBook`
                  ? 'bg-gradient-to-br from-violet-500 to-purple-500 border-purple-400 text-white shadow-lg transform scale-[1.02] z-20'
                  : 'bg-white border-white/50 text-indigo-900 hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700 shadow-sm'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <span className="text-sm font-black uppercase tracking-widest">Address Book</span>
                {notes.filter(n => n.date === `Global-AddressBook`).length > 0 && (
                  <span className={`w-2 h-2 rounded-full shadow-sm ${selectedDate === `Global-AddressBook` ? 'bg-white' : 'bg-purple-500'}`}></span>
                )}
              </div>
            </button>
            {/* Task For Recovery Button */}
            <button
              key="task-recovery"
              onClick={() => {
                const trDString = `Global-TaskRecovery`;
                setSelectedDate(trDString);
                setIsCreating(false);
                setEditingNote(null);
              }}
              className={`relative p-3 rounded-xl border-2 flex w-full flex-col items-center justify-center gap-1 cursor-pointer transition-all col-span-7 mt-1 ${
                selectedDate === `Global-TaskRecovery`
                  ? 'bg-gradient-to-br from-rose-500 to-red-600 border-red-500 text-white shadow-lg transform scale-[1.02] z-20'
                  : 'bg-white border-white/50 text-indigo-900 hover:border-red-300 hover:bg-red-50 hover:text-red-700 shadow-sm'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <span className="text-sm font-black uppercase tracking-widest">TASK FOR RECOVERY</span>
                {notes.filter(n => n.date === `Global-TaskRecovery`).length > 0 && (
                  <span className={`w-2 h-2 rounded-full shadow-sm ${selectedDate === `Global-TaskRecovery` ? 'bg-white' : 'bg-red-500'}`}></span>
                )}
              </div>
            </button>

            {/* Important Links Sidebar Quick Access Button */}
            <button
              key="important-links-sidebar"
              type="button"
              onClick={() => setShowImportantLinksModal(true)}
              className="relative p-3 rounded-xl border-2 flex w-full flex-col items-center justify-center gap-1 cursor-pointer transition-all col-span-7 mt-1 bg-gradient-to-br from-amber-500 via-amber-600 to-orange-500 border-amber-400 text-white shadow-md hover:shadow-lg hover:from-amber-600 hover:to-orange-600 transform hover:scale-[1.01]"
              title="Open and manage your Important Links & Bookmarks"
            >
              <div className="flex items-center justify-center gap-2">
                <Bookmark className="w-4 h-4 fill-white text-white" />
                <span className="text-sm font-black uppercase tracking-widest">Important Links</span>
                <span className="px-2 py-0.5 bg-black/25 text-white rounded-full text-xs font-black">
                  {importantLinks.length}
                </span>
              </div>
            </button>
          </div>
        </div>

        {/* Selected Date Notes */}
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl border-2 border-orange-200 p-6 shadow-xl flex flex-col h-full relative">
          <div className="flex flex-col 2xl:flex-row 2xl:items-center justify-between gap-4 mb-4 pb-4 border-b border-orange-200 relative z-10">
             <div className="space-y-1 min-w-0">
                <h3 className="font-black text-xl text-orange-900 tracking-tight break-words">Notes for {selectedDate.match(/^\d{4}-\d{2}-\d{2}$/) ? selectedDate.split('-').reverse().join('/') : selectedDate}</h3>
                <p className="text-xs font-bold text-orange-600/80 uppercase tracking-widest">{notesForSelectedDate.length} {notesForSelectedDate.length === 1 ? 'entry' : 'entries'} found</p>
             </div>
             {!isCreating && (
                <div className="flex flex-wrap items-center gap-2">
                 {selectedDate.includes('-AddressBook') && (
                    <>
                      {/* Drive Tools Group */}
                      <div className="flex items-center bg-white rounded-lg shadow-sm border border-orange-200 overflow-hidden divide-x divide-orange-100 shrink-0">
                        <button
                          disabled={isDriveSyncing}
                          onClick={handleUploadAddressBookToDrive}
                          className={`p-2 transition-colors flex items-center justify-center ${isDriveSyncing ? 'text-blue-400 bg-blue-50/50 cursor-wait' : 'text-blue-600 hover:bg-blue-50 hover:text-blue-700'}`}
                          title="Save Address Book to Google Drive"
                          aria-label="Save Address Book to Google Drive"
                        >
                          <CloudUpload className={`w-4 h-4 ${isDriveSyncing ? 'animate-pulse' : ''}`} />
                        </button>
                        <button
                          disabled={isDriveSyncing}
                          onClick={handleSyncAddressBookFromDrive}
                          className={`p-2 transition-colors flex items-center justify-center ${isDriveSyncing ? 'text-indigo-400 bg-indigo-50/50 cursor-wait' : 'text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700'}`}
                          title="Update Address Book from Google Drive"
                          aria-label="Update Address Book from Google Drive"
                        >
                          <RefreshCw className={`w-4 h-4 ${isDriveSyncing ? 'animate-spin' : ''}`} />
                        </button>
                      </div>

                      {/* CSV Tools Group */}
                      <div className="flex items-center bg-white rounded-lg shadow-sm border border-orange-200 overflow-hidden divide-x divide-orange-100 shrink-0">
                        <button
                          onClick={() => document.getElementById('addressbook-csv-upload')?.click()}
                          className="p-2 transition-colors text-gray-500 hover:bg-gray-50 hover:text-emerald-600"
                          title="Upload Addressbook CSV"
                        >
                          <Upload className="w-4 h-4"/>
                        </button>
                        <input type="file" accept=".csv" onChange={handleImportCSV} className="hidden" id="addressbook-csv-upload" />
                        
                        <button
                          onClick={() => document.getElementById('sample-csv-upload')?.click()}
                          className="p-2 transition-colors text-gray-500 hover:bg-gray-50 hover:text-orange-600"
                          title="Upload Sample Details CSV"
                        >
                          <FileText className="w-4 h-4"/>
                        </button>
                        <input type="file" accept=".csv" onChange={handleImportSampleDetailsCSV} className="hidden" id="sample-csv-upload" />
                        
                        <button
                          onClick={handleDownloadAddressbookCSV}
                          className="p-2 transition-colors text-gray-500 hover:bg-gray-50 hover:text-indigo-600"
                          title="Download Addressbook CSV"
                        >
                          <FileSpreadsheet className="w-4 h-4"/>
                        </button>
                      </div>

                      {/* Delete Button */}
                      <button
                        onClick={() => {
                          if (window.confirm('Are you sure you want to delete all entries in this address book?')) {
                            const entriesToDelete = notes.filter(n => n.date === selectedDate);
                            if (entriesToDelete.length > 0) {
                              addDeletedRecord({
                                id: 'del_bulk_' + Date.now(),
                                timestamp: Date.now(),
                                type: 'bulk_addressbook',
                                title: `All Address Book Contacts (${entriesToDelete.length} entries)`,
                                originalDate: selectedDate,
                                previewText: `${entriesToDelete.length} address book contacts`,
                                notesData: entriesToDelete
                              });
                            }
                            setNotes(prev => prev.filter(n => n.date !== selectedDate));
                          }
                        }}
                        className="bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 p-2 rounded-lg shadow-sm transition-colors flex items-center justify-center shrink-0"
                        title="Delete All Entries"
                      >
                        <Trash2 className="w-4 h-4"/>
                      </button>

                      {/* Recover Last Deleted Contact Button */}
                      <button
                        type="button"
                        onClick={() => handleRecoverLastDeleted('addressbook')}
                        disabled={!lastDeletedAddressBookItem}
                        className={`p-2 px-3 rounded-lg shadow-sm border transition-all flex items-center justify-center gap-1.5 shrink-0 font-bold text-xs ${
                          lastDeletedAddressBookItem
                            ? 'bg-amber-100 hover:bg-amber-200 border-amber-400 text-amber-950 shadow-amber-500/10 cursor-pointer active:scale-95'
                            : 'bg-white/60 border-orange-200 text-gray-400 cursor-not-allowed opacity-60'
                        }`}
                        title={
                          lastDeletedAddressBookItem
                            ? `Recover last deleted contact: "${lastDeletedAddressBookItem.title}"`
                            : 'No recently deleted contacts to recover'
                        }
                      >
                        <RotateCcw className={`w-4 h-4 ${lastDeletedAddressBookItem ? 'text-amber-800' : 'text-gray-400'}`} />
                        <span className="hidden sm:inline font-black uppercase text-[10px] tracking-wider">
                          Recover Contact{deletedAddressBookItems.length > 0 ? ` (${deletedAddressBookItems.length})` : ''}
                        </span>
                      </button>

                      {/* Recovery Bin Modal Launcher */}
                      <button
                        type="button"
                        onClick={() => {
                          setRecoveryModalFilter('addressbook');
                          setShowRecoveryBinModal(true);
                        }}
                        className="p-2 rounded-lg bg-white hover:bg-orange-50 border border-orange-200 text-orange-700 shadow-sm transition-colors flex items-center justify-center shrink-0"
                        title="Open Address Book Recovery Bin & Deleted History"
                      >
                        <History className="w-4 h-4" />
                      </button>
                    </>
                 )}
                 {selectedDate.includes('-MonthlyTarget') && (
                    <div className="flex items-center bg-white rounded-lg shadow-sm border border-orange-200 overflow-hidden divide-x divide-orange-100 shrink-0">
                      <button
                        disabled={isDriveSyncing}
                        onClick={handleUploadMonthlyTargetToDrive}
                        className={`p-2 transition-colors flex items-center justify-center ${
                          isDriveSyncing ? 'text-blue-400 bg-blue-50/50 cursor-wait' : 'text-blue-600 hover:bg-blue-50 hover:text-blue-700'
                        }`}
                        title="Save Monthly Target to Google Drive"
                        aria-label="Save Monthly Target to Google Drive"
                      >
                        <CloudUpload className={`w-4 h-4 ${isDriveSyncing ? 'animate-pulse' : ''}`} />
                      </button>
                      <button
                        disabled={isDriveSyncing}
                        onClick={handleSyncMonthlyTargetFromDrive}
                        className={`p-2 transition-colors flex items-center justify-center ${
                          isDriveSyncing ? 'text-indigo-400 bg-indigo-50/50 cursor-wait' : 'text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700'
                        }`}
                        title="Update Monthly Target from Google Drive"
                        aria-label="Update Monthly Target from Google Drive"
                      >
                        <RefreshCw className={`w-4 h-4 ${isDriveSyncing ? 'animate-spin' : ''}`} />
                      </button>
                    </div>
                 )}

                 {/* Calendar Notebook Drive Sync Buttons & Recovery Buttons (when viewing Calendar Notes) */}
                 {!selectedDate.includes('-AddressBook') && !selectedDate.includes('-MonthlyTarget') && (
                   <>
                     {/* Drive Tools Group (Only active & visible for Date-Wise Notes like 1st of Oct, 2nd Oct, 3rd Oct) */}
                     {selectedDate.match(/^\d{4}-\d{2}-\d{2}$/) && (
                       <div className="flex items-center bg-white rounded-lg shadow-sm border border-orange-200 overflow-hidden divide-x divide-orange-100 shrink-0">
                         <button
                           disabled={isDriveSyncing}
                           onClick={handleUploadCalendarNotebookToDrive}
                           className={`p-2 transition-colors flex items-center justify-center ${
                             isDriveSyncing ? 'text-blue-400 bg-blue-50/50 cursor-wait' : 'text-blue-600 hover:bg-blue-50 hover:text-blue-700'
                           }`}
                           title="Save Date-Wise Notes (1st, 2nd, 3rd...) to Google Drive"
                           aria-label="Save Date-Wise Notes to Google Drive"
                         >
                           <CloudUpload className={`w-4 h-4 ${isDriveSyncing ? 'animate-pulse' : ''}`} />
                         </button>
                         <button
                           disabled={isDriveSyncing}
                           onClick={handleSyncCalendarNotebookFromDrive}
                           className={`p-2 transition-colors flex items-center justify-center ${
                             isDriveSyncing ? 'text-indigo-400 bg-indigo-50/50 cursor-wait' : 'text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700'
                           }`}
                           title="Update Date-Wise Notes (1st, 2nd, 3rd...) to Google Drive"
                           aria-label="Update Date-Wise Notes to Google Drive"
                         >
                           <RefreshCw className={`w-4 h-4 ${isDriveSyncing ? 'animate-spin' : ''}`} />
                         </button>
                       </div>
                     )}

                     <div className="flex items-center gap-1.5 shrink-0">
                     <button
                       type="button"
                       onClick={() => handleRecoverLastDeleted('calendar')}
                       disabled={!lastDeletedCalendarItem}
                       className={`p-2 px-3 rounded-lg shadow-sm border transition-all flex items-center gap-1.5 justify-center font-bold text-xs ${
                         lastDeletedCalendarItem
                           ? 'bg-amber-100 hover:bg-amber-200 border-amber-400 text-amber-950 shadow-amber-500/10 cursor-pointer active:scale-95'
                           : 'bg-white/60 border-orange-200 text-gray-400 cursor-not-allowed opacity-60'
                       }`}
                       title={
                         lastDeletedCalendarItem
                           ? `Recover last deleted note: "${lastDeletedCalendarItem.title}"`
                           : 'No deleted notes to recover'
                       }
                     >
                       <RotateCcw className={`w-4 h-4 ${lastDeletedCalendarItem ? 'text-amber-800' : 'text-gray-400'}`} />
                       <span className="text-[10px] font-black uppercase tracking-wider whitespace-nowrap">
                         Recover Note{deletedCalendarItems.length > 0 ? ` (${deletedCalendarItems.length})` : ''}
                       </span>
                     </button>

                     <button
                       type="button"
                       onClick={() => {
                         setRecoveryModalFilter('calendar');
                         setShowRecoveryBinModal(true);
                       }}
                       className="p-2 rounded-lg bg-white hover:bg-orange-50 border border-orange-200 text-orange-700 shadow-sm transition-colors flex items-center justify-center"
                       title="Open Calendar Notebook Recovery Bin & History"
                     >
                       <History className="w-4 h-4" />
                     </button>
                   </div>
                 </>
                 )}

                 <button 
                    onClick={() => setIsCreating(true)}
                    className="bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 text-white p-2 px-4 rounded-lg shadow-sm hover:shadow-md transition transform hover:-translate-y-0.5 flex items-center gap-1.5 justify-center flex-1 md:flex-none min-w-[120px] shrink-0"
                 >
                   <Plus className="w-4 h-4"/>
                   <span className="text-[11px] font-bold uppercase tracking-widest whitespace-nowrap">Add Entry</span>
                 </button>
                 {selectedDate.includes('-AddressBook') && typeof document !== 'undefined' && createPortal(
                    <div 
                      className="fixed z-[9999] flex flex-col items-end gap-2 w-[94vw] sm:w-[580px] md:w-[660px] max-w-[calc(100vw-24px)] select-none"
                      style={{ left: addressBookToolsPos.x, top: addressBookToolsPos.y }}
                      onPointerDown={handleAddressBookToolsPointerDown}
                      onPointerMove={handleAddressBookToolsPointerMove}
                      onPointerUp={handleAddressBookToolsPointerUp}
                      onPointerCancel={handleAddressBookToolsPointerUp}
                    >
                      <div className="pointer-events-auto flex items-center gap-2 bg-white/98 backdrop-blur-2xl p-2 rounded-2xl shadow-[0_12px_40px_-5px_rgba(249,115,22,0.3)] border-2 border-orange-200/90 w-full transition-all ring-1 ring-black/5">
                        {/* Drag Handle Grip */}
                        <div 
                          className="flex items-center justify-center p-1 text-orange-400 hover:text-orange-600 cursor-grab active:cursor-grabbing rounded-lg hover:bg-orange-100/70 transition shrink-0 select-none"
                          title="Drag to reposition floating search bar"
                        >
                          <GripVertical className="w-4 h-4" />
                        </div>

                        {/* Roomy, Expanded Search Bar */}
                        <div className="relative flex-1 min-w-[200px]">
                          <Search className="w-4 h-4 text-orange-500 absolute left-3 top-1/2 transform -translate-y-1/2 pointer-events-none" />
                          <input
                            type="text"
                            value={addressBookSearchQuery}
                            onChange={e => setAddressBookSearchQuery(e.target.value)}
                            placeholder="Search contacts by name, mobile, address, handle, notes..."
                            className="w-full text-xs sm:text-sm font-semibold bg-orange-50/70 hover:bg-orange-50 focus:bg-white pl-9 pr-8 py-2.5 border border-orange-200/80 rounded-xl outline-none focus:ring-2 focus:ring-orange-500/25 focus:border-orange-400 text-orange-950 placeholder:text-orange-400/90 transition-all shadow-inner select-text cursor-text"
                          />
                          {addressBookSearchQuery.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setAddressBookSearchQuery('')}
                              className="absolute right-2.5 top-1/2 transform -translate-y-1/2 text-orange-400 hover:text-orange-700 p-0.5 rounded-full hover:bg-orange-100 transition cursor-pointer"
                              title="Clear search"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        
                        {/* Recover Last Deleted Contact Button */}
                        <button 
                          type="button"
                          onClick={() => handleRecoverLastDeleted('addressbook')}
                          disabled={!lastDeletedAddressBookItem}
                          className={`flex-shrink-0 px-2.5 sm:px-3 py-2 rounded-xl border transition-all flex items-center justify-center gap-1.5 font-bold text-xs group ${
                            lastDeletedAddressBookItem
                              ? 'bg-amber-100 hover:bg-amber-200 border-amber-300 text-amber-950 shadow-sm active:scale-95 cursor-pointer'
                              : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-50'
                          }`}
                          title={
                            lastDeletedAddressBookItem
                              ? `Recover last deleted contact: "${lastDeletedAddressBookItem.title}"`
                              : 'No deleted contact to recover'
                          }
                        >
                          <RotateCcw className={`w-3.5 h-3.5 ${lastDeletedAddressBookItem ? 'text-amber-800' : 'text-gray-400'}`}/>
                          <span className="hidden sm:inline tracking-wide font-black">Recover</span>
                        </button>

                        {/* Duplicates Toggle Button */}
                        {addressBookDuplicateWarnings.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setShowOnlyAddressBookDuplicates(prev => !prev)}
                            className={`flex-shrink-0 px-2 sm:px-2.5 py-2 rounded-xl border transition-all flex items-center justify-center gap-1 font-bold text-xs active:scale-95 cursor-pointer ${
                              showOnlyAddressBookDuplicates
                                ? 'bg-amber-800 text-white border-amber-900 shadow-sm'
                                : 'bg-amber-100 hover:bg-amber-200 border-amber-300 text-amber-950'
                            }`}
                            title={showOnlyAddressBookDuplicates ? 'Show All Contacts' : `Show ${addressBookDuplicateIds.size} Duplicate Contacts`}
                          >
                            <TriangleAlert className="w-3.5 h-3.5 text-amber-600" />
                            <span className="hidden sm:inline font-black text-[10px] uppercase tracking-wider">
                              {showOnlyAddressBookDuplicates ? 'All' : `Dups (${addressBookDuplicateIds.size})`}
                            </span>
                          </button>
                        )}

                        <button 
                          onClick={() => {
                            setIsCreating(true);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className="flex-shrink-0 bg-gradient-to-br from-orange-500 to-rose-600 hover:from-orange-600 hover:to-rose-700 text-white px-3 sm:px-3.5 py-2 rounded-xl shadow-sm shadow-orange-500/20 border border-orange-400/50 transition-all transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-1.5 font-bold text-xs group cursor-pointer"
                          title="Add New Address Book Entry"
                        >
                          <Plus className="w-3.5 h-3.5 group-hover:rotate-90 transition-transform duration-300"/>
                          <span className="hidden sm:inline tracking-wide font-black">Add Entry</span>
                        </button>
                      </div>

                      {addressBookSearchQuery.length > 0 && (
                        <div className="pointer-events-auto w-full bg-gradient-to-r from-orange-600 to-rose-600 border border-orange-700 text-white text-xs px-3.5 py-2 rounded-xl shadow-lg font-bold flex items-center justify-between animate-fade-in">
                          <span className="flex items-center gap-2 truncate mr-2">
                            <Search className="w-4 h-4 flex-shrink-0 text-orange-200" />
                            <span className="truncate">
                              Searching: <span className="underline decoration-white/60 font-black">"{addressBookSearchQuery}"</span>
                            </span>
                            <span className="px-2 py-0.5 bg-white/20 rounded-full text-[10px] font-black shrink-0">
                              {filteredNotesForSelectedDate.length} {filteredNotesForSelectedDate.length === 1 ? 'match' : 'matches'}
                            </span>
                          </span>
                          <button 
                            type="button" 
                            onClick={() => setAddressBookSearchQuery('')} 
                            className="flex-shrink-0 text-white hover:text-rose-100 bg-white/20 hover:bg-white/30 px-2 py-1 rounded-lg text-[10px] font-black transition-colors flex items-center gap-1 cursor-pointer" 
                            title="Clear search"
                          >
                            <X className="w-3 h-3" />
                            <span>CLEAR</span>
                          </button>
                        </div>
                      )}
                     
                     <div className="pointer-events-auto flex flex-col items-end gap-2 w-full">
                       <div className="flex items-center justify-end gap-2 w-full">
                         <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-100 border border-amber-300 rounded-xl shadow-md shadow-amber-500/20 h-[30px]">
                           <span className="text-[9px] font-bold text-amber-700 uppercase tracking-wider">From:</span>
                           <input 
                             type="date" 
                             value={csvStartDate} 
                             onChange={e => {
                               setCsvStartDate(e.target.value);
                               safeLocalStorage.setItem('INFLUENCER_MANAGER_CSV_START_DATE', e.target.value);
                             }}
                             className="text-[9px] font-bold text-amber-900 bg-transparent outline-none cursor-pointer p-0 m-0 leading-none h-full"
                           />
                         </div>
                         {addressBookTotalSampleCost > 0 && (
                           <div className="flex items-center h-[30px] px-3 bg-rose-100 text-rose-900 border border-rose-300 rounded-xl text-[10px] font-black shadow-md shadow-rose-500/20 uppercase tracking-wider">
                             COST: ₹{addressBookTotalSampleCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                           </div>
                         )}
                       </div>
                       {/* Floating Address Book Notification for Extraction */}
                       {extractionMessage && (
                         <div 
                           id="floating-extraction-banner"
                           className={`w-full p-2.5 rounded-xl border text-[11px] font-bold flex items-center justify-between gap-2 shadow-lg transition-all animate-fade-in ${
                             extractionMessage.type === 'success'
                               ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                               : 'bg-rose-50 border-rose-300 text-rose-950'
                           }`}
                         >
                           <div className="flex items-center gap-1.5 truncate min-w-0">
                             <span className="text-sm flex-shrink-0">{extractionMessage.type === 'success' ? '✅' : '⚠️'}</span>
                             <span className="truncate">{extractionMessage.text}</span>
                           </div>
                           <div className="flex items-center gap-1.5 shrink-0">
                             {extractionMessage.url && (
                               <button
                                 type="button"
                                 onClick={() => handleOpenDriveSheet(extractionMessage.url)}
                                 className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer shadow-sm"
                                 title="Open Sheet in Google Drive"
                               >
                                 <ExternalLink className="w-3 h-3" />
                                 <span>Open</span>
                               </button>
                             )}
                             <button
                               type="button"
                               onClick={() => setExtractionMessage(null)}
                               className="text-gray-400 hover:text-gray-700 p-0.5 rounded cursor-pointer"
                               title="Dismiss"
                             >
                               <X className="w-3.5 h-3.5" />
                             </button>
                           </div>
                         </div>
                       )}
                       <div className="flex items-center justify-end gap-2 w-full flex-wrap">
                         <button
                           onClick={() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' })}
                           className="flex items-center justify-center w-[30px] h-[30px] bg-indigo-600 hover:bg-indigo-700 text-white border border-indigo-700 rounded-xl transition-all shadow-md shadow-indigo-500/30 hover:shadow-indigo-500/40 hover:-translate-y-0.5"
                           title="Scroll to Bottom"
                         >
                           <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>
                         </button>
                         <button
                           onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                           className="flex items-center justify-center w-[30px] h-[30px] bg-violet-600 hover:bg-violet-700 text-white border border-violet-700 rounded-xl transition-all shadow-md shadow-violet-500/30 hover:shadow-violet-500/40 hover:-translate-y-0.5"
                           title="Scroll to Top"
                         >
                           <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>
                         </button>
                         <button
                           onClick={handleDownloadSamplesCSV}
                           className="flex items-center justify-center w-[30px] h-[30px] bg-blue-600 hover:bg-blue-700 text-white border border-blue-700 rounded-xl transition-all shadow-md shadow-blue-500/30 hover:shadow-blue-500/40 hover:-translate-y-0.5"
                           title="Download Samples CSV"
                           aria-label="Download Samples CSV"
                         >
                           <Download className="w-3.5 h-3.5" />
                         </button>
                         <button
                           type="button"
                           onClick={handleExtractSamplesToGoogleSheets}
                           disabled={isExtractingSheets}
                           className="flex items-center justify-center w-[30px] h-[30px] bg-blue-600 hover:bg-blue-700 text-white border border-blue-700 rounded-xl transition-all shadow-md shadow-blue-500/30 hover:shadow-blue-500/40 hover:-translate-y-0.5 disabled:opacity-50 cursor-pointer"
                           title={isExtractingSheets ? 'Extracting...' : 'Extract Samples to Google Drive / Sheets'}
                           aria-label="Extract Samples to Google Drive / Sheets"
                           id="samples-google-drive-extraction-btn"
                         >
                           <Cloud className={`w-3.5 h-3.5 ${isExtractingSheets ? 'animate-pulse' : ''}`} />
                         </button>
                         {extractionMessage?.url && (
                           <button
                             type="button"
                             onClick={() => handleOpenDriveSheet(extractionMessage.url)}
                             className="flex items-center justify-center w-[30px] h-[30px] bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white border border-emerald-700 rounded-xl transition-all shadow-md shadow-emerald-500/30 hover:-translate-y-0.5 cursor-pointer"
                             title="Open Extracted Spreadsheet in Google Drive"
                             aria-label="Open Extracted Spreadsheet in Google Drive"
                             id="open-drive-sheet-floating-btn"
                           >
                             <ExternalLink className="w-3.5 h-3.5" />
                           </button>
                         )}
                         <button
                           onClick={handleAddAllToCreatorDatabase}
                           className="flex items-center justify-center w-[30px] h-[30px] bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 rounded-xl transition-all shadow-md shadow-emerald-500/30 hover:shadow-emerald-500/40 hover:-translate-y-0.5"
                           title="Add All to Creator Database"
                           aria-label="Add All to Creator Database"
                         >
                           <UserPlus className="w-3.5 h-3.5" />
                         </button>
                       </div>
                     </div>
                   </div>,
                   document.body
                 )}
               </div>
             )}
          </div>
          <div className="flex-1 overflow-y-auto space-y-4 pr-1 relative z-10">
            {/* Google Sheets extraction alert message */}
            {extractionMessage && (
              <div
                className={`mb-4 p-4 rounded-xl border flex items-center justify-between transition-all ${
                  extractionMessage.type === 'success' 
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">{extractionMessage.type === 'success' ? '✅' : '❌'}</span>
                  <div>
                    <p className="text-xs font-bold leading-normal">{extractionMessage.text}</p>
                    {extractionMessage.type === 'success' && (
                      <p className="text-[10px] text-emerald-600 font-medium">Your samples data has been saved as a spreadsheet in your Google Drive.</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  {extractionMessage.url && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleOpenDriveSheet(extractionMessage.url)}
                        className="text-xs bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black py-1.5 px-3 rounded-lg shadow transition flex items-center gap-1.5 cursor-pointer uppercase tracking-wider"
                        title="Open Spreadsheet in Google Drive"
                        id="open-drive-sheet-notes-btn"
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> OPEN DRIVE SHEET
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (extractionMessage.url) {
                            navigator.clipboard.writeText(extractionMessage.url);
                            alert('Spreadsheet link copied to clipboard!');
                          }
                        }}
                        className="text-xs bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold py-1.5 px-2.5 rounded-lg shadow-sm transition flex items-center gap-1 cursor-pointer"
                        title="Copy Link"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setExtractionMessage(null)}
                    className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer"
                    title="Dismiss"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
            {/* Duplicate Entries Detected Banner for Address Book */}
            {selectedDate.includes('-AddressBook') && addressBookDuplicateWarnings.length > 0 && (
              <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-2xl shadow-sm mb-4">
                <div className="flex items-start gap-3">
                  <TriangleAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-black text-amber-900">Duplicate Entries Detected</h3>
                        <span className="text-[10px] font-black bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full uppercase tracking-wider">
                          {addressBookDuplicateWarnings.length} {addressBookDuplicateWarnings.length === 1 ? 'conflict' : 'conflicts'} ({addressBookDuplicateIds.size} entries)
                        </span>
                      </div>
                      <div className="flex gap-2 self-start flex-wrap">
                        <button
                          type="button"
                          onClick={() => setShowOnlyAddressBookDuplicates(prev => !prev)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-black rounded-xl shadow-sm transition active:scale-95 cursor-pointer ${
                            showOnlyAddressBookDuplicates
                              ? 'bg-amber-900 text-amber-50 hover:bg-amber-800'
                              : 'bg-amber-200 text-amber-900 hover:bg-amber-300'
                          }`}
                        >
                          {showOnlyAddressBookDuplicates ? 'SHOW ALL CONTACTS' : 'SHOW ONLY DUPLICATES'}
                        </button>
                        <button
                          type="button"
                          onClick={handleAddressBookMergeToLatestRestored}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-fuchsia-600 hover:bg-fuchsia-700 text-white text-xs font-black rounded-xl shadow-sm transition active:scale-95 cursor-pointer"
                          title="Merge duplicates into the most recently restored or updated entries"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          Merge to Latest Restored
                        </button>
                        <button
                          type="button"
                          onClick={handleAddressBookMergeAllDuplicates}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-black rounded-xl shadow-sm transition active:scale-95 cursor-pointer"
                          title="Merge all duplicates combining contact details, profile links, and samples"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Merge All Duplicates
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-amber-800 mt-1 font-semibold">
                      Please review the following duplicates to avoid data fragmentation:
                    </p>
                    <ul className="mt-2 space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {addressBookDuplicateWarnings.map(warning => (
                        <li key={warning.key} className="text-xs text-amber-900 flex items-center justify-between gap-2 bg-amber-100/60 p-2 rounded-xl border border-amber-200/80">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-2 h-2 bg-amber-500 rounded-full inline-block shrink-0" />
                            <span className="truncate">
                              <strong className="font-black text-amber-950">{warning.names}</strong>: {warning.reason}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm(`Merge this group of duplicate contacts for "${warning.names}"?`)) {
                                executeAddressBookMerge(false, warning.group);
                              }
                            }}
                            className="text-[10px] font-black uppercase tracking-wider text-amber-900 hover:text-white bg-amber-200 hover:bg-amber-700 px-2.5 py-1 rounded-lg transition shrink-0 active:scale-95 cursor-pointer shadow-xs"
                            title="Merge this group of duplicate contacts"
                          >
                            Merge Group
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {isCreating ? (
              <form onSubmit={handleSaveNote} className="space-y-3 bg-white/60 backdrop-blur-sm p-5 rounded-2xl border border-orange-200 shadow-sm">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-black text-rose-600 uppercase tracking-widest">{editingNote ? '✏️ Edit Note' : '✨ New Note'}</span>
                  <button type="button" onClick={() => { setIsCreating(false); setEditingNote(null); }} className="text-orange-400 hover:text-orange-600 bg-white rounded-full p-1 shadow-sm"><X className="w-4 h-4"/></button>
                </div>
                <input 
                  type="text" 
                  value={noteTitle} 
                  onChange={e => setNoteTitle(e.target.value)} 
                  placeholder="Note Title"
                  className="w-full text-base font-black bg-white px-4 py-3 border-2 border-orange-100 rounded-xl outline-none focus:ring-4 focus:ring-orange-200 focus:border-orange-400 text-orange-900 placeholder:text-orange-300 shadow-inner"
                  required
                  list="note-title-options"
                />
                <datalist id="note-title-options">
                  <option value="TASK FOR RECOVERY" />
                </datalist>
                
                {selectedDate.includes('-MonthlyTarget') && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={noteTargetMonth}
                        onChange={e => setNoteTargetMonth(e.target.value)}
                        className="w-full text-sm font-bold bg-white px-4 py-3 border-2 border-orange-100 rounded-xl outline-none focus:ring-4 focus:ring-orange-200 focus:border-orange-400 text-orange-900 shadow-inner"
                      >
                        <option value="">-- Select Month --</option>
                        {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map(m => (
                           <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                      <select
                        value={noteTargetYear}
                        onChange={e => setNoteTargetYear(e.target.value)}
                        className="w-full text-sm font-bold bg-white px-4 py-3 border-2 border-orange-100 rounded-xl outline-none focus:ring-4 focus:ring-orange-200 focus:border-orange-400 text-orange-900 shadow-inner"
                      >
                        <option value="">-- Select Year --</option>
                        {['2024', '2025', '2026', '2027', '2028', '2029', '2030'].map(y => (
                           <option key={y} value={y}>{y}</option>
                        ))}
                      </select>
                    </div>
                    {/* Legacy single product fields for backward compatibility, optionally we can hide this if we migrate everything */}
                    <div className="space-y-3 p-4 bg-orange-50/50 rounded-xl border border-orange-100">
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-xs font-black text-orange-800 uppercase tracking-widest">TARGET 1</label>
                      </div>
                      <select
                        value={noteTargetProduct}
                        onChange={e => setNoteTargetProduct(e.target.value)}
                        className="w-full text-sm font-bold bg-white px-4 py-3 border-2 border-orange-100 rounded-xl outline-none focus:ring-4 focus:ring-orange-200 focus:border-orange-400 text-orange-900 shadow-inner"
                      >
                        <option value="">-- Select Target Product --</option>
                        {wizardProducts.map(p => (
                           <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                      <div className="grid grid-cols-2 gap-2">
                        <input 
                          type="number" 
                          value={noteTargetSalesRevenue} 
                          onChange={e => setNoteTargetSalesRevenue(e.target.value)} 
                          placeholder="Sales Revenue (e.g. 50000)" 
                          className="w-full text-sm font-bold bg-white px-4 py-3 border-2 border-orange-100 rounded-xl outline-none focus:ring-4 focus:ring-orange-200 focus:border-orange-400 text-orange-900 placeholder:text-orange-300 shadow-inner"
                        />
                        <input 
                          type="number" 
                          value={noteTargetVideos} 
                          onChange={e => setNoteTargetVideos(e.target.value)} 
                          placeholder="Videos (e.g. 10)" 
                          className="w-full text-sm font-bold bg-white px-4 py-3 border-2 border-orange-100 rounded-xl outline-none focus:ring-4 focus:ring-orange-200 focus:border-orange-400 text-orange-900 placeholder:text-orange-300 shadow-inner"
                        />
                      </div>
                    </div>
                    
                    {noteProductTargets.map((pt: any, idx: number) => (
                      <div key={idx} className="space-y-3 p-4 bg-orange-50/50 rounded-xl border border-orange-100 relative">
                        <div className="flex justify-between items-center mb-2">
                          <label className="text-xs font-black text-orange-800 uppercase tracking-widest">TARGET {idx + 2}</label>
                          <button 
                            type="button" 
                            onClick={() => setNoteProductTargets(prev => prev.filter((_, i) => i !== idx))}
                            className="text-red-400 hover:text-red-600 p-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <select
                          value={pt.productName}
                          onChange={e => {
                            const newTargets = [...noteProductTargets];
                            newTargets[idx].productName = e.target.value;
                            setNoteProductTargets(newTargets);
                          }}
                          className="w-full text-sm font-bold bg-white px-4 py-3 border-2 border-orange-100 rounded-xl outline-none focus:ring-4 focus:ring-orange-200 focus:border-orange-400 text-orange-900 shadow-inner"
                        >
                          <option value="">-- Select Target Product --</option>
                          {wizardProducts.map(p => (
                             <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                        <div className="grid grid-cols-2 gap-2">
                          <input 
                            type="number" 
                            value={pt.salesRevenue} 
                            onChange={e => {
                              const newTargets = [...noteProductTargets];
                              newTargets[idx].salesRevenue = e.target.value;
                              setNoteProductTargets(newTargets);
                            }}
                            placeholder="Sales Revenue" 
                            className="w-full text-sm font-bold bg-white px-4 py-3 border-2 border-orange-100 rounded-xl outline-none focus:ring-4 focus:ring-orange-200 focus:border-orange-400 text-orange-900 placeholder:text-orange-300 shadow-inner"
                          />
                          <input 
                            type="number" 
                            value={pt.videos} 
                            onChange={e => {
                              const newTargets = [...noteProductTargets];
                              newTargets[idx].videos = e.target.value;
                              setNoteProductTargets(newTargets);
                            }}
                            placeholder="Videos" 
                            className="w-full text-sm font-bold bg-white px-4 py-3 border-2 border-orange-100 rounded-xl outline-none focus:ring-4 focus:ring-orange-200 focus:border-orange-400 text-orange-900 placeholder:text-orange-300 shadow-inner"
                          />
                        </div>
                      </div>
                    ))}
                    
                    {noteProductTargets.length < 5 && (
                      <button 
                        type="button"
                        onClick={() => setNoteProductTargets(prev => [...prev, { productName: '', salesRevenue: '', videos: '' }])}
                        className="w-full py-2 border-2 border-dashed border-orange-300 text-orange-600 rounded-xl text-xs font-bold hover:bg-orange-50 hover:border-orange-400 transition flex items-center justify-center gap-2"
                      >
                        <Plus className="w-4 h-4" /> Add Product Target (Max 6 total)
                      </button>
                    )}
                  </>
                )}
                
                {selectedDate.includes('-AddressBook') && (
                  <>
                    <input 
                      type="text" 
                      value={noteCreatorName} 
                      onChange={e => setNoteCreatorName(e.target.value)} 
                      placeholder="Creator Name (e.g. John Doe)" 
                      className="w-full text-sm font-bold bg-white px-4 py-3 border-2 border-orange-100 rounded-xl outline-none focus:ring-4 focus:ring-orange-200 focus:border-orange-400 text-orange-900 placeholder:text-orange-300 shadow-inner"
                    />
                    <input
                      type="number"
                      value={noteCostPerPost}
                      onChange={e => setNoteCostPerPost(e.target.value)}
                      placeholder="Cost Per Post (e.g. 5000)"
                      className="w-full text-sm font-bold bg-white px-4 py-3 border-2 border-orange-100 rounded-xl outline-none focus:ring-4 focus:ring-orange-200 focus:border-orange-400 text-orange-900 placeholder:text-orange-300 shadow-inner"
                    />
                    <input 
                      type="text" 
                      value={noteMobileNumber} 
                       onChange={e => setNoteMobileNumber(e.target.value)}
                       placeholder="Mobile Number (e.g. +919876543210)"
                       className="w-full text-sm font-bold bg-white px-4 py-3 border-2 border-orange-100 rounded-xl outline-none focus:ring-4 focus:ring-orange-200 focus:border-orange-400 text-orange-900 placeholder:text-orange-300 shadow-inner"
                    />
                    <input 
                       type="url" 
                       value={noteInstagram} 
                       onChange={e => setNoteInstagram(e.target.value)} 
                       placeholder="Instagram Profile URL" 
                       className="w-full text-sm font-bold bg-white px-4 py-3 border-2 border-orange-100 rounded-xl outline-none focus:ring-4 focus:ring-orange-200 focus:border-orange-400 text-orange-900 placeholder:text-orange-300 shadow-inner"
                    />
                    <input 
                       type="url" 
                       value={noteFacebook} 
                       onChange={e => setNoteFacebook(e.target.value)} 
                       placeholder="Facebook Profile URL" 
                       className="w-full text-sm font-bold bg-white px-4 py-3 border-2 border-orange-100 rounded-xl outline-none focus:ring-4 focus:ring-orange-200 focus:border-orange-400 text-orange-900 placeholder:text-orange-300 shadow-inner"
                    />
                    <input 
                       type="url" 
                       value={noteYoutube} 
                       onChange={e => setNoteYoutube(e.target.value)} 
                       placeholder="YouTube Channel URL" 
                       className="w-full text-sm font-bold bg-white px-4 py-3 border-2 border-orange-100 rounded-xl outline-none focus:ring-4 focus:ring-orange-200 focus:border-orange-400 text-orange-900 placeholder:text-orange-300 shadow-inner"
                    />
                    <textarea
                      value={noteAddress} 
                      onChange={e => setNoteAddress(e.target.value)} 
                      placeholder="Full Address..." 
                      className="w-full text-sm font-bold bg-white px-4 py-3 border-2 border-orange-100 rounded-xl outline-none focus:ring-4 focus:ring-orange-200 focus:border-orange-400 h-20 resize-none text-orange-900 placeholder:text-orange-300 shadow-inner"
                    />
                  </>
                )}

                {!selectedDate.includes('-MonthlyTarget') && (
                  <textarea 
                    value={noteContent} 
                    onChange={e => setNoteContent(e.target.value)} 
                    placeholder="Write your note here..." 
                    className="w-full text-sm font-bold bg-white px-4 py-3 border-2 border-orange-100 rounded-xl outline-none focus:ring-4 focus:ring-orange-200 focus:border-orange-400 h-32 resize-none text-orange-900 placeholder:text-orange-300 shadow-inner"
                    required={!selectedDate.includes('-AddressBook')}
                  />
                )}
                <button type="submit" className="w-full bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600 text-white font-black py-3 rounded-xl text-sm transition shadow-md hover:shadow-lg transform hover:-translate-y-0.5 uppercase tracking-wider">
                  {editingNote ? 'Update Note' : 'Save Note'}
                </button>
              </form>
            ) : (
              <div className="space-y-4">
              {selectedDate === 'Global-TaskRecovery' && !isCreating && (
                <button
                  onClick={() => {
                     const newNote = {
                        id: 'note_' + Math.random().toString(36).substring(2, 11),
                        title: 'TASK FOR RECOVERY',
                        content: JSON.stringify(tasks || []),
                        date: 'Global-TaskRecovery',
                        lastUpdated: new Date().toISOString(),
                        pinned: false,
                        keywords: [],
                     };
                     setNotes(prev => [newNote, ...prev]);
                     alert("Tasks successfully backed up to recovery note.");
                  }}
                  className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-black py-4 rounded-xl text-sm transition shadow-md active:scale-95 flex items-center justify-center gap-2 uppercase tracking-widest"
                >
                  <Download className="w-5 h-5" /> CREATE NEW RECOVERY BACKUP
                </button>
              )}
              {notesForSelectedDate.length === 0 ? (
                <div className="text-center py-12 opacity-60 space-y-3">
                  <div className="w-16 h-16 mx-auto bg-orange-200 rounded-full flex items-center justify-center">
                     <FileText className="w-8 h-8 text-orange-500" />
                  </div>
                  <p className="text-sm font-black text-orange-800 tracking-wide">No notes for this date.</p>
                </div>
              ) : (
                notesForSelectedDate.map(note => (
                  <div key={note.id} className={`p-5 bg-white/80 backdrop-blur border-2 ${selectedDate.includes('-AddressBook') && addressBookDuplicateIds.has(note.id) ? 'border-amber-400 ring-2 ring-amber-400/30 shadow-amber-500/10' : 'border-orange-100'} rounded-2xl group relative shadow-sm hover:shadow-md transition-all`}>
                    {note.title && note.title.toUpperCase().includes('TASK FOR RECOVERY') ? (
                      <div className="bg-orange-100 border border-orange-200 rounded-lg p-4 relative">
                        <p className="text-sm font-bold text-red-600 mb-4">
                          Last Backup: {note.lastUpdated ? new Date(note.lastUpdated).toLocaleString('en-GB') : 'Available'}
                        </p>
                        
                        <div className="flex flex-col gap-3">
                          <button
                            onClick={() => handleRestoreFromRecovery(note)}
                            className="inline-flex justify-center items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-md active:scale-95"
                          >
                            <RefreshCw className="w-4 h-4 animate-pulse" /> Restore Tasks to Monthly Planner
                          </button>
                        </div>

                        <div className="absolute top-4 right-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleDeleteNote(note.id)}
                            className="p-1.5 text-orange-400 hover:text-red-600 hover:bg-red-50 bg-white shadow-sm rounded-lg transition"
                            title="Delete Backup"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {selectedDate.includes('-AddressBook') && addressBookDuplicateIds.has(note.id) && (
                          <div className="mb-3 flex items-center justify-between gap-2 flex-wrap bg-amber-50 border border-amber-300 p-2.5 rounded-xl shadow-xs">
                            <div className="flex items-center gap-1.5 text-xs font-black text-amber-900">
                              <TriangleAlert className="w-4 h-4 text-amber-600 shrink-0" />
                              <span>Duplicate Contact Detected</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const matchingWarning = addressBookDuplicateWarnings.find(w => w.group.some(g => g.id === note.id));
                                if (matchingWarning) {
                                  if (window.confirm(`Merge duplicate contacts matching "${matchingWarning.names}"?`)) {
                                    executeAddressBookMerge(false, matchingWarning.group);
                                  }
                                }
                              }}
                              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-black uppercase tracking-wider rounded-lg shadow-sm transition active:scale-95 cursor-pointer"
                              title="Merge this duplicate contact with its matching entry"
                            >
                              Merge Contact
                            </button>
                          </div>
                        )}
                        <h4 className="font-black text-base text-rose-700 mb-1 pr-16 leading-tight">{note.title}</h4>
                    {note.creatorName && (
                      <p className="text-sm font-bold text-orange-900/90 mb-1 flex items-center gap-2">
                        <span>👤</span> {note.creatorName}
                      </p>
                    )}
                    {note.address && (
                      <p className="text-xs font-semibold text-orange-800/80 mb-1 flex items-start gap-2">
                        <span>📍</span> {note.address}
                      </p>
                    )}
                    {note.costPerPost !== undefined && (
                      <div className="flex items-center gap-2 mb-3 mt-2">
                        <span className="text-xs font-semibold text-orange-800/80">💰 ₹{note.costPerPost} Cost Per Post</span>
                      </div>
                    )}
                    {note.mobileNumber ? (
                      <div className="flex items-center gap-2 mb-3 mt-2">
                        <span className="text-xs font-semibold text-orange-800/80">📱 {note.mobileNumber}</span>
                        <button 
                          type="button"
                          onClick={() => {
                            openWhatsAppChat({
                              phoneNumber: note.mobileNumber!,
                              preferApp: true,
                              contactName: note.influencerName || 'Creator'
                            });
                          }}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#25D366] hover:bg-[#128C7E] text-white rounded-lg text-[10px] font-black transition shadow-sm hover:shadow-md uppercase tracking-wider ml-auto cursor-pointer"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          Message on WhatsApp
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 mb-3 mt-2">
                        <button
                          type="button"
                          onClick={() => {
                            const matchedInf = influencers?.find((i: any) => 
                              (note.creatorName && i.name?.toLowerCase() === note.creatorName.toLowerCase()) ||
                              (note.title && i.name?.toLowerCase() === note.title.toLowerCase())
                            );
                            triggerUpdateWhatsAppModal({
                              influencerId: matchedInf?.id || note.id,
                              influencerName: note.creatorName || note.title || 'Addressbook Contact',
                              influencerAvatar: matchedInf?.avatar,
                              influencerHandle: matchedInf?.handle,
                              currentMobile: '',
                              contextTitle: 'Addressbook WhatsApp Contact',
                              onSuccess: (savedNum) => {
                                if (setNotes) {
                                  setNotes((prev: any[]) => prev.map(n => n.id === note.id ? { ...n, mobileNumber: savedNum } : n));
                                }
                              }
                            });
                          }}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 rounded-lg text-[10px] font-black transition shadow-xs uppercase tracking-wider ml-auto cursor-pointer"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>Add WhatsApp Contact</span>
                        </button>
                      </div>
                    )}
                    
                    {selectedDate.includes('-MonthlyTarget') ? (
                      <div className="flex flex-col gap-3 mb-3 mt-2 bg-indigo-50/50 p-4 rounded-2xl border border-indigo-200 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100 pb-2.5">
                          <span className="text-sm font-black text-indigo-900 bg-indigo-100/90 px-3 py-1.5 rounded-xl uppercase tracking-wider flex items-center gap-1.5 shadow-xs">
                            <span>🗓️</span> {note.targetMonth || 'No Month'} {note.targetYear || 'No Year'}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleOpenSendTargetModal(note, 'all')}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-700 hover:to-pink-700 text-white rounded-xl text-xs font-black transition shadow-xs hover:shadow-md uppercase tracking-wider cursor-pointer"
                            title="Send all targets in this note to set ANY month's monthly target"
                          >
                            <Target className="w-3.5 h-3.5" />
                            <span>Send Targets to Any Month</span>
                          </button>
                        </div>
                        
                        <div className="bg-white p-3.5 rounded-xl shadow-xs border border-indigo-100 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <h4 className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">TARGET 1</h4>
                            <button
                              type="button"
                              onClick={() => handleOpenSendTargetModal(note, 0)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white border border-indigo-200 hover:border-indigo-600 rounded-lg text-[10px] font-black transition cursor-pointer shadow-2xs"
                              title="Send Target 1 to set ANY month's monthly target"
                            >
                              <Target className="w-3 h-3" />
                              <span>Set Any Month Target</span>
                            </button>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-black text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-lg shadow-2xs">📦 {note.targetProduct || 'No Product'}</span>
                            <span className="text-xs font-black text-rose-700 bg-rose-50 border border-rose-100 px-2.5 py-1 rounded-lg shadow-2xs">💰 {note.targetSalesRevenue !== undefined && !isNaN(note.targetSalesRevenue) ? '₹' + note.targetSalesRevenue.toLocaleString() : 'No Revenue'}</span>
                            <span className="text-xs font-black text-blue-700 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-lg shadow-2xs">🎥 {note.targetVideos !== undefined && !isNaN(note.targetVideos) ? note.targetVideos + ' Videos' : 'No Videos'}</span>
                          </div>
                        </div>
                        
                        {note.productTargets && note.productTargets.map((pt: any, idx: number) => (
                          <div key={idx} className="bg-white p-3.5 rounded-xl shadow-xs border border-indigo-100 space-y-2.5">
                            <div className="flex items-center justify-between">
                              <h4 className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">TARGET {idx + 2}</h4>
                              <button
                                type="button"
                                onClick={() => handleOpenSendTargetModal(note, idx + 1)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white border border-indigo-200 hover:border-indigo-600 rounded-lg text-[10px] font-black transition cursor-pointer shadow-2xs"
                                title={`Send Target ${idx + 2} to set ANY month's monthly target`}
                              >
                                <Target className="w-3 h-3" />
                                <span>Set Any Month Target</span>
                              </button>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-black text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-lg shadow-2xs">📦 {pt.productName || 'No Product'}</span>
                              <span className="text-xs font-black text-rose-700 bg-rose-50 border border-rose-100 px-2.5 py-1 rounded-lg shadow-2xs">💰 {pt.salesRevenue !== undefined && !isNaN(pt.salesRevenue) ? '₹' + pt.salesRevenue.toLocaleString() : 'No Revenue'}</span>
                              <span className="text-xs font-black text-blue-700 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-lg shadow-2xs">🎥 {pt.videos !== undefined && !isNaN(pt.videos) ? pt.videos + ' Videos' : 'No Videos'}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (note.targetMonth || note.targetYear || note.targetProduct || note.targetSalesRevenue !== undefined || note.targetVideos !== undefined || (note.productTargets && note.productTargets.length > 0)) ? (
                      <div className="flex flex-col gap-3 mb-3 mt-2 bg-indigo-50/50 p-4 rounded-2xl border border-indigo-200 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100 pb-2.5">
                          <span className="text-sm font-black text-indigo-900 bg-indigo-100/90 px-3 py-1.5 rounded-xl uppercase tracking-wider flex items-center gap-1.5 shadow-xs">
                            <span>🗓️</span> {note.targetMonth} {note.targetYear}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleOpenSendTargetModal(note, 'all')}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-700 hover:to-pink-700 text-white rounded-xl text-xs font-black transition shadow-xs hover:shadow-md uppercase tracking-wider cursor-pointer"
                            title="Send all targets in this note to set ANY month's monthly target"
                          >
                            <Target className="w-3.5 h-3.5" />
                            <span>Send Targets to Any Month</span>
                          </button>
                        </div>
                        
                        {(note.targetProduct || note.targetSalesRevenue !== undefined || note.targetVideos !== undefined) && (
                          <div className="bg-white p-3.5 rounded-xl shadow-xs border border-indigo-100 space-y-2.5">
                            <div className="flex items-center justify-between">
                              <h4 className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">TARGET 1</h4>
                              <button
                                type="button"
                                onClick={() => handleOpenSendTargetModal(note, 0)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white border border-indigo-200 hover:border-indigo-600 rounded-lg text-[10px] font-black transition cursor-pointer shadow-2xs"
                                title="Send Target 1 to set ANY month's monthly target"
                              >
                                <Target className="w-3 h-3" />
                                <span>Set Any Month Target</span>
                              </button>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              {note.targetProduct && <span className="text-xs font-black text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-lg shadow-2xs">📦 {note.targetProduct}</span>}
                              {note.targetSalesRevenue !== undefined && <span className="text-xs font-black text-rose-700 bg-rose-50 border border-rose-100 px-2.5 py-1 rounded-lg shadow-2xs">💰 ₹{note.targetSalesRevenue.toLocaleString()} Revenue</span>}
                              {note.targetVideos !== undefined && <span className="text-xs font-black text-blue-700 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-lg shadow-2xs">🎥 {note.targetVideos} Videos</span>}
                            </div>
                          </div>
                        )}
                        
                        {note.productTargets && note.productTargets.map((pt: any, idx: number) => (
                          <div key={idx} className="bg-white p-3.5 rounded-xl shadow-xs border border-indigo-100 space-y-2.5">
                            <div className="flex items-center justify-between">
                              <h4 className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">TARGET {idx + 2}</h4>
                              <button
                                type="button"
                                onClick={() => handleOpenSendTargetModal(note, idx + 1)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white border border-indigo-200 hover:border-indigo-600 rounded-lg text-[10px] font-black transition cursor-pointer shadow-2xs"
                                title={`Send Target ${idx + 2} to set ANY month's monthly target`}
                              >
                                <Target className="w-3 h-3" />
                                <span>Set Any Month Target</span>
                              </button>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              {pt.productName && <span className="text-xs font-black text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-lg shadow-2xs">📦 {pt.productName}</span>}
                              {pt.salesRevenue !== undefined && <span className="text-xs font-black text-rose-700 bg-rose-50 border border-rose-100 px-2.5 py-1 rounded-lg shadow-2xs">💰 ₹{pt.salesRevenue.toLocaleString()} Revenue</span>}
                              {pt.videos !== undefined && <span className="text-xs font-black text-blue-700 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-lg shadow-2xs">🎥 {pt.videos} Videos</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    
                    {(note.instagramLink || note.facebookLink || note.youtubeLink) && (
                      <div className="flex items-center gap-3 mb-3 mt-2 flex-wrap">
                        {note.instagramLink && (
                           <a href={note.instagramLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-black text-pink-600 hover:text-pink-700 bg-pink-50 hover:bg-pink-100 px-2 py-1 rounded transition">
                             <Instagram className="w-3.5 h-3.5" /> Instagram
                           </a>
                        )}
                        {note.facebookLink && (
                           <a href={note.facebookLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-black text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded transition">
                             <Facebook className="w-3.5 h-3.5" /> Facebook
                           </a>
                        )}
                        {note.youtubeLink && (
                           <a href={note.youtubeLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-black text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-2 py-1 rounded transition">
                             <Youtube className="w-3.5 h-3.5" /> YouTube
                           </a>
                        )}
                      </div>
                    )}

{note.content && (
                      <div className={`text-xs font-bold text-orange-900/70 whitespace-pre-wrap mt-2 ${note.creatorName || note.mobileNumber ? 'pt-3 border-t border-orange-100/50' : ''}`}>
                        {note.content}
                      </div>
                    )}
                    
                    
                    
                    <div className="absolute top-4 right-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {(note.address || note.content) && (
                        <button 
                          onClick={() => navigator.clipboard.writeText(note.address ? note.address : note.content)} 
                          className="p-1.5 text-orange-400 hover:text-indigo-600 hover:bg-indigo-50 bg-white shadow-sm rounded-lg transition"
                          title="Copy"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      )}
                      <button onClick={() => handleStartEdit(note)} className="p-1.5 text-orange-400 hover:text-rose-600 hover:bg-orange-50 bg-white shadow-sm rounded-lg transition"><Edit3 className="w-4 h-4"/></button>
                      <button onClick={() => handleDeleteNote(note.id)} className="p-1.5 text-orange-400 hover:text-red-600 hover:bg-red-50 bg-white shadow-sm rounded-lg transition"><Trash2 className="w-4 h-4"/></button>
                    </div>

                    
                    {selectedDate.includes('-AddressBook') && (
                      <div className="mt-4 border-t border-orange-100/50 pt-3">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-[10px] font-black text-orange-600 uppercase tracking-widest">Sample Records</h4>
                          {addingSampleToNoteId !== note.id && (
                            <button
                              onClick={() => {
                                setAddingSampleToNoteId(note.id);
                                setEditingSampleId(null);
                                setSamplePlatform('PTG');
                                setSampleCost('');
                                setSampleOrderId('');
                                setSampleOrderDate('');
                                setSampleProduct('');
                                setSampleSubCategory('');
                              }}
                              className="text-[10px] font-black bg-orange-100 hover:bg-orange-200 text-orange-700 px-2 py-1 rounded transition"
                            >
                              + ADD SAMPLE
                            </button>
                          )}
                        </div>
                        
                        {note.sampleDetails && note.sampleDetails.length > 0 && (
                          <div className="space-y-2 mb-3">
                            {note.sampleDetails.map((sample: any) => (
                              <div key={sample.id} className="bg-orange-50 border border-orange-100 rounded p-2 text-xs relative group">
                                <div className="grid grid-cols-2 gap-1 text-[10px]">
                                  <div><span className="font-bold text-orange-500">Platform:</span> <span className="font-black text-orange-800">{sample.platform}</span></div>
                                  <div><span className="font-bold text-orange-500">Cost:</span> <span className="font-black text-orange-800">₹{sample.cost}</span></div>
                                  <div><span className="font-bold text-orange-500">Order ID:</span> <span className="font-black text-orange-800">{sample.orderId}</span></div>
                                  <div><span className="font-bold text-orange-500">Date:</span> <span className="font-black text-orange-800">{sample.orderDate ? formatDateToDMY(sample.orderDate) : ''}</span></div>
                                  {sample.product && (
                                    <div className="col-span-2"><span className="font-bold text-orange-500">Product:</span> <span className="font-black text-orange-800">{sample.product}</span></div>
                                  )}
                                  {sample.subCategory && (
                                    <div className="col-span-2"><span className="font-bold text-orange-500">Sub Category:</span> <span className="font-black text-orange-800">{sample.subCategory}</span></div>
                                  )}

                                  <div className="col-span-2 mt-1">
                                    <button
                                      onClick={() => handleSendToTask(sample)}
                                      className="text-[9px] font-black bg-emerald-100 hover:bg-emerald-200 text-emerald-700 px-2 py-1 rounded transition w-full text-left"
                                    >
                                      SEND TO TASK
                                    </button>
                                  </div>

                                </div>
                                <div className="absolute top-1 right-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => {
                                      setAddingSampleToNoteId(note.id);
                                      setEditingSampleId(sample.id);
                                      setSamplePlatform(sample.platform);
                                      setSampleCost(sample.cost?.toString() || '');
                                      setSampleOrderId(sample.orderId);
                                      setSampleOrderDate(sample.orderDate);
                                      setSampleProduct(sample.product || '');
                                      setSampleSubCategory(sample.subCategory || '');
                                    }}
                                    className="text-indigo-400 hover:text-indigo-600 p-1 bg-indigo-50/50 hover:bg-indigo-100 rounded shadow-sm transition-colors"
                                    title="Edit Sample"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => setSampleToDelete({noteId: note.id, sampleId: sample.id})}
                                    className="text-red-400 hover:text-red-600 p-1 bg-red-50/50 hover:bg-red-100 rounded shadow-sm transition-colors"
                                    title="Delete Sample"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {addingSampleToNoteId === note.id && (
                          <div className="bg-orange-50 p-3 rounded-lg border-2 border-orange-200/50 space-y-2 mt-2">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[9px] font-black text-orange-500 uppercase tracking-wider mb-1 block">Platform</label>
                                <select 
                                  value={samplePlatform}
                                  onChange={(e) => setSamplePlatform(e.target.value as any)}
                                  className="w-full text-xs font-bold border border-orange-200 rounded p-1 outline-none focus:border-orange-400"
                                >
                                  <option value="PTG">PTG</option>
                                  <option value="AMAJON">AMAJON</option>
                                  <option value="FLIPKART">FLIPKART</option>
                                  <option value="OTHER">OTHER</option>
                                </select>
                              </div>
                              <div>
                                <label className="text-[9px] font-black text-orange-500 uppercase tracking-wider mb-1 block">Cost</label>
                                <input 
                                  type="number" 
                                  value={sampleCost}
                                  onChange={(e) => setSampleCost(e.target.value)}
                                  placeholder="e.g. 500"
                                  className="w-full text-xs font-bold border border-orange-200 rounded p-1 outline-none focus:border-orange-400"
                                />
                              </div>
                              <div className="col-span-2">
                                <label className="text-[9px] font-black text-orange-500 uppercase tracking-wider mb-1 block">Product</label>
                                <select 
                                  value={sampleProduct}
                                  onChange={(e) => setSampleProduct(e.target.value)}
                                  className="w-full text-xs font-bold border border-orange-200 rounded p-1 outline-none focus:border-orange-400"
                                >
                                  <option value="">Select Product...</option>
                                  {wizardProducts.map(p => (
                                    <option key={p} value={p}>{p}</option>
                                  ))}
                                  <option value="OTHER">OTHER</option>
                                </select>
                              </div>
                              <div className="col-span-2">
                                <label className="text-[9px] font-black text-orange-500 uppercase tracking-wider mb-1 block">Sub Category</label>
                                <input 
                                  type="text" 
                                  value={sampleSubCategory}
                                  onChange={(e) => setSampleSubCategory(e.target.value)}
                                  placeholder="Sub category (optional)..."
                                  className="w-full text-xs font-bold border border-orange-200 rounded p-1 outline-none focus:border-orange-400"
                                />
                              </div>
                              <div className="col-span-2">
                                <label className="text-[9px] font-black text-orange-500 uppercase tracking-wider mb-1 block">Order ID</label>
                                <input 
                                  type="text" 
                                  value={sampleOrderId}
                                  onChange={(e) => setSampleOrderId(e.target.value)}
                                  placeholder="Order ID..."
                                  className="w-full text-xs font-bold border border-orange-200 rounded p-1 outline-none focus:border-orange-400"
                                />
                              </div>
                              <div className="col-span-2">
                                <label className="text-[9px] font-black text-orange-500 uppercase tracking-wider mb-1 block">Order Date</label>
                                <input 
                                  type="date" 
                                  value={sampleOrderDate}
                                  onChange={(e) => setSampleOrderDate(e.target.value)}
                                  className="w-full text-xs font-bold border border-orange-200 rounded p-1 outline-none focus:border-orange-400"
                                />
                              </div>
                            </div>
                            <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-orange-100">
                              <button onClick={() => { 
                                setAddingSampleToNoteId(null);
                                setEditingSampleId(null);
                                setSamplePlatform('PTG');
                                setSampleCost('');
                                setSampleOrderId('');
                                setSampleOrderDate('');
                                setSampleProduct('');
                                setSampleSubCategory('');
                              }} className="text-[10px] font-black text-gray-500 hover:text-gray-700 px-2 py-1">CANCEL</button>
                              <button onClick={() => handleSaveSample(note.id)} className="text-[10px] font-black bg-orange-500 hover:bg-orange-600 text-white px-3 py-1 rounded">SAVE</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="mt-4 pt-4 border-t-2 border-orange-100/50 flex flex-wrap items-center justify-end gap-2">
                       {selectedDate.includes('-AddressBook') && (
                         <button
                           type="button"
                           onClick={() => handleAddToCreatorDatabase(note)}
                           className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-emerald-400 to-teal-500 hover:from-emerald-500 hover:to-teal-600 text-white rounded-xl text-xs font-black transition shadow-sm hover:shadow-md uppercase tracking-wider cursor-pointer"
                         >
                           <UserPlus className="w-3.5 h-3.5" /> Add to Database
                         </button>
                       )}
                       
                       {(selectedDate.includes('-MonthlyTarget') || (note.targetMonth || note.targetYear || note.targetProduct || (note.productTargets && note.productTargets.length > 0))) && (
                         <>
                           <button
                             type="button"
                             onClick={() => handleSyncToMonthlyTargets(note)}
                             className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white rounded-xl text-xs font-black transition shadow-sm hover:shadow-md uppercase tracking-wider cursor-pointer"
                             title={`Send target to set ${note.targetMonth || ''} ${note.targetYear || ''} monthly target`}
                           >
                             <Target className="w-3.5 h-3.5" />
                             <span>Send to {note.targetMonth ? `${note.targetMonth} ${note.targetYear || ''}` : 'Designated Month'} Target</span>
                           </button>

                           <button
                             type="button"
                             onClick={() => handleOpenSendTargetModal(note)}
                             className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-pink-500 via-rose-500 to-amber-500 hover:from-pink-600 hover:to-amber-600 text-white rounded-xl text-xs font-black transition shadow-sm hover:shadow-md uppercase tracking-wider cursor-pointer ring-2 ring-amber-300/40"
                             title="Send this target to set ANY month's monthly target"
                           >
                             <CalendarIcon className="w-3.5 h-3.5" />
                             <span>Send to Any Month Target</span>
                           </button>
                         </>
                       )}

                       {!selectedDate.includes('-AddressBook') && !selectedDate.includes('-MonthlyTarget') && !(note.targetMonth || note.targetYear || note.targetProduct || (note.productTargets && note.productTargets.length > 0)) && (
                         <button
                           type="button"
                           onClick={() => handlePinAsFloating(note.content)}
                           className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-500 hover:to-amber-600 text-white rounded-xl text-xs font-black transition shadow-sm hover:shadow-md uppercase tracking-wider cursor-pointer"
                         >
                           <Pin className="w-3.5 h-3.5" /> Pin Global Flashing Note
                         </button>
                       )}
                    </div>
                  </>
                )}
                  </div>
                ))
              )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-r from-pink-500 via-rose-500 to-orange-500 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 bg-white/20 rounded-full blur-2xl -mr-10 -mt-10"></div>
        <div className="absolute bottom-0 left-0 w-40 h-40 bg-yellow-400/30 rounded-full blur-2xl -ml-10 -mb-10"></div>
        
        <h3 className="text-xl sm:text-2xl font-black text-white mb-6 uppercase tracking-widest flex items-center gap-3 drop-shadow-md relative z-10">
          <div className="p-2 bg-white/20 rounded-lg shadow-sm border border-white/30 backdrop-blur-sm">
            <FileText className="w-6 h-6 text-white" />
          </div>
          NEXT MONTH INFLUENCER VIDEO PLANNING
        </h3>
        <div className="relative z-10">
          <textarea
             value={planningNote}
             onChange={(e) => setPlanningNote(e.target.value)}
             placeholder="✨ Brainstorm and plan for next month... (Autosaves instantly)"
             className="w-full h-48 bg-white/95 backdrop-blur-md border-4 border-white/40 rounded-2xl p-5 text-base focus:outline-none focus:ring-4 focus:ring-yellow-300 focus:border-transparent resize-none font-black text-rose-900 placeholder:text-rose-300 shadow-inner"
          />
        </div>
      </div>

      {noteToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-red-50 border-4 border-red-500 rounded-3xl p-8 max-w-sm w-full shadow-2xl transform transition-all relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 rounded-full blur-2xl -mr-10 -mt-10"></div>
            
            <div className="relative z-10 flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4 border border-red-200 shadow-sm">
                <Trash2 className="w-8 h-8 text-red-600" />
              </div>
              <h3 className="text-xl font-black text-red-900 mb-2 tracking-tight">Delete Record?</h3>
              <p className="text-sm font-bold text-red-700/80 mb-6">Are you sure you want to delete this record? (You can recover it anytime using the "Recover" option or Ctrl+Z).</p>
              
              <div className="flex gap-3 w-full">
                <button 
                  onClick={() => setNoteToDelete(null)}
                  className="flex-1 px-4 py-3 bg-white border-2 border-red-200 text-red-700 rounded-xl font-black text-sm transition-all hover:bg-red-50 hover:border-red-300 active:scale-95 uppercase tracking-wider"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => confirmDeleteNote(noteToDelete)}
                  className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl font-black text-sm transition-all shadow-md hover:bg-red-700 hover:shadow-lg active:scale-95 uppercase tracking-wider"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {sampleToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-red-50 border-4 border-red-500 rounded-3xl p-8 max-w-sm w-full shadow-2xl transform transition-all relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 rounded-full blur-2xl -mr-10 -mt-10"></div>
            
            <div className="relative z-10 flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4 border border-red-200 shadow-sm">
                <Trash2 className="w-8 h-8 text-red-600" />
              </div>
              <h3 className="text-xl font-black text-red-900 mb-2 tracking-tight">Delete Sample Record?</h3>
              <p className="text-sm font-bold text-red-700/80 mb-6">Are you sure you want to delete this sample data? (You can recover it anytime using the "Recover" option or Ctrl+Z).</p>
              
              <div className="flex gap-3 w-full">
                <button 
                  onClick={() => setSampleToDelete(null)}
                  className="flex-1 px-4 py-3 bg-white border-2 border-red-200 text-red-700 rounded-xl font-black text-sm transition-all hover:bg-red-50 hover:border-red-300 active:scale-95 uppercase tracking-wider"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => handleDeleteSample(sampleToDelete.noteId, sampleToDelete.sampleId)}
                  className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl font-black text-sm transition-all shadow-md hover:bg-red-700 hover:shadow-lg active:scale-95 uppercase tracking-wider"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recovery Bin / Deleted Items History Modal */}
      {showRecoveryBinModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-orange-200 overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 p-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30">
                  <RotateCcw className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-black tracking-tight flex items-center gap-2">
                    Recovery Bin
                    <span className="text-xs bg-white/30 px-2 py-0.5 rounded-full font-bold">
                      {deletedItems.length} {deletedItems.length === 1 ? 'item' : 'items'}
                    </span>
                  </h3>
                  <p className="text-xs text-amber-100 font-medium">
                    Recover last deleted notes, address book contacts, and records anytime (or press Ctrl+Z)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowRecoveryBinModal(false)}
                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Filter Tabs */}
            <div className="px-5 py-3 bg-orange-50/60 border-b border-orange-100 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setRecoveryModalFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                    recoveryModalFilter === 'all'
                      ? 'bg-orange-600 text-white shadow-sm'
                      : 'bg-white text-orange-950 hover:bg-orange-100 border border-orange-200'
                  }`}
                >
                  All ({deletedItems.length})
                </button>
                <button
                  type="button"
                  onClick={() => setRecoveryModalFilter('addressbook')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                    recoveryModalFilter === 'addressbook'
                      ? 'bg-orange-600 text-white shadow-sm'
                      : 'bg-white text-orange-950 hover:bg-orange-100 border border-orange-200'
                  }`}
                >
                  Address Book ({deletedAddressBookItems.length})
                </button>
                <button
                  type="button"
                  onClick={() => setRecoveryModalFilter('calendar')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                    recoveryModalFilter === 'calendar'
                      ? 'bg-orange-600 text-white shadow-sm'
                      : 'bg-white text-orange-950 hover:bg-orange-100 border border-orange-200'
                  }`}
                >
                  Calendar Notes ({deletedCalendarItems.length})
                </button>
              </div>

              {deletedItems.length > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleRecoverAll(recoveryModalFilter)}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-lg shadow-sm transition active:scale-95 flex items-center gap-1.5 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Recover All</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleClearRecoveryHistory}
                    className="px-2.5 py-1.5 text-red-600 hover:bg-red-50 text-xs font-bold rounded-lg border border-red-200 transition"
                    title="Permanently remove all deleted history"
                  >
                    Clear History
                  </button>
                </div>
              )}
            </div>

            {/* List of Deleted Items */}
            <div className="p-5 overflow-y-auto flex-1 space-y-3">
              {(() => {
                const list = deletedItems.filter(item => {
                  if (recoveryModalFilter === 'addressbook') {
                    return item.type === 'contact' || item.type === 'bulk_addressbook' || (item.originalDate && item.originalDate.includes('-AddressBook'));
                  }
                  if (recoveryModalFilter === 'calendar') {
                    return item.type === 'note' && (!item.originalDate || !item.originalDate.includes('-AddressBook'));
                  }
                  return true;
                });

                if (list.length === 0) {
                  return (
                    <div className="py-12 text-center flex flex-col items-center justify-center text-gray-400">
                      <div className="w-14 h-14 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-center mb-3">
                        <RotateCcw className="w-7 h-7 text-orange-300" />
                      </div>
                      <p className="text-sm font-bold text-gray-700">No deleted items to recover</p>
                      <p className="text-xs text-gray-500 mt-1 max-w-sm">
                        Any note or address book entry you delete will appear here so you can recover it at any time.
                      </p>
                    </div>
                  );
                }

                return list.map((item) => {
                  const timeFormatted = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' on ' + new Date(item.timestamp).toLocaleDateString();

                  return (
                    <div
                      key={item.id}
                      className="bg-white rounded-2xl p-4 border border-orange-100 shadow-sm hover:shadow-md hover:border-orange-300 transition-all flex items-start justify-between gap-4"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
                            item.type === 'contact'
                              ? 'bg-purple-50 text-purple-700 border-purple-200'
                              : item.type === 'bulk_addressbook'
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : item.type === 'sample'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                          }`}>
                            {item.type === 'contact' ? 'Contact' : item.type === 'bulk_addressbook' ? 'Bulk Contacts' : item.type === 'sample' ? 'Sample Data' : 'Calendar Note'}
                          </span>

                          <span className="text-[10px] font-black text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">
                            {item.originalDate.includes('-AddressBook') ? 'Address Book' : item.originalDate}
                          </span>

                          <span className="text-[10px] font-semibold text-gray-400">
                            Deleted: {timeFormatted}
                          </span>
                        </div>

                        <h4 className="text-sm font-black text-gray-900 truncate">
                          {item.title}
                        </h4>

                        {item.previewText && (
                          <p className="text-xs text-gray-600 line-clamp-2 mt-1 font-medium bg-gray-50 p-2 rounded-lg border border-gray-100">
                            {item.previewText}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 self-center">
                        <button
                          type="button"
                          onClick={() => handleRecoverItem(item)}
                          className="px-3 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-xl font-black text-xs shadow-sm transition active:scale-95 flex items-center gap-1.5 cursor-pointer"
                          title="Restore this item"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Recover</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRemoveSingleHistoryItem(item.id)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                          title="Remove from recovery history"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
              <span className="font-medium">
                Tip: Press <kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded text-[11px] font-bold text-gray-700">Ctrl+Z</kbd> or <kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded text-[11px] font-bold text-gray-700">Cmd+Z</kbd> to quickly recover.
              </span>
              <button
                type="button"
                onClick={() => setShowRecoveryBinModal(false)}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-xl font-bold transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Quick-Undo Toast Banner */}
      {lastDeletedToast && (
        <div className="fixed bottom-6 right-6 z-[10000] max-w-md w-[calc(100vw-3rem)] bg-gray-950 text-white rounded-2xl p-4 shadow-2xl border border-gray-700 flex items-center justify-between gap-3 animate-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-red-500/20 border border-red-500/40 flex items-center justify-center shrink-0">
              <Trash2 className="w-5 h-5 text-red-400" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
                Deleted {lastDeletedToast.type === 'contact' ? 'Contact' : lastDeletedToast.type === 'bulk_addressbook' ? 'Address Book Entries' : lastDeletedToast.type === 'sample' ? 'Sample Data' : 'Calendar Note'}
              </p>
              <p className="text-sm font-black text-white truncate max-w-[200px] sm:max-w-xs">{lastDeletedToast.title}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleRecoverItem(lastDeletedToast)}
              className="px-3.5 py-2 bg-gradient-to-r from-amber-400 to-yellow-400 hover:from-amber-500 hover:to-yellow-500 text-gray-950 font-black text-xs rounded-xl shadow-md flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-gray-950" />
              <span>Recover Now</span>
            </button>
            <button
              type="button"
              onClick={() => setLastDeletedToast(null)}
              className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Success Notification Banner */}
      {recoverySuccessMessage && (
        <div className="fixed bottom-6 right-6 z-[10000] max-w-md w-[calc(100vw-3rem)] bg-emerald-950 text-white rounded-2xl p-4 shadow-2xl border border-emerald-500 flex items-center gap-3 animate-in slide-in-from-bottom-4 duration-300">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <p className="text-xs font-bold text-emerald-100 flex-1">{recoverySuccessMessage}</p>
          <button
            type="button"
            onClick={() => setRecoverySuccessMessage(null)}
            className="p-1 text-emerald-300 hover:text-white"
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Modal: Send Target to Set Any Month Monthly Target */}
      {sendTargetModal && sendTargetModal.isOpen && sendTargetModal.note && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-gradient-to-br from-white via-indigo-50/40 to-purple-50/40 border-2 border-indigo-500/40 rounded-3xl p-6 max-w-lg w-full shadow-2xl relative overflow-hidden space-y-5 animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-indigo-100 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="p-2.5 bg-indigo-600 text-white rounded-2xl shadow-md">
                  <Target className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-black text-slate-900 tracking-tight">Send Target to Set Monthly Target</h3>
                  <p className="text-xs text-indigo-700/80 font-medium">Deploy this target matrix to any destination month and year</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setSendTargetModal(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Target Selection: All Targets vs Individual Target */}
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-700 uppercase tracking-wider block">
                Target Scope to Deploy:
              </label>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setSendTargetModal(prev => prev ? { ...prev, selectedTargetIndex: 'all' } : null)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer border ${
                    sendTargetModal.selectedTargetIndex === 'all'
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-indigo-50'
                  }`}
                >
                  🚀 All Targets In Note
                </button>
                {sendTargetModal.note.targetProduct && (
                  <button
                    type="button"
                    onClick={() => setSendTargetModal(prev => prev ? { ...prev, selectedTargetIndex: 0 } : null)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer border ${
                      sendTargetModal.selectedTargetIndex === 0
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-indigo-50'
                    }`}
                  >
                    Target 1 ({sendTargetModal.note.targetProduct})
                  </button>
                )}
                {sendTargetModal.note.productTargets && sendTargetModal.note.productTargets.map((pt: any, idx: number) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSendTargetModal(prev => prev ? { ...prev, selectedTargetIndex: idx + 1 } : null)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer border ${
                      sendTargetModal.selectedTargetIndex === (idx + 1)
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-indigo-50'
                    }`}
                  >
                    Target {idx + 2} ({pt.productName || `Prod ${idx+2}`})
                  </button>
                ))}
              </div>
            </div>

            {/* Target Breakdown Summary Box */}
            <div className="bg-white p-4 rounded-2xl border border-indigo-100 shadow-xs space-y-2.5">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-500 font-bold uppercase">Source Note Target:</span>
                <span className="px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 font-bold">
                  {sendTargetModal.note.targetMonth || 'Designated'} {sendTargetModal.note.targetYear || ''}
                </span>
              </div>
              
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {(sendTargetModal.selectedTargetIndex === 'all' || sendTargetModal.selectedTargetIndex === 0) && sendTargetModal.note.targetProduct && (
                  <div className="flex items-center justify-between p-2.5 bg-indigo-50/60 rounded-xl border border-indigo-100/80 text-xs">
                    <span className="font-black text-slate-800">📦 {sendTargetModal.note.targetProduct}</span>
                    <div className="flex items-center gap-2 font-mono">
                      <span className="text-emerald-700 font-bold">₹{(sendTargetModal.note.targetSalesRevenue || 0).toLocaleString()}</span>
                      <span className="text-blue-700 font-bold">{sendTargetModal.note.targetVideos || 0} vids</span>
                    </div>
                  </div>
                )}
                {sendTargetModal.note.productTargets && sendTargetModal.note.productTargets.map((pt: any, i: number) => {
                  if (sendTargetModal.selectedTargetIndex !== 'all' && sendTargetModal.selectedTargetIndex !== (i + 1)) return null;
                  return (
                    <div key={i} className="flex items-center justify-between p-2.5 bg-indigo-50/60 rounded-xl border border-indigo-100/80 text-xs">
                      <span className="font-black text-slate-800">📦 {pt.productName || `Product ${i+2}`}</span>
                      <div className="flex items-center gap-2 font-mono">
                        <span className="text-emerald-700 font-bold">₹{(pt.salesRevenue || 0).toLocaleString()}</span>
                        <span className="text-blue-700 font-bold">{pt.videos || 0} vids</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Destination Selection: Month & Year */}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-black text-slate-700 uppercase tracking-wider block mb-1.5">
                  Select Destination Target Month:
                </label>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
                  {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setSendTargetModal(prev => prev ? { ...prev, selectedMonth: m } : null)}
                      className={`py-2 px-1 rounded-xl text-xs font-black transition cursor-pointer text-center border ${
                        sendTargetModal.selectedMonth === m
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-md ring-2 ring-indigo-300'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-indigo-50 hover:border-indigo-300'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-black text-slate-700 uppercase tracking-wider block mb-1.5">
                  Select Destination Target Year:
                </label>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
                  {['2024', '2025', '2026', '2027', '2028', '2029', '2030', '2031', '2032'].map(y => (
                    <button
                      key={y}
                      type="button"
                      onClick={() => setSendTargetModal(prev => prev ? { ...prev, selectedYear: y } : null)}
                      className={`py-2 px-1 rounded-xl text-xs font-black transition cursor-pointer text-center border ${
                        sendTargetModal.selectedYear === y
                          ? 'bg-purple-600 text-white border-purple-600 shadow-md ring-2 ring-purple-300'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-purple-50 hover:border-purple-300'
                      }`}
                    >
                      {y}
                    </button>
                  ))}
                </div>
              </div>

              {/* Mode Toggle */}
              <div className="pt-1 flex items-center justify-between bg-white p-3 rounded-xl border border-indigo-100 text-xs">
                <div>
                  <span className="font-bold text-slate-800 block">Replace existing targets for {sendTargetModal.selectedMonth} {sendTargetModal.selectedYear}?</span>
                  <span className="text-[11px] text-slate-500">If off, it will merge and update matching products safely.</span>
                </div>
                <input
                  type="checkbox"
                  checked={sendTargetModal.replaceExisting}
                  onChange={e => setSendTargetModal(prev => prev ? { ...prev, replaceExisting: e.target.checked } : null)}
                  className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-indigo-100">
              <button
                type="button"
                onClick={() => setSendTargetModal(null)}
                className="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (sendTargetModal && sendTargetModal.note) {
                    handleSyncToMonthlyTargets(
                      sendTargetModal.note,
                      sendTargetModal.selectedMonth,
                      sendTargetModal.selectedYear,
                      sendTargetModal.replaceExisting,
                      sendTargetModal.selectedTargetIndex
                    );
                  }
                }}
                className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-700 hover:to-pink-700 text-white rounded-xl text-xs font-black shadow-lg hover:shadow-indigo-500/25 transition cursor-pointer flex items-center gap-2"
              >
                <Target className="w-4 h-4" />
                <span>Set {sendTargetModal.selectedMonth} {sendTargetModal.selectedYear} Monthly Target</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Important Links & Bookmarks Management Modal */}
      {showImportantLinksModal && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-6 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
          <div 
            className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-scale-up"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-amber-500 via-amber-600 to-orange-600 p-5 sm:p-6 text-white flex items-center justify-between gap-4 shrink-0 shadow-md">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="p-3 bg-white/20 backdrop-blur-md rounded-2xl shadow-inner border border-white/30 shrink-0">
                  <Bookmark className="w-6 h-6 fill-white text-white drop-shadow-sm" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl sm:text-2xl font-black tracking-tight drop-shadow-sm truncate">
                      Important Links & Bookmarks
                    </h3>
                    <span className="px-2.5 py-0.5 bg-white/25 text-white rounded-full text-xs font-black shrink-0">
                      {importantLinks.length}
                    </span>
                    <span className="px-2.5 py-0.5 bg-amber-950/40 text-amber-200 border border-amber-300/40 rounded-full text-[10px] font-black shrink-0 uppercase tracking-wider">
                      Sorted A → Z
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-amber-100 font-medium mt-0.5 drop-shadow-xs">
                    Quickly access spreadsheets, drives, portals, and essential resources directly from Calendar Notebook.
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                {/* Mini Google Drive Sync Buttons */}
                <div className="flex items-center bg-white/20 backdrop-blur-md rounded-xl border border-white/30 overflow-hidden divide-x divide-white/20 shadow-xs" title="Google Drive Cloud Sync">
                  <button
                    type="button"
                    disabled={isDriveSyncing}
                    onClick={handleUploadImportantLinksToDrive}
                    className={`flex items-center gap-1.5 px-3 py-2 text-xs font-black transition-colors text-white hover:bg-white/25 active:scale-95 cursor-pointer ${
                      isDriveSyncing ? 'opacity-70 cursor-wait' : ''
                    }`}
                    title="Save Important Links to Google Drive"
                    aria-label="Save Important Links to Google Drive"
                  >
                    <CloudUpload className={`w-3.5 h-3.5 ${isDriveSyncing ? 'animate-pulse' : ''}`} />
                    <span className="hidden sm:inline text-[11px] uppercase tracking-wider">Save to Drive</span>
                  </button>
                  <button
                    type="button"
                    disabled={isDriveSyncing}
                    onClick={handleSyncImportantLinksFromDrive}
                    className={`flex items-center gap-1.5 px-3 py-2 text-xs font-black transition-colors text-white hover:bg-white/25 active:scale-95 cursor-pointer ${
                      isDriveSyncing ? 'opacity-70 cursor-wait' : ''
                    }`}
                    title="Update data from Google Drive"
                    aria-label="Update data from Google Drive"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isDriveSyncing ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline text-[11px] uppercase tracking-wider">Update from Drive</span>
                  </button>
                </div>

                {!isAddingLink && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingLink(true);
                      setEditingLinkId(null);
                      setFormLinkTitle('');
                      setFormLinkUrl('');
                      setFormLinkCategory('Work & Sheets');
                      setFormLinkDescription('');
                      setFormLinkPinned(true);
                    }}
                    className="flex items-center gap-1.5 bg-white text-amber-900 hover:bg-amber-50 text-xs font-black px-3.5 py-2 rounded-xl transition shadow-sm cursor-pointer whitespace-nowrap active:scale-95"
                  >
                    <Plus className="w-4 h-4" />
                    <span className="hidden sm:inline">Add Link</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setShowImportantLinksModal(false);
                    setIsAddingLink(false);
                    setEditingLinkId(null);
                  }}
                  className="p-2 text-white/80 hover:text-white hover:bg-white/20 rounded-xl transition cursor-pointer"
                  title="Close modal"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1 bg-slate-50/70">
              {/* Add / Edit Form Card */}
              {isAddingLink && (
                <form 
                  onSubmit={handleSaveLinkForm}
                  className="bg-gradient-to-br from-amber-50/90 to-orange-50/90 border-2 border-amber-300 rounded-2xl p-4 sm:p-5 shadow-sm space-y-3.5 animate-fade-in"
                >
                  <div className="flex items-center justify-between border-b border-amber-200 pb-2">
                    <div className="flex items-center gap-2 text-amber-950 font-black text-sm">
                      <Link2 className="w-4 h-4 text-amber-600" />
                      <span>{editingLinkId ? 'Edit Important Link' : 'Add New Important Link'}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingLink(false);
                        setEditingLinkId(null);
                      }}
                      className="text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">
                        Link Title / Name <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formLinkTitle}
                        onChange={e => setFormLinkTitle(e.target.value)}
                        placeholder="e.g. Master Influencer Campaign Sheet"
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none shadow-2xs"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">
                        Category / Tag
                      </label>
                      <select
                        value={formLinkCategory}
                        onChange={e => setFormLinkCategory(e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none shadow-2xs cursor-pointer"
                      >
                        <option value="Work & Sheets">Work & Sheets (Google Sheets, Excel)</option>
                        <option value="Drive & Files">Drive & Files (Google Drive, Docs)</option>
                        <option value="Social & Portals">Social & Portals (YouTube, Instagram, Facebook)</option>
                        <option value="Dashboards">Dashboards (Analytics, CRM, Stores)</option>
                        <option value="Resources">Resources (Assets, Guidelines, Rules)</option>
                        <option value="Reference">Reference (Contracts, Rate Cards)</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">
                        Destination URL <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <Globe className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                        <input
                          type="text"
                          required
                          value={formLinkUrl}
                          onChange={e => setFormLinkUrl(e.target.value)}
                          placeholder="e.g. https://docs.google.com/spreadsheets/d/... or drive.google.com/..."
                          className="w-full bg-white border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-xs font-mono font-medium focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none shadow-2xs"
                        />
                      </div>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">
                        Optional Notes / Description
                      </label>
                      <input
                        type="text"
                        value={formLinkDescription}
                        onChange={e => setFormLinkDescription(e.target.value)}
                        placeholder="e.g. Contains creator addresses, payment statuses, and monthly sample dispatches"
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none shadow-2xs"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">
                        Button Color (White words on color background)
                      </label>
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => setFormLinkColor('')}
                          className={`px-3 py-1.5 text-xs font-black rounded-xl border transition cursor-pointer ${
                            !formLinkColor
                              ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                          }`}
                        >
                          Auto (Different for each link)
                        </button>
                        {QUICK_LINK_COLOR_PALETTES.map(p => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setFormLinkColor(p.id)}
                            className={`w-7 h-7 rounded-xl ${p.bg} border-2 transition transform cursor-pointer flex items-center justify-center ${
                              formLinkColor === p.id 
                                ? 'border-slate-900 ring-2 ring-offset-1 ring-amber-400 scale-110 shadow-md' 
                                : 'border-white/60 hover:scale-105'
                            }`}
                            title={p.name}
                          >
                            {formLinkColor === p.id && <Check className="w-3.5 h-3.5 text-white stroke-[3]" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700 select-none">
                      <input
                        type="checkbox"
                        checked={formLinkPinned}
                        onChange={e => setFormLinkPinned(e.target.checked)}
                        className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500 border-slate-300 cursor-pointer"
                      />
                      <span>📌 Pin to Quick Access Bar (shows directly on top of Calendar Notebook)</span>
                    </label>

                    <div className="flex items-center gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddingLink(false);
                          setEditingLinkId(null);
                        }}
                        className="px-3.5 py-1.5 text-xs font-bold bg-white text-slate-600 hover:bg-slate-100 border border-slate-300 rounded-xl transition cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-1.5 text-xs font-black bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-xl shadow-md transition cursor-pointer flex items-center gap-1.5"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>{editingLinkId ? 'Save Changes' : 'Add Link'}</span>
                      </button>
                    </div>
                  </div>
                </form>
              )}

              {/* Search & Category Filter Bar */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={linkSearchQuery}
                    onChange={e => setLinkSearchQuery(e.target.value)}
                    placeholder="Search saved links by title, url, description..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-8 py-2 text-xs focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                  />
                  {linkSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setLinkSearchQuery('')}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Category Chips */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
                  {['All', 'Work & Sheets', 'Drive & Files', 'Social & Portals', 'Dashboards', 'Resources', 'Reference'].map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setLinkCategoryFilter(cat)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer border ${
                        linkCategoryFilter === cat
                          ? 'bg-amber-500 text-white border-amber-500 shadow-2xs'
                          : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Alphabet A-Z Filter Bar */}
              {availableLetters.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none px-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 shrink-0 mr-0.5">
                    Alphabet:
                  </span>
                  <button
                    type="button"
                    onClick={() => setLinkLetterFilter('All')}
                    className={`px-3 py-1 rounded-xl text-xs font-black transition cursor-pointer shrink-0 border ${
                      linkLetterFilter === 'All'
                        ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    All ({filteredImportantLinks.length})
                  </button>
                  {availableLetters.map(letter => {
                    const count = filteredImportantLinks.filter(l => getLinkFirstLetter(l.title) === letter).length;
                    return (
                      <button
                        key={letter}
                        type="button"
                        onClick={() => setLinkLetterFilter(letter === linkLetterFilter ? 'All' : letter)}
                        className={`min-w-7 h-7 px-2 rounded-xl text-xs font-black transition cursor-pointer shrink-0 border flex items-center justify-center gap-1 ${
                          linkLetterFilter === letter
                            ? 'bg-amber-600 text-white border-amber-600 ring-2 ring-amber-300 shadow-xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-amber-50 hover:border-amber-300'
                        }`}
                        title={`Show "${letter}" links (${count} ${count === 1 ? 'link' : 'links'})`}
                      >
                        <span>{letter}</span>
                        <span className={`text-[10px] ${linkLetterFilter === letter ? 'text-amber-100' : 'text-slate-400'}`}>
                          ({count})
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Links Grid / List divided into A, B, C letter sections */}
              {filteredImportantLinks.length === 0 || groupedImportantLinks.length === 0 ? (
                <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-8 sm:p-12 text-center space-y-3">
                  <div className="w-14 h-14 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
                    <Bookmark className="w-7 h-7" />
                  </div>
                  <div>
                    <h4 className="text-base font-black text-slate-800">
                      {linkSearchQuery || linkCategoryFilter !== 'All' || linkLetterFilter !== 'All' ? 'No matching links found' : 'No important links added yet'}
                    </h4>
                    <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                      {linkSearchQuery || linkCategoryFilter !== 'All' || linkLetterFilter !== 'All'
                        ? 'Try clearing your search query, category filter, or letter filter.'
                        : 'Keep your Google Sheets, Google Drive, creator portals, and analytical tools just one click away.'}
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingLink(true);
                        setEditingLinkId(null);
                        setFormLinkTitle('');
                        setFormLinkUrl('');
                        setFormLinkCategory('Work & Sheets');
                        setFormLinkDescription('');
                        setFormLinkPinned(true);
                      }}
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-black shadow-sm transition cursor-pointer flex items-center gap-1.5"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add New Link</span>
                    </button>
                    {importantLinks.length === 0 && (
                      <button
                        type="button"
                        onClick={handleResetDefaultLinks}
                        className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
                      >
                        Load Preset Links
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {groupedImportantLinks.map(({ letter, links: groupLinks }) => (
                    <div key={letter} className="space-y-3" id={`link-letter-section-${letter}`}>
                      {/* Section Letter Header: Under A show A related, under B show B related, etc. */}
                      <div className="flex items-center gap-3 bg-gradient-to-r from-amber-100/90 via-orange-50 to-white border border-amber-300/80 rounded-2xl px-4 py-2.5 shadow-2xs">
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white font-black text-sm flex items-center justify-center shadow-xs ring-2 ring-white shrink-0">
                          {letter}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black text-amber-950 uppercase tracking-wide">
                            {letter} Related Links
                          </span>
                          <span className="px-2.5 py-0.5 bg-amber-200/90 text-amber-950 rounded-full text-[11px] font-black">
                            {groupLinks.length} {groupLinks.length === 1 ? 'link' : 'links'}
                          </span>
                        </div>
                        <div className="flex-1 h-px bg-gradient-to-r from-amber-300 via-orange-200 to-transparent ml-2 hidden sm:block" />
                      </div>

                      {/* Links Grid for this Letter */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                        {groupLinks.map((link, idx) => {
                          const theme = getQuickLinkColor(link, idx);
                          const href = link.url.startsWith('http') ? link.url : `https://${link.url}`;
                          const isCopied = copiedLinkId === link.id;

                          return (
                            <div
                              key={link.id}
                              className={`bg-white rounded-2xl p-4 border-2 transition-all duration-200 flex flex-col justify-between shadow-2xs hover:shadow-md ${
                                link.pinned 
                                  ? `${theme.border} ring-2 ring-offset-1 ${theme.border}` 
                                  : 'border-slate-200 hover:border-slate-300'
                              }`}
                            >
                              <div>
                                {/* Card Header */}
                                <div className="flex items-center justify-between gap-2 mb-2">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${theme.bg} text-white shadow-2xs`}>
                                      {link.category || 'General'}
                                    </span>
                                    <span className="text-[10px] font-bold text-slate-400">
                                      {theme.name}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => handleTogglePinLink(link.id)}
                                      className={`p-1 rounded-lg transition cursor-pointer ${
                                        link.pinned 
                                          ? 'text-amber-500 bg-amber-50 hover:bg-amber-100' 
                                          : 'text-slate-400 hover:text-amber-500 hover:bg-slate-100'
                                      }`}
                                      title={link.pinned ? 'Pinned to Quick Bar (Click to unpin)' : 'Click to pin to Quick Bar'}
                                    >
                                      <Pin className={`w-3.5 h-3.5 ${link.pinned ? 'fill-amber-500' : ''}`} />
                                    </button>
                                  </div>
                                </div>

                                {/* Card Body */}
                                <div className="space-y-1">
                                  <a
                                    href={href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="group inline-flex items-center gap-1.5 text-sm font-black text-slate-900 hover:text-amber-600 transition"
                                    title={`Open ${link.title}`}
                                  >
                                    <span className="break-words line-clamp-1">{link.title}</span>
                                    <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-600 shrink-0" />
                                  </a>

                                  <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-mono truncate">
                                    <Globe className="w-3 h-3 text-slate-400 shrink-0" />
                                    <span className="truncate">{link.url}</span>
                                  </div>

                                  {link.description && (
                                    <p className="text-xs text-slate-600 line-clamp-2 mt-1 font-normal leading-relaxed">
                                      {link.description}
                                    </p>
                                  )}
                                </div>
                              </div>

                              {/* Card Actions */}
                              <div className="flex items-center justify-between gap-2 pt-3 mt-3 border-t border-slate-100">
                                <div className="flex items-center gap-1.5">
                                  <a
                                    href={href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`inline-flex items-center gap-1 px-3.5 py-1.5 ${theme.bg} ${theme.hoverBg} text-white rounded-xl text-xs font-black transition shadow-xs cursor-pointer active:scale-95`}
                                    title="Open in new tab"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5 text-white" />
                                    <span className="text-white font-black">Open</span>
                                  </a>
                                  <button
                                    type="button"
                                    onClick={() => handleCopyLink(link.url, link.id)}
                                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 border rounded-xl text-xs font-bold transition cursor-pointer ${
                                      isCopied
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                                    }`}
                                    title="Copy URL"
                                  >
                                    {isCopied ? (
                                      <>
                                        <Check className="w-3 h-3 text-emerald-600" />
                                        <span>Copied!</span>
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="w-3 h-3 text-slate-500" />
                                        <span>Copy</span>
                                      </>
                                    )}
                                  </button>
                                </div>

                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleStartEditLink(link)}
                                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                                    title="Edit link details"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteLink(link.id, link.title)}
                                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                                    title="Delete link"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-white border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 shrink-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold">
                  Total: {importantLinks.length} link{importantLinks.length === 1 ? '' : 's'}
                </span>
                <span className="text-slate-300">•</span>
                <span className="text-amber-700 font-bold">
                  {importantLinks.filter(l => l.pinned).length} pinned to Quick Bar
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Mini Google Drive Buttons in Footer */}
                <div className="flex items-center bg-slate-100 rounded-lg border border-slate-200 overflow-hidden divide-x divide-slate-200 shadow-2xs">
                  <button
                    type="button"
                    disabled={isDriveSyncing}
                    onClick={handleUploadImportantLinksToDrive}
                    className={`flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold transition-colors text-blue-700 hover:bg-blue-50 active:scale-95 cursor-pointer ${
                      isDriveSyncing ? 'opacity-60 cursor-wait' : ''
                    }`}
                    title="Save Important Links to Google Drive"
                    aria-label="Save Important Links to Google Drive"
                  >
                    <CloudUpload className={`w-3.5 h-3.5 ${isDriveSyncing ? 'animate-pulse text-blue-600' : 'text-blue-600'}`} />
                    <span>Save to Drive</span>
                  </button>
                  <button
                    type="button"
                    disabled={isDriveSyncing}
                    onClick={handleSyncImportantLinksFromDrive}
                    className={`flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold transition-colors text-indigo-700 hover:bg-indigo-50 active:scale-95 cursor-pointer ${
                      isDriveSyncing ? 'opacity-60 cursor-wait' : ''
                    }`}
                    title="Update data from Google Drive"
                    aria-label="Update data from Google Drive"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isDriveSyncing ? 'animate-spin text-indigo-600' : 'text-indigo-600'}`} />
                    <span>Update from Drive</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleExportImportantLinks}
                  className="px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition cursor-pointer"
                  title="Export links to JSON file"
                >
                  Export JSON
                </button>
                <label 
                  htmlFor="import-important-links-input"
                  className="px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition cursor-pointer"
                  title="Import links from JSON file"
                >
                  Import JSON
                </label>
                <input
                  type="file"
                  id="import-important-links-input"
                  accept=".json"
                  onChange={handleImportImportantLinks}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={handleResetDefaultLinks}
                  className="px-2.5 py-1.5 text-[11px] font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                  title="Reset to default link presets"
                >
                  Reset Defaults
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowImportantLinksModal(false);
                    setIsAddingLink(false);
                    setEditingLinkId(null);
                  }}
                  className="px-4 py-1.5 text-xs font-black bg-slate-900 hover:bg-slate-800 text-white rounded-xl shadow-xs transition cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
