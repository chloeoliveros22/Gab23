const scene = document.getElementById('scene');
const micBtn = document.getElementById('mic');
const photoBtn = document.getElementById('photoBtn');
const photoInput = document.getElementById('photos');
const balloonBox = document.getElementById('balloons');
const darkCanvas = document.getElementById('dark');
const candles = document.querySelectorAll('.candle');
const flames = document.querySelectorAll('.flame');

/* ----- tweak these if it's too easy / too hard to blow out ----- */
const SWAY_MIN  = 0.07;   // softest breath that makes the flames start to lean
const THRESHOLD = 0.40;   // how hard you must blow to actually snuff them (0-1). Higher = harder
const BLOW_TIME = 1.6;    // seconds of HARD blowing needed (it drains if you stop)

let listening = false;
let lean = 0;             // how hard the flames are bending (0-1)
/* default balloon photos: pics/gabPic1.jpg ... pics/gabPic14.jpg (the pics folder sits next to index.html) */
const DEFAULT_COUNT = 14;
const photos = Array.from({ length: DEFAULT_COUNT }, (_, i) => 'pics/gabPic' + (i + 1) + '.jpg');
const MAX_PHOTOS = 30;    // defaults + anything added with the button

/* ---------- light / blow out ---------- */
function setBlown(out) {
  scene.classList.toggle('blown', out);
  document.body.classList.toggle('lit', out);
  lean = 0;
  scene.style.setProperty('--lvl', 0);
  if (out) { spawnBalloons(); startSparkles(); } else { clearBalloons(); stopSparkles(); }
}

/* clicking a candle still works (blow out / relight) */
function onCandle() { setBlown(!scene.classList.contains('blown')); }
candles.forEach((c) => {
  c.addEventListener('click', onCandle);
  c.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCandle(); }
  });
});

/* ---------- photos ---------- */
photoBtn.addEventListener('click', () => photoInput.click());
photoInput.addEventListener('change', () => {
  let n = 0;
  for (const file of photoInput.files) {
    if (photos.length < MAX_PHOTOS && file.type.startsWith('image/')) {
      photos.push(URL.createObjectURL(file));
      const idx = photos.length - 1;
      // a new balloon floats up right away, whether or not the candles are out
      setTimeout(() => { addBalloon(idx, 0, 1, true); ensureBalloonLoop(); }, n * 600);
      n++;
    }
  }
  photoInput.value = '';
  const extra = photos.length - DEFAULT_COUNT;
  photoBtn.textContent = '+ photos (' + extra + ')';
});

/* ---------- balloons ---------- */
const COLORS = ['#f4a6b0', '#f7d36b', '#9fd3c7', '#b7a7e0', '#f6b48a', '#a9d18e', '#f0eee9'];
const WAVE_GAP = 8000;      // ms between waves of balloons
const RISE_MIN = 26, RISE_MAX = 40;   // px/sec, slow scenic float

let balloons = [], waveTimers = [], balloonRAF = 0, lastB = 0, spawned = 0;

function clearBalloons() {
  waveTimers.forEach(clearTimeout); waveTimers = [];
  balloons = []; spawned = 0;
  balloonBox.innerHTML = '';
  cancelAnimationFrame(balloonRAF); balloonRAF = 0;
}

function spawnBalloons() {
  clearBalloons();
  const total = Math.max(photos.length, 8);
  const snap = photos.length;
  let i = 0, wave = 0;
  while (i < total) {
    const size = Math.min(total - i, 3 + (wave % 2));   // waves of 3, 4, 3, 4...
    const slots = Array.from({ length: size }, (_, k) => k).sort(() => Math.random() - 0.5);
    for (let k = 0; k < size; k++) {
      const idx = i + k;
      const slot = slots[k];
      const delay = 300 + wave * WAVE_GAP + k * (700 + Math.random() * 900);
      waveTimers.push(setTimeout(() => addBalloon(idx, slot, size, idx < snap), delay));
    }
    i += size; wave++;
  }
  ensureBalloonLoop();
}
function ensureBalloonLoop() {
  if (balloonRAF) return;
  lastB = performance.now();
  balloonRAF = requestAnimationFrame(balloonLoop);
}

