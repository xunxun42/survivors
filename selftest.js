// DOM 桩 + 逻辑自测：攻击/击杀/升级/刷怪压力
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const file = path.join(__dirname, 'index.html');
const html = fs.readFileSync(file, 'utf8');
const i = html.lastIndexOf('<script>') + 8;
const j = html.lastIndexOf('</script>');
let js = html.slice(i, j);

js = js.replace('const DEMO = /demo/.test(location.search + location.hash);', 'const DEMO = true;');
js = js.replace('if (!DEMO && xp >= need) levelUp();', 'if (xp >= need) levelUp();');
js = js.replace('if (DEMO) demo();', `if (DEMO) {
  demo();
  globalThis.__probe = () => ({ time: +time.toFixed(1), kills, xp, level, need, enemies: enemies.length, bolts: bolts.length, hp: +P.hp.toFixed(1), parts: parts.length, cd: +P.cd.toFixed(2) });
  globalThis.__step = (n) => { for (let k = 0; k < n; k++) update(STEP); };
  globalThis.__hold = (on) => { if (on) keys.add('Space'); else keys.delete('Space'); };
  globalThis.__state = () => state;
  globalThis.__forceXp = () => { xp = need; };
  globalThis.__choose = (n) => choose(n);
  globalThis.__st = () => ({ dmg: +ST.dmg.toFixed(2), rate: +ST.rate.toFixed(2), pierce: ST.pierce, size: +ST.size.toFixed(2), spd: +P.speed.toFixed(0), maxHp: P.maxHp });
  globalThis.__timed = (n) => { const t0 = process.hrtime.bigint(); for (let k = 0; k < n; k++) update(STEP); return Number(process.hrtime.bigint() - t0) / 1e6; };
  globalThis.__freshStart = () => { reset(); state = 'playing'; time = 0; P.inv = .8; for (const k of [...keys]) keys.delete(k); };
  globalThis.__applyAll = (id) => { const u = POOL.find(x => x.id === id); if (u) { u.ap(); upCount[id] = (upCount[id] || 0) + 1; } };
}`);

if (!/__probe/.test(js)) { console.error('patch failed'); process.exit(1); }

const anyFn = function () { return stub; };
const stub = new Proxy({}, { get: (t, p) => (p in t ? t[p] : anyFn) });
const el = () => ({
  classList: { add() {}, remove() {}, contains: () => false },
  style: {}, innerHTML: '', dataset: {}, textContent: '',
  querySelectorAll: () => [], addEventListener() {}, appendChild() {},
  getContext: () => stub, width: 0, height: 0
});
const elements = {};
const document = {
  getElementById(id) { if (!elements[id]) elements[id] = el(); return elements[id]; },
  querySelectorAll: () => [], addEventListener() {}, body: el()
};
const sandbox = {
  console, setTimeout, clearTimeout, Math, Date, Set, Map, Array, Object, JSON, String, Number, isNaN, process,
  performance: { now: () => Date.now() },
  document,
  window: { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {} },
  location: { search: '', hash: '', href: 'file:///index.html' },
  addEventListener() {},
  requestAnimationFrame: (cb) => { sandbox.__raf = cb; return 1; },
  AudioContext: undefined, devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720
};
sandbox.globalThis = sandbox;
sandbox.window.window = sandbox.window;

vm.createContext(sandbox);
try {
  vm.runInContext(js, sandbox, { filename: 'game.js' });
} catch (e) {
  console.error('RUNTIME ERROR:', e && e.stack ? e.stack : e);
  process.exit(2);
}

const log = (tag) => console.log(tag.padEnd(22), JSON.stringify(sandbox.__probe()));

log('demo 定格');
console.log('state'.padEnd(22), sandbox.__state());

sandbox.__hold(true);
for (const s of [5, 10, 20, 30]) { sandbox.__step(s * 60); log('hold space +' + s + 's'); }
sandbox.__hold(false);

// 升级流程
console.log('--- 升级流程 ---');
sandbox.__forceXp();
sandbox.__step(1);
console.log('触发后 state          ', sandbox.__state());
sandbox.__choose(0);
console.log('选择后 state          ', sandbox.__state(), JSON.stringify(sandbox.__st()));

// 压力测试：150 敌人时的单步耗时
sandbox.__hold(true);
sandbox.__step(120);
const ms = sandbox.__timed(600);
console.log('600 步耗时(ms)        ', ms.toFixed(1), '→ 平均每步', (ms / 600).toFixed(2), 'ms');
log('压力后');

// ---- 从 0 秒开始的真实曲线（带伤害、会被打死）----
console.log('--- 从 0 秒真实开局 ---');
sandbox.__freshStart();
sandbox.__hold(true);
for (const s of [10, 20, 40, 60, 90, 120, 180]) {
  let guard = 0;
  while (sandbox.__probe().time < s && guard++ < 20000) {
    if (sandbox.__state() === 'levelup') sandbox.__choose(0);
    else if (sandbox.__state() !== 'playing') break;
    sandbox.__step(1);
  }
  log('t=' + s + 's');
  if (sandbox.__state() !== 'playing') { console.log('  -> state=' + sandbox.__state()); break; }
}