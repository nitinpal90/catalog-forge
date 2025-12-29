
import React, { useEffect, useRef } from 'react';
import { LogEntry } from '../../types';
import { TrashIcon } from '../Icons';

interface TerminalProps {
  logs: LogEntry[];
  onClear: () => void;
  title?: string;
}

const Terminal: React.FC<TerminalProps> = ({ logs, onClear, title = "PROCESS_CONSOLE" }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="flex flex-col h-full bg-[#0a0b10] rounded-[32px] border border-slate-800/50 shadow-2xl overflow-hidden font-mono text-[11px] md:text-xs">
      <div className="flex items-center justify-between px-6 py-5 bg-[#0d0e14] border-b border-slate-800/50">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-[#27c93f]"></div>
          </div>
          <span className="text-slate-500 font-bold ml-2 uppercase tracking-[0.2em]">{title}</span>
        </div>
        <button 
          onClick={onClear}
          className="p-2 text-slate-500 hover:text-white transition-colors hover:bg-white/5 rounded-lg"
          title="Clear Terminal"
        >
          <TrashIcon className="w-4 h-4" />
        </button>
      </div>
      
      <div 
        ref={scrollRef}
        className="flex-grow overflow-y-auto p-6 space-y-3 custom-scrollbar bg-[#0a0b10]/80"
      >
        {logs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-700 italic select-none opacity-50 space-y-4">
            <div className="w-12 h-[1px] bg-slate-800"></div>
            <p className="tracking-widest uppercase text-[10px] font-bold">System idle. Awaiting signals.</p>
            <div className="w-12 h-[1px] bg-slate-800"></div>
          </div>
        ) : (
          logs.map((log, i) => (
            <div key={i} className={`flex gap-3 leading-relaxed animate-in fade-in slide-in-from-left-1 ${
              log.type === 'error' ? 'text-red-400 bg-red-500/5 p-2 rounded-lg' : 
              log.type === 'success' ? 'text-emerald-400' : 
              log.type === 'warning' ? 'text-amber-400' : 'text-indigo-300'
            }`}>
              <span className="text-slate-600 shrink-0 font-medium tabular-nums">
                [{log.timestamp.toLocaleTimeString([], { hour12: false })}]
              </span>
              <span className="break-words w-full">{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Terminal;
