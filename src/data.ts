import type { Auction, Holding, Stock } from './types'

const stockLogo = (domain: string) => `https://www.google.com/s2/favicons?sz=128&domain=${domain}`
const demoPrize = (id: string, title: string, image: string, itemValue: number): Auction => ({
  id,
  title,
  image,
  bidder: 'No bids yet',
  bid: 0,
  bidTarget: Math.ceil(itemValue / 125),
  itemValue,
})

export const stocks: Stock[] = [
  { symbol: 'AAPL', name: 'Apple', price: 214.75, change: 2.12, icon: stockLogo('apple.com') },
  { symbol: 'TSLA', name: 'Tesla', price: 251.84, change: -1.66, icon: stockLogo('tesla.com') },
  { symbol: 'NVDA', name: 'NVIDIA', price: 132.49, change: 3.92, icon: stockLogo('nvidia.com') },
  { symbol: 'MSFT', name: 'Microsoft', price: 443.12, change: 1.58, icon: stockLogo('microsoft.com') },
  { symbol: 'GOOGL', name: 'Alphabet (Google)', price: 174.65, change: 0.97, icon: stockLogo('google.com') },
  { symbol: 'AMZN', name: 'Amazon', price: 184.29, change: 2.31, icon: stockLogo('amazon.com') },
  { symbol: 'META', name: 'Meta Platforms', price: 512.83, change: -0.64, icon: stockLogo('meta.com') },
  { symbol: 'AVGO', name: 'Broadcom', price: 170.54, change: 1.74, icon: stockLogo('broadcom.com') },
  { symbol: 'AMD', name: 'AMD', price: 164.91, change: 2.47, icon: stockLogo('amd.com') },
  { symbol: 'INTC', name: 'Intel', price: 48.29, change: -0.81, icon: stockLogo('intel.com') },
  { symbol: 'QCOM', name: 'Qualcomm', price: 160.1, change: 1.22, icon: stockLogo('qualcomm.com') },
  { symbol: 'MU', name: 'Micron Technology', price: 116.43, change: -0.35, icon: stockLogo('micron.com') },
  { symbol: 'PLTR', name: 'Palantir Technologies', price: 26.46, change: 1.35, icon: stockLogo('palantir.com') },
  { symbol: 'ORCL', name: 'Oracle', price: 170.72, change: 0.88, icon: stockLogo('oracle.com') },
  { symbol: 'CRM', name: 'Salesforce', price: 275.63, change: -0.52, icon: stockLogo('salesforce.com') },
  { symbol: 'ADBE', name: 'Adobe', price: 521.48, change: 1.86, icon: stockLogo('adobe.com') },
  { symbol: 'IBM', name: 'IBM', price: 166.35, change: 0.63, icon: stockLogo('ibm.com') },
  { symbol: 'CSCO', name: 'Cisco Systems', price: 62.91, change: 0.71, icon: stockLogo('cisco.com') },
  { symbol: 'NFLX', name: 'Netflix', price: 681.9, change: -1.18, icon: stockLogo('netflix.com') },
  { symbol: 'ARM', name: 'Arm Holdings', price: 146.08, change: 2.94, icon: stockLogo('arm.com') },
  { symbol: 'SMCI', name: 'Super Micro Computer', price: 1287.22, change: 5.13, icon: stockLogo('supermicro.com') },
  { symbol: 'DELL', name: 'Dell Technologies', price: 132.7, change: 0.54, icon: stockLogo('dell.com') },
  { symbol: 'NOW', name: 'ServiceNow', price: 980.1, change: 1.81, icon: stockLogo('servicenow.com') },
  { symbol: 'SHOP', name: 'Shopify', price: 64.42, change: 1.04, icon: stockLogo('shopify.com') },
  { symbol: 'SNOW', name: 'Snowflake', price: 170.58, change: -2.29, icon: stockLogo('snowflake.com') },
  { symbol: 'JPM', name: 'JPMorgan Chase', price: 214.85, change: 0.87, icon: stockLogo('jpmorgan.com') },
  { symbol: 'BAC', name: 'Bank of America', price: 44.75, change: 0.74, icon: stockLogo('bankofamerica.com') },
  { symbol: 'GS', name: 'Goldman Sachs', price: 528.91, change: -0.43, icon: stockLogo('goldmansachs.com') },
  { symbol: 'V', name: 'Visa', price: 281.72, change: 0.95, icon: stockLogo('visa.com') },
  { symbol: 'MA', name: 'Mastercard', price: 487.2, change: 0.68, icon: stockLogo('mastercard.com') },
  { symbol: 'BRK.B', name: 'Berkshire Hathaway', price: 448.19, change: 1.21, icon: stockLogo('berkshirehathaway.com') },
  { symbol: 'WMT', name: 'Walmart', price: 69.44, change: 0.59, icon: stockLogo('walmart.com') },
  { symbol: 'COST', name: 'Costco', price: 853.63, change: 1.06, icon: stockLogo('costco.com') },
  { symbol: 'KO', name: 'Coca-Cola', price: 61.88, change: 0.78, icon: stockLogo('coca-cola.com') },
  { symbol: 'PEP', name: 'PepsiCo', price: 170.49, change: -0.18, icon: stockLogo('pepsico.com') },
  { symbol: 'MCD', name: 'McDonald\'s', price: 297.71, change: 0.42, icon: stockLogo('mcdonalds.com') },
  { symbol: 'NKE', name: 'Nike', price: 98.12, change: -1.03, icon: stockLogo('nike.com') },
  { symbol: 'TM', name: 'Toyota Motor', price: 182.4, change: 0.73, icon: stockLogo('toyota.com') },
  { symbol: 'GM', name: 'General Motors', price: 47.81, change: -0.66, icon: stockLogo('gm.com') },
  { symbol: 'F', name: 'Ford Motor', price: 10.18, change: 0.43, icon: stockLogo('ford.com') },
  { symbol: 'UBER', name: 'Uber Technologies', price: 73.62, change: 1.34, icon: stockLogo('uber.com') },
  { symbol: 'ABNB', name: 'Airbnb', price: 156.63, change: 2.22, icon: stockLogo('airbnb.com') },
  { symbol: 'LLY', name: 'Eli Lilly', price: 799.43, change: 2.63, icon: stockLogo('lilly.com') },
  { symbol: 'JNJ', name: 'Johnson & Johnson', price: 156.9, change: 0.55, icon: stockLogo('jnj.com') },
  { symbol: 'PFE', name: 'Pfizer', price: 29.45, change: -0.94, icon: stockLogo('pfizer.com') },
  { symbol: 'XOM', name: 'Exxon Mobil', price: 118.7, change: 0.81, icon: stockLogo('corporate.exxonmobil.com') },
  { symbol: 'CVX', name: 'Chevron', price: 160.32, change: 0.98, icon: stockLogo('chevron.com') },
  { symbol: 'DIS', name: 'Walt Disney', price: 111.12, change: 1.06, icon: stockLogo('disney.com') },
  { symbol: 'BA', name: 'Boeing', price: 178.49, change: -2.18, icon: stockLogo('boeing.com') },
  { symbol: 'PG', name: 'Procter & Gamble', price: 170.1, change: 0.73, icon: stockLogo('pg.com') },
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust', price: 598.65, change: 1.12, icon: stockLogo('spdrs.com') },
  { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', price: 442.35, change: 1.14, icon: stockLogo('vanguard.com') },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust', price: 478.14, change: 1.97, icon: stockLogo('invesco.com') },
  { symbol: 'VTI', name: 'Vanguard Total Stock Market ETF', price: 251.54, change: 1.18, icon: stockLogo('vanguard.com') },
  { symbol: 'VT', name: 'Vanguard Total World Stock ETF', price: 97.62, change: 0.86, icon: stockLogo('vanguard.com') },
  { symbol: 'IWDA', name: 'iShares Core MSCI World ETF', price: 95.1, change: 0.91, icon: stockLogo('ishares.com') },
  { symbol: 'VUG', name: 'Vanguard Growth ETF', price: 300.43, change: 1.63, icon: stockLogo('vanguard.com') },
  { symbol: 'VTV', name: 'Vanguard Value ETF', price: 170.62, change: 0.64, icon: stockLogo('vanguard.com') },
  { symbol: 'VYM', name: 'Vanguard High Dividend Yield ETF', price: 118.43, change: 0.67, icon: stockLogo('vanguard.com') },
  { symbol: 'SCHD', name: 'Schwab US Dividend Equity ETF', price: 75.81, change: 0.72, icon: stockLogo('schwab.com') },
  { symbol: 'IWM', name: 'iShares Russell 2000 ETF', price: 205.98, change: 1.43, icon: stockLogo('ishares.com') },
  { symbol: 'DIA', name: 'SPDR Dow Jones Industrial Average ETF', price: 382.17, change: 0.94, icon: stockLogo('spdrs.com') },
  { symbol: 'SMH', name: 'VanEck Semiconductor ETF', price: 234.91, change: 2.38, icon: stockLogo('vaneck.com') },
  { symbol: 'SOXX', name: 'iShares Semiconductor ETF', price: 454.51, change: 2.11, icon: stockLogo('ishares.com') },
  { symbol: 'RSP', name: 'Invesco S&P 500 Equal Weight ETF', price: 165.22, change: 0.93, icon: stockLogo('invesco.com') },
  { symbol: 'ARKK', name: 'ARK Innovation ETF', price: 45.78, change: -0.71, icon: stockLogo('ark-funds.com') },
  { symbol: 'IWF', name: 'iShares Russell 1000 Growth ETF', price: 120.41, change: 1.55, icon: stockLogo('ishares.com') },
  { symbol: 'IVV', name: 'iShares Core S&P 500 ETF', price: 548.36, change: 1.16, icon: stockLogo('ishares.com') },
  { symbol: 'VGT', name: 'Vanguard Information Technology ETF', price: 456.12, change: 1.64, icon: stockLogo('vanguard.com') },
  { symbol: 'XLF', name: 'Financial Select Sector SPDR Fund', price: 42.08, change: 0.36, icon: stockLogo('spdrs.com') },
  { symbol: 'XLE', name: 'Energy Select Sector SPDR Fund', price: 89.66, change: 0.52, icon: stockLogo('spdrs.com') },
  { symbol: 'XLV', name: 'Health Care Select Sector SPDR Fund', price: 139.82, change: 0.48, icon: stockLogo('spdrs.com') },
  { symbol: 'GLD', name: 'SPDR Gold Shares', price: 218.35, change: 0.51, icon: stockLogo('spdrs.com') },
  { symbol: 'SLV', name: 'iShares Silver Trust', price: 27.84, change: 0.84, icon: stockLogo('ishares.com') },
  { symbol: 'TLT', name: 'iShares 20+ Year Treasury Bond ETF', price: 93.65, change: -0.27, icon: stockLogo('ishares.com') },
  { symbol: 'SCOM', name: 'Safaricom PLC', price: 25.75, change: 1.02, icon: stockLogo('safaricom.co.ke') },
  { symbol: 'COOP', name: 'Co\'operative Bank of Kenya', price: 15.45, change: 0.79, icon: stockLogo('coopbank.co.ke') },
  { symbol: 'KCB', name: 'KCB Group', price: 31.21, change: 1.16, icon: stockLogo('kcbgroup.com') },
  { symbol: 'EQTY', name: 'Equity Group Holdings', price: 10.3, change: 0.42, icon: stockLogo('equitygroupholdings.com') },
  { symbol: 'ABSA', name: 'Absa Bank Kenya', price: 12.68, change: 0.84, icon: stockLogo('absa.africa') },
  { symbol: 'NCBA', name: 'NCBA Group', price: 20.17, change: 0.58, icon: stockLogo('ncba.co.ke') },
  { symbol: 'IMH', name: 'I&M Group', price: 6.28, change: 0.31, icon: stockLogo('im-bank.com') },
  { symbol: 'SBIC', name: 'Stanbic Holdings', price: 23.66, change: 0.73, icon: stockLogo('stanbicbank.co.ke') },
  { symbol: 'SCBK', name: 'Standard Chartered Bank Kenya', price: 18.77, change: 0.96, icon: stockLogo('sc.com') },
  { symbol: 'DTK', name: 'Diamond Trust Bank Kenya', price: 8.42, change: -0.14, icon: stockLogo('dtbafrica.com') },
  { symbol: 'HFCK', name: 'HF Group', price: 3.26, change: 0.21, icon: stockLogo('hfgroup.co.ke') },
  { symbol: 'EABL', name: 'East African Breweries', price: 16.94, change: 1.03, icon: stockLogo('eabl.com') },
  { symbol: 'KPLC', name: 'Kenya Power', price: 4.98, change: 0.15, icon: stockLogo('kplc.co.ke') },
  { symbol: 'KEGN', name: 'KenGen', price: 4.61, change: 0.24, icon: stockLogo('kengen.co.ke') },
  { symbol: 'KQ', name: 'Kenya Airways', price: 2.33, change: -0.12, icon: stockLogo('kenya-airways.com') },
  { symbol: 'NMG', name: 'Nation Media Group', price: 1.74, change: 0.05, icon: stockLogo('nationmedia.com') },
  { symbol: 'BAMB', name: 'Bamburi Cement', price: 9.88, change: 0.39, icon: stockLogo('bamburicement.com') },
  { symbol: 'CGEN', name: 'Car & General', price: 6.92, change: 0.41, icon: stockLogo('cargen.com') },
  { symbol: 'JUB', name: 'Jubilee Holdings', price: 7.15, change: 0.29, icon: stockLogo('jubileekenya.com') },
  { symbol: 'BRIT', name: 'Britam Holdings', price: 3.18, change: 0.18, icon: stockLogo('britam.com') },
  { symbol: 'KNRE', name: 'Kenya Reinsurance Corporation', price: 3.42, change: 0.11, icon: stockLogo('kenyare.co.ke') },
  { symbol: 'SLAM', name: 'Sanlam Kenya', price: 4.31, change: 0.24, icon: stockLogo('sanlam.africa') },
  { symbol: 'SASN', name: 'Sasini', price: 2.64, change: 0.17, icon: stockLogo('sasini.co.ke') },
  { symbol: 'KUKZ', name: 'Kakuzi', price: 8.12, change: 0.34, icon: stockLogo('kakuzi.co.ke') },
  { symbol: 'WTK', name: 'Williamson Tea Kenya', price: 3.11, change: 0.19, icon: stockLogo('williamsontea.com') },
]

