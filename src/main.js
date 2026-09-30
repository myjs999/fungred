// Fungred 复刻版 —— Three.js 场景 / 表现层 / UI
import * as THREE from '../three.module.js';
import { HEROES, KEI, WORLD, CARDS } from './data.js';
import {
  game, fxQueue, initGame, createHero, allHeroes, opposite,
  attack, castSkill, validateTarget, playerSummon,
  runEnemyTurnAndPrepare, heroDieCleanup, LANES, LANE_CAP,
  skillPrecheck, cardPrecheck, validateCardTarget, playCard,
} from './game.js';
import { sfx, unlockAudio } from './audio.js';

addEventListener('pointerdown', unlockAudio, { once: true });
addEventListener('keydown', unlockAudio, { once: true });

const $ = s => document.querySelector(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clamp01 = x => Math.max(0, Math.min(1, x));
const easeOut = t => 1 - Math.pow(1 - t, 3);
const easeIn = t => t * t * t;
// 页面隐藏时 rAF 不触发、setTimeout 被浏览器节流，
// 因此隐藏状态下所有动画直接跳到最终状态（无头测试也因此瞬时完成）
const nextFrame = cb => document.hidden
  ? setTimeout(() => cb(performance.now()), 100) // 隐藏时兜底触发（配合步进器的 instant 早退）
  : requestAnimationFrame(cb);
const instant = () => document.hidden;

/* ============================================================ 渲染基础 */
const canvas = $('#gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050712);
scene.fog = new THREE.FogExp2(0x050712, 0.02);

const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.1, 300);
camera.position.set(0, 13.4, 10.8);
camera.lookAt(0, -0.6, -0.9);
const camBasePos = camera.position.clone();

// 相机震动（基地受击等）
let shakeLeft = 0, shakeAmp = 0;
function shake(amp = 0.18, ms = 220) {
  if (instant()) return;
  shakeAmp = Math.max(shakeAmp, amp);
  shakeLeft = Math.max(shakeLeft, ms / 1000);
}

/* ---------- 泛光后处理（手写迷你 Bloom 管线） ---------- */
const POST = (() => {
  const rtScene = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType });
  const rtA = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, depthBuffer: false });
  const rtB = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, depthBuffer: false });
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const mkMat = (frag, uniforms) => new THREE.ShaderMaterial({
    uniforms,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: frag,
    depthTest: false, depthWrite: false,
  });
  const brightMat = mkMat(`
    uniform sampler2D tex; varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tex, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      gl_FragColor = vec4(c * smoothstep(0.52, 1.0, l), 1.0);
    }`, { tex: { value: null } });
  const blurMat = mkMat(`
    uniform sampler2D tex; uniform vec2 dir; varying vec2 vUv;
    void main(){
      vec3 s = texture2D(tex, vUv).rgb * 0.227;
      s += (texture2D(tex, vUv + dir * 1.384).rgb + texture2D(tex, vUv - dir * 1.384).rgb) * 0.316;
      s += (texture2D(tex, vUv + dir * 3.230).rgb + texture2D(tex, vUv - dir * 3.230).rgb) * 0.070;
      gl_FragColor = vec4(s, 1.0);
    }`, { tex: { value: null }, dir: { value: new THREE.Vector2() } });
  const addMat = mkMat(`
    uniform sampler2D tex; uniform float k; varying vec2 vUv;
    void main(){ gl_FragColor = vec4(texture2D(tex, vUv).rgb * k, 1.0); }`,
    { tex: { value: null }, k: { value: 0.85 } });
  addMat.blending = THREE.AdditiveBlending;
  addMat.transparent = true;
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), brightMat);
  const quadScene = new THREE.Scene();
  quadScene.add(quad);
  return {
    setSize(w, h) {
      rtScene.setSize(w >> 1, h >> 1);
      rtA.setSize(w >> 2, h >> 2);
      rtB.setSize(w >> 2, h >> 2);
    },
    render() {
      renderer.setRenderTarget(rtScene);
      renderer.render(scene, camera);
      quad.material = brightMat;
      brightMat.uniforms.tex.value = rtScene.texture;
      renderer.setRenderTarget(rtA);
      renderer.render(quadScene, quadCam);
      for (let i = 0; i < 2; i++) {
        quad.material = blurMat;
        blurMat.uniforms.tex.value = rtA.texture;
        blurMat.uniforms.dir.value.set(1 / rtA.width, 0);
        renderer.setRenderTarget(rtB);
        renderer.render(quadScene, quadCam);
        blurMat.uniforms.tex.value = rtB.texture;
        blurMat.uniforms.dir.value.set(0, 1 / rtA.height);
        renderer.setRenderTarget(rtA);
        renderer.render(quadScene, quadCam);
      }
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
      quad.material = addMat;
      addMat.uniforms.tex.value = rtA.texture;
      renderer.autoClear = false;
      renderer.render(quadScene, quadCam);
      renderer.autoClear = true;
    },
  };
})();

function onResize() {
  camera.aspect = innerWidth / innerHeight;
  if (camera.aspect < 0.8) {
    // 竖屏（手机）：接近俯视，并按水平视角反推垂直视角，保证四条战线都在画面内
    camera.position.set(0, 21, 8.5);
    camera.fov = Math.min(95, 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(21)) / camera.aspect) * 180 / Math.PI);
    camera.lookAt(0, -0.5, 1.2);
  } else {
    camera.position.set(0, 13.4, 10.8);
    camera.fov = 46;
    camera.lookAt(0, -0.6, -0.9);
  }
  camBasePos.copy(camera.position);
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  POST.setSize(innerWidth * Math.min(devicePixelRatio, 2), innerHeight * Math.min(devicePixelRatio, 2));
}
addEventListener('resize', onResize);
onResize();

scene.add(new THREE.HemisphereLight(0x93a3ff, 0x0a0a16, 0.55));
const dirLight = new THREE.DirectionalLight(0xfff4e0, 1.5);
dirLight.position.set(6, 14, 7);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(1024, 1024);
dirLight.shadow.camera.left = -9;
dirLight.shadow.camera.right = 9;
dirLight.shadow.camera.top = 10;
dirLight.shadow.camera.bottom = -10;
dirLight.shadow.camera.near = 2;
dirLight.shadow.camera.far = 40;
dirLight.shadow.bias = -0.002;
scene.add(dirLight);
const youGlowL = new THREE.PointLight(0x8b9cff, 5, 14); youGlowL.position.set(0, 3.4, 5.6); scene.add(youGlowL);
const eneGlowL = new THREE.PointLight(0xff5265, 5, 14); eneGlowL.position.set(0, 3.4, -5.6); scene.add(eneGlowL);

/* ---------- 通用贴图 ---------- */
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
const TEX_GLOW = glowTexture();

