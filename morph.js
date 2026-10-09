// Anatomy-driven face morphing.
//
// Shape: a forward displacement field is evaluated on a grid around the face, built from
// smooth structural fields in the face's own coordinate frame (jaw, cheeks, chin, forehead,
// midface) and region-weighted local transforms (eyelids, canthal rotation, brows, nose, lips).
// It is then inverted by fixed-point iteration so the shader can sample source pixels exactly.
//
// Shading: anatomically shaped shadows and highlights (cheek hollows under the cheekbone, the
// shadow under the jawline, orbital shadow for deep-set eyes) are painted into a soft map that
// the shader applies multiplicatively, so skin texture and the real lighting are kept.

export const GRID = 160;

const fwd = new Float32Array(GRID * GRID * 2);
export const inv = new Float32Array(GRID * GRID * 2);

const ss = (e0, e1, x) => {
  let t = (x - e0) / (e1 - e0);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return t * t * (3 - 2 * t);
};
const bump = (x, c, w) => { const d = (x - c) / w; return Math.exp(-d * d); };
const sq = (x) => x * x;

export const JAW_CONTOUR = [132, 58, 172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397, 288, 361];

export function faceFrame(pts) {
  const ax0 = pts[454 * 2] - pts[234 * 2], ax1 = pts[454 * 2 + 1] - pts[234 * 2 + 1];
  const W = Math.hypot(ax0, ax1) || 1;
  const ax = [ax0 / W, ax1 / W];
  const ay = [-ax[1], ax[0]];
  const C = [(pts[454 * 2] + pts[234 * 2]) / 2, (pts[454 * 2 + 1] + pts[234 * 2 + 1]) / 2];
  return { W, ax, ay, C };
}

function makeTools(pts, F) {
  const P = (i) => [pts[2 * i], pts[2 * i + 1]];
  const L = (i) => {
    const dx = pts[2 * i] - F.C[0], dy = pts[2 * i + 1] - F.C[1];
    return [(dx * F.ax[0] + dy * F.ax[1]) / F.W, (dx * F.ay[0] + dy * F.ay[1]) / F.W];
  };
  const mean = (ids) => {
    let x = 0, y = 0;
    for (const i of ids) { x += pts[2 * i]; y += pts[2 * i + 1]; }
    return [x / ids.length, y / ids.length];
  };
  return { P, L, mean };
}

function eyeFrame(T, F, inner, outer, up, down, brow) {
  const I = T.P(inner), O = T.P(outer);
  const ex = O[0] - I[0], ey = O[1] - I[1];
  const len = Math.hypot(ex, ey) || 1;
  const e1 = [ex / len, ey / len];
  let n = [-e1[1], e1[0]];
  if (n[0] * F.ay[0] + n[1] * F.ay[1] < 0) n = [-n[0], -n[1]];
  const a = len / 2;
  const U = T.P(up), D = T.P(down);
  const h = Math.max(Math.hypot(U[0] - D[0], U[1] - D[1]) / 2, 0.12 * a);
  // Rotating by +theta moves the outer corner along J(O-I); pick the sign that lifts it (towards -n).
  const jx = -ey, jy = ex;
  const rotSign = jx * n[0] + jy * n[1] > 0 ? -1 : 1;
  return { I, O, c: [(I[0] + O[0]) / 2, (I[1] + O[1]) / 2], e1, n, a, h, rotSign, bc: T.mean(brow) };
}

// ---------------------------------------------------------------- shape field

