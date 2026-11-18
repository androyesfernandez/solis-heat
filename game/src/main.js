// Boot: canvas, screens, the fixed-step loop, save/load, audio wiring —
// and the ?shot= staging mode the screenshots are captured with.

import { WORLD_W, WORLD_H, SAVE_KEY } from './config.js';
import { clamp } from './physics.js';
import { createWorld, stepWorld, respawnPlayer, serializeSave, loadSave } from './world.js';
import { drawWorld, drawTitleScreen, drawPauseScreen, drawEndScreen } from './render.js';
import { drawHUD } from './hud.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { runShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

const params = new URLSearchParams(window.location.search);
const seed = Number(params.get('seed') || 20261118) >>> 0;
const state = createWorld(seed);
const audio = createAudio();
const input = createInput(canvas);

function cameraFor(x, y) {
  return {
    x: clamp(x - canvas.width / 2, 0, Math.max(0, WORLD_W - canvas.width)),
    y: clamp(y - canvas.height / 2, 0, Math.max(0, WORLD_H - canvas.height)),
  };
}

function playEvents() {
  for (const ev of state.events) {
    if (ev === 'shot') audio.shot();
    else if (ev === 'hit') audio.hit();
    else if (ev === 'honk') audio.honk();
    else if (ev === 'crash') audio.crash();
    else if (ev === 'door') audio.door();
    else if (ev === 'pickup') audio.pickup();
    else if (ev === 'cash') audio.cash();
    else if (ev === 'jingle') audio.jingle();
    else if (ev === 'busted' || ev === 'down') audio.busted();
  }
  state.events.length = 0;
}

const shotName = params.get('shot');
if (shotName) {
  // Screenshot mode: stage the scene once, then draw it — and redraw on
  // the next animation frame and on any late resize, since assigning a
  // canvas size clears it and a headless window may settle after load.
  let drawShotFrame;
  if (shotName === 'title') {
    drawShotFrame = () => {
      const cam = cameraFor(760, 1180);
      drawWorld(ctx, state, cam.x, cam.y, canvas.width, canvas.height);
      drawTitleScreen(ctx, canvas.width, canvas.height);
    };
  } else {
    runShot(state, shotName, 2400);
    drawShotFrame = () => {
      const cam = cameraFor(state.player.x, state.player.y);
      drawWorld(ctx, state, cam.x, cam.y, canvas.width, canvas.height);
      drawHUD(ctx, state, canvas.width, canvas.height);
    };
  }
  drawShotFrame();
  window.addEventListener('resize', drawShotFrame);
  requestAnimationFrame(() => {
    drawShotFrame();
    window.__shotReady = true;
  });
} else {
  let screen = 'title';
  let last = performance.now();
  let acc = 0;
  let autosaveT = 0;
  const STEP = 1 / 60;

  function frame(now) {
    requestAnimationFrame(frame);
    let elapsed = (now - last) / 1000;
    last = now;
    if (elapsed > 0.25) elapsed = 0.25;

    if (screen === 'title') {
      const cam = cameraFor(760, 1180);
      drawWorld(ctx, state, cam.x, cam.y, canvas.width, canvas.height);
      drawTitleScreen(ctx, canvas.width, canvas.height);
      const it = input.intent(cam.x, cam.y);
      if (it.confirm) {
        audio.unlock();
        screen = 'play';
      }
      input.postStep();
      return;
    }

    const cam = cameraFor(state.player.x, state.player.y);

    if (screen === 'pause') {
      drawWorld(ctx, state, cam.x, cam.y, canvas.width, canvas.height);
      drawHUD(ctx, state, canvas.width, canvas.height);
      drawPauseScreen(ctx, canvas.width, canvas.height);
      const it = input.intent(cam.x, cam.y);
      if (it.pause || it.confirm) screen = 'play';
      input.postStep();
      return;
    }

    if (screen === 'over') {
      drawWorld(ctx, state, cam.x, cam.y, canvas.width, canvas.height);
      drawEndScreen(ctx, canvas.width, canvas.height, state.outcome, state.lastFine);
      const it = input.intent(cam.x, cam.y);
      if (it.confirm) {
        respawnPlayer(state);
        screen = 'play';
      }
      input.postStep();
      return;
    }

    // Play: fixed 1/60 steps, at most four per frame.
    acc += elapsed;
    let steps = 0;
    while (acc >= STEP && steps < 4) {
      const it = input.intent(cam.x, cam.y);
      if (it.pause) {
        screen = 'pause';
        input.postStep();
        break;
      }
      if (it.save) {
        try {
          window.localStorage.setItem(SAVE_KEY, serializeSave(state));
          state.toasts.push({ text: 'Saved.', t: 2.2 });
        } catch { /* storage unavailable: play on */ }
      }
      if (it.load) {
        try {
          const raw = window.localStorage.getItem(SAVE_KEY);
          if (raw && loadSave(state, raw)) state.toasts.push({ text: 'Loaded.', t: 2.2 });
        } catch { /* storage unavailable: play on */ }
      }
      stepWorld(state, it, STEP);
      input.postStep();
      acc -= STEP;
      steps++;
    }
    playEvents();

    autosaveT += elapsed;
    if (autosaveT > 25) {
      autosaveT = 0;
      try {
        window.localStorage.setItem(SAVE_KEY, serializeSave(state));
      } catch { /* storage unavailable: play on */ }
    }

    const shakeX = state.shake ? (Math.random() * 2 - 1) * state.shake : 0;
    const shakeY = state.shake ? (Math.random() * 2 - 1) * state.shake : 0;
    const view = cameraFor(state.player.x + shakeX, state.player.y + shakeY);
    drawWorld(ctx, state, view.x, view.y, canvas.width, canvas.height);
    drawHUD(ctx, state, canvas.width, canvas.height);

    const pCar = state.player.carId ? state.cars.find((c) => c.id === state.player.carId) : null;
    const speedRatio = pCar ? Math.abs(pCar.speed) / 342 : 0;
    let siren = 0;
    for (const c of state.cars) {
      if (c.kind !== 'police') continue;
      const d = Math.hypot(c.x - state.player.x, c.y - state.player.y);
      siren = Math.max(siren, clamp(1 - d / 700, 0, 1));
    }
    audio.update(elapsed, speedRatio, siren);

    if (state.outcome) screen = 'over';
  }
  requestAnimationFrame(frame);
}