function runeTexture(colorCss) {
  const S = 512;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.strokeStyle = colorCss; g.fillStyle = colorCss;
  g.translate(S / 2, S / 2);
  g.lineWidth = 7;
  g.beginPath(); g.arc(0, 0, 226, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 3;
  g.beginPath(); g.arc(0, 0, 205, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(0, 0, 120, 0, Math.PI * 2); g.stroke();
  // 放射刻痕 + 内三角
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * Math.PI * 2;
    const r1 = 205, r2 = i % 2 === 0 ? 180 : 192;
    g.beginPath();
    g.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
    g.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
    g.stroke();
  }
  g.lineWidth = 4;
  for (let k = 0; k < 2; k++) {
    g.beginPath();
    for (let i = 0; i <= 3; i++) {
      const a = i / 3 * Math.PI * 2 + Math.PI / 2 + k * Math.PI / 3;
      const x = Math.cos(a) * 120, y = Math.sin(a) * 120;
      i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

function textTexture(text, sub) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(16,20,44,0.92)';
  g.beginPath(); g.roundRect(8, 8, 496, 240, 26); g.fill();
  g.strokeStyle = 'rgba(139,156,255,0.55)'; g.lineWidth = 5; g.stroke();
  g.fillStyle = '#cdd6ff';
  g.font = '500 44px "Segoe UI", "Microsoft YaHei", sans-serif';
  g.textAlign = 'center';
  g.fillText(text, 256, 120);
  if (sub) {
    g.fillStyle = 'rgba(160,172,230,0.7)';
    g.font = '30px "Segoe UI", "Microsoft YaHei", sans-serif';
    g.fillText(sub, 256, 178);
  }
  return new THREE.CanvasTexture(c);
}

/* ---------- 星空与远景 ---------- */
{
  const n = 900, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = 70 + Math.random() * 60;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = Math.abs(r * Math.cos(ph)) * 0.7 - 6;
    pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.5, map: TEX_GLOW, transparent: true, opacity: 0.75,
    depthWrite: false, blending: THREE.AdditiveBlending, color: 0xaebaff,
  })));
}
// 动态星云背景（fbm 噪声 shader）
const nebulaMat = new THREE.ShaderMaterial({
  uniforms: { t: { value: 0 } },
  depthWrite: false,
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform float t; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p){
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
                 mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
    }
    float fbm(vec2 p){
      float s = 0.0, a = 0.5;
      for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.02; a *= 0.5; }
      return s;
    }
    void main(){
      vec2 uv = vUv * vec2(3.0, 1.6);
      float n1 = fbm(uv + vec2(t * 0.010, 0.0));
      float n2 = fbm(uv * 1.7 - vec2(t * 0.008, t * 0.004));
      float n3 = fbm(uv * 0.8 + 7.3 + vec2(0.0, t * 0.006));
      vec3 col = vec3(0.014, 0.018, 0.045);
      col += vec3(0.10, 0.13, 0.38) * pow(n1, 2.2) * 1.35;
      col += vec3(0.30, 0.12, 0.42) * pow(n2, 2.6) * 1.05;
      col += vec3(0.55, 0.14, 0.20) * pow(n3, 3.2) * 0.85;
      float vg = smoothstep(1.05, 0.35, abs(vUv.y - 0.55) * 1.6);
      gl_FragColor = vec4(col * vg, 1.0);
    }`,
});
// 相机俯视，可见的"天空"其实在地平线下方远处——背景板放在那里
const nebulaBg = new THREE.Mesh(new THREE.PlaneGeometry(420, 260), nebulaMat);
nebulaBg.position.set(0, -55, -95);
nebulaBg.rotation.x = -0.42;
nebulaBg.renderOrder = -1;
scene.add(nebulaBg);

// 远处星云光斑
const nebulas = [];
[[0x5b8cff, -30, -18, -60, 46], [0xa15bff, 28, -26, -70, 60], [0xff5265, 2, -14, -75, 40]].forEach(([col, x, y, z, s]) => {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: TEX_GLOW, color: col, transparent: true, opacity: 0.16,
    depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  }));
  sp.position.set(x, y, z); sp.scale.setScalar(s);
  scene.add(sp); nebulas.push(sp);
});
// 彩蛋：原版「梦想卡」漂浮在远景中
const dreamCards = [];
[['hello, world', 'Fungred · 2022', -11.5, -7.5, -19], ['make it.', 'cause I\'m myjs999', 11.8, -8.5, -21]].forEach(([t, s, x, y, z]) => {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(4.6, 2.3),
    new THREE.MeshBasicMaterial({ map: textTexture(t, s), transparent: true, opacity: 0.85, depthWrite: false })
  );
  m.position.set(x, y, z);
  m.rotation.x = -0.55;
  scene.add(m); dreamCards.push(m);
});

/* ============================================================ 战场 */
const LANE_X = [-4.35, -1.45, 1.45, 4.35];
const PAD_Z = 2.15, BASE_Z = 5.35;
const TOP_Y = 0.3;

function heroWorldPos(h) {
  if (h.isBase) return new THREE.Vector3(0, TOP_Y, h.side === 0 ? BASE_Z : -BASE_Z);
  const zs = h.side === 0 ? 1 : -1;
  return new THREE.Vector3(LANE_X[h.lane], TOP_Y, zs * PAD_Z);
}

// 桌面纹理：径向渐变 + 细网格 + 噪点 + 双线框
function boardTexture() {
  const S = 1024;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(S / 2, S / 2, 60, S / 2, S / 2, S * 0.72);
  grd.addColorStop(0, '#141a3e');
  grd.addColorStop(0.55, '#0e1229');
  grd.addColorStop(1, '#070a1c');
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  g.strokeStyle = 'rgba(130, 150, 255, 0.05)';
  g.lineWidth = 1;
  for (let i = 64; i < S; i += 64) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, S); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(S, i); g.stroke();
  }
  for (let i = 0; i < 1600; i++) {
    g.fillStyle = `rgba(160, 175, 255, ${Math.random() * 0.05})`;
    g.fillRect(Math.random() * S, Math.random() * S, 1.5, 1.5);
  }
  g.strokeStyle = 'rgba(140, 160, 255, 0.16)'; g.lineWidth = 3;
  g.strokeRect(14, 14, S - 28, S - 28);
  g.strokeStyle = 'rgba(140, 160, 255, 0.07)'; g.lineWidth = 1.5;
  g.strokeRect(30, 30, S - 60, S - 60);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8;
  return tex;
}

// 悬浮石台
{
  const slabMat = new THREE.MeshStandardMaterial({ color: 0x141833, roughness: 0.85, metalness: 0.2 });
  const slab = new THREE.Mesh(new THREE.BoxGeometry(14.6, 0.7, 13.6), slabMat);
  slab.position.y = TOP_Y - 0.35;
  slab.receiveShadow = true;
  scene.add(slab);
  const under = new THREE.Mesh(new THREE.BoxGeometry(12.8, 1.4, 11.8),
    new THREE.MeshStandardMaterial({ color: 0x0c0f24, roughness: 0.95 }));
  under.position.y = TOP_Y - 1.35;
  scene.add(under);
  // 边缘光带（只露出台面四周一圈细边）
  const edge = new THREE.Mesh(new THREE.BoxGeometry(14.7, 0.08, 13.7),
    new THREE.MeshBasicMaterial({ color: 0x4a55b0 }));
  edge.position.y = TOP_Y - 0.045;
  scene.add(edge);
  const top = new THREE.Mesh(new THREE.BoxGeometry(14.4, 0.06, 13.4),
    new THREE.MeshStandardMaterial({ map: boardTexture(), roughness: 0.72, metalness: 0.25 }));
  top.position.y = TOP_Y - 0.028;
  top.receiveShadow = true;
  scene.add(top);
  // 中线
  const mid = new THREE.Mesh(new THREE.PlaneGeometry(13.4, 0.06),
    new THREE.MeshBasicMaterial({ color: 0x4a548f, transparent: true, opacity: 0.8 }));
  mid.rotation.x = -Math.PI / 2;
  mid.position.y = TOP_Y + 0.005;
  scene.add(mid);
  // 三条战线连线
  for (const x of LANE_X) {
    const lane = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 2 * PAD_Z),
      new THREE.MeshBasicMaterial({ color: 0x3a4380, transparent: true, opacity: 0.55 }));
    lane.rotation.x = -Math.PI / 2;
    lane.position.set(x, TOP_Y + 0.004, 0);
    scene.add(lane);
  }
}

// 召唤法阵（每边 3 个）
const pads = { 0: [], 1: [] };
const SIDE_CSS = ['rgba(139,156,255,0.95)', 'rgba(255,82,101,0.95)'];
const SIDE_HEX = [0x8b9cff, 0xff5265];
for (let side = 0; side < 2; side++) {
  const tex = runeTexture(SIDE_CSS[side]);
  for (let lane = 0; lane < LANES; lane++) {
    const g = new THREE.Group();
    const zs = side === 0 ? 1 : -1;
    g.position.set(LANE_X[lane], TOP_Y + 0.012, zs * PAD_Z);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.06, 48),
      new THREE.MeshBasicMaterial({
        map: tex, transparent: true, opacity: 0.5,
        depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      }));
    disc.rotation.x = -Math.PI / 2;
    g.add(disc);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.028, 10, 60),
      new THREE.MeshBasicMaterial({ color: SIDE_HEX[side], transparent: true, opacity: 0.65 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.02;
    g.add(ring);
    g.userData = { side, lane, disc, ring, spin: (side ? -1 : 1) * (0.15 + lane * 0.03) };
    disc.userData.pick = { type: 'pad', side, lane };
    ring.userData.pick = { type: 'pad', side, lane };
    scene.add(g);
    pads[side].push(g);
  }
}

/* ============================================================ 角色造型 */
function stdMat(color, opt = {}) {
  return new THREE.MeshStandardMaterial(Object.assign({
    color, roughness: 0.35, metalness: 0.25,
    emissive: color, emissiveIntensity: 0.12,
  }, opt));
}
function crystalMat(color) {
  return new THREE.MeshStandardMaterial({
    color, roughness: 0.15, metalness: 0.1,
    emissive: color, emissiveIntensity: 0.55,
    transparent: true, opacity: 0.92,
  });
}
function addGlowSprite(g, color, y, s) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: TEX_GLOW, color, transparent: true, opacity: 0.5,
    depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  sp.position.y = y; sp.scale.setScalar(s);
  sp.raycast = () => {}; // 光晕不参与点击拾取
  g.add(sp);
  return sp;
}

function buildHeroMesh(def) {
  const g = new THREE.Group();
  const c = def.color;
  const dark = 0x232848;

  // 脚下光盘（选中/悬停高亮用）
  const under = new THREE.Mesh(new THREE.CircleGeometry(0.72, 40),
    new THREE.MeshBasicMaterial({
      color: c, transparent: true, opacity: 0.22,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
  under.rotation.x = -Math.PI / 2;
  under.position.y = 0.02;
  g.add(under);
  g.userData.under = under;

  const body = new THREE.Group();
  body.scale.setScalar(1.32);
  g.add(body);
  g.userData.body = body;

  if (def.id === 'Licott') {
    // 生命射手：细长晶枪 + 弓弧
    const spire = new THREE.Mesh(new THREE.OctahedronGeometry(0.52), crystalMat(c));
    spire.scale.set(0.62, 1.75, 0.62); spire.position.y = 1.0;
    body.add(spire);
    for (const s of [-1, 1]) { // 背后浮游晶刃
      const blade = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), crystalMat(0xff8b98));
      blade.scale.set(0.45, 1.7, 0.45);
      blade.position.set(s * 0.52, 1.25, -0.28);
      blade.rotation.z = s * 0.5;
      body.add(blade);
    }
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), crystalMat(0xffe1e5));
    gem.position.y = 2.05;
    body.add(gem);
    addGlowSprite(body, c, 1.15, 1.7);
  } else if (def.id === 'Faros') {
    // 魔法师：束腰长袍 + 悬浮法球 + 环
    const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.55, 1.5, 24), stdMat(0x27306b, { emissiveIntensity: 0.18 }));
    robe.position.y = 0.75;
    body.add(robe);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 18), crystalMat(c));
    orb.position.y = 1.95;
    body.add(orb);
    g.userData.spinPart = orb;
    const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.03, 8, 44), stdMat(0x9db8ff, { emissiveIntensity: 0.6 }));
    ring1.position.y = 1.95; ring1.rotation.x = 1.1;
    body.add(ring1);
    g.userData.ringPart = ring1;
    addGlowSprite(body, c, 1.95, 1.6);
  } else if (def.id === 'Milanky') {
    // 心灵花灵：花瓣锥 + 冰晶球
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.2, 1.0, 12), stdMat(0x1f5c40, { emissiveIntensity: 0.2 }));
    stem.position.y = 0.5;
    body.add(stem);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      const petal = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.7, 8), stdMat(0x63f0a2, { emissiveIntensity: 0.35 }));
      petal.position.set(Math.cos(a) * 0.34, 1.15, Math.sin(a) * 0.34);
      petal.rotation.set(Math.sin(a) * 0.85, 0, -Math.cos(a) * 0.85);
      body.add(petal);
    }
    const bloom = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), crystalMat(c));
    bloom.position.y = 1.42;
    body.add(bloom);
    g.userData.spinPart = bloom;
    addGlowSprite(body, c, 1.35, 1.5);
  } else if (def.id === 'Vagro') {
    // 机械卫士：叠层装甲块 + 天线
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.8, 0.6), stdMat(0x4a4318, { emissiveIntensity: 0.15 }));
    torso.position.y = 0.85;
    body.add(torso);
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.64), crystalMat(c));
    chest.position.y = 0.95;
    body.add(chest);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.4, 0.42), stdMat(0x6a611f, { emissiveIntensity: 0.2 }));
    head.position.y = 1.55;
    body.add(head);
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.02), crystalMat(0xffe89a));
    eye.position.set(0, 1.58, 0.22);
    body.add(eye);
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.66, 0.34), stdMat(0x3c3712, { emissiveIntensity: 0.12 }));
      arm.position.set(s * 0.62, 0.85, 0);
      body.add(arm);
    }
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6), stdMat(0xf6c445, { emissiveIntensity: 0.7 }));
    ant.position.set(0.16, 1.95, 0);
    body.add(ant);
    addGlowSprite(body, c, 1.0, 1.4);
  } else if (def.id === 'Simendes') {
    // 天工机巧：敦实机甲锤匠 + 合金转轴锤 + 背后齿轮
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.85, 0.55), stdMat(0x5c3b16, { emissiveIntensity: 0.14 }));
    torso.position.y = 0.8;
    body.add(torso);
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.17), crystalMat(c));
    core.position.set(0, 0.92, 0.29);
    body.add(core);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.38, 0.42), stdMat(0x7a5221, { emissiveIntensity: 0.18 }));
    head.position.y = 1.44;
    body.add(head);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.07, 0.02), crystalMat(0xffc47a));
    visor.position.set(0, 1.46, 0.22);
    body.add(visor);
    const hammer = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.3, 8), stdMat(0x3a3a44, { emissiveIntensity: 0.05 }));
    hammer.add(handle);
    const hHead = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.5, 12), stdMat(0xb07a36, { emissiveIntensity: 0.25, metalness: 0.6 }));
    hHead.rotation.z = Math.PI / 2;
    hHead.position.y = 0.62;
    hammer.add(hHead);
    const hRing = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.03, 8, 20), crystalMat(c));
    hRing.rotation.y = Math.PI / 2;
    hRing.position.y = 0.62;
    hammer.add(hRing);
    hammer.position.set(0.58, 1.0, 0.05);
    hammer.rotation.z = -0.5;
    body.add(hammer);
    const gear = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.07, 6, 12), stdMat(0xe08a2c, { emissiveIntensity: 0.45, metalness: 0.5 }));
    gear.position.set(0, 1.05, -0.36);
    body.add(gear);
    g.userData.ringPart = gear;
    addGlowSprite(body, c, 1.0, 1.4);
  } else if (def.id === 'Heilbenlia') {
    // 人鱼之恋：弯曲鱼尾 + 尾鳍 + 珍珠
    const tail = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const seg = new THREE.Mesh(new THREE.SphereGeometry(0.28 - i * 0.045, 16, 12), crystalMat(i % 2 ? 0x2aa6c4 : c));
      seg.scale.set(1, 0.8, 1);
      seg.position.set(Math.sin(i * 0.5) * 0.14, 0.22 + i * 0.03, -i * 0.2);
      tail.add(seg);
    }
    for (const s of [-1, 1]) {
      const fin = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), crystalMat(0x9fe8f8));
      fin.scale.set(1.2, 0.18, 0.6);
      fin.position.set(0.1 + s * 0.2, 0.36, -1.0);
      fin.rotation.y = s * 0.6;
      tail.add(fin);
    }
    body.add(tail);
    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 16), crystalMat(c));
    torso.scale.set(0.9, 1.3, 0.8);
    torso.position.y = 0.8;
    body.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 14), crystalMat(0xd8f6ff));
    head.position.y = 1.32;
    body.add(head);
    const hair = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.7, 10), stdMat(0x1e6f8a, { emissiveIntensity: 0.3 }));
    hair.position.set(0, 1.1, -0.12);
    hair.rotation.x = 0.25;
    body.add(hair);
    const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), crystalMat(0xffffff));
    pearl.position.set(0.42, 1.2, 0.1);
    body.add(pearl);
    const wave = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.02, 8, 40), stdMat(0x7fe3f5, { emissiveIntensity: 0.6 }));
    wave.position.y = 0.9; wave.rotation.x = Math.PI / 2 - 0.3;
    body.add(wave);
    g.userData.ringPart = wave;
    g.userData.spinPart = pearl;
    addGlowSprite(body, c, 1.0, 1.6);
  } else if (def.id === 'Price') {
    // 书虫 / 天文爱好者：学者长袍 + 悬浮翻开的书 + 环绕星辰
    const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.5, 1.5, 20), stdMat(0x2c2a60, { emissiveIntensity: 0.18 }));
    robe.position.y = 0.75;
    body.add(robe);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 14), crystalMat(0xe6e4ff));
    head.position.y = 1.68;
    body.add(head);
    const book = new THREE.Group();
    for (const s of [-1, 1]) {
      const page = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.38), stdMat(0xf2eedc, { emissiveIntensity: 0.35 }));
      page.position.x = s * 0.15;
      page.rotation.z = s * -0.25;
      book.add(page);
    }
    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.4), stdMat(0x5a3d8a, { emissiveIntensity: 0.3 }));
    book.add(spine);
    book.position.set(0, 1.15, 0.42);
    book.rotation.x = -0.6;
    body.add(book);
    const orbit = new THREE.Group();
    orbit.position.y = 1.35;
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * Math.PI * 2;
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), crystalMat(c));
      star.position.set(Math.cos(a) * 0.6, Math.sin(a * 2) * 0.12, Math.sin(a) * 0.6);
      orbit.add(star);
    }
    body.add(orbit);
    g.userData.spinPart = orbit;
    addGlowSprite(body, c, 1.4, 1.6);
  } else if (def.id === 'Missli') {
    // 守林先锋：兜帽斗篷 + 长弓 + 环绕的叶片
    const cloak = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.4, 10), stdMat(0x3f5d1c, { emissiveIntensity: 0.16 }));
    cloak.position.y = 0.7;
    body.add(cloak);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 18, 14), crystalMat(0xf1ffd8));
    head.position.y = 1.5;
    body.add(head);
    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.27, 0.5, 10), stdMat(0x557a26, { emissiveIntensity: 0.2 }));
    hood.position.set(0, 1.66, -0.05);
    body.add(hood);
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.028, 6, 32, Math.PI * 0.9), stdMat(0xc9e67a, { emissiveIntensity: 0.4 }));
    bow.position.set(-0.52, 1.0, 0.05);
    bow.rotation.z = Math.PI / 2 + 0.3;
    body.add(bow);
    const leaves = new THREE.Group();
    leaves.position.y = 1.05;
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * Math.PI * 2;
      const leaf = new THREE.Mesh(new THREE.OctahedronGeometry(0.1), crystalMat(c));
      leaf.scale.set(0.5, 1.4, 0.2);
      leaf.position.set(Math.cos(a) * 0.62, 0, Math.sin(a) * 0.62);
      leaves.add(leaf);
    }
    body.add(leaves);
    g.userData.spinPart = leaves;
    addGlowSprite(body, c, 1.1, 1.5);
  } else if (def.id === 'Ailee') {
    // 无光之瞳：修长暗袍 + 发光的蒙眼带 + 背后交叉双刃
    const robe = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.6, 8), stdMat(0x1c1d2a, { emissiveIntensity: 0.08 }));
    robe.position.y = 0.8;
    body.add(robe);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 14), stdMat(0x2a2c3c, { emissiveIntensity: 0.12 }));
    head.position.y = 1.72;
    body.add(head);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 6, 24), crystalMat(c));
    band.position.y = 1.74;
    band.rotation.x = Math.PI / 2;
    body.add(band);
    for (const s of [-1, 1]) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 0.02), crystalMat(0xe2e6f2));
      blade.position.set(s * 0.18, 1.2, -0.26);
      blade.rotation.z = s * 0.55;
      body.add(blade);
    }
    const shards = new THREE.Group();
    shards.position.y = 1.0;
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2;
      const sh = new THREE.Mesh(new THREE.TetrahedronGeometry(0.08), stdMat(0x0c0c14, { emissiveIntensity: 0.0 }));
      sh.position.set(Math.cos(a) * 0.55, Math.sin(a * 3) * 0.15, Math.sin(a) * 0.55);
      shards.add(sh);
    }
    body.add(shards);
    g.userData.spinPart = shards;
    addGlowSprite(body, 0xcfd6ea, 1.5, 1.1);
  } else if (def.id === 'Shirley') {
    // 冰灵：雪滴之躯 + 冰晶冠
    const drop = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 18), crystalMat(c));
    drop.scale.set(0.9, 1.35, 0.9); drop.position.y = 0.9;
    body.add(drop);
    const headDrop = new THREE.Mesh(new THREE.SphereGeometry(0.24, 20, 14), crystalMat(0xd8efff));
    headDrop.position.y = 1.72;
    body.add(headDrop);
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.3, 6), crystalMat(0xeaf6ff));
      spike.position.set(Math.cos(a) * 0.2, 2.0, Math.sin(a) * 0.2);
      spike.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
      body.add(spike);
    }
    addGlowSprite(body, 0xcfe9ff, 1.2, 1.6);
  }
  return g;
}

function buildBaseMesh(side) {
  const g = new THREE.Group();
  g.scale.setScalar(0.88);
  const c = SIDE_HEX[side];
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.6, 0.5, 8), stdMat(0x1a1f42, { emissiveIntensity: 0.08 }));
  plinth.position.y = 0.25;
  g.add(plinth);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 1.0, 1.7, 8), stdMat(0x222a58, { emissiveIntensity: 0.1 }));
  shaft.position.y = 1.35;
  g.add(shaft);
  const crown = new THREE.Mesh(new THREE.OctahedronGeometry(0.85), crystalMat(c));
  crown.scale.set(0.7, 1.25, 0.7);
  crown.position.y = 3.1;
  g.add(crown);
  g.userData.spinPart = crown;
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.025, 8, 48), stdMat(c, { emissiveIntensity: 0.6 }));
  halo.position.y = 2.95; halo.rotation.x = Math.PI / 2;
  g.add(halo);
  g.userData.ringPart = halo;
  addGlowSprite(g, c, 3.1, 3.2);
  const under = new THREE.Mesh(new THREE.CircleGeometry(1.7, 48),
    new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.14, depthWrite: false, blending: THREE.AdditiveBlending }));
  under.rotation.x = -Math.PI / 2; under.position.y = 0.02;
  g.add(under);
  g.userData.under = under;
  g.userData.body = g;
  return g;
}

/* ============================================================ 粒子 */
const particles = [];
function spawnBurst(pos, color, { n = 12, speed = 2.2, up = 1.6, life = 0.55, size = 0.28, gravity = 4.5 } = {}) {
  if (instant()) return;
  for (let i = 0; i < n; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: TEX_GLOW, color, transparent: true, opacity: 0.9,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    sp.position.copy(pos);
    sp.scale.setScalar(size * (0.6 + Math.random() * 0.8));
    const a = Math.random() * Math.PI * 2;
    const r = (0.3 + Math.random() * 0.7) * speed;
    particles.push({
      sp, t: 0, life: life * (0.7 + Math.random() * 0.6), gravity,
      vx: Math.cos(a) * r, vy: up * (0.4 + Math.random()), vz: Math.sin(a) * r,
    });
    scene.add(sp);
  }
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.t += dt;
    if (p.t >= p.life) {
      scene.remove(p.sp);
      p.sp.material.dispose();
      particles.splice(i, 1);
      continue;
    }
    p.vy -= p.gravity * dt;
    p.sp.position.x += p.vx * dt;
    p.sp.position.y += p.vy * dt;
    p.sp.position.z += p.vz * dt;
    p.sp.material.opacity = 0.9 * (1 - p.t / p.life);
  }
}

// 环境浮尘：缓慢上升的微光
const dust = (() => {
  const n = 130;
  const pos = new Float32Array(n * 3);
  const vel = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 16;
    pos[i * 3 + 1] = 0.3 + Math.random() * 6;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 14;
    vel[i] = 0.12 + Math.random() * 0.3;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.09, map: TEX_GLOW, transparent: true, opacity: 0.4,
    depthWrite: false, blending: THREE.AdditiveBlending, color: 0x93a3ff,
  }));
  scene.add(pts);
  return {
    update(dt, elapsed) {
      const a = geo.attributes.position.array;
      for (let i = 0; i < n; i++) {
        a[i * 3 + 1] += vel[i] * dt;
        a[i * 3] += Math.sin(elapsed * 0.5 + i) * 0.0015;
        if (a[i * 3 + 1] > 6.5) a[i * 3 + 1] = 0.3;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
})();

/* ============================================================ 标签（DOM 投影） */
const labelLayer = $('#labels');
const visuals = new Map(); // hero.uid -> {group, label, offY, lift}

function makeLabel(h) {
  const el = document.createElement('div');
  el.className = 'hlabel' + (h.isBase ? ' base' : '') + (h.side === 1 ? ' foe' : '');
  labelLayer.appendChild(el);
  return el;
}

function attachVisual(h, { hidden = false } = {}) {
  const group = h.isBase ? buildBaseMesh(h.side) : buildHeroMesh(h.def);
  const pos = heroWorldPos(h);
  group.position.copy(pos);
  if (hidden) group.position.y = pos.y - 4.2;
  if (h.side === 1 && !h.isBase) group.rotation.y = Math.PI;
  group.traverse(o => { o.userData.pickHero = h; if (o.isMesh) o.castShadow = true; });
  scene.add(group);
  const label = makeLabel(h);
  if (hidden) label.style.opacity = '0';
  const v = { group, label, offY: h.isBase ? (h.side === 0 ? 2.2 : 3.5) : 3.1, lift: 0, phase: Math.random() * Math.PI * 2 };
  visuals.set(h.uid, v);
  return v;
}

function removeVisual(h) {
  const v = visuals.get(h.uid);
  if (!v) return;
  scene.remove(v.group);
  v.label.remove();
  visuals.delete(h.uid);
}

const maxHpOf = h => h.isBase ? 150 : h.def.hp;

function labelHtml(h) {
  const ratio = clamp01(h.hpShow / maxHpOf(h));
  const hue = ratio > 0.5 ? '#5be08a' : ratio > 0.25 ? '#f6c445' : '#ff5265';
  if (h.isBase) {
    return `<div class="ln"><span>${h.name}</span></div>
      <div class="bar"><i style="width:${ratio * 100}%;background:${hue}"></i></div>
      <div class="nums">${Math.max(0, h.hpShow)} / ${maxHpOf(h)}</div>`;
  }
  // 攻防偏离基础值时变色（增益绿 / 减益红）
  const statCol = (cur, base) => cur > base ? '#5be08a' : cur < base ? '#ff5265' : '';
  const gc = statCol(h.gp, h.def.gp), fc = statCol(h.fp, h.def.fp);
  return `<div class="ln"><span style="color:${KEI[h.kei].color}">${h.name}</span><em>Lv${h.maxexp}</em></div>
    <div class="bar"><i style="width:${ratio * 100}%;background:${hue}"></i></div>
    <div class="nums">HP ${Math.max(0, h.hpShow)}<b>MP ${h.mp}</b></div>
    <div class="nums ad"><span${gc ? ` style="color:${gc}"` : ''}>攻 ${h.gp}</span><span${fc ? ` style="color:${fc}"` : ''}>防 ${h.fp}</span></div>
    ${h.marks ? `<div class="marks">林间标记 ×${h.marks}</div>` : ''}`;
}

function updateLabels() {
  const w = innerWidth, hgt = innerHeight;
  const p = new THREE.Vector3();
  for (const [uid, v] of visuals) {
    const h = v.heroRef;
    if (!h) continue;
    p.copy(v.group.position); p.y += v.offY;
    p.project(camera);
    if (p.z > 1) { v.label.style.display = 'none'; continue; }
    v.label.style.display = '';
    v.label.style.transform =
      `translate(-50%,-100%) translate(${(p.x * 0.5 + 0.5) * w}px, ${(-p.y * 0.5 + 0.5) * hgt}px)`;
    const html = labelHtml(h);
    if (v.lastHtml !== html) { v.label.innerHTML = html; v.lastHtml = html; }
  }
}

function screenPosOf(h, offY = 1.4) {
  const v = visuals.get(h.uid);
  const p = new THREE.Vector3();
  if (v) { p.copy(v.group.position); p.y += offY; }
  p.project(camera);
  return [(p.x * 0.5 + 0.5) * innerWidth, (-p.y * 0.5 + 0.5) * innerHeight];
}

/* ============================================================ 表现事件播放 */
let playing = false;

// 受击闪白 + 弹缩
function hitFlash(h) {
  const v = visuals.get(h.uid);
  if (!v || instant()) return;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: TEX_GLOW, color: 0xffffff, transparent: true, opacity: 0.95,
    depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  sp.position.copy(v.group.position);
  sp.position.y += h.isBase ? 2.4 : 1.4;
  const s0 = h.isBase ? 3.4 : 2.2;
  sp.scale.setScalar(s0);
  scene.add(sp);
  const t0 = performance.now();
  (function step(nw) {
    const t = clamp01((nw - t0) / 140);
    sp.material.opacity = 0.95 * (1 - t);
    sp.scale.setScalar(s0 * (1 + t * 0.55));
    if (t < 1 && !instant()) nextFrame(step); else scene.remove(sp);
  })(t0);
  if (!h.isBase && !h.dead) v.punch = 1; // tick 中衰减的弹缩
  // 命中火花
  const hp = v.group.position.clone();
  hp.y += h.isBase ? 2.2 : 1.2;
  spawnBurst(hp, 0xffd9a6, { n: 9, speed: 2.6, up: 1.8, life: 0.4, size: 0.2 });
}

function popupDamage(ev) {
  const [x, y] = screenPosOf(ev.h, ev.h.isBase ? 3.2 : 1.7);
  const el = document.createElement('div');
  const heal = ev.val < 0;
  el.className = 'dmg' + (heal ? ' heal' : '');
  el.textContent = (heal ? '+' + (-ev.val) : '-' + ev.val);
  el.style.left = x + 'px'; el.style.top = y + 'px';
  labelLayer.appendChild(el);
  ev.h.hpShow -= ev.val;
  setTimeout(() => el.remove(), 950);
  if (heal) { sfx.heal(); return; }
  hitFlash(ev.h);
  if (ev.h.isBase) { sfx.hitBase(); shake(0.22, 260); }
  else sfx.hit();
}

function popupShow(ev) {
  const [x, y] = screenPosOf(ev.h, ev.h.isBase ? 3.6 : 2.1);
  const el = document.createElement('div');
  el.className = 'shout';
  el.textContent = ev.text;
  el.style.left = x + 'px'; el.style.top = y + 'px';
  el.style.color = ev.color;
  el.style.animationDuration = ev.ms + 'ms';
  labelLayer.appendChild(el);
  setTimeout(() => el.remove(), ev.ms);
}

async function animBullet(ev) {
  if (instant()) return;
  const vf = visuals.get(ev.from.uid), vt = visuals.get(ev.to.uid);
  if (!vf || !vt) return;
  sfx.shoot();
  const from = vf.group.position.clone().add(new THREE.Vector3(0, ev.from.isBase ? 2.6 : 1.2, 0));
  const to = vt.group.position.clone().add(new THREE.Vector3(0, ev.to.isBase ? 2.2 : 1.1, 0));
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10),
    new THREE.MeshBasicMaterial({ color: 0xffffff }));
  g.add(core);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: TEX_GLOW, color: ev.color, transparent: true, opacity: 0.95,
    depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  glow.scale.setScalar(1.3);
  g.add(glow);
  scene.add(g);
  const D = 520, t0 = performance.now();
  const mid = from.clone().lerp(to, 0.5); mid.y += 1.1;
  await new Promise(res => {
    (function step(now) {
      if (instant()) { res(); return; }
      const t = clamp01((now - t0) / D);
      const e = easeIn(t);
      // 二次贝塞尔弧线
      const a = from.clone().lerp(mid, e), b = mid.clone().lerp(to, e);
      g.position.copy(a.lerp(b, e));
      if (t < 1) nextFrame(step); else res();
    })(t0);
  });
  // 命中闪光
  glow.material.opacity = 1; glow.scale.setScalar(2.6); core.visible = false;
  await sleep(70);
  scene.remove(g);
}

async function animDie(ev) {
  const v = visuals.get(ev.h.uid);
  if (v) {
    if (instant()) removeVisual(ev.h);
    else {
      const g = v.group, y0 = g.position.y;
      v.label.style.opacity = '0';
      const D = ev.h.isBase ? 1100 : 720, t0 = performance.now();
      await new Promise(res => {
        (function step(now) {
          if (instant()) { res(); return; }
          const t = clamp01((now - t0) / D);
          g.position.y = y0 - easeIn(t) * 2.6;
          g.scale.setScalar(1 - easeIn(t) * 0.85);
          g.rotation.y += 0.06;
          if (t < 1) nextFrame(step); else res();
        })(t0);
      });
      // 死亡消散粒子
      const dp = g.position.clone();
      dp.y = Math.max(dp.y, TOP_Y) + 0.9;
      const dc = ev.h.isBase ? SIDE_HEX[ev.h.side] : ev.h.def.color;
      spawnBurst(dp, dc, { n: ev.h.isBase ? 30 : 18, speed: 1.6, up: 2.4, life: 0.9, size: 0.3, gravity: 1.2 });
      removeVisual(ev.h);
    }
  }
  const wasLane = { side: ev.h.side, lane: ev.h.lane };
  heroDieCleanup(ev.h);
  if (!ev.h.isBase) {
    // 后排补位
    const list = (wasLane.side === 0 ? game.you : game.ene).lanes[wasLane.lane];
    for (const x of list) {
      const vv = visuals.get(x.uid);
      if (vv) vv.group.position.copy(heroWorldPos(x));
    }
  }
  if (ui.selected === ev.h) { ui.selected = null; renderPanel(); }
  if (ui.pending && ui.pending.sub === ev.h) cancelPending();
}

async function animSummon(ev) {
  const h = ev.h;
  const v = attachVisual(h, { hidden: true });
  v.heroRef = h;
  const target = heroWorldPos(h);
  if (instant()) {
    v.group.position.copy(target);
    v.label.style.opacity = '';
    return;
  }
  sfx.summon();
  // 法阵展开 + 光柱
  const c = h.side === 0 ? (h.def ? h.def.color : SIDE_HEX[0]) : SIDE_HEX[1];
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.05, 10, 60),
    new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
  ring.rotation.x = Math.PI / 2;
  ring.position.set(target.x, TOP_Y + 0.05, target.z);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 5.4, 24, 1, true),
    new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  beam.position.set(target.x, TOP_Y + 2.7, target.z);
  scene.add(ring); scene.add(beam);
  const D = 760, t0 = performance.now();
  await new Promise(res => {
    (function step(now) {
      if (instant()) { res(); return; }
      const t = clamp01((now - t0) / D);
      const e = easeOut(t);
      ring.scale.setScalar(0.2 + e * 1.4);
      ring.material.opacity = 0.9 * (1 - t * 0.85);
      beam.material.opacity = 0.4 * (1 - t);
      beam.rotation.y += 0.08;
      v.group.position.y = target.y - 4.2 + e * 4.2;
      v.label.style.opacity = String(t);
      if (t < 1) nextFrame(step); else res();
    })(t0);
  });
  v.group.position.copy(target);
  v.label.style.opacity = '';
  scene.remove(ring); scene.remove(beam);
  spawnBurst(new THREE.Vector3(target.x, TOP_Y + 0.5, target.z), c, { n: 16, speed: 3, up: 1.2, life: 0.5, size: 0.26, gravity: 2 });
  if (h.def && h.def.lines) { // 登场台词
    popupShow({ h, text: '「' + h.def.lines.summon + '」', color: '#dfe4ff', ms: 1800 });
  }
}

function killVignette() {
  const el = $('#killflash');
  el.classList.remove('on');
  void el.offsetWidth;
  el.classList.add('on');
}

async function playQueue() {
  if (playing) return;
  playing = true;
  document.body.classList.add('busy');
  while (fxQueue.length) {
    const ev = fxQueue.shift();
    if (ev.t === 'bullet') await animBullet(ev);
    else if (ev.t === 'hpdec') popupDamage(ev);
    else if (ev.t === 'show') { popupShow(ev); if (!instant()) await sleep(160); }
    else if (ev.t === 'die') {
      if (!instant()) { // 击杀顿帧 + 白闪
        killVignette();
        sfx[ev.h.isBase ? 'baseDown' : 'die']();
        if (ev.h.isBase) shake(0.4, 600);
        await sleep(ev.h.isBase ? 160 : 90);
      }
      await animDie(ev);
    }
    else if (ev.t === 'summon') await animSummon(ev);
    else if (ev.t === 'peek' && ev.side === 0) {
      msg('夜观天象 · 牌堆顶：' + (ev.ids.length ? ev.ids.map(id => '「' + CARDS[id].name + '」').join(' ') : '牌堆已空'));
    }
  }
  // 校正显示血量
  for (const s of [game.you, game.ene]) {
    for (const h of allHeroes(s)) h.hpShow = h.hp;
    s.base.hpShow = s.base.hp;
  }
  playing = false;
  document.body.classList.remove('busy');
  refreshTopbar(); refreshJadebar(); renderPanel(); renderHand();
  ensureHeroRefs(); updateLabels();
  if (game.over) showOverlay();
}

/* ============================================================ UI 状态 */
// pending：
//   技能/普攻 { kind:'skill', cmd, sub, need:'hero'|'hero2'|'card'|'jade', picks:{} }
//   打出卡牌 { kind:'card', idx, need:'hero'|'card' }
const ui = {
  selected: null,      // 展示面板中的角色
  pending: null,
  summoningJade: null, // 选中的召唤玉
  hover: null,
};

function msg(s) { $('#banner').textContent = s; }
function warn(s) {
  const b = $('#banner');
  b.textContent = s;
  b.classList.remove('warn');
  void b.offsetWidth;
  b.classList.add('warn');
  sfx.error();
}

function cancelPending() {
  ui.pending = null;
  msg(game.you && game.you.freeSummon > 0 ? '海蕴生机：选择一颗就绪的召唤玉，免费召唤' : '');
  renderPanel();
  renderHand();
}
function cancelSummon() {
  if (ui.summoningJade) { ui.summoningJade = null; msg(''); refreshJadebar(); }
}
function afterAction() {
  refreshTopbar(); refreshJadebar(); renderHand(); renderPanel();
  playQueue();
}

/* ---------- 顶栏 ---------- */
function refreshTopbar() {
  $('#turnNum').textContent = game.turn;
  const n = game.you.ptsNext;
  $('#ptsYou').textContent = game.you.pts + (n ? ` (${n > 0 ? '+' : ''}${n})` : '');
  $('#ptsYou').title = n ? `下回合 ${n > 0 ? '+' : ''}${n}` : '';
  $('#ptsEne').textContent = game.ene.pts;
  $('#eneHand').textContent = game.ene.hand.length;
}

/* ---------- 召唤玉栏 ---------- */
const SVG_CRYSTAL = `<svg viewBox="0 0 24 24" fill="none"><path d="M12 2 L19 9 L12 22 L5 9 Z" fill="currentColor" opacity="0.28"/><path d="M12 2 L19 9 L12 22 L5 9 Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M5 9 H19 M12 2 L9 9 L12 22 M12 2 L15 9 L12 22" stroke="currentColor" stroke-width="0.9" opacity="0.7"/></svg>`;

function refreshJadebar() {
  const bar = $('#jades');
  bar.innerHTML = '';
  const free = game.you.freeSummon > 0;
  const pickingJade = ui.pending && ui.pending.need === 'jade';
  for (const j of game.you.jades) {
    const el = document.createElement('button');
    el.className = 'jade';
    const col = KEI[j.def.kei].color;
    let stateHtml, stateCls;
    if (j.cool > 0) { stateHtml = `冷却 ${j.cool}`; stateCls = 'cd'; }
    else if (j.cool === -1) { stateHtml = '出战中'; stateCls = 'out'; }
    else { stateHtml = '就绪'; stateCls = 'ready'; }
    if (ui.summoningJade === j) el.classList.add('sel');
    if (pickingJade) { if (j.cool === -1) el.classList.add('dim'); else el.classList.add('pick'); }
    else if (j.cool !== 0 || (game.you.pts < j.cost && !free)) el.classList.add('dim');
    el.style.setProperty('--jc', col);
    el.innerHTML = `
      <span class="ic">${SVG_CRYSTAL}</span>
      <span class="nm">${j.def.name}</span>
      <span class="cost">${free && j.cool === 0 ? '免费' : j.cost + ' 点'}</span>
      <span class="st ${stateCls}">${stateHtml}</span>
      <span class="exp">EXP ${j.exp}/${j.maxexp}</span>`;
    el.onclick = () => clickJade(j, el);
    bar.appendChild(el);
  }
}

function clickJade(j, el) {
  if (playing || game.over) return;
  const p = ui.pending;
  if (p && p.need === 'jade') { // 「图书稽查」第二步
    if (j.cool === -1) { warn('只能选择不在场的召唤玉'); return; }
    sfx.skill(p.sub.kei);
    castSkill(p.sub.defId, p.cmd, p.sub, null, { cardIdx: p.picks.cardIdx, jade: j });
    ui.pending = null;
    msg('');
    afterAction();
    return;
  }
  cancelPending();
  if (ui.summoningJade === j) { cancelSummon(); return; }
  if (j.cool === -1) { warn(j.def.name + ' 已在场上'); return; }
  if (j.cool > 0) { warn('召唤玉冷却中：还需 ' + j.cool + ' 回合'); return; }
  if (game.you.pts < j.cost && game.you.freeSummon <= 0) {
    warn('召唤点不足（需要 ' + j.cost + ' 点）');
    el.classList.add('shake');
    setTimeout(() => el.classList.remove('shake'), 400);
    return;
  }
  ui.summoningJade = j;
  msg('为「' + j.def.name + '」选择一条我方战线');
  sfx.jade();
  refreshJadebar();
}

/* ---------- 召唤战术牌（手牌） ---------- */
const CARD_ICON = {
  coin: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5v9M9.5 9.5h4a1.8 1.8 0 0 1 0 3.5h-3a1.8 1.8 0 0 0 0 3.5h4"/>',
  house: '<path d="M4 11 12 4l8 7v9H4z"/><path d="M10 20v-5h4v5"/>',
  copy: '<rect x="8" y="8" width="11" height="12" rx="1.5"/><path d="M5 16V5.5A1.5 1.5 0 0 1 6.5 4H15"/>',
  chart: '<path d="M4 19h16"/><path d="M5 15l5-5 3 3 6-7"/><path d="M15 6h4v4"/>',
  dice: '<rect x="4.5" y="4.5" width="15" height="15" rx="3"/><circle cx="9" cy="9" r="1.2"/><circle cx="15" cy="15" r="1.2"/><circle cx="15" cy="9" r="1.2"/><circle cx="9" cy="15" r="1.2"/>',
  stack: '<path d="M12 4 3 8.5l9 4.5 9-4.5z"/><path d="m3 12.5 9 4.5 9-4.5"/><path d="m3 16.5 9 4.5 9-4.5"/>',
  hold: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  book: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z"/><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z"/>',
  drop: '<path d="M12 3.5c3 4 6 7.5 6 10.8A6 6 0 0 1 12 20.3a6 6 0 0 1-6-6c0-3.3 3-6.8 6-10.8z"/>',
  sword: '<path d="M14.5 4H20v5.5L9 20.5 3.5 15z"/><path d="m7 13 4 4M5 19l-1.5 1.5"/>',
  apple: '<path d="M12 7c-3-2-7 0-7 5 0 4 3 8 5 8 1 0 1.3-.5 2-.5s1 .5 2 .5c2 0 5-4 5-8 0-5-4-7-7-5z"/><path d="M12 7c0-2 1-3.5 3-4"/>',
};
const CARD_ICON_OF = {
  capital: 'hold', monopoly: 'hold', regulate: 'hold', estate: 'house', invest: 'chart', mortgage: 'chart',
  forge: 'copy', welfare: 'coin', relief: 'coin', charity: 'book', chance: 'dice', allin: 'stack',
  nectar: 'drop', oath: 'sword', eerie: 'sword', fruit: 'apple',
};
const cardSvg = id => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${CARD_ICON[CARD_ICON_OF[id]]}</svg>`;

