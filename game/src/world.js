// The simulation: Marina Solis as a living system. This module is fully
// DOM-free — it imports no browser API, so Node tests and the staged shot
// scenes drive it with scripted intents exactly like the real game loop.
// One seeded RNG feeds every decision, which makes runs reproducible.

import {
  WORLD_W, WORLD_H, AVENUE_XS, STREET_YS, SAND_EDGE,
  HEAT_MAX, HEAT_PER_STAR, PLAYER_RADIUS, PLAYER_WALK_SPEED, PLAYER_HP,
  CAR_MODELS,
} from './config.js';
import { mulberry32, rrange, rint, pick } from './random.js';
import { buildCity } from './city.js';
import { clamp, dist, angleDiff, slideCircle, circleRectOverlap } from './physics.js';
import { STORY_MISSIONS, makeSideJob } from './missions.js';

const LANE = 17; // right-hand traffic offset from a road centre line
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // east, south, west, north

function approach(cur, target, maxDelta) {
  if (cur < target) return Math.min(target, cur + maxDelta);
  return Math.max(target, cur - maxDelta);
}

export function starsOf(state) {
  return state.heat <= 0 ? 0 : Math.min(5, Math.ceil(state.heat / HEAT_PER_STAR));
}

export function toast(state, text) {
  state.toasts.push({ text, t: 3.6 });
  if (state.toasts.length > 4) state.toasts.shift();
}

function addCrime(state, amount) {
  state.heat = clamp(state.heat + amount, 0, HEAT_MAX);
  state.lastCrimeAt = state.time;
}

// Is there a cop, officer or pedestrian close enough to see a crime here?
function witnessedNear(state, x, y, range) {
  for (const c of state.cars) {
    if (c.kind === 'police' && dist(x, y, c.x, c.y) < range) return true;
  }
  for (const o of state.officers) {
    if (!o.down && dist(x, y, o.x, o.y) < range) return true;
  }
  for (const p of state.peds) {
    if (!p.down && dist(x, y, p.x, p.y) < range * 0.8) return true;
  }
  return false;
}

function carById(state, id) {
  for (const c of state.cars) if (c.id === id) return c;
  return null;
}

function makeCar(state, model, x, y, angle, kind, color) {
  const spec = CAR_MODELS[model];
  const car = {
    id: state.nextCarId++,
    model, label: spec.label,
    x, y, angle, speed: 0,
    health: 100, kind, color,
    r: Math.max(spec.w, spec.h) * 0.42,
    marked: false, stolenBefore: false, remove: false,
    ai: null,
  };
  state.cars.push(car);
  return car;
}

// --- traffic route helpers -------------------------------------------------
// ai.ax / ai.sy are the grid indices of the intersection the car is driving
// TOWARD; ai.dir is its heading (index into DIRS).
function dirsFrom(ax, sy) {
  const out = [];
  if (ax < AVENUE_XS.length - 1) out.push(0);
  if (sy < STREET_YS.length - 1) out.push(1);
  if (ax > 0) out.push(2);
  if (sy > 0) out.push(3);
  return out;
}

function stepIndex(ax, sy, dir) {
  return [ax + DIRS[dir][0], sy + DIRS[dir][1]];
}

function targetPoint(car) {
  const [dx, dy] = DIRS[car.ai.dir];
  return {
    x: AVENUE_XS[car.ai.ax] + (-dy) * LANE,
    y: STREET_YS[car.ai.sy] + dx * LANE,
  };
}

function spawnTrafficCar(state) {
  const rng = state.rng;
  const ax = rint(rng, 0, AVENUE_XS.length - 1);
  const sy = rint(rng, 0, STREET_YS.length - 1);
  const dir = pick(rng, dirsFrom(ax, sy));
  const model = pick(rng, Object.keys(CAR_MODELS).filter((m) => m !== 'interceptor'));
  const [dx, dy] = DIRS[dir];
  const car = makeCar(
    state, model,
    AVENUE_XS[ax] + (-dy) * LANE, STREET_YS[sy] + dx * LANE,
    Math.atan2(dy, dx), 'traffic', pick(rng, CAR_MODELS[model].colors),
  );
  const [nx, ny] = stepIndex(ax, sy, dir);
  car.ai = { ax: nx, sy: ny, dir, reverseT: 0, checkT: rrange(rng, 0.4, 1.1), lastX: car.x, lastY: car.y };
  return car;
}

// Police spawn by sampling: ~40 candidate kerb points around the grid,
// keep the closest one that is neither on top of the player (which would
// feel rigged) nor so far away that the chase never happens.
function spawnPoliceCar(state, minDist) {
  const rng = state.rng;
  let best = null;
  let bestD = Infinity;
  for (let n = 0; n < 40; n++) {
    const x = pick(rng, AVENUE_XS) + rrange(rng, -24, 24);
    const y = pick(rng, STREET_YS) + rrange(rng, -24, 24);
    const d = dist(x, y, state.player.x, state.player.y);
    if (d >= minDist && d <= 980 && d < bestD) {
      best = { x, y };
      bestD = d;
    }
  }
  if (!best) return null;
  const car = makeCar(state, 'interceptor', best.x, best.y,
    Math.atan2(state.player.y - best.y, state.player.x - best.x), 'police', '#f4f6f8');
  car.ai = { pursuit: true };
  return car;
}

