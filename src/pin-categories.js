export const pinCategories = ['P2P 판매', 'P2P 구매', '상점'];
export const normalizePinCategory = value => ({'판매':'P2P 판매','구매 희망':'P2P 구매','P2P 구매 희망':'P2P 구매','서비스':'상점','사업장':'상점','상점 등록':'상점'})[value] || value;
