// Staged, deterministic scenes for screenshots. Each scene builds a
// specific game moment from the fixed seed — a three-star chase with a
// live objective, a quiet moment on foot by the Mercado, a timed delivery
// mid-run — then drives it with scripted intents until it is ready to be
// photographed. The boot module runs a scene synchronously and sets
// window.__shotReady when the frame is final.

import { angleDiff, clamp, dist } from './physics.js';
import { nearestIntersection } from './city.js';
import { emptyIntent } from './input.js';
import { stepWorld, objectiveOf, starsOf, debugStartMission, debugSetStep, debugSpawnPolice, debugPlacePoliceCar } from './world.js';

export const SHOT_NAMES = ['chase', 'street', 'delivery', 'title'];

// Route on the road grid: nearest intersection (skipped when it lies
// behind us — no U-turns), then across and along in whichever order the
// dominant axis suggests, then the final hop. `flip` picks the other
// corner, which the driver uses to reroute around a jam.
function gridWaypoints(state, tx, ty, flip) {
  const p = state.player;
  const start = nearestIntersection(p.x, p.y);
  const end = nearestIntersection(tx, ty);
  const pts = [];
  const towardEndX = end.x - p.x;
  const towardEndY = end.y - p.y;
  const towardStartX = start.x - p.x;
  const towardStartY = start.y - p.y;
  const startAhead = towardStartX * towardEndX + towardStartY * towardEndY > 0;
  if (dist(p.x, p.y, start.x, start.y) > 26 && startAhead) pts.push({ x: start.x, y: start.y });
  const horizontalFirst = (Math.abs(end.x - start.x) >= Math.abs(end.y - start.y)) !== !!flip;
  const corner = horizontalFirst ? { x: end.x, y: start.y } : { x: start.x, y: end.y };
  const last = pts.length ? pts[pts.length - 1] : { x: p.x, y: p.y };
  if (dist(corner.x, corner.y, last.x, last.y) > 12) pts.push(corner);
  const last2 = pts.length ? pts[pts.length - 1] : { x: p.x, y: p.y };
  if (dist(end.x, end.y, last2.x, last2.y) > 12) pts.push({ x: end.x, y: end.y });
  pts.push({ x: tx, y: ty });
  return pts;
}

// An autopilot that walks or drives the player along grid waypoints.
// Progress is watched: if the car stops gaining on a waypoint it backs
// out and tries again, which unsticks it from parked cars and corners.
export function createDriver() {
  return {
    waypoints: [],
    target: null,
    reverseSteps: 0,
    bestDist: Infinity,
    stallSteps: 0,
    stallCycles: 0,
    flip: false,
    setTarget(state, tx, ty) {
      this.target = { x: tx, y: ty };
      this.waypoints = gridWaypoints(state, tx, ty, this.flip);
      this.bestDist = Infinity;
      this.stallSteps = 0;
      this.stallCycles = 0;
      this.reverseSteps = 0;
    },
    get arrived() {
      return this.target === null;
    },
    next(state) {
      const it = emptyIntent();
      const p = state.player;
      if (!this.target) return it;
      let wp = this.waypoints[0];
      while (wp && dist(p.x, p.y, wp.x, wp.y) < (p.carId ? 36 : 16)) {
        this.waypoints.shift();
        this.stallCycles = 0;
        wp = this.waypoints[0];
      }
      if (!wp) {
        this.target = null;
        return it;
      }
      const d = dist(p.x, p.y, wp.x, wp.y);
      if (d < this.bestDist - 4) {
        this.bestDist = d;
        this.stallSteps = 0;
      } else {
        this.stallSteps++;
      }
      // Local avoidance: if another car blocks the line ahead, bias the
      // aim point to the side with room instead of ramming it forever.
      let aimPointX = wp.x;
      let aimPointY = wp.y;
      if (p.carId) {
        const fx = Math.cos(p.angle);
        const fy = Math.sin(p.angle);
        for (const c of state.cars) {
          if (c.id === p.carId || c.remove) continue;
          const rx = c.x - p.x;
          const ry = c.y - p.y;
          const ahead = rx * fx + ry * fy;
          if (ahead < 6 || ahead > 95) continue;
          const side = rx * -fy + ry * fx;
          if (Math.abs(side) < 30) {
            const dodge = side > 0 ? -54 : 54;
            aimPointX += -fy * dodge;
            aimPointY += fx * dodge;
            break;
          }
        }
      }
      const desired = Math.atan2(aimPointY - p.y, aimPointX - p.x);
      it.aimX = p.x + Math.cos(desired) * 120;
      it.aimY = p.y + Math.sin(desired) * 120;
      if (this.reverseSteps > 0) {
        this.reverseSteps--;
        it.drive = -1;
        it.steer = clamp(angleDiff(p.angle, desired) * 1.2, -1, 1);
        return it;
      }
      if (p.carId && this.stallSteps > 110) {
        this.reverseSteps = 26;
        this.stallSteps = 0;
        this.bestDist = Infinity;
        this.stallCycles++;
        if (this.stallCycles >= 2 && this.target) {
          // Twice stuck on this route: take the other corner of the grid.
          this.flip = !this.flip;
          this.waypoints = gridWaypoints(state, this.target.x, this.target.y, this.flip);
          this.stallCycles = 0;
        }
        return it;
      }
      if (p.carId) {
        const diff = angleDiff(p.angle, desired);
        it.steer = clamp(diff * 1.7, -1, 1);
        it.drive = Math.abs(diff) < 1.05 ? 1 : 0.2;
      } else {
        it.mx = Math.cos(desired);
        it.my = Math.sin(desired);
      }
      return it;
    },
  };
}

