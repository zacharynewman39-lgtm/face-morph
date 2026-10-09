import { FaceLandmarker } from './vendor/vision_bundle.mjs';

// ---------------------------------------------------------------- settings

// [key, label, tooltip, min, max]
const GROUPS = [
  { name: 'Jaw & chin', open: true, items: [
    ['jawWidth', 'Jaw width', 'Wider, stronger jaw', -100, 100],
    ['jawSquare', 'Jaw angle', 'Squarer, sharper jaw corners', -100, 100],
    ['chinLength', 'Chin length', 'Longer chin (left = shorter)', -100, 100],
    ['chinWidth', 'Chin width', 'Wider chin (left = narrower)', -100, 100],
  ] },
  { name: 'Cheeks & face', open: true, items: [
    ['cheekHollow', 'Hollow cheeks', 'Pulls in and shades the area under the cheekbones', -100, 100],
    ['cheekbones', 'Cheekbones', 'Wider, higher cheekbones', -100, 100],
    ['foreheadSmall', 'Smaller forehead', 'Lowers the hairline (left = taller forehead)', -100, 100],
    ['midface', 'Compact midface', 'Moves the mouth up for a shorter midface', -100, 100],
  ] },
  { name: 'Eyes & brows', open: true, items: [
    ['hunter', 'Hunter eyes', 'Lower upper lids, lifted outer corners, heavier brows', -100, 100],
    ['tilt', 'Canthal tilt', 'Lifts the outer corners of the eyes', -100, 100],
    ['eyeSize', 'Eye size', 'Bigger or smaller eyes', -100, 100],
    ['browLow', 'Lower brows', 'Moves brows down closer to the eyes', -100, 100],
    ['underEye', 'Fix under-eye bags', 'Brightens dark circles', 0, 100],
    ['eyeWhite', 'Whiter eyes', 'Brighter, clearer eye whites', 0, 100],
    ['limbal', 'Limbal ring', 'Dark ring around the iris', 0, 100],
    ['irisAmt', 'Eye color strength', 'How strongly the eye color below is applied', 0, 100],
  ] },
  { name: 'Nose & lips', items: [
    ['noseSlim', 'Slimmer nose', 'Narrower nostrils (left = wider)', -100, 100],
    ['noseShort', 'Shorter nose', 'Raises the nose tip (left = longer)', -100, 100],
    ['lips', 'Fuller lips', 'Fuller lips (left = thinner)', -100, 100],
    ['mouthWidth', 'Mouth width', 'Wider mouth', -100, 100],
    ['lipColor', 'Lip color', 'Healthier, redder lips', 0, 100],
  ] },
  { name: 'Skin & color', open: true, items: [
    ['smooth', 'Smooth skin', 'Clears blemishes and texture', 0, 100],
    ['tan', 'Tan', 'Tanned skin (left = paler)', -100, 100],
    ['contour', 'Contour shadows', 'Shadows under cheekbones and jaw for definition', 0, 100],
    ['highlight', 'Highlights', 'Glow on cheekbones, nose bridge and chin', 0, 100],
    ['sharp', 'Definition', 'Sharper, crisper detail', 0, 100],
    ['bright', 'Brightness', '', -100, 100],
    ['contrast', 'Contrast', '', -100, 100],
    ['saturation', 'Saturation', '', -100, 100],
    ['warmth', 'Warmth', '', -100, 100],
  ] },
];

const EYE_COLORS = {
  none: null,
  ice: [0.62, 0.82, 1.0],
  blue: [0.25, 0.5, 0.95],
  green: [0.35, 0.72, 0.42],
  hazel: [0.62, 0.5, 0.25],
  grey: [0.62, 0.68, 0.72],
  brown: [0.36, 0.22, 0.12],
};

const PRESETS = {
  'Reset': {},
  'Natural': { jawWidth: 25, jawSquare: 20, cheekHollow: 30, cheekbones: 20, hunter: 25, tilt: 20,
    underEye: 40, eyeWhite: 30, smooth: 35, contour: 30, highlight: 20, sharp: 20, limbal: 20 },
  'Model': { jawWidth: 50, jawSquare: 40, chinLength: 15, cheekHollow: 60, cheekbones: 45, foreheadSmall: 20,
    midface: 20, hunter: 50, tilt: 35, browLow: 25, underEye: 50, eyeWhite: 40, limbal: 40, noseSlim: 30,
    lips: 20, lipColor: 25, smooth: 50, tan: 25, contour: 60, highlight: 35, sharp: 30, contrast: 10, warmth: 10 },
  'Hunter eyes': { hunter: 90, tilt: 60, browLow: 50, underEye: 50, eyeWhite: 40, limbal: 40 },
  'Max mog': { jawWidth: 70, jawSquare: 65, chinLength: 25, chinWidth: 20, cheekHollow: 80, cheekbones: 60,
    foreheadSmall: 35, midface: 30, hunter: 80, tilt: 60, browLow: 45, underEye: 60, eyeWhite: 50,
    limbal: 55, noseSlim: 40, noseShort: 20, lips: 25, lipColor: 30, smooth: 50, tan: 40, contour: 85,
    highlight: 45, sharp: 40, contrast: 15, warmth: 10, saturation: 10 },
};

