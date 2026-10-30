import { Influencer, Campaign, Task, Message, Contract, BillingEntry } from '../types';

export interface DataBackupSnapshot {
  influencers: Influencer[];
  campaigns: Campaign[];
  tasks: Task[];
  messages: Message[];
  contracts: Contract[];
  billingEntries: BillingEntry[];
}

/**
 * Encodes and dispatches a complete layout of active datasets to a user's specified Gmail email address.
 */
export async function sendDataBackupToGmail(
  accessToken: string,
  toEmail: string,
  dataSnapshot: DataBackupSnapshot
): Promise<any> {
  const dateStr = new Date().toISOString().split('T')[0];
  const timeStr = new Date().toLocaleTimeString();
  const subject = `[Influencer Manager] Safe Database Backup: ${dateStr} @ ${timeStr}`;

  const statsText = `SYSTEM STATISTICS OVERVIEW:
---------------------------------------------
● Total Active Creators: ${dataSnapshot.influencers?.length || 0} registered
● Total Sourced Campaigns: ${dataSnapshot.campaigns?.length || 0} campaigns
● Total Content Tasks/Deliverables: ${dataSnapshot.tasks?.length || 0} tasks
● Total Contract Agreements: ${dataSnapshot.contracts?.length || 0} agreements
● Total Invoice Ledger Entries: ${dataSnapshot.billingEntries?.length || 0} entries
● Total Communications Cache: ${dataSnapshot.messages?.length || 0} messages logged
`;

  const emailBody = `Dear Administrator,

You are receiving this safe, self-contained cloud database backup snapshot generated natively inside Influencer Manager.

======================================================================
Influencer Manager — PERSISTED ENCLAVE BACKUP
======================================================================
Backup Generated: ${new Date().toLocaleString('en-GB')} (${new Date().toUTCString()})
Recipient Workspace Mailbox: ${toEmail}
System Safety Standard: Compliance Secured

${statsText}

----------------------------------------------------------------------
DATA LABELS & INDEX IDENTIFICATION KEY:
----------------------------------------------------------------------
1. CREATORS DATABASE (Roster information, handles, niche, contact data, rating)
2. CAMPAIGNS DESK (Budget limits, expenditures, reach metrics, status, duration)
3. MONTHLY DELIVERABLES (Kanban tasks, deadlines, platfrom bounds, release parameters)
4. SYSTEM CORE MESSAGES (Communications hub chat streams logs)
5. BRAND COMPLIANCE CONTRACTS (Legal terms, clearance values, counter-sign states)
6. ACCOUNTING LEDGER (Billing processing, processing statuses, payout invoice tracking)

----------------------------------------------------------------------
VOLATILE MEMORY JSON DATABASE BACKUP SNAPSHOT:
----------------------------------------------------------------------
${JSON.stringify(dataSnapshot, null, 2)}

======================================================================
End of Datastore Backup Packet.
This email contains sensitive operational metrics and was sent on your explicit trigger action request.
All actions complied with authorization from the app's logged-in users.
======================================================================
`;

  // Construct standard MIME
  const mime = [
    `To: ${toEmail}`,
    `Subject: =?utf-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
    'Content-Type: text/plain; charset="utf-8"',
    'MIME-Version: 1.0',
    '',
    emailBody
  ].join('\r\n');

  // Convert to Base64URL
  const utf8Bytes = new TextEncoder().encode(mime);
  let binary = '';
  for (let i = 0; i < utf8Bytes.length; i++) {
    binary += String.fromCharCode(utf8Bytes[i]);
  }
  const base64 = btoa(binary);
  const base64Url = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      raw: base64Url
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gmail Dispatch Failed (HTTP ${response.status}): ${errText}`);
  }

  return await response.ok;
}

export interface GmailBackupHeader {
  id: string;
  snippet: string;
  date: string;
  subject: string;
}

/**
 * Searches and lists the 10 most recent database backup emails from the logged-in user's Gmail box.
 */