function addBalloon(idx, slot, slots, withPhoto) {
  const W = window.innerWidth, H = window.innerHeight;
  const small = W < 600;
  const w = (small ? 120 : 150) + Math.random() * (small ? 25 : 35);
  const slotW = W / slots;
  const x = Math.max(4, Math.min(W - w - 4, slot * slotW + (slotW - w) / 2 + (Math.random() - 0.5) * slotW * 0.5));

  const el = document.createElement('div');
  el.className = 'balloon';
  el.style.setProperty('--w', w + 'px');
  el.style.setProperty('--c', COLORS[idx % COLORS.length]);
  const photo = (withPhoto && idx < photos.length) ? '<span class="photo" style="background-image:url(' + photos[idx] + ')"></span>' : '';
  el.innerHTML = '<div class="sway"><div class="b-body">' + photo + '</div><span class="knot"></span><span class="string"></span></div>';
  balloonBox.appendChild(el);

  const b = {
    el, sway: el.firstChild, body: el.querySelector('.b-body'),
    w, h: w * 1.2 + 100,
    x, y: H + 10,
    vx: 0, vy: -(RISE_MIN + Math.random() * (RISE_MAX - RISE_MIN)),
    rise: RISE_MIN + Math.random() * (RISE_MAX - RISE_MIN),
    phase: Math.random() * 6.28, tilt: 0,
    held: false, ox: 0, oy: 0, lx: 0, ly: 0, lt: 0
  };
  b.vy = -b.rise;
  balloons.push(b);
  attachDrag(b);
}

function attachDrag(b) {
  const body = b.body;
  body.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    body.setPointerCapture(e.pointerId);
    b.held = true;
    b.ox = e.clientX - b.x; b.oy = e.clientY - b.y;
    b.lx = e.clientX; b.ly = e.clientY; b.lt = performance.now();
    b.vx = 0; b.vy = 0;
    b.el.classList.add('held');
    balloonBox.appendChild(b.el);        // bring to front
  });
  body.addEventListener('pointermove', (e) => {
    if (!b.held) return;
    const now = performance.now();
    const dt = Math.max(1, now - b.lt) / 1000;
    // smoothed release velocity (capped so it never flies off)
    b.vx = b.vx * 0.6 + Math.max(-600, Math.min(600, (e.clientX - b.lx) / dt)) * 0.4;
    b.vy = b.vy * 0.6 + Math.max(-600, Math.min(600, (e.clientY - b.ly) / dt)) * 0.4;
    b.lx = e.clientX; b.ly = e.clientY; b.lt = now;
    b.x = e.clientX - b.ox; b.y = e.clientY - b.oy;
  });
  const release = () => {
    if (!b.held) return;
    b.held = false;
    b.el.classList.remove('held');
    // a gentle toss: keep a bit of the motion, then ease back into floating up
    b.vx *= 0.5; b.vy *= 0.35;
  };
  body.addEventListener('pointerup', release);
  body.addEventListener('pointercancel', release);
}

