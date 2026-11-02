// 自测脚本：用 DOM 桩在 Node 里跑真实游戏循环
// 用法: node selftest.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const i = html.lastIndexOf('<script>') + 8;
const j = html.lastIndexOf('</script>');
let js = html.slice(i, j);

js = js.replace('const DEMO = /demo/.test(location.search + location.hash);', 'const DEMO = true;');
js = js.replace('if (!DEMO && xp >= need) levelUp();', 'if (xp >= need) levelUp();');
js = js.replace('if (DEMO) demo();', `if (DEMO) {
  reset();
  globalThis.__T = {
    setLv: (n) => { SK.lv = n; SK.cd = 0; },
    clear: () => { enemies.length = 0; bolts.length = 0; zaps.length = 0; },
    add: (dx, dy, hp) => { const e = { x: P.x + dx, y: P.y + dy, r: 11, hp: hp || 200, maxHp: hp || 200, speed: 0, dmg: 0, xp: 1, brute: false, kx: 0, ky: 0, flash: 0, para: 0, seed: 0 }; enemies.push(e); return e; },
    cast: () => { SK.cd = 0; castChain(); },
    laser: () => { SK.charge = 1; SK.cd = 0; SK.ang = aimAngle(); fireLaser(); },
    resetCharge: () => { SK.charge = 0; SK.cd = 0; SK.firing = 0; },
    step: (n) => { for (let k = 0; k < n; k++) update(STEP); },
    sk: () => ({ lv: SK.lv, cd: +SK.cd.toFixed(2), charge: +SK.charge.toFixed(2), firing: +SK.firing.toFixed(2), chain: SK.chain }),
    snap: () => enemies.map(e => ({ hp: +e.hp.toFixed(1), maxHp: e.maxHp, para: +e.para.toFixed(2), dx: Math.round(e.x - P.x) })),
    hold: (on) => { if (on) keys.add('Space'); else keys.delete('Space'); },
    zaps: () => zaps.length,
    forceXp: () => { xp = need; },
    choose: (n) => choose(n),
    state: () => state,
    st: () => ({ dmg: +ST.dmg.toFixed(2), rate: +ST.rate.toFixed(2), speed: Math.round(P.speed), maxHp: P.maxHp }),
    timed: (n) => { const t0 = process.hrtime.bigint(); for (let k = 0; k < n; k++) update(STEP); return Number(process.hrtime.bigint() - t0) / 1e6; }
  };
  globalThis.__probe = () => ({ time: +time.toFixed(1), kills, level, xp, need, enemies: enemies.length, hp: +P.hp.toFixed(1) });
}`);

if (!/__T/.test(js)) { console.error('patch failed: index.html 结构变了?'); process.exit(1); }

