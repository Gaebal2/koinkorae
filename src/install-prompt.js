// In-memory fallback prevents repeat prompts when browser storage is blocked.
const dismissedWindows = new WeakSet();
export function iosInstallGuide(navigator) {
 const ua=navigator.userAgent || '';
 const ios=/iPhone|iPad|iPod/i.test(ua) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
 if(!ios)return null;
 const safari=/Version\/.*Safari\//i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|NAVER|KAKAOTALK|Instagram|FBAN|FBAV|Line\//i.test(ua);
 return {kind:'ios',safari};
}
const DISMISSED_KEY = "korae-install-dismissed";

export function watchInstallPrompt(win, onChange) {
  const modes = ["standalone", "minimal-ui", "fullscreen"].map(mode =>
    win.matchMedia(`(display-mode: ${mode})`),
  );
  const isApp = () => win.navigator.standalone === true || modes.some(mode => mode.matches);
  let dismissed = dismissedWindows.has(win);
  try { dismissed ||= win.localStorage.getItem(DISMISSED_KEY) === "1"; } catch {}
  const hide = () => {
    dismissed = true;
    dismissedWindows.add(win);
    try { win.localStorage.setItem(DISMISSED_KEY, "1"); } catch {}
    onChange(null);
  };
  const onModeChange = () => { if (isApp()) hide(); };
  const onPrompt = event => {
    event.preventDefault();
    if (!isApp() && !dismissed) onChange(event);
  };
  onModeChange();
  const guide=iosInstallGuide(win.navigator);
  if(guide && !isApp() && !dismissed)onChange(guide);
  win.addEventListener("beforeinstallprompt", onPrompt);
  win.addEventListener("appinstalled", hide);
  modes.forEach(mode => mode.addEventListener?.("change", onModeChange));
  return {
    dismiss: hide,
    dispose() {
      win.removeEventListener("beforeinstallprompt", onPrompt);
      win.removeEventListener("appinstalled", hide);
      modes.forEach(mode => mode.removeEventListener?.("change", onModeChange));
    },
  };
}
