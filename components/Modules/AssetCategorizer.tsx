import React, { useState, useRef } from 'react';
import { LogEntry, ProcessedFile } from '../../types';
import { createFinalArchive } from '../../services/fileProcessor';
import Terminal from '../Shared/Terminal';
import { LayoutGridIcon, DownloadIcon, LoaderIcon, XIcon, FolderIcon } from '../Icons';

const AssetCategorizer: React.FC = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState({ files: 0, skus: 0, unmatched: 0 });
  const [zipProgress, setZipProgress] = useState(0);
  const [results, setResults] = useState<ProcessedFile[] | null>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const addLog = (msg: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => [...prev, { timestamp: new Date(), message: msg, type }].slice(-250));
  };

  /**
   * Industrial Prefix Detector v2.0
   * Extracts SKU/Barcode from filenames with or without separators.
   */
  const extractSkuPrefix = (name: string): string => {
    // 1. Try traditional separators first
    if (name.includes('_')) return name.split('_')[0].trim();
    if (name.includes('-')) return name.split('-')[0].trim();
    if (name.includes(' ')) return name.split(' ')[0].trim();

    // 2. Handle numeric prefixes without separators (e.g., 7954e.jpg -> 7954)
    const numericMatch = name.match(/^(\d+)/);
    if (numericMatch && numericMatch[0].length >= 2) return numericMatch[0];

    // 3. Handle Alphanumeric prefixes (e.g., ABC123x.jpg -> ABC123)
    // Matches leading uppercase/numbers block before lowercase color/view code
    const smartMatch = name.match(/^([A-Z0-9]+?)(?=[a-z\s.]|$)/);
    if (smartMatch && smartMatch[1].length >= 2) return smartMatch[1];

    // 4. Fallback for mixed alphanumeric
    const alphaNumMatch = name.match(/^([a-zA-Z0-9]+)/);
    if (alphaNumMatch) return alphaNumMatch[1].substring(0, 8); // Take first 8 chars

    return "UNMATCHED";
  };

  const processCategorization = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFiles = e.target.files;
    if (!rawFiles || rawFiles.length === 0) return;

    setIsProcessing(true);
    setResults(null);
    setLogs([]);
    setStats({ files: 0, skus: 0, unmatched: 0 });
    
    addLog(`Categorization Engine: Scanning ${rawFiles.length} file entries...`, 'info');
    
    const fileArray = Array.from(rawFiles) as File[];
    const processed: ProcessedFile[] = [];
    const skuSet = new Set<string>();
    let unmatched = 0;

    fileArray.forEach((file) => {
      const fileName = file.name;
      // Filter system clutter
      if (fileName.startsWith('.') || fileName.startsWith('__')) return;
      // Image validation
      if (!/\.(jpg|jpeg|png|webp|gif|jfif)$/i.test(fileName)) return;

      const folderName = extractSkuPrefix(fileName);
      
      if (folderName === "UNMATCHED") {
        unmatched++;
      } else {
        skuSet.add(folderName.toUpperCase());
      }

      processed.push({
        originalName: fileName,
        newName: fileName, 
        blob: file as Blob,
        folder: folderName,
        size: file.size
      });
    });

    setStats({ files: processed.length, skus: skuSet.size, unmatched });
    addLog(`Sort Complete. Found ${skuSet.size} SKU folders.`, 'success');
    if (unmatched > 0) addLog(`${unmatched} items routed to UNMATCHED folder.`, 'warning');

    setResults(processed);
    setIsProcessing(false);
    if (folderInputRef.current) folderInputRef.current.value = '';
  };

  const handleZip = async () => {
    if (!results) return;
    setIsProcessing(true);
    addLog("Assembling Categorized ZIP archive...", "info");
    try {
      const blob = await createFinalArchive(results, [], setZipProgress);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Categorized_Assets_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      addLog("ZIP exported successfully.", "success");
    } catch (err: any) {
      addLog(`Export fault: ${err.message}`, "error");
    } finally {
      setIsProcessing(false);
      setZipProgress(0);
    }
  };

  const reset = () => {
    setResults(null);
    setStats({ files: 0, skus: 0, unmatched: 0 });
    setLogs([]);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Files Analyzed', val: stats.files, color: 'text-slate-400' },
          { label: 'SKU Folders', val: stats.skus, color: 'text-emerald-500' },
          { label: 'Unmatched', val: stats.unmatched, color: 'text-red-500' },
          { label: 'Status', val: stats.files > 0 ? 'SORTED' : 'AWAITING', color: 'text-indigo-500' },
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
                  <h3 className="text-2xl font-brand font-extrabold dark:text-white leading-tight">Asset Categorizer</h3>
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Industrial SKU Sorter</p>
                </div>
              </div>
              {results && !isProcessing && <button onClick={reset} className="p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full"><XIcon className="w-5 h-5" /></button>}
            </div>

            <div 
              onClick={() => !isProcessing && folderInputRef.current?.click()}
              className={`group border-2 border-dashed rounded-[32px] p-16 text-center transition-all cursor-pointer ${
                isProcessing ? 'opacity-50 pointer-events-none' : 'border-slate-200 dark:border-white/10 hover:border-emerald-400 hover:bg-emerald-50/10'
              }`}
            >
              <input 
                type="file" 
                ref={folderInputRef} 
                className="hidden" 
                /* @ts-ignore */
                webkitdirectory="" 
                directory="" 
                onChange={processCategorization} 
              />
              <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 rounded-[32px] flex items-center justify-center mx-auto mb-6 shadow-lg transition-transform group-hover:scale-105">
                <FolderIcon className="w-10 h-10 text-emerald-600" />
              </div>
              <p className="text-slate-900 dark:text-white font-black text-xl mb-2">Select Mixed Assets Folder</p>
              <p className="text-slate-500 text-xs font-medium uppercase tracking-widest italic">Smart Detector: Works with 7954e.jpg, ABC_1.jpg, etc.</p>
            </div>
          </div>

          {results && !isProcessing && (
            <button onClick={handleZip} className="w-full py-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-[32px] flex items-center justify-center gap-4 shadow-2xl transition-all active:scale-95">
              <DownloadIcon className="w-6 h-6" /> <span className="text-sm uppercase tracking-widest font-extrabold">Download Categorized ZIP</span>
            </button>
          )}

          {isProcessing && zipProgress > 0 && (
             <div className="bg-white dark:bg-white/5 p-8 rounded-[32px] border border-emerald-500/20 shadow-2xl flex items-center gap-5 animate-pulse">
                <LoaderIcon className="w-8 h-8 text-emerald-500 animate-spin" />
                <div><span className="text-xs font-black uppercase tracking-widest dark:text-emerald-400">Packaging: {zipProgress}%</span></div>
             </div>
          )}
        </div>
        <div className="h-[550px]"><Terminal logs={logs} onClear={() => setLogs([])} title="CATEGORIZER_TERMINAL" /></div>
      </div>
    </div>
  );
};

export default AssetCategorizer;