const anyFn = function () { return stub; };
const stub = new Proxy({}, { get: (t, p) => (p in t ? t[p] : anyFn) });
const el = () => ({
  classList: { add() {}, remove() {}, contains: () => false },
  style: {}, innerHTML: '', dataset: {}, textContent: '',
  querySelectorAll: () => [], addEventListener() {}, appendChild() {}, getContext: () => stub, width: 0, height: 0
});
const elements = {};
const document = {
  getElementById(id) { if (!elements[id]) elements[id] = el(); return elements[id]; },
  querySelectorAll: () => [], addEventListener() {}, body: el()
};
const sandbox = {
  console, process, setTimeout, clearTimeout, Math, Date, Set, Map, Array, Object, JSON, String, Number, isNaN,
  performance: { now: () => Date.now() },
  document,
  window: { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {}, matchMedia: null },
  location: { search: '', hash: '', href: 'file:///index.html' },
  addEventListener() {}, requestAnimationFrame: () => 1,
  AudioContext: undefined, devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
try {
  vm.runInContext(js, sandbox, { filename: 'game.js' });
} catch (e) {
  console.error('RUNTIME ERROR:', e && e.stack ? e.stack : e);
  process.exit(2);
}

const T = sandbox.__T;
const log = (...a) => console.log(...a);
let fail = 0;
const check = (ok, msg) => { log((ok ? '  PASS ' : '  FAIL ') + msg); if (!ok) fail++; };

log('=== 基础循环 ===');
log('初始状态 ' + JSON.stringify(sandbox.__probe()));
T.clear();
T.setLv(0);
T.hold(true);
T.step(600);
log('按住攻击 10 秒 ' + JSON.stringify(sandbox.__probe()));
check(sandbox.__probe().time >= 9.9, '时间推进正常');

log('=== 升级流程 ===');
T.forceXp();
T.step(1);
check(T.state() === 'levelup', '满经验后进入升级界面');
T.choose(0);
check(T.state() === 'playing', '选择强化后恢复战斗');
log('  强化后属性 ' + JSON.stringify(T.st()));

log('=== 雷电 Lv1：连锁 ===');
T.clear();
for (let k = 1; k <= 4; k++) T.add(k * 70, 0, 999);
T.setLv(1);
T.cast();
let s = T.snap();
const hit1 = s.filter(e => e.hp < 999).length;
log('  命中数 ' + hit1 + ' | 剩余 ' + s.map(e => e.hp).join(', ') + ' | 电弧段数 ' + T.zaps());
check(hit1 === 3, '连锁命中 3 个目标');
check(T.zaps() === 3, '产生 3 段电弧');

log('=== 雷电 Lv2：麻痹 + 15% 最大生命 ===');
T.clear();
T.add(120, 0, 400);
T.setLv(2);
T.cast();
s = T.snap();
const dealt = 400 - s[0].hp;
log('  伤害 ' + dealt.toFixed(1) + ' | 麻痹 ' + s[0].para);
check(Math.abs(dealt - (22 + 400 * 0.15)) < 0.6, '伤害 = 基础 22 + 目标最大生命 15%');
check(s[0].para > 0.9, '命中后进入麻痹');
T.step(60);
check(T.snap()[0].para === 0, '麻痹 1 秒后解除');

log('=== 雷电 Lv3：激光 ===');
T.clear();
for (let k = 1; k <= 5; k++) T.add(k * 100, 0, 999);
T.setLv(3);
T.laser();
s = T.snap();
const hit3 = s.filter(e => e.hp < 999).length;
log('  命中数 ' + hit3 + ' | 剩余 ' + s.map(e => e.hp).join(', ') + ' | SK ' + JSON.stringify(T.sk()));
check(hit3 === 5, '激光贯穿命中一列 5 个目标');
check(T.sk().firing > 0, '进入发射动画');

log('=== 蓄力 ===');
function framesToFire(hold) {
  T.setLv(3);
  T.clear();
  T.resetCharge();
  T.add(150, 0, 999);
  T.hold(hold);
  for (let k = 0; k < 400; k++) {
    T.step(1);
    if (T.sk().firing > 0.1) { T.hold(false); return k; }
  }
  T.hold(false);
  return -1;
}
const noHold = framesToFire(false);
const withHold = framesToFire(true);
log('  不按键蓄满 ' + (noHold / 60).toFixed(2) + 's | 按住攻击键蓄满 ' + (withHold / 60).toFixed(2) + 's');
check(noHold > 50 && noHold < 80, '自然蓄力约 1.05s');
check(withHold > 0 && withHold < noHold * 0.7, '按住攻击键明显加快蓄力');

log('=== 性能 ===');
T.clear();
for (let k = 0; k < 130; k++) T.add(Math.random() * 900 - 450, Math.random() * 500 - 250, 999);
const ms = T.timed(600);
log('  600 步耗时 ' + ms.toFixed(1) + 'ms → 每步 ' + (ms / 600).toFixed(2) + 'ms');
check(ms / 600 < 3, '满负载单步 < 3ms');

log('');
log(fail === 0 ? '全部通过' : (fail + ' 项失败'));
process.exit(fail === 0 ? 0 : 1);
