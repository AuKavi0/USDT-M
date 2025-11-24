import React, { ReactNode } from 'react';
import { Terminal, Activity, Layers, Zap } from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, activeTab, onTabChange }) => {
  return (
    <div className="min-h-screen bg-terminal-bg text-terminal-text font-sans selection:bg-terminal-yellow selection:text-black">
      {/* Header */}
      <header className="h-16 border-b border-terminal-border bg-terminal-panel/50 backdrop-blur-md fixed top-0 w-full z-50 flex items-center px-6 justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-terminal-yellow rounded text-black">
            <Terminal size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">WhaleStation <span className="text-terminal-yellow text-xs px-1.5 py-0.5 bg-terminal-yellow/10 rounded border border-terminal-yellow/20">PRO</span></h1>
            <p className="text-[10px] text-terminal-muted font-mono uppercase tracking-wider">USDT-M Futures Analytics</p>
          </div>
        </div>

        <nav className="flex items-center gap-1 bg-terminal-bg p-1 rounded-lg border border-terminal-border">
          <NavButton 
            active={activeTab === 'dashboard'} 
            onClick={() => onTabChange('dashboard')} 
            icon={<Activity size={16} />} 
            label="Whale Watch" 
          />
          <NavButton 
            active={activeTab === 'scanner'} 
            onClick={() => onTabChange('scanner')} 
            icon={<Zap size={16} />} 
            label="Squeeze Scanner" 
          />
          <NavButton 
            active={activeTab === 'depth'} 
            onClick={() => onTabChange('depth')} 
            icon={<Layers size={16} />} 
            label="Depth Walls" 
          />
        </nav>
      </header>

      {/* Main Content */}
      <main className="pt-20 pb-6 px-6 max-w-[1920px] mx-auto">
        {children}
      </main>
    </div>
  );
};

const NavButton = ({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
      active 
        ? 'bg-terminal-panel text-white shadow-sm border border-terminal-border' 
        : 'text-terminal-muted hover:text-white hover:bg-terminal-panel/50'
    }`}
  >
    {icon}
    {label}
  </button>
);