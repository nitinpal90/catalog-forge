
import React, { useState } from 'react';
import { LogEntry, ProcessedFile, BatchSummary } from '../../types';
import { resolvePostimgGallery, resolvePostimgDirect } from '../../services/postimg';
import { smartFetch, downloadBatch, createFinalArchive, getExtension } from '../../services/fileProcessor';
import Terminal from '../Shared/Terminal';
import SheetUploader from '../Shared/SheetUploader';
import { CloudDownloadIcon, DownloadIcon, LoaderIcon, CheckCircleIcon, XIcon, RocketIcon } from '../Icons';

const PostimgDownloader: React.FC = () => {
  const [url, setUrl] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState({ rows: 0, processed: 0, downloaded: 0, errors: 0 });
  const [progress, setProgress] = useState(0);
  const [zipProgress, setZipProgress] = useState(0);
  const [results, setResults] = useState<{files: ProcessedFile[], summaries: BatchSummary[]} | null>(null);

  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => [...prev, { timestamp: new Date(), message, type }].slice(-100));
  };

  const processJob = async (batchItems: { folderName: string, urls: string[] }[]) => {
    setIsProcessing(true);
    setResults(null);
    setProgress(0);
    setLogs([]);
    setStats({ rows: batchItems.length, processed: 0, downloaded: 0, errors: 0 });
    addLog(`Initiating Postimg Industrial Sync...`, 'info');

    const allFiles: ProcessedFile[] = [];
    const summaries: BatchSummary[] = [];

    try {
      for (const item of batchItems) {
        addLog(`Analyzing SKU: ${item.folderName}`);
        let styleUrls: string[] = [];
        for (const link of item.urls) {
          if (link.includes('/gallery/')) {
            const gallery = await resolvePostimgGallery(link);
            styleUrls = [...styleUrls, ...gallery];
          } else if (link.includes('postimg.cc/')) {
            styleUrls.push(link);
          }
        }

        if (styleUrls.length === 0) {
          addLog(`   > Warning: No assets detected for ${item.folderName}`, 'warning');
          summaries.push({
            styleName: item.folderName,
            sourceLink: item.urls[0] || "",
            status: 'Failed',
            filesFound: 0,
            notes: "Zero links resolved."
          });
          setStats(s => ({ ...s, processed: s.processed + 1 }));
          continue;
        }

        const { results: downloadedBatchResults, failed } = await downloadBatch(
          styleUrls,
          async (u, index, signal) => {
            const direct = await resolvePostimgDirect(u);
            const blob = await smartFetch(direct, signal);
            return {
              originalName: u,
              newName: `${item.folderName}_${index + 1}.${getExtension(blob, u)}`,
              blob,
              folder: item.folderName,
              size: blob.size
            };
          },
          8
        );

        allFiles.push(...downloadedBatchResults);
        summaries.push({
          styleName: item.folderName,
          sourceLink: item.urls[0] || "",
          status: downloadedBatchResults.length > 0 ? (downloadedBatchResults.length === styleUrls.length ? 'Success' : 'Partial') : 'Failed',
          filesFound: downloadedBatchResults.length,
          notes: `${downloadedBatchResults.length}/${styleUrls.length} captured.`
        });

        setStats(s => ({ 
          ...s, 
          processed: s.processed + 1, 
          downloaded: s.downloaded + downloadedBatchResults.length, 
          errors: s.errors + failed 
        }));
        setProgress(Math.round((summaries.length / batchItems.length) * 100));
      }

      setResults({ files: allFiles, summaries });
      addLog('Postimg cycle finished. Assets gathered.', 'success');
    } catch (err: any) {
      addLog(`Fault: ${err.message}`, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleZip = async () => {
    if (!results) return;
    setIsProcessing(true);
    addLog("Assembling Gallery ZIP...");
    try {
      const blob = await createFinalArchive(results.files, results.summaries, setZipProgress);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Postimg_Batch_${Date.now()}.zip`;
      a.click();
      window.URL.revokeObjectURL(url);
      addLog("Export complete.", "success");
    } catch (err: any) {
      addLog(`Archive Fault: ${err.message}`, "error");
    } finally {
      setIsProcessing(false);
      setZipProgress(0);
    }
  };

  const reset = () => {
    setResults(null);
    setProgress(0);
    setUrl('');
    setLogs([]);
    setStats({ rows: 0, processed: 0, downloaded: 0, errors: 0 });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Sync SKUs', val: stats.rows, color: 'text-slate-400' },
          { label: 'Completed', val: stats.processed, color: 'text-purple-500' },
          { label: 'Assets Synced', val: stats.downloaded, color: 'text-emerald-500' },
          { label: 'Faults', val: stats.errors, color: 'text-red-500' }
        ].map((s, i) => (
          <div key={i} className="bg-white dark:bg-white/5 p-8 rounded-[32px] border border-slate-100 dark:border-white/5 shadow-xl">
            <p className="text-[10px] font-bold uppercase tracking-widest mb-1 text-slate-400">{s.label}</p>
            <p className={`text-4xl font-brand font-black ${s.color}`}>{s.val}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-12 items-start">
        <div className="space-y-8">
           <div className="bg-white dark:bg-white/5 rounded-[40px] p-10 border border-slate-100 dark:border-white/5 shadow-2xl relative overflow-hidden">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-purple-500/10 rounded-2xl flex items-center justify-center text-purple-600">
                  <CloudDownloadIcon className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-2xl font-brand font-bold dark:text-white leading-none">Postimg Hub</h3>
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Industrial Gallery Scraper</p>
                </div>
              </div>
              {(results || stats.rows > 0) && <button onClick={reset} className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full"><XIcon className="w-5 h-5" /></button>}
            </div>

            <SheetUploader onData={processJob} isLoading={isProcessing} label="Upload Postimg Sheet" />
            
            <div className="mt-8 flex gap-4">
               <input
                type="text"
                placeholder="Paste gallery/image link..."
                className="flex-grow p-5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl outline-none dark:text-white font-medium text-sm"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <button 
                onClick={() => processJob([{folderName:'Postimg_Manual', urls:[url]}])} 
                disabled={isProcessing || !url} 
                className="px-8 bg-purple-600 hover:bg-purple-700 text-white rounded-2xl font-bold transition-all shadow-lg"
              >
                Sync
              </button>
            </div>

            <div className="mt-8">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Capture Ratio</span>
                <span className="text-[10px] font-bold text-purple-500">{progress}%</span>
              </div>
              <div className="h-2 w-full bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-purple-500 transition-all duration-500" style={{ width: `${progress}%` }}></div>
              </div>
            </div>
          </div>

          {results && !isProcessing && (
            <button onClick={handleZip} className="w-full py-6 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-[32px] flex items-center justify-center gap-3 shadow-2xl transition-all">
              <DownloadIcon className="w-6 h-6" /> <span className="text-sm uppercase tracking-widest font-extrabold">Download Capture Batch</span>
            </button>
          )}
        </div>
        <div className="h-[550px]"><Terminal logs={logs} onClear={() => setLogs([])} title="POSTIMG_SYNC_TERMINAL" /></div>
      </div>
    </div>
  );
};

export default PostimgDownloader;
