
import React, { useState, useRef } from 'react';
import { LogEntry, ProcessedFile } from '../../types';
import { createFinalArchive } from '../../services/fileProcessor';
import Terminal from '../Shared/Terminal';
import { CheckCircleIcon, DownloadIcon, LoaderIcon, XIcon, FolderIcon } from '../Icons';

const SequenceRenamer: React.FC = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState({ folders: 0, files: 0 });
  const [zipProgress, setZipProgress] = useState(0);
  const [results, setResults] = useState<ProcessedFile[] | null>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const addLog = (msg: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => [...prev, { timestamp: new Date(), message: msg, type }].slice(-250));
  };

  const processRenaming = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFiles = e.target.files;
    if (!rawFiles || rawFiles.length === 0) return;

    setIsProcessing(true);
    setResults(null);
    setLogs([]);
    
    addLog(`Sequence Renamer: Normalizing ${rawFiles.length} files into industrial format...`, 'info');
    
    const fileArray = Array.from(rawFiles) as File[];
    const groups: Record<string, File[]> = {};

    // Group files by their immediate parent folder path
    fileArray.forEach((file: any) => {
      // Exclude hidden files
      if (file.name.startsWith('.') || file.name.includes('/.')) return;
      if (!/\.(jpg|jpeg|png|webp|gif)$/i.test(file.name)) return;

      const path = file.webkitRelativePath || file.name;
      const pathParts = path.split('/');
      
      if (pathParts.length > 1) {
        const folderName = pathParts[pathParts.length - 2];
        if (!groups[folderName]) groups[folderName] = [];
        groups[folderName].push(file);
      } else {
        if (!groups["ROOT"]) groups["ROOT"] = [];
        groups["ROOT"] = [];
        groups["ROOT"].push(file);
      }
    });

    const finalProcessed: ProcessedFile[] = [];
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

    Object.keys(groups).forEach((folderName) => {
      // Sort assets naturally (1, 2, 10 instead of 1, 10, 2)
      const sortedFiles = groups[folderName].sort((a, b) => collator.compare(a.name, b.name));
      
      addLog(`Standardizing folder: ${folderName} (${sortedFiles.length} files)`);

      sortedFiles.forEach((file, index) => {
        const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
        const renamedFilename = `${folderName}_${index + 1}.${ext}`;

        finalProcessed.push({
          originalName: file.name,
          newName: renamedFilename,
          blob: file as Blob,
          folder: folderName,
          size: file.size
        });
      });
    });

    setStats({ folders: Object.keys(groups).length, files: finalProcessed.length });
    addLog(`Success. ${finalProcessed.length} assets renamed to catalog spec.`, 'success');
    
    setResults(finalProcessed);
    setIsProcessing(false);
    if (folderInputRef.current) folderInputRef.current.value = '';
  };

  const handleZip = async () => {
    if (!results) return;
    setIsProcessing(true);
    addLog("Archiving Normalized Batch...", "info");
    try {
      const blob = await createFinalArchive(results, [], setZipProgress);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Renamed_Sequence_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      addLog("Export complete.", "success");
    } catch (err: any) {
      addLog(`Fault: ${err.message}`, "error");
    } finally {
      setIsProcessing(false);
      setZipProgress(0);
    }
  };

  const reset = () => {
    setResults(null);
    setStats({ folders: 0, files: 0 });
    setLogs([]);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
        {[
          { label: 'Folders Analyzed', val: stats.folders, color: 'text-amber-500' },
          { label: 'Assets Normalized', val: stats.files, color: 'text-emerald-500' },
          { label: 'Rule Engine', val: 'FOLDER_N', color: 'text-indigo-500' },
        ].map((s, i) => (
          <div key={i} className="bg-white dark:bg-white/5 p-8 rounded-[32px] border border-slate-100 dark:border-white/5 shadow-xl">
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
                <div className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center text-amber-600">
                  <CheckCircleIcon className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-2xl font-brand font-extrabold dark:text-white leading-tight">Sequence Renamer</h3>
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Industrial Normalizer</p>
                </div>
              </div>
              {results && !isProcessing && <button onClick={reset} className="p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full"><XIcon className="w-5 h-5" /></button>}
            </div>

            <div 
              onClick={() => !isProcessing && folderInputRef.current?.click()}
              className={`group border-2 border-dashed rounded-[32px] p-16 text-center transition-all cursor-pointer ${
                isProcessing ? 'opacity-50 pointer-events-none' : 'border-slate-200 dark:border-white/10 hover:border-amber-400 hover:bg-amber-50/10'
              }`}
            >
              {/* Added @ts-ignore to bypass non-standard webkitdirectory and directory attribute check */}
              <input 
                type="file" 
                ref={folderInputRef} 
                className="hidden" 
                /* @ts-ignore */
                webkitdirectory="" 
                directory="" 
                onChange={processRenaming} 
              />
              <div className="w-20 h-20 bg-amber-100 dark:bg-amber-900/30 rounded-[32px] flex items-center justify-center mx-auto mb-6 shadow-lg transition-transform group-hover:scale-105"><FolderIcon className="w-10 h-10 text-amber-600" /></div>
              <p className="text-slate-900 dark:text-white font-black text-xl mb-2">Select Root Folder to Rename</p>
              <p className="text-slate-500 text-xs font-medium uppercase tracking-widest italic">Files renamed based on parent folder name with _1, _2 pattern</p>
            </div>
          </div>

          {results && !isProcessing && (
            <button onClick={handleZip} className="w-full py-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-[32px] flex items-center justify-center gap-4 shadow-2xl transition-all active:scale-95">
              <DownloadIcon className="w-6 h-6" /> <span className="text-sm uppercase tracking-widest font-extrabold">Download Normalized ZIP</span>
            </button>
          )}

          {isProcessing && zipProgress > 0 && (
             <div className="bg-white dark:bg-white/5 p-8 rounded-[32px] border border-amber-500/20 shadow-2xl flex items-center gap-5 animate-pulse">
                <LoaderIcon className="w-8 h-8 text-amber-500 animate-spin" />
                <div><span className="text-xs font-black uppercase tracking-widest dark:text-amber-400">Archiving Batch: {zipProgress}%</span></div>
             </div>
          )}
        </div>
        <div className="h-[550px]"><Terminal logs={logs} onClear={() => setLogs([])} title="RENAMER_TERMINAL" /></div>
      </div>
    </div>
  );
};

export default SequenceRenamer;
