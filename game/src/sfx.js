// Tiny synthesized sound effects (WebAudio, no files). The context starts on the first user gesture.
const KEY = "clawfriends.muted";
let ctx = null, master = null, motor = null, winch = null, muted = false, lastThud = 0;
let volSfx = .8, volMusic = .8;   // (the settings sliders, 0..1)
try { muted = localStorage.getItem(KEY) === "1"; } catch {}

function hum(freq, type, cutoff) {
  const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq; f.type = "lowpass"; f.frequency.value = cutoff; g.gain.value = 0;
  o.connect(f); f.connect(g); g.connect(master); o.start();
  return { o, g };
}
function start() {
  if (ctx) { if (ctx.state === "suspended") ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = muted ? 0 : .55 * volSfx; master.connect(ctx.destination);
  motor = hum(62, "sawtooth", 260); winch = hum(150, "square", 700);
  startMusic();
}
export function init(auto = true) {
  if (auto) for (const ev of ["pointerdown", "keydown", "touchstart"]) addEventListener(ev, start, { passive: true });
}
export { start };
export const isMuted = () => muted;
export function toggleMute() {
  muted = !muted;
  try { localStorage.setItem(KEY, muted ? "1" : "0"); } catch {}
  applyVolumes();
  return muted;
}
// sound effects go through master, the music has its own way out (so each slider only moves its own)
function applyVolumes() {
  if (!ctx) return;
  master.gain.setTargetAtTime(muted ? 0 : .55 * volSfx, ctx.currentTime, .05);
  if (musicGain) musicGain.gain.setTargetAtTime(musicOn && !muted ? .28 * volMusic : 0, ctx.currentTime, .1);
}
export function setVolumes(music, sfx) { volMusic = music; volSfx = sfx; applyVolumes(); }

function tone(freq, dur, type = "sine", vol = .2, slide = 0, delay = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .01); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .02);
}
function noise(dur, vol = .2, cutoff = 1000, delay = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + delay, n = Math.ceil(ctx.sampleRate * dur), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2;
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = buf; f.type = "lowpass"; f.frequency.value = cutoff; g.gain.value = vol;
  s.connect(f); f.connect(g); g.connect(master); s.start(t);
}

// continuous levels 0..1 for the trolley motor and the cable winch
export function levels(m, w) {
  if (!ctx) return;
  const t = ctx.currentTime;
  motor.g.gain.setTargetAtTime(m * .09, t, .06); motor.o.frequency.setTargetAtTime(55 + m * 25, t, .1);
  winch.g.gain.setTargetAtTime(w * .045, t, .06);
}
export const sfx = {
  coin() { tone(988, .08, "square", .12); tone(1319, .28, "square", .1, 0, .08); },
  open() { noise(.05, .12, 1800); tone(420, .07, "triangle", .12, 360); },
  clack() { noise(.08, .3, 1300); tone(150, .12, "sine", .3, 80); },
  thud(v) {
    if (!ctx || ctx.currentTime - lastThud < .07) return;
    lastThud = ctx.currentTime;
    noise(.1, .22 * v, 420); tone(95, .09, "sine", .22 * v, 55);
  },
  grab() { tone(660, .09, "triangle", .15, 880); },
  slip() { tone(760, .4, "sine", .2, 190); },
  miss() { tone(392, .16, "triangle", .15, 330); tone(311, .3, "triangle", .15, 262, .16); },
  win() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, .22, "triangle", .16, 0, i * .09));
    [1568, 2093, 2637].forEach((f, i) => tone(f, .15, "sine", .06, 0, .4 + i * .07));
  },
  button() { tone(880, .05, "square", .07); },
  plop() { tone(520, .08, "triangle", .14, 760); noise(.05, .08, 900, .02); },
  cart() { noise(.2, .1, 500); tone(300, .12, "triangle", .08, 420); },
  swap() { [659, 784, 988, 1319].forEach((f, i) => tone(f, .18, "square", .09, 0, i * .07)); tone(196, .5, "triangle", .15, 392); },
  register() { tone(1568, .08, "square", .08); tone(2093, .25, "square", .08, 0, .09); noise(.08, .1, 3000, .02); },
};