function renderHand() {
  const s = game.you;
  const p = ui.pending;
  // 每次待选状态变化都会走到这里：选目标期间给 body 打标记，手机上据此收起挡住棋盘的面板
  document.body.classList.toggle('picking', !!p);
  $('#handCount').textContent = `${s.hand.length} / ${s.handLimit}`;
  $('#handFoot').textContent = `牌堆 ${s.deck.length} · 弃牌 ${s.discard.length}`;
  const box = $('#handCards');
  box.innerHTML = '';
  s.hand.forEach((c, i) => {
    const d = CARDS[c.id];
    const el = document.createElement('button');
    el.className = 'tcard ' + d.kind + (d.passive ? ' passive' : '');
    if (p && p.kind === 'card' && p.idx === i) el.classList.add('sel');
    if (p && p.need === 'card') el.classList.add(p.kind === 'card' && p.idx === i ? 'sel' : 'pick');
    el.innerHTML = `
      <span class="tc-ic">${cardSvg(c.id)}</span>
      <span class="tc-main">
        <span class="tc-nm">${d.name}${d.passive ? '<i>持有</i>' : ''}${d.kind === 'item' ? '<i>物品</i>' : ''}</span>
        <span class="tc-desc">${d.desc}</span>
      </span>`;
    el.onclick = () => clickHandCard(i);
    box.appendChild(el);
  });
}