function spawnOfficer(state) {
  const rng = state.rng;
  let best = null;
  let bestD = Infinity;
  for (let n = 0; n < 40; n++) {
    const x = pick(rng, AVENUE_XS) + rrange(rng, -30, 30);
    const y = pick(rng, STREET_YS) + rrange(rng, -30, 30);
    const d = dist(x, y, state.player.x, state.player.y);
    if (d >= 290 && d <= 460 && d < bestD) {
      best = { x, y };
      bestD = d;
    }
  }
  if (!best) return null;
  const off = { x: best.x, y: best.y, angle: 0, hp: 40, down: false, shotCd: rrange(rng, 0.4, 1) };
  state.officers.push(off);
  return off;
}

// --- world construction ------------------------------------------------------

export function createWorld(seed) {
  const rng = mulberry32(seed);
  const city = buildCity((seed ^ 0x9e3779b9) >>> 0);
  const state = {
    seed, rng, city,
    time: 0,
    cars: [], peds: [], officers: [], bullets: [],
    nextCarId: 1,
    player: null, playerSpeed: 0,
    heat: 0, heatFloor: 0, bust: 0,
    lastCrimeAt: -99, alarm: { x: -9999, y: -9999, t: -99 },
    toasts: [], events: [],
    storyIdx: 0, sideCount: 0,
    mission: null, missionDelay: 1.2,
    outcome: null, lastFine: 0,
    shake: 0, shotCd: 0, policeTimer: 0, officerTimer: 0, honkAt: -99,
  };

  for (const spot of city.parkedSpots) {
    makeCar(state, spot.model, spot.x, spot.y, spot.angle, 'parked', spot.color);
  }
  for (let n = 0; n < 13; n++) spawnTrafficCar(state);

  const pedColors = ['#d96b4f', '#4f7ad9', '#63b06b', '#c9a227', '#9a67c9', '#d94f8f', '#4fb8c9'];
  for (let n = 0; n < 24; n++) {
    let x = 0;
    let y = 0;
    for (let tries = 0; tries < 10; tries++) {
      x = rrange(rng, 360, WORLD_W - 40);
      y = rrange(rng, 50, WORLD_H - 50);
      let inside = false;
      for (const b of city.colliders) {
        if (circleRectOverlap(x, y, 16, b)) { inside = true; break; }
      }
      if (!inside) break;
    }
    state.peds.push({
      x, y, angle: rrange(rng, 0, Math.PI * 2),
      tx: x, ty: y, waitT: rrange(rng, 0, 2),
      panicT: 0, fleeX: 0, fleeY: 0, down: false,
      color: pick(rng, pedColors), skin: pick(rng, ['#f2c79b', '#c98d5f', '#8a5a3b', '#ffe0bd']),
    });
  }

  const pad = city.landmarks.crashpad.front;
  state.player = {
    x: pad.x, y: pad.y + 26, angle: -Math.PI / 2,
    hp: PLAYER_HP, cash: 0, respect: 0, carId: 0, lastHurtAt: -99,
  };
  return state;
}

// --- missions ----------------------------------------------------------------

function markCarForStep(state) {
  const m = state.mission;
  for (const c of state.cars) c.marked = false;
  if (m.def.id === 'the-neon-heat-run') {
    const front = state.city.landmarks.airfield.front;
    const car = makeCar(state, 'luxe', front.x + 78, front.y + 38, 0, 'parked', '#5b2a86');
    car.marked = true;
    m.markedCarId = car.id;
    return;
  }
  const anchor = state.city.landmarks.mercado.front;
  let best = null;
  let bestD = Infinity;
  for (const c of state.cars) {
    if (c.kind !== 'parked') continue;
    const d = dist(c.x, c.y, anchor.x, anchor.y);
    if (d < bestD) { best = c; bestD = d; }
  }
  if (best) {
    best.marked = true;
    m.markedCarId = best.id;
  }
}

function setupStep(state) {
  const m = state.mission;
  const step = m.def.steps[m.stepIdx];
  m.stepTimer = step.timer || 0;
  m.hold = 0;
  state.heatFloor = step.heatFloor || 0;
  if (step.kind === 'enterMarkedCar') markCarForStep(state);
}

function beginMission(state, def) {
  state.mission = { def, stepIdx: 0, stepTimer: 0, hold: 0, markedCarId: 0 };
  toast(state, def.intro);
  setupStep(state);
}

function startNextMission(state) {
  if (state.storyIdx < STORY_MISSIONS.length) {
    beginMission(state, STORY_MISSIONS[state.storyIdx]);
  } else {
    state.sideCount++;
    const ids = state.city.landmarkList.map((lm) => lm.id);
    beginMission(state, makeSideJob(state.rng, state.sideCount, ids));
  }
}