function balloonLoop(now) {
  balloonRAF = requestAnimationFrame(balloonLoop);
  const dt = Math.min(0.05, (now - lastB) / 1000); lastB = now;
  const t = now / 1000;
  const W = window.innerWidth;

  for (let i = balloons.length - 1; i >= 0; i--) {
    const b = balloons[i];
    if (!b.held) {
      const k = Math.min(1, dt * 1.1);
      const vxT = Math.cos(t * 0.45 + b.phase) * 16;   // lazy side-to-side drift
      b.vx += (vxT - b.vx) * k;
      b.vy += (-b.rise - b.vy) * k;                    // settle back to the slow float
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x < -b.w * 0.2) { b.x = -b.w * 0.2; b.vx = Math.abs(b.vx); }
      if (b.x > W - b.w * 0.8) { b.x = W - b.w * 0.8; b.vx = -Math.abs(b.vx); }
      if (b.y < -b.h - 20) { b.el.remove(); balloons.splice(i, 1); continue; }
    }
    // gentle sway + lean into movement
    const targetTilt = Math.max(-14, Math.min(14, b.vx * 0.06));
    b.tilt += (targetTilt - b.tilt) * Math.min(1, dt * 6);
    const rot = Math.sin(t * 0.9 + b.phase) * 3 + b.tilt;
    b.el.style.transform = 'translate3d(' + b.x.toFixed(1) + 'px,' + b.y.toFixed(1) + 'px,0)';
    b.sway.style.transform = 'rotate(' + rot.toFixed(2) + 'deg)';
  }
}

/* ---------- darkness: only the flames light the cake ---------- */
const dctx = darkCanvas.getContext('2d');
function sizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  darkCanvas.width = window.innerWidth * dpr;
  darkCanvas.height = window.innerHeight * dpr;
  dctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', sizeCanvas);
sizeCanvas();

function drawDark(t) {
  requestAnimationFrame(drawDark);
  if (scene.classList.contains('blown')) return;   // freeze while it fades out

  const w = window.innerWidth, h = window.innerHeight;
  dctx.globalCompositeOperation = 'source-over';
  dctx.clearRect(0, 0, w, h);
  dctx.fillStyle = 'rgba(2, 1, 1, 0.995)';
  dctx.fillRect(0, 0, w, h);

  flames.forEach((f, i) => {
    const r = f.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height * 0.6;
    const flicker = Math.sin(t / 90 + i * 2) * 6 + Math.sin(t / 37 + i) * 3;
    const radius = (150 + flicker) * (1 - lean * 0.4);

    // carve out the light
    dctx.globalCompositeOperation = 'destination-out';
    let g = dctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.35, 'rgba(0,0,0,.6)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    dctx.fillStyle = g;
    dctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);

    // faint warm tint inside the light
    dctx.globalCompositeOperation = 'source-over';
    g = dctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, 'rgba(255,170,70,.14)');
    g.addColorStop(1, 'rgba(255,170,70,0)');
    dctx.fillStyle = g;
    dctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  });
}
requestAnimationFrame(drawDark);

/* ---------- microphone blow detection ---------- */
async function startMic() {
  if (listening) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    });
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    await ctx.resume();

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.5;
    ctx.createMediaStreamSource(stream).connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);
    const hzPerBin = ctx.sampleRate / analyser.fftSize;
    const lowBins = Math.floor(1500 / hzPerBin);   // wind noise lives in the low range

    listening = true;
    micBtn.textContent = 'Ready, now blow';
    micBtn.classList.add('on');
    micBtn.disabled = true;
    setBlown(scene.classList.contains('blown'));

    let level = 0, blowing = 0, last = performance.now();

    (function loop(now) {
      requestAnimationFrame(loop);
      const dt = (now - last) / 1000; last = now;

      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 1; i < lowBins; i++) sum += data[i];
      const raw = sum / (lowBins - 1) / 255;          // 0..1
      level += (raw - level) * 0.35;                  // smooth

      if (scene.classList.contains('blown')) return;

      // flames lean/sway with any breath, harder breath = bigger sway
      lean = Math.min(1, Math.max(0, (level - SWAY_MIN) / (THRESHOLD - SWAY_MIN)));
      scene.classList.toggle('breath', lean > 0.02);
      const wob = Math.sin(now / 70) * lean * 9 + Math.sin(now / 173) * lean * 5;
      scene.style.setProperty('--lvl', (lean * 0.8).toFixed(3));
      scene.style.setProperty('--wob', wob.toFixed(2));
      scene.style.setProperty('--prog', Math.min(1, blowing / BLOW_TIME).toFixed(3));

      // only a strong, steady blow counts; weak puffs just make it dance
      if (level > THRESHOLD) blowing += dt; else blowing = Math.max(0, blowing - dt * 1.5);
      if (blowing > BLOW_TIME) { blowing = 0; scene.classList.remove('breath'); scene.style.setProperty('--prog', 0); scene.style.setProperty('--wob', 0); setBlown(true); }
    })(last);

  } catch (err) {
    micBtn.textContent = 'Mic unavailable, click a candle instead';
    console.error(err);
  }
}