function clickHandCard(i) {
  if (playing || game.over) return;
  const s = game.you;
  const p = ui.pending;
  if (p && p.kind === 'skill' && p.need === 'card') { // 「图书稽查」第一步
    p.picks.cardIdx = i;
    p.need = 'jade';
    msg('[图书稽查] 选择一颗不在场的召唤玉');
    renderHand(); refreshJadebar();
    return;
  }
  if (p && p.kind === 'card' && p.need === 'card') { // 「伪造」选择复制对象
    if (i === p.idx) { cancelPending(); return; }
    const t = CARDS[s.hand[i].id];
    if (s.hand[i].id === 'forge' || t.kind !== 'tac') { warn('只能复制非「伪造」的召唤战术牌'); return; }
    playCard(s, p.idx, i);
    ui.pending = null; msg('');
    sfx.jade();
    afterAction();
    return;
  }
  if (p && p.kind === 'card' && p.idx === i) { cancelPending(); return; }
  cancelSummon();
  const bad = cardPrecheck(s, i);
  if (bad) { warn(bad); return; }
  const d = CARDS[s.hand[i].id];
  if (d.target) {
    ui.pending = { kind: 'card', idx: i, need: d.target === 'card' ? 'card' : 'hero' };
    msg('[' + d.name + '] ' + (d.target === 'card' ? '选择手中要复制的牌' : '选择目标角色'));
    sfx.select();
    renderHand();
    return;
  }
  playCard(s, i);
  sfx.jade();
  afterAction();
}