function completeMission(state) {
  const def = state.mission.def;
  state.player.cash += def.payout;
  state.player.respect += def.respect;
  state.events.push('cash', 'jingle');
  toast(state, def.title + ' complete  +$' + def.payout);
  if (state.storyIdx < STORY_MISSIONS.length && STORY_MISSIONS[state.storyIdx].id === def.id) {
    state.storyIdx++;
  }
  state.mission = null;
  state.heatFloor = 0;
  state.missionDelay = 3.5;
}

function completeStep(state) {
  const m = state.mission;
  m.stepIdx++;
  if (m.stepIdx >= m.def.steps.length) {
    completeMission(state);
    return;
  }
  setupStep(state);
  toast(state, m.def.steps[m.stepIdx].label);
}

function failMission(state) {
  toast(state, 'Too slow — Tia Carmen is not pleased. She will call again.');
  state.mission = null;
  state.heatFloor = 0;
  state.missionDelay = 4;
}

function stepTarget(state) {
  const m = state.mission;
  if (!m) return null;
  const step = m.def.steps[m.stepIdx];
  if (step.at) return state.city.landmarks[step.at].front;
  if (step.kind === 'enterMarkedCar') {
    const car = carById(state, m.markedCarId);
    return car ? { x: car.x, y: car.y } : null;
  }
  return null;
}

export function objectiveOf(state) {
  if (!state.mission || state.outcome) return null;
  const m = state.mission;
  const step = m.def.steps[m.stepIdx];
  const target = stepTarget(state);
  const px = state.player.x;
  const py = state.player.y;
  return {
    x: target ? target.x : px,
    y: target ? target.y : py,
    hasTarget: !!target,
    label: step.label,
    title: m.def.title,
    kind: step.kind,
    dist: target ? dist(px, py, target.x, target.y) : 0,
    timer: step.timer ? m.stepTimer : null,
    hold01: step.kind === 'hold' ? clamp(m.hold / step.holdTime, 0, 1) : null,
  };
}

function updateMission(state, dt) {
  if (!state.mission) {
    if (!state.outcome && state.missionDelay > 0) {
      state.missionDelay -= dt;
      if (state.missionDelay <= 0) startNextMission(state);
    }
    return;
  }
  const m = state.mission;
  const step = m.def.steps[m.stepIdx];
  if (step.timer) {
    m.stepTimer -= dt;
    if (m.stepTimer <= 0) {
      failMission(state);
      return;
    }
  }
  const target = stepTarget(state);
  const pd = target ? dist(state.player.x, state.player.y, target.x, target.y) : 0;
  switch (step.kind) {
    case 'goto':
      if (pd <= 66) completeStep(state);
      break;
    case 'pickup':
      if (pd <= 66) {
        state.events.push('pickup');
        if (m.def.ambushHeat) {
          state.heat = Math.max(state.heat, m.def.ambushHeat);
          state.lastCrimeAt = state.time;
          spawnPoliceCar(state, 360);
          spawnPoliceCar(state, 360);
          toast(state, 'Ambush! The pickup was watched — move!');
        }
        completeStep(state);
      }
      break;
    case 'deliver':
      if (pd <= 74) completeMission(state);
      break;
    case 'enterMarkedCar':
      if (state.player.carId && state.player.carId === m.markedCarId) completeStep(state);
      break;
    case 'hold': {
      if (pd <= 58) {
        m.hold += dt;
        state.heat = Math.min(HEAT_MAX, state.heat + 5 * dt);
        state.lastCrimeAt = state.time;
        if (m.hold >= step.holdTime) completeStep(state);
      } else {
        m.hold = Math.max(0, m.hold - dt * 0.5);
      }
      break;
    }
    case 'goDark':
      if (state.heat <= 0.01) completeStep(state);
      break;
  }
}

// --- save / load / respawn -----------------------------------------------------

export function serializeSave(state) {
  return JSON.stringify({
    v: 1,
    cash: state.player.cash,
    respect: state.player.respect,
    storyIdx: state.storyIdx,
    sideCount: state.sideCount,
    px: Math.round(state.player.x),
    py: Math.round(state.player.y),
  });
}

export function loadSave(state, text) {
  let obj = null;
  try { obj = JSON.parse(text); } catch { return false; }
  if (!obj || obj.v !== 1) return false;
  state.player.cash = obj.cash | 0;
  state.player.respect = obj.respect | 0;
  state.storyIdx = clamp(obj.storyIdx | 0, 0, STORY_MISSIONS.length);
  state.sideCount = obj.sideCount | 0;
  state.player.x = clamp(obj.px || state.player.x, 30, WORLD_W - 30);
  state.player.y = clamp(obj.py || state.player.y, 30, WORLD_H - 30);
  state.player.carId = 0;
  state.player.hp = PLAYER_HP;
  state.heat = 0;
  state.bust = 0;
  state.outcome = null;
  state.mission = null;
  state.missionDelay = 1.2;
  state.officers = [];
  state.bullets = [];
  return true;
}

