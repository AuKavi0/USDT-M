import React, { useState } from 'react';
import { Layout } from './components/Layout';
import { WhaleWatch } from './components/WhaleWatch';
import { SqueezeScanner } from './components/SqueezeScanner';
import { DepthVisualizer } from './components/DepthVisualizer';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedSymbol, setSelectedSymbol] = useState('BTCUSDT');

  // Input handler for symbol change
  const handleSymbolChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedSymbol(e.target.value.toUpperCase());
  };

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab}>
      
      {/* Symbol Selector Bar */}
      <div className="mb-6 flex flex-col md:flex-row gap-4 justify-between items-center">
        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-terminal-green to-terminal-yellow rounded-lg blur opacity-30 group-hover:opacity-75 transition duration-200"></div>
            <div className="relative bg-terminal-bg rounded-lg p-1 flex items-center border border-terminal-border">
              <span className="text-terminal-muted font-mono text-sm px-3">SYM:</span>
              <input 
                type="text" 
                value={selectedSymbol}
                onChange={handleSymbolChange}
                className="bg-transparent text-white font-bold font-mono outline-none w-24 uppercase"
              />
            </div>
          </div>
          <div className="text-xs text-terminal-muted">
            Viewing <span className="text-white font-bold">{selectedSymbol}</span> Analytics
          </div>
        </div>
        <div className="flex gap-2 text-[10px] text-terminal-muted font-mono">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-terminal-green"></span> Live Conn</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-terminal-yellow"></span> Delay: 50ms</span>
        </div>
      </div>

      {activeTab === 'dashboard' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-180px)] min-h-[600px]">
          {/* Left Column: Scanner (Top Squeezes) */}
          <div className="lg:col-span-3 h-full">
            <SqueezeScanner onSelectSymbol={setSelectedSymbol} />
          </div>

          {/* Middle Column: Depth Visualizer (The Walls) */}
          <div className="lg:col-span-5 h-full">
            <DepthVisualizer symbol={selectedSymbol} />
          </div>

          {/* Right Column: Live Whale Feed */}
          <div className="lg:col-span-4 h-full">
            <WhaleWatch symbol={selectedSymbol} />
          </div>
        </div>
      )}

      {activeTab === 'scanner' && (
        <div className="h-[calc(100vh-180px)]">
            <SqueezeScanner onSelectSymbol={(sym) => { setSelectedSymbol(sym); setActiveTab('dashboard'); }} />
        </div>
      )}
      
      {activeTab === 'depth' && (
        <div className="h-[calc(100vh-180px)]">
            <DepthVisualizer symbol={selectedSymbol} />
        </div>
      )}

    </Layout>
  );
};

export default App;