/* ---------- 信息面板 ---------- */
const ICONS = {
  hp: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21C7 16.6 3 13.2 3 9.3 3 6.4 5.2 4.5 7.8 4.5c1.6 0 3.2.8 4.2 2.2 1-1.4 2.6-2.2 4.2-2.2 2.6 0 4.8 1.9 4.8 4.8 0 3.9-4 7.3-9 11.7Z"/></svg>`,
  atk: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20 14.5 9.5M14.5 9.5 19 5l.5-1.5L18 4l-4.5 4.5M14.5 9.5l-2 2M6.5 17.5 4 20l-1 1M8 14l2 2"/></svg>`,
  def: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M12 3 5 6v5c0 4.6 3 8.4 7 10 4-1.6 7-5.4 7-10V6Z"/></svg>`,
  mp: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.7c3.2 4.3 6.3 8 6.3 11.6A6.3 6.3 0 0 1 12 20.6a6.3 6.3 0 0 1-6.3-6.3C5.7 10.7 8.8 7 12 2.7Z"/></svg>`,
  exp: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2 2.7 6.2L21.5 9l-5 4.6 1.4 6.9L12 17l-5.9 3.5L7.5 13.6 2.5 9l6.8-.8Z"/></svg>`,
};

function statCell(icon, name, val) {
  return `<div class="stat"><span class="si">${ICONS[icon]}</span><span class="sn">${name}</span><b>${val}</b></div>`;
}

