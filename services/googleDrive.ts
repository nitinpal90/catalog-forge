import { DriveFile } from '../types';

/**
 * Accesses API_KEY from the environment.
 */
const DRIVE_API_KEY = process.env.API_KEY;

/**
 * Exact ID extraction logic from your working script.
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
 * Robust fetcher matching your working engine's direct call style.
 */
async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  // Guard against missing key
  if (!DRIVE_API_KEY || DRIVE_API_KEY === "" || DRIVE_API_KEY === "undefined") {
    throw new Error('CONFIG_ERROR: API_KEY is missing in your environment settings.');
  }

  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      
      if (res.status === 403 || res.status === 429) {
        await delay(1000 * (i + 1));
        continue;
      }
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }));
        if (errorData.error?.message?.includes('API key not valid')) {
          throw new Error('API_KEY_INVALID: Your Google API Key is rejected. Check Cloud Console.');
        }
        throw new Error(errorData.error?.message || 'Access Denied');
      }
      
      return res;
    } catch (e: any) {
      if (e.message.includes('API_KEY_INVALID')) throw e;
      if (i === retries - 1) throw e;
      await delay(500);
    }
  }
  throw new Error('Connection failed after multiple retries.');
}

/**
 * Industrial Pagination Logic: Handles 100+ files per folder.
 * Matches your working tool's 'fetchAllFiles' function.
 */
export async function fetchAllInFolder(folderId: string): Promise<DriveFile[]> {
  let allFiles: DriveFile[] = [];
  let pageToken: string | null = null;

  do {
    const query = `'${folderId}' in parents and trashed=false`;
    // Added 'parents' to fields to enable parent-child mapping for structured naming
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
 * Deep Crawl Logic: Matches your 'crawlFolder' function.
 * Recursively locates all images in all subdirectories and collects folder metadata.
 * Returns both files and a map of folder IDs to names for structured renaming.
 */
export async function fetchFolderContents(
  folderId: string,
  rootName: string = "Root",
  onLog?: (msg: string, type?: 'info' | 'success' | 'error' | 'warning') => void
): Promise<{ files: DriveFile[]; folders: Map<string, string> }> {
  const files: DriveFile[] = [];
  const folders = new Map<string, string>();
  folders.set(folderId, rootName);

  async function crawl(id: string) {
    try {
      const items = await fetchAllInFolder(id);
      for (const item of items) {
        if (item.mimeType === 'application/vnd.google-apps.folder') {
          onLog?.(`Scanning Subdirectory: ${item.name}`, 'info');
          // Map folder ID to name for subsequent lookup in renaming logic
          folders.set(item.id, item.name);
          await crawl(item.id);
        } else {
          const isImage = /\.(jpg|jpeg|png|webp|gif|bmp|tiff|jfif)$/i.test(item.name) || 
                          item.mimeType.startsWith('image/');
          if (isImage) files.push(item);
        }
      }
    } catch (e: any) {
      onLog?.(`Scan error in folder ${id}: ${e.message}`, 'error');
      if (e.message.includes('API_KEY_INVALID')) throw e;
    }
  }

  onLog?.(`Initializing Scan: ${rootName}...`, 'info');
  await crawl(folderId);
  return { files, folders };
}

/**
 * High-Speed Binary Extraction: Downloads files directly.
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
    // Failover for strict network environments
    const proxyUrl = `https://wsrv.nl/?url=${encodeURIComponent(`https://drive.google.com/uc?export=download&id=${id}`)}&output=jpg&q=100`;
    const res = await fetch(proxyUrl);
    if (res.ok) return await res.blob();
  }

  throw new Error(`Extraction failed for ${id}. Check file sharing permissions.`);
};