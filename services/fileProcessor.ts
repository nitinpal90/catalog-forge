
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { ProcessedFile, BatchSummary } from '../types';

/**
 * Industrial Bypass Engine v8.0.
 * Combines FetchFlow and DriveFlux logic for maximum reliability.
 */
export const smartFetch = async (url: string, signal?: AbortSignal): Promise<Blob> => {
  let target = url.trim();

  // Dropbox Logic: Force direct download download
  if (target.includes('dropbox.com')) {
    target = target.replace('www.dropbox.com', 'dl.dropboxusercontent.com');
    if (target.includes('dl=0')) target = target.replace('dl=0', 'dl=1');
    else if (!target.includes('dl=1')) target += (target.includes('?') ? '&' : '?') + 'dl=1';
  }

  // Industrial proxy sequence
  const engines = [
    // 1. Web Image CDN (CORS Bypass via wsrv.nl)
    `https://wsrv.nl/?url=${encodeURIComponent(target)}&output=jpg&q=100`,
    // 2. Industrial Proxy
    `https://corsproxy.io/?${encodeURIComponent(target)}`,
    // 3. Raw Origin
    `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`,
    // 4. Direct (Try last as it often fails in browser)
    target
  ];

  for (const engineUrl of engines) {
    try {
      const res = await fetch(engineUrl, { signal });
      if (res.ok) {
        const blob = await res.blob();
        // Validation: Block HTML error pages
        if (blob.size > 100 && !blob.type.includes('html')) return blob;
      }
    } catch (e: any) {
      if (e.name === 'AbortError') throw e;
    }
  }
  throw new Error("Target blocked or unreachable.");
};

export const getExtension = (blob: Blob, url: string): string => {
  const mimeMap: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp'
  };
  if (mimeMap[blob.type]) return mimeMap[blob.type];
  const urlExt = url.split(/[#?]/)[0].split('.').pop()?.toLowerCase() || 'jpg';
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(urlExt) ? urlExt : 'jpg';
};

export const downloadBatch = async <T>(
  items: T[],
  downloadFn: (item: T, index: number, signal?: AbortSignal) => Promise<ProcessedFile>,
  concurrency = 16,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal
): Promise<{ results: ProcessedFile[], failed: number }> => {
  const results: ProcessedFile[] = [];
  const total = items.length;
  let done = 0;
  let failedCount = 0;
  const queue = [...items.map((item, index) => ({ item, index }))];
  
  const workers = Array(Math.min(concurrency, items.length)).fill(null).map(async () => {
    while (queue.length > 0) {
      if (signal?.aborted) break;
      const task = queue.shift();
      if (!task) break;
      try {
        const res = await downloadFn(task.item, task.index, signal);
        results.push(res);
      } catch (e) {
        failedCount++;
      } finally {
        done++;
        onProgress?.(done, total);
      }
    }
  });

  await Promise.all(workers);
  return { results, failed: failedCount };
};

export const createFinalArchive = async (
  files: ProcessedFile[],
  summaries: BatchSummary[],
  onProgress: (p: number) => void
): Promise<Blob> => {
  const zip = new JSZip();
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const sortedFiles = [...files].sort((a, b) => collator.compare(a.newName, b.newName));

  sortedFiles.forEach(f => {
    const folder = zip.folder(f.folder);
    if (folder) folder.file(f.newName, f.blob);
  });

  if (summaries && summaries.length > 0) {
    const ws = XLSX.utils.json_to_sheet(summaries.map(s => ({
      "SKU": s.styleName,
      "Status": s.status,
      "Files": s.filesFound,
      "URL": s.sourceLink,
      "Date": new Date().toLocaleString()
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sync_Report");
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    zip.file("SYNC_REPORT.xlsx", excelBuffer);
  }

  return await zip.generateAsync({ type: 'blob', compression: "STORE" }, (meta) => {
    onProgress(meta.percent);
  });
};
