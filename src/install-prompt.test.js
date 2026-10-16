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

const iphoneSafari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
test('first iPhone Safari visit shows manual guide without a browser install event',()=>{
 const {win}=environment();win.navigator.userAgent=iphoneSafari;
 let current;const controller=watchInstallPrompt(win,value=>current=value);
 assert.deepEqual(current,{kind:'ios',safari:true});controller.dispose();
});
test('in-app browsers and iOS Chrome are directed to Safari',()=>{
 for(const userAgent of [iphoneSafari+' KAKAOTALK',iphoneSafari.replace('Version/18.0','CriOS/130.0'),iphoneSafari.replace('Version/18.0','FxiOS/130.0')]){
  const {win}=environment();win.navigator.userAgent=userAgent;
  let current;const controller=watchInstallPrompt(win,value=>current=value);
  assert.deepEqual(current,{kind:'ios',safari:false});controller.dispose();
 }
});
test('installed iPhone apps never show the manual guide',()=>{
 for(const mode of ['standalone','ios']){
  const {win}=environment(mode);win.navigator.userAgent=iphoneSafari;if(mode==='ios')win.navigator.standalone=true;
  let current;const controller=watchInstallPrompt(win,value=>current=value);
  assert.equal(current,null);controller.dispose();
 }
});
test('dismissing the iPhone guide persists across visits and remounts',()=>{
 const storage=new Map();
 for(let visit=0;visit<2;visit++){
  const {win}=environment('browser',storage);win.navigator.userAgent=iphoneSafari;
  let current;const controller=watchInstallPrompt(win,value=>current=value);
  if(!visit){assert.equal(current.kind,'ios');controller.dismiss();}
  else assert.equal(current,undefined);
  controller.dispose();
 }
});
test('blocked storage retains dismissal for the same page when the component remounts',()=>{
 const {win}=environment();win.navigator.userAgent=iphoneSafari;
 win.localStorage={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
 const first=watchInstallPrompt(win,()=>{});first.dismiss();first.dispose();
 let shown=false;const next=watchInstallPrompt(win,value=>{if(value)shown=true;});
 assert.equal(shown,false);next.dispose();
});
test('desktop Safari is not mistaken for iPhone; desktop-mode iPad is supported',()=>{
 for(const [touch,expected] of [[0,false],[5,true]]){
  const {win}=environment();win.navigator={userAgent:'Mozilla/5.0 (Macintosh) Version/18.0 Safari/605.1.15',platform:'MacIntel',maxTouchPoints:touch};
  let current;const controller=watchInstallPrompt(win,value=>current=value);
  assert.equal(current?.kind==='ios',expected);controller.dispose();
 }
});
