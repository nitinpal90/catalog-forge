
import React, { useState, useRef } from 'react';
import { LogEntry, ProcessedFile, BatchSummary } from '../../types';
import { smartFetch, downloadBatch, createFinalArchive, getExtension } from '../../services/fileProcessor';
import Terminal from '../Shared/Terminal';
import SheetUploader from '../Shared/SheetUploader';
import { GlobeIcon, DownloadIcon, LoaderIcon, RocketIcon, XIcon, TrashIcon } from '../Icons';

const WebDownloader: React.FC = () => {
  const [linksText, setLinksText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [progress, setProgress] = useState(0);
  const [zipProgress, setZipProgress] = useState(0);
  const [stats, setStats] = useState({ groups: 0, assets: 0, faults: 0 });
  const [results, setResults] = useState<{ files: ProcessedFile[], summaries: BatchSummary[] } | null>(null);
  const [pendingItems, setPendingItems] = useState<{ folderName: string, urls: string[] }[]>([]);
  
  const abortControllerRef = useRef<AbortController | null>(null);

  const addLog = (msg: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => [...prev, { timestamp: new Date(), message: msg, type }].slice(-150));
  };

  const handleSheetData = (items: { folderName: string, urls: string[] }[]) => {
    setPendingItems(items);
    setStats(s => ({ ...s, groups: items.length }));
    addLog(`Sheet detected: ${items.length} groups found. Click 'Start Extraction' to begin.`);
  };

  const processBatch = async () => {
    const rawLinks = linksText.split(/[\n,]/).map(l => l.trim()).filter(l => l.startsWith('http'));
    const items = rawLinks.length > 0 ? [{ folderName: 'Web_Export', urls: rawLinks }] : pendingItems;
    
    if (items.length === 0) return;

    setIsProcessing(true);
    setResults(null);
    setProgress(0);
    setLogs([]);
    setStats({ groups: items.length, assets: 0, faults: 0 });
    
    addLog(`Universal Link Sync Engine v8.0: Active`, 'info');

    const allFiles: ProcessedFile[] = [];
    const summaries: BatchSummary[] = [];
    abortControllerRef.current = new AbortController();

    try {
      for (const item of items) {
        if (abortControllerRef.current.signal.aborted) break;
        
        addLog(`Analyzing SKU: ${item.folderName} (${item.urls.length} links)`);
        const flatForSku = item.urls.map((url, i) => ({ url, folderName: item.folderName, index: i + 1 }));
        
        const { results: skuResults, failed } = await downloadBatch(
          flatForSku,
          async (task, _, sig) => {
            const blob = await smartFetch(task.url, sig);
            const ext = getExtension(blob, task.url);
            return {
              originalName: task.url.split('/').pop() || 'web_asset',
              newName: `${task.folderName.replace(/\s+/g, '_')}_${task.index}.${ext}`,
              blob,
              folder: task.folderName,
              size: blob.size,
              sourceUrl: task.url
            };
          },
          16, 
          undefined,
          abortControllerRef.current.signal
        );

        if (skuResults.length > 0) {
          allFiles.push(...skuResults);
          // ATOMIC UPDATE: Stats jump only after WHOLE SKU group is done
          setStats(s => ({
            ...s,
            assets: s.assets + skuResults.length,
            faults: s.faults + failed
          }));
          addLog(`   > Sync Finished: ${skuResults.length} assets saved.`, 'success');
        } else {
          setStats(s => ({ ...s, faults: s.faults + item.urls.length }));
          addLog(`   > SKU Failed: All resources unreachable.`, 'error');
        }

        summaries.push({
          styleName: item.folderName,
          sourceLink: item.urls[0] || "",
          status: skuResults.length > 0 ? 'Success' : 'Failed',
          filesFound: skuResults.length,
          notes: `${skuResults.length} captured.`
        });

        setProgress(Math.round((summaries.length / items.length) * 100));
      }

      setResults({ files: allFiles, summaries });
      addLog(`Universal Sync Cycle Finished. Assets: ${allFiles.length}`, 'success');
    } catch (err: any) {
      if (err.name === 'AbortError') addLog('Extraction terminated.', 'warning');
      else addLog(`Engine Fault: ${err.message}`, 'error');
    } finally {
      setIsProcessing(false);
      abortControllerRef.current = null;
    }
  };

  const handleZip = async () => {
    if (!results) return;
    setIsProcessing(true);
    addLog("Packaging Universal Archive...");
    try {
      const blob = await createFinalArchive(results.files, results.summaries, (p) => setZipProgress(Math.round(p)));
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `LinkSync_Batch_${Date.now()}.zip`;
      a.click();
      window.URL.revokeObjectURL(url);
      addLog("Export complete.", "success");
    } finally {
      setIsProcessing(false);
      setZipProgress(0);
    }
  };

  const reset = () => {
    setIsProcessing(false);
    setResults(null);
    setProgress(0);
    setLinksText('');
    setLogs([]);
    setPendingItems([]);
    setStats({ groups: 0, assets: 0, faults: 0 });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* STATS GRID */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Groups Loaded', val: stats.groups, color: 'text-blue-500' },
          { label: 'Assets Saved', val: stats.assets, color: 'text-emerald-500' },
          { label: 'Faults/Errors', val: stats.faults, color: 'text-red-500' },
          { label: 'Capture Rate', val: stats.assets > 0 ? `${Math.round((stats.assets / (stats.assets + stats.faults)) * 100)}%` : '0%', color: 'text-slate-400' },
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
                <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-600">
                  <GlobeIcon className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-2xl font-brand font-extrabold dark:text-white leading-tight">Link Sync</h3>
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1 text-blue-500">INDUSTRIAL ENGINE v8.0</p>
                </div>
              </div>
              {(results || linksText || pendingItems.length > 0) && <button onClick={reset} className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full text-slate-400"><XIcon className="w-5 h-5" /></button>}
            </div>

            <SheetUploader onData={handleSheetData} isLoading={isProcessing} label="Upload Universal Data Sheet" />
            
            <div className="mt-8 relative">
               <textarea
                placeholder="Or paste image URLs (one per line)..."
                rows={4}
                className="w-full p-6 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl focus:ring-4 focus:ring-blue-500/10 outline-none transition-all dark:text-white font-mono text-sm resize-none custom-scrollbar"
                value={linksText}
                onChange={(e) => setLinksText(e.target.value)}
                disabled={isProcessing}
              />
            </div>

            {(linksText || pendingItems.length > 0) && !isProcessing && (
              <button
                onClick={processBatch}
                className="mt-6 w-full py-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl flex items-center justify-center gap-3 shadow-xl transition-all"
              >
                <RocketIcon className={`w-6 h-6`} />
                <span className="uppercase tracking-widest text-sm font-black">Start Extraction</span>
              </button>
            )}

            <div className="mt-8">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Total Sync Status</span>
                <span className="text-[10px] font-bold text-indigo-500">{progress}%</span>
              </div>
              <div className="h-2 w-full bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: `${progress}%` }}></div>
              </div>
            </div>
          </div>

          {results && !isProcessing && (
            <button onClick={handleZip} className="w-full py-6 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-[32px] flex items-center justify-center gap-4 shadow-2xl transition-all">
              <DownloadIcon className="w-6 h-6" /> <span className="text-sm uppercase tracking-widest font-extrabold">Save ZIP Archive ({results.files.length} Assets)</span>
            </button>
          )}

          {isProcessing && (
             <div className="bg-white dark:bg-white/5 p-8 rounded-[32px] border border-indigo-500/20 shadow-xl flex items-center gap-5 animate-pulse">
                <LoaderIcon className="w-8 h-8 text-indigo-500 animate-spin" />
                <div className="flex flex-col">
                  <span className="text-xs font-black uppercase tracking-widest dark:text-indigo-400">
                    {zipProgress > 0 ? `Assembling Final Bundle: ${zipProgress}%` : 'Industrial Extraction Active'}
                  </span>
                </div>
             </div>
          )}
        </div>
        <div className="h-[550px]"><Terminal logs={logs} onClear={() => setLogs([])} title="LINK_SYNC_TERMINAL" /></div>
      </div>
    </div>
  );
};

export default WebDownloader;