const skillCostText = (d, costs, i) => (d.costLabel && d.costLabel[i] && costs[i] === d.costs[i]) ? d.costLabel[i] : costs[i];

function renderPanel() {
  const p = $('#panel');
  const h = ui.selected;
  if (!h || h.dead) { p.classList.add('hidden'); return; }
  p.classList.remove('hidden');
  const mine = h.side === 0 && !h.isBase;
  const keiChip = h.kei ? `<span class="chip" style="--kc:${KEI[h.kei].color}">${KEI[h.kei].name}</span>` : '';
  let html = `<div class="p-head"><span class="p-name">${h.name}</span>${keiChip}</div>`;
  if (h.def && h.def.title) html += `<div class="p-title">${h.def.title}</div>`;
  if (h.isBase) {
    html += `<div class="p-stats">${statCell('hp', '生命', Math.max(0, h.hp) + ' / ' + maxHpOf(h))}</div>
      <div class="p-tip">摧毁${h.side === 0 ? '它你就输了' : '它即可获胜'}。</div>`;
  } else {
    html += `<div class="p-stats">
      ${statCell('hp', '生命', h.hp)}${statCell('atk', '攻击', h.gp)}
      ${statCell('def', '防御', h.fp)}${statCell('mp', '魔力', h.mp)}
      ${statCell('exp', '经验', h.exp + ' / ' + h.maxexp)}
      <div class="stat"><span class="sn">等级</span><b>Lv ${h.maxexp}</b></div>
      ${h.marks ? `<div class="stat"><span class="sn">林间标记</span><b>×${h.marks}</b></div>` : ''}
      ${h.pierce ? `<div class="stat"><span class="sn">穿透</span><b>${h.pierce}</b></div>` : ''}
    </div>`;
    if (h.def.passive) {
      html += `<div class="act skill ro passive-skill">
        <span class="sk-head"><span class="sk-nm">${h.def.passive.name}</span><span class="sk-cost">被动</span></span>
        <span class="sk-desc">${h.def.passive.desc}</span></div>`;
    }
    if (mine) {
      const aDis = h.usableA <= 0 || playing;
      html += `<button class="act atkbtn ${aDis ? 'dis' : ''}" data-cmd="A">
        <span class="si">${ICONS.atk}</span>普通攻击<em>${h.usableA > 1 ? '剩余 ' + h.usableA + ' 次' : h.usableA > 0 ? '' : '已使用'}</em></button>`;
    }
    html += `<div class="p-skills">`;
    h.def.skills.forEach((sk, i) => {
      const cost = skillCostText(h.def, h.costs, i);
      const usable = h.usable[i] > 0;
      const afford = h.mp >= h.costs[i];
      if (mine) {
        const dis = !usable || playing;
        html += `<button class="act skill ${dis ? 'dis' : ''} ${(!afford && usable) ? 'poor' : ''}" data-cmd="S${i + 1}">
          <span class="sk-head"><span class="sk-nm">${sk.name}</span><span class="sk-cost">${cost} MP</span></span>
          <span class="sk-desc">${sk.desc}</span>
          ${usable ? '' : `<span class="sk-used">${h.sealed ? '秘密航线中' : '本回合已使用'}</span>`}</button>`;
      } else {
        html += `<div class="act skill ro">
          <span class="sk-head"><span class="sk-nm">${sk.name}</span><span class="sk-cost">${cost} MP</span></span>
          <span class="sk-desc">${sk.desc}</span></div>`;
      }
    });
    html += `</div>`;
  }
  p.innerHTML = html;
  if (mine) {
    p.querySelectorAll('[data-cmd]').forEach(btn => {
      btn.onclick = () => clickCommand(h, btn.dataset.cmd);
    });
  }
}

