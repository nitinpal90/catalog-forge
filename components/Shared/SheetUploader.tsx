
import React, { useRef } from 'react';
import * as XLSX from 'xlsx';
import { FileSpreadsheetIcon, LoaderIcon } from '../Icons';

interface SheetUploaderProps {
  onData: (data: { folderName: string, urls: string[] }[]) => void;
  isLoading: boolean;
  label?: string;
}

const SheetUploader: React.FC<SheetUploaderProps> = ({ onData, isLoading, label = "Upload Product Sheet" }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<any>(sheet, { header: 1 });

      // Robust parsing: detect if first row is header or data
      const firstRow = json[0] || [];
      const hasUrlInFirstRow = firstRow.some((cell: any) => String(cell).includes('http'));
      const startRow = hasUrlInFirstRow ? 0 : 1;

      const rows = json.slice(startRow).filter(r => r.length > 0);
      const processed = rows.map(row => {
        const folderName = String(row[0] || 'Uncategorized').trim();
        const urls = row.slice(1)
          .map((cell: any) => String(cell).trim())
          .filter((cell: string) => cell.startsWith('http'));
        return { folderName, urls };
      }).filter(item => item.urls.length > 0);

      if (processed.length === 0) {
        alert("No valid image URLs found in the sheet. Ensure Column A is Folder Name and subsequent columns are URLs.");
        return;
      }

      onData(processed);
    } catch (err) {
      alert("Error reading file. Please ensure it is a valid XLSX or CSV.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div 
      onClick={() => !isLoading && fileInputRef.current?.click()}
      className={`relative overflow-hidden group border-2 border-dashed rounded-[32px] p-10 text-center transition-all cursor-pointer ${
        isLoading 
          ? 'opacity-50 pointer-events-none border-indigo-400 bg-indigo-50/10' 
          : 'border-slate-200 dark:border-white/10 hover:border-indigo-400 hover:bg-indigo-50/30 dark:hover:bg-indigo-500/5'
      }`}
    >
      <input type="file" ref={fileInputRef} className="hidden" accept=".csv, .xlsx, .xls" onChange={handleUpload} />
      <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4 transition-transform group-hover:scale-110">
        {isLoading ? <LoaderIcon className="w-8 h-8 text-indigo-600 animate-spin" /> : <FileSpreadsheetIcon className="w-8 h-8 text-indigo-600" />}
      </div>
      <p className="text-slate-900 dark:text-white font-black text-xl mb-2">{label}</p>
      <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Select XLSX, CSV or XLS to start extraction</p>
    </div>
  );
};

export default SheetUploader;
