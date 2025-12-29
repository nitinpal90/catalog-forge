
import React, { useState, useRef } from 'react';
import { LogEntry, ProcessedFile, DriveFile } from '../types';
// Fix: Import correct members from googleDrive and fileProcessor
import { extractFolderId, fetchFolderContents, downloadDriveFile } from '../services/googleDrive';
import { downloadBatch, createFinalArchive as createZipArchive, getExtension } from '../services/fileProcessor';
import Terminal from './Shared/Terminal';
import SheetUploader from './Shared/SheetUploader';
import { FolderIcon, DownloadIcon, LoaderIcon, CheckCircleIcon, GlobeIcon, XIcon } from './Icons';

const DriveDownloader: React.FC = () => {
  const [url, setUrl] = useState('');
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
    setUrl('');
    addLog('Drive process stopped and batch reset.', 'warning');
  };

  const processDriveFolder = async (folderId: string, signal?: AbortSignal) => {
    try {
      // Fix: Provided 'Drive_Root' as rootName argument so (msg) => addLog(msg) is correctly assigned to onLog parameter
      const { files, folders } = await fetchFolderContents(folderId, 'Drive_Root', (msg) => addLog(msg));
      if (files.length === 0 || signal?.aborted) return [];

      const folderCounters: Record<string, number> = {};
      // Fix: Use destructuring for downloadBatch result and provide correct callback signature
      const { results } = await downloadBatch<DriveFile>(
        files,
        async (file: DriveFile, _, sig) => {
          const blob = await downloadDriveFile(file.id);
          const parentId = file.parents?.[0] || 'root';
          const folderName = folders.get(parentId) || 'Main Folder';
          folderCounters[folderName] = (folderCounters[folderName] || 0) + 1;
          return {
            originalName: file.name,
            newName: `${folderName.replace(/\s+/g, '_')}_${folderCounters[folderName]}.${getExtension(blob, file.name)}`,
            blob,
            folder: folderName,
            size: blob.size,
            sourceUrl: `drive://${file.id}`
          };
        },
        12,
        (done, total) => setProgress(Math.round((done / total) * 100)),
        signal
      );
      return results;
    } catch (err: any) {
      if (err.name !== 'AbortError') addLog(err.message, 'error');
      return [];
    }
  };

  const handleStart = async () => {
    const folderId = extractFolderId(url);
    if (!folderId) return addLog('Invalid Drive Link', 'error');

    setIsProcessing(true);
    setResult(null);
    setProgress(0);
    abortControllerRef.current = new AbortController();
    
    const results = await processDriveFolder(folderId, abortControllerRef.current.signal);
    if (results.length > 0) {
      setResult(results);
      addLog(`Batch complete. ${results.length} images captured.`, 'success');
    }
    setIsProcessing(false);
    abortControllerRef.current = null;
  };

  const handleSheetData = async (data: { folderName: string, urls: string[] }[]) => {
    setIsProcessing(true);
    setResult(null);
    let allResults: ProcessedFile[] = [];
    abortControllerRef.current = new AbortController();
    
    for (const item of data) {
      if (abortControllerRef.current.signal.aborted) break;
      for (const link of item.urls) {
        if (abortControllerRef.current.signal.aborted) break;
        const id = extractFolderId(link);
        if (id) {
          addLog(`Scanning nested Drive path: ${item.folderName}`);
          const res = await processDriveFolder(id, abortControllerRef.current.signal);
          allResults = [...allResults, ...res];
        }
      }
    }
    
    if (allResults.length > 0) {
      setResult(allResults);
      addLog('Bulk Drive sheet sync complete.', 'success');
    }
    setIsProcessing(false);
    abortControllerRef.current = null;
  };

  const handleZip = async () => {
    if (!result) return;
    setIsProcessing(true);
    try {
      // Fix: Use correct createFinalArchive parameters
      const blob = await createZipArchive(result, [], setZipProgress);
      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = dlUrl;
      a.download = `Drive_Catalog_${Date.now()}.zip`;
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
          <div className="flex items-center justify-between mb-10">
            <div className="flex items-center gap-5">
              <div className="w-14 h-14 bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center text-indigo-600">
                <FolderIcon className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-3xl font-brand font-bold dark:text-white leading-none">Drive Sync</h3>
                <p className="text-slate-400 text-sm mt-2 font-medium uppercase tracking-widest">Enterprise Mode</p>
              </div>
            </div>
            {(isProcessing || result) && (
              <button onClick={handleReset} className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-500 text-[10px] font-bold uppercase tracking-widest rounded-full hover:bg-red-500 hover:text-white transition-all">
                <XIcon className="w-3 h-3" /> Reset
              </button>
            )}
          </div>

          <div className="space-y-8">
            <SheetUploader onData={handleSheetData} isLoading={isProcessing} label="Upload Drive Folder Sheet" />
            
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-6 flex items-center pointer-events-none">
                <GlobeIcon className="text-slate-300 w-5 h-5" />
              </div>
              <input
                type="text"
                placeholder="Or paste folder link..."
                className="w-full pl-14 pr-6 py-5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all dark:text-white font-medium"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={isProcessing}
              />
            </div>

            <button
              onClick={handleStart}
              disabled={isProcessing || !url}
              className="w-full py-5 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-xl shadow-indigo-500/20 flex items-center justify-center gap-3 text-lg"
            >
              {isProcessing ? <LoaderIcon className="animate-spin" /> : <DownloadIcon />}
              {isProcessing ? `Syncing ${progress}%` : 'Sync Assets'}
            </button>
          </div>
        </div>

        {result && (
          <div className="bg-indigo-600 rounded-[40px] p-10 text-white shadow-2xl animate-in slide-in-from-bottom-8">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h4 className="text-3xl font-brand font-bold leading-none">Catalog Built</h4>
                <p className="text-indigo-100/70 text-sm mt-2 font-medium uppercase tracking-widest">{result.length} files organized.</p>
              </div>
              <CheckCircleIcon className="w-14 h-14 text-white/20" />
            </div>
            <button
              onClick={handleZip}
              disabled={isProcessing}
              className="w-full py-5 bg-white text-indigo-600 font-bold rounded-2xl flex items-center justify-center gap-3 hover:bg-indigo-50 transition-all shadow-lg text-lg uppercase tracking-widest"
            >
              {zipProgress > 0 ? <LoaderIcon className="animate-spin" /> : <DownloadIcon />}
              {zipProgress > 0 ? `Packaging ${zipProgress}%` : 'Download Organized ZIP'}
            </button>
          </div>
        )}
      </div>

      <div className="h-[600px] lg:h-auto">
        <Terminal logs={logs} onClear={() => setLogs([])} title="DRIVE_ENGINE_V2" />
      </div>
    </div>
  );
};

export default DriveDownloader;
