// The 3D town. Pure view: it gets buildings (id, name, status, kind) and calls onSelect(id).
// Nothing here knows about numbers. Rendering pauses when the town is off screen or the tab is hidden.
/* global THREE */
import { STATUS_TEXT } from './data/format.js';

const RING = { red: 0xd03b3b, amber: 0xfab219, green: 0x0ca30c, grey: 0x898781, hq: 0x1a3a26 };

function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

export function createTown({ container, canvas, labelsEl, buildings, onSelect }) {
  if (!window.THREE || !THREE.OrbitControls) throw new Error('3D library did not load');

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);

  const applyTheme = () => {
    scene.background = new THREE.Color(css('--sky') || '#eef2ef');
    ground.material.color = new THREE.Color(css('--surface') || '#fcfcfb');
    render();
  };

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a9a8f, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 0.7);
  sun.position.set(20, 40, 15);
  scene.add(sun);

  const ground = new THREE.Mesh(new THREE.CircleGeometry(34, 64), new THREE.MeshLambertMaterial({ color: 0xfcfcfb }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const plaza = new THREE.Mesh(new THREE.RingGeometry(7.5, 8.2, 64), new THREE.MeshBasicMaterial({ color: 0xc3c2b7 }));
  plaza.rotation.x = -Math.PI / 2; plaza.position.y = 0.01;
  scene.add(plaza);

  const pickables = [];
  const nodes = [];
  const others = buildings.filter((b) => b.kind !== 'hq');
  const radius = 17;

  buildings.forEach((b) => {
    const g = new THREE.Group();
    let x = 0, z = 0;
    if (b.kind !== 'hq') {
      const i = others.indexOf(b);
      const a = (i / others.length) * Math.PI * 2 - Math.PI / 2;
      x = Math.cos(a) * radius; z = Math.sin(a) * radius;
    }
    g.position.set(x, 0, z);

    const body = new THREE.MeshLambertMaterial({ color: b.kind === 'hq' ? 0x2c4a36 : 0xe8e6df });
    const trim = new THREE.MeshLambertMaterial({ color: 0xb9b6ac });
    let height;
    if (b.kind === 'hq') {
      height = 11;
      const tower = new THREE.Mesh(new THREE.BoxGeometry(4.5, height, 4.5), body);
      tower.position.y = height / 2; g.add(tower);
      const crown = new THREE.Mesh(new THREE.ConeGeometry(2.4, 3, 4), new THREE.MeshLambertMaterial({ color: 0x92bf9a }));
      crown.position.y = height + 1.5; crown.rotation.y = Math.PI / 4; g.add(crown);
      height += 3;
    } else if (b.kind === 'bank') {
      height = 4.5;
      const base = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.6, 4), trim); base.position.y = 0.3; g.add(base);
      for (let c = 0; c < 4; c++) {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 3, 12), body);
        col.position.set(-2 + c * 1.33, 2.1, 1.4); g.add(col);
      }
      const hall = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 2.4), body); hall.position.set(0, 2.1, -0.4); g.add(hall);
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 3.4, 1.2, 4, 1), trim);
      roof.scale.set(1, 1, 0.6); roof.rotation.y = Math.PI / 4; roof.position.y = 4.2; g.add(roof);
      height = 4.8;
    } else {
      height = 3.5 + ((b.name.length * 7) % 5);
      const box = new THREE.Mesh(new THREE.BoxGeometry(4, height, 4), body);
      box.position.y = height / 2; g.add(box);
      // window bands so it reads as a building
      for (let y = 1.2; y < height - 0.5; y += 1.3) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(4.05, 0.35, 4.05), trim);
        band.position.y = y; g.add(band);
      }
    }

    const ringMat = new THREE.MeshBasicMaterial({ color: RING[b.status] ?? RING.grey });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(b.kind === 'hq' ? 4.6 : 3.9, 0.38, 10, 48), ringMat);
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.25;
    g.add(ring);

    // invisible hit box, a bit bigger than the building, so taps are easy on a phone
    const hit = new THREE.Mesh(new THREE.BoxGeometry(6.5, height + 2, 6.5), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = (height + 2) / 2; hit.userData.id = b.id;
    g.add(hit); pickables.push(hit);

    scene.add(g);

    const label = document.createElement('button');
    label.type = 'button';
    label.className = `blabel ${b.status}`;
    const t = STATUS_TEXT[b.status] || STATUS_TEXT.grey;
    label.innerHTML = `<b>${b.short}</b> <span aria-hidden="true">${t.icon}</span><span class="sr"> — ${t.word}</span>`;
    label.setAttribute('aria-label', `${b.name}: ${t.word}`);
    label.addEventListener('click', () => onSelect(b.id));
    labelsEl.appendChild(label);

    nodes.push({ b, g, ring, label, top: new THREE.Vector3(x, height + 1.2, z) });
  });

  const controls = new THREE.OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.minDistance = 25; controls.maxDistance = 110;
  controls.maxPolarAngle = Math.PI * 0.44;
  controls.target.set(0, 0, 3);

  function fit() {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Pull back on tall/narrow screens so the whole ring fits
    const dist = w / h < 1.05 ? 70 : 60;
    if (!fit.done) { camera.position.set(0, dist * 0.78, dist * 0.68); fit.done = true; }
    camera.updateProjectionMatrix();
    render();
  }

  const v = new THREE.Vector3();
  // Project each label to the screen, then nudge overlapping ones upward (nearest buildings keep their spot).
  function placeLabels() {
    const w = container.clientWidth, h = container.clientHeight;
    const items = nodes.map((n) => {
      v.copy(n.top).project(camera);
      return { n, x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h, z: v.z, lw: n.label.offsetWidth || 80, lh: n.label.offsetHeight || 20 };
    }).sort((a, b) => a.z - b.z);
    const placed = [];
    for (const it of items) {
      let y = it.y;
      for (let pass = 0; pass < 4; pass++) {
        const clash = placed.find((p) => Math.abs(p.x - it.x) < (p.lw + it.lw) / 2 + 2 && Math.abs(p.y - y) < (p.lh + it.lh) / 2 + 2);
        if (!clash) break;
        y = clash.y - (clash.lh + it.lh) / 2 - 3;
      }
      const x = Math.min(Math.max(it.x, it.lw / 2 + 4), w - it.lw / 2 - 4);
      placed.push({ x, y, lw: it.lw, lh: it.lh });
      const lab = it.n.label;
      lab.style.display = it.z < 1 ? '' : 'none';
      lab.style.left = `${x}px`;
      lab.style.top = `${Math.max(y, it.lh + 2)}px`;
      lab.style.zIndex = String(Math.round((1 - it.z) * 1000));
    }
  }

  function render() { renderer.render(scene, camera); placeLabels(); }

  // Gentle pulse on red rings only; loop runs only while visible.
  let running = false, onScreen = true;
  const clock = new THREE.Clock();
  function loop() {
    const t = clock.getElapsedTime();
    for (const n of nodes) if (n.b.status === 'red') n.ring.scale.setScalar(1 + Math.sin(t * 3) * 0.05);
    controls.update();
    render();
  }
  function setRunning(on) {
    if (on === running) return;
    running = on;
    renderer.setAnimationLoop(on ? loop : null);
  }
  const syncRun = () => setRunning(onScreen && !document.hidden);
  new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; syncRun(); }, { threshold: 0.05 }).observe(container);
  document.addEventListener('visibilitychange', syncRun);

  // Tap/click picking (ignore drags)
  const ray = new THREE.Raycaster(), p = new THREE.Vector2();
  let down = null;
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
    const r = canvas.getBoundingClientRect();
    p.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(p, camera);
    const hit = ray.intersectObjects(pickables)[0];
    if (hit) onSelect(hit.object.userData.id);
  });

  new ResizeObserver(fit).observe(container);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
  applyTheme();
  fit();
  syncRun();

  return {
    select(id) {
      for (const n of nodes) {
        n.label.classList.toggle('sel', n.b.id === id);
        n.g.position.y = n.b.id === id ? 0.4 : 0;
      }
      render();
    },
  };
}