export async function fetchBackupMessagesFromGmail(accessToken: string): Promise<GmailBackupHeader[]> {
  const q = encodeURIComponent('subject:"[Influencer Manager] Safe Database Backup"');
  const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=10`;
  
  const response = await fetch(listUrl, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    }
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to list backup messages (HTTP ${response.status}): ${text}`);
  }
  
  const listData = await response.json();
  if (!listData.messages || listData.messages.length === 0) {
    return [];
  }
  
  const headers: GmailBackupHeader[] = [];
  
  // Fetch details of each message in parallel (up to 10)
  const detailPromises = listData.messages.map(async (msgStub: { id: string }) => {
    try {
      const detailUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgStub.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=Date`;
      const detailRes = await fetch(detailUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        }
      });
      if (!detailRes.ok) return null;
      const detailJson = await detailRes.json();
      
      const subjectHeader = detailJson.payload?.headers?.find((h: any) => h.name.toLowerCase() === 'subject')?.value || 'Unknown Backup';
      const dateHeader = detailJson.payload?.headers?.find((h: any) => h.name.toLowerCase() === 'date')?.value || '';
      
      return {
        id: msgStub.id,
        snippet: detailJson.snippet || '',
        date: dateHeader ? new Date(dateHeader).toLocaleString('en-GB') : 'Unknown date',
        subject: subjectHeader,
      };
    } catch (e) {
      console.error(`Error fetching Gmail message metadata for ID ${msgStub.id}`, e);
      return null;
    }
  });
  
  const resolved = await Promise.all(detailPromises);
  for (const item of resolved) {
    if (item) {
      headers.push(item);
    }
  }
  
  return headers;
}

function getBodyText(payload: any): string {
  if (payload.body && payload.body.data) {
    return decodeBase64Url(payload.body.data);
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body && part.body.data) {
        return decodeBase64Url(part.body.data);
      }
      if (part.parts) {
        const subResult = getBodyText(part);
        if (subResult) return subResult;
      }
    }
  }
  return '';
}

function decodeBase64Url(base64Url: string): string {
  let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  try {
    const binary = atob(base64);
    // Decode UTF-8 correctly
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch (e) {
    console.error('Base64 decode error', e);
    return atob(base64);
  }
}

/**
 * Downloads a complete backup snapshot email content and decodes the embedded JSON payload.
 */
export async function decodeBackupMessageContent(accessToken: string, messageId: string): Promise<DataBackupSnapshot> {
  const detailUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`;
  const response = await fetch(detailUrl, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    }
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch message details (HTTP ${response.status}): ${text}`);
  }
  
  const msgDetails = await response.json();
  const bodyText = getBodyText(msgDetails.payload);
  if (!bodyText) {
    throw new Error("Could not extract any plain-text body from the backup email.");
  }
  
  const jsonStartMarker = "VOLATILE MEMORY JSON DATABASE BACKUP SNAPSHOT:\r\n----------------------------------------------------------------------";
  const jsonStartMarkerAlt = "VOLATILE MEMORY JSON DATABASE BACKUP SNAPSHOT:\n----------------------------------------------------------------------";
  
  let startIndex = bodyText.indexOf(jsonStartMarker);
  if (startIndex === -1) {
    startIndex = bodyText.indexOf(jsonStartMarkerAlt);
  }
  
  let jsonString = '';
  if (startIndex !== -1) {
    const searchSegment = bodyText.substring(startIndex + (startIndex === bodyText.indexOf(jsonStartMarker) ? jsonStartMarker.length : jsonStartMarkerAlt.length));
    const nextBoundaryIndex = searchSegment.indexOf("======================================================================");
    if (nextBoundaryIndex !== -1) {
      jsonString = searchSegment.substring(0, nextBoundaryIndex).trim();
    }
  }
  
  if (!jsonString) {
    const firstBrace = bodyText.indexOf('{');
    const lastBrace = bodyText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      jsonString = bodyText.substring(firstBrace, lastBrace + 1);
    }
  }
  
  if (!jsonString) {
    throw new Error("The backup JSON format was not found in the email content.");
  }
  
  try {
    const data = JSON.parse(jsonString);
    return data as DataBackupSnapshot;
  } catch (e: any) {
    console.error("Parsed text was: ", jsonString);
    throw new Error(`Failed to parse backup JSON from email: ${e.message}`);
  }
}
