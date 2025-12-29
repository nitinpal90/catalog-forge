import { DriveFile } from '../types';

/**
 * Industrial Security: 
 * Accesses API_KEY from the environment.
 */
const DRIVE_API_KEY = process.env.API_KEY;

export const extractFolderId = (url: string): string | null => {
  if (!url) return null;
  // Support for full URLs or raw IDs
  const match = url.match(/\/folders\/([a-zA-Z0-9-_]+)/) || 
                url.match(/id=([a-zA-Z0-9-_]+)/) ||
                url.match(/([a-zA-Z0-9-_]{25,})/);
  
  if (match) return match[1];
  // Fallback: If it looks like a raw ID (long enough and alphanumeric)
  if (url.length > 20 && /^[a-zA-Z0-9-_]+$/.test(url)) return url;
  return null;
};

/**
 * Fetches with automatic CORS bypass for the API itself if direct call fails
 */
async function fetchWithRetry(url: string, retries = 2): Promise<Response> {
  if (!DRIVE_API_KEY || DRIVE_API_KEY === 'undefined') {
    throw new Error('System Config Error: API_KEY is missing. Add it to Netlify Environment Variables and REDEPLOY.');
  }

  // Attempt direct fetch first
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      
      if (res.status === 403) {
        // If 403, it's a permissions/API setup issue. Try failover to proxy immediately
        console.warn("Direct API call returned 403. Attempting CORS Proxy Bypass...");
        break; 
      }
      
      if (res.status === 429) {
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      
      if (res.ok) return res;
    } catch (e: any) {
      if (i === retries - 1) break;
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  // FAILOVER: Use a proxy to call the Google API (Bypasses some region blocks/CORS issues)
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
  try {
    const res = await fetch(proxyUrl);
    if (res.status === 403) {
       throw new Error('403 Forbidden: 1. Enable "Google Drive API" in Cloud Console. 2. Share folder as "Anyone with link".');
    }
    if (res.ok) return res;
  } catch (e) {}

  throw new Error('Drive API unreachable. Check internet connection and API Key status.');
}

/**
 * Fetches all files in a folder using standard pagination (PageSize 100)
 */
export async function fetchAllInFolder(folderId: string): Promise<DriveFile[]> {
  let allFiles: DriveFile[] = [];
  let pageToken: string | null = null;

  do {
    const query = `'${folderId}' in parents and trashed=false`;
    // Note: PageSize 100 is the standard maximum for reliable v3 list calls
    let url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&key=${DRIVE_API_KEY}&fields=nextPageToken,files(id,name,mimeType,parents)&pageSize=100`;
    if (pageToken) url += `&pageToken=${pageToken}`;

    const res = await fetchWithRetry(url);
    const data = await res.json();
    
    if (data.error) {
      throw new Error(`Google API: ${data.error.message} (Verify "Google Drive API" is ENABLED in Cloud Console)`);
    }

    if (data.files) allFiles = allFiles.concat(data.files);
    pageToken = data.nextPageToken;
  } while (pageToken);

  return allFiles;
}

/**
 * Deep recursive scan for images in all subfolders
 */
// Fix: Updated onLog type definition to support optional severity parameter, matching its internal calls.
export async function fetchFolderContents(
  folderId: string,
  rootName: string = "Root",
  onLog?: (msg: string, type?: 'info' | 'success' | 'error' | 'warning') => void
): Promise<{ files: DriveFile[], folders: Map<string, string> }> {
  const files: DriveFile[] = [];
  const folders = new Map<string, string>();

  async function crawl(id: string, name: string) {
    folders.set(id, name);
    try {
      const items = await fetchAllInFolder(id);
      const subTasks = [];
      
      for (const item of items) {
        if (item.mimeType === 'application/vnd.google-apps.folder') {
          onLog?.(`Subfolder detected: ${item.name}`);
          subTasks.push(crawl(item.id, item.name));
        } else {
          const isImage = /\.(jpg|jpeg|png|webp|gif|bmp|tiff|jfif)$/i.test(item.name) || item.mimeType.startsWith('image/');
          if (isImage) files.push(item);
        }
      }
      await Promise.all(subTasks);
    } catch (e: any) {
      onLog?.(`Error scanning sub-path ${name}: ${e.message}`, 'error');
      // Re-throw if it's a fatal config error so we stop the whole process
      if (e.message.includes('API_KEY')) throw e;
    }
  }

  onLog?.(`Initializing Architecture Scan: ${rootName}`);
  await crawl(folderId, rootName);
  return { files, folders };
}

/**
 * Downloads a file with multiple failover strategies
 */
export const downloadDriveFile = async (id: string): Promise<Blob> => {
  // Strategy 1: Direct v3 API media fetch
  const url = `https://www.googleapis.com/drive/v3/files/${id}?alt=media&key=${DRIVE_API_KEY}`;
  
  // Strategy 2: High-speed proxy bypass (CORS friendly)
  const proxyUrl = `https://wsrv.nl/?url=${encodeURIComponent(`https://drive.google.com/uc?export=download&id=${id}`)}&output=jpg&q=100`;

  // Strategy 3: Universal CORS Proxy failover
  const failoverUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://drive.google.com/uc?export=download&id=${id}`)}`;

  const downloadNodes = [url, proxyUrl, failoverUrl];

  for (const node of downloadNodes) {
    try {
      const res = await fetch(node);
      if (res.ok) {
        const b = await res.blob();
        // Validate that we didn't get an HTML error page (usually < 1KB) instead of an image
        if (b.size > 1000 && !b.type.includes('html')) return b;
      }
    } catch (e) {
      console.debug(`Node failed, switching...`);
    }
  }

  throw new Error(`Extraction failed for asset ${id}. Ensure the folder is shared as 'Anyone with the link can view'.`);
};