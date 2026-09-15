export function prioritizeCoins(coins) {
  const featured = [
    { id: 'PI', symbol: 'PI', name: '파이코인', aliases: 'Pi Network' },
    { id: 'SL', symbol: 'SL', name: '사슬코인', aliases: 'SASEUL' },
    { id: 'PSL', symbol: 'PSL', name: 'PSL 토큰', aliases: 'PSL token' },
  ];
  const seen = new Set(featured.map(coin => coin.symbol));
  return [...featured, ...coins.filter(coin => {
    const symbol = coin.symbol.toUpperCase();
    if (seen.has(symbol)) return false;
    seen.add(symbol); return true;
  })];
}
