import { DriveFile } from '../types';

/**
 * Accesses API_KEY from the environment.
 * In Netlify, this comes from Site Configuration > Environment Variables.
 */
const DRIVE_API_KEY = process.env.API_KEY;

/**
 * Extracts the ID using the exact logic from your working 'Final Engine'
 */
export const extractFolderId = (url: string): string | null => {
  if (!url) return null;
  const match = url.match(/\/folders\/([a-zA-Z0-9-_]+)/) || 
                url.match(/id=([a-zA-Z0-9-_]+)/) ||
                url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  
  if (match) return match[1];
  // Fallback for raw IDs
  if (url.trim().length >= 25) return url.trim();
  return null;
};

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

/**
 * Standardized fetch with retry (Direct API calls for metadata)
 * Matching the working tool's logic: No proxies for folder listing.
 */
async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  if (!DRIVE_API_KEY || DRIVE_API_KEY === "" || DRIVE_API_KEY === "undefined") {
    throw new Error('CONFIG_ERROR: API_KEY is missing. Add it to Netlify Env Variables.');
  }

  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      
      if (res.status === 403 || res.status === 429) {
        const errBody = await res.json().catch(() => ({}));
        if (errBody.error?.message?.includes('API key not valid')) {
          throw new Error(`API_KEY_INVALID: Check your Google Cloud Console Key.`);
        }
        await delay(1500 * (i + 1));
        continue; 
      }
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }));
        throw new Error(errorData.error?.message || 'Access Denied');
      }
      
      return res;
    } catch (e: any) {
      if (e.message.includes('API_KEY_INVALID')) throw e;
      if (i === retries - 1) throw e;
      await delay(1000);
    }
  }
  throw new Error('Connection failed after multiple retries.');
}

/**
 * Fetches all files using pagination (Fix for 100+ images)
 * Uses pageSize=1000 for maximum efficiency.
 */
export async function fetchAllInFolder(folderId: string): Promise<DriveFile[]> {
  let allFiles: DriveFile[] = [];
  let pageToken: string | null = null;

  do {
    const query = `'${folderId}' in parents and trashed=false`;
    let url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&key=${DRIVE_API_KEY}&fields=nextPageToken,files(id,name,mimeType)&pageSize=1000`;
    
    if (pageToken) url += `&pageToken=${pageToken}`;

    const res = await fetchWithRetry(url);
    const data = await res.json();
    
    if (data.files) allFiles = allFiles.concat(data.files);
    pageToken = data.nextPageToken;
  } while (pageToken);

  return allFiles;
}

/**
 * Industrial Recursive Scanner (Matches 'crawlFolder' in your working code)
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
          // Identify image assets
          const isImage = /\.(jpg|jpeg|png|webp|gif|bmp|tiff|jfif)$/i.test(item.name) || 
                          item.mimeType.startsWith('image/');
          if (isImage) {
            // Store the file and its immediate parent ID for naming
            const fileWithParent = { ...item, parents: [id] };
            files.push(fileWithParent);
          }
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
 * Downloads a file using the media endpoint (Exact same as working tool)
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
    // Fallback only if direct fails
    const proxyUrl = `https://wsrv.nl/?url=${encodeURIComponent(`https://drive.google.com/uc?export=download&id=${id}`)}&output=jpg&q=100`;
    const res = await fetch(proxyUrl);
    if (res.ok) return await res.blob();
  }

  throw new Error(`Extraction failed for ${id}. Check file sharing permissions.`);
};