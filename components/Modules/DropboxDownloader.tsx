
import React, { useState } from 'react';
import JSZip from 'jszip';
import { LogEntry, ProcessedFile, BatchSummary } from '../../types';
import { smartFetch, createFinalArchive, getExtension } from '../../services/fileProcessor';
import Terminal from '../Shared/Terminal';
import SheetUploader from '../Shared/SheetUploader';
import { FileSpreadsheetIcon, DownloadIcon, LoaderIcon, RocketIcon, XIcon, GlobeIcon } from '../Icons';

const DropboxDownloader: React.FC = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState({ rows: 0, processed: 0, imgs: 0, errs: 0 });
  const [progress, setProgress] = useState(0);
  const [zipProgress, setZipProgress] = useState(0);
  const [results, setResults] = useState<{ files: ProcessedFile[], summaries: BatchSummary[] } | null>(null);
  const [url, setUrl] = useState('');

  const addLog = (msg: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => [...prev, { timestamp: new Date(), message: msg, type }].slice(-300));
  };

  const handleUpload = (batch: { folderName: string, urls: string[] }[]) => {
    setResults(null);
    setStats({ rows: batch.length, processed: 0, imgs: 0, errs: 0 });
    setProgress(0);
    addLog(`Dropbox Forge: Batch detected. Starting multi-SKU sync...`, 'success');
    processLinks(batch);
  };

  const processLinks = async (items: { folderName: string, urls: string[] }[]) => {
    if (items.length === 0) return;

    setIsProcessing(true);
    setResults(null);
    setProgress(0);
    setLogs([]);
    addLog(`Dropbox Industrial Forge v3.0 Active`, 'info');

    const allFiles: ProcessedFile[] = [];
    const summaries: BatchSummary[] = [];

    for (const item of items) {
      addLog(`Forging SKU: ${item.folderName}`);
      let filesInThisSku: ProcessedFile[] = [];
      
      try {
        for (const rawLink of item.urls) {
          addLog(`   > Pulling binary stream: ${item.folderName}...`);
          
          const blob = await smartFetch(rawLink);
          
          // Zip detection
          const buffer = await blob.slice(0, 4).arrayBuffer();
          const header = new Uint8Array(buffer);
          const isZip = header[0] === 0x50 && header[1] === 0x4B;

          if (isZip) {
            try {
              addLog(`   > Folder ZIP Captured. Extracting...`, 'info');
              const zip = await JSZip.loadAsync(blob);
              let folderIndex = filesInThisSku.length + 1;
              
              const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
              const entries = (Object.entries(zip.files) as [string, JSZip.JSZipObject][])
                .filter(([path, file]) => !file.dir && /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(path))
                .sort((a, b) => collator.compare(a[0], b[0]));

              for (const [path, fileObj] of entries) {
                const imgData = await fileObj.async('blob');
                const ext = path.split('.').pop()?.toLowerCase() || 'jpg';
                filesInThisSku.push({
                  originalName: path,
                  newName: `${item.folderName}_${folderIndex++}.${ext}`,
                  blob: imgData,
                  folder: item.folderName,
                  size: imgData.size,
                  sourceUrl: rawLink
                });
              }
              addLog(`   > Extraction Success: ${entries.length} assets resolved.`, 'success');
            } catch (zipErr: any) {
              addLog(`   > Extraction Fault: ${zipErr.message}`, 'error');
            }
          } else if (blob.type.startsWith('image/')) {
            const ext = getExtension(blob, rawLink);
            filesInThisSku.push({
              originalName: rawLink.split('/').pop() || 'asset',
              newName: `${item.folderName}_${filesInThisSku.length + 1}.${ext}`,
              blob: blob,
              folder: item.folderName,
              size: blob.size,
              sourceUrl: rawLink
            });
            addLog(`   > Asset Resolved.`, 'success');
          } else {
            addLog(`   > Error: Access Denied (Check Sharing Permissions).`, 'warning');
          }
        }

        allFiles.push(...filesInThisSku);
        const successCount = filesInThisSku.length;
        setStats(s => ({ ...s, imgs: s.imgs + successCount }));

        summaries.push({
          styleName: item.folderName,
          sourceLink: item.urls[0] || "",
          status: successCount > 0 ? 'Success' : 'Failed',
          filesFound: successCount,
          notes: successCount > 0 ? `${successCount} items forged.` : "Resource unreachable."
        });
      } catch (e: any) {
        addLog(`Fault at ${item.folderName}: ${e.message}`, 'error');
        setStats(s => ({ ...s, errs: s.errs + 1 }));
        summaries.push({
          styleName: item.folderName,
          sourceLink: item.urls[0] || "",
          status: 'Failed',
          filesFound: 0,
          notes: e.message
        });
      }

      setStats(s => ({ ...s, processed: s.processed + 1 }));
      setProgress(Math.round((summaries.length / items.length) * 100));
    }

    setResults({ files: allFiles, summaries });
    setIsProcessing(false);
    addLog(`Forge Cycle Complete. Assets Captured: ${allFiles.length}`, 'success');
  };

  const handleZip = async () => {
    if (!results) return;
    setIsProcessing(true);
    addLog("Packaging Final Archive...");
    try {
      const blob = await createFinalArchive(results.files, results.summaries, setZipProgress);
      const dlUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = dlUrl;
      a.download = `DropboxForge_Catalog_${Date.now()}.zip`;
      a.click();
      window.URL.revokeObjectURL(dlUrl);
      addLog("Catalog export ready.", "success");
    } finally {
      setIsProcessing(false);
      setZipProgress(0);
    }
  };

  const reset = () => {
    setResults(null);
    setLogs([]);
    setStats({ rows: 0, processed: 0, imgs: 0, errs: 0 });
    setProgress(0);
    setUrl('');
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Sync Batches', val: stats.rows || (url ? 1 : 0), color: 'text-slate-400' },
          { label: 'Completed', val: stats.processed, color: 'text-blue-500' },
          { label: 'Assets Forged', val: stats.imgs, color: 'text-emerald-500' },
          { label: 'Faults', val: stats.errs, color: 'text-red-500' },
        ].map((s, i) => (
          <div key={i} className="bg-white dark:bg-white/5 p-8 rounded-[32px] border border-slate-100 dark:border-white/5 shadow-xl transition-all">
            <p className="text-[10px] font-bold uppercase tracking-widest mb-2 text-slate-400 opacity-60">{s.label}</p>
            <p className={`text-4xl font-brand font-black ${s.color}`}>{s.val}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-10">
        <div className="space-y-8">
          <div className="bg-white dark:bg-white/5 rounded-[40px] p-10 border border-slate-100 dark:border-white/5 shadow-2xl relative overflow-hidden">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-500">
                  <FileSpreadsheetIcon className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-2xl font-brand font-extrabold dark:text-white leading-tight">Dropbox Forge</h3>
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Industrial Sync Studio</p>
                </div>
              </div>
              {(results || url) && <button onClick={reset} className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full text-slate-400 transition-all"><XIcon className="w-5 h-5" /></button>}
            </div>

            <SheetUploader onData={handleUpload} isLoading={isProcessing} label="Upload Dropbox Sync Sheet" />

            <div className="mt-8 relative">
              <div className="absolute inset-y-0 left-0 pl-6 flex items-center pointer-events-none">
                <GlobeIcon className="text-slate-300 w-5 h-5" />
              </div>
              <input
                type="text"
                placeholder="Paste Dropbox link here..."
                className="w-full pl-14 pr-6 py-5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl focus:ring-4 focus:ring-blue-500/10 outline-none transition-all dark:text-white font-medium"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={isProcessing}
              />
            </div>

            {url && !isProcessing && (
              <button 
                onClick={() => handleUpload([{ folderName: 'Dropbox_Manual', urls: [url] }])}
                className="mt-6 w-full py-6 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl flex items-center justify-center gap-3 shadow-xl transition-all"
              >
                <RocketIcon className="w-6 h-6" />
                <span className="uppercase tracking-widest text-sm font-black">Forge Assets</span>
              </button>
            )}

            <div className="mt-8">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Total Sync</span>
                <span className="text-[10px] font-bold text-blue-500">{progress}%</span>
              </div>
              <div className="h-2 w-full bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${progress}%` }}></div>
              </div>
            </div>
          </div>

          {results && !isProcessing && (
            <button 
              onClick={handleZip} 
              className="w-full py-6 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-[32px] flex items-center justify-center gap-4 shadow-2xl transition-all"
            >
              <DownloadIcon className="w-6 h-6" />
              <span className="text-sm uppercase tracking-widest font-extrabold">Download Final ZIP</span>
            </button>
          )}

          {isProcessing && zipProgress > 0 && (
             <div className="bg-white dark:bg-white/5 p-8 rounded-3xl border border-emerald-500/20 shadow-xl flex items-center gap-4 animate-pulse">
                <LoaderIcon className="w-6 h-6 text-emerald-500 animate-spin" />
                <span className="text-xs font-black uppercase tracking-widest dark:text-emerald-400">Packaging: {zipProgress}%</span>
             </div>
          )}
        </div>
        <div className="h-[550px]"><Terminal logs={logs} onClear={() => setLogs([])} title="DROPBOX_FORGE_TERMINAL" /></div>
      </div>
    </div>
  );
};

export default DropboxDownloader;
