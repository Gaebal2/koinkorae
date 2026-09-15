const DISMISSED_KEY = "korae-install-dismissed";

export function watchInstallPrompt(win, onChange) {
  const modes = ["standalone", "minimal-ui", "fullscreen"].map(mode =>
    win.matchMedia(`(display-mode: ${mode})`),
  );
  const isApp = () => win.navigator.standalone === true || modes.some(mode => mode.matches);
  let dismissed = false;
  try { dismissed = win.localStorage.getItem(DISMISSED_KEY) === "1"; } catch {}
  const hide = () => {
    dismissed = true;
    try { win.localStorage.setItem(DISMISSED_KEY, "1"); } catch {}
    onChange(null);
  };
  const onModeChange = () => { if (isApp()) hide(); };
  const onPrompt = event => {
    event.preventDefault();
    if (!isApp() && !dismissed) onChange(event);
  };
  onModeChange();
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