export function buildField(pts, v, F) {
  const T = makeTools(pts, F);
  const { W, ax, ay, C } = F;
  const k = (key) => (v[key] || 0) / 100;

  // Anatomical levels (face-width units, y down) measured on this face.
  const ly = (ids) => ids.reduce((s, i) => s + T.L(i)[1], 0) / ids.length;
  const alx = (ids) => ids.reduce((s, i) => s + Math.abs(T.L(i)[0]), 0) / ids.length;
  const yE = ly([33, 133, 263, 362]), yT = ly([10]), yB = ly([105, 334]), yN = ly([2]), yM = ly([13, 14]), yC = ly([152]);
  const yG = ly([172, 397]), yZ = ly([123, 352]);
  const hG = alx([172, 397]);
  const yH = (yZ + yM) / 2 + 0.02;
  const yJ = yG * 0.4 + yC * 0.6;

  const jawW = k('jawWidth'), jawS = k('jawSquare'), hol = k('cheekHollow'), bones = k('cheekbones');
  const chinL = k('chinLength'), chinW = k('chinWidth'), fore = k('foreheadSmall'), mid = k('midface');
  const hunter = k('hunter'), tilt = k('tilt'), eyeS = k('eyeSize'), brow = k('browLow');
  const noseS = k('noseSlim'), noseT = k('noseShort'), lips = k('lips'), mouthW = k('mouthWidth');

  const eyes = [
    eyeFrame(T, F, 133, 33, 159, 145, [46, 53, 52, 65, 55, 70, 63, 105, 66, 107]),
    eyeFrame(T, F, 362, 263, 386, 374, [276, 283, 282, 295, 285, 300, 293, 334, 296, 336]),
  ];
  const theta = (tilt * 7 + hunter * 2.5) * Math.PI / 180;
  for (const e of eyes) { e.cos = Math.cos(theta * e.rotSign) - 1; e.sin = Math.sin(theta * e.rotSign); }
  const eyeOn = theta !== 0 || eyeS || hunter || brow;

  const m61 = T.P(61), m291 = T.P(291);
  const mc = T.mean([13, 14]);
  const mlen = Math.hypot(m291[0] - m61[0], m291[1] - m61[1]) || 1;
  const me1 = [(m291[0] - m61[0]) / mlen, (m291[1] - m61[1]) / mlen];
  let mn = [-me1[1], me1[0]];
  if (mn[0] * ay[0] + mn[1] * ay[1] < 0) mn = [-mn[0], -mn[1]];
  const am = mlen / 2;

  const n98 = T.P(98), n327 = T.P(327), tip = T.P(4);
  const an = Math.max(Math.hypot(n327[0] - n98[0], n327[1] - n98[1]) / 2, 0.03 * W);
  const nb = [(n98[0] + n327[0]) / 2, (n98[1] + n327[1]) / 2];
  const nbc = [nb[0] + (tip[0] - nb[0]) * 0.3, nb[1] + (tip[1] - nb[1]) * 0.3];
  const n6 = T.P(6);
  const bridge = [n6[0] + (tip[0] - n6[0]) * 0.45, n6[1] + (tip[1] - n6[1]) * 0.45];

  const S = W * 2.6;
  const box = [C[0] - S / 2, C[1] - S / 2 + W * 0.2, S, S];
  const cell = S / GRID;

  for (let gy = 0; gy < GRID; gy++) {
    const y = box[1] + (gy + 0.5) * cell;
    const ey = ss(0, 0.1, gy / GRID) * ss(1, 0.9, gy / GRID);
    for (let gx = 0; gx < GRID; gx++) {
      const x = box[0] + (gx + 0.5) * cell;
      const env = ey * ss(0, 0.1, gx / GRID) * ss(1, 0.9, gx / GRID);
      const k2 = 2 * (gy * GRID + gx);
      if (env === 0) { fwd[k2] = fwd[k2 + 1] = 0; continue; }

      const rx = x - C[0], ry = y - C[1];
      const lx = (rx * ax[0] + ry * ax[1]) / W;
      const lyy = (rx * ay[0] + ry * ay[1]) / W;
      const s = lx < 0 ? -1 : 1;
      const al = Math.abs(lx);
      let ox = 0, oy = 0; // face units

      if (jawW && lyy > yE + 0.05 && al > hG - 0.15) {
        // The mandible angle moves out (and slightly down); the cheeks in front of it stay put.
        // The ramus swings out from the ear down to the jaw corner, so the back edge stays straight.
        const vert = lyy <= yG ? ss(yE + 0.05, yG, lyy) : 1 - 0.7 * ss(yG, yC + 0.25, lyy);
        const horiz = ss(hG - 0.15, hG, al) * (al <= hG ? 1 : Math.exp(-sq((al - hG) / 0.3)));
        const w = vert * horiz;
        ox += s * 0.06 * jawW * w;
        oy += 0.02 * jawW * w;
      }
      if (jawS && al > 0.08 && Math.abs(lyy - yJ) < 0.4) {
        const w = bump(lyy, yJ, 0.12) * ss(0.08, 0.3, al) * Math.exp(-sq(Math.max(0, al - 0.42) / 0.25));
        ox += s * 0.045 * jawS * w;
        oy += 0.02 * jawS * w;
      }
      if (hol && al > 0.2 && Math.abs(lyy - yH) < 0.35) {
        const w = bump(lyy, yH, 0.11) * ss(0.2, 0.44, al) * Math.exp(-sq(Math.max(0, al - 0.5) / 0.2));
        ox -= s * 0.02 * hol * w;
      }
      if (bones && al > 0.25 && Math.abs(lyy - yZ) < 0.3) {
        const w = bump(lyy, yZ - 0.02, 0.08) * ss(0.25, 0.45, al) * Math.exp(-sq(Math.max(0, al - 0.5) / 0.2));
        ox += s * 0.028 * bones * w;
        oy -= 0.01 * bones * w;
      }
      if (chinL) {
        const vert = lyy <= yC ? ss(yM + 0.03, yC, lyy) : 1 - ss(yC, yC + 0.35, lyy);
        oy += 0.05 * chinL * vert * (1 - ss(0.15, 0.38, al));
      }
      if (chinW && al > 0.02 && al < 0.38 && Math.abs(lyy - yC + 0.05) < 0.35) {
        const w = bump(lyy, yC - 0.05, 0.1) * ss(0.02, 0.15, al) * (1 - ss(0.2, 0.38, al));
        ox += s * 0.032 * chinW * w;
      }
      if (fore) {
        const vert = lyy >= yB ? 0 : lyy >= yT ? ss(yB, yT, lyy) : 1 - ss(yT, yT - 0.35, lyy);
        oy += 0.05 * fore * vert * (1 - ss(0.45, 0.7, al));
      }
      if (mid && al < 0.38 && Math.abs(lyy - yM) < 0.35) {
        oy -= 0.022 * mid * bump(lyy, yM, 0.1) * (1 - ss(0.2, 0.38, al));
      }

      let px = (ox * ax[0] + oy * ay[0]) * W;
      let py = (ox * ax[1] + oy * ay[1]) * W;

      if (eyeOn) {
        for (const e of eyes) {
          const dx = x - e.c[0], dy = y - e.c[1];
          const pu = dx * e.e1[0] + dy * e.e1[1];
          const pn = dx * e.n[0] + dy * e.n[1];
          const u = pu / e.a, tp = pn / e.a;
          if (u * u + tp * tp > 16) continue;
          if (theta) {
            const w = Math.exp(-(sq(u / 1.7) + sq(tp / 1.15)));
            const X = x - e.I[0], Y = y - e.I[1];
            px += w * (e.cos * X - e.sin * Y);
            py += w * (e.sin * X + e.cos * Y);
          }
          if (eyeS) {
            const w = Math.exp(-(sq(u / 1.45) + sq(tp / 0.85)));
            px += w * 0.13 * eyeS * dx;
            py += w * 0.13 * eyeS * dy;
          }
          if (hunter) {
            const t = pn / e.h;
            const g = Math.exp(-sq(sq(u / 1.05)));
            const lid = Math.sqrt(Math.max(0, 1 - u * u));
            const dt = t + lid;
            const prof = dt < 0 ? Math.exp(-sq(dt / 2.6)) : Math.exp(-sq(dt / 0.5));
            const dt2 = t - lid;
            const d = hunter * e.h * (0.38 * g * prof - 0.11 * g * Math.exp(-sq(dt2 / 0.6)));
            px += e.n[0] * d;
            py += e.n[1] * d;
          }
          if (brow || hunter) {
            const bx = x - e.bc[0], by = y - e.bc[1];
            const bu = (bx * e.e1[0] + by * e.e1[1]) / (1.25 * e.a);
            const bt = (bx * e.n[0] + by * e.n[1]) / (0.55 * e.a);
            const w = Math.exp(-(sq(bu / 1.4) + sq(bt / 1.6)));
            const d = W * w * (0.02 * brow + 0.012 * Math.max(0, hunter) + 0.009 * hunter * ss(0, 1, bu));
            px += e.n[0] * d;
            py += e.n[1] * d;
          }
        }
      }

      if ((lips || mouthW) && Math.abs(x - mc[0]) < 4 * am && Math.abs(y - mc[1]) < 4 * am) {
        const dx = x - mc[0], dy = y - mc[1];
        const pu = dx * me1[0] + dy * me1[1], pn = dx * mn[0] + dy * mn[1];
        const w = Math.exp(-(sq(pu / (1.25 * am)) + sq(pn / (0.75 * am))));
        px += w * (mn[0] * pn * 0.22 * lips + me1[0] * pu * 0.1 * mouthW);
        py += w * (mn[1] * pn * 0.22 * lips + me1[1] * pu * 0.1 * mouthW);
      }
      if (noseS && Math.abs(x - nbc[0]) < 0.35 * W && Math.abs(y - nbc[1]) < 0.45 * W) {
        let dx = x - nbc[0], dy = y - nbc[1];
        let hx = dx * ax[0] + dy * ax[1], hy = dx * ay[0] + dy * ay[1];
        let w = Math.exp(-(sq(hx / (1.7 * an)) + sq(hy / (1.3 * an))));
        px -= ax[0] * hx * 0.2 * noseS * w;
        py -= ax[1] * hx * 0.2 * noseS * w;
        dx = x - bridge[0]; dy = y - bridge[1];
        hx = dx * ax[0] + dy * ax[1]; hy = dx * ay[0] + dy * ay[1];
        w = Math.exp(-(sq(hx / (0.9 * an)) + sq(hy / (2.2 * an))));
        px -= ax[0] * hx * 0.12 * noseS * w;
        py -= ax[1] * hx * 0.12 * noseS * w;
      }
      if (noseT && Math.abs(x - tip[0]) < 0.25 * W && Math.abs(y - tip[1]) < 0.25 * W) {
        const w = Math.exp(-(sq(x - tip[0]) + sq(y - tip[1])) / sq(0.08 * W));
        px -= ay[0] * 0.02 * W * noseT * w;
        py -= ay[1] * 0.02 * W * noseT * w;
      }

      fwd[k2] = px * env;
      fwd[k2 + 1] = py * env;
    }
  }

  // Invert: for each output pixel p find the source q with q + fwd(q) = p.
  const sample = (qx, qy, out) => {
    let fx = (qx - box[0]) / cell - 0.5, fy = (qy - box[1]) / cell - 0.5;
    if (fx < 0 || fy < 0 || fx > GRID - 1 || fy > GRID - 1) { out[0] = out[1] = 0; return; }
    const ix = Math.min(GRID - 2, fx | 0), iy = Math.min(GRID - 2, fy | 0);
    fx -= ix; fy -= iy;
    const i00 = 2 * (iy * GRID + ix), i10 = i00 + 2, i01 = i00 + 2 * GRID, i11 = i01 + 2;
    for (let c = 0; c < 2; c++) {
      const a = fwd[i00 + c] + (fwd[i10 + c] - fwd[i00 + c]) * fx;
      const b = fwd[i01 + c] + (fwd[i11 + c] - fwd[i01 + c]) * fx;
      out[c] = a + (b - a) * fy;
    }
  };
  const f = [0, 0];
  for (let gy = 0; gy < GRID; gy++) {
    const y = box[1] + (gy + 0.5) * cell;
    for (let gx = 0; gx < GRID; gx++) {
      const x = box[0] + (gx + 0.5) * cell;
      const k2 = 2 * (gy * GRID + gx);
      let qx = x - fwd[k2], qy = y - fwd[k2 + 1];
      for (let it = 0; it < 2; it++) { sample(qx, qy, f); qx = x - f[0]; qy = y - f[1]; }
      inv[k2] = x - qx;
      inv[k2 + 1] = y - qy;
    }
  }
  return box;
}

