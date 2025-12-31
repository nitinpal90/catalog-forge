import { DriveFile } from '../types';

/**
 * Enterprise API Configuration
 * API_KEY is injected via Vite from environment variables.
 */
const DRIVE_API_KEY = process.env.API_KEY?.trim().replace(/^["']|["']$/g, '');

/**
 * Universal ID Extractor for Google Drive URLs
 */
export const extractFolderId = (url: string): string | null => {
  if (!url) return null;
  const match = url.match(/\/folders\/([a-zA-Z0-9-_]+)/) || 
                url.match(/id=([a-zA-Z0-9-_]+)/) ||
                url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  
  if (match) return match[1];
  if (url.trim().length >= 25 && /^[a-zA-Z0-9-_]+$/.test(url.trim())) return url.trim();
  return null;
};

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

/**
 * Optimized HTTP Client for Restricted API Keys.
 */
async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  if (!DRIVE_API_KEY) {
    throw new Error('SYSTEM_FAULT: API_KEY is not defined in Netlify Environment Variables.');
  }

  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      
      // Handle Rate Limiting (429) or Propagation Delay (403)
      if (res.status === 403 || res.status === 429) {
        await delay(2000 * (i + 1));
        if (i < retries - 1) continue;
      }
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }));
        const msg = errorData.error?.message?.toLowerCase() || '';
        
        if (msg.includes('api key not valid') || msg.includes('restriction')) {
          throw new Error('API_RESTRICTION_ERROR: The API Key restriction is blocking the request. Verify that https://catalogforge.netlify.app/* is allowed in Cloud Console.');
        }
        throw new Error(errorData.error?.message || `Google API Error ${res.status}`);
      }
      
      return res;
    } catch (e: any) {
      if (e.message.includes('API_RESTRICTION_ERROR')) throw e;
      if (i === retries - 1) throw e;
      await delay(1000);
    }
  }
  throw new Error('Network timeout during Drive sync.');
}

/**
 * Professional Recursive Scanner
 * Maps all sub-folders and builds the directory tree for massive batches.
 */
export async function fetchFolderContents(
  folderId: string,
  rootName: string = "Root",
  onLog?: (msg: string, type?: 'info' | 'success' | 'error' | 'warning') => void
): Promise<{ files: DriveFile[]; folders: Map<string, string> }> {
  const files: DriveFile[] = [];
  const folders = new Map<string, string>();
  folders.set(folderId, rootName);

  async function crawl(id: string, currentPath: string) {
    try {
      let pageToken: string | null = null;
      do {
        const query = `'${id}' in parents and trashed=false`;
        let url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&key=${DRIVE_API_KEY}&fields=nextPageToken,files(id,name,mimeType,parents)&pageSize=1000`;
        if (pageToken) url += `&pageToken=${pageToken}`;

        const res = await fetchWithRetry(url);
        const data = await res.json();

        for (const item of data.files || []) {
          if (item.mimeType === 'application/vnd.google-apps.folder') {
            folders.set(item.id, item.name);
            onLog?.(`Mapping: ${currentPath}/${item.name}`, 'info');
            await crawl(item.id, `${currentPath}/${item.name}`);
          } else {
            const isImage = /\.(jpg|jpeg|png|webp|gif|bmp|tiff|jfif|avif)$/i.test(item.name) || 
                            item.mimeType.startsWith('image/');
            if (isImage) files.push(item);
          }
        }
        pageToken = data.nextPageToken;
      } while (pageToken);
    } catch (e: any) {
      onLog?.(`Crawl Fault [${currentPath}]: ${e.message}`, 'error');
      if (e.message.includes('API_RESTRICTION_ERROR')) throw e;
    }
  }

  onLog?.(`Starting Deep Scan: ${rootName}...`, 'info');
  await crawl(folderId, rootName);
  return { files, folders };
}

/**
 * Direct Binary Downloader
 * Pulls media stream directly from Google Drive V3 media endpoint.
 */
export const downloadDriveFile = async (id: string): Promise<Blob> => {
  const url = `https://www.googleapis.com/drive/v3/files/${id}?alt=media&key=${DRIVE_API_KEY}`;
  
  try {
    const res = await fetch(url);
    if (res.ok) {
      const b = await res.blob();
      if (b.size > 100 && !b.type.includes('html')) return b;
    }
  } catch (e) {
    // Referrer fallback via industrial proxy
    const proxyUrl = `https://wsrv.nl/?url=${encodeURIComponent(`https://drive.google.com/uc?export=download&id=${id}`)}&output=jpg&q=100`;
    const res = await fetch(proxyUrl);
    if (res.ok) return await res.blob();
  }

  throw new Error(`Media Extraction Failed for ${id}.`);
};