micBtn.addEventListener('click', startMic);


/* ---------- falling glitter ---------- */
const sCanvas = document.getElementById('sparkles');
const sctx = sCanvas.getContext('2d');
const GLITTER = ['#fff', '#ffe9a8', '#ffd1dc', '#d8c8ff', '#c9f1ff'];
let sparks = [], sparkOn = false, sparkRAF = 0;

function sizeSparkles() {
  const dpr = window.devicePixelRatio || 1;
  sCanvas.width = window.innerWidth * dpr;
  sCanvas.height = window.innerHeight * dpr;
  sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', sizeSparkles);
sizeSparkles();

function newSpark(anywhere) {
  return {
    x: Math.random() * window.innerWidth,
    y: anywhere ? Math.random() * window.innerHeight : -10,
    r: 1.5 + Math.random() * 3.5,
    vy: 18 + Math.random() * 28,           // px/sec, slow drift
    drift: Math.random() * Math.PI * 2,
    sway: 10 + Math.random() * 22,
    tw: Math.random() * Math.PI * 2,
    tws: 1.5 + Math.random() * 2.5,
    c: GLITTER[(Math.random() * GLITTER.length) | 0],
    star: Math.random() < 0.55
  };
}

function drawStar(x, y, r) {
  sctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    sctx.lineTo(x + Math.cos(a) * r * 2, y + Math.sin(a) * r * 2);
    const b = a + Math.PI / 4;
    sctx.lineTo(x + Math.cos(b) * r * 0.45, y + Math.sin(b) * r * 0.45);
  }
  sctx.closePath();
  sctx.fill();
}

let lastS = 0;
function sparkLoop(now) {
  sparkRAF = requestAnimationFrame(sparkLoop);
  const dt = Math.min(0.05, (now - lastS) / 1000 || 0); lastS = now;
  const w = window.innerWidth, h = window.innerHeight;
  sctx.clearRect(0, 0, w, h);

  const target = Math.min(140, Math.floor(w / 9));
  while (sparkOn && sparks.length < target) sparks.push(newSpark(false));

  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.y += s.vy * dt;
    s.drift += dt * 0.8;
    s.tw += dt * s.tws;
    const x = s.x + Math.sin(s.drift) * s.sway;
    if (s.y > h + 10) {
      if (sparkOn) sparks[i] = newSpark(false); else sparks.splice(i, 1);
      continue;
    }
    const a = 0.25 + 0.75 * Math.abs(Math.sin(s.tw));
    sctx.globalAlpha = a;
    sctx.fillStyle = s.c;
    sctx.shadowColor = s.c;
    sctx.shadowBlur = 8;
    if (s.star) drawStar(x, s.y, s.r); else { sctx.beginPath(); sctx.arc(x, s.y, s.r * 0.7, 0, 6.283); sctx.fill(); }
  }
  sctx.globalAlpha = 1; sctx.shadowBlur = 0;
  if (!sparkOn && !sparks.length) { cancelAnimationFrame(sparkRAF); sparkRAF = 0; }
}
function startSparkles() {
  sparkOn = true;
  if (!sparks.length) for (let i = 0; i < 50; i++) sparks.push(newSpark(true));
  if (!sparkRAF) sparkRAF = requestAnimationFrame(sparkLoop);
}
function stopSparkles() { sparkOn = false; sparks = []; sctx.clearRect(0, 0, window.innerWidth, window.innerHeight); }