function placePlayerInCar(state, car, x, y, angle, speed) {
  car.x = x;
  car.y = y;
  car.angle = angle;
  car.speed = speed || 0;
  state.player.x = x;
  state.player.y = y;
  state.player.angle = angle;
  state.player.carId = car.id;
}

function stageShot(state, name) {
  const driver = createDriver();
  if (name === 'chase') {
    debugStartMission(state, 0);
    const marked = state.cars.find((c) => c.marked);
    // Already rolling east along the street when the frame opens, the
    // Chop Shop run ahead of it — and one interceptor already on its
    // tail, with the fleet manager fielding the rest at range.
    placePlayerInCar(state, marked, 700, 840 + 17, 0, 205);
    marked.stolenBefore = true;
    debugSetStep(state, 1); // the delivery leg, objective live
    state.heat = 100; // three stars
    debugPlacePoliceCar(state, 270, 840 + 17, 0, 260);
    const obj = objectiveOf(state);
    driver.setTarget(state, obj.x, obj.y);
    return {
      driver,
      ready: (s, steps) => {
        // Early in the run, while it is still exactly three stars: full
        // speed, the placed interceptor in frame behind, no bust yet.
        if (steps < 70 || s.playerSpeed <= 200 || s.bust >= 45 || starsOf(s) !== 3) return false;
        for (const c of s.cars) {
          if (c.kind === 'police' && dist(c.x, c.y, s.player.x, s.player.y) < 560) return true;
        }
        return false;
      },
    };
  }
  if (name === 'street') {
    debugStartMission(state, 0);
    const front = state.city.landmarks.mercado.front;
    state.player.x = front.x + 38;
    state.player.y = front.y + 34;
    const marked = state.cars.find((c) => c.marked);
    if (marked) state.player.angle = Math.atan2(marked.y - state.player.y, marked.x - state.player.x);
    // A few locals near the market doors, and a taxi rolling past.
    state.peds.slice(0, 3).forEach((ped, i) => {
      ped.x = front.x - 30 + i * 30;
      ped.y = front.y + 12 + i * 9;
      ped.tx = ped.x;
      ped.ty = ped.y;
      ped.waitT = 30;
    });
    const taxi = state.cars.find((c) => c.kind === 'traffic');
    if (taxi) {
      taxi.x = 1380 + 17;
      taxi.y = 990;
      taxi.angle = Math.PI / 2;
      taxi.speed = 118;
      taxi.ai = { ax: 2, sy: 2, dir: 1, reverseT: 0, checkT: 1, lastX: taxi.x, lastY: taxi.y };
    }
    return { driver: null, ready: (s, steps) => steps >= 40 };
  }
  if (name === 'delivery') {
    debugStartMission(state, 1);
    debugSetStep(state, 1); // timed delivery leg, clock running
    let car = null;
    let bestD = Infinity;
    for (const c of state.cars) {
      if (c.kind !== 'parked') continue;
      const d = dist(c.x, c.y, 900, 1920);
      if (d < bestD) { car = c; bestD = d; }
    }
    car.model = 'luxe';
    car.color = '#20242c';
    // Westbound on the northern lane of the street, already rolling: the
    // route to the Crash Pad is a clean L along two roads from here.
    placePlayerInCar(state, car, 1500, 1920 - 17, Math.PI, 150);
    state.heat = 85; // the ambush heat from the pickup
    debugSpawnPolice(state, 1);
    const obj = objectiveOf(state);
    driver.setTarget(state, obj.x, obj.y);
    return {
      driver,
      ready: (s, steps) => steps >= 140 && s.playerSpeed > 110,
    };
  }
  return { driver: null, ready: () => true };
}

// Run a scene to its ready state (or the step budget) and report. A run
// that ends in a bust or a takedown is a failed staging, never a frame.
export function runShot(state, name, maxSteps) {
  const scene = stageShot(state, name);
  let steps = 0;
  while (steps < maxSteps) {
    if (scene.ready(state, steps)) break;
    if (state.outcome) break;
    const it = scene.driver ? scene.driver.next(state) : emptyIntent();
    stepWorld(state, it, 1 / 60);
    steps++;
  }
  return { ready: scene.ready(state, steps) && !state.outcome, steps };
}
