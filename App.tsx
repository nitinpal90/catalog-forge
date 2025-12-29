
import React, { useState, useEffect } from 'react';
import { AppTab } from './types';
import DriveDownloader from './components/Modules/DriveDownloader';
import WebDownloader from './components/Modules/WebDownloader';
import PostimgDownloader from './components/Modules/PostimgDownloader';
import AssetCategorizer from './components/Modules/AssetCategorizer';
import SequenceRenamer from './components/Modules/SequenceRenamer';
import { 
  FolderIcon, 
  DownloadIcon, 
  LayoutGridIcon, 
  GlobeIcon,
  CloudDownloadIcon,
  SunIcon,
  MoonIcon,
  RocketIcon,
  CheckCircleIcon,
  GithubIcon,
  LinkedinIcon,
  XIcon
} from './components/Icons';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AppTab | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      if (saved) return saved === 'dark';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  const navItems = [
    { 
      id: AppTab.DRIVE, 
      label: 'Drive Forge', 
      icon: <FolderIcon className="w-8 h-8" />, 
      desc: "Industrial-grade Google Drive engine. Concurrent folder scanning and multi-worker image streaming for massive batches.",
      color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40",
      accent: "bg-indigo-600"
    },
    { 
      id: AppTab.WEB, 
      label: 'Universal Link Sync', 
      icon: <GlobeIcon className="w-8 h-8" />, 
      desc: "Universal link capture engine. Automatically resolves direct URLs with high-speed proxy bypass.",
      color: "text-sky-600 bg-sky-50 dark:bg-sky-950/40",
      accent: "bg-sky-600"
    },
    { 
      id: AppTab.POSTIMG, 
      label: 'Postimg Hub', 
      icon: <CloudDownloadIcon className="w-8 h-8" />, 
      desc: "Original quality gallery scraper. Specialized in resolving high-resolution source links from Postimg albums.",
      color: "text-purple-600 bg-purple-50 dark:bg-purple-950/40",
      accent: "bg-purple-600"
    },
    { 
      id: AppTab.CATEGORIZER, 
      label: 'Categorizer', 
      icon: <LayoutGridIcon className="w-8 h-8" />, 
      desc: "Industrial sorting machine. Automatically groups thousands of assets into SKU folders via prefix detection.",
      color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40",
      accent: "bg-emerald-600"
    },
    { 
      id: AppTab.RENAMER, 
      label: 'Standard Renamer', 
      icon: <CheckCircleIcon className="w-8 h-8" />, 
      desc: "Catalog normalization tool. Renames files inside SKU folders to follow strict [Folder]_[Index] sequence.",
      color: "text-amber-600 bg-amber-50 dark:bg-amber-950/40",
      accent: "bg-amber-600"
    },
  ];

  if (activeTab === null) {
    return (
      <div className="min-h-screen bg-[#fafafa] dark:bg-[#050505] transition-colors duration-500 flex flex-col">
        <nav className="fixed top-0 w-full z-50 border-b border-slate-100 dark:border-white/5 bg-white/80 dark:bg-black/80 backdrop-blur-2xl">
          <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <RocketIcon className="text-white w-6 h-6" />
              </div>
              <div>
                <span className="font-brand font-extrabold text-xl dark:text-white">Catalog<span className="text-indigo-600">Forge</span></span>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">Industrial Studio</p>
              </div>
            </div>
            
            <div className="flex items-center gap-6">
              <div className="hidden md:flex items-center gap-2 mr-4">
                <a href="https://github.com/nitinpal90" target="_blank" className="p-2 text-slate-400 hover:text-indigo-600 transition-colors"><GithubIcon className="w-5 h-5" /></a>
                <a href="https://www.linkedin.com/in/nitinpal1/" target="_blank" className="p-2 text-slate-400 hover:text-indigo-600 transition-colors"><LinkedinIcon className="w-5 h-5" /></a>
                <a href="https://x.com/RealNitinX" target="_blank" className="p-2 text-slate-400 hover:text-indigo-600 transition-colors"><XIcon className="w-5 h-5" /></a>
              </div>
              <button onClick={toggleTheme} className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full transition-all">
                {isDarkMode ? <SunIcon /> : <MoonIcon />}
              </button>
              <button onClick={() => setActiveTab(AppTab.DRIVE)} className="px-6 py-2 bg-indigo-600 text-white font-bold text-xs rounded-full uppercase tracking-widest shadow-xl shadow-indigo-500/20 transition-all hover:scale-105 active:scale-95">
                Launch Studio
              </button>
            </div>
          </div>
        </nav>

        <main className="pt-40 pb-20 px-6 flex-grow">
          <div className="max-w-7xl mx-auto text-center">
            <h1 className="text-5xl md:text-8xl font-brand font-black text-[#1a1c23] dark:text-white leading-[1] tracking-tighter mb-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
              Professional Catalog<br />
              <span className="text-indigo-600">Image Studio.</span>
            </h1>
            <p className="max-w-3xl mx-auto text-lg md:text-xl text-slate-500 dark:text-slate-400 mb-20 px-4 font-medium">
              High-performance modules designed for massive catalog acquisition and standardization. 
              Built for teams managing thousands of assets daily.
            </p>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto pb-12">
              {navItems.map((item) => (
                <div 
                  key={item.id} 
                  onClick={() => setActiveTab(item.id)}
                  className="group bg-white dark:bg-[#0f111a] p-10 rounded-[48px] border border-slate-100 dark:border-white/5 shadow-2xl hover:shadow-indigo-500/10 transition-all duration-500 text-left flex flex-col cursor-pointer hover:-translate-y-2"
                >
                  <div className={`w-16 h-16 ${item.color} rounded-[24px] flex items-center justify-center mb-10 shadow-inner`}>
                    {item.icon}
                  </div>
                  <h3 className="text-3xl font-brand font-black mb-4 dark:text-white">{item.label}</h3>
                  <p className="text-slate-500 dark:text-slate-400 mb-10 text-[14px] leading-relaxed font-medium flex-grow opacity-80 group-hover:opacity-100 transition-opacity">
                    {item.desc}
                  </p>
                  <div className={`flex items-center justify-between gap-2 w-full p-2 pl-6 rounded-3xl ${item.accent} text-white font-black uppercase tracking-widest text-[11px] transition-all shadow-lg`}>
                    <span>Launch Engine</span>
                    <span className="w-10 h-10 bg-white/20 text-white rounded-2xl flex items-center justify-center backdrop-blur-md">→</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>

        <footer className="py-20 border-t border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-black/40">
          <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-4 gap-12">
            <div className="col-span-2">
               <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                  <RocketIcon className="text-white w-6 h-6" />
                </div>
                <span className="font-brand font-extrabold text-2xl dark:text-white italic">CatalogForge Studio</span>
              </div>
              <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed max-w-md">
                CatalogForge is an industrial-grade production hub built for e-commerce professionals. 
                We specialize in high-concurrency image acquisition, SKU normalization, and bulk 
                catalog management to accelerate your listing workflows.
              </p>
            </div>
            <div>
              <h5 className="text-[10px] font-black uppercase tracking-widest text-indigo-600 mb-6">Production Modules</h5>
              <ul className="space-y-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <li><button onClick={() => setActiveTab(AppTab.DRIVE)} className="hover:text-indigo-600 transition-colors">Drive Forge Engine</button></li>
                <li><button onClick={() => setActiveTab(AppTab.WEB)} className="hover:text-indigo-600 transition-colors">Universal Extractor</button></li>
                <li><button onClick={() => setActiveTab(AppTab.POSTIMG)} className="hover:text-indigo-600 transition-colors">Gallery Hub</button></li>
                <li><button onClick={() => setActiveTab(AppTab.CATEGORIZER)} className="hover:text-indigo-600 transition-colors">SKU Classifier</button></li>
              </ul>
            </div>
            <div>
              <h5 className="text-[10px] font-black uppercase tracking-widest text-indigo-600 mb-6">Contact Studio</h5>
              <div className="flex gap-4 mb-6">
                <a href="https://github.com/nitinpal90" target="_blank" className="w-10 h-10 rounded-xl bg-white dark:bg-white/5 flex items-center justify-center border border-slate-200 dark:border-white/10 hover:border-indigo-600 transition-all text-slate-500 hover:text-indigo-600 shadow-sm"><GithubIcon className="w-5 h-5" /></a>
                <a href="https://www.linkedin.com/in/nitinpal1/" target="_blank" className="w-10 h-10 rounded-xl bg-white dark:bg-white/5 flex items-center justify-center border border-slate-200 dark:border-white/10 hover:border-indigo-600 transition-all text-slate-500 hover:text-indigo-600 shadow-sm"><LinkedinIcon className="w-5 h-5" /></a>
                <a href="https://x.com/RealNitinX" target="_blank" className="w-10 h-10 rounded-xl bg-white dark:bg-white/5 flex items-center justify-center border border-slate-200 dark:border-white/10 hover:border-indigo-600 transition-all text-slate-500 hover:text-indigo-600 shadow-sm"><XIcon className="w-5 h-5" /></a>
              </div>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">
                © {new Date().getFullYear()} CatalogForge Industrial. All Rights Reserved.
              </p>
            </div>
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#050505] transition-colors duration-500 flex flex-col">
      <header className="h-20 border-b border-slate-100 dark:border-white/5 bg-white/70 dark:bg-black/70 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">
          <div onClick={() => setActiveTab(null)} className="flex items-center gap-3 cursor-pointer group">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center group-hover:rotate-12 transition-transform shadow-lg shadow-indigo-500/20">
              <RocketIcon className="text-white w-6 h-6" />
            </div>
            <span className="font-brand font-extrabold text-xl dark:text-white hidden sm:inline">Catalog<span className="text-indigo-600">Forge</span></span>
          </div>
          <div className="flex items-center gap-6">
            <button onClick={toggleTheme} className="p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full transition-all">
              {isDarkMode ? <SunIcon /> : <MoonIcon />}
            </button>
            <button onClick={() => setActiveTab(null)} className="px-6 py-2.5 bg-indigo-600 text-white font-bold text-[10px] rounded-full uppercase tracking-widest shadow-xl shadow-indigo-500/20 transition-all hover:scale-105 active:scale-95">Exit Studio</button>
          </div>
        </div>
      </header>

      <main className="flex-grow max-w-7xl w-full mx-auto px-6 py-12">
        <div className="animate-in fade-in slide-in-from-bottom-6 duration-700">
          <div className="mb-12">
            <button onClick={() => setActiveTab(null)} className="mb-4 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-indigo-600 transition-colors group">
              <span className="w-6 h-6 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-all">←</span>
              Studio / <span className="text-slate-900 dark:text-white underline decoration-indigo-500 underline-offset-4">{navItems.find(n => n.id === activeTab)?.label}</span>
            </button>
          </div>
          {activeTab === AppTab.DRIVE && <DriveDownloader />}
          {activeTab === AppTab.WEB && <WebDownloader />}
          {activeTab === AppTab.POSTIMG && <PostimgDownloader />}
          {activeTab === AppTab.CATEGORIZER && <AssetCategorizer />}
          {activeTab === AppTab.RENAMER && <SequenceRenamer />}
        </div>
      </main>
    </div>
  );
};

export default App;
