// Builds Marina Solis as pure data: the road grid, ~44 named pastel
// buildings, the nine landmarks, palm trees and parking spots. The world
// module animates all of this; nothing here knows about gameplay.

import { WORLD_W, WORLD_H, AVENUE_XS, STREET_YS, ROAD_HALF, SAND_EDGE, TRAFFIC_MODELS, CAR_MODELS } from './config.js';
import { mulberry32, rrange, rint, pick } from './random.js';

const SHOP_WORDS = ['Hotel', 'Cafe', 'Bar', 'Tienda', 'Banco', 'Cine', 'Farmacia', 'Panaderia', 'Joyeria', 'Floristeria', 'Gimnasio', 'Libreria', 'Peluqueria', 'Taller'];
const NAME_WORDS = ['Azul', 'Palmera', 'Coral', 'Brisa', 'Sol', 'Marina', 'Oro', 'Perla', 'Coco', 'Mango', 'Ola', 'Arena', 'Palma', 'Estrella', 'Vela', 'Duna'];
const PASTELS = ['#f2c9a0', '#eeb4b4', '#bfe3c6', '#a8cbe8', '#f6e3a1', '#d9c2e8', '#ffd9b3', '#b8e0dd', '#f3b8d0', '#cfd8a8'];

// Block (avenue gap i, street gap j) -> [x, y, w, h] of the block interior.
function blockRect(i, j) {
  const x = AVENUE_XS[i] + ROAD_HALF;
  const y = STREET_YS[j] + ROAD_HALF;
  const w = AVENUE_XS[i + 1] - ROAD_HALF - x;
  const h = STREET_YS[j + 1] - ROAD_HALF - y;
  return { x, y, w, h };
}

// The nine landmarks, hand-placed. `front` is the kerbside point missions
// and respawns aim at: always clear of the building itself.
const LANDMARK_DEFS = [
  { id: 'mercado',   name: 'Mercado Central',    rect: [1010, 950, 260, 240],  front: [1140, 1212] },
  { id: 'precinct',  name: 'Solis PD Precinct',  rect: [1970, 950, 260, 240],  front: [2100, 1212] },
  { id: 'clinica',   name: 'Clinica Palma',      rect: [2450, 1490, 260, 240], front: [2580, 1752] },
  { id: 'pawn',      name: 'Sunset Pawn',        rect: [1500, 420, 220, 190],  front: [1610, 632] },
  { id: 'chopshop',  name: 'Solis Chop Shop',    rect: [2920, 410, 240, 210],  front: [3040, 642] },
  { id: 'crashpad',  name: 'The Crash Pad',      rect: [540, 2030, 220, 200],  front: [650, 2252] },
  { id: 'airfield',  name: 'Solis Airfield',     rect: [2900, 2010, 300, 220], front: [3050, 2252] },
  { id: 'docks',     name: 'Marina Solis Docks', rect: [300, 1000, 44, 260],   front: [372, 1130] },
  { id: 'faro',      name: 'Faro de Solis',      rect: [216, 2480, 46, 46],    front: [292, 2503] },
];
const LANDMARK_BLOCKS = new Set(['1,1', '3,1', '4,2', '2,0', '5,0', '0,3', '5,3']);