const SETTINGS_KEY = 'facemorph.settings.v1';
const values = {};
let eyeColor = 'none';
for (const g of GROUPS) for (const [k] of g.items) values[k] = 0;

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    if (!saved) return;
    for (const k in values) if (typeof saved.values?.[k] === 'number') values[k] = saved.values[k];
    if (saved.eyeColor in EYE_COLORS) eyeColor = saved.eyeColor;
  } catch { /* storage unavailable */ }
}
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ values, eyeColor })); } catch { /* ignore */ }
}

// ---------------------------------------------------------------- landmarks

const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377,
  152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
const EYE_R = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
const EYE_L = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466];
const BROW_R = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46];
const BROW_L = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276];
const LIPS = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185];
const JAW_LOW = [172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397];

// Each entry: [landmark ids, outward, downward, radius] in face-width units, applied per unit of slider.
// "outward" points away from the face's vertical midline, so one entry covers both sides.
const SHAPES = {
  jawWidth: [
    [[58, 288], 0.025, 0, 0.09], [[172, 397], 0.05, 0.01, 0.09], [[136, 365], 0.05, 0.005, 0.09],
    [[150, 379], 0.03, 0, 0.08], [[149, 378], 0.015, 0, 0.07],
  ],
  jawSquare: [
    [[150, 379], 0.04, 0.02, 0.08], [[149, 378], 0.03, 0.025, 0.08],
    [[136, 365], 0.01, 0.02, 0.08], [[176, 400], 0.02, 0.02, 0.07],
  ],
  chinLength: [
    [[152], 0, 0.05, 0.1], [[148, 377, 176, 400], 0, 0.04, 0.1], [[175], 0, 0.03, 0.08],
  ],
  chinWidth: [[[148, 377], 0.03, 0, 0.07], [[176, 400], 0.025, 0, 0.07]],
  cheekHollow: [
    [[187, 411], -0.035, 0, 0.09], [[147, 376], -0.04, 0, 0.09], [[213, 433], -0.035, 0, 0.09],
    [[192, 416], -0.025, 0, 0.08], [[207, 427], -0.02, 0, 0.07],
  ],
  cheekbones: [
    [[227, 447], 0.03, -0.01, 0.09], [[116, 345], 0.02, -0.015, 0.08], [[123, 352], 0.03, -0.005, 0.09],
  ],
  foreheadSmall: [
    [[10], 0, 0.045, 0.14], [[109, 338], 0, 0.04, 0.13], [[67, 297], 0, 0.035, 0.12], [[103, 332], 0, 0.03, 0.11],
  ],
  midface: [
    [[61, 291, 0, 17, 13, 14, 37, 267, 84, 314, 40, 270, 91, 321], 0, -0.02, 0.07], [[2, 94], 0, -0.008, 0.05],
  ],
  hunter: [
    [[33, 263], 0, -0.015, 0.035], [[159, 386], 0, 0.02, 0.035], [[158, 385, 160, 387], 0, 0.017, 0.035],
    [[157, 384, 161, 388], 0, 0.011, 0.03], [[145, 374], 0, -0.006, 0.03],
    [[105, 334, 66, 296, 52, 282, 53, 283, 65, 295], 0, 0.02, 0.05], [[63, 293], 0, 0.018, 0.05],
    [[107, 336, 70, 300], 0, 0.013, 0.05],
  ],
  tilt: [
    [[33, 263, 130, 359], 0, -0.03, 0.04], [[246, 466, 7, 249], 0, -0.018, 0.035], [[133, 362], 0, 0.008, 0.03],
  ],
  browLow: [[[...BROW_R, ...BROW_L], 0, 0.025, 0.05]],
  noseSlim: [
    [[129, 358, 98, 327, 64, 294], -0.02, 0, 0.045], [[48, 278, 219, 439, 102, 331], -0.015, 0, 0.045],
  ],
  noseShort: [[[1, 4], 0, -0.02, 0.05], [[2, 94], 0, -0.012, 0.045], [[19], 0, -0.015, 0.045]],
  lips: [
    [[0, 37, 267, 39, 269, 40, 270], 0, -0.012, 0.04], [[185, 409], 0, -0.008, 0.04],
    [[17, 84, 314, 181, 405, 91, 321], 0, 0.014, 0.04],
  ],
  mouthWidth: [[[61, 291], 0.02, 0, 0.045], [[185, 409, 146, 375], 0.01, 0, 0.04]],
};

// ---------------------------------------------------------------- DOM

const $ = (id) => document.getElementById(id);
const glCanvas = $('gl');
const overlay = $('overlay');
const octx = overlay.getContext('2d');
const viewport = $('viewport');
const statusEl = $('status');
const setStatus = (t) => { statusEl.textContent = t; };

const video = document.createElement('video');
video.playsInline = true;
video.muted = true;
video.loop = false;
let image = null;
let sourceKind = null; // 'cam' | 'video' | 'image'
let camStream = null;

// ---------------------------------------------------------------- UI build

