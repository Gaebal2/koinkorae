import test from "node:test";
import assert from "node:assert/strict";
import { watchInstallPrompt } from "./install-prompt.js";

function environment(display = "browser", storage = new Map()) {
  const win = new EventTarget();
  const modes = new Map();
  win.navigator = {};
  win.localStorage = { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) };
  win.matchMedia = query => {
    if (!modes.has(query)) modes.set(query, Object.assign(new EventTarget(), { matches: query === `(display-mode: ${display})` }));
    return modes.get(query);
  };
  const prompt = () => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    win.dispatchEvent(event);
    return event;
  };
  return { win, prompt };
}

test("no automatic popup without an installability event", () => {
  const { win, prompt } = environment();
  const changes = [];
  const controller = watchInstallPrompt(win, event => changes.push(event));
  assert.equal(changes.length, 0);
  const event = prompt();
  assert.equal(event.defaultPrevented, true);
  assert.equal(changes[0], event);
  controller.dispose();
  prompt();
  assert.equal(changes.length, 1);
});

for (const mode of ["standalone", "minimal-ui", "fullscreen", "ios"]) {
  test(`no install popup in ${mode}`, () => {
    const { win, prompt } = environment(mode);
    if (mode === "ios") win.navigator.standalone = true;
    let current;
    const controller = watchInstallPrompt(win, event => { current = event; });
    prompt();
    assert.equal(current, null);
    controller.dispose();
  });
}

test("dismissal survives page reload", () => {
  const storage = new Map();
  const first = environment("browser", storage);
  const controller = watchInstallPrompt(first.win, () => {});
  controller.dismiss();
  controller.dispose();
  const next = environment("browser", storage);
  let shown = false;
  watchInstallPrompt(next.win, event => { shown = !!event; });
  next.prompt();
  assert.equal(shown, false);
});

test("installation and switching to standalone hide the current popup", () => {
  for (const reason of ["installed", "display"]) {
    const { win, prompt } = environment();
    let current;
    watchInstallPrompt(win, event => { current = event; });
    prompt();
    assert.ok(current);
    if (reason === "installed") win.dispatchEvent(new Event("appinstalled"));
    else {
      const mode = win.matchMedia("(display-mode: standalone)");
      mode.matches = true;
      mode.dispatchEvent(new Event("change"));
    }
    assert.equal(current, null);
    prompt();
    assert.equal(current, null);
  }
});

test("blocked storage does not break the app or dismissal", () => {
  const { win, prompt } = environment();
  win.localStorage = { getItem() { throw Error(); }, setItem() { throw Error(); } };
  let current;
  const controller = watchInstallPrompt(win, event => { current = event; });
  prompt();
  assert.ok(current);
  controller.dismiss();
  prompt();
  assert.equal(current, null);
});
