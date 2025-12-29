import { DriveFile } from '../types';

/**
 * Industrial Security: 
 * Accesses API_KEY from the environment.
 */
const DRIVE_API_KEY = process.env.API_KEY;

/**
 * Extracts the ID using precise pattern matching.
 * Supports full URLs, share links, and raw IDs.
 */
export const extractFolderId = (url: string): string | null => {
  if (!url) return null;
  const match = url.match(/\/folders\/([a-zA-Z0-9-_]+)/) || 
                url.match(/id=([a-zA-Z0-9-_]+)/) ||
                url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  
  if (match) return match[1];
  // Fallback: If it's a raw ID (roughly 25+ chars, alphanumeric)
  if (url.trim().length >= 25 && /^[a-zA-Z0-9-_]+$/.test(url.trim())) return url.trim();
  return null;
};

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

/**
 * Industrial Proxy Hub:
 * If the direct Google API call fails (common with CORS in browser),
 * we automatically pivot to high-bandwidth proxies.
 */
async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  if (!DRIVE_API_KEY || DRIVE_API_KEY === "" || DRIVE_API_KEY === "undefined") {
    throw new Error('CONFIG_ERROR: API_KEY is missing. Check Netlify Environment Variables.');
  }

  const nodes = [
    url, // 1. Direct
    `https://corsproxy.io/?${encodeURIComponent(url)}`, // 2. High Stability Proxy
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}` // 3. Backup Proxy
  ];

  for (let i = 0; i < retries; i++) {
    for (const node of nodes) {
      try {
        const res = await fetch(node);
        
        if (res.status === 403 || res.status === 429) {
          const errBody = await res.json().catch(() => ({}));
          if (errBody.error?.message?.includes('API key not valid')) {
            throw new Error(`API_KEY_INVALID: Key rejected by Google.`);
          }
          continue; // Try next node or retry
        }
        
        if (res.ok) return res;
      } catch (e: any) {
        if (e.message.includes('API_KEY_INVALID')) throw e;
        continue; // Try next node
      }
    }
    await delay(2000 * (i + 1));
  }
  
  throw new Error('INDUSTRIAL_TIMEOUT: Connection failed after multiple node retries. Check internet or API quota.');
}

/**
 * Fetches all files using pagination and max-efficiency chunks (1000 items)
 */
export async function fetchAllInFolder(folderId: string): Promise<DriveFile[]> {
  let allFiles: DriveFile[] = [];
  let pageToken: string | null = null;

  do {
    const query = `'${folderId}' in parents and trashed=false`;
    let url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&key=${DRIVE_API_KEY}&fields=nextPageToken,files(id,name,mimeType,parents)&pageSize=1000`;
    
    if (pageToken) url += `&pageToken=${pageToken}`;

    const res = await fetchWithRetry(url);
    const data = await res.json();
    
    if (data.files) allFiles = allFiles.concat(data.files);
    pageToken = data.nextPageToken;
  } while (pageToken);

  return allFiles;
}

/**
 * Industrial Recursive Scanner:
 * Crawls entire folder structures to locate all nested image assets.
 */
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
          onLog?.(`Subfolder Found: ${item.name}`, 'info');
          subTasks.push(crawl(item.id, item.name));
        } else {
          const isImage = /\.(jpg|jpeg|png|webp|gif|bmp|tiff|jfif)$/i.test(item.name) || item.mimeType.startsWith('image/');
          if (isImage) files.push(item);
        }
      }
      await Promise.all(subTasks);
    } catch (e: any) {
      onLog?.(`[${name}] Scan Failed: ${e.message}`, 'error');
      if (e.message.includes('CONFIG_ERROR') || e.message.includes('API_KEY_INVALID')) throw e;
    }
  }

  onLog?.(`Initializing Scan: ${rootName}...`, 'info');
  await crawl(folderId, rootName);
  return { files, folders };
}

/**
 * High-Speed Binary Extraction:
 * Downloads original files via media stream or proxy failover.
 */
export const downloadDriveFile = async (id: string): Promise<Blob> => {
  const url = `https://www.googleapis.com/drive/v3/files/${id}?alt=media&key=${DRIVE_API_KEY}`;
  
  // High reliability proxy for raw binary stream (Bypasses most CORS and Origin blocks)
  const proxyUrl = `https://wsrv.nl/?url=${encodeURIComponent(`https://drive.google.com/uc?export=download&id=${id}`)}&output=jpg&q=100`;

  const attempts = [url, proxyUrl];

  for (const node of attempts) {
    try {
      const res = await fetch(node);
      if (res.ok) {
        const b = await res.blob();
        if (b.size > 500 && !b.type.includes('html')) return b;
      }
    } catch (e) {
      continue;
    }
  }

  throw new Error(`EXTRACTION_FAILED: Asset ${id} unreachable. Verify "Anyone with the link" permissions.`);
};