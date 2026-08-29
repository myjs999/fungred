// WebAudio 合成音效 —— 无音频素材，全部振荡器/噪声实时合成
let ctx = null, master = null;

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor(); // 多音叠加时防削波
    comp.threshold.value = -18;
    comp.ratio.value = 6;
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(comp);
    comp.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// 浏览器要求首次用户手势后才能出声
export function unlockAudio() { try { ensure(); } catch (e) { /* 无声环境 */ } }

const quiet = () => !ctx || ctx.state !== 'running' || document.hidden;

function env(g, t0, peak, dur) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
}

function tone({ type = 'sine', f0 = 440, f1 = null, dur = 0.2, vol = 0.2, delay = 0 }) {
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t0 + dur * 0.9);
  env(g, t0, vol, dur);
  o.connect(g); g.connect(master);
  o.start(t0); o.stop(t0 + dur + 0.05);
}

function noise({ dur = 0.15, vol = 0.15, freq = 1200, q = 1, delay = 0 }) {
  const t0 = ctx.currentTime + delay;
  const len = Math.ceil(ctx.sampleRate * (dur + 0.02));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
  const g = ctx.createGain();
  env(g, t0, vol, dur);
  src.connect(bp); bp.connect(g); g.connect(master);
  src.start(t0); src.stop(t0 + dur + 0.05);
}

export const sfx = {
  select() { if (quiet()) return; tone({ type: 'triangle', f0: 880, dur: 0.06, vol: 0.07 }); },
  error() {
    if (quiet()) return;
    tone({ type: 'square', f0: 140, dur: 0.14, vol: 0.07 });
    tone({ type: 'square', f0: 104, dur: 0.18, vol: 0.06, delay: 0.06 });
  },
  jade() { // 选中召唤玉：上滑双音
    if (quiet()) return;
    tone({ type: 'sine', f0: 520, f1: 780, dur: 0.13, vol: 0.1 });
    tone({ type: 'sine', f0: 1040, dur: 0.16, vol: 0.05, delay: 0.06 });
  },
  turn() { // 结束回合：风声 + 上行音
    if (quiet()) return;
    noise({ dur: 0.28, vol: 0.07, freq: 600, q: 0.7 });
    tone({ type: 'sine', f0: 330, f1: 415, dur: 0.22, vol: 0.08, delay: 0.06 });
  },
  summon() { // 召唤：低鸣上滑 + 泛音闪
    if (quiet()) return;
    tone({ type: 'sine', f0: 85, f1: 250, dur: 0.55, vol: 0.22 });
    tone({ type: 'triangle', f0: 523, f1: 1046, dur: 0.4, vol: 0.06, delay: 0.16 });
    noise({ dur: 0.4, vol: 0.035, freq: 2600, q: 0.6, delay: 0.1 });
  },
  shoot() { if (quiet()) return; noise({ dur: 0.12, vol: 0.11, freq: 1900, q: 1.2 }); },
  hit(stagger = 0) { // 命中：低频闷响 + 噪声
    if (quiet()) return;
    tone({ type: 'sine', f0: 150, f1: 66, dur: 0.15, vol: 0.24, delay: stagger });
    noise({ dur: 0.07, vol: 0.11, freq: 900, q: 0.8, delay: stagger });
  },
  hitBase() { // 基地受击：钟声 + 地鸣
    if (quiet()) return;
    tone({ type: 'sine', f0: 220, dur: 0.75, vol: 0.18 });
    tone({ type: 'sine', f0: 440, dur: 0.5, vol: 0.07 });
    tone({ type: 'sine', f0: 662, dur: 0.32, vol: 0.045 });
    tone({ type: 'sine', f0: 62, f1: 44, dur: 0.35, vol: 0.24 });
  },
  heal() {
    if (quiet()) return;
    [523, 659, 784].forEach((f, i) => tone({ type: 'sine', f0: f, dur: 0.2, vol: 0.06, delay: i * 0.055 }));
  },
  skill(kei) { // 各系施法音色
    if (quiet()) return;
    if (kei === 'mahou') {
      tone({ type: 'sine', f0: 500, f1: 1150, dur: 0.26, vol: 0.09 });
      tone({ type: 'sine', f0: 750, f1: 1720, dur: 0.22, vol: 0.05, delay: 0.04 });
    } else if (kei === 'seimei') {
      tone({ type: 'triangle', f0: 660, dur: 0.14, vol: 0.09 });
      tone({ type: 'triangle', f0: 880, dur: 0.18, vol: 0.06, delay: 0.07 });
    } else if (kei === 'kikai') {
      tone({ type: 'square', f0: 220, dur: 0.1, vol: 0.07 });
      tone({ type: 'square', f0: 175, dur: 0.12, vol: 0.06, delay: 0.06 });
      noise({ dur: 0.1, vol: 0.05, freq: 3200, q: 2, delay: 0.02 });
    } else { // shinrei 风铃
      tone({ type: 'sine', f0: 784, dur: 0.3, vol: 0.07 });
      tone({ type: 'sine', f0: 1175, dur: 0.36, vol: 0.04, delay: 0.09 });
    }
  },
  die() {
    if (quiet()) return;
    tone({ type: 'sawtooth', f0: 280, f1: 48, dur: 0.45, vol: 0.11 });
    noise({ dur: 0.3, vol: 0.07, freq: 420, q: 0.6, delay: 0.04 });
  },
  baseDown() { // 基地陷落
    if (quiet()) return;
    tone({ type: 'sine', f0: 50, f1: 28, dur: 1.2, vol: 0.32 });
    noise({ dur: 0.9, vol: 0.14, freq: 250, q: 0.5 });
    tone({ type: 'sine', f0: 220, f1: 110, dur: 0.9, vol: 0.1, delay: 0.1 });
  },
  win() {
    if (quiet()) return;
    [523, 659, 784, 1046].forEach((f, i) => {
      tone({ type: 'triangle', f0: f, dur: 0.55, vol: 0.1, delay: i * 0.13 });
      tone({ type: 'sine', f0: f * 2, dur: 0.4, vol: 0.03, delay: i * 0.13 + 0.02 });
    });
  },
  lose() {
    if (quiet()) return;
    [392, 311, 262, 196].forEach((f, i) => tone({ type: 'sine', f0: f, dur: 0.7, vol: 0.09, delay: i * 0.22 }));
  },
};