export function respawnPlayer(state) {
  const lm = state.outcome === 'busted'
    ? state.city.landmarks.precinct
    : state.city.landmarks.clinica;
  state.player.x = lm.front.x;
  state.player.y = lm.front.y + 24;
  state.player.carId = 0;
  state.player.hp = PLAYER_HP;
  state.heat = 0;
  state.bust = 0;
  state.heatFloor = 0;
  state.officers = [];
  state.bullets = [];
  state.outcome = null;
  toast(state, lm.id === 'precinct' ? 'Released. The city is still out there.' : 'Patched up at Clinica Palma.');
}

// --- debug hooks (used by staged shots and the smoke suite) --------------------

export function debugStartMission(state, idx) {
  state.storyIdx = idx;
  state.mission = null;
  beginMission(state, STORY_MISSIONS[idx]);
}

export function debugSetStep(state, stepIdx) {
  if (!state.mission) return;
  state.mission.stepIdx = stepIdx;
  setupStep(state);
}

export function debugSpawnPolice(state, n) {
  for (let i = 0; i < n; i++) spawnPoliceCar(state, 360);
}

export function debugPlaceOfficer(state, x, y) {
  const off = { x, y, angle: 0, hp: 40, down: false, shotCd: 0.8 };
  state.officers.push(off);
  return off;
}

export function debugPlacePoliceCar(state, x, y, angle, speed) {
  const car = makeCar(state, 'interceptor', x, y, angle, 'police', '#f4f6f8');
  car.ai = { pursuit: true };
  car.speed = speed || 0;
  return car;
}

// --- per-step simulation -------------------------------------------------------

// Shared AI driving: steer toward a heading, manage speed, slide along
// buildings, and keep the car off the sand and inside the world.
function driveCar(state, car, desiredAngle, targetSpeed, dt) {
  const spec = CAR_MODELS[car.model];
  let rate = targetSpeed > car.speed ? spec.accel : 470;
  if (targetSpeed !== 0 && car.speed !== 0 && Math.sign(targetSpeed) !== Math.sign(car.speed)) rate = 540;
  car.speed = approach(car.speed, targetSpeed, rate * dt);
  const steer = clamp(angleDiff(car.angle, desiredAngle) * 1.8, -1, 1);
  car.angle += steer * 2.35 * dt * clamp(car.speed / 130, -1, 1);
  const dx = Math.cos(car.angle) * car.speed * dt;
  const dy = Math.sin(car.angle) * car.speed * dt;
  const res = slideCircle(state.city.colliders, car.x, car.y, dx, dy, car.r);
  car.x = res.x;
  car.y = res.y;
  if (res.hitX || res.hitY) {
    const impact = Math.abs(car.speed);
    if (impact > 170) car.health -= (impact - 170) * 0.08;
    car.speed *= impact > 60 ? 0.3 : 0.85;
  }
  if (car.x < SAND_EDGE + car.r) car.x = SAND_EDGE + car.r;
  car.x = clamp(car.x, car.r, WORLD_W - car.r);
  car.y = clamp(car.y, car.r, WORLD_H - car.r);
}

