import { DriveFile } from '../types';

/**
 * Industrial Security: 
 * Accesses API_KEY from the environment.
 * The key is obtained exclusively from process.env.API_KEY.
 */
const DRIVE_API_KEY = process.env.API_KEY;

export const extractFolderId = (url: string): string | null => {
  if (!url) return null;
  const match = url.match(/\/folders\/([a-zA-Z0-9-_]+)/) || 
                url.match(/id=([a-zA-Z0-9-_]+)/) ||
                url.match(/([a-zA-Z0-9-_]{25,})/);
  return match ? match[1] : null;
};

async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (res.status === 403 || res.status === 429) {
        await new Promise(r => setTimeout(r, 1500 * (i + 1)));
        continue;
      }
      return res;
    } catch (e: any) {
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  throw new Error('Drive Connection Timeout');
}

/**
 * Fetches all files in a folder using pagination (Fix for 100+ files)
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
  }

  onLog?.(`Analyzing Architecture: ${rootName}`);
  await crawl(folderId, rootName);
  return { files, folders };
}

export const downloadDriveFile = async (id: string): Promise<Blob> => {
  const url = `https://www.googleapis.com/drive/v3/files/${id}?alt=media&key=${DRIVE_API_KEY}`;
  try {
    const res = await fetch(url);
    if (res.ok) {
      const b = await res.blob();
      if (b.size > 100 && !b.type.includes('html')) return b;
    }
  } catch (e) {
    console.debug(`Drive API fetch failed for ${id}, switching to failover...`);
  }

  const failoverUrls = [
    `https://wsrv.nl/?url=${encodeURIComponent(`https://drive.google.com/uc?export=download&id=${id}`)}&output=jpg&q=100`,
    `https://corsproxy.io/?${encodeURIComponent(`https://drive.google.com/uc?export=download&id=${id}`)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://drive.google.com/uc?export=download&id=${id}`)}`
  ];

  for (const fUrl of failoverUrls) {
    try {
      const res = await fetch(fUrl);
      if (res.ok) {
        const b = await res.blob();
        if (b.size > 100 && !b.type.includes('html')) return b;
      }
    } catch (e) {}
  }

  throw new Error("Resource extraction failed across all nodes.");
};