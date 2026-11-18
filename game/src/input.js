// Keyboard and mouse input. Produces one plain intent object per frame;
// the simulation never touches the DOM, so tests and staged shot scenes
// can feed it scripted intents with exactly the same shape.

export function emptyIntent() {
  return {
    mx: 0, my: 0,        // on-foot movement, -1..1 per axis
    drive: 0, steer: 0,  // car controls: throttle -1..1, steering -1..1
    enter: false,        // edge: get in / out of a car
    shoot: false,        // held: fire the pistol (on foot)
    aimX: 0, aimY: 0,    // world-space aim point
    pause: false,        // edge
    save: false, load: false, // edges (K / L)
    confirm: false,      // edge: Enter / Space / click, for screens
  };
}

export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set();
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;

  function onKeyDown(e) {
    if (e.code === 'Space') e.preventDefault();
    if (!e.repeat) pressed.add(e.code);
    keys.add(e.code);
  }
  function onKeyUp(e) {
    keys.delete(e.code);
  }
  function onMouseMove(e) {
    const r = canvas.getBoundingClientRect();
    mouseX = (e.clientX - r.left) * (canvas.width / r.width);
    mouseY = (e.clientY - r.top) * (canvas.height / r.height);
  }
  function onMouseDown(e) {
    if (e.button === 0) {
      mouseDown = true;
      pressed.add('Mouse0');
    }
  }
  function onMouseUp(e) {
    if (e.button === 0) mouseDown = false;
  }
  function onContext(e) {
    e.preventDefault();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('contextmenu', onContext);

  function axis(negCodes, posCodes) {
    let v = 0;
    for (const c of negCodes) if (keys.has(c)) v -= 1;
    for (const c of posCodes) if (keys.has(c)) v += 1;
    return v;
  }

  // camX/camY: world coordinates of the view's top-left corner, for aim.
  function intent(camX, camY) {
    const it = emptyIntent();
    it.mx = axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']);
    it.my = axis(['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown']);
    it.drive = -it.my;
    it.steer = it.mx;
    it.enter = pressed.has('KeyF') || pressed.has('KeyE');
    it.shoot = mouseDown;
    it.aimX = camX + mouseX;
    it.aimY = camY + mouseY;
    it.pause = pressed.has('Escape') || pressed.has('KeyP');
    it.save = pressed.has('KeyK');
    it.load = pressed.has('KeyL');
    it.confirm = pressed.has('Enter') || pressed.has('Space') || pressed.has('Mouse0');
    return it;
  }

  function postStep() {
    pressed.clear();
  }

  function dispose() {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    canvas.removeEventListener('mousemove', onMouseMove);
    canvas.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mouseup', onMouseUp);
    canvas.removeEventListener('contextmenu', onContext);
  }

  return { intent, postStep, dispose };
}