function stepTrafficCar(state, car, dt) {
  const rng = state.rng;
  const ai = car.ai;
  if (ai.reverseT > 0) {
    ai.reverseT -= dt;
    const back = car.angle + Math.PI;
    driveCar(state, car, back, -72, dt);
    return;
  }
  const tp = targetPoint(car);
  if (dist(car.x, car.y, tp.x, tp.y) < 38) {
    // Reached the target intersection: choose the next leg, favouring
    // straight on, never a U-turn unless the road ends.
    const options = dirsFrom(ai.ax, ai.sy).filter((d) => d !== ((ai.dir + 2) % 4));
    let nextDir = ai.dir;
    if (options.length === 0) {
      nextDir = (ai.dir + 2) % 4;
    } else if (options.includes(ai.dir) && rng() < 0.55) {
      nextDir = ai.dir;
    } else {
      nextDir = pick(rng, options);
    }
    const [nx, ny] = stepIndex(ai.ax, ai.sy, nextDir);
    ai.ax = nx;
    ai.sy = ny;
    ai.dir = nextDir;
  }
  const tp2 = targetPoint(car);
  const desired = Math.atan2(tp2.y - car.y, tp2.x - car.x);
  const diff = angleDiff(car.angle, desired);
  let cruise = CAR_MODELS[car.model].cruise;
  if (Math.abs(diff) > 0.6) cruise *= 0.45;
  // Brake for whoever is ahead in the same lane.
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  for (const other of state.cars) {
    if (other === car || other.remove) continue;
    const rx = other.x - car.x;
    const ry = other.y - car.y;
    const ahead = rx * fx + ry * fy;
    if (ahead <= 0 || ahead > 76) continue;
    const side = Math.abs(rx * -fy + ry * fx);
    if (side > 21) continue;
    cruise = Math.min(cruise, Math.max(0, other.speed - (76 - ahead) * 1.4));
    if (cruise <= 1 && dist(car.x, car.y, state.player.x, state.player.y) < 150
        && state.time - state.honkAt > 2.5 && rng() < dt * 2) {
      state.honkAt = state.time;
      state.events.push('honk');
    }
  }
  driveCar(state, car, desired, cruise, dt);
  // Unstick watchdog: if the car barely moved while trying to drive,
  // reverse out and let the next leg sort it out. A car jammed for good
  // (boxed in by a gridlocked queue) is quietly re-dealt to a far corner
  // of the city, which keeps the traffic system from ever freezing up.
  ai.checkT -= dt;
  if (ai.checkT <= 0) {
    ai.checkT = 1.1;
    const moved = dist(car.x, car.y, ai.lastX, ai.lastY);
    if (moved < 6 && cruise > 30) {
      ai.reverseT = 0.65;
      ai.jamT = (ai.jamT || 0) + 1.1;
    } else {
      ai.jamT = 0;
    }
    ai.lastX = car.x;
    ai.lastY = car.y;
    if (ai.jamT > 5.5) {
      ai.jamT = 0;
      for (let tries = 0; tries < 10; tries++) {
        const ax = rint(state.rng, 0, AVENUE_XS.length - 1);
        const sy = rint(state.rng, 0, STREET_YS.length - 1);
        const x = AVENUE_XS[ax];
        const y = STREET_YS[sy];
        if (dist(x, y, state.player.x, state.player.y) < 700) continue;
        const dir = pick(state.rng, dirsFrom(ax, sy));
        const [dx, dy] = DIRS[dir];
        car.x = x + (-dy) * LANE;
        car.y = y + dx * LANE;
        car.angle = Math.atan2(dy, dx);
        car.speed = 0;
        const [nx2, ny2] = stepIndex(ax, sy, dir);
        ai.ax = nx2;
        ai.sy = ny2;
        ai.dir = dir;
        ai.lastX = car.x;
        ai.lastY = car.y;
        break;
      }
    }
  }
}

function stepPoliceCar(state, car, dt) {
  const p = state.player;
  let tx = p.x;
  let ty = p.y;
  const pCar = p.carId ? carById(state, p.carId) : null;
  if (pCar) {
    tx += Math.cos(pCar.angle) * pCar.speed * 0.35;
    ty += Math.sin(pCar.angle) * pCar.speed * 0.35;
  }
  const d = dist(car.x, car.y, p.x, p.y);
  let cruise = CAR_MODELS.interceptor.topSpeed * (d > 320 ? 1.0 : d > 120 ? 0.72 : 0.4);
  if (d < 58 && state.playerSpeed < 45) cruise = 24; // creep: pressure, not ramming
  const desired = Math.atan2(ty - car.y, tx - car.x);
  driveCar(state, car, desired, cruise, dt);
}

function stepPlayerCar(state, car, intent, dt) {
  const spec = CAR_MODELS[car.model];
  let targetSpeed = 0;
  if (intent.drive > 0) targetSpeed = spec.topSpeed;
  else if (intent.drive < 0) targetSpeed = -96;
  let rate;
  if (intent.drive !== 0 && car.speed !== 0 && Math.sign(intent.drive) !== Math.sign(car.speed)) rate = 540;
  else if (intent.drive !== 0) rate = spec.accel;
  else rate = 150;
  car.speed = approach(car.speed, targetSpeed, rate * dt);
  car.angle += intent.steer * 2.25 * dt * clamp(car.speed / 150, -1, 1);
  const dx = Math.cos(car.angle) * car.speed * dt;
  const dy = Math.sin(car.angle) * car.speed * dt;
  const res = slideCircle(state.city.colliders, car.x, car.y, dx, dy, car.r);
  if (res.hitX || res.hitY) {
    const vx = Math.cos(car.angle) * car.speed;
    const vy = Math.sin(car.angle) * car.speed;
    const dominantX = Math.abs(vx) >= Math.abs(vy);
    const crashed = (res.hitX && dominantX) || (res.hitY && !dominantX);
    const impact = Math.abs(car.speed);
    if (crashed) {
      if (impact > 130) {
        car.health -= (impact - 130) * 0.11;
        state.events.push('crash');
        state.shake = Math.min(10, (impact - 130) / 20);
        state.alarm = { x: car.x, y: car.y, t: state.time };
        if (witnessedNear(state, car.x, car.y, 340)) addCrime(state, 4);
      }
      car.speed *= 0.22;
    } else {
      car.speed *= 0.84; // a scrape keeps most of the speed
      if (impact > 230) car.health -= 3;
    }
  }
  car.x = res.x;
  car.y = res.y;
  if (car.x < SAND_EDGE + car.r) {
    car.x = SAND_EDGE + car.r;
    car.speed *= 0.6;
  }
  car.x = clamp(car.x, car.r, WORLD_W - car.r);
  car.y = clamp(car.y, car.r, WORLD_H - car.r);
  state.player.x = car.x;
  state.player.y = car.y;
  state.player.angle = car.angle;
  state.playerSpeed = Math.abs(car.speed);
  if (car.health <= 0 && !car.wreckToast) {
    car.wreckToast = true;
    toast(state, 'Wrecked! This car is done.');
  }
}

