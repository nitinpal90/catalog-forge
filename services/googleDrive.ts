import { DriveFile } from '../types';

/**
 * Industrial Security: 
 * Accesses API_KEY from the environment.
 */
const DRIVE_API_KEY = process.env.API_KEY;

/**
 * Extracts the ID using the exact logic from your working script
 */
export const extractFolderId = (url: string): string | null => {
  if (!url) return null;
  const match = url.match(/\/folders\/([a-zA-Z0-9-_]+)/) || url.match(/id=([a-zA-Z0-9-_]+)/);
  return match ? match[1] : (url.length > 20 ? url : null);
};

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

/**
 * Standardized fetch with retry, matching your working tool's logic
 */
async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  // CRITICAL CHECK: Check if key is missing or invalid placeholder
  if (!DRIVE_API_KEY || DRIVE_API_KEY === "" || DRIVE_API_KEY === "undefined") {
    throw new Error('CONFIG_ERROR: Google API Key is missing. Please add "API_KEY" to your Netlify Environment Variables and REDEPLOY.');
  }

  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      
      // Handle Rate Limiting or Temporary Errors
      if (res.status === 403 || res.status === 429) {
        if (res.status === 403) {
          const errBody = await res.json().catch(() => ({}));
          // If the key is specifically blocked or invalid
          if (errBody.error?.message?.includes('API key not valid')) {
            throw new Error(`API_KEY_INVALID: The key provided is rejected by Google. Check your Google Cloud Console.`);
          }
        }
        await delay(1500 * (i + 1));
        continue;
      }
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: { message: `HTTP ${res.status} Error` } }));
        throw new Error(errorData.error?.message || `Access Denied (${res.status})`);
      }
      
      return res;
    } catch (e: any) {
      if (e.message.includes('API_KEY_INVALID') || e.message.includes('CONFIG_ERROR')) throw e;
      if (i === retries - 1) throw e;
      await delay(1000);
    }
  }
  throw new Error('Connection failed after multiple retries.');
}

/**
 * Fetches all files using pagination and 1000-item chunks
 */
export async function fetchAllInFolder(folderId: string): Promise<DriveFile[]> {
  let allFiles: DriveFile[] = [];
  let pageToken: string | null = null;

  do {
    const query = `'${folderId}' in parents and trashed=false`;
    // Using pageSize=1000 as per your working source for maximum efficiency
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
 * Deep recursive scan (Crawl) matching your tool's logic
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
          onLog?.(`Found subfolder: ${item.name}`, 'info');
          subTasks.push(crawl(item.id, item.name));
        } else {
          // Check if it's an image
          const isImage = /\.(jpg|jpeg|png|webp|gif|bmp|tiff|jfif)$/i.test(item.name) || item.mimeType.startsWith('image/');
          if (isImage) files.push(item);
        }
      }
      await Promise.all(subTasks);
    } catch (e: any) {
      onLog?.(`[${name}] Scan Failed: ${e.message}`, 'error');
      // If it's a configuration error, stop the whole crawl
      if (e.message.includes('CONFIG_ERROR') || e.message.includes('API_KEY_INVALID')) {
        throw e;
      }
    }
  }

  onLog?.(`Scanning Directory: ${rootName}...`, 'info');
  await crawl(folderId, rootName);
  return { files, folders };
}

/**
 * Downloads a file using the media endpoint (same as your working tool)
 */
export const downloadDriveFile = async (id: string): Promise<Blob> => {
  const url = `https://www.googleapis.com/drive/v3/files/${id}?alt=media&key=${DRIVE_API_KEY}`;
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

  throw new Error(`Failed to extract asset ${id}. Ensure folder is Shared as 'Anyone with link'.`);
};