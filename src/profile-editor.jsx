import React, { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { data } from './data.js';
import { readPhoto } from './api.js';
import { Field, Modal, profileImage } from './ui.jsx';

export function ProfileEditor({ profile, onClose, onSaved }) {
  const [draft, setDraft] = useState({ username: profile.username || '', bio: profile.bio || '', profileImage: profile.profileImage || '' });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const file = useRef(null);
  const choosePhoto = async e => {
    const selected = e.target.files?.[0]; if (!selected) return;
    setBusy(true); setError('');
    try { const photo = await readPhoto(selected); setDraft(value => ({...value, profileImage:photo})); }
    catch (error) { setError(error.message); }
    finally { setBusy(false); e.target.value = ''; }
  };
  const save = async e => {
    e.preventDefault(); if (busy || !draft.username.trim()) return;
    setBusy(true); setError('');
    try { await data.saveProfile(draft); const saved = await data.profile(profile.id); onSaved(saved); }
    catch (error) { setError(error.message); }
    finally { setBusy(false); }
  };
  return <Modal title="프로필 수정" onClose={() => { if (!busy) onClose(); }}>
    <form onSubmit={save}>
      <div className="profile-editor-photo"><img className="profile-avatar" src={draft.profileImage || profileImage()} alt="프로필 사진 미리보기"/>{draft.profileImage && <button type="button" className="attachment-remove" aria-label="프로필 사진 제거" disabled={busy} onClick={() => setDraft({...draft, profileImage:''})}><X/></button>}</div>
      <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={choosePhoto}/>
      <button className="secondary" type="button" disabled={busy} onClick={() => file.current?.click()}>프로필 사진 변경</button>
      <Field label="이름"><input required maxLength={24} disabled={busy} value={draft.username} onChange={e => setDraft({...draft, username:e.target.value})}/><span className="counter">{draft.username.length}/24</span></Field>
      <Field label="소개"><textarea maxLength={200} disabled={busy} value={draft.bio} onChange={e => setDraft({...draft, bio:e.target.value})}/><span className="counter">{draft.bio.length}/200</span></Field>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="primary" disabled={busy || !draft.username.trim()}>{busy ? '저장 중…' : '저장'}</button>
      <button className="secondary" type="button" disabled={busy} onClick={onClose}>취소</button>
    </form>
  </Modal>;
}