const sliderEls = {};
function buildUI() {
  const host = $('sliders');
  for (const g of GROUPS) {
    const det = document.createElement('details');
    det.open = !!g.open;
    det.innerHTML = `<summary>${g.name}</summary>`;
    for (const [key, label, tip, min, max] of g.items) {
      const row = document.createElement('div');
      row.className = 'slider';
      row.innerHTML = `<span${tip ? ` title="${tip}"` : ''}>${label}</span>` +
        `<input type="range" min="${min}" max="${max}" step="1"><output></output>`;
      const input = row.querySelector('input');
      const out = row.querySelector('output');
      input.addEventListener('input', () => { values[key] = +input.value; out.textContent = input.value; saveSettings(); });
      input.addEventListener('dblclick', () => { values[key] = 0; refreshUI(); saveSettings(); });
      sliderEls[key] = { input, out };
      det.appendChild(row);
      if (key === 'irisAmt') det.appendChild(buildEyeColors());
    }
    host.appendChild(det);
  }
  const presets = $('presets');
  for (const name of Object.keys(PRESETS)) {
    const b = document.createElement('button');
    b.textContent = name;
    b.onclick = () => {
      for (const k in values) values[k] = PRESETS[name][k] || 0;
      if (name === 'Reset') eyeColor = 'none';
      refreshUI(); saveSettings();
    };
    presets.appendChild(b);
  }
  const stab = $('optStab');
  const stabOut = stab.nextElementSibling;
  stab.oninput = () => { stabOut.textContent = stab.value; };
  stab.oninput();
  refreshUI();
}

function buildEyeColors() {
  const wrap = document.createElement('div');
  wrap.className = 'colors';
  wrap.id = 'eyeColors';
  for (const [name, rgb] of Object.entries(EYE_COLORS)) {
    const b = document.createElement('button');
    b.title = name === 'none' ? 'Natural (no change)' : name;
    b.dataset.color = name;
    b.style.background = rgb ? `rgb(${rgb.map((v) => Math.round(v * 255)).join(',')})`
      : 'linear-gradient(135deg, #444 45%, #e55 45%, #e55 55%, #444 55%)';
    b.onclick = () => {
      eyeColor = name;
      if (rgb && values.irisAmt === 0) values.irisAmt = 60;
      refreshUI(); saveSettings();
    };
    wrap.appendChild(b);
  }
  return wrap;
}

function refreshUI() {
  for (const k in sliderEls) {
    sliderEls[k].input.value = values[k];
    sliderEls[k].out.textContent = values[k];
  }
  for (const b of document.querySelectorAll('#eyeColors button')) b.classList.toggle('active', b.dataset.color === eyeColor);
}

// ---------------------------------------------------------------- WebGL

const MAXB = 40;
const GRID = 128;

