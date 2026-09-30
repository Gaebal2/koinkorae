import { t } from './language.js';
import React, { useRef, useState } from 'react';
import { data } from './data.js';
import { usePhotoEditor } from './use-photo-editor.jsx';
import { Field, Modal, profileImage } from './ui.jsx';
import { publishProfile } from './live-profile.js';

export function ProfileEditor({ profile, onClose, onSaved }) {
  const [draft, setDraft] = useState({ username: profile.username || '', bio: profile.bio || '', profileImage: profile.profileImage || '' });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const file = useRef(null);
  const {choose:choosePhoto,editor}=usePhotoEditor(photo=>setDraft(value=>({...value,profileImage:photo})),{profile:true,onError:setError});
  const save = async e => {
    e.preventDefault(); if (busy || !draft.username.trim()) return;
    setBusy(true); setError('');
    try { await data.saveProfile(draft); const saved = await data.profile(profile.id); publishProfile(saved); onSaved(saved); }
    catch (error) { setError(error.message); }
    finally { setBusy(false); }
  };
  return <><Modal title={t("프로필 수정")} onClose={() => { if (!busy) onClose(); }}>
    <form onSubmit={save}>
      <div className="profile-editor-photo"><img className="profile-avatar" src={draft.profileImage || profileImage()} alt={t("프로필 사진 미리보기")}/><button type="button" className="profile-photo-change" disabled={busy} onClick={() => file.current?.click()}>{t("변경")}</button></div>
      <input ref={file} type="file" accept="image/*" hidden onChange={choosePhoto}/>
      <Field label={t("이름")}><input required maxLength={24} disabled={busy} value={draft.username} onChange={e => setDraft({...draft, username:e.target.value})}/><span className="counter">{draft.username.length}/24</span></Field>
      <Field label={t("소개")}><textarea maxLength={200} disabled={busy} value={draft.bio} onChange={e => setDraft({...draft, bio:e.target.value})}/><span className="counter">{draft.bio.length}/200</span></Field>
      {error && <p className="error" role="alert">{t(error)}</p>}
      <button className="primary" disabled={busy || !draft.username.trim()}>{busy ? t("저장 중…") : t("저장")}</button>
      <button className="secondary" type="button" disabled={busy} onClick={onClose}>{t("취소")}</button>
    </form>
  </Modal>{editor}</>;
}
