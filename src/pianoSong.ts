// ponytail: zero-asset music box — synthesized sine+harmonic plucks, no samples,
// no downloads, nothing for the Air to fetch. Original lullaby, no copyright.
import { soundOn } from './settings';

let ctx: AudioContext | null = null;
let live: AudioScheduledSourceNode[] = [];
let timer: number | null = null;

function ensure(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx.state === 'suspended' ? null : ctx;
  } catch { return null; }
}
// unlock on first tap anywhere (iOS suspends AudioContext until a gesture)
try {
  const unlock = () => { try { ensure(); } catch {} };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
} catch {}

// A-minor pentatonic lullaby, ~14 notes over the 9.5s piano clip
const NOTES = [440, 523.25, 587.33, 659.25, 523.25, 440, 392, 440, 523.25, 587.33, 659.25, 783.99, 659.25, 523.25];
const STEPS = [0, 0.7, 1.4, 2.1, 2.9, 3.6, 4.4, 5.1, 5.8, 6.5, 7.2, 7.9, 8.6, 9.3];

function pluck(c: AudioContext, t: number, freq: number) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
  const o1 = c.createOscillator();
  o1.type = 'sine'; o1.frequency.value = freq;
  const o2 = c.createOscillator();
  o2.type = 'sine'; o2.frequency.value = freq * 3;
  const g2 = c.createGain(); g2.gain.value = 0.18;
  o1.connect(g); o2.connect(g2); g2.connect(g);
  g.connect(master(c));
  o1.start(t); o2.start(t); o1.stop(t + 3); o2.stop(t + 3);
  live.push(o1, o2);
}

let masterGain: GainNode | null = null;
function master(c: AudioContext): GainNode {
  if (!masterGain) {
    masterGain = c.createGain();
    masterGain.gain.value = 0.14; // quiet under the room
    masterGain.connect(c.destination);
  }
  return masterGain;
}

export function playPianoPhrase() {
  if (!soundOn()) return; // sound muted in settings — she plays silently
  const c = ensure();
  if (!c) return;
  stopPianoPhrase();
  const t0 = c.currentTime + 0.15;
  for (let i = 0; i < NOTES.length; i++) pluck(c, t0 + STEPS[i], NOTES[i]);
  timer = window.setTimeout(stopPianoPhrase, 13500);
}

export function stopPianoPhrase() {
  if (timer) { window.clearTimeout(timer); timer = null; }
  for (const n of live) { try { n.stop(); } catch {} try { n.disconnect(); } catch {} }
  live = [];
}