export function buildCity(seed) {
  const rng = mulberry32(seed);
  const buildings = [];
  const landmarks = {};
  const landmarkList = [];

  for (const def of LANDMARK_DEFS) {
    const [x, y, w, h] = def.rect;
    const lm = {
      id: def.id, name: def.name, x, y, w, h, landmark: true,
      color: '#e8d9a8', front: { x: def.front[0], y: def.front[1] },
    };
    buildings.push(lm);
    landmarks[def.id] = lm;
    landmarkList.push(lm);
  }

  // Named pastel buildings fill the remaining blocks, two or three each.
  const usedNames = new Set();
  let combo = 0;
  function freshName() {
    for (let tries = 0; tries < 40; tries++) {
      combo++;
      const name = SHOP_WORDS[combo % SHOP_WORDS.length] + ' ' + NAME_WORDS[Math.floor(combo / SHOP_WORDS.length) % NAME_WORDS.length];
      if (!usedNames.has(name)) { usedNames.add(name); return name; }
    }
    return 'Local ' + combo;
  }
  for (let i = 0; i < AVENUE_XS.length - 1; i++) {
    for (let j = 0; j < STREET_YS.length - 1; j++) {
      if (LANDMARK_BLOCKS.has(i + ',' + j)) continue;
      const b = blockRect(i, j);
      const spots = [
        { x: b.x + 18, y: b.y + 34, w: 166, h: 178 },
        { x: b.x + 200, y: b.y + 34, w: 166, h: 178 },
      ];
      if (rng() < 0.62) spots.push({ x: b.x + 104, y: b.y + 252, w: 176, h: 148 });
      for (const s of spots) {
        buildings.push({ ...s, name: freshName(), color: pick(rng, PASTELS), landmark: false });
      }
    }
  }

  // Palms: a promenade row along the sand, plus scattered block corners.
  const palms = [];
  for (let y = 120; y < WORLD_H - 80; y += 92) {
    palms.push({ x: SAND_EDGE + 14 + rrange(rng, -6, 10), y: y + rrange(rng, -14, 14) });
  }
  for (let n = 0; n < 42; n++) {
    const i = rint(rng, 0, AVENUE_XS.length - 2);
    const j = rint(rng, 0, STREET_YS.length - 2);
    const b = blockRect(i, j);
    palms.push({ x: b.x + rrange(rng, 6, b.w - 6), y: b.y + rrange(rng, 6, 26) });
  }

  // Parking spots along avenue and street kerbs. A spot is dropped when it
  // sits within 88 px of a landmark front, so mission spawns never land on
  // top of a doorway and treadmill against the building.
  const candidates = [];
  for (const ax of AVENUE_XS) {
    for (const side of [-1, 1]) {
      for (let j = 0; j < STREET_YS.length - 1; j++) {
        const top = STREET_YS[j] + ROAD_HALF;
        for (let k = 0; k < 3; k++) {
          candidates.push({ x: ax + side * (ROAD_HALF + 14), y: top + 66 + k * 148, angle: side < 0 ? Math.PI / 2 : -Math.PI / 2 });
        }
      }
    }
  }
  for (const sy of STREET_YS) {
    for (const side of [-1, 1]) {
      for (let i = 0; i < AVENUE_XS.length - 1; i++) {
        const left = AVENUE_XS[i] + ROAD_HALF;
        for (let k = 0; k < 2; k++) {
          candidates.push({ x: left + 92 + k * 176, y: sy + side * (ROAD_HALF + 14), angle: side < 0 ? 0 : Math.PI });
        }
      }
    }
  }
  const fronts = landmarkList.map((lm) => lm.front);
  const clear = candidates.filter((s) => fronts.every((f) => {
    const dx = s.x - f.x;
    const dy = s.y - f.y;
    return dx * dx + dy * dy > 88 * 88;
  }));
  // Deterministic shuffle, then keep 58 spots spread across the city.
  for (let n = clear.length - 1; n > 0; n--) {
    const m = Math.floor(rng() * (n + 1));
    const tmp = clear[n]; clear[n] = clear[m]; clear[m] = tmp;
  }
  const parkedSpots = clear.slice(0, 58).map((s) => {
    const model = pick(rng, TRAFFIC_MODELS);
    return { ...s, model, color: pick(rng, CAR_MODELS[model].colors) };
  });

  return {
    buildings,
    landmarks,
    landmarkList,
    palms,
    parkedSpots,
    colliders: buildings,
  };
}

// Nearest grid intersection to a point (traffic and police think in these).
export function nearestIntersection(x, y) {
  let bx = AVENUE_XS[0];
  let by = STREET_YS[0];
  for (const ax of AVENUE_XS) if (Math.abs(ax - x) < Math.abs(bx - x)) bx = ax;
  for (const sy of STREET_YS) if (Math.abs(sy - y) < Math.abs(by - y)) by = sy;
  return { x: bx, y: by };
}

export function isOnRoad(x, y) {
  for (const ax of AVENUE_XS) if (Math.abs(x - ax) <= ROAD_HALF) return true;
  for (const sy of STREET_YS) if (Math.abs(y - sy) <= ROAD_HALF) return true;
  return false;
}
