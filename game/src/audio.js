// All sound is synthesised with WebAudio — no audio files, so the game
// stays offline and self-contained. An engine loop and a siren loop follow
// the action; everything else is a one-shot blip. Fully guarded: with no
// AudioContext the game is simply silent, never broken.

export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenPhase = 0;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      engineOsc = ctx.createOscillator();
      engineGain = ctx.createGain();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain.gain.value = 0;
      engineOsc.connect(engineGain).connect(ctx.destination);
      engineOsc.start();
      sirenOsc = ctx.createOscillator();
      sirenGain = ctx.createGain();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 700;
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain).connect(ctx.destination);
      sirenOsc.start();
      return true;
    } catch {
      ctx = null;
      return false;
    }
  }

  function blip(freq, seconds, type, volume, slideTo) {
    if (!ensure()) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.value = freq;
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + seconds);
    gain.gain.setValueAtTime(volume || 0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + seconds);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + seconds);
  }

  return {
    unlock() {
      ensure();
    },
    // speedRatio 0..1 drives engine pitch; sirenLevel 0..1 police presence.
    update(dt, speedRatio, sirenLevel) {
      if (!ctx) return;
      const target = speedRatio > 0.02 ? 0.045 : 0.0;
      engineGain.gain.value += (target - engineGain.gain.value) * Math.min(1, dt * 8);
      engineOsc.frequency.value = 50 + speedRatio * 135;
      sirenPhase += dt * 2.4;
      sirenGain.gain.value = sirenLevel * 0.032;
      sirenOsc.frequency.value = 660 + Math.sin(sirenPhase * Math.PI) * 190;
    },
    shot() { blip(190, 0.09, 'square', 0.09, 60); },
    hit() { blip(120, 0.12, 'sawtooth', 0.09, 50); },
    honk() { blip(340, 0.16, 'square', 0.045); },
    crash() { blip(90, 0.22, 'sawtooth', 0.12, 40); },
    door() { blip(240, 0.07, 'square', 0.05, 180); },
    pickup() {
      blip(660, 0.09, 'sine', 0.09);
      setTimeout(() => blip(880, 0.12, 'sine', 0.09), 70);
    },
    cash() {
      blip(990, 0.08, 'sine', 0.1);
      setTimeout(() => blip(1320, 0.16, 'sine', 0.1), 80);
    },
    busted() {
      blip(392, 0.18, 'triangle', 0.11);
      setTimeout(() => blip(311, 0.18, 'triangle', 0.11), 170);
      setTimeout(() => blip(233, 0.34, 'triangle', 0.11), 340);
    },
    jingle() {
      [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.16, 'sine', 0.1), i * 110));
    },
  };
}
