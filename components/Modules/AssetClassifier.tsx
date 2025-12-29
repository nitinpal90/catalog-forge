
import React, { useState, useRef } from 'react';
import { LogEntry, ProcessedFile } from '../../types';
import { createFinalArchive } from '../../services/fileProcessor';
import Terminal from '../Shared/Terminal';
import { LayoutGridIcon, DownloadIcon, LoaderIcon, XIcon, FolderIcon } from '../Icons';

const AssetClassifier: React.FC = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState({ files: 0, skus: 0, unmatched: 0 });
  const [progress, setProgress] = useState(0);
  const [zipProgress, setZipProgress] = useState(0);
  const [results, setResults] = useState<ProcessedFile[] | null>(null);
  
  const folderInputRef = useRef<HTMLInputElement>(null);

  const addLog = (msg: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => [...prev, { timestamp: new Date(), message: msg, type }].slice(-250));
  };

  /**
   * Industrial Asset Classifier & Renamer
   * 1. Groups files by SKU prefix
   * 2. Sorts files naturally within groups
   * 3. Renames to [FOLDERNAME]_[INDEX].[EXT]
   */
  const classifyAndRenameFolder = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFiles = e.target.files;
    if (!rawFiles || rawFiles.length === 0) return;

    setIsProcessing(true);
    setResults(null);
    setLogs([]);
    setStats({ files: 0, skus: 0, unmatched: 0 });
    
    addLog(`Forge Engine Initialized: Analyzing ${rawFiles.length} file entries...`, 'info');
    
    const fileArray = Array.from(rawFiles) as File[];
    const groups: Record<string, File[]> = {};
    let unmatchedCount = 0;

    // Step 1: Initial Grouping & Validation
    fileArray.forEach((file) => {
      const fileName = file.name;
      if (fileName.startsWith('.') || fileName.startsWith('__')) return;
      if (!/\.(jpg|jpeg|png|webp)$/i.test(fileName)) return;

      const parts = fileName.split('_');
      let folderName = "UNMATCHED";
      
      if (parts.length > 1) {
        const prefix = parts[0].trim();
        if (prefix) {
          folderName = prefix;
        } else {
          unmatchedCount++;
        }
      } else {
        unmatchedCount++;
      }

      if (!groups[folderName]) groups[folderName] = [];
      groups[folderName].push(file);
    });

    // Step 2: Natural Sorting and Sequence Renaming
    const finalProcessed: ProcessedFile[] = [];
    const skuList = Object.keys(groups).filter(k => k !== "UNMATCHED");

    Object.keys(groups).forEach((folderName) => {
      // Natural Alphanumeric Sort (e.g., image_2 comes before image_10)
      const sortedInGroup = groups[folderName].sort((a, b) => 
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
      );

      sortedInGroup.forEach((file, index) => {
        const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
        
        // Applying the Strict Renaming Format: FOLDERNAME_1.ext
        const sequenceNumber = index + 1;
        const renamedFilename = `${folderName}_${sequenceNumber}.${ext}`;

        finalProcessed.push({
          originalName: file.name,
          newName: renamedFilename,
          blob: file as Blob,
          folder: folderName,
          size: file.size
        });
      });
    });

    setStats({
      files: finalProcessed.length,
      skus: skuList.length,
      unmatched: unmatchedCount
    });

    addLog(`Forge Complete. Sorted into ${skuList.length} SKU folders.`, 'success');
    addLog(`Sequence Renaming applied to ${finalProcessed.length} assets.`, 'success');
    
    if (unmatchedCount > 0) {
      addLog(`${unmatchedCount} items routed to UNMATCHED (Invalid prefix).`, 'warning');
    }

    setResults(finalProcessed);
    setIsProcessing(false);
    setProgress(100);
    
    if (folderInputRef.current) folderInputRef.current.value = '';
  };

  const handleZip = async () => {
    if (!results) return;
    setIsProcessing(true);
    addLog("Packaging renamed catalog (STORE speed mode)...", "info");
    try {
      const blob = await createFinalArchive(results, [], setZipProgress);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Renamed_Catalog_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      addLog("Catalog sorted, renamed, and archived successfully.", "success");
    } catch (err: any) {
      addLog(`Archive Fault: ${err.message}`, "error");
    } finally {
      setIsProcessing(false);
      setZipProgress(0);
    }
  };

  const reset = () => {
    setResults(null);
    setStats({ files: 0, skus: 0, unmatched: 0 });
    setLogs([]);
    setProgress(0);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Files Analyzed', val: stats.files, color: 'text-slate-400' },
          { label: 'Product Groups', val: stats.skus, color: 'text-emerald-500' },
          { label: 'Unmatched', val: stats.unmatched, color: 'text-red-500' },
          { label: 'Rename Ratio', val: stats.files > 0 ? '100%' : '0%', color: 'text-indigo-500' },
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
                <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-600">
                  <LayoutGridIcon className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-2xl font-brand font-extrabold dark:text-white leading-tight">Supplier Classifier</h3>
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Classification & Renaming</p>
                </div>
              </div>
              {results && !isProcessing && (
                <button onClick={reset} className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full text-slate-400 transition-all">
                  <XIcon className="w-5 h-5" />
                </button>
              )}
            </div>

            <div 
              onClick={() => !isProcessing && folderInputRef.current?.click()}
              className={`group relative border-2 border-dashed rounded-[32px] p-16 text-center transition-all cursor-pointer ${
                isProcessing 
                  ? 'opacity-50 pointer-events-none border-emerald-400 bg-emerald-50/10' 
                  : 'border-slate-200 dark:border-white/10 hover:border-emerald-400 hover:bg-emerald-50/30 dark:hover:bg-emerald-500/5'
              }`}
            >
              <input 
                type="file" 
                ref={folderInputRef} 
                className="hidden" 
                /* @ts-ignore */
                webkitdirectory="" 
                directory="" 
                onChange={classifyAndRenameFolder} 
              />
              <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 rounded-[32px] flex items-center justify-center mx-auto mb-6 transition-transform group-hover:scale-110 shadow-lg">
                <FolderIcon className="w-10 h-10 text-emerald-600" />
              </div>
              <p className="text-slate-900 dark:text-white font-black text-xl mb-2">Select Mixed Supplier Folder</p>
              <p className="text-slate-500 text-xs font-medium uppercase tracking-widest">Auto-Sorts & Renames Sequence</p>
            </div>

            <div className="mt-10 bg-slate-50 dark:bg-white/5 p-6 rounded-3xl border border-slate-100 dark:border-white/5">
              <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Sequence Renaming Logic</h5>
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <span className="w-4 h-4 rounded-full bg-emerald-500 flex-shrink-0"></span>
                  <span className="text-[11px] font-bold dark:text-slate-300">Renames to <code className="text-indigo-500 px-2 py-1 bg-white dark:bg-white/10 rounded">SKU_1.jpg</code>, <code className="text-indigo-500 px-2 py-1 bg-white dark:bg-white/10 rounded">SKU_2.jpg</code></span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-4 h-4 rounded-full bg-indigo-500 flex-shrink-0"></span>
                  <span className="text-[11px] font-bold dark:text-slate-300">Natural alphanumeric sequence sorting</span>
                </div>
              </div>
            </div>
          </div>

          {results && !isProcessing && (
            <div className="animate-in slide-in-from-bottom-8 duration-500">
              <button 
                onClick={handleZip} 
                className="w-full py-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-[32px] flex items-center justify-center gap-4 shadow-2xl transition-all active:scale-95"
              >
                <DownloadIcon className="w-6 h-6" />
                <span className="text-sm uppercase tracking-[0.2em] font-extrabold">
                  Download Renamed Catalog
                </span>
              </button>
            </div>
          )}

          {isProcessing && zipProgress > 0 && (
             <div className="bg-white dark:bg-white/5 p-8 rounded-[32px] border border-emerald-500/20 shadow-2xl flex items-center gap-5 animate-pulse">
                <LoaderIcon className="w-8 h-8 text-emerald-500 animate-spin" />
                <div className="flex flex-col">
                  <span className="text-xs font-black uppercase tracking-widest dark:text-emerald-400">Archiving Final Catalog</span>
                  <span className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Archive: {zipProgress}%</span>
                </div>
             </div>
          )}
        </div>

        <div className="h-[600px]">
          <Terminal logs={logs} onClear={() => setLogs([])} title="CLASSIFIER_TERMINAL" />
        </div>
      </div>
    </div>
  );
};

export default AssetClassifier;
