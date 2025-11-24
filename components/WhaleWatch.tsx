import React, { useEffect, useState, useRef } from 'react';
import { BinanceService } from '../services/binanceService';
import { AggTrade, Kline } from '../types';
import { ArrowUpRight, ArrowDownRight, Filter, Pause, Play, Activity } from 'lucide-react';
import { createChart, ColorType, IChartApi, ISeriesApi } from 'lightweight-charts';

interface WhaleWatchProps {
  symbol: string;
}

interface ProcessedTrade extends AggTrade {
  value: number;
  isWhale: boolean;
  isNuclear: boolean;
}

export const WhaleWatch: React.FC<WhaleWatchProps> = ({ symbol }) => {
  const [trades, setTrades] = useState<ProcessedTrade[]>([]);
  const [threshold, setThreshold] = useState<number>(100000); // $100k default
  const [isPaused, setIsPaused] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const tradesRef = useRef<ProcessedTrade[]>([]); // Ref to hold trades for calculating without dependency issues

  // Chart Refs
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  // Initialize Chart and Subscribe to Klines
  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Create chart
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#151A21' },
        textColor: '#848E9C',
      },
      grid: {
        vertLines: { color: '#2B3139', style: 0, visible: false },
        horzLines: { color: '#2B3139', style: 0 },
      },
      width: chartContainerRef.current.clientWidth,
      height: 200,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: '#2B3139',
      },
      rightPriceScale: {
        borderColor: '#2B3139',
      },
      crosshair: {
        mode: 1 // CrosshairMode.Normal
      }
    });

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#0ECB81',
      downColor: '#F6465D',
      borderVisible: false,
      wickUpColor: '#0ECB81',
      wickDownColor: '#F6465D',
    });

    candlestickSeriesRef.current = candlestickSeries;
    chartRef.current = chart;

    // Handle Resize
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    // Initial Data
    BinanceService.getKlines(symbol, '1m', 200).then(data => {
      if(candlestickSeriesRef.current) {
        candlestickSeriesRef.current.setData(data);
        // chart.timeScale().fitContent();
      }
    });

    // Subscribe to Kline Updates
    const klineWs = BinanceService.subscribeToKlines(symbol, '1m', (kline) => {
      if (candlestickSeriesRef.current) {
        candlestickSeriesRef.current.update(kline);
      }
    });

    return () => {
      window.removeEventListener('resize', handleResize);
      klineWs.close();
      chart.remove();
      chartRef.current = null;
    };
  }, [symbol]);

  useEffect(() => {
    setTrades([]);
    tradesRef.current = [];
    
    const ws = BinanceService.subscribeToTrades(symbol, (data: AggTrade) => {
      if (isPaused) return;

      const price = parseFloat(data.p);
      const quantity = parseFloat(data.q);
      const value = price * quantity;

      // Only keep trades above minimum threshold to reduce noise
      if (value < threshold) return;

      const isNuclear = value > 1000000; // $1M+ is Nuclear
      
      const newTrade: ProcessedTrade = {
        ...data,
        value,
        isWhale: true,
        isNuclear
      };

      tradesRef.current = [newTrade, ...tradesRef.current].slice(0, 50); // Keep last 50
      setTrades([...tradesRef.current]);
    });

    return () => {
      ws.close();
    };
  }, [symbol, threshold, isPaused]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(val);
  };

  return (
    <div className="flex flex-col h-full bg-terminal-panel border border-terminal-border rounded-lg overflow-hidden">
      <div className="p-4 border-b border-terminal-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-terminal-text" />
          <h2 className="font-bold text-sm uppercase tracking-wider">Live Activity <span className="text-terminal-muted">({symbol})</span></h2>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsPaused(!isPaused)}
            className="p-1.5 hover:bg-terminal-border rounded text-terminal-muted hover:text-white transition-colors"
          >
            {isPaused ? <Play size={14} /> : <Pause size={14} />}
          </button>
          
          <div className="flex items-center bg-terminal-bg border border-terminal-border rounded px-2 py-1 gap-2">
            <Filter size={12} className="text-terminal-muted" />
            <select 
              value={threshold} 
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="bg-transparent text-xs font-mono text-terminal-text outline-none"
            >
              <option value="50000">$50k (Degen)</option>
              <option value="100000">$100k (Standard)</option>
              <option value="500000">$500k (Large)</option>
              <option value="1000000">$1M (Whale)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Chart Section */}
      <div className="shrink-0 relative w-full border-b border-terminal-border bg-terminal-panel" style={{ height: '200px' }}>
         <div ref={chartContainerRef} className="absolute inset-0" />
         <div className="absolute top-2 left-2 z-10 text-[10px] bg-terminal-bg/50 px-2 py-0.5 rounded text-terminal-muted pointer-events-none">
            M1 Timeframe
         </div>
      </div>

      <div className="flex-1 overflow-y-auto p-0 scroll-smooth" ref={scrollRef}>
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-terminal-panel z-10 text-[10px] text-terminal-muted uppercase font-mono border-b border-terminal-border shadow-sm">
            <tr>
              <th className="px-4 py-2">Time</th>
              <th className="px-4 py-2">Side</th>
              <th className="px-4 py-2">Price</th>
              <th className="px-4 py-2 text-right">Value (USDT)</th>
            </tr>
          </thead>
          <tbody className="font-mono text-xs">
            {trades.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-terminal-muted italic">
                  Waiting for trades &gt; {formatCurrency(threshold)}...
                </td>
              </tr>
            ) : (
              trades.map((trade) => (
                <tr 
                  key={trade.a} 
                  className={`
                    border-b border-terminal-border/50 hover:bg-terminal-border/30 transition-colors
                    ${trade.isNuclear ? 'bg-terminal-yellow/5' : ''}
                  `}
                >
                  <td className="px-4 py-2 text-terminal-muted">
                    {new Date(trade.T).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' })}
                  </td>
                  <td className={`px-4 py-2 font-bold flex items-center gap-1 ${!trade.m ? 'text-terminal-green' : 'text-terminal-red'}`}>
                    {!trade.m ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                    {!trade.m ? 'BUY' : 'SELL'}
                  </td>
                  <td className="px-4 py-2 text-terminal-text">
                    {parseFloat(trade.p).toFixed(trade.p.indexOf('1') > 0 ? 4 : 2)}
                  </td>
                  <td className={`px-4 py-2 text-right font-bold ${trade.isNuclear ? 'text-terminal-yellow' : 'text-terminal-text'}`}>
                    {formatCurrency(trade.value)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};