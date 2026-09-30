export const MAX_TRADE_COINS = 20;
export function toggleTradeCoin(selected, symbol) {
  if (selected.includes(symbol)) return selected.filter(coin => coin !== symbol);
  return selected.length < MAX_TRADE_COINS ? [...selected, symbol] : selected;
}