/* ---------- confetti fireworks on every click ---------- */
const fxCanvas = document.getElementById('fx');
const fctx = fxCanvas.getContext('2d');
const FX_COLORS = ['#ff6b9d', '#ffd166', '#6ee7b7', '#7dd3fc', '#c4b5fd', '#fca5a5', '#fff'];
let fxParts = [], fxRAF = 0, lastF = 0;

function sizeFx() {
  const dpr = window.devicePixelRatio || 1;
  fxCanvas.width = window.innerWidth * dpr;
  fxCanvas.height = window.innerHeight * dpr;
  fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', sizeFx);
sizeFx();

function burst(x, y) {
  const pick = () => FX_COLORS[(Math.random() * FX_COLORS.length) | 0];
  // firework sparks: radial streaks with a fading trail
  const sparks = 26, base = Math.random() * 6.28;
  for (let i = 0; i < sparks; i++) {
    const a = base + (i / sparks) * 6.283 + (Math.random() - 0.5) * 0.15;
    const sp = 140 + Math.random() * 120;
    fxParts.push({ k: 's', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 160, drag: 1.6,
      life: 0, max: 0.9 + Math.random() * 0.4, c: pick(), r: 1.8 + Math.random() * 1.4, px: x, py: y });
  }
  // confetti pieces: flung up and out, then flutter down
  for (let i = 0; i < 26; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6;
    const sp = 160 + Math.random() * 260;
    fxParts.push({ k: 'c', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 380, drag: 1.3,
      life: 0, max: 1.5 + Math.random() * 1.0, c: pick(), w: 5 + Math.random() * 5, h: 3 + Math.random() * 4,
      rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 14, fl: Math.random() * 6.28 });
  }
  if (fxParts.length > 600) fxParts.splice(0, fxParts.length - 600);
  if (!fxRAF) { lastF = performance.now(); fxRAF = requestAnimationFrame(fxLoop); }
}

function fxLoop(now) {
  const dt = Math.min(0.05, (now - lastF) / 1000); lastF = now;
  const w = window.innerWidth, h = window.innerHeight;
  fctx.clearRect(0, 0, w, h);
  for (let i = fxParts.length - 1; i >= 0; i--) {
    const p = fxParts[i];
    p.life += dt;
    if (p.life > p.max || p.y > h + 30) { fxParts.splice(i, 1); continue; }
    const f = Math.exp(-p.drag * dt);
    p.vx *= f; p.vy = p.vy * f + p.g * dt;
    const ox = p.x, oy = p.y;
    p.x += p.vx * dt; p.y += p.vy * dt;
    const a = Math.max(0, 1 - p.life / p.max);
    fctx.globalAlpha = a;
    if (p.k === 's') {
      fctx.strokeStyle = p.c; fctx.lineWidth = p.r; fctx.lineCap = 'round';
      fctx.shadowColor = p.c; fctx.shadowBlur = 8;
      fctx.beginPath(); fctx.moveTo(ox - p.vx * 0.03, oy - p.vy * 0.03); fctx.lineTo(p.x, p.y); fctx.stroke();
    } else {
      p.rot += p.vr * dt; p.fl += dt * 9;
      fctx.shadowBlur = 0;
      fctx.save();
      fctx.translate(p.x, p.y); fctx.rotate(p.rot);
      fctx.scale(1, Math.cos(p.fl));            // flutter flip
      fctx.fillStyle = p.c;
      fctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      fctx.restore();
    }
  }
  fctx.globalAlpha = 1; fctx.shadowBlur = 0;
  if (fxParts.length) fxRAF = requestAnimationFrame(fxLoop);
  else { fxRAF = 0; fctx.clearRect(0, 0, w, h); }
}

document.addEventListener('pointerdown', (e) => burst(e.clientX, e.clientY));
