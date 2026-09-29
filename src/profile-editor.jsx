import React, { useEffect, useRef, useState } from 'react';
import { data } from './data.js';
import { PhotoCropper } from './photo-cropper.jsx';
import { Field, Modal, profileImage } from './ui.jsx';
import { publishProfile } from './live-profile.js';

export function ProfileEditor({ profile, onClose, onSaved }) {
  const [draft, setDraft] = useState({ username: profile.username || '', bio: profile.bio || '', profileImage: profile.profileImage || '' });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const file = useRef(null);
  const [crop, setCrop] = useState(null);
  useEffect(() => () => { if (crop) URL.revokeObjectURL(crop); }, [crop]);
  const choosePhoto = async e => {
    const selected = e.target.files?.[0]; if (!selected) return;
    setBusy(true); setError('');
    try {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(selected.type) || selected.size > 20 * 1024 * 1024) throw Error('20MB 이하 PNG, JPEG, WebP 사진을 선택해 주세요.');
      setCrop(URL.createObjectURL(selected));
    }
    catch (error) { setError(error.message); }
    finally { setBusy(false); e.target.value = ''; }
  };
  const save = async e => {
    e.preventDefault(); if (busy || !draft.username.trim()) return;
    setBusy(true); setError('');
    try { await data.saveProfile(draft); const saved = await data.profile(profile.id); publishProfile(saved); onSaved(saved); }
    catch (error) { setError(error.message); }
    finally { setBusy(false); }
  };
  return <><Modal title="프로필 수정" onClose={() => { if (!busy) onClose(); }}>
    <form onSubmit={save}>
      <div className="profile-editor-photo"><img className="profile-avatar" src={draft.profileImage || profileImage()} alt="프로필 사진 미리보기"/><button type="button" className="profile-photo-change" disabled={busy} onClick={() => file.current?.click()}>변경</button></div>
      <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={choosePhoto}/>
      <Field label="이름"><input required maxLength={24} disabled={busy} value={draft.username} onChange={e => setDraft({...draft, username:e.target.value})}/><span className="counter">{draft.username.length}/24</span></Field>
      <Field label="소개"><textarea maxLength={200} disabled={busy} value={draft.bio} onChange={e => setDraft({...draft, bio:e.target.value})}/><span className="counter">{draft.bio.length}/200</span></Field>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="primary" disabled={busy || !draft.username.trim()}>{busy ? '저장 중…' : '저장'}</button>
      <button className="secondary" type="button" disabled={busy} onClick={onClose}>취소</button>
    </form>
  </Modal>{crop && <PhotoCropper source={crop} onClose={() => setCrop(null)} onApply={photo => { setDraft(value => ({...value, profileImage:photo})); setCrop(null); }}/>}</>;
}
