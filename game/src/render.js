// Canvas renderer: the city, vehicles, people and screens. Reads the
// world state and draws it; never mutates anything. The camera is a plain
// world-space offset passed in by the boot module.

import { WORLD_W, WORLD_H, AVENUE_XS, STREET_YS, ROAD_HALF, SEA_EDGE, SAND_EDGE } from './config.js';
import { objectiveOf } from './world.js';

function inView(x, y, camX, camY, vw, vh, pad) {
  return x > camX - pad && x < camX + vw + pad && y > camY - pad && y < camY + vh + pad;
}

function drawGround(ctx, state, camX, camY, vw, vh) {
  ctx.fillStyle = '#a49d8c';
  ctx.fillRect(camX, camY, vw, vh);
  // Sea and sand on the west edge, with slow wave lines.
  const seaGrad = ctx.createLinearGradient(0, 0, SEA_EDGE, 0);
  seaGrad.addColorStop(0, '#1d6fb8');
  seaGrad.addColorStop(1, '#57b6d9');
  ctx.fillStyle = seaGrad;
  ctx.fillRect(camX, camY, Math.max(0, SEA_EDGE - camX), vh);
  ctx.fillStyle = '#ecd9a0';
  ctx.fillRect(Math.max(camX, SEA_EDGE), camY, Math.max(0, SAND_EDGE - Math.max(camX, SEA_EDGE)), vh);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let y = 60; y < WORLD_H; y += 130) {
    const off = Math.sin(state.time * 0.7 + y * 0.05) * 9;
    ctx.moveTo(18 + off, y);
    ctx.lineTo(SEA_EDGE - 42 + off, y);
  }
  ctx.stroke();
  // Block sidewalks.
  ctx.fillStyle = '#b7b09e';
  for (let i = 0; i < AVENUE_XS.length - 1; i++) {
    for (let j = 0; j < STREET_YS.length - 1; j++) {
      const x = AVENUE_XS[i] + ROAD_HALF;
      const y = STREET_YS[j] + ROAD_HALF;
      const w = AVENUE_XS[i + 1] - ROAD_HALF - x;
      const h = STREET_YS[j + 1] - ROAD_HALF - y;
      if (inView(x + w / 2, y + h / 2, camX, camY, vw, vh, 460)) ctx.fillRect(x, y, w, h);
    }
  }
  // Asphalt.
  ctx.fillStyle = '#3b4046';
  for (const ax of AVENUE_XS) ctx.fillRect(ax - ROAD_HALF, camY, ROAD_HALF * 2, vh);
  for (const sy of STREET_YS) ctx.fillRect(camX, sy - ROAD_HALF, vw, ROAD_HALF * 2);
  // Centre dashes.
  ctx.strokeStyle = 'rgba(230,230,220,0.5)';
  ctx.lineWidth = 3;
  ctx.setLineDash([26, 30]);
  ctx.beginPath();
  for (const ax of AVENUE_XS) {
    ctx.moveTo(ax, camY);
    ctx.lineTo(ax, camY + vh);
  }
  for (const sy of STREET_YS) {
    ctx.moveTo(camX, sy);
    ctx.lineTo(camX + vw, sy);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawBuildings(ctx, state, camX, camY, vw, vh) {
  for (const b of state.city.buildings) {
    if (!inView(b.x + b.w / 2, b.y + b.h / 2, camX, camY, vw, vh, 340)) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(b.x + 5, b.y + 7, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = 'rgba(0,0,0,0.13)';
    ctx.fillRect(b.x + 9, b.y + 9, b.w - 18, b.h - 18);
    if (b.landmark) {
      ctx.strokeStyle = '#d9a521';
      ctx.lineWidth = 3;
      ctx.strokeRect(b.x + 2, b.y + 2, b.w - 4, b.h - 4);
    }
    if (b.w >= 110) {
      ctx.fillStyle = b.landmark ? 'rgba(60,42,0,0.9)' : 'rgba(30,30,30,0.66)';
      ctx.font = (b.landmark ? 'bold 14px' : '11px') + ' system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(b.name, b.x + b.w / 2, b.y + b.h / 2 + 4);
    }
  }
  // Palms: a trunk and five fronds.
  ctx.strokeStyle = '#7a5a35';
  ctx.lineWidth = 3;
  for (const palm of state.city.palms) {
    if (!inView(palm.x, palm.y, camX, camY, vw, vh, 40)) continue;
    ctx.beginPath();
    ctx.moveTo(palm.x, palm.y);
    ctx.lineTo(palm.x + 3, palm.y - 13);
    ctx.stroke();
    ctx.strokeStyle = '#3f9e4d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + palm.x * 0.01;
      ctx.moveTo(palm.x + 3, palm.y - 13);
      ctx.lineTo(palm.x + 3 + Math.cos(a) * 13, palm.y - 13 + Math.sin(a) * 8 - 3);
    }
    ctx.stroke();
    ctx.strokeStyle = '#7a5a35';
    ctx.lineWidth = 3;
  }
}

function drawObjectiveMarker(ctx, state) {
  const obj = objectiveOf(state);
  if (!obj || !obj.hasTarget) return;
  const bob = Math.sin(state.time * 3.2) * 5;
  const grad = ctx.createLinearGradient(0, obj.y - 250, 0, obj.y);
  grad.addColorStop(0, 'rgba(245,197,66,0)');
  grad.addColorStop(1, 'rgba(245,197,66,0.4)');
  ctx.fillStyle = grad;
  ctx.fillRect(obj.x - 3, obj.y - 250, 6, 250);
  ctx.strokeStyle = 'rgba(245,197,66,0.85)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(obj.x, obj.y, 21 + Math.sin(state.time * 3.2) * 3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.save();
  ctx.translate(obj.x, obj.y - 30 + bob);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = '#f5c542';
  ctx.fillRect(-8, -8, 16, 16);
  ctx.strokeStyle = '#fff6d8';
  ctx.lineWidth = 2;
  ctx.strokeRect(-8, -8, 16, 16);
  ctx.restore();
}

function drawCar(ctx, state, car) {
  const spec = { w: car.r * 2.28, h: car.r * 1.14 };
  if (car.marked) {
    ctx.strokeStyle = 'rgba(245,197,66,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(car.x, car.y, car.r + 9 + Math.sin(state.time * 4) * 2.5, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(car.x + 3, car.y + 5, spec.w / 2, spec.h / 2, car.angle, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  ctx.fillStyle = car.color;
  ctx.beginPath();
  ctx.roundRect(-spec.w / 2, -spec.h / 2, spec.w, spec.h, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  if (car.kind === 'police') {
    ctx.fillStyle = '#20242c';
    ctx.fillRect(-spec.w * 0.06, -spec.h / 2, spec.w * 0.2, spec.h);
    const flash = Math.floor(state.time * 4) % 2 === 0;
    ctx.fillStyle = flash ? '#ff4040' : '#7a1616';
    ctx.fillRect(-4, -spec.h / 2 + 2, 8, 5);
    ctx.fillStyle = flash ? '#2a4d8f' : '#4da3ff';
    ctx.fillRect(-4, spec.h / 2 - 7, 8, 5);
  }
  // Roof / glasshouse.
  ctx.fillStyle = 'rgba(18,24,32,0.6)';
  ctx.beginPath();
  ctx.roundRect(-spec.w * 0.2, -spec.h * 0.34, spec.w * 0.38, spec.h * 0.68, 4);
  ctx.fill();
  // Headlights.
  ctx.fillStyle = '#ffe9a8';
  ctx.fillRect(spec.w / 2 - 3, -spec.h / 2 + 3, 3, 5);
  ctx.fillRect(spec.w / 2 - 3, spec.h / 2 - 8, 3, 5);
  ctx.restore();
  if (car.health < 45) {
    ctx.fillStyle = 'rgba(90,90,90,' + (0.25 + 0.15 * Math.sin(state.time * 9 + car.id)) + ')';
    ctx.beginPath();
    ctx.arc(car.x + Math.cos(car.angle) * spec.w * 0.45, car.y + Math.sin(car.angle) * spec.w * 0.45, 7, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPerson(ctx, x, y, angle, bodyColor, skinColor, down, isOfficer) {
  if (down) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle + Math.PI / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(-11, -5, 22, 10);
    ctx.fillStyle = bodyColor;
    ctx.globalAlpha = 0.75;
    ctx.fillRect(-10, -4.5, 20, 9);
    ctx.restore();
    ctx.globalAlpha = 1;
    return;
  }
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(x + 2, y + 3, 8, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.arc(x, y, isOfficer ? 8 : 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = skinColor;
  ctx.beginPath();
  ctx.arc(x + Math.cos(angle) * 2.5, y + Math.sin(angle) * 2.5, 4, 0, Math.PI * 2);
  ctx.fill();
  if (isOfficer) {
    ctx.fillStyle = '#16294f';
    ctx.beginPath();
    ctx.arc(x, y, 5.5, Math.PI * 0.9, Math.PI * 2.05);
    ctx.fill();
  }
}

export function drawWorld(ctx, state, camX, camY, vw, vh) {
  ctx.save();
  ctx.translate(-camX, -camY);
  drawGround(ctx, state, camX, camY, vw, vh);
  drawBuildings(ctx, state, camX, camY, vw, vh);
  drawObjectiveMarker(ctx, state);
  for (const car of state.cars) {
    if (inView(car.x, car.y, camX, camY, vw, vh, 70)) drawCar(ctx, state, car);
  }
  for (const ped of state.peds) {
    if (inView(ped.x, ped.y, camX, camY, vw, vh, 30)) {
      drawPerson(ctx, ped.x, ped.y, ped.angle, ped.color, ped.skin, ped.down, false);
    }
  }
  for (const off of state.officers) {
    if (inView(off.x, off.y, camX, camY, vw, vh, 30)) {
      drawPerson(ctx, off.x, off.y, off.angle, '#27407c', '#e8c39a', off.down, true);
    }
  }
  const p = state.player;
  if (!p.carId) {
    drawPerson(ctx, p.x, p.y, p.angle, '#1f8a70', '#f2c79b', false, false);
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 13, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (const b of state.bullets) {
    ctx.fillStyle = b.friendly ? '#ffd94d' : '#ff6b4d';
    ctx.beginPath();
    ctx.arc(b.x, b.y, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawTitleScreen(ctx, w, h) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(8,12,20,0.55)');
  grad.addColorStop(0.5, 'rgba(8,12,20,0.12)');
  grad.addColorStop(1, 'rgba(8,12,20,0.6)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  const titleGrad = ctx.createLinearGradient(0, h * 0.2, 0, h * 0.38);
  titleGrad.addColorStop(0, '#ffe9a8');
  titleGrad.addColorStop(0.55, '#f5a623');
  titleGrad.addColorStop(1, '#e2483d');
  ctx.fillStyle = titleGrad;
  ctx.font = '900 92px system-ui, sans-serif';
  ctx.fillText('SOLIS HEAT', w / 2, h * 0.34);
  ctx.fillStyle = '#eaf6ff';
  ctx.font = '600 25px system-ui, sans-serif';
  ctx.fillText('M A R I N A   S O L I S', w / 2, h * 0.34 + 44);
  ctx.font = '17px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(234,246,255,0.85)';
  ctx.fillText('Steal cars. Run jobs for Tia Carmen. Outrun the Solis PD.', w / 2, h * 0.34 + 78);
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('Press ENTER or click to play', w / 2, h * 0.68);
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(234,246,255,0.75)';
  ctx.fillText('WASD / arrows — move & drive · F or E — enter / exit car · Mouse — aim, click — shoot', w / 2, h * 0.68 + 34);
  ctx.fillText('K — save · L — load · P / Esc — pause', w / 2, h * 0.68 + 56);
}

export function drawPauseScreen(ctx, w, h) {
  ctx.fillStyle = 'rgba(8,12,20,0.55)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 54px system-ui, sans-serif';
  ctx.fillText('PAUSED', w / 2, h * 0.46);
  ctx.font = '17px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(234,246,255,0.85)';
  ctx.fillText('Press P, Esc or Enter to keep driving', w / 2, h * 0.46 + 40);
}

export function drawEndScreen(ctx, w, h, kind, fine) {
  ctx.fillStyle = kind === 'busted' ? 'rgba(20,30,70,0.62)' : 'rgba(70,14,14,0.62)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 72px system-ui, sans-serif';
  ctx.fillText(kind === 'busted' ? 'BUSTED' : 'TAKEN DOWN', w / 2, h * 0.42);
  ctx.font = '19px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(234,246,255,0.9)';
  if (kind === 'busted') {
    ctx.fillText('The Solis PD got you. Fine paid: $' + fine, w / 2, h * 0.42 + 44);
    ctx.fillText('You are released outside the Precinct.', w / 2, h * 0.42 + 72);
  } else {
    ctx.fillText('You wake up at Clinica Palma. Bill: $' + fine, w / 2, h * 0.42 + 44);
    ctx.fillText('The streets are still out there.', w / 2, h * 0.42 + 72);
  }
  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.fillText('Press ENTER to continue', w / 2, h * 0.42 + 116);
}
