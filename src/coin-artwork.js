import { t } from './language.js';
import artwork from './coin-artwork.json';

export const coinImage = symbol => import.meta.env.BASE_URL + `coin-icons/${symbol === 'PI' ? 'pi-official.png' : symbol.toLowerCase() + (symbol === 'SL' ? '.png' : '.svg')}`;
export const coinClassName = (symbol, size = 'md') => `coin coin-${size}${symbol === 'SL' ? ' coin-sl' : ''}${artwork[symbol]?.outline ? ' coin-outline' : ''}${artwork[symbol]?.inset ? ' coin-inset' : ''}`;

// Leaflet uses DOM nodes; keep its artwork and sizing identical to the React Coin.
export function coinMarker(symbol) {
  const marker = document.createElement('span');
  marker.className = 'map-pin-shell';
  const coin = document.createElement('div');
  coin.className = coinClassName(symbol, 'map');
  const label = document.createElement('span');
  label.className = 'coin-fallback'; label.textContent = symbol.slice(0, 4);
  const image = document.createElement('img');
  image.src = coinImage(symbol); image.alt = t('{0} 아이콘', symbol);
  image.onerror = () => { image.style.display = 'none'; coin.classList.add('coin-outline'); };
  coin.append(label, image); marker.append(coin);
  return marker;
}
