export interface Ticker24h {
  symbol: string;
  priceChange: string;
  priceChangePercent: string;
  lastPrice: string;
  volume: string;
  quoteVolume: string; // Volume in USDT
}

export interface PremiumIndex {
  symbol: string;
  lastFundingRate: string;
  nextFundingTime: number;
  interestRate: string;
}

export interface AggTrade {
  e: string; // Event type
  E: number; // Event time
  s: string; // Symbol
  a: number; // Aggregate trade ID
  p: string; // Price
  q: string; // Quantity
  f: number; // First trade ID
  l: number; // Last trade ID
  T: number; // Trade time
  m: boolean; // Is the buyer the market maker? (True = Sell, False = Buy)
}

export interface OrderBookEntry {
  price: number;
  quantity: number;
  total: number; // Price * Quantity
}

export interface OrderBook {
  lastUpdateId: number;
  bids: string[][]; // [Price, Quantity]
  asks: string[][]; // [Price, Quantity]
}

export interface ProcessedDepth {
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
  wallAnalysis: WallAnalysis;
}

export interface WallAnalysis {
  bidWallPrice: number;
  bidWallSize: number;
  askWallPrice: number;
  askWallSize: number;
  ratio: number; // Bid Volume / Ask Volume near price
  verdict: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}

export interface SqueezeCandidate {
  symbol: string;
  price: number;
  priceChangePercent: number;
  fundingRate: number;
  volume: number;
  score: number; // Calculated score for sorting
}

export interface Kline {
  time: number; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}