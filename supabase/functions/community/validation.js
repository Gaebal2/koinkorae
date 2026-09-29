export function text(value, max, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw Error(`텍스트는 ${max}자 이내로 입력해 주세요.`);
  return value.trim();
}
export function id(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw Error('잘못된 항목입니다.');
  return value;
}
export function photo(value = '') {
  if (typeof value !== 'string' || value.length > 300000 || (value && !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value))) throw Error('이미지를 확인해 주세요.');
  return value;
}
export function coin(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9]{1,20}$/.test(value)) throw Error('코인을 선택해 주세요.');
  return value;
}
export function side(value) {
  if (!['support', 'oppose'].includes(value)) throw Error('지지 또는 반대를 선택해 주세요.');
  return value;
}
export function enabled(value) {
  if (typeof value !== 'boolean') throw Error('잘못된 요청입니다.');
  return value;
}
export function pin(value) {
  const lat = Number(value.lat), lng = Number(value.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) throw Error('지도 위치를 확인해 주세요.');
  if (!['P2P 판매','P2P 구매 희망','상점 등록'].includes(value.category)) throw Error('거래 분류를 선택해 주세요.');
  if (!Array.isArray(value.tradeCoins) || value.tradeCoins.length > 110) throw Error('거래 코인을 확인해 주세요.');
  const link = text(value.link || '', 500);
  if (link && !/^https?:\/\//.test(link)) throw Error('HTTP 또는 HTTPS 링크를 입력해 주세요.');
  return { title: text(value.title,50,true), description: text(value.description,200,true), coin: coin(value.coin),
    tradeCoins: value.tradeCoins.map(coin), image: photo(value.image), link, category: value.category, lat, lng };
}