// ---------------------------------------------------------------- shading map
// R = shadow, G = highlight, B = under-eye lift. Drawn additively, in source-image space.

export function drawShade(ctx, pts, v, F, sx, sy) {
  const T = makeTools(pts, F);
  const { W, ax, ay } = F;
  const w = W * sx;
  const k = (key) => (v[key] || 0) / 100;
  const pos = (key) => Math.max(0, k(key));
  const S = (p) => [p[0] * sx, p[1] * sy];
  const color = (r, g, b) => `rgb(${Math.round(255 * Math.min(1, r))},${Math.round(255 * Math.min(1, g))},${Math.round(255 * Math.min(1, b))})`;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.globalCompositeOperation = 'lighter';
  const blur = (b) => { ctx.filter = b > 0.3 ? `blur(${b.toFixed(1)}px)` : 'none'; };
  const poly = (points, col, b) => {
    blur(b);
    ctx.fillStyle = col;
    ctx.beginPath();
    points.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.closePath();
    ctx.fill();
  };
  const line = (points, width, col, b) => {
    blur(b);
    ctx.strokeStyle = col;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    points.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.stroke();
  };
  const ellipse = (c, dir, rMaj, rMin, col, b) => {
    blur(b);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(c[0], c[1], rMaj, rMin, Math.atan2(dir[1], dir[0]), 0, Math.PI * 2);
    ctx.fill();
  };
  const dirOf = (a, b) => { const d = [b[0] - a[0], b[1] - a[1]]; const l = Math.hypot(d[0], d[1]) || 1; return [d[0] / l, d[1] / l]; };
  const off = (p, dx, dy) => [p[0] + dx, p[1] + dy];

  const contour = k('contour'), hl = k('highlight');
  const hollow = pos('cheekHollow'), hunter = pos('hunter'), ue = k('underEye');
  const jaw = Math.max(pos('jawWidth'), pos('jawSquare'));

  // Cheek hollows: a soft diagonal shadow under the cheekbone, with a lit ridge above it.
  const hollowDark = 0.42 * contour + 0.38 * hollow;
  const ridge = 0.3 * hl + 0.12 * contour + 0.12 * hollow;
  for (const side of [
    { hollow: [147, 187, 213, 207], from: 227, to: 57, ridge: [116, 123, 50], rTo: 50 },
    { hollow: [376, 411, 433, 427], from: 447, to: 287, ridge: [345, 352, 280], rTo: 280 },
  ]) {
    if (hollowDark > 0) {
      ellipse(S(T.mean(side.hollow)), dirOf(T.P(side.from), T.P(side.to)), 0.15 * w, 0.05 * w, color(hollowDark, 0, 0), 0.035 * w);
    }
    if (ridge > 0) {
      ellipse(S(T.mean(side.ridge)), dirOf(T.P(side.from), T.P(side.rTo)), 0.12 * w, 0.03 * w, color(0, ridge, 0), 0.025 * w);
    }
  }

  // Shadow under the jawline: a band hanging below the jaw contour with a fairly crisp top edge.
  const jawDark = 0.4 * contour + 0.2 * jaw;
  const jawPts = JAW_CONTOUR.map((i) => S(T.P(i)));
  if (jawDark > 0) {
    const dn = [ay[0] * 0.14 * w, ay[1] * 0.14 * w];
    const band = [...jawPts, ...jawPts.slice().reverse().map((p) => off(p, dn[0], dn[1]))];
    poly(band, color(jawDark, 0, 0), 0.014 * w);
  }
  // Light catching the jaw edge just inside the contour.
  const edge = 0.12 * contour + 0.12 * hl;
  if (edge > 0) {
    const c = S(T.P(6));
    const inner = jawPts.slice(1, -1).map((p) => {
      const d = dirOf(p, c);
      return off(p, d[0] * 0.03 * w, d[1] * 0.03 * w);
    });
    line(inner, 0.025 * w, color(0, edge, 0), 0.015 * w);
  }

  // Nose: shaded sidewalls, lit bridge.
  if (contour > 0) {
    for (const s of [-1, 1]) {
      const top = S(T.P(6)), bot = S(T.P(s < 0 ? 98 : 327));
      const o = [ax[0] * s * 0.045 * w, ax[1] * s * 0.045 * w];
      line([off(top, o[0], o[1]), off(bot, -ay[0] * 0.03 * w, -ay[1] * 0.03 * w)], 0.03 * w, color(0.14 * contour, 0, 0), 0.02 * w);
    }
  }
  if (hl > 0) {
    line([168, 6, 197, 195, 5].map((i) => S(T.P(i))), 0.022 * w, color(0, 0.35 * hl, 0), 0.012 * w);
    ellipse(S(T.P(175)), ax, 0.045 * w, 0.03 * w, color(0, 0.22 * hl, 0), 0.02 * w);
    ellipse(S(T.P(151)), ax, 0.12 * w, 0.06 * w, color(0, 0.12 * hl, 0), 0.04 * w);
  }

  // Deep-set eyes: shadow between the brow and the upper lid.
  const orbit = 0.32 * hunter + 0.08 * contour + 0.12 * pos('browLow');
  if (orbit > 0) {
    for (const [browIds, lidIds] of [
      [[46, 53, 52, 65, 55], [173, 157, 158, 159, 160, 161, 246]],
      [[276, 283, 282, 295, 285], [398, 384, 385, 386, 387, 388, 466]],
    ]) {
      poly([...browIds, ...lidIds].map((i) => S(T.P(i))), color(orbit, 0, 0), 0.022 * w);
    }
  }

  // Under-eye lift.
  if (ue > 0) {
    for (const ids of [[33, 7, 163, 144, 145, 153, 154, 155, 133], [263, 249, 390, 373, 374, 380, 381, 382, 362]]) {
      const lid = ids.map((i) => S(T.P(i)));
      const d = [ay[0] * 0.07 * w, ay[1] * 0.07 * w];
      const shape = [...lid, ...lid.slice().reverse().map((p) => off(p, d[0], d[1]))];
      poly(shape, color(0, 0, ue), 0.02 * w);
    }
  }
  ctx.filter = 'none';
  ctx.globalCompositeOperation = 'source-over';
}