function enterNearestCar(state) {
  const p = state.player;
  let best = null;
  let bestD = 54;
  for (const c of state.cars) {
    if (c.remove || Math.abs(c.speed) > 12) continue;
    const d = dist(p.x, p.y, c.x, c.y);
    if (d < bestD) { best = c; bestD = d; }
  }
  if (!best) return;
  p.carId = best.id;
  state.events.push('door');
  if (best.kind === 'police') {
    addCrime(state, witnessedNear(state, p.x, p.y, 420) ? 20 : 10);
    toast(state, 'You stole a police interceptor!');
  } else if (!best.stolenBefore) {
    best.stolenBefore = true;
    if (witnessedNear(state, p.x, p.y, 300)) {
      addCrime(state, 14);
      toast(state, 'Witnessed! Heat is rising.');
    }
  }
}

function exitCar(state) {
  const p = state.player;
  const car = carById(state, p.carId);
  p.carId = 0;
  state.events.push('door');
  if (!car) return;
  for (const sideSign of [1, -1]) {
    const a = car.angle + (Math.PI / 2) * sideSign;
    const nx = car.x + Math.cos(a) * (car.r + 16);
    const ny = car.y + Math.sin(a) * (car.r + 16);
    let blocked = false;
    for (const b of state.city.colliders) {
      if (circleRectOverlap(nx, ny, PLAYER_RADIUS, b)) { blocked = true; break; }
    }
    if (!blocked) {
      p.x = clamp(nx, 26, WORLD_W - 10);
      p.y = clamp(ny, 10, WORLD_H - 10);
      return;
    }
  }
}

function stepPlayer(state, intent, dt) {
  const p = state.player;
  if (intent.enter) {
    if (p.carId) exitCar(state);
    else enterNearestCar(state);
  }
  if (p.carId) {
    const car = carById(state, p.carId);
    if (car) stepPlayerCar(state, car, intent, dt);
    else p.carId = 0;
  } else {
    let mx = intent.mx;
    let my = intent.my;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    const oldX = p.x;
    const oldY = p.y;
    const res = slideCircle(
      state.city.colliders, p.x, p.y,
      mx * PLAYER_WALK_SPEED * dt, my * PLAYER_WALK_SPEED * dt, PLAYER_RADIUS,
    );
    p.x = clamp(res.x, 26, WORLD_W - 10);
    p.y = clamp(res.y, 10, WORLD_H - 10);
    // Cars are solid to a pedestrian: get pushed out of the body circle.
    for (const c of state.cars) {
      if (c.remove) continue;
      const d = dist(p.x, p.y, c.x, c.y);
      const min = c.r + PLAYER_RADIUS;
      if (d > 0.01 && d < min) {
        p.x = c.x + ((p.x - c.x) / d) * min;
        p.y = c.y + ((p.y - c.y) / d) * min;
      }
    }
    state.playerSpeed = dt > 0 ? dist(oldX, oldY, p.x, p.y) / dt : 0;
    if (len > 0.05) p.angle = Math.atan2(my, mx);
    if (intent.shoot) p.angle = Math.atan2(intent.aimY - p.y, intent.aimX - p.x);
    // Pistol fire.
    if (intent.shoot && state.shotCd <= 0) {
      state.shotCd = 0.22;
      const a = Math.atan2(intent.aimY - p.y, intent.aimX - p.x);
      state.bullets.push({
        x: p.x + Math.cos(a) * 16, y: p.y + Math.sin(a) * 16,
        vx: Math.cos(a) * 760, vy: Math.sin(a) * 760,
        life: 0.75, friendly: true, dead: false,
      });
      state.events.push('shot');
      state.alarm = { x: p.x, y: p.y, t: state.time };
      if (witnessedNear(state, p.x, p.y, 320)) addCrime(state, 3);
    }
  }
  if (state.time - p.lastHurtAt > 5 && p.hp > 0) {
    p.hp = Math.min(PLAYER_HP, p.hp + 2.4 * dt);
  }
}

function stepOfficer(state, off, dt) {
  if (off.down) return;
  const p = state.player;
  const d = dist(off.x, off.y, p.x, p.y);
  off.shotCd -= dt;
  if (d > 22) {
    const a = Math.atan2(p.y - off.y, p.x - off.x);
    off.angle = a;
    const res = slideCircle(state.city.colliders, off.x, off.y, Math.cos(a) * 174 * dt, Math.sin(a) * 174 * dt, 10);
    off.x = res.x;
    off.y = res.y;
  }
  if (starsOf(state) >= 3 && d >= 70 && d <= 350 && off.shotCd <= 0) {
    off.shotCd = rrange(state.rng, 0.8, 1.2);
    const a = Math.atan2(p.y - off.y, p.x - off.x) + rrange(state.rng, -0.07, 0.07);
    state.bullets.push({
      x: off.x + Math.cos(a) * 14, y: off.y + Math.sin(a) * 14,
      vx: Math.cos(a) * 640, vy: Math.sin(a) * 640,
      life: 0.7, friendly: false, dead: false,
    });
    state.events.push('shot');
  }
}

