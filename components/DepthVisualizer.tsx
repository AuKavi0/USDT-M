import React, { useEffect, useState, useMemo, useRef } from 'react';
import { BinanceService } from '../services/binanceService';
import { ProcessedDepth, OrderBookEntry } from '../types';
import { ComposedChart, Bar, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine, CartesianGrid } from 'recharts';
import { Layers, Info, Wifi, BarChart2, Activity } from 'lucide-react';

interface DepthVisualizerProps {
  symbol: string;
}

interface VolumeNode {
  price: number;
  volume: number;
  buyVol: number;
  sellVol: number;
}

export const DepthVisualizer: React.FC<DepthVisualizerProps> = ({ symbol }) => {
  const [depthData, setDepthData] = useState<ProcessedDepth | null>(null);
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  
  // Volume Profile State (using Ref for high-frequency updates without re-renders)
  const volumeProfileRef = useRef<Map<string, VolumeNode>>(new Map());
  const [volumeUpdateTrigger, setVolumeUpdateTrigger] = useState(0); // Trigger for periodic UI updates of stats

  useEffect(() => {
    setLoading(true);
    setConnected(false);
    volumeProfileRef.current.clear();
    setVolumeUpdateTrigger(0);
    
    // 1. Subscribe to Trades (for Volume Profile)
    const tradeWs = BinanceService.subscribeToTrades(symbol, (trade) => {
      const price = parseFloat(trade.p).toFixed(2); // Group by 2 decimals
      const qty = parseFloat(trade.q);
      const isBuyerMaker = trade.m; // True = Sell, False = Buy
      
      const node = volumeProfileRef.current.get(price) || { price: parseFloat(price), volume: 0, buyVol: 0, sellVol: 0 };
      
      node.volume += qty;
      if (isBuyerMaker) {
        node.sellVol += qty;
      } else {
        node.buyVol += qty;
      }
      
      volumeProfileRef.current.set(price, node);
    });

    // Interval to trigger stats update (every 1s) to avoid thrashing React state
    const statsInterval = setInterval(() => {
      setVolumeUpdateTrigger(prev => prev + 1);
    }, 1000);

    // 2. Subscribe to Depth
    const depthSubscription = BinanceService.subscribeToDepth(symbol, (rawDepth) => {
      setConnected(true);
      
      if (!rawDepth.bids.length || !rawDepth.asks.length) return;

      const bestBid = parseFloat(rawDepth.bids[0][0]);
      const bestAsk = parseFloat(rawDepth.asks[0][0]);
      const midPrice = (bestBid + bestAsk) / 2;
      const range = midPrice * 0.015; // 1.5% range

      // Process Bids
      const bids: OrderBookEntry[] = [];
      for (const b of rawDepth.bids) {
        const price = parseFloat(b[0]);
        if (price < midPrice - range) break;
        bids.push({ 
          price, 
          quantity: parseFloat(b[1]), 
          total: price * parseFloat(b[1]) 
        });
      }

      // Process Asks
      const asks: OrderBookEntry[] = [];
      for (const a of rawDepth.asks) {
        const price = parseFloat(a[0]);
        if (price > midPrice + range) break;
        asks.push({ 
          price, 
          quantity: parseFloat(a[1]), 
          total: price * parseFloat(a[1]) 
        });
      }

      if (bids.length === 0 || asks.length === 0) {
        setLoading(false);
        return;
      }

      // Analyze Walls
      const maxBid = bids.reduce((max, b) => b.quantity > max.quantity ? b : max, bids[0] || {quantity: 0, price: 0, total: 0});
      const maxAsk = asks.reduce((max, a) => a.quantity > max.quantity ? a : max, asks[0] || {quantity: 0, price: 0, total: 0});
      
      const totalBidVol = bids.reduce((sum, b) => sum + b.quantity, 0);
      const totalAskVol = asks.reduce((sum, a) => sum + a.quantity, 0);
      
      const ratio = totalBidVol / (totalAskVol || 1);

      let verdict: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
      if (ratio > 2.0) verdict = 'BULLISH';
      if (ratio < 0.5) verdict = 'BEARISH';

      setDepthData({
        bids: bids,
        asks: asks,
        wallAnalysis: {
          bidWallPrice: maxBid.price,
          bidWallSize: maxBid.quantity,
          askWallPrice: maxAsk.price,
          askWallSize: maxAsk.quantity,
          ratio,
          verdict
        }
      });
      setLoading(false);
    });

    return () => {
      depthSubscription.close();
      tradeWs.close();
      clearInterval(statsInterval);
      setConnected(false);
    };
  }, [symbol]);

  // Merge Depth Data with Volume Profile Data for the Chart
  const chartData = useMemo(() => {
    if (!depthData) return [];
    
    const limitedBids = [...depthData.bids].slice(0, 60);
    const limitedAsks = [...depthData.asks].slice(0, 60);
    
    const combined = [
      ...limitedBids.reverse().map(b => ({ price: b.price, size: b.quantity, type: 'bid', tradedVol: 0 })),
      ...limitedAsks.map(a => ({ price: a.price, size: a.quantity, type: 'ask', tradedVol: 0 }))
    ];

    // Enrich with volume profile data
    return combined.map(item => {
        const priceKey = item.price.toFixed(2);
        const volNode = volumeProfileRef.current.get(priceKey);
        return {
            ...item,
            tradedVol: volNode ? volNode.volume : 0
        };
    });
  }, [depthData, volumeUpdateTrigger]); // Re-calc when depth updates OR volume trigger fires

  // Calculate Side Panel Stats
  const volumeStats = useMemo(() => {
    const nodes: VolumeNode[] = Array.from(volumeProfileRef.current.values());
    const totalVol = nodes.reduce((acc, n) => acc + n.volume, 0);
    const maxVolNode = nodes.reduce((max, n) => n.volume > max.volume ? n : max, { volume: 0, price: 0, buyVol: 0, sellVol: 0 } as VolumeNode);
    
    // Top 10 levels by volume sorted desc
    const topLevels = [...nodes].sort((a, b) => b.volume - a.volume).slice(0, 15);

    return { totalVol, maxVolNode, topLevels };
  }, [volumeUpdateTrigger]);

  const maxDepthSize = useMemo(() => {
    if (!chartData.length) return 1;
    return Math.max(...chartData.map(d => d.size));
  }, [chartData]);
  
  const maxTradedVol = useMemo(() => {
    if (!chartData.length) return 1;
    return Math.max(...chartData.map(d => d.tradedVol), 1);
  }, [chartData]);

  const formatK = (num: number) => {
    if (num >= 1000000) return (num/1000000).toFixed(2) + 'M';
    if (num >= 1000) return (num/1000).toFixed(1) + 'K';
    return num.toFixed(0);
  };

  // Helper for heatmap colors
  const getIntensityColor = (type: string, intensity: number) => {
    // Super High Intensity (Walls) gets Yellow regardless of side to indicate "Obstacle"
    if (intensity >= 0.8) return '#FCD535'; 

    if (type === 'bid') {
      // Bids: Dark Green -> Neon Green
      if (intensity >= 0.6) return '#34D399'; // Bright Green
      if (intensity >= 0.3) return '#0ECB81'; // Standard Green
      return '#064E3B'; // Dark Teal/Green (Low Liq)
    } else {
      // Asks: Dark Red -> Neon Red
      if (intensity >= 0.6) return '#F87171'; // Bright Red
      if (intensity >= 0.3) return '#F6465D'; // Standard Red
      return '#450a0a'; // Dark Maroon/Red (Low Liq)
    }
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const pData = payload[0].payload;
      const intensityVal = maxDepthSize > 0 ? (pData.size / maxDepthSize) : 0;
      const depthIntensity = (intensityVal * 100).toFixed(0);
      
      let status = "Low Liquidity";
      let statusColor = "text-terminal-muted";
      
      if (intensityVal > 0.8) { status = "🔥 WALL"; statusColor = "text-terminal-yellow"; }
      else if (intensityVal > 0.6) { status = "High Density"; statusColor = "text-white"; }
      else if (intensityVal > 0.3) { status = "Moderate"; statusColor = "text-terminal-text"; }

      return (
        <div className="bg-terminal-panel border border-terminal-border p-2 rounded shadow-xl text-xs font-mono z-50 backdrop-blur-md bg-opacity-95">
          <div className="flex justify-between gap-4 mb-1">
            <span className="text-terminal-muted">Price:</span>
            <span className="text-white font-bold">{Number(label).toFixed(2)}</span>
          </div>
          <div className="flex justify-between gap-4 mb-1">
            <span className="text-terminal-muted">Depth Size:</span>
            <span className={`${pData.type === 'bid' ? 'text-terminal-green' : 'text-terminal-red'} font-bold`}>
              {formatK(pData.size)}
            </span>
          </div>
          <div className="flex justify-between gap-4 mb-1">
            <span className="text-terminal-muted">Traded Vol:</span>
            <span className="text-blue-400 font-bold">
              {formatK(pData.tradedVol)}
            </span>
          </div>
           <div className="flex justify-between gap-4 pt-1 border-t border-terminal-border mt-1">
            <span className="text-terminal-muted">Density:</span>
            <span className={`${statusColor} font-bold`}>{status} ({depthIntensity}%)</span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-terminal-panel border border-terminal-border rounded-lg h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-terminal-border flex justify-between items-start shrink-0">
        <div>
          <h2 className="font-bold text-sm uppercase tracking-wider flex items-center gap-2">
            <Layers size={16} className="text-terminal-text" />
            Depth & Volume <span className="text-terminal-muted">({symbol})</span>
            {connected && <div className="w-1.5 h-1.5 rounded-full bg-terminal-green animate-pulse shadow-[0_0_8px_rgba(14,203,129,0.5)]"></div>}
          </h2>
          {depthData ? (
            <div className="mt-2 flex items-center gap-4 text-xs font-mono">
              <div className="flex flex-col">
                <span className="text-terminal-muted">Order Book Ratio</span>
                <span className={`font-bold ${depthData.wallAnalysis.ratio > 2 ? 'text-terminal-green' : depthData.wallAnalysis.ratio < 0.5 ? 'text-terminal-red' : 'text-terminal-text'}`}>
                  {depthData.wallAnalysis.ratio.toFixed(2)}x
                </span>
              </div>
              <div className="flex flex-col border-l border-terminal-border pl-4">
                <span className="text-terminal-muted">Session Vol</span>
                <span className="text-blue-400 font-bold">
                  {formatK(volumeStats.totalVol)}
                </span>
              </div>
              <div className="flex flex-col border-l border-terminal-border pl-4">
                <span className="text-terminal-muted">POC Level</span>
                <span className="text-terminal-yellow font-bold">
                   {volumeStats.maxVolNode.price > 0 ? volumeStats.maxVolNode.price.toFixed(2) : '--'}
                </span>
              </div>
            </div>
          ) : (
            <div className="mt-2 text-xs text-terminal-muted flex items-center gap-2">
              <Wifi size={12} className="animate-pulse" /> Syncing order book & trade feed...
            </div>
          )}
        </div>
        
        {depthData && (
          <div className={`px-3 py-1 rounded text-xs font-bold border ${
            depthData.wallAnalysis.verdict === 'BULLISH' ? 'bg-terminal-green/10 text-terminal-green border-terminal-green/30' :
            depthData.wallAnalysis.verdict === 'BEARISH' ? 'bg-terminal-red/10 text-terminal-red border-terminal-red/30' :
            'bg-terminal-border text-terminal-muted border-terminal-muted/30'
          }`}>
            {depthData.wallAnalysis.verdict}
          </div>
        )}
      </div>

      {/* Main Content Area: Chart + Side Panel */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        
        {/* Left: Chart */}
        <div className="flex-1 h-full relative p-2 bg-terminal-bg/50">
            {loading && !depthData ? (
            <div className="h-full flex flex-col items-center justify-center text-terminal-muted gap-2">
                <div className="w-6 h-6 border-2 border-terminal-yellow border-t-transparent rounded-full animate-spin"></div>
                <span className="text-xs">Building Volume Profile...</span>
            </div>
            ) : (
            <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} barCategoryGap={1}>
                <CartesianGrid vertical={false} stroke="#2B3139" strokeDasharray="3 3" opacity={0.3} />
                <XAxis 
                    dataKey="price" 
                    tick={{fontSize: 10, fill: '#848E9C', fontFamily: 'JetBrains Mono'}} 
                    tickFormatter={(val) => val.toFixed(2)}
                    interval="preserveStartEnd"
                    minTickGap={30}
                    axisLine={false}
                    tickLine={false}
                    dy={10}
                />
                <YAxis yAxisId="left" hide />
                <YAxis yAxisId="right" orientation="right" hide domain={[0, 'dataMax']} />
                
                <Tooltip content={<CustomTooltip />} cursor={{fill: 'rgba(255,255,255,0.05)'}} />
                
                {/* Volume Profile Area (Behind) */}
                <Area
                    yAxisId="right"
                    type="monotone"
                    dataKey="tradedVol"
                    stroke="#3b82f6"
                    fill="#3b82f6"
                    fillOpacity={0.08}
                    strokeWidth={1}
                    isAnimationActive={false}
                />

                {/* Depth Bars (Front) - Enhanced Heatmap Visualization */}
                <Bar yAxisId="left" dataKey="size" isAnimationActive={false}>
                    {chartData.map((entry, index) => {
                    const intensity = maxDepthSize > 0 ? (entry.size / maxDepthSize) : 0;
                    const color = getIntensityColor(entry.type, intensity);
                    
                    // Dynamic opacity: Lower intensity is more transparent to let grid show, but still visible
                    const opacity = 0.5 + (intensity * 0.5); 

                    return (
                        <Cell 
                        key={`cell-${index}`} 
                        fill={color} 
                        fillOpacity={opacity}
                        stroke={intensity > 0.8 ? '#FFFFFF' : 'none'}
                        strokeWidth={intensity > 0.8 ? 1 : 0}
                        strokeOpacity={0.8}
                        />
                    );
                    })}
                </Bar>
                
                {depthData && (
                    <>
                    <ReferenceLine yAxisId="left" x={depthData.wallAnalysis.bidWallPrice} stroke="#0ECB81" strokeDasharray="3 3" strokeOpacity={0.5} label={{ position: 'insideTopLeft', value: 'Support', fill: '#0ECB81', fontSize: 10 }} />
                    <ReferenceLine yAxisId="left" x={depthData.wallAnalysis.askWallPrice} stroke="#F6465D" strokeDasharray="3 3" strokeOpacity={0.5} label={{ position: 'insideTopRight', value: 'Resistance', fill: '#F6465D', fontSize: 10 }} />
                    </>
                )}
                </ComposedChart>
            </ResponsiveContainer>
            )}
            
            {/* Heatmap Legend Overlay */}
            <div className="absolute top-2 left-4 flex flex-col gap-2 p-2 rounded-lg bg-black/60 border border-white/10 backdrop-blur-md z-10 shadow-xl">
                 <div className="text-[9px] uppercase tracking-wider text-terminal-muted font-bold">Order Density Heatmap</div>
                 <div className="flex items-center gap-3 text-[10px]">
                     <div className="flex flex-col items-center gap-1">
                        <div className="w-8 h-1.5 rounded-full bg-gradient-to-r from-[#064E3B] to-[#450a0a]"></div>
                        <span className="text-terminal-muted">Low</span>
                     </div>
                     <div className="flex flex-col items-center gap-1">
                        <div className="w-8 h-1.5 rounded-full bg-gradient-to-r from-terminal-green to-terminal-red"></div>
                        <span className="text-white">Med</span>
                     </div>
                     <div className="flex flex-col items-center gap-1">
                        <div className="w-8 h-1.5 rounded-full bg-gradient-to-r from-[#34D399] to-[#F87171]"></div>
                        <span className="text-white font-bold">High</span>
                     </div>
                     <div className="flex flex-col items-center gap-1">
                        <div className="w-8 h-1.5 rounded-full bg-terminal-yellow border border-white/50"></div>
                        <span className="text-terminal-yellow font-bold">WALL</span>
                     </div>
                 </div>
            </div>
        </div>

        {/* Right: Volume Profile Side Panel */}
        <div className="w-48 border-l border-terminal-border bg-terminal-bg/30 flex flex-col">
            <div className="p-2 border-b border-terminal-border bg-terminal-panel/50">
                <h3 className="text-[10px] uppercase font-bold text-terminal-muted flex items-center gap-1">
                    <BarChart2 size={10} /> High Vol Nodes
                </h3>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {volumeStats.topLevels.length === 0 ? (
                    <div className="p-4 text-center text-[10px] text-terminal-muted italic">
                        Gathering trade data...
                    </div>
                ) : (
                    <div className="flex flex-col">
                        {volumeStats.topLevels.map((level) => {
                            const isPoc = level.price === volumeStats.maxVolNode.price;
                            const percent = (level.volume / volumeStats.maxVolNode.volume) * 100;
                            return (
                                <div key={level.price} className={`relative flex items-center justify-between px-3 py-1.5 border-b border-terminal-border/30 text-xs font-mono hover:bg-white/5 ${isPoc ? 'bg-terminal-yellow/5' : ''}`}>
                                    {/* Background Bar */}
                                    <div 
                                        className="absolute left-0 top-0 bottom-0 bg-blue-500/10 z-0 transition-all duration-500"
                                        style={{ width: `${percent}%` }}
                                    ></div>
                                    
                                    <span className={`z-10 relative ${isPoc ? 'text-terminal-yellow font-bold' : 'text-terminal-text'}`}>
                                        {level.price.toFixed(2)}
                                        {isPoc && <span className="ml-1 text-[8px] bg-terminal-yellow text-black px-1 rounded font-sans font-bold">POC</span>}
                                    </span>
                                    <span className="z-10 relative text-terminal-muted text-[10px]">
                                        {formatK(level.volume)}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
            {/* POC Stats */}
            <div className="p-3 border-t border-terminal-border bg-terminal-panel/30">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-terminal-muted">POC Volume</span>
                    <span className="text-xs font-mono text-terminal-text">{formatK(volumeStats.maxVolNode.volume)}</span>
                </div>
                <div className="flex items-center justify-between">
                    <span className="text-[10px] text-terminal-muted">Activity</span>
                    <span className="text-xs font-mono text-blue-400 flex items-center gap-1">
                        <Activity size={10} /> Active
                    </span>
                </div>
            </div>
        </div>

      </div>
      
      {/* Footer */}
      <div className="px-4 py-2 border-t border-terminal-border bg-terminal-bg/30 text-[10px] text-terminal-muted flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
            <Info size={12} />
            <span>Visualization: Order Depth (Bars) + Traded Vol (Area)</span>
        </div>
        <div className="flex items-center gap-3">
           <span className="flex items-center gap-1 opacity-50"><span className="w-2 h-2 bg-terminal-green rounded-sm"></span> Low Liq</span>
           <span className="flex items-center gap-1 font-bold text-white"><span className="w-2 h-2 bg-terminal-green border border-white rounded-sm"></span> High Liq Wall</span>
        </div>
      </div>
    </div>
  );
};