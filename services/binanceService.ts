import { Ticker24h, PremiumIndex, OrderBook, Kline } from '../types';

const BASE_URL = 'https://fapi.binance.com';
const WS_BASE_URL = 'wss://fstream.binance.com/ws';

export const BinanceService = {
  // Fetch 24hr ticker for all symbols to get price and volume
  get24hrTicker: async (): Promise<Ticker24h[]> => {
    try {
      const response = await fetch(`${BASE_URL}/fapi/v1/ticker/24hr`);
      if (!response.ok) throw new Error('Network response was not ok');
      return await response.json();
    } catch (error) {
      console.error('Error fetching ticker:', error);
      return [];
    }
  },

  // Fetch Premium Index to get Funding Rates
  getPremiumIndex: async (): Promise<PremiumIndex[]> => {
    try {
      const response = await fetch(`${BASE_URL}/fapi/v1/premiumIndex`);
      if (!response.ok) throw new Error('Network response was not ok');
      return await response.json();
    } catch (error) {
      console.error('Error fetching premium index:', error);
      return [];
    }
  },

  // Fetch Order Book Depth (REST - Legacy/Snapshot)
  getDepth: async (symbol: string): Promise<OrderBook | null> => {
    try {
      // Limit 500 is good for analysis
      const response = await fetch(`${BASE_URL}/fapi/v1/depth?symbol=${symbol}&limit=500`);
      if (!response.ok) throw new Error('Network response was not ok');
      return await response.json();
    } catch (error) {
      console.error('Error fetching depth:', error);
      return null;
    }
  },

  // Real-time Order Book Subscription (WebSocket + Local State)
  subscribeToDepth: (symbol: string, callback: (depth: OrderBook) => void) => {
    const ws = new WebSocket(`${WS_BASE_URL}/${symbol.toLowerCase()}@depth@100ms`);
    let isSnapshotLoaded = false;
    let eventBuffer: any[] = [];
    const bids = new Map<string, string>(); // Price -> Qty
    const asks = new Map<string, string>(); // Price -> Qty
    let lastFinalUpdateId = 0;
    let isClosed = false;

    const processUpdate = (data: any) => {
      // Discard older events based on update ID
      if (data.u <= lastFinalUpdateId) return;

      // Update Bids
      for (const [price, qty] of data.b) {
        if (parseFloat(qty) === 0) bids.delete(price);
        else bids.set(price, qty);
      }

      // Update Asks
      for (const [price, qty] of data.a) {
        if (parseFloat(qty) === 0) asks.delete(price);
        else asks.set(price, qty);
      }
      
      lastFinalUpdateId = data.u;
      
      // Convert Map to Sorted Arrays for the UI
      // Bids: High to Low
      const sortedBids = Array.from(bids.entries()).sort((a, b) => parseFloat(b[0]) - parseFloat(a[0]));
      // Asks: Low to High
      const sortedAsks = Array.from(asks.entries()).sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]));

      callback({
        lastUpdateId: lastFinalUpdateId,
        bids: sortedBids,
        asks: sortedAsks
      });
    };

    ws.onmessage = (event) => {
      if (isClosed) return;
      const data = JSON.parse(event.data);
      if (!isSnapshotLoaded) {
        eventBuffer.push(data);
      } else {
        processUpdate(data);
      }
    };

    // Fetch Initial Snapshot to build base book
    fetch(`${BASE_URL}/fapi/v1/depth?symbol=${symbol}&limit=1000`)
      .then(res => res.json())
      .then((snapshot: OrderBook) => {
        if (isClosed) return;

        lastFinalUpdateId = snapshot.lastUpdateId;
        
        // Initialize Maps
        snapshot.bids.forEach(([p, q]) => bids.set(p, q));
        snapshot.asks.forEach(([p, q]) => asks.set(p, q));
        
        isSnapshotLoaded = true;

        // Process any events that came in while fetching snapshot
        const relevantEvents = eventBuffer.filter(e => e.u > lastFinalUpdateId);
        relevantEvents.forEach(processUpdate);
        eventBuffer = [];
      })
      .catch(e => console.error('Depth snapshot error:', e));

    return {
      close: () => {
        isClosed = true;
        if (ws.readyState === WebSocket.OPEN) ws.close();
      }
    };
  },

  // WebSocket for Aggregated Trades
  subscribeToTrades: (symbol: string, callback: (data: any) => void) => {
    const ws = new WebSocket(`${WS_BASE_URL}/${symbol.toLowerCase()}@aggTrade`);
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      callback(data);
    };

    ws.onerror = (error) => {
      console.error(`WebSocket error for ${symbol}:`, error);
    };

    return ws;
  },

  // Fetch Historical Klines
  getKlines: async (symbol: string, interval: string = '1m', limit: number = 200): Promise<Kline[]> => {
    try {
      const response = await fetch(`${BASE_URL}/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
      if (!response.ok) throw new Error('Network response was not ok');
      const data = await response.json();
      return data.map((d: any[]) => ({
        time: d[0] / 1000, // Seconds
        open: parseFloat(d[1]),
        high: parseFloat(d[2]),
        low: parseFloat(d[3]),
        close: parseFloat(d[4]),
        volume: parseFloat(d[5])
      }));
    } catch (error) {
      console.error('Error fetching klines:', error);
      return [];
    }
  },

  // WebSocket for Klines (Candles)
  subscribeToKlines: (symbol: string, interval: string, callback: (kline: Kline) => void) => {
    const ws = new WebSocket(`${WS_BASE_URL}/${symbol.toLowerCase()}@kline_${interval}`);
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      const k = data.k;
      callback({
        time: k.t / 1000,
        open: parseFloat(k.o),
        high: parseFloat(k.h),
        low: parseFloat(k.l),
        close: parseFloat(k.c),
        volume: parseFloat(k.v)
      });
    };

    return ws;
  }
};