function stepPed(state, ped, dt) {
  if (ped.down) return;
  if (state.time - state.alarm.t < 0.5 && dist(ped.x, ped.y, state.alarm.x, state.alarm.y) < 230) {
    ped.panicT = rrange(state.rng, 3, 4.5);
    ped.fleeX = state.alarm.x;
    ped.fleeY = state.alarm.y;
  }
  let speed = 0;
  let a = ped.angle;
  if (ped.panicT > 0) {
    ped.panicT -= dt;
    a = Math.atan2(ped.y - ped.fleeY, ped.x - ped.fleeX);
    speed = 148;
  } else if (ped.waitT > 0) {
    ped.waitT -= dt;
  } else {
    if (dist(ped.x, ped.y, ped.tx, ped.ty) < 10) {
      // Pick a new wander target that is not inside a building.
      for (let tries = 0; tries < 6; tries++) {
        const tx = clamp(ped.x + rrange(state.rng, -240, 240), 70, WORLD_W - 30);
        const ty = clamp(ped.y + rrange(state.rng, -240, 240), 30, WORLD_H - 30);
        let inside = false;
        for (const b of state.city.colliders) {
          if (circleRectOverlap(tx, ty, 12, b)) { inside = true; break; }
        }
        if (!inside) { ped.tx = tx; ped.ty = ty; break; }
      }
      ped.waitT = rrange(state.rng, 0, 1.6);
    }
    a = Math.atan2(ped.ty - ped.y, ped.tx - ped.x);
    speed = 60;
  }
  if (speed > 0) {
    ped.angle = a;
    const res = slideCircle(state.city.colliders, ped.x, ped.y, Math.cos(a) * speed * dt, Math.sin(a) * speed * dt, 9);
    ped.x = res.x;
    ped.y = res.y;
  }
}

function stepBullets(state, dt) {
  const p = state.player;
  for (const b of state.bullets) {
    if (b.dead) continue;
    b.life -= dt;
    if (b.life <= 0) { b.dead = true; continue; }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    let hitWall = false;
    for (const r of state.city.colliders) {
      if (b.x >= r.x && b.x <= r.x + r.w && b.y >= r.y && b.y <= r.y + r.h) { hitWall = true; break; }
    }
    if (hitWall) { b.dead = true; continue; }
    if (b.friendly) {
      for (const off of state.officers) {
        if (!off.down && dist(b.x, b.y, off.x, off.y) < 12) {
          off.hp -= 34;
          if (off.hp <= 0) off.down = true;
          addCrime(state, witnessedNear(state, b.x, b.y, 340) ? 26 : 12);
          b.dead = true;
          break;
        }
      }
      if (b.dead) continue;
      for (const ped of state.peds) {
        if (!ped.down && dist(b.x, b.y, ped.x, ped.y) < 11) {
          ped.down = true;
          addCrime(state, witnessedNear(state, b.x, b.y, 340) ? 38 : 16);
          state.events.push('hit');
          b.dead = true;
          break;
        }
      }
      if (b.dead) continue;
      for (const c of state.cars) {
        if (!c.remove && dist(b.x, b.y, c.x, c.y) < c.r) {
          c.health -= 7;
          b.dead = true;
          break;
        }
      }
    } else {
      if (p.carId) {
        const car = carById(state, p.carId);
        if (car && dist(b.x, b.y, car.x, car.y) < car.r) {
          car.health -= 4;
          b.dead = true;
        }
      } else if (dist(b.x, b.y, p.x, p.y) < PLAYER_RADIUS + 2) {
        p.hp -= 8;
        p.lastHurtAt = state.time;
        state.events.push('hit');
        b.dead = true;
      }
    }
  }
  state.bullets = state.bullets.filter((b) => !b.dead);
}

// Car-vs-car shoving and car-vs-pedestrian consequences, resolved once
// everything has moved.
function resolveContacts(state) {
  const cars = state.cars;
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    if (a.remove) continue;
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j];
      if (b.remove) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = a.r + b.r - 2;
      if (d <= 0.01 || d >= min) continue;
      const push = (min - d) / 2;
      const nx = dx / d;
      const ny = dy / d;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
      const impact = Math.max(Math.abs(a.speed), Math.abs(b.speed));
      if (impact > 120) {
        a.health -= (impact - 120) * 0.05;
        b.health -= (impact - 120) * 0.05;
        const involvesPlayer = state.player.carId === a.id || state.player.carId === b.id;
        if (involvesPlayer) {
          state.events.push('crash');
          state.shake = Math.min(9, (impact - 120) / 24);
          state.alarm = { x: state.player.x, y: state.player.y, t: state.time };
          if (witnessedNear(state, state.player.x, state.player.y, 340)) addCrime(state, 5);
        }
        a.speed *= 0.6;
        b.speed *= 0.6;
      }
    }
  }
  for (const car of cars) {
    if (car.remove || Math.abs(car.speed) < 66) continue;
    for (const ped of state.peds) {
      if (ped.down) continue;
      if (dist(car.x, car.y, ped.x, ped.y) < car.r + 9) {
        ped.down = true;
        state.events.push('hit');
        state.alarm = { x: ped.x, y: ped.y, t: state.time };
        if (car.id === state.player.carId) addCrime(state, 24);
      }
    }
  }
}

