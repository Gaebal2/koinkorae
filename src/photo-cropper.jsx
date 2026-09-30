import { t } from './language.js';
import React, { useState } from 'react';
import { Modal, Field } from './ui.jsx';

export function PhotoCropper({ source, onClose, onApply }) {
  const [image, setImage] = useState(null), [zoom, setZoom] = useState(1);
  const [x, setX] = useState(50), [y, setY] = useState(50), [error, setError] = useState('');
  const ratio = image ? image.naturalWidth / image.naturalHeight : 1;
  const width = Math.max(1, ratio) * zoom, height = Math.max(1, 1 / ratio) * zoom;
  const apply = () => {
    try {
      const side = Math.min(image.naturalWidth, image.naturalHeight) / zoom;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 512;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 512, 512);
      ctx.drawImage(image, (image.naturalWidth - side) * x / 100, (image.naturalHeight - side) * y / 100, side, side, 0, 0, 512, 512);
      for (const quality of [0.85, 0.7, 0.5, 0.35]) {
        const result = canvas.toDataURL('image/jpeg', quality);
        if (result.length <= 300000) { onApply(result); return; }
      }
      setError('사진 용량이 큽니다. 다른 사진을 선택해 주세요.');
    } catch { setError('사진을 처리하지 못했습니다. 다른 사진을 선택해 주세요.'); }
  };
  return <Modal title={t("프로필 사진 자르기")} onClose={onClose}>
    <p>{t("확대와 위치를 조절해 원 안에 표시할 부분을 맞춰 주세요.")}</p>
    <div className="profile-crop-preview"><img src={source} alt={t("프로필 사진 자르기 미리보기")} onLoad={e => setImage(e.currentTarget)} onError={() => setError('사진을 열지 못했습니다. PNG, JPEG 또는 WebP 사진을 선택해 주세요.')} style={{ width: `${width * 100}%`, height: `${height * 100}%`, left: `${(1 - width) * x}%`, top: `${(1 - height) * y}%` }}/></div>
    <Field label={t("확대 · {0}배", zoom.toFixed(1))}><input type="range" min="1" max="4" step="0.01" value={zoom} onChange={e => setZoom(+e.target.value)}/></Field>
    <Field label={t("가로 위치")}><input type="range" min="0" max="100" value={x} onChange={e => setX(+e.target.value)}/></Field>
    <Field label={t("세로 위치")}><input type="range" min="0" max="100" value={y} onChange={e => setY(+e.target.value)}/></Field>
    {error && <p className="error" role="alert">{t(error)}</p>}
    <button type="button" className="primary" disabled={!image || !!error} onClick={apply}>{t("사진 적용")}</button>
    <button type="button" className="secondary" onClick={onClose}>{t("취소")}</button>
  </Modal>;
}
