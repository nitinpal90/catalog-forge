
import React, { useState, useRef } from 'react';
import { ProcessedFile, LogEntry } from '../types';
// Fix: Use correct exported members from fileProcessor and implement detectPrefixes locally
import { createFinalArchive as createZipArchive } from '../services/fileProcessor';
import { FolderIcon, DownloadIcon, CheckCircleIcon, TrashIcon, LoaderIcon } from './Icons';

// Local helper to group file names by prefix to fix the missing export error
const detectPrefixes = (names: string[]): Record<string, string[]> => {
  const groups: Record<string, string[]> = {};
  names.forEach(name => {
    const parts = name.split('_');
    const prefix = parts.length > 1 && parts[0].trim() ? parts[0].trim() : 'UNMATCHED';
    if (!groups[prefix]) groups[prefix] = [];
    groups[prefix].push(name);
  });
  return groups;
};

const FolderFixer: React.FC = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [processedFiles, setProcessedFiles] = useState<ProcessedFile[]>([]);
  const [zipProgress, setZipProgress] = useState(0);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const addLog = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    setLogs(prev => [{ timestamp: new Date(), message, type }, ...prev].slice(0, 50));
  };

  const handleFolderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsProcessing(true);
    setLogs([]);
    addLog(`Scanning ${files.length} items from supplier folder...`, 'info');

    try {
      const fileArray = Array.from(files) as File[];
      const fileNames = fileArray.map(f => f.name);
      // Fixed: Use locally defined detectPrefixes
      const groups = detectPrefixes(fileNames);
      
      const results: ProcessedFile[] = [];
      
      (Object.entries(groups) as [string, string[]][]).forEach(([prefix, memberNames]) => {
        addLog(`Detected Group: ${prefix} (${memberNames.length} images)`, 'success');
        
        memberNames.forEach((name, index) => {
          const originalFile = fileArray.find(f => f.name === name);
          if (originalFile) {
            const ext = name.split('.').pop() || 'jpg';
            results.push({
              originalName: name,
              newName: `${prefix}_${index + 1}.${ext}`,
              blob: originalFile as Blob,
              folder: prefix,
              size: originalFile.size
            });
          }
        });
      });

      setProcessedFiles(results);
      addLog(`Auto-sorting complete. Created ${Object.keys(groups).length} subfolders.`, 'success');
    } catch (err) {
      addLog(`Fixer Error: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadZip = async () => {
    if (processedFiles.length === 0) return;
    setIsProcessing(true);
    try {
      // Fix: Use createFinalArchive correctly with mandatory parameters
      const zipBlob = await createZipArchive(processedFiles, [], setZipProgress);
      const downloadUrl = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `Sorted_Catalog_${new Date().getTime()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      addLog('ZIP generation failed.', 'error');
    } finally {
      setIsProcessing(false);
      setZipProgress(0);
    }
  };

  return (
    <div className="grid lg:grid-cols-2 gap-8">
      <div className="space-y-6">
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-200 dark:border-slate-800 shadow-sm">
          <h3 className="text-xl font-bold mb-4 flex items-center gap-3 dark:text-white">
            <FolderIcon className="w-6 h-6 text-violet-500" />
            Supplier Folder Fixer
          </h3>
          <p className="text-slate-500 text-sm mb-6 leading-relaxed">
            Upload a single big folder containing thousands of mixed product images. We'll auto-group them by style name and create a structured output.
          </p>
          
          <div 
            onClick={() => folderInputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-12 text-center transition-all cursor-pointer hover:border-violet-400 hover:bg-violet-50/50 dark:hover:bg-slate-800"
          >
            <input 
              type="file" 
              ref={folderInputRef} 
              className="hidden" 
              /* @ts-ignore - webkitdirectory is standard but not in base TS types */
              webkitdirectory=""
              directory=""
              onChange={handleFolderUpload}
            />
            <div className="w-16 h-16 bg-violet-100 dark:bg-violet-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <FolderIcon className="w-8 h-8 text-violet-600 dark:text-violet-400" />
            </div>
            <p className="text-slate-900 dark:text-white font-semibold mb-1">Select Mixed Folder</p>
            <p className="text-slate-500 text-sm">Upload entire directories at once</p>
          </div>
        </div>

        {processedFiles.length > 0 && (
          <div className="bg-emerald-600 rounded-3xl p-8 text-white shadow-xl shadow-emerald-200 dark:shadow-none animate-in fade-in slide-in-from-bottom-4">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h4 className="text-2xl font-bold">Cleanup Complete!</h4>
                <p className="text-emerald-100 text-sm">{processedFiles.length} files organized into folders.</p>
              </div>
              <CheckCircleIcon className="w-12 h-12 text-white/50" />
            </div>
            <button 
              onClick={downloadZip}
              disabled={isProcessing}
              className="w-full py-4 bg-white text-emerald-600 font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-emerald-50 transition-colors shadow-lg disabled:opacity-50"
            >
              {zipProgress > 0 ? <LoaderIcon className="animate-spin" /> : <DownloadIcon />}
              {zipProgress > 0 ? `Zipping... ${zipProgress}%` : 'Download Sorted ZIP'}
            </button>
          </div>
        )}
      </div>

      <div className="bg-slate-900 rounded-3xl p-6 font-mono text-xs overflow-hidden flex flex-col shadow-2xl min-h-[400px]">
        <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-800">
          <span className="text-slate-400 font-bold">SORT_ENGINE_TERMINAL</span>
          <button onClick={() => setLogs([])} className="text-slate-500 hover:text-white"><TrashIcon className="w-4 h-4" /></button>
        </div>
        <div className="flex-grow overflow-y-auto space-y-2 custom-scrollbar">
          {logs.map((log, i) => (
            <div key={i} className={`flex gap-3 ${log.type === 'success' ? 'text-emerald-400' : 'text-slate-300'}`}>
              <span className="text-slate-600">[{log.timestamp.toLocaleTimeString()}]</span>
              <span>{log.message}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default FolderFixer;
