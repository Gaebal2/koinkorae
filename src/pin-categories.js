export const pinCategories = ['P2P 판매', 'P2P 구매 희망', '상점 등록'];
export const normalizePinCategory = value => ({'판매':'P2P 판매','구매 희망':'P2P 구매 희망','서비스':'상점 등록','사업장':'상점 등록'})[value] || value;