// ---------- background music: an original bouncy loop, synthesized (8 bars, C - Am - F - G) ----------
const MKEY = "clawfriends.music";
let musicOn = true, musicGain = null, nextBeat = 0, beat = 0, timer = 0;
try { musicOn = localStorage.getItem(MKEY) !== "0"; } catch {}
const BPM = 112, SPB = 60 / BPM;
const N = n => 440 * Math.pow(2, (n - 69) / 12);        // midi note -> Hz
// melody in 8th notes (midi, 0 = rest), 16 per bar
const MEL = [
  76, 0, 79, 0, 81, 79, 76, 0, 72, 0, 74, 76, 0, 0, 0, 0,
  76, 0, 74, 72, 69, 0, 72, 0, 74, 0, 72, 69, 0, 0, 0, 0,
  77, 0, 76, 77, 81, 0, 79, 77, 76, 0, 74, 72, 74, 0, 0, 0,
  74, 0, 0, 76, 74, 72, 71, 0, 74, 0, 0, 0, 79, 0, 0, 0,
  76, 79, 84, 0, 83, 81, 79, 0, 76, 0, 79, 0, 81, 0, 79, 0,
  81, 0, 79, 76, 72, 0, 74, 76, 0, 0, 72, 0, 69, 0, 0, 0,
  77, 81, 79, 77, 76, 0, 74, 72, 74, 76, 77, 0, 79, 0, 0, 0,
  74, 0, 67, 71, 72, 0, 0, 0, 76, 0, 74, 0, 72, 0, 0, 0,
];
const CHORDS = [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]];     // C, Am, F, G
function mtone(freq, t, dur, type, vol, dest) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .012); g.gain.exponentialRampToValueAtTime(.0008, t + dur);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + .05);
}
function mnoise(t, dur, vol, hp, dest) {
  const n = Math.ceil(ctx.sampleRate * dur), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 3;
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = buf; f.type = "highpass"; f.frequency.value = hp; g.gain.value = vol;
  s.connect(f); f.connect(g); g.connect(dest); s.start(t);
}
function scheduleStep(i, t) {
  const bar = Math.floor(i / 16) % 8, step = i % 16, chord = CHORDS[bar % 4], e = SPB / 2;
  const m = MEL[(i % 128)];
  if (m) mtone(N(m), t, e * 1.6, "square", .045, musicGain), mtone(N(m + 12), t, e * 1.2, "sine", .02, musicGain);
  if (step % 4 === 0) mtone(N(chord[0] - 12), t, e * 1.8, "triangle", .14, musicGain);            // bass on beats
  if (step % 4 === 2) mtone(N(chord[0] - 24 + 12), t, e * 1.2, "triangle", .08, musicGain);
  mtone(N(chord[step % 3] + 12), t, e * .9, "sine", .03, musicGain);                                // soft arpeggio
  if (step % 8 === 0) { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + .12); g.gain.setValueAtTime(.22, t); g.gain.exponentialRampToValueAtTime(.001, t + .16); o.connect(g); g.connect(musicGain); o.start(t); o.stop(t + .2); }
  if (step % 8 === 4) mnoise(t, .12, .12, 1800, musicGain);                                          // clap
  if (step % 2 === 0) mnoise(t, .03, .05, 7000, musicGain);                                          // hat
}
function tick() {
  if (!ctx || !musicOn) return;
  while (nextBeat < ctx.currentTime + .15) { scheduleStep(beat, nextBeat); beat++; nextBeat += SPB / 2; }
}
export function startMusic() {
  if (!ctx || musicGain) return;
  musicGain = ctx.createGain(); musicGain.gain.value = musicOn && !muted ? .28 * volMusic : 0; musicGain.connect(ctx.destination);
  nextBeat = ctx.currentTime + .1;
  timer = setInterval(tick, 40);
}
export const isMusicOn = () => musicOn;
export function toggleMusic() {
  musicOn = !musicOn;
  try { localStorage.setItem(MKEY, musicOn ? "1" : "0"); } catch {}
  if (musicGain) { applyVolumes(); if (musicOn) nextBeat = ctx.currentTime + .1; }
  return musicOn;
}
