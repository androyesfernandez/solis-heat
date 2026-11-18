// Small 2D physics helpers: circle-vs-rect sliding collision and angle
// math. Sliding is axis-separated (move X, resolve, move Y, resolve) so a
// body glides along a wall instead of sticking to it or blending through.

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function dist(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

// Smallest signed turn from angle a to angle b, in (-PI, PI].
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function pointInRect(x, y, r) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

export function circleRectOverlap(x, y, rad, r) {
  const cx = clamp(x, r.x, r.x + r.w);
  const cy = clamp(y, r.y, r.y + r.h);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy < rad * rad;
}

// Move a circle by (dx, dy) against rect colliders, one axis at a time.
// Returns the resolved position plus flags telling the caller which axes
// were blocked, so it can price a head-on crash vs a grazing scrape.
export function slideCircle(colliders, x, y, dx, dy, rad) {
  let hitX = false;
  let hitY = false;
  let nx = x + dx;
  for (const r of colliders) {
    if (circleRectOverlap(nx, y, rad, r)) {
      nx = dx > 0 ? r.x - rad : r.x + r.w + rad;
      hitX = true;
    }
  }
  let ny = y + dy;
  for (const r of colliders) {
    if (circleRectOverlap(nx, ny, rad, r)) {
      ny = dy > 0 ? r.y - rad : r.y + r.h + rad;
      hitY = true;
    }
  }
  return { x: nx, y: ny, hitX, hitY };
}
