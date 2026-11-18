// Screen-space HUD: cash and respect, wanted stars with the heat bar,
// health and car condition, the mission objective with its timer and hold
// meters, the bust meter, toasts — and a live minimap that tracks roads,
// landmarks, traffic, flashing police, pedestrians, the objective and you.

import { WORLD_W, WORLD_H, AVENUE_XS, STREET_YS, SEA_EDGE, HEAT_MAX, PLAYER_HP } from './config.js';
import { objectiveOf, starsOf } from './world.js';

const MAP_W = 220;
const MAP_H = 165;

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(10,16,22,0.72)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function bar(ctx, x, y, w, h, frac, color) {
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fill();
  if (frac > 0) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, Math.max(h, w * Math.min(1, frac)), h, h / 2);
    ctx.fill();
  }
}

function drawMinimap(ctx, state, w) {
  const x0 = w - MAP_W - 16;
  const y0 = 16;
  const sx = MAP_W / WORLD_W;
  const sy = MAP_H / WORLD_H;
  panel(ctx, x0 - 4, y0 - 4, MAP_W + 8, MAP_H + 8);
  ctx.fillStyle = '#274b63';
  ctx.fillRect(x0, y0, SEA_EDGE * sx, MAP_H);
  ctx.fillStyle = '#17222c';
  ctx.fillRect(x0 + SEA_EDGE * sx, y0, MAP_W - SEA_EDGE * sx, MAP_H);
  ctx.fillStyle = '#5b6470';
  for (const ax of AVENUE_XS) ctx.fillRect(x0 + (ax - 48) * sx, y0, 96 * sx, MAP_H);
  for (const syLine of STREET_YS) ctx.fillRect(x0, y0 + (syLine - 48) * sy, MAP_W, 96 * sy);
  // Landmarks as gold dots.
  ctx.fillStyle = '#f5c542';
  for (const lm of state.city.landmarkList) {
    ctx.beginPath();
    ctx.arc(x0 + (lm.x + lm.w / 2) * sx, y0 + (lm.y + lm.h / 2) * sy, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  // Pedestrians as faint specks.
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  for (const ped of state.peds) {
    if (!ped.down) ctx.fillRect(x0 + ped.x * sx - 0.8, y0 + ped.y * sy - 0.8, 1.6, 1.6);
  }
  // Traffic white, officers blue.
  for (const car of state.cars) {
    if (car.kind === 'traffic') {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(x0 + car.x * sx - 1.3, y0 + car.y * sy - 1.3, 2.6, 2.6);
    }
  }
  ctx.fillStyle = '#7fa8ff';
  for (const off of state.officers) {
    if (!off.down) {
      ctx.beginPath();
      ctx.arc(x0 + off.x * sx, y0 + off.y * sy, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Police flash red/blue.
  const flash = Math.floor(state.time * 2.4) % 2 === 0;
  ctx.fillStyle = flash ? '#ff5252' : '#4da3ff';
  for (const car of state.cars) {
    if (car.kind === 'police') {
      ctx.beginPath();
      ctx.arc(x0 + car.x * sx, y0 + car.y * sy, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Objective diamond.
  const obj = objectiveOf(state);
  if (obj && obj.hasTarget) {
    ctx.save();
    ctx.translate(x0 + obj.x * sx, y0 + obj.y * sy);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#f5c542';
    const s = 4 + Math.sin(state.time * 4) * 0.8;
    ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.restore();
  }
  // Player arrow.
  const p = state.player;
  ctx.save();
  ctx.translate(x0 + p.x * sx, y0 + p.y * sy);
  ctx.rotate(p.angle);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(6, 0);
  ctx.lineTo(-4, -3.6);
  ctx.lineTo(-4, 3.6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  return y0 + MAP_H + 8;
}

function drawStarsAndHeat(ctx, state, w, topY) {
  const stars = starsOf(state);
  const x0 = w - MAP_W - 16;
  ctx.font = '19px system-ui, sans-serif';
  ctx.textAlign = 'left';
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < stars ? '#f5c542' : 'rgba(255,255,255,0.25)';
    ctx.fillText('★', x0 + i * 23, topY + 16);
  }
  bar(ctx, x0, topY + 24, MAP_W, 5, state.heat / HEAT_MAX, '#e2483d');
}

export function drawHUD(ctx, state, w, h) {
  const p = state.player;
  // Cash and respect, top-left.
  panel(ctx, 14, 14, 178, 58);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#7be495';
  ctx.font = 'bold 21px system-ui, sans-serif';
  ctx.fillText('$ ' + p.cash.toLocaleString('en-US'), 26, 40);
  ctx.fillStyle = '#ffd94d';
  ctx.font = 'bold 12.5px system-ui, sans-serif';
  ctx.fillText('RESPECT ' + p.respect, 26, 62);

  const mapBottom = drawMinimap(ctx, state, w);
  drawStarsAndHeat(ctx, state, w, mapBottom + 2);

  // Health (and car condition + speed when driving), bottom-left.
  panel(ctx, 14, h - 76, 196, 62);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = 'bold 10.5px system-ui, sans-serif';
  ctx.fillText('HEALTH', 26, h - 58);
  bar(ctx, 76, h - 66, 122, 9, Math.max(0, p.hp) / PLAYER_HP, p.hp > 30 ? '#63b06b' : '#e2483d');
  if (p.carId) {
    const car = state.cars.find((c) => c.id === p.carId);
    if (car) {
      ctx.fillText('CAR', 26, h - 36);
      bar(ctx, 76, h - 44, 122, 9, Math.max(0, car.health) / 100, '#4da3ff');
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 19px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(Math.abs(car.speed) * 0.55) + ' km/h', w - 22, h - 22);
      ctx.textAlign = 'left';
    }
  }

  // Objective, bottom-centre.
  const obj = objectiveOf(state);
  if (obj) {
    const pw = Math.min(560, w - 60);
    const px = (w - pw) / 2;
    const py = h - 74;
    panel(ctx, px, py, pw, 60);
    ctx.fillStyle = '#f5c542';
    ctx.font = 'bold 10.5px system-ui, sans-serif';
    ctx.fillText(obj.title.toUpperCase(), px + 16, py + 18);
    ctx.fillStyle = '#ffffff';
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillText(obj.label, px + 16, py + 40);
    if (obj.hasTarget) {
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffd94d';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.fillText(Math.round(obj.dist / 10) + ' m', px + pw - 16, py + 40);
      ctx.textAlign = 'left';
    }
    if (obj.timer !== null) {
      const secs = Math.max(0, Math.ceil(obj.timer));
      const label = Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0');
      ctx.fillStyle = secs < 30 ? '#ff6b4d' : '#7be495';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(label, px + pw - 16, py + 18);
      ctx.textAlign = 'left';
      bar(ctx, px + 16, py + 48, pw - 32, 5, Math.min(1, obj.timer / 180), secs < 30 ? '#e2483d' : '#63b06b');
    }
    if (obj.hold01 !== null) {
      bar(ctx, px + 16, py + 48, pw - 32, 5, obj.hold01, '#f5c542');
    }
  } else if (!state.outcome) {
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '13.5px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Tia Carmen will call with work…', w / 2, h - 22);
    ctx.textAlign = 'left';
  }

  // Bust meter, centre screen — only once the pressure is real.
  if (state.bust > 25 && !state.outcome) {
    const bw = 240;
    const bx = (w - bw) / 2;
    const by = h * 0.3;
    ctx.fillStyle = Math.floor(state.time * 6) % 2 === 0 ? '#ff4040' : '#ffffff';
    ctx.font = '900 21px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BUSTED', w / 2, by - 8);
    bar(ctx, bx, by, bw, 9, state.bust / 100, '#e2483d');
    ctx.textAlign = 'left';
  }

  // Toasts, top-centre.
  ctx.textAlign = 'center';
  state.toasts.forEach((t, i) => {
    const alpha = Math.min(1, t.t / 0.6);
    ctx.globalAlpha = alpha;
    ctx.font = '14.5px system-ui, sans-serif';
    const tw = ctx.measureText(t.text).width + 28;
    const tx = (w - tw) / 2;
    const ty = 16 + i * 30;
    ctx.fillStyle = 'rgba(10,16,22,0.78)';
    ctx.beginPath();
    ctx.roundRect(tx, ty, tw, 24, 12);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(t.text, w / 2, ty + 16.5);
  });
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';

  // Low-health pulse.
  if (p.hp < 30 && !state.outcome) {
    ctx.strokeStyle = 'rgba(226,72,61,' + (0.35 + 0.25 * Math.sin(state.time * 6)) + ')';
    ctx.lineWidth = 10;
    ctx.strokeRect(0, 0, w, h);
  }
}
