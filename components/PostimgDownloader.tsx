
import React, { useState } from 'react';
import { LogEntry, ProcessedFile } from '../types';
// Fix: Use correct exported members from fileProcessor
import { downloadBatch, createFinalArchive as createZipArchive, getExtension } from '../services/fileProcessor';
import Terminal from './Shared/Terminal';
import SheetUploader from './Shared/SheetUploader';
import { CloudDownloadIcon, DownloadIcon, LoaderIcon, CheckCircleIcon, TrashIcon, AlertCircleIcon } from './Icons';

const PostimgDownloader: React.FC = () => {
  const [url, setUrl] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [progress, setProgress] = useState(0);
  const [zipProgress, setZipProgress] = useState(0);
  const [result, setResult] = useState<ProcessedFile[] | null>(null);

  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => [...prev, { timestamp: new Date(), message, type }]);
  };

  const processPostimg = async (links: { folderName: string, urls: string[] }[]) => {
    setIsProcessing(true);
    setResult(null);
    setLogs([]);
    
    const flat = links.flatMap(item => item.urls.map((url, i) => ({ url, folderName: item.folderName, index: i + 1 })));

    // Fix: Use destructuring for downloadBatch result
    const { results } = await downloadBatch(
      flat,
      async (item) => {
        // Resolve direct high-res link pattern for Postimg
        const directLink = item.url.replace('/postimg.cc/', '/i.postimg.cc/').replace('.cc/', '.cc/direct/');
        const response = await fetch(directLink);
        if (!response.ok) throw new Error(`Status ${response.status}`);
        const blob = await response.blob();
        const ext = getExtension(blob, item.url);
        
        return {
          originalName: item.url.split('/').pop() || 'postimg_asset',
          newName: `${item.folderName.replace(/\s+/g, '_')}_${item.index}.${ext}`,
          blob,
          folder: item.folderName,
          size: blob.size,
          sourceUrl: item.url
        };
      },
      8,
      (done, total) => setProgress(Math.round((done / total) * 100))
    );

    setResult(results);
    addLog(`Postimg batch sync complete. Collected: ${results.length}`, 'success');
    setIsProcessing(false);
  };

  const handleStart = () => {
    if (!url.includes('postimg.cc')) return addLog('Invalid Link', 'error');
    processPostimg([{ folderName: 'Postimg_Album', urls: [url] }]);
  };

  const handleSheetData = (data: { folderName: string, urls: string[] }[]) => {
    processPostimg(data);
  };

  const handleZip = async () => {
    if (!result) return;
    setIsProcessing(true);
    try {
      // Fix: Use createFinalArchive correctly
      const blob = await createZipArchive(result, [], setZipProgress);
      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = dlUrl;
      a.download = `Postimg_Export_${Date.now()}.zip`;
      a.click();
    } finally {
      setIsProcessing(false);
      setZipProgress(0);
    }
  };

  return (
    <div className="grid lg:grid-cols-2 gap-12 h-full">
      <div className="space-y-10">
        <div className="bg-white dark:bg-white/5 rounded-[40px] p-10 border border-slate-100 dark:border-white/5 shadow-2xl">
           <div className="flex items-center gap-5 mb-10">
            <div className="w-14 h-14 bg-purple-50 dark:bg-purple-900/30 rounded-2xl flex items-center justify-center text-purple-600">
              <CloudDownloadIcon className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-3xl font-brand font-bold dark:text-white leading-none">Postimg Hub</h3>
              <p className="text-slate-400 text-sm mt-2 font-medium uppercase tracking-widest">Gallery Mode</p>
            </div>
          </div>

          <div className="space-y-8">
            <SheetUploader onData={handleSheetData} isLoading={isProcessing} label="Upload Postimg Asset Sheet" />
            
            <div className="relative">
              <input
                type="text"
                placeholder="Paste Postimg album or image link..."
                className="w-full pl-6 pr-6 py-5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl focus:ring-4 focus:ring-purple-500/10 outline-none transition-all dark:text-white font-medium"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>

            <button
              onClick={handleStart}
              disabled={isProcessing || !url}
              className="w-full py-5 bg-purple-600 text-white font-bold rounded-2xl hover:bg-purple-700 disabled:opacity-50 transition-all shadow-xl shadow-purple-500/20 flex items-center justify-center gap-3 text-lg"
            >
              {isProcessing ? <LoaderIcon className="animate-spin" /> : <DownloadIcon />}
              {isProcessing ? `Capturing... ${progress}%` : 'Sync Gallery'}
            </button>
          </div>
        </div>

        {result && (
          <div className="bg-purple-600 rounded-[40px] p-10 text-white shadow-2xl animate-in slide-in-from-bottom-8 duration-500">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h4 className="text-3xl font-brand font-bold leading-none">Album Captured</h4>
                <p className="text-purple-100/70 text-sm mt-2 font-medium">{result.length} high-res assets synced.</p>
              </div>
              <CheckCircleIcon className="w-14 h-14 text-white/20" />
            </div>
            <button
              onClick={handleZip}
              disabled={isProcessing}
              className="w-full py-5 bg-white text-purple-600 font-bold rounded-2xl flex items-center justify-center gap-3 hover:bg-purple-50 transition-all shadow-lg text-lg"
            >
              {zipProgress > 0 ? <LoaderIcon className="animate-spin" /> : <DownloadIcon />}
              {zipProgress > 0 ? `Compressing... ${zipProgress}%` : 'Download Professional ZIP'}
            </button>
          </div>
        )}
      </div>

      <div className="h-[600px] lg:h-auto">
        <Terminal logs={logs} onClear={() => setLogs([])} title="POSTIMG_SYNC_ENGINE" />
      </div>
    </div>
  );
};

export default PostimgDownloader;
