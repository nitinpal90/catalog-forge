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
  return match ? match[1] : url.length > 20 ? url : null;
};

async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  if (!DRIVE_API_KEY) {
    throw new Error('System Config Error: API_KEY is missing in environment.');
  }

  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      
      if (res.status === 403) {
        throw new Error('Drive API: 403 Forbidden. Check if folder is public ("Anyone with link") and API Key is valid.');
      }
      if (res.status === 404) {
        throw new Error('Drive API: 404 Not Found. Folder ID might be incorrect.');
      }
      if (res.status === 429) {
        await new Promise(r => setTimeout(r, 2000 * (i + 1))); // Exponential backoff for rate limiting
        continue;
      }
      
      if (!res.ok) throw new Error(`Drive API Error: ${res.status} ${res.statusText}`);
      
      return res;
    } catch (e: any) {
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  throw new Error('Drive Connection Timeout after multiple attempts.');
}

/**
 * Fetches all files in a folder using pagination
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
    
    if (data.error) {
      throw new Error(`Google API: ${data.error.message}`);
    }

    if (data.files) allFiles = allFiles.concat(data.files);
    pageToken = data.nextPageToken;
  } while (pageToken);

  return allFiles;
}

/**
 * Deep recursive scan for images in all subfolders
 */
export async function fetchFolderContents(
  folderId: string,
  rootName: string = "Root",
  onLog?: (msg: string) => void
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
      onLog?.(`Error scanning sub-path ${name}: ${e.message}`);
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

  // Strategy 3: Standard UC view link
  const ucUrl = `https://drive.google.com/uc?export=download&id=${id}`;

  const downloadNodes = [url, proxyUrl, ucUrl];

  for (const node of downloadNodes) {
    try {
      const res = await fetch(node);
      if (res.ok) {
        const b = await res.blob();
        // Validate that we didn't get an HTML error page instead of an image
        if (b.size > 500 && !b.type.includes('html')) return b;
      }
    } catch (e) {
      console.debug(`Node ${node} failed, switching...`);
    }
  }

  throw new Error(`Extraction failed for asset ${id}. Ensure the folder is shared as 'Anyone with the link can view'.`);
};