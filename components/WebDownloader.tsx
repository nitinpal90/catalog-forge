
import React, { useState, useRef } from 'react';
import { LogEntry, ProcessedFile } from '../types';
// Fix: Use correct exported members from fileProcessor
import { downloadBatch, createFinalArchive as createZipArchive, getExtension } from '../services/fileProcessor';
import Terminal from './Shared/Terminal';
import SheetUploader from './Shared/SheetUploader';
import { DownloadIcon, LoaderIcon, CheckCircleIcon, TrashIcon, GlobeIcon, AlertCircleIcon, XIcon } from './Icons';

const WebDownloader: React.FC = () => {
  const [linksText, setLinksText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [progress, setProgress] = useState(0);
  const [zipProgress, setZipProgress] = useState(0);
  const [result, setResult] = useState<ProcessedFile[] | null>(null);
  
  const abortControllerRef = useRef<AbortController | null>(null);

  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => [...prev, { timestamp: new Date(), message, type }]);
  };

  const handleReset = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsProcessing(false);
    setResult(null);
    setProgress(0);
    setZipProgress(0);
    setLinksText('');
    addLog('Process reset and batch cleared.', 'warning');
  };

  const processBatch = async (items: { folderName: string, urls: string[] }[]) => {
    setIsProcessing(true);
    setResult(null);
    setProgress(0);
    setLogs([]);
    addLog(`Initiating web extraction for ${items.length} groups...`);

    const flatItems = items.flatMap(item => 
      item.urls.map((url, i) => ({ url, folderName: item.folderName, index: i + 1 }))
    );

    abortControllerRef.current = new AbortController();

    try {
      // Fix: Destructure results and failed, provide correct callback signature
      const { results, failed } = await downloadBatch(
        flatItems,
        async (item, _, sig) => {
          const response = await fetch(item.url, { signal: sig });
          if (!response.ok) throw new Error(`${response.status}`);
          const blob = await response.blob();
          const ext = getExtension(blob, item.url);
          return {
            originalName: item.url.split('/').pop() || 'image',
            newName: `${item.folderName.replace(/\s+/g, '_')}_${item.index}.${ext}`,
            blob,
            folder: item.folderName,
            size: blob.size,
            sourceUrl: item.url
          };
        },
        12,
        (done, total) => setProgress(Math.round((done / total) * 100)),
        abortControllerRef.current.signal
      );

      if (results.length > 0) {
        setResult(results);
        addLog(`Finished. Success: ${results.length}, Failed: ${failed}`, failed > 0 ? 'warning' : 'success');
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        addLog('Download session aborted by user.', 'warning');
      } else {
        addLog(`Error: ${err.message}`, 'error');
      }
    } finally {
      setIsProcessing(false);
      abortControllerRef.current = null;
    }
  };

  const handleStart = () => {
    const rawLinks = linksText.split(/[\n,]/).map(l => l.trim()).filter(l => l.startsWith('http'));
    if (rawLinks.length === 0) return addLog('No valid http/https links found.', 'error');
    processBatch([{ folderName: 'Web_Downloads', urls: rawLinks }]);
  };

  const handleZip = async () => {
    if (!result) return;
    setIsProcessing(true);
    try {
      // Fix: Use correct parameters for createFinalArchive
      const blob = await createZipArchive(result, [], setZipProgress);
      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = dlUrl;
      a.download = `WebExport_${Date.now()}.zip`;
      a.click();
      addLog('ZIP export successful.', 'success');
    } catch (err: any) {
      addLog(`Export Error: ${err.message}`, 'error');
    } finally {
      setIsProcessing(false);
      setZipProgress(0);
    }
  };

  return (
    <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 min-h-[600px] items-start pb-12">
      <div className="space-y-8">
        <div className="bg-white dark:bg-[#0f111a] rounded-[40px] p-8 lg:p-10 border border-slate-100 dark:border-white/5 shadow-2xl">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-5">
              <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center text-blue-600">
                <GlobeIcon className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-2xl font-brand font-bold dark:text-white leading-tight">Direct Web</h3>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Multi-Link Extraction</p>
              </div>
            </div>
            {(isProcessing || result) && (
              <button 
                onClick={handleReset}
                className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-500 text-[10px] font-bold uppercase tracking-widest rounded-full hover:bg-red-500 hover:text-white transition-all"
              >
                <XIcon className="w-3 h-3" /> Reset Batch
              </button>
            )}
          </div>

          <div className="space-y-6">
            <SheetUploader onData={(data) => processBatch(data)} isLoading={isProcessing} label="Bulk Link Sheet Upload" />
            
            <div className="relative group">
               <textarea
                placeholder="Or paste direct image URLs (one per line)..."
                rows={5}
                className="w-full p-6 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl focus:ring-4 focus:ring-blue-500/10 outline-none transition-all dark:text-white font-mono text-sm resize-none custom-scrollbar"
                value={linksText}
                onChange={(e) => setLinksText(e.target.value)}
                disabled={isProcessing}
              />
            </div>

            <div className="flex gap-4">
              <button 
                onClick={() => setLinksText('')}
                disabled={isProcessing || !linksText}
                className="px-6 py-5 bg-slate-100 dark:bg-white/5 text-slate-500 rounded-2xl hover:bg-slate-200 dark:hover:bg-white/10 transition-colors disabled:opacity-30"
              >
                <TrashIcon />
              </button>
              <button
                onClick={handleStart}
                disabled={isProcessing || !linksText}
                className="flex-grow py-5 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 disabled:opacity-50 transition-all shadow-xl shadow-blue-500/20 flex items-center justify-center gap-3 text-sm lg:text-base uppercase tracking-widest"
              >
                {isProcessing ? <LoaderIcon className="animate-spin" /> : <DownloadIcon />}
                {isProcessing ? `Fetching ${progress}%` : 'Extract Assets'}
              </button>
            </div>
          </div>
        </div>

        {result && (
          <div className="bg-emerald-600 rounded-[32px] p-8 text-white shadow-2xl animate-in slide-in-from-bottom-8">
             <div className="flex justify-between items-center mb-8">
              <div>
                <h4 className="text-2xl font-brand font-bold leading-none">Extraction Finished</h4>
                <p className="text-emerald-100/70 text-sm mt-3 font-medium uppercase tracking-widest">{result.length} Assets Collected</p>
              </div>
              <CheckCircleIcon className="w-12 h-12 text-white/30" />
            </div>
            <button
              onClick={handleZip}
              disabled={isProcessing}
              className="w-full py-5 bg-white text-emerald-600 font-bold rounded-2xl flex items-center justify-center gap-3 hover:bg-emerald-50 transition-all shadow-lg text-base uppercase tracking-widest"
            >
              {zipProgress > 0 ? <LoaderIcon className="animate-spin" /> : <DownloadIcon />}
              {zipProgress > 0 ? `Packaging... ${zipProgress}%` : 'Download Professional ZIP'}
            </button>
          </div>
        )}

        <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30 rounded-3xl p-6">
          <div className="flex gap-4">
            <AlertCircleIcon className="w-6 h-6 text-amber-600 shrink-0" />
            <div className="space-y-2">
              <h5 className="text-sm font-bold text-amber-900 dark:text-amber-400 uppercase tracking-widest">CORS Policy Warning</h5>
              <p className="text-xs text-amber-800/80 dark:text-amber-500 leading-relaxed font-medium">
                Browsers may block downloads from external providers like Postimg or private CDNs. If you encounter fetch errors, use the <span className="font-bold underline">CORS Unblock</span> extension or use a different source.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="h-[600px] lg:h-[700px] sticky top-32">
        <Terminal logs={logs} onClear={() => setLogs([])} title="WEB_EXTRACT_ENGINE" />
      </div>
    </div>
  );
};

export default WebDownloader;