function updateHeatAndBust(state, dt) {
  const stars = starsOf(state);
  // Police presence slows the cooling; out of sight and quiet, heat fades
  // (but never below an active mission's heat floor).
  let observed = false;
  for (const c of state.cars) {
    if (c.kind === 'police' && dist(c.x, c.y, state.player.x, state.player.y) < 460) { observed = true; break; }
  }
  if (!observed) {
    for (const o of state.officers) {
      if (!o.down && dist(o.x, o.y, state.player.x, state.player.y) < 460) { observed = true; break; }
    }
  }
  if (state.time - state.lastCrimeAt > 7 && !observed) {
    state.heat = Math.max(state.heatFloor, state.heat - 1.7 * dt);
  }
  if (state.heatFloor > 0) state.heat = Math.max(state.heat, state.heatFloor);
  state.heat = clamp(state.heat, 0, HEAT_MAX);

  // Bust pressure: capped no matter how many units pile on, so a careful
  // player can always break it by getting moving again.
  let pressure = 0;
  if (state.playerSpeed < 55) {
    for (const o of state.officers) {
      if (!o.down && dist(o.x, o.y, state.player.x, state.player.y) < 30) pressure += 40;
    }
    for (const c of state.cars) {
      if (c.kind === 'police' && dist(c.x, c.y, state.player.x, state.player.y) < 64) pressure += 24;
    }
  }
  pressure = Math.min(pressure, 55);
  if (pressure > 0) state.bust = Math.min(100, state.bust + pressure * dt);
  else state.bust = Math.max(0, state.bust - 16 * dt);

  if (state.bust >= 100 && !state.outcome) {
    state.lastFine = Math.min(state.player.cash, 120 + 40 * stars);
    state.player.cash -= state.lastFine;
    state.outcome = 'busted';
    state.events.push('busted');
    state.heat = 0;
    state.bust = 0;
  }
  if (state.player.hp <= 0 && !state.outcome) {
    state.lastFine = Math.min(state.player.cash, 100);
    state.player.cash -= state.lastFine;
    state.outcome = 'down';
    state.events.push('down');
    state.heat = 0;
    state.bust = 0;
  }
}

export function stepWorld(state, intent, dt) {
  state.time += dt;
  for (const t of state.toasts) t.t -= dt;
  state.toasts = state.toasts.filter((t) => t.t > 0);
  if (state.outcome) return;

  state.shotCd -= dt;
  state.shake = Math.max(0, state.shake - dt * 22);

  stepPlayer(state, intent, dt);
  if (state.outcome) return;

  for (const car of state.cars) {
    if (car.remove || car.id === state.player.carId) continue;
    if (car.kind === 'traffic') stepTrafficCar(state, car, dt);
    else if (car.kind === 'police') stepPoliceCar(state, car, dt);
  }

  // Police fleet manager: field interceptors up to the star count, retire
  // distant ones once the heat is gone.
  state.policeTimer -= dt;
  if (state.policeTimer <= 0) {
    state.policeTimer = 0.45;
    const stars = starsOf(state);
    const fleet = state.cars.filter((c) => c.kind === 'police' && !c.remove);
    if (stars > 0 && fleet.length < Math.min(stars, 5)) spawnPoliceCar(state, 430);
    if (stars === 0) {
      for (const c of fleet) {
        if (dist(c.x, c.y, state.player.x, state.player.y) > 760) c.remove = true;
      }
    }
  }
  // Foot officers deploy at two stars and up, never against a fast car.
  state.officerTimer -= dt;
  if (state.officerTimer <= 0) {
    state.officerTimer = 0.6;
    const stars = starsOf(state);
    const alive = state.officers.filter((o) => !o.down);
    const desired = stars >= 2 && state.playerSpeed <= 200 ? Math.min(2 + stars, 5) : 0;
    if (alive.length < desired) spawnOfficer(state);
    state.officers = state.officers.filter(
      (o) => o.down || dist(o.x, o.y, state.player.x, state.player.y) <= 820,
    );
  }
  for (const off of state.officers) stepOfficer(state, off, dt);
  for (const ped of state.peds) stepPed(state, ped, dt);

  stepBullets(state, dt);
  resolveContacts(state);
  state.cars = state.cars.filter((c) => !c.remove);

  updateHeatAndBust(state, dt);
  updateMission(state, dt);
}
