export type AssetMeta = {
  symbol: string;
  name: string;
  description: string;
  logo?: string; // public path
};

function baseFromSymbol(sym: string): string {
  const s = sym.toUpperCase().trim();
  if (s.includes("-")) return s.split("-")[0];
  if (s.includes("/")) return s.split("/")[0];
  if (s.endsWith("USDT")) return s.slice(0, -4);
  if (s.endsWith("USD")) return s.slice(0, -3);
  return s;
}

const META: Record<string, AssetMeta> = {
  // Crypto (base symbols)
  BTC: { symbol: 'BTC-USD', name: 'Bitcoin', description: 'Criptomoneda descentralizada líder por capitalización y pionera del ecosistema.' },
  ETH: { symbol: 'ETH-USD', name: 'Ethereum', description: 'Red de contratos inteligentes usada para DeFi, NFTs y aplicaciones descentralizadas.' },
  SOL: { symbol: 'SOL-USD', name: 'Solana', description: 'Blockchain de alto rendimiento enfocada en velocidad y bajo coste de transacción.' },
  ADA: { symbol: 'ADA-USD', name: 'Cardano', description: 'Plataforma blockchain con enfoque académico y pruebas formales.' },
  DOGE: { symbol: 'DOGE-USD', name: 'Dogecoin', description: 'Criptomoneda basada en meme con comunidad amplia y tarifas bajas.' },
  XRP:  { symbol: 'XRP-USD',  name: 'XRP (Ripple)', description: 'Token para pagos globales rápidos y de bajo coste.' },
  BNB:  { symbol: 'BNB-USD',  name: 'BNB (BNB Chain)', description: 'Token de BNB Chain para comisiones y ecosistema DeFi.' },
  TRX:  { symbol: 'TRX-USD',  name: 'TRON', description: 'Red orientada a transferencia de valor con altas TPS.' },
  MATIC:{ symbol: 'MATIC-USD',name: 'Polygon (MATIC)', description: 'Solución de escalado para Ethereum y capa 2.' },
  DOT:  { symbol: 'DOT-USD',  name: 'Polkadot', description: 'Red multi-cadena para interoperabilidad entre blockchains.' },
  AVAX: { symbol: 'AVAX-USD', name: 'Avalanche', description: 'Plataforma de contratos inteligentes de alto rendimiento.' },
  SHIB: { symbol: 'SHIB-USD', name: 'Shiba Inu', description: 'Token ERC-20 con comunidad activa y ecosistema propio.' },
  LTC:  { symbol: 'LTC-USD',  name: 'Litecoin', description: 'Criptomoneda enfocada en pagos rápidos y de bajo coste.' },
  UNI:  { symbol: 'UNI-USD',  name: 'Uniswap', description: 'Token de gobernanza del DEX líder en Ethereum.' },
  LINK: { symbol: 'LINK-USD', name: 'Chainlink', description: 'Oráculos descentralizados para datos del mundo real.' },
  NEAR: { symbol: 'NEAR-USD', name: 'NEAR Protocol', description: 'Plataforma de contratos inteligentes escalable y fácil de usar.' },
  ATOM: { symbol: 'ATOM-USD', name: 'Cosmos (ATOM)', description: 'Ecosistema de cadenas interoperables (IBC).' },
  ETC:  { symbol: 'ETC-USD',  name: 'Ethereum Classic', description: 'Versión original de Ethereum tras el hard fork de 2016.' },
  OP:   { symbol: 'OP-USD',   name: 'Optimism', description: 'Capa 2 (rollup optimista) para escalar Ethereum.' },
  ARB:  { symbol: 'ARB-USD',  name: 'Arbitrum', description: 'Capa 2 (rollup) de alta capacidad en Ethereum.' },
  TON:  { symbol: 'TON-USD',  name: 'TON', description: 'The Open Network, blockchain enfocada en performance y UX.' },
  BCH:  { symbol: 'BCH-USD',  name: 'Bitcoin Cash', description: 'Fork de Bitcoin orientado a pagos con bloques más grandes.' },
  APT:  { symbol: 'APT-USD',  name: 'Aptos', description: 'L1 de alto rendimiento escrita en Move.' },
  FIL:  { symbol: 'FIL-USD',  name: 'Filecoin', description: 'Almacenamiento descentralizado y mercado de datos.' },
  ALGO: { symbol: 'ALGO-USD', name: 'Algorand', description: 'Red de consenso rápido con enfoque en finanzas.' },
  AAVE: { symbol: 'AAVE-USD', name: 'Aave', description: 'Protocolo DeFi para préstamos y crédito.' },
  SUI:  { symbol: 'SUI-USD',  name: 'Sui', description: 'L1 de alto rendimiento con objetos programables (Move).' },
  SEI:  { symbol: 'SEI-USD',  name: 'Sei', description: 'Red L1 optimizada para trading en cadena.' },
  PEPE: { symbol: 'PEPE-USD', name: 'Pepe', description: 'Meme coin con alta volatilidad y comunidad activa.' },

  // Equity (US tickers)
  NVDA: { symbol: 'NVDA', name: 'NVIDIA Corporation', description: 'Líder en GPUs y computación acelerada para IA, gaming y centros de datos.', logo: '/logos/nvda.svg' },
  AAPL: { symbol: 'AAPL', name: 'Apple Inc.', description: 'Tecnología de consumo: iPhone, Mac, iPad, servicios y wearables.', logo: '/logos/aapl.svg' },
  MSFT: { symbol: 'MSFT', name: 'Microsoft Corporation', description: 'Software, nube (Azure), productividad, IA y soluciones empresariales.', logo: '/logos/msft.svg' },
  TSLA: { symbol: 'TSLA', name: 'Tesla, Inc.', description: 'Vehículos eléctricos, energía y almacenamiento, con foco en innovación.', logo: '/logos/tsla.svg' },
  AMZN: { symbol: 'AMZN', name: 'Amazon.com, Inc.', description: 'E-commerce y nube (AWS), logística, dispositivos y contenido digital.', logo: '/logos/amzn.svg' },
  META: { symbol: 'META', name: 'Meta Platforms, Inc.', description: 'Redes sociales y metaverso. Plataformas como Facebook, Instagram y WhatsApp.', logo: '/logos/meta.svg' },
  GOOG: { symbol: 'GOOG', name: 'Alphabet Inc. (Class C)', description: 'Buscador, publicidad, Android, nube, IA y otros bets.', logo: '/logos/goog.svg' },
  GOOGL: { symbol: 'GOOGL', name: 'Alphabet Inc. (Class A)', description: 'Buscador, publicidad, Android, nube, IA y otros bets.', logo: '/logos/goog.svg' },

  // ETFs
  SPY: { symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust', description: 'ETF que replica el índice S&P 500 (acciones de gran capitalización de EE.UU.).', logo: '/logos/spy.svg' },
  QQQ: { symbol: 'QQQ', name: 'Invesco QQQ Trust', description: 'ETF que sigue el Nasdaq-100 (tecnológicas y crecimiento).', logo: '/logos/qqq.svg' },
  TLT: { symbol: 'TLT', name: 'iShares 20+ Year Treasury Bond ETF', description: 'ETF de bonos del Tesoro de EE.UU. a largo plazo (sensibilidad a tasas).', logo: '/logos/tlt.svg' },
  GLD: { symbol: 'GLD', name: 'SPDR Gold Shares', description: 'ETF respaldado por oro físico; exposición al precio del oro.', logo: '/logos/gld.svg' },

  // ETFs sectoriales y otros (genéricos con icono ETF)
  DIA: { symbol: 'DIA', name: 'SPDR Dow Jones Industrial Average ETF', description: 'ETF que sigue el índice Dow Jones Industrial Average.' },
  IWM: { symbol: 'IWM', name: 'iShares Russell 2000 ETF', description: 'ETF de small caps de EE.UU. (Russell 2000).' },
  EEM: { symbol: 'EEM', name: 'iShares MSCI Emerging Markets ETF', description: 'ETF de mercados emergentes (MSCI EM).' },
  HYG: { symbol: 'HYG', name: 'iShares iBoxx High Yield Corporate Bond ETF', description: 'ETF de bonos corporativos high-yield.' },
  XLK: { symbol: 'XLK', name: 'Technology Select Sector SPDR Fund', description: 'ETF sector tecnológico del S&P 500.' },
  XLE: { symbol: 'XLE', name: 'Energy Select Sector SPDR Fund', description: 'ETF sector energía del S&P 500.' },
  XLF: { symbol: 'XLF', name: 'Financial Select Sector SPDR Fund', description: 'ETF sector financiero del S&P 500.' },
  XLV: { symbol: 'XLV', name: 'Health Care Select Sector SPDR Fund', description: 'ETF sector salud del S&P 500.' },
  XLY: { symbol: 'XLY', name: 'Consumer Discretionary Select Sector SPDR Fund', description: 'ETF sector consumo discrecional del S&P 500.' },
  XLI: { symbol: 'XLI', name: 'Industrial Select Sector SPDR Fund', description: 'ETF sector industrial del S&P 500.' },
  XLP: { symbol: 'XLP', name: 'Consumer Staples Select Sector SPDR Fund', description: 'ETF sector consumo básico del S&P 500.' },
  XLB: { symbol: 'XLB', name: 'Materials Select Sector SPDR Fund', description: 'ETF sector materiales del S&P 500.' },
  XLU: { symbol: 'XLU', name: 'Utilities Select Sector SPDR Fund', description: 'ETF sector utilities del S&P 500.' },

  // Forex pares comunes (Yahoo = '=X')
  'EURUSD=X': { symbol: 'EURUSD=X', name: 'EUR/USD', description: 'Par de divisas euro/dólar estadounidense (Forex).' },
  'USDJPY=X': { symbol: 'USDJPY=X', name: 'USD/JPY', description: 'Par de divisas dólar estadounidense/yen japonés (Forex).' },
  'GBPUSD=X': { symbol: 'GBPUSD=X', name: 'GBP/USD', description: 'Par de divisas libra esterlina/dólar estadounidense (Forex).' },
  'USDCAD=X': { symbol: 'USDCAD=X', name: 'USD/CAD', description: 'Par de divisas dólar estadounidense/dólar canadiense (Forex).' },
};

export function getAssetMeta(symbol: string): AssetMeta | null {
  const s = symbol.toUpperCase();
  if (META[s]) return META[s];
  const base = baseFromSymbol(s);
  if (META[base]) return META[base];
  return null;
}
