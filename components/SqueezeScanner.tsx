import React, { useEffect, useState } from 'react';
import { BinanceService } from '../services/binanceService';
import { SqueezeCandidate, Ticker24h, PremiumIndex } from '../types';
import { ArrowUp, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface SqueezeScannerProps {
  onSelectSymbol: (symbol: string) => void;
}

export const SqueezeScanner: React.FC<SqueezeScannerProps> = ({ onSelectSymbol }) => {
  const [candidates, setCandidates] = useState<SqueezeCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [tickers, premiumIndices] = await Promise.all([
        BinanceService.get24hrTicker(),
        BinanceService.getPremiumIndex()
      ]);

      // Map for fast lookup
      const tickerMap = new Map<string, Ticker24h>();
      tickers.forEach(t => tickerMap.set(t.symbol, t));

      const foundCandidates: SqueezeCandidate[] = [];

      premiumIndices.forEach(p => {
        const ticker = tickerMap.get(p.symbol);
        if (!ticker) return;

        const fundingRate = parseFloat(p.lastFundingRate);
        const priceChange = parseFloat(ticker.priceChangePercent);
        const volume = parseFloat(ticker.quoteVolume);

        // Filter Logic:
        // 1. Negative Funding (Shorts paying Longs)
        // 2. Price is UP (Shorts are underwater)
        // 3. Decent Volume (> 50M USDT) to avoid scams
        if (fundingRate < -0.0005 && priceChange > 0 && volume > 10000000) {
           // Score calculation: Lower funding + Higher price change = Higher Squeeze Probability
           const score = (Math.abs(fundingRate) * 1000) + priceChange;
           
           foundCandidates.push({
             symbol: p.symbol,
             price: parseFloat(ticker.lastPrice),
             priceChangePercent: priceChange,
             fundingRate: fundingRate,
             volume: volume,
             score: score
           });
        }
      });

      // Sort by score descending
      foundCandidates.sort((a, b) => b.score - a.score);
      setCandidates(foundCandidates);
      setLastUpdated(new Date());

    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-terminal-panel border border-terminal-border rounded-lg flex flex-col h-full">
      <div className="p-4 border-b border-terminal-border flex justify-between items-center">
        <div>
          <h2 className="font-bold text-sm uppercase tracking-wider flex items-center gap-2">
            <AlertTriangle size={16} className="text-terminal-yellow" />
            Squeeze Scanner
          </h2>
          <p className="text-[10px] text-terminal-muted mt-1">
            Detecting: <span className="text-terminal-red">Neg Funding</span> + <span className="text-terminal-green">Rising Price</span>
          </p>
        </div>
        <button 
          onClick={fetchData} 
          className={`p-2 rounded hover:bg-terminal-border text-terminal-muted hover:text-white transition-all ${loading ? 'animate-spin' : ''}`}
        >
          <RefreshCw size={16} />
        </button>
      </div>

      <div className="overflow-auto flex-1">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-terminal-panel z-10 text-[10px] text-terminal-muted uppercase font-mono border-b border-terminal-border">
            <tr>
              <th className="px-4 py-2">Symbol</th>
              <th className="px-4 py-2 text-right">Price</th>
              <th className="px-4 py-2 text-right">24h Chg</th>
              <th className="px-4 py-2 text-right">Funding</th>
              <th className="px-4 py-2 text-center">Setup</th>
            </tr>
          </thead>
          <tbody className="font-mono text-xs">
            {loading && candidates.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-terminal-muted">Scanning market...</td></tr>
            ) : candidates.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-terminal-muted">No high-probability squeeze setups found.</td></tr>
            ) : (
              candidates.map((coin) => (
                <tr 
                  key={coin.symbol} 
                  onClick={() => onSelectSymbol(coin.symbol)}
                  className="border-b border-terminal-border/50 hover:bg-terminal-border/30 cursor-pointer transition-colors group"
                >
                  <td className="px-4 py-3 font-bold text-terminal-text group-hover:text-terminal-yellow">
                    {coin.symbol}
                  </td>
                  <td className="px-4 py-3 text-right">
                    ${coin.price}
                  </td>
                  <td className="px-4 py-3 text-right text-terminal-green">
                    +{coin.priceChangePercent.toFixed(2)}%
                  </td>
                  <td className="px-4 py-3 text-right text-terminal-red font-bold">
                    {(coin.fundingRate * 100).toFixed(4)}%
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-terminal-green/10 text-terminal-green border border-terminal-green/20">
                       BULL <ArrowUp size={10} />
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="p-2 border-t border-terminal-border text-[10px] text-terminal-muted text-right">
        Last updated: {lastUpdated ? lastUpdated.toLocaleTimeString() : '--:--'}
      </div>
    </div>
  );
};