export const holdings: Holding[] = [
  { symbol: 'AAPL', company: 'Apple Inc.', percent: 12.6, shares: 12, value: 2094.24, gain: 234.56 },
  { symbol: 'TSLA', company: 'Tesla Inc.', percent: -4.3, shares: 8, value: 1961.44, gain: -89.22 },
  { symbol: 'MSFT', company: 'Microsoft Corp.', percent: 14.8, shares: 15, value: 6388.35, gain: 824.15 },
  { symbol: 'GOOGL', company: 'Alphabet Inc.', percent: 15.3, shares: 25, value: 3428.75, gain: 456.22 },
]

export const auctions: Auction[] = [
  {
    id: 'watch',
    title: 'Luxurious Mens Watch Collection',
    image: 'https://images.unsplash.com/photo-1523170335258-f5ed11844a49?w=1200&q=85',
    bidder: 'M. Johnson',
    bid: 25,
    bidTarget: 50,
  },
  {
    id: 'headphones',
    title: 'Premium Headphones Set',
    image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1200&q=85',
    bidder: 'S. Chen',
    bid: 15,
    bidTarget: 40,
  },
  {
    id: 'sunglasses',
    title: 'Designer Sunglasses',
    image: 'https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=1200&q=85',
    bidder: 'A. Kim',
    bid: 10,
    bidTarget: 30,
  },
  {
    id: 'wallet',
    title: 'Luxury Leather Wallet',
    image: 'https://images.unsplash.com/photo-1627123424574-724758594e93?w=1200&q=85',
    bidder: 'E. Davis',
    bid: 8,
    bidTarget: 25,
  },
  demoPrize('macbook', 'Win a MacBook', 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=1200&q=85', 180000),
  demoPrize('iphone-18', 'Win an iPhone 18', 'https://images.unsplash.com/photo-1592899677977-9c10ca588bbd?w=1200&q=85', 160000),
  demoPrize('samsung-s26', 'Win a Samsung S26', 'https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?w=1200&q=85', 145000),
  demoPrize('hp-elitebook', 'Win an HP EliteBook', 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=1200&q=85', 125000),
  demoPrize('tecno-camon', 'Win a Tecno Camon', 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=1200&q=85', 35000),
  demoPrize('infinix', 'Win an Infinix phone', 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=1200&q=85', 40000),
  demoPrize('ps5', 'Win a PlayStation 5', 'https://images.unsplash.com/photo-1606813907291-d86efa9b94db?w=1200&q=85', 85000),
  demoPrize('75-inch-tv', 'Win a 75-inch TV', 'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=1200&q=85', 180000),
  demoPrize('kitchen-set', 'Win a Kitchen Set', 'https://images.unsplash.com/photo-1556911220-bff31c812dba?w=1200&q=85', 45000),
  demoPrize('fridge', 'Win a Fridge', 'https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?w=1200&q=85', 90000),
  demoPrize('ring-light', 'Win a Ring Light', 'https://images.unsplash.com/photo-1520390138845-fd2d229dd553?w=1200&q=85', 8000),
  demoPrize('handbag', 'Win a Handbag', 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=1200&q=85', 15000),
]

export function getNextAuctionBid(auction: Auction, entries: { amount: number }[], round = 0): number {
  if (auction.itemValue === undefined) {
    return (entries.slice(-1)[0]?.amount ?? auction.bid) + 1
  }

  const entryIndex = entries.length
  if (entryIndex >= auction.bidTarget) return 0

  const collected = entries.reduce((total, entry) => total + entry.amount, 0)
  const remainingValue = auction.itemValue - collected
  const entriesAfterThis = auction.bidTarget - entryIndex - 1
  const minimum = Math.max(50, remainingValue - 199 * entriesAfterThis)
  const maximum = Math.min(199, remainingValue - 50 * entriesAfterThis)
  let seed = 0
  for (const character of `${auction.id}-${round}-${entryIndex}`) {
    seed = (seed * 31 + character.charCodeAt(0)) >>> 0
  }
  const random = Math.abs(Math.sin(seed) * 10000) % 1

  return Math.round(minimum + random * (maximum - minimum))
}

export const currency = (amount: number) => `KSh ${Math.abs(amount).toLocaleString('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`