const VS = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() { vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5); gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FS = `#version 300 es
precision highp float;
#define MAXB ${MAXB}
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex, uMask, uDisp;
uniform vec2 uRes;
uniform vec4 uBox;          // displacement grid origin.xy, size.xy (pixels)
uniform int uNB;
uniform vec4 uBlob[MAXB];   // pos.xy, radius, strength
uniform vec3 uIris[2];      // center.xy, radius
uniform vec3 uIrisTint;
uniform float uIrisAmt, uLimbal, uEyeWhite, uLipColor;
uniform float uSmooth, uTan, uSharp, uBright, uContrast, uSat, uWarm;
uniform vec2 uFaceC;
uniform float uFaceW, uHasFace;
uniform vec2 uSplit;        // x position (px), direction (+1 before on left, -1 before on right, 0 off)

vec3 tex(vec2 p) { return texture(uTex, p / uRes).rgb; }
const vec3 LUM = vec3(0.299, 0.587, 0.114);

void main() {
  vec2 p = vUv * uRes;
  if (uSplit.y != 0.0) {
    float s = (p.x - uSplit.x) * uSplit.y;
    if (abs(s) < 1.5) { outColor = vec4(1.0); return; }
    if (s < 0.0) { outColor = vec4(tex(p), 1.0); return; }
  }
  vec2 q = p;
  vec2 g = (p - uBox.xy) / uBox.zw;
  if (uHasFace > 0.5 && all(greaterThan(g, vec2(0.0))) && all(lessThan(g, vec2(1.0)))) {
    q -= texture(uDisp, g).rg;
  }
  vec3 c = tex(q);
  if (uHasFace < 0.5) { outColor = vec4(c, 1.0); return; }

  vec4 m = texture(uMask, q / uRes);
  float skin = m.r, eye = m.g, lip = m.b;

  if (uSmooth > 0.001 && skin > 0.01) {
    float rad = uFaceW * 0.016;
    vec3 sum = c; float ws = 1.0;
    for (int k = 0; k < 20; k++) {
      float fk = float(k);
      float ang = fk * 2.39996;
      vec2 o = vec2(cos(ang), sin(ang)) * rad * sqrt((fk + 0.5) / 20.0);
      vec3 s = tex(q + o);
      vec3 d = s - c;
      float w = exp(-dot(d, d) * 60.0);
      sum += s * w; ws += w;
    }
    c = mix(c, sum / ws, clamp(uSmooth * skin, 0.0, 1.0));
  }

  if (uSharp > 0.001) {
    vec3 b = (tex(q + vec2(1.5, 0.0)) + tex(q - vec2(1.5, 0.0)) + tex(q + vec2(0.0, 1.5)) + tex(q - vec2(0.0, 1.5))) * 0.25;
    c += (c - b) * uSharp * 2.5 * (1.0 - 0.8 * skin * step(0.001, uSmooth));
  }

  float sh = 0.0;
  for (int i = 0; i < MAXB; i++) {
    if (i >= uNB) break;
    vec2 d = q - uBlob[i].xy;
    sh += uBlob[i].w * exp(-dot(d, d) / (uBlob[i].z * uBlob[i].z));
  }
  sh = clamp(sh, -0.6, 0.6);
  if (sh < 0.0) c *= 1.0 + sh * vec3(0.9, 1.0, 1.1);
  else c += (1.0 - c) * sh * 0.5 + c * sh * 0.25;

  if (uTan != 0.0) {
    float cb = -0.1687 * c.r - 0.3313 * c.g + 0.5 * c.b;
    float cr = 0.5 * c.r - 0.4187 * c.g - 0.0813 * c.b;
    float skinCol = smoothstep(0.015, 0.05, cr) * smoothstep(0.24, 0.16, cr) * smoothstep(-0.22, -0.12, cb) * smoothstep(0.04, -0.01, cb);
    vec2 fd = (q - uFaceC) / uFaceW;
    float region = exp(-dot(fd, fd) / 1.6);
    float w = max(skin, skinCol * region);
    vec3 k = uTan > 0.0 ? vec3(0.16, 0.3, 0.5) : vec3(0.4, 0.38, 0.33);
    c = mix(c, pow(max(c, 0.0), 1.0 + uTan * k), w);
  }

  if (eye > 0.01) {
    float irisW = 0.0;
    for (int j = 0; j < 2; j++) {
      float d = length(q - uIris[j].xy) / max(uIris[j].z, 1.0);
      float iw = smoothstep(1.05, 0.85, d) * eye;
      irisW = max(irisW, iw);
      if (uIrisAmt > 0.001) {
        float pupil = smoothstep(0.42, 0.3, d);
        float l = dot(c, LUM);
        vec3 tinted = uIrisTint * (0.25 + 1.7 * l);
        c = mix(c, tinted, iw * (1.0 - pupil) * uIrisAmt * 0.7);
      }
      c *= 1.0 - uLimbal * 0.6 * smoothstep(0.72, 0.95, d) * smoothstep(1.2, 0.98, d) * eye;
    }
    float l = dot(c, LUM);
    vec3 white = min(mix(c, vec3(l), 0.55) * 1.18 + 0.04, vec3(1.0));
    c = mix(c, white, uEyeWhite * eye * (1.0 - irisW));
  }

  if (lip > 0.01 && uLipColor > 0.001) {
    float a = uLipColor * lip;
    c = vec3(c.r * (1.0 + 0.12 * a) + 0.03 * a, c.g * (1.0 - 0.1 * a), c.b * (1.0 - 0.06 * a));
  }

  c += uBright * 0.12;
  c = (c - 0.5) * (1.0 + uContrast * 0.45) + 0.5;
  c = mix(vec3(dot(c, LUM)), c, 1.0 + uSat * 0.8);
  c += vec3(0.05, 0.01, -0.05) * uWarm;
  outColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

let gl, prog, uni = {}, texSrc, texMask, texDisp;
const maskCanvas = document.createElement('canvas');
const mctx = maskCanvas.getContext('2d');
const dispData = new Float32Array(GRID * GRID * 2);
const dispW = new Float32Array(GRID * GRID);

function initGL() {
  gl = glCanvas.getContext('webgl2', { preserveDrawingBuffer: true, premultipliedAlpha: false, antialias: false });
  if (!gl) throw new Error('Your browser does not support WebGL2. Please use a recent Chrome, Edge, Firefox or Safari.');
  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const name = gl.getActiveUniform(prog, i).name.replace(/\[0\]$/, '');
    uni[name] = gl.getUniformLocation(prog, name);
  }
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const mk = (filter) => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  texSrc = mk(gl.LINEAR);
  texMask = mk(gl.LINEAR);
  texDisp = mk(gl.LINEAR);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.uniform1i(uni.uTex, 0);
  gl.uniform1i(uni.uMask, 1);
  gl.uniform1i(uni.uDisp, 2);
}

// ---------------------------------------------------------------- tracking

let landmarker = null;

async function initTracker() {
  const base = new URL('vendor/', location.href).href;
  const fileset = {
    wasmLoaderPath: base + 'wasm/vision_wasm_internal.js',
    wasmBinaryPath: base + 'wasm/vision_wasm_internal.wasm',
  };
  const opts = (delegate) => ({
    baseOptions: { modelAssetPath: base + 'face_landmarker.task', delegate },
    runningMode: 'VIDEO',
    numFaces: 1,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  try {
    landmarker = await FaceLandmarker.createFromOptions(fileset, opts('GPU'));
  } catch (e) {
    console.warn('GPU tracker unavailable, using CPU', e);
    landmarker = await FaceLandmarker.createFromOptions(fileset, opts('CPU'));
  }
}

let pts = null;        // smoothed landmarks in canvas pixels, Float32Array(n*2)
let lastTs = -1;
let lastVideoTime = -1;
let imageDetected = false;

function track() {
  if (!landmarker || !sourceKind) return;
  const el = sourceKind === 'image' ? image : video;
  if (sourceKind === 'image') {
    if (imageDetected) return;
  } else {
    if (video.readyState < 2) return;
    if (video.currentTime === lastVideoTime) return;
    if (Math.abs(video.currentTime - lastVideoTime) > 0.5) pts = null; // seek: don't smooth across the jump
    lastVideoTime = video.currentTime;
  }
  let ts = performance.now();
  if (ts <= lastTs) ts = lastTs + 1;
  lastTs = ts;
  const res = landmarker.detectForVideo(el, ts);
  const lm = res.faceLandmarks?.[0];
  if (sourceKind === 'image') imageDetected = true;
  if (!lm) { pts = null; return; }

  const W = glCanvas.width, H = glCanvas.height;
  const raw = new Float32Array(lm.length * 2);
  for (let i = 0; i < lm.length; i++) { raw[2 * i] = lm[i].x * W; raw[2 * i + 1] = lm[i].y * H; }
  if (!pts || pts.length !== raw.length || sourceKind === 'image') { pts = raw; return; }
  const faceW = Math.hypot(raw[454 * 2] - raw[234 * 2], raw[454 * 2 + 1] - raw[234 * 2 + 1]) || 1;
  let motion = 0;
  for (let i = 0; i < raw.length; i++) motion += Math.abs(raw[i] - pts[i]);
  motion /= raw.length * faceW;
  const stab = +$('optStab').value / 100;
  const alpha = Math.min(1, (1 - 0.88 * stab) + motion * 30);
  for (let i = 0; i < raw.length; i++) pts[i] += (raw[i] - pts[i]) * alpha;
}

// ---------------------------------------------------------------- warp + effects

const P = (i) => [pts[2 * i], pts[2 * i + 1]];
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

function faceFrame() {
  const a = P(234), b = P(454);
  const W = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const ax = [(b[0] - a[0]) / W, (b[1] - a[1]) / W];
  const ay = [-ax[1], ax[0]];
  const C = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  return { W, ax, ay, C };
}

function buildControls(F) {
  const { W, ax, ay, C } = F;
  const acc = new Map(); // landmark -> [dx, dy, r]
  const add = (i, dx, dy, r) => {
    const e = acc.get(i);
    if (e) { e[0] += dx; e[1] += dy; e[2] = Math.max(e[2], r); } else acc.set(i, [dx, dy, r]);
  };
  for (const key in SHAPES) {
    const v = values[key] / 100;
    if (!v) continue;
    for (const [ids, out, down, r] of SHAPES[key]) {
      for (const i of ids) {
        const p = P(i);
        const side = Math.sign((p[0] - C[0]) * ax[0] + (p[1] - C[1]) * ax[1]);
        const o = out * side * v * W, d = down * v * W;
        add(i, o * ax[0] + d * ay[0], o * ax[1] + d * ay[1], r * W);
      }
    }
  }
  const es = values.eyeSize / 100;
  if (es) {
    for (const eye of [EYE_R, EYE_L]) {
      let cx = 0, cy = 0;
      for (const i of eye) { cx += pts[2 * i]; cy += pts[2 * i + 1]; }
      cx /= eye.length; cy /= eye.length;
      for (const i of eye) add(i, (pts[2 * i] - cx) * 0.3 * es, (pts[2 * i + 1] - cy) * 0.3 * es, 0.04 * W);
    }
  }
  return acc;
}

// Inverse-warp displacement field over a box around the face: for an output pixel p,
// the source pixel is p - D(p), with D a normalized sum of Gaussians centred on the moved points.
function buildDisplacement(F) {
  const acc = buildControls(F);
  const S = F.W * 2.2;
  const box = [F.C[0] - S / 2, F.C[1] - S / 2 + F.W * 0.1, S, S];
  dispData.fill(0);
  dispW.fill(0);
  const cell = S / GRID;
  for (const [i, [dx, dy, r]] of acc) {
    const tx = pts[2 * i] + dx, ty = pts[2 * i + 1] + dy;
    const reach = r * 2.8;
    const gx0 = Math.max(0, Math.floor((tx - reach - box[0]) / cell));
    const gx1 = Math.min(GRID - 1, Math.ceil((tx + reach - box[0]) / cell));
    const gy0 = Math.max(0, Math.floor((ty - reach - box[1]) / cell));
    const gy1 = Math.min(GRID - 1, Math.ceil((ty + reach - box[1]) / cell));
    const inv = 1 / (r * r);
    for (let gy = gy0; gy <= gy1; gy++) {
      const py = box[1] + (gy + 0.5) * cell - ty;
      for (let gx = gx0; gx <= gx1; gx++) {
        const px = box[0] + (gx + 0.5) * cell - tx;
        const w = Math.exp(-(px * px + py * py) * inv);
        const k = gy * GRID + gx;
        dispData[2 * k] += w * dx;
        dispData[2 * k + 1] += w * dy;
        dispW[k] += w;
      }
    }
  }
  for (let k = 0; k < GRID * GRID; k++) {
    if (dispW[k] > 1) { dispData[2 * k] /= dispW[k]; dispData[2 * k + 1] /= dispW[k]; }
  }
  return box;
}

function buildBlobs(F) {
  const { W, ay } = F;
  const blobs = [];
  const blob = (p, r, s) => { if (s) blobs.push(p[0], p[1], r * W, s); };
  const c = values.contour / 100, h = Math.max(0, values.cheekHollow / 100);
  const hollow = -(0.22 * c + 0.14 * h);
  for (const [a, b] of [[123, 147], [352, 376]]) {
    for (const t of [0.45, 1]) blob(lerp(P(a), P(b), t), 0.06, hollow * 0.75);
  }
  for (const i of JAW_LOW) {
    const p = P(i);
    blob([p[0] + ay[0] * W * 0.05, p[1] + ay[1] * W * 0.05], 0.05, -0.13 * c);
  }
  const hl = values.highlight / 100;
  for (const i of [117, 346]) { const p = P(i); blob([p[0] - ay[0] * W * 0.015, p[1] - ay[1] * W * 0.015], 0.05, 0.13 * hl); }
  blob(P(6), 0.025, 0.08 * hl);
  blob(P(197), 0.025, 0.08 * hl);
  blob(P(175), 0.035, 0.07 * hl);
  blob(P(151), 0.08, 0.05 * hl);
  const u = values.underEye / 100;
  for (const i of [230, 450]) blob(P(i), 0.035, 0.11 * u);
  for (const i of [231, 451, 229, 449]) blob(P(i), 0.03, 0.06 * u);
  return new Float32Array(blobs.slice(0, MAXB * 4));
}

function drawMask(F) {
  const mw = maskCanvas.width, mh = maskCanvas.height;
  const sx = mw / glCanvas.width, sy = mh / glCanvas.height;
  mctx.clearRect(0, 0, mw, mh);
  const poly = (ids, color, blur) => {
    mctx.filter = blur > 0.3 ? `blur(${blur.toFixed(1)}px)` : 'none';
    mctx.fillStyle = color;
    mctx.beginPath();
    ids.forEach((i, k) => {
      const x = pts[2 * i] * sx, y = pts[2 * i + 1] * sy;
      if (k) mctx.lineTo(x, y); else mctx.moveTo(x, y);
    });
    mctx.closePath();
    mctx.fill();
  };
  const w = F.W * sx;
  poly(FACE_OVAL, '#f00', w * 0.03);
  poly(BROW_R, '#000', w * 0.012);
  poly(BROW_L, '#000', w * 0.012);
  poly(EYE_R, '#0f0', w * 0.004);
  poly(EYE_L, '#0f0', w * 0.004);
  poly(LIPS, '#00f', w * 0.006);
  mctx.filter = 'none';
}

// ---------------------------------------------------------------- render loop

let splitPos = 0.5;

function resizeTo(w, h) {
  const scale = Math.min(1, 1280 / Math.max(w, h));
  const cw = Math.round(w * scale), ch = Math.round(h * scale);
  if (glCanvas.width === cw && glCanvas.height === ch) return;
  glCanvas.width = overlay.width = cw;
  glCanvas.height = overlay.height = ch;
  maskCanvas.width = Math.round(cw / 2);
  maskCanvas.height = Math.round(ch / 2);
  gl.viewport(0, 0, cw, ch);
  pts = null;
}

function render() {
  requestAnimationFrame(render);
  if (!gl || !sourceKind) return;
  const el = sourceKind === 'image' ? image : video;
  const sw = sourceKind === 'image' ? image.naturalWidth : video.videoWidth;
  const sh = sourceKind === 'image' ? image.naturalHeight : video.videoHeight;
  if (!sw || !sh) return;
  resizeTo(sw, sh);
  try { track(); } catch (e) { console.error(e); }

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texSrc);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, el);

  const W = glCanvas.width, H = glCanvas.height;
  gl.uniform2f(uni.uRes, W, H);
  const mirror = $('optMirror').checked;
  if ($('optSplit').checked) {
    const x = (mirror ? 1 - splitPos : splitPos) * W;
    gl.uniform2f(uni.uSplit, x, mirror ? -1 : 1);
  } else {
    gl.uniform2f(uni.uSplit, 0, 0);
  }

  const hasFace = !!pts;
  gl.uniform1f(uni.uHasFace, hasFace ? 1 : 0);
  if (hasFace) {
    const F = faceFrame();
    const box = buildDisplacement(F);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, texDisp);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, GRID, GRID, 0, gl.RG, gl.FLOAT, dispData);
    gl.uniform4f(uni.uBox, ...box);

    drawMask(F);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, texMask);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, maskCanvas);

    const blobs = buildBlobs(F);
    gl.uniform1i(uni.uNB, blobs.length / 4);
    if (blobs.length) gl.uniform4fv(uni.uBlob, blobs);

    const iris = (c, ring) => {
      const p = P(c);
      let r = 0;
      for (const i of ring) r += Math.hypot(pts[2 * i] - p[0], pts[2 * i + 1] - p[1]);
      return [p[0], p[1], r / ring.length];
    };
    gl.uniform3fv(uni.uIris, [...iris(468, [469, 470, 471, 472]), ...iris(473, [474, 475, 476, 477])]);
    const tint = EYE_COLORS[eyeColor];
    gl.uniform3fv(uni.uIrisTint, tint || [0, 0, 0]);
    gl.uniform1f(uni.uIrisAmt, tint ? values.irisAmt / 100 : 0);
    gl.uniform2f(uni.uFaceC, F.C[0] + F.ay[0] * F.W * 0.3, F.C[1] + F.ay[1] * F.W * 0.3);
    gl.uniform1f(uni.uFaceW, F.W);
  }
  const v = (k) => values[k] / 100;
  gl.uniform1f(uni.uLimbal, v('limbal'));
  gl.uniform1f(uni.uEyeWhite, v('eyeWhite'));
  gl.uniform1f(uni.uLipColor, v('lipColor'));
  gl.uniform1f(uni.uSmooth, v('smooth'));
  gl.uniform1f(uni.uTan, v('tan'));
  gl.uniform1f(uni.uSharp, v('sharp'));
  gl.uniform1f(uni.uBright, v('bright'));
  gl.uniform1f(uni.uContrast, v('contrast'));
  gl.uniform1f(uni.uSat, v('saturation'));
  gl.uniform1f(uni.uWarm, v('warmth'));
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  drawOverlay();
  if (!document.body.classList.contains('clean')) {
    if (!landmarker) setStatus('Loading face tracker…');
    else setStatus(hasFace ? '' : 'Looking for a face… face the camera with good lighting');
  }
}

function drawOverlay() {
  octx.clearRect(0, 0, overlay.width, overlay.height);
  if (!pts || !$('optMesh').checked) return;
  octx.fillStyle = 'rgba(120,200,255,0.8)';
  for (let i = 0; i < 468; i++) octx.fillRect(pts[2 * i] - 1, pts[2 * i + 1] - 1, 2, 2);
  const line = (ids, color, close = true) => {
    octx.strokeStyle = color;
    octx.lineWidth = 1.5;
    octx.beginPath();
    ids.forEach((i, k) => (k ? octx.lineTo : octx.moveTo).call(octx, pts[2 * i], pts[2 * i + 1]));
    if (close) octx.closePath();
    octx.stroke();
  };
  line(FACE_OVAL, '#7cf');
  line(EYE_R, '#9f6'); line(EYE_L, '#9f6');
  line(BROW_R, '#fd5'); line(BROW_L, '#fd5');
  line(LIPS, '#f7a');
}

// ---------------------------------------------------------------- sources

function stopCam() {
  if (camStream) camStream.getTracks().forEach((t) => t.stop());
  camStream = null;
}

function resetTracking() {
  pts = null;
  lastVideoTime = -1;
  imageDetected = false;
  $('welcome').hidden = true;
}

async function startCam(deviceId) {
  stopCam();
  if (!navigator.mediaDevices?.getUserMedia) {
    alert('Webcam access needs this page to be opened through the "Start Face Morph" launcher (http://localhost), not as a file.');
    return;
  }
  setStatus('Asking for camera permission…');
  try {
    camStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: deviceId ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
        : { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
    });
  } catch (e) {
    setStatus('');
    alert('Could not open the webcam: ' + e.message + '\n\nAllow camera access in your browser (the camera icon in the address bar) and close other apps using the camera.');
    return;
  }
  video.srcObject = camStream;
  video.loop = false;
  video.muted = true;
  await video.play();
  sourceKind = 'cam';
  resetTracking();
  $('optMirror').checked = true;
  applyMirror();
  $('btnExport').hidden = true;
  const sel = $('camSelect');
  const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
  if (cams.length > 1) {
    const current = camStream.getVideoTracks()[0].getSettings().deviceId;
    sel.innerHTML = cams.map((c, i) => `<option value="${c.deviceId}" ${c.deviceId === current ? 'selected' : ''}>${c.label || 'Camera ' + (i + 1)}</option>`).join('');
    sel.hidden = false;
  }
}

function loadVideoFile(file) {
  stopCam();
  video.srcObject = null;
  video.src = URL.createObjectURL(file);
  video.loop = true;
  video.muted = false;
  video.controls = false;
  sourceKind = 'video';
  resetTracking();
  $('optMirror').checked = false;
  applyMirror();
  $('btnExport').hidden = false;
  $('camSelect').hidden = true;
  video.play().catch(() => { video.muted = true; video.play(); });
}

function loadImageFile(file) {
  stopCam();
  video.pause();
  const img = new Image();
  img.onload = () => {
    image = img;
    sourceKind = 'image';
    resetTracking();
    $('optMirror').checked = false;
    applyMirror();
    $('btnExport').hidden = true;
    $('camSelect').hidden = true;
  };
  img.src = URL.createObjectURL(file);
}

function applyMirror() {
  viewport.classList.toggle('mirror', $('optMirror').checked);
}

// ---------------------------------------------------------------- capture

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

function snapshot() {
  if (!sourceKind) return;
  const c = document.createElement('canvas');
  c.width = glCanvas.width; c.height = glCanvas.height;
  const ctx = c.getContext('2d');
  if ($('optMirror').checked) { ctx.translate(c.width, 0); ctx.scale(-1, 1); }
  ctx.drawImage(glCanvas, 0, 0);
  c.toBlob((b) => download(b, `morph-${stamp()}.png`), 'image/png');
}

let recorder = null;
let audioDest = null;

function pickMime() {
  for (const m of ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']) {
    if (window.MediaRecorder?.isTypeSupported?.(m)) return m;
  }
  return '';
}

function videoAudioTracks() {
  if (sourceKind !== 'video') return [];
  try {
    if (!audioDest) {
      const ac = new AudioContext();
      const src = ac.createMediaElementSource(video);
      audioDest = ac.createMediaStreamDestination();
      src.connect(audioDest);
      src.connect(ac.destination);
    }
    return audioDest.stream.getAudioTracks();
  } catch { return []; }
}

function startRecording(onStop) {
  if (!sourceKind || recorder) return;
  if (!window.MediaRecorder) { alert('Recording is not supported in this browser. Try Chrome or Edge.'); return; }
  const stream = glCanvas.captureStream(30);
  for (const t of videoAudioTracks()) stream.addTrack(t);
  const mime = pickMime();
  const chunks = [];
  recorder = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: 8_000_000 });
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  recorder.onstop = () => {
    const type = recorder.mimeType || mime || 'video/webm';
    download(new Blob(chunks, { type }), `morph-${stamp()}.${type.includes('mp4') ? 'mp4' : 'webm'}`);
    recorder = null;
    $('btnRec').textContent = 'Start recording';
    $('btnRec').classList.remove('rec');
    $('recStatus').textContent = 'Saved to your Downloads folder.';
    onStop?.();
  };
  recorder.start(250);
  $('btnRec').textContent = 'Stop recording';
  $('btnRec').classList.add('rec');
  $('recStatus').textContent = 'Recording…';
}

function stopRecording() { if (recorder?.state === 'recording') recorder.stop(); }

async function exportWholeVideo() {
  if (sourceKind !== 'video' || recorder) return;
  video.pause();
  video.loop = false;
  video.currentTime = 0;
  await new Promise((r) => video.addEventListener('seeked', r, { once: true }));
  pts = null;
  startRecording(() => { video.loop = true; video.play(); });
  $('recStatus').textContent = 'Exporting… let the video play to the end.';
  video.addEventListener('ended', stopRecording, { once: true });
  await video.play();
}

// ---------------------------------------------------------------- wiring

function wire() {
  $('btnCam').onclick = () => startCam();
  $('camSelect').onchange = (e) => startCam(e.target.value);
  $('fileVideo').onchange = (e) => { if (e.target.files[0]) loadVideoFile(e.target.files[0]); e.target.value = ''; };
  $('fileImage').onchange = (e) => { if (e.target.files[0]) loadImageFile(e.target.files[0]); e.target.value = ''; };
  $('optMirror').onchange = applyMirror;
  $('optSplit').onchange = () => { $('splitHandle').hidden = !$('optSplit').checked; placeSplit(); };
  $('btnSnap').onclick = snapshot;
  $('btnRec').onclick = () => (recorder ? stopRecording() : startRecording());
  $('btnExport').onclick = exportWholeVideo;
  $('btnHelp').onclick = () => { $('help').hidden = false; };
  $('helpClose').onclick = () => { $('help').hidden = true; };
  $('btnClean').onclick = () => {
    document.body.classList.add('clean');
    setStatus('');
    document.documentElement.requestFullscreen?.().catch(() => {});
  };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { document.body.classList.remove('clean'); $('help').hidden = true; }
  });
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) document.body.classList.remove('clean');
  });
  glCanvas.addEventListener('click', () => {
    if (sourceKind === 'video' && !recorder) (video.paused ? video.play() : video.pause());
  });

  const handle = $('splitHandle');
  let dragging = false;
  const move = (e) => {
    if (!dragging) return;
    const r = viewport.getBoundingClientRect();
    splitPos = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    placeSplit();
  };
  handle.addEventListener('pointerdown', (e) => { dragging = true; handle.setPointerCapture(e.pointerId); });
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', () => { dragging = false; });
}

function placeSplit() { $('splitHandle').style.left = `${splitPos * 100}%`; }

async function main() {
  loadSettings();
  buildUI();
  wire();
  placeSplit();
  try {
    initGL();
  } catch (e) {
    setStatus('');
    alert(e.message);
    return;
  }
  requestAnimationFrame(render);
  try {
    await initTracker();
    setStatus('');
  } catch (e) {
    console.error(e);
    setStatus('Face tracker failed to load. Open this page with the "Start Face Morph" launcher.');
  }
}

main();