function clickCommand(h, cmd) {
  if (playing || game.over || h.dead || h.side !== 0) return;
  cancelSummon();
  const p = ui.pending;
  if (p && p.kind === 'skill' && p.sub === h && p.cmd === cmd) { cancelPending(); return; }
  if (cmd === 'A') {
    if (h.usableA <= 0) return;
    ui.pending = { kind: 'skill', cmd, sub: h, need: 'hero', picks: {} };
    msg('请选择攻击目标');
    renderHand();
    return;
  }
  const i = { S1: 0, S2: 1, S3: 2 }[cmd];
  if (h.usable[i] <= 0) { if (h.sealed) warn('海尔本莉亚正在秘密航线中，本回合不能再使用技能'); return; }
  if (h.mp < h.costs[i]) { warn('魔力值不够。'); return; }
  const bad = skillPrecheck(h, cmd);
  if (bad) { warn(bad); return; }
  const sk = h.def.skills[i];
  if (sk.instant) { // 无目标技能：立即释放
    sfx.skill(h.kei);
    castSkill(h.defId, cmd, h, null);
    ui.pending = null;
    if (game.you.freeSummon > 0) msg('海蕴生机：选择一颗就绪的召唤玉，免费召唤');
    afterAction();
    return;
  }
  if (sk.pick) {
    ui.pending = { kind: 'skill', cmd, sub: h, need: 'card', picks: {} };
    msg('[' + sk.name + '] 选择一张要弃置的战术牌');
    renderHand();
    return;
  }
  ui.pending = { kind: 'skill', cmd, sub: h, need: 'hero', picks: {} };
  sfx.select();
  msg('[' + sk.name + '] ' + (sk.targets === 2 ? '选择第一个角色' : '请选择目标'));
  renderHand();
}

// 当前待选状态下，ob 能否作为目标；返回 null 表示可以
function pendingHeroError(ob) {
  const p = ui.pending;
  if (!p || (p.need !== 'hero' && p.need !== 'hero2')) return '现在不需要选择角色';
  if (p.kind === 'card') return validateCardTarget(game.you, p.idx, ob);
  const bad = validateTarget(p.sub, p.cmd, ob);
  if (bad) return bad;
  if (p.need === 'hero2' && ob === p.picks.ob1) return '请选择另一个角色';
  return null;
}

function clickTarget(ob) {
  const p = ui.pending;
  if (p.need === 'card') { warn('请先在左侧选择一张战术牌'); return; }
  if (p.need === 'jade') { warn('请在下方选择一颗召唤玉'); return; }
  const bad = pendingHeroError(ob);
  if (bad) { warn(bad); return; }
  if (p.kind === 'card') {
    playCard(game.you, p.idx, ob);
    ui.pending = null; msg('');
    sfx.jade();
    afterAction();
    return;
  }
  const { cmd, sub } = p;
  const sk = cmd === 'A' ? null : sub.def.skills[+cmd[1] - 1];
  if (sk && sk.targets === 2 && p.need === 'hero') { // 「生命平等」第一目标
    p.picks.ob1 = ob;
    p.need = 'hero2';
    msg('[' + sk.name + '] 选择第二个角色');
    sfx.select();
    return;
  }
  ui.pending = null;
  msg('');
  if (cmd === 'A') {
    const ok = attack(sub, ob);
    if (!ok) warn('未能击穿目标的防御');
  } else if (p.need === 'hero2') {
    sfx.skill(sub.kei);
    castSkill(sub.defId, cmd, sub, p.picks.ob1, { ob2: ob });
  } else {
    sfx.skill(sub.kei);
    castSkill(sub.defId, cmd, sub, ob);
  }
  afterAction();
}

/* ---------- 结束回合 / 结算 ---------- */
$('#endTurn').onclick = () => {
  if (playing || game.over) return;
  cancelPending(); cancelSummon();
  ui.selected = null; renderPanel();
  sfx.turn();
  runEnemyTurnAndPrepare();
  msg(game.lastDiscards.length ? '手牌超过上限，弃掉了：' + game.lastDiscards.join('、') : '');
  refreshTopbar(); renderHand();
  playQueue();
};

function showOverlay() {
  const o = $('#overlay');
  o.classList.remove('hidden');
  const win = game.overWinner === 0;
  sfx[win ? 'win' : 'lose']();
  $('#ovTitle').textContent = win ? '胜利' : '战败';
  $('#ovTitle').className = win ? 'win' : 'lose';
  $('#ovSub').textContent = win
    ? '敌方基地已化为星尘。'
    : '我方基地陷落了……再试一次吧。';
}
$('#replay').onclick = () => location.reload();

/* ============================================================ 拾取与交互 */
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function pickAt(ev) {
  pointer.x = (ev.clientX / innerWidth) * 2 - 1;
  pointer.y = -(ev.clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(scene.children, true);
  for (const hit of hits) {
    if (hit.object.userData.pickHero) return { type: 'hero', hero: hit.object.userData.pickHero };
    if (hit.object.userData.pick && hit.object.userData.pick.type === 'pad') return hit.object.userData.pick;
  }
  return null;
}

canvas.addEventListener('pointermove', ev => {
  const hit = pickAt(ev);
  let hover = null;
  if (hit && hit.type === 'hero' && !hit.hero.dead) hover = hit.hero;
  ui.hover = hover;
  const padHover = hit && hit.type === 'pad' && hit.side === 0 && !!ui.summoningJade;
  canvas.style.cursor = (hover || padHover) ? 'pointer' : '';
});

canvas.addEventListener('pointerdown', ev => {
  if (ev.button !== 0 || playing || game.over) return;
  const hit = pickAt(ev);
  if (!hit) {
    if (ui.pending) cancelPending();
    else if (ui.summoningJade) cancelSummon();
    else { ui.selected = null; renderPanel(); }
    return;
  }
  if (hit.type === 'hero') {
    const h = hit.hero;
    if (h.dead) return;
    if (ui.pending) { clickTarget(h); renderPanel(); return; }
    ui.selected = h; // 召唤选择保持不变，点角色只查看信息
    sfx.select();
    renderPanel();
    return;
  }
  if (hit.type === 'pad') {
    if (hit.side !== 0) return;
    clickOwnPad(hit.lane);
  }
});

function clickOwnPad(lane) {
  if (ui.summoningJade) {
    if (game.you.lanes[lane].length >= LANE_CAP) { warn('该战线已有英雄驻守'); return; }
    const j = ui.summoningJade;
    ui.summoningJade = null;
    playerSummon(j, lane);
    msg(game.you.freeSummon > 0 ? '海蕴生机：选择一颗就绪的召唤玉，免费召唤' : '');
    afterAction();
  }
}

addEventListener('keydown', ev => {
  if (ev.key === 'Escape') {
    if (!$('#codex').classList.contains('hidden')) { $('#codex').classList.add('hidden'); return; }
    cancelPending(); cancelSummon();
  }
});

/* ============================================================ 高亮圈（可选目标脉冲） */
const targetRing = (() => {
  const m = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.045, 10, 48),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.rotation.x = Math.PI / 2;
  m.visible = false;
  scene.add(m);
  return m;
})();

/* ============================================================ 初始化 */
initGame();
attachVisual(game.you.base).heroRef = game.you.base;
attachVisual(game.ene.base).heroRef = game.ene.base;
refreshTopbar();
refreshJadebar();
renderPanel();
renderHand();
msg('点击下方召唤玉，召唤你的第一位英雄');

// 补充 heroRef（attachVisual 内没有 hero 引用时用于标签渲染）
function ensureHeroRefs() {
  for (const s of [game.you, game.ene]) {
    for (const h of allHeroes(s)) {
      const v = visuals.get(h.uid);
      if (v && !v.heroRef) v.heroRef = h;
    }
    const vb = visuals.get(s.base.uid);
    if (vb && !vb.heroRef) vb.heroRef = s.base;
  }
}

