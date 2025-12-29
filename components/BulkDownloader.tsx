
import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { ProcessedFile, LogEntry } from '../types';
// Fix: Use correct exported members from fileProcessor
import { smartFetch as downloadFile, getExtension, createFinalArchive as createZipArchive } from '../services/fileProcessor';
import { DownloadIcon, FileSpreadsheetIcon, TrashIcon, CheckCircleIcon, LoaderIcon } from './Icons';

const BulkDownloader: React.FC = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [progress, setProgress] = useState(0);
  const [processedFiles, setProcessedFiles] = useState<ProcessedFile[]>([]);
  const [zipProgress, setZipProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addLog = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    setLogs(prev => [{ timestamp: new Date(), message, type }, ...prev].slice(0, 100));
  };

  const processSheet = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setProgress(0);
    setProcessedFiles([]);
    setLogs([]);
    addLog(`Starting processing for ${file.name}`, 'info');

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1 });

      const rows = jsonData.filter(row => row.length > 0);
      const totalTasks = rows.length - 1;
      let completedTasks = 0;
      const results: ProcessedFile[] = [];

      for (let i = 1; i < rows.length; i++) {
        const [folderName, ...urls] = rows[i];
        if (!folderName) continue;

        addLog(`Processing folder: ${folderName}`, 'info');
        const validUrls = urls.filter(u => u && (u.startsWith('http') || u.startsWith('https')));

        for (let j = 0; j < validUrls.length; j++) {
          const url = validUrls[j];
          try {
            const blob = await downloadFile(url);
            const ext = getExtension(blob, url);
            const newName = `${folderName}_${j + 1}.${ext}`;
            
            results.push({
              originalName: url.split('/').pop() || 'image',
              newName,
              blob,
              folder: folderName,
              size: blob.size
            });
            addLog(`Renamed ${url.substring(0, 30)}... → ${newName}`, 'success');
          } catch (err) {
            addLog(`Failed to download ${url}: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
          }
        }

        completedTasks++;
        setProgress(Math.round((completedTasks / totalTasks) * 100));
      }

      setProcessedFiles(results);
      addLog(`Processing complete! ${results.length} images ready.`, 'success');
    } catch (err) {
      addLog(`Fatal Error: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadZip = async () => {
    if (processedFiles.length === 0) return;
    
    setIsProcessing(true);
    addLog('Generating ZIP archive...', 'info');
    
    try {
      // Fix: Use correct parameters for createFinalArchive
      const zipBlob = await createZipArchive(processedFiles, [], setZipProgress);
      const downloadUrl = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `Catalog_Export_${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
      addLog('ZIP Downloaded successfully.', 'success');
    } catch (err) {
      addLog('ZIP creation failed.', 'error');
    } finally {
      setIsProcessing(false);
      setZipProgress(0);
    }
  };

  return (
    <div className="grid lg:grid-cols-2 gap-8">
      <div className="space-y-6">
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-200 dark:border-slate-800 shadow-sm">
          <h3 className="text-xl font-bold mb-6 flex items-center gap-3 dark:text-white">
            <FileSpreadsheetIcon className="w-6 h-6 text-indigo-500" />
            Bulk Downloader
          </h3>
          
          <div 
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-12 text-center transition-all cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-slate-800 ${
              isProcessing ? 'opacity-50 pointer-events-none' : 'border-slate-300 dark:border-slate-700'
            }`}
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept=".csv, .xlsx, .xls"
              onChange={processSheet}
            />
            <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <DownloadIcon className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
            </div>
            <p className="text-slate-900 dark:text-white font-semibold mb-1">Click to upload spreadsheet</p>
            <p className="text-slate-500 text-sm">XLSX, XLS, or CSV supported</p>
          </div>

          <div className="mt-8 space-y-4">
            <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
              <h4 className="text-sm font-bold mb-2 dark:text-slate-300">Spreadsheet Structure Tip:</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Column A: <span className="text-indigo-600 font-bold">Folder/SKU Name</span><br/>
                Column B+: <span className="text-indigo-600 font-bold">Image URLs</span>
              </p>
            </div>
          </div>
        </div>

        {processedFiles.length > 0 && (
          <div className="bg-indigo-600 rounded-3xl p-8 text-white shadow-xl shadow-indigo-200 dark:shadow-none animate-in fade-in slide-in-from-bottom-4">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h4 className="text-2xl font-bold">Success!</h4>
                <p className="text-indigo-100 text-sm">{processedFiles.length} images processed successfully.</p>
              </div>
              <CheckCircleIcon className="w-12 h-12 text-white/50" />
            </div>
            <button 
              onClick={downloadZip}
              disabled={isProcessing}
              className="w-full py-4 bg-white text-indigo-600 font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-indigo-50 transition-colors shadow-lg disabled:opacity-50"
            >
              {zipProgress > 0 ? (
                <>
                  <LoaderIcon className="animate-spin" />
                  Zipping... {zipProgress}%
                </>
              ) : (
                <>
                  <DownloadIcon />
                  Download ZIP Archive
                </>
              )}
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-6 h-full">
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <span className="text-sm font-bold uppercase tracking-wider text-slate-500">Live Progress</span>
            <span className="text-lg font-extrabold text-indigo-600">{progress}%</span>
          </div>
          <div className="h-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-indigo-600 transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>

        <div className="flex-grow bg-slate-900 rounded-3xl p-6 font-mono text-xs overflow-hidden flex flex-col shadow-2xl">
          <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-800">
            <span className="text-slate-400 font-bold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              PROCESS_LOGS
            </span>
            <button 
              onClick={() => setLogs([])}
              className="text-slate-500 hover:text-white transition-colors"
            >
              <TrashIcon className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-grow overflow-y-auto space-y-2 custom-scrollbar">
            {logs.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-600 italic">
                Waiting for input...
              </div>
            ) : (
              logs.map((log, i) => (
                <div key={i} className={`flex gap-3 leading-tight ${
                  log.type === 'error' ? 'text-red-400' : 
                  log.type === 'success' ? 'text-emerald-400' : 'text-indigo-300'
                }`}>
                  <span className="text-slate-600 shrink-0">[{log.timestamp.toLocaleTimeString([], { hour12: false })}]</span>
                  <span>{log.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BulkDownloader;
