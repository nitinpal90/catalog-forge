import React, { useState, useRef } from 'react';
import { LogEntry, ProcessedFile, DriveFile, BatchSummary } from '../../types';
import { extractFolderId, fetchFolderContents, downloadDriveFile } from '../../services/googleDrive';
import { downloadBatch, createFinalArchive, getExtension } from '../../services/fileProcessor';
import Terminal from '../Shared/Terminal';
import SheetUploader from '../Shared/SheetUploader';
import { FolderIcon, DownloadIcon, LoaderIcon, RocketIcon, XIcon, GlobeIcon } from '../Icons';

const DriveDownloader: React.FC = () => {
  const [url, setUrl] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState({ skus: 0, processed: 0, assets: 0, errors: 0 });
  const [progress, setProgress] = useState(0);
  const [zipProgress, setZipProgress] = useState(0);
  const [results, setResults] = useState<{ files: ProcessedFile[], summaries: BatchSummary[] } | null>(null);
  const [activeTask, setActiveTask] = useState('');
  const [pendingItems, setPendingItems] = useState<{ folderName: string, urls: string[] }[]>([]);

  const abortControllerRef = useRef<AbortController | null>(null);

  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => [...prev, { timestamp: new Date(), message, type }].slice(-150));
  };

  const handleSheetData = (items: { folderName: string, urls: string[] }[]) => {
    setPendingItems(items);
    setStats(s => ({ ...s, skus: items.length }));
    addLog(`Sheet loaded: ${items.length} SKUs detected. Click 'Start Full Sync' to begin.`, 'info');
  };

  const reset = () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    setResults(null);
    setLogs([]);
    setStats({ skus: 0, processed: 0, assets: 0, errors: 0 });
    setProgress(0);
    setUrl('');
    setActiveTask('');
    setPendingItems([]);
    addLog('System reset. Awaiting new instructions.', 'info');
  };

  const processBatch = async () => {
    const items = url ? [{ folderName: 'Manual_Sync', urls: [url] }] : pendingItems;
    if (items.length === 0) return;
    
    setIsProcessing(true);
    setResults(null);
    setProgress(0);
    setLogs([]);
    setStats({ skus: items.length, processed: 0, assets: 0, errors: 0 });
    
    abortControllerRef.current = new AbortController();
    const allFiles: ProcessedFile[] = [];
    const summaries: BatchSummary[] = [];

    addLog(`Drive Forge v8.5: Initiating Production Sync...`, 'success');

    for (const item of items) {
      if (abortControllerRef.current?.signal.aborted) break;

      const safeFolderName = item.folderName.trim().replace(/\s+/g, '_') || "Uncategorized";
      setActiveTask(`Syncing SKU: ${safeFolderName}`);
      addLog(`Capturing Catalog Path: ${safeFolderName}`);
      
      try {
        const folderId = extractFolderId(item.urls[0]);
        if (!folderId) throw new Error(`Invalid Drive Link in row "${item.folderName}". Ensure column B contains a valid link.`);

        // Fix: Explicitly type the parameters of the onLog callback passed to fetchFolderContents.
        const { files, folders } = await fetchFolderContents(folderId, safeFolderName, (msg: string, type?: LogEntry['type']) => addLog(msg, type));
        
        if (files.length === 0) {
          addLog(`   > SKU Warning: No images detected. Ensure folder is Shared as "Anyone with link".`, 'warning');
          setStats(s => ({ ...s, processed: s.processed + 1 }));
          summaries.push({ styleName: safeFolderName, sourceLink: item.urls[0], status: 'Failed', filesFound: 0, notes: "No images found." });
        } else {
          addLog(`   > Resolved ${files.length} images. Streaming binary packets...`);

          const { results: downloadedFiles, failed } = await downloadBatch<DriveFile>(
            files,
            async (df, idx) => {
              const blob = await downloadDriveFile(df.id);
              const parentName = folders.get(df.parents?.[0] || "") || safeFolderName;
              const ext = getExtension(blob, df.name);
              
              return {
                originalName: df.name,
                newName: `${parentName}_${idx + 1}.${ext}`,
                blob,
                folder: parentName,
                size: blob.size
              };
            },
            10, // Concurrency 10 for high stability
            undefined,
            abortControllerRef.current?.signal || undefined
          );

          if (downloadedFiles.length > 0) {
            allFiles.push(...downloadedFiles);
            setStats(s => ({ 
              ...s, 
              processed: s.processed + 1, 
              assets: s.assets + downloadedFiles.length,
              errors: s.errors + failed
            }));
            addLog(`   > SKU Finished: ${downloadedFiles.length} assets synced.`, 'success');
          } else {
            addLog(`   > Error: All items failed to download. Check sharing settings.`, 'error');
            setStats(s => ({ ...s, processed: s.processed + 1, errors: s.errors + files.length }));
          }

          summaries.push({
            styleName: safeFolderName,
            sourceLink: item.urls[0],
            status: downloadedFiles.length > 0 ? (failed > 0 ? 'Partial' : 'Success') : 'Failed',
            filesFound: downloadedFiles.length,
            notes: failed > 0 ? `${failed} items failed.` : "Sync complete."
          });
        }
      } catch (e: any) {
        addLog(`   > Sync Error at ${safeFolderName}: ${e.message}`, 'error');
        setStats(s => ({ ...s, errors: s.errors + 1, processed: s.processed + 1 }));
        summaries.push({ styleName: safeFolderName, sourceLink: item.urls[0], status: 'Failed', filesFound: 0, notes: e.message });
        
        // If it's a configuration error (API Key), stop everything
        if (e.message.includes('API_KEY')) break;
      }
      setProgress(Math.round((summaries.length / items.length) * 100));
    }

    if (allFiles.length > 0) {
      setResults({ files: allFiles, summaries });
      addLog(`Global Sync Successful. Captured ${allFiles.length} assets.`, 'success');
    } else {
      addLog(`Fatal Error: 0 assets yielded. Verify project settings.`, 'error');
    }
    
    setIsProcessing(false);
    setActiveTask('');
  };

  const handleZip = async () => {
    if (!results) return;
    setIsProcessing(true);
    addLog(`Packaging Catalog ZIP...`);
    try {
      const blob = await createFinalArchive(results.files, results.summaries, (p) => setZipProgress(Math.round(p)));
      const dlUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = dlUrl;
      a.download = `DriveForge_Catalog_${Date.now()}.zip`;
      a.click();
      window.URL.revokeObjectURL(dlUrl);
      addLog("Catalog export successful.", "success");
    } catch (e: any) {
      addLog(`Zip Error: ${e.message}`, 'error');
    } finally {
      setIsProcessing(false);
      setZipProgress(0);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Total SKUs', val: stats.skus, color: 'text-slate-400' },
          { label: 'Completed', val: stats.processed, color: 'text-indigo-500' },
          { label: 'Images Saved', val: stats.assets, color: 'text-emerald-500' },
          { label: 'Errors', val: stats.errors, color: 'text-red-500' },
        ].map((s, i) => (
          <div key={i} className="bg-white dark:bg-white/5 p-8 rounded-[32px] border border-slate-100 dark:border-white/5 shadow-xl transition-all">
            <p className="text-[10px] font-bold uppercase tracking-widest mb-1 text-slate-400 opacity-60">{s.label}</p>
            <p className={`text-4xl font-brand font-black ${s.color}`}>{s.val}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-10">
        <div className="space-y-8">
          <div className="bg-white dark:bg-white/5 rounded-[40px] p-10 border border-slate-100 dark:border-white/5 shadow-2xl relative overflow-hidden">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center text-indigo-500">
                  <FolderIcon className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-2xl font-brand font-extrabold dark:text-white leading-tight">Drive Forge</h3>
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-1 text-indigo-500 underline decoration-indigo-500 underline-offset-4">Industrial Engine v8.5</p>
                </div>
              </div>
              {(results || url || pendingItems.length > 0) && <button onClick={reset} className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full text-slate-400 transition-all active:rotate-180"><XIcon className="w-5 h-5" /></button>}
            </div>

            <SheetUploader onData={handleSheetData} isLoading={isProcessing} label="Upload Excel Data Source" />
            
            <div className="mt-8 relative text-slate-400">
              <div className="absolute inset-y-0 left-0 pl-6 flex items-center pointer-events-none">
                <GlobeIcon className="w-5 h-5" />
              </div>
              <input
                type="text"
                placeholder="Or paste direct Drive folder link..."
                className="w-full pl-14 pr-6 py-5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all dark:text-white font-medium shadow-inner"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={isProcessing}
              />
            </div>

            {(url || pendingItems.length > 0) && !isProcessing && (
              <button 
                onClick={processBatch}
                className="mt-6 w-full py-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl flex items-center justify-center gap-3 shadow-xl shadow-indigo-500/20 transition-all active:scale-95"
              >
                <RocketIcon className="w-6 h-6" />
                <span className="uppercase tracking-widest text-sm font-black">Start Full Sync</span>
              </button>
            )}

            <div className="mt-8">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Sync Progress</span>
                <span className="text-[10px] font-bold text-indigo-500">{progress}%</span>
              </div>
              <div className="h-2 w-full bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: `${progress}%` }}></div>
              </div>
            </div>
          </div>

          {results && !isProcessing && (
            <button onClick={handleZip} className="w-full py-6 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-[32px] flex items-center justify-center gap-4 shadow-2xl transition-all active:scale-95 group">
              <DownloadIcon className="w-6 h-6 group-hover:translate-y-1 transition-transform" /> 
              <span className="text-sm uppercase tracking-widest font-extrabold">Save ZIP Archive ({results.files.length} Assets)</span>
            </button>
          )}

          {isProcessing && (
             <div className="bg-white dark:bg-white/5 p-8 rounded-[32px] border border-indigo-500/20 shadow-xl flex items-center gap-5 animate-pulse">
                <LoaderIcon className="w-8 h-8 text-indigo-500 animate-spin" />
                <div className="flex flex-col">
                  <span className="text-xs font-black uppercase tracking-widest dark:text-indigo-400">
                    {zipProgress > 0 ? `Assembling Bundle: ${zipProgress}%` : 'Industrial Extraction Active'}
                  </span>
                  {activeTask && <span className="text-slate-400 text-[9px] font-bold uppercase truncate max-w-[250px]">{activeTask}</span>}
                </div>
             </div>
          )}
        </div>
        <div className="h-[550px]"><Terminal logs={logs} onClear={() => setLogs([])} title="DRIVE_FORGE_CONSOLE" /></div>
      </div>
    </div>
  );
};

export default DriveDownloader;