/* ============================================================ 主循环 */
const clock = new THREE.Clock();
let elapsed = 0;

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;

  // 法阵旋转 + 呼吸
  for (let side = 0; side < 2; side++) {
    for (const g of pads[side]) {
      g.userData.disc.rotation.z += g.userData.spin * dt;
      const breathe = 0.5 + Math.sin(elapsed * 1.6 + g.userData.lane) * 0.1;
      g.userData.disc.material.opacity = ui.summoningJade && side === 0 ? 0.85 : breathe;
      g.userData.ring.material.opacity = ui.summoningJade && side === 0
        ? 0.8 + Math.sin(elapsed * 6) * 0.2 : 0.55;
    }
  }

  ensureHeroRefs();

  // 相机震动
  if (shakeLeft > 0) {
    shakeLeft -= dt;
    const k = shakeAmp * Math.max(0, shakeLeft) * 4;
    camera.position.set(
      camBasePos.x + (Math.random() - 0.5) * k,
      camBasePos.y + (Math.random() - 0.5) * k,
      camBasePos.z + (Math.random() - 0.5) * k * 0.4
    );
    if (shakeLeft <= 0) { shakeAmp = 0; camera.position.copy(camBasePos); }
  }

  // 角色悬浮动画 / 悬停抬升 / 选中光盘
  for (const [uid, v] of visuals) {
    const h = v.heroRef;
    if (!h) continue;
    const g = v.group;
    if (g.userData.spinPart) g.userData.spinPart.rotation.y += dt * 1.4;
    if (g.userData.ringPart) g.userData.ringPart.rotation.z += dt * 0.9;
    if (v.punch > 0.01 && !h.dead) { // 受击弹缩
      g.scale.setScalar(1 + v.punch * 0.13);
      v.punch *= Math.pow(0.0001, dt);
    } else if (v.punch) { v.punch = 0; if (!h.dead) g.scale.setScalar(1); }
    if (!h.isBase && !playing) {
      const targetLift = (ui.hover === h || ui.selected === h) ? 0.22 : 0;
      v.lift += (targetLift - v.lift) * Math.min(1, dt * 10);
      const bob = Math.sin(elapsed * 2 + v.phase) * 0.04;
      const basePos = heroWorldPos(h);
      g.position.y = basePos.y + v.lift + bob;
    }
    if (g.userData.under) {
      const active = ui.selected === h || ui.hover === h;
      g.userData.under.material.opacity = active ? 0.55 : (h.isBase ? 0.14 : 0.22);
    }
  }

  // 目标指示环：悬停在合法目标上时套圈
  if (ui.pending && ui.hover && !ui.hover.dead) {
    const bad = pendingHeroError(ui.hover);
    const v = visuals.get(ui.hover.uid);
    if (!bad && v) {
      targetRing.visible = true;
      targetRing.position.copy(v.group.position);
      targetRing.position.y = TOP_Y + 0.1;
      const s = (ui.hover.isBase ? 1.9 : 1) * (1 + Math.sin(elapsed * 7) * 0.08);
      targetRing.scale.setScalar(s);
      targetRing.material.color.setHex(0xff5265);
    } else targetRing.visible = false;
  } else targetRing.visible = false;

  // 梦想卡漂浮
  dreamCards.forEach((m, i) => {
    m.position.y += Math.sin(elapsed * 0.6 + i * 2) * 0.002;
    m.rotation.z = Math.sin(elapsed * 0.35 + i) * 0.03;
  });
  nebulas.forEach((sp, i) => { sp.material.opacity = 0.13 + Math.sin(elapsed * 0.4 + i * 1.9) * 0.04; });
  nebulaMat.uniforms.t.value = elapsed;
  updateParticles(dt);
  dust.update(dt, elapsed);

  updateLabels();
  POST.render();
}
tick();

/* ============================================================ 角色百科 */
const hexCss = c => '#' + c.toString(16).padStart(6, '0');
let cxSel = 'WORLD';

function cxHeroHtml(d) {
  const kc = KEI[d.kei].color;
  let html = `<div class="cxd">
    <h1><span style="color:${hexCss(d.color)}">${d.name}</span>
      <span class="chip" style="--kc:${kc}">${KEI[d.kei].name}</span></h1>
    <div class="en">${d.title} · ${d.id.toUpperCase()}</div>
    <div class="lore"><p>${d.lore}</p></div>
    <div class="cx-src">设定来源：${d.src}</div>
    <h2>数值</h2>
    <div class="cost-line">召唤费用 <b>${d.cost}</b> 点 · 阵亡后费用累加、冷却递增，经验由召唤玉保留</div>
    <div class="p-stats">
      ${statCell('hp', '生命', d.hp)}${statCell('atk', '攻击', d.gp)}${statCell('def', '防御', d.fp)}
    </div>
    <h2>技能</h2>`;
  if (d.passive) {
    html += `<div class="act skill ro passive-skill">
      <span class="sk-head"><span class="sk-nm">${d.passive.name}</span><span class="sk-cost">被动</span></span>
      <span class="sk-desc">${d.passive.desc}</span></div>`;
  }
  d.skills.forEach((sk, i) => {
    html += `<div class="act skill ro">
      <span class="sk-head"><span class="sk-nm">${sk.name}</span><span class="sk-cost">${skillCostText(d, d.costs, i)} MP</span></span>
      <span class="sk-desc">${sk.desc}</span></div>`;
  });
  html += `<h2>语录</h2>
    <div class="quote"><span class="ql">登场</span><span class="qt">「${d.lines.summon}」</span></div>`;
  for (const q of d.lines.extra) {
    html += `<div class="quote"><span class="ql">${q.label}</span><span class="qt">「${q.text}」</span></div>`;
  }
  html += `<div class="quote"><span class="ql">阵亡</span><span class="qt">「${d.lines.die}」</span></div>
  </div>`;
  return html;
}

function cxWorldHtml() {
  return `<div class="cxd">
    <h1><span>拉文德市</span></h1>
    <div class="en">LAVENDER CITY · FREIN</div>
    <div class="lore">${WORLD.lore.map(p => `<p>${p}</p>`).join('')}</div>
  </div>`;
}

function cxCardsHtml() {
  const row = (id) => {
    const d = CARDS[id];
    return `<div class="cx-card ${d.kind}${d.passive ? ' passive' : ''}">
      <span class="tc-ic">${cardSvg(id)}</span>
      <span class="tc-main">
        <span class="tc-nm">${d.name}<em>${d.en}</em>${d.passive ? '<i>持有</i>' : ''}</span>
        <span class="tc-desc">${d.desc}</span>
      </span></div>`;
  };
  const ids = Object.keys(CARDS);
  return `<div class="cxd">
    <h1><span>召唤战术牌</span></h1>
    <div class="en">SUMMONING STRATEGY</div>
    <div class="lore"><p>2022 年 9 月画在 Illustrator 设计稿里、却一直没有实装的卡牌系统。双方各有一副 32 张的牌库（每种两张）：开局 4 张手牌，每回合开始摸 1 张；一回合内可以打出任意张，但回合结束时手牌不能超过上限（默认 4 张，超出的最早获得的牌会被弃掉）。</p>
    <p>标着「持有」的牌不能打出，放在手里就持续生效；物品卡需要指定一名角色。</p></div>
    <h2>战术牌 · ${ids.filter(i => CARDS[i].kind === 'tac').length}</h2>
    <div class="cx-cards">${ids.filter(i => CARDS[i].kind === 'tac').map(row).join('')}</div>
    <h2>物品卡 · ${ids.filter(i => CARDS[i].kind === 'item').length}</h2>
    <div class="cx-cards">${ids.filter(i => CARDS[i].kind === 'item').map(row).join('')}</div>
  </div>`;
}

function renderCodex() {
  const heroIds = Object.keys(HEROES);
  let html = `<button class="cx-item ${cxSel === 'WORLD' ? 'sel' : ''}" data-id="WORLD" style="--dc:#8b9cff">
    <span class="dot"></span>拉文德市<span class="knd">世界观</span></button>
    <button class="cx-item ${cxSel === 'CARDS' ? 'sel' : ''}" data-id="CARDS" style="--dc:#f6d365">
    <span class="dot"></span>召唤战术牌<span class="knd">卡牌</span></button>
    <div class="cx-sep">英雄 · ${heroIds.length}</div>`;
  for (const id of heroIds) {
    const d = HEROES[id];
    html += `<button class="cx-item ${cxSel === id ? 'sel' : ''}" data-id="${id}" style="--dc:${hexCss(d.color)}">
      <span class="dot"></span>${d.name}<span class="knd">${KEI[d.kei].name}</span></button>`;
  }
  $('#cxList').innerHTML = html;
  $('#cxList').querySelectorAll('.cx-item').forEach(b => {
    b.onclick = () => { cxSel = b.dataset.id; sfx.select(); renderCodex(); };
  });
  $('#cxDetail').innerHTML = cxSel === 'WORLD' ? cxWorldHtml() : cxSel === 'CARDS' ? cxCardsHtml() : cxHeroHtml(HEROES[cxSel]);
  $('#cxDetail').scrollTop = 0;
}

$('#codexBtn').onclick = () => { $('#codex').classList.remove('hidden'); sfx.jade(); renderCodex(); };
$('#codexClose').onclick = () => { $('#codex').classList.add('hidden'); sfx.select(); };

// 无头测试钩子
window.__g = {
  game, ui,
  jade: i => clickJade(game.you.jades[i], document.querySelectorAll('.jade')[i]),
  pad: lane => clickOwnPad(lane),
  select: h => { ui.selected = h; renderPanel(); },
  cmd: (h, c) => clickCommand(h, c),
  target: h => clickTarget(h),
  card: i => clickHandCard(i),
  end: () => $('#endTurn').click(),
  playing: () => playing,
};

// 无头视觉验证：window.__shot('name') 把当前帧 POST 到 serve.js 的 /shot
window.__shot = (name = 'shot') => {
  POST.render();
  const data = canvas.toDataURL('image/jpeg', 0.85);
  return fetch('/shot', { method: 'POST', body: JSON.stringify({ name, data }) }).then(r => r.text());
};
