// The 3D town: a low-poly, game-style map of Founders Club.
// Pure view: it receives buildings ({ id, name, short, kind, status, keyText, keyCaption, flags, volume })
// and calls onSelect(id). It knows nothing about where numbers come from.
//
// Layout: HQ on a central plaza; the sale road runs lead → appointment → sale → delivery → paid
// (Marketing → Setters → Closers → Fulfillment → Payments → Renewals); the other departments ring the
// back of the plaza; sales regions are neighbourhoods farther out. Rendering pauses off screen.
/* global THREE */
import { STATUS_TEXT } from './data/format.js';

const STATUS_HEX = { red: 0xd03b3b, amber: 0xfab219, green: 0x0ca30c, grey: 0x898781, hq: 0x2f6b4a };
const PRIORITY = { red: 4, amber: 3, green: 2, grey: 1, hq: 5 };

// Where each building stands (x, z). +z is toward the camera's starting side.
const SPOTS = {
  hq: [0, 0],
  marketing: [-32, 9], setters: [-19, 20], admissions: [-2, 25], fulfillment: [16, 21], payments: [29, 11], renewals: [35, -4],
  community: [-29, -9], events: [-20, -22], operations: [-6, -28], admin: [8, -28], ai: [20, -22], cash: [30, -15],
};
const SALE_ROAD = [[-44, 1], [-31, 15], [-19, 13], [-3, 17], [14, 14], [27, 4], [31, -12], [26, -30]];
const STAGES = [['Lead', -30, 15.5], ['Appointment', -18, 13.8], ['Sale', -2, 17.6], ['Delivery', 14.5, 14.6], ['Paid', 27, 4.5]];

function seeded(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }
function cssVar(n, f) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || f; }

export function createTown({ container, canvas, labelsEl, buildings, onSelect, reducedMotion = false }) {
  if (!window.THREE || !THREE.OrbitControls) throw new Error('3D library did not load');

  const isPhone = () => container.clientWidth < 640;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isPhone() ? 1.75 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 1, 600);

  // ---------- materials (one low-poly palette) ----------
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, flatShading: true, ...extra });
  const P = {
    wall: 0xdedad0, wall2: 0xc4bfb2, trim: 0x9f988a, roof: 0x9a4f3a, roofBlue: 0x35557d, glass: 0x4b8fc4, glassDark: 0x24466b,
    gold: 0xe0a92a, road: 0x343a46, line: 0xf2c84b, grass: 0x4f8a3f, grass2: 0x5f9a4c, plaza: 0xd9d1bf, water: 0x3aa3db,
    trunk: 0x6b4428, leaf: 0x2f7a3c, leaf2: 0x3f8f4c, steel: 0x9aa3ad, white: 0xf7f6f2, canvasRed: 0xc94b4b,
  };

  // ---------- lights ----------
  const hemi = new THREE.HemisphereLight(0xdfeeff, 0x3d4a33, 0.7);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 0.9);
  sun.position.set(-40, 70, 45);
  sun.castShadow = true;
  sun.shadow.mapSize.set(isPhone() ? 1024 : 2048, isPhone() ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -75, right: 75, top: 75, bottom: -75, near: 10, far: 220 });
  sun.shadow.bias = -0.0008;
  scene.add(sun);

  // ---------- ground, plaza, river ----------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 260, 1, 1), mat(P.grass));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  const plaza = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 0.3, 40), mat(P.plaza));
  plaza.position.y = 0.15; plaza.receiveShadow = true; scene.add(plaza);
  const ringRoad = new THREE.Mesh(new THREE.RingGeometry(11, 13.4, 64), mat(P.road));
  ringRoad.rotation.x = -Math.PI / 2; ringRoad.position.y = 0.06; ringRoad.receiveShadow = true; scene.add(ringRoad);

  const river = new THREE.Mesh(new THREE.PlaneGeometry(16, 280), mat(P.water, { roughness: 0.3, metalness: 0.1 }));
  river.rotation.x = -Math.PI / 2; river.rotation.z = 0.32; river.position.set(-74, 0.04, 0); river.receiveShadow = true; scene.add(river);

  // ---------- roads ----------
  function roadAlong(points, width, y = 0.05, centreLine = true) {
    const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, y, z)));
    const n = 160, pos = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, p = curve.getPointAt(t), tan = curve.getTangentAt(t);
      const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize().multiplyScalar(width / 2);
      pos.push(p.x + side.x, y, p.z + side.z, p.x - side.x, y, p.z - side.z);
      if (i < n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat(P.road)); m.receiveShadow = true; scene.add(m);
    if (centreLine) {
      const dash = new THREE.BoxGeometry(0.25, 0.02, 1.2), dm = mat(P.line);
      const count = Math.floor(curve.getLength() / 3.2);
      const inst = new THREE.InstancedMesh(dash, dm, count), o = new THREE.Object3D();
      for (let i = 0; i < count; i++) {
        const t = (i + 0.5) / count, p = curve.getPointAt(t), tan = curve.getTangentAt(t);
        o.position.set(p.x, y + 0.02, p.z); o.rotation.set(0, Math.atan2(tan.x, tan.z), 0); o.updateMatrix(); inst.setMatrixAt(i, o.matrix);
      }
      scene.add(inst);
    }
    return curve;
  }
  const saleCurve = roadAlong(SALE_ROAD, 3.6);
  const backCurve = roadAlong([[-44, 1], [-33, -16], [-14, -35], [8, -36], [26, -30]], 3.2);
  const outerCurve = roadAlong([[-58, -30], [-38, -50], [-10, -60], [20, -58], [46, -42], [58, -18]], 3, 0.05, false);

  // ---------- trees (instanced, seeded so the town looks the same every time) ----------
  const rnd = seeded(7);
  const avoid = [...Object.values(SPOTS).map(([x, z]) => [x, z, 7]), [0, 0, 15]];
  const treeSpots = [];
  for (let i = 0; i < 260 && treeSpots.length < 120; i++) {
    const x = rnd() * 150 - 75, z = rnd() * 130 - 70;
    if (Math.abs(x + 74 + z * 0.33) < 11) continue; // river
    if (avoid.some(([ax, az, r]) => Math.hypot(x - ax, z - az) < r)) continue;
    if (Math.hypot(x, z) > 32 && Math.hypot(x, z) < 40 && z < 0) continue; // keep the neighbourhood ring open
    treeSpots.push([x, z, 0.7 + rnd() * 0.6]);
  }
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.32, 1.6, 5), mat(P.trunk), treeSpots.length);
  const crowns = new THREE.InstancedMesh(new THREE.ConeGeometry(1.4, 3, 6), mat(P.leaf), treeSpots.length);
  const o3 = new THREE.Object3D();
  treeSpots.forEach(([x, z, s], i) => {
    o3.position.set(x, 0.8 * s, z); o3.scale.set(s, s, s); o3.rotation.set(0, 0, 0); o3.updateMatrix(); trunks.setMatrixAt(i, o3.matrix);
    o3.position.set(x, (1.6 + 1.5) * s, z); o3.rotation.y = rnd() * 3; o3.updateMatrix(); crowns.setMatrixAt(i, o3.matrix);
  });
  trunks.castShadow = crowns.castShadow = true;
  scene.add(trunks, crowns);

  // ---------- stage signs along the sale road ----------
  const signLabels = [];
  for (const [text, x, z] of STAGES) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.6, 0.2), mat(P.steel)); post.position.set(x, 0.8, z); scene.add(post);
    const el = document.createElement('div'); el.className = 'stageSign'; el.textContent = text; el.setAttribute('aria-hidden', 'true');
    labelsEl.appendChild(el); signLabels.push({ el, pos: new THREE.Vector3(x, 2.1, z) });
  }

  // ---------- building kit ----------
  const box = (w, h, d, m, x = 0, y = h / 2, z = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); return b; };
  const cyl = (rt, rb, h, seg, m, x = 0, y = h / 2, z = 0) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m); c.position.set(x, y, z); return c; };
  function windowBands(g, w, d, h, from, step, m) {
    for (let y = from; y < h - 0.4; y += step) g.add(box(w + 0.06, 0.45, d + 0.06, m, 0, y));
  }

  // Each returns [group, height]. Shapes follow the job: bank for cash, warehouse for delivery, tower for sales…
  const SHAPES = {
    hq(g) {
      const glass = mat(P.glass, { roughness: 0.35, metalness: 0.3 });
      g.add(box(6, 2, 6, mat(P.wall2)));
      g.add(box(4.8, 12, 4.8, glass, 0, 8)); windowBands(g, 4.8, 4.8, 14, 3, 1.4, mat(P.white));
      g.add(box(3.4, 3, 3.4, glass, 0, 15.5)); g.add(cyl(0.12, 0.12, 4, 6, mat(P.steel), 0, 19));
      g.add(cyl(0.45, 0.45, 0.45, 8, mat(STATUS_HEX.red, { emissive: 0x551111 }), 0, 21.2));
      return 21.5;
    },
    bank(g) { // Renewals: cash coming back in
      const w = mat(P.wall);
      g.add(box(8, 0.8, 6, mat(P.trim))); g.add(box(7, 0.5, 5.2, mat(P.wall2), 0, 1.05));
      for (let i = 0; i < 5; i++) g.add(cyl(0.32, 0.36, 3.4, 8, w, -2.8 + i * 1.4, 3, 2.1));
      g.add(box(6.6, 3.4, 3, w, 0, 3, -0.6));
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 4.6, 1.8, 3, 1), mat(P.wall2));
      roof.rotation.set(Math.PI / 2, 0, Math.PI / 2); roof.scale.set(1, 1, 0.45); roof.position.set(0, 5.3, 0); g.add(roof);
      const coin = mat(P.gold, { metalness: 0.4, roughness: 0.4 });
      for (let s = 0; s < 3; s++) for (let k = 0; k < 3 + s; k++) g.add(cyl(0.6, 0.6, 0.22, 10, coin, 4.8 + s * 1.3, 0.11 + k * 0.24, 2.4));
      return 6.2;
    },
    vault(g) { // Payments placeholder: see-through, dashed outline
      const ghost = mat(0xa7adb5, { transparent: true, opacity: 0.32 });
      const v = box(5, 4.4, 4, ghost); g.add(v);
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(v.geometry), new THREE.LineDashedMaterial({ color: 0x4a4f57, dashSize: 0.45, gapSize: 0.3 }));
      e.position.copy(v.position); e.computeLineDistances(); g.add(e);
      const door = cyl(1.3, 1.3, 0.25, 20, ghost, 0, 2.2, 2.05); door.rotation.x = Math.PI / 2; g.add(door);
      return 4.6;
    },
    treasury(g) { // Cash & Finance
      g.add(box(5.6, 3.6, 4.4, mat(P.wall2))); g.add(box(6.2, 0.5, 5, mat(P.trim), 0, 3.85));
      const plate = cyl(1.1, 1.1, 0.2, 16, mat(P.gold, { metalness: 0.4 }), 0, 2, 2.25); plate.rotation.x = Math.PI / 2; g.add(plate);
      return 4.2;
    },
    salesTower(g) { // Closers: the sales tower
      const glass = mat(P.glassDark, { roughness: 0.3, metalness: 0.3 }), band = mat(0x8fc3ea);
      g.add(box(5, 7, 5, glass)); windowBands(g, 5, 5, 7, 1.2, 1.2, band);
      g.add(box(3.8, 5, 3.8, glass, 0, 9.5)); windowBands(g, 3.8, 3.8, 12, 7.8, 1.2, band);
      g.add(box(2.4, 2.4, 2.4, glass, 0, 13.2)); g.add(cyl(0.05, 0.4, 2.6, 6, mat(P.steel), 0, 15.7));
      return 17;
    },
    callCenter(g) { // Setters: booking calls
      g.add(box(6, 4.6, 4.2, mat(P.wall))); windowBands(g, 6, 4.2, 4.6, 1.3, 1.4, mat(P.glass));
      const dish = new THREE.Mesh(new THREE.SphereGeometry(1.3, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2.6), mat(P.white, { side: THREE.DoubleSide }));
      dish.rotation.x = -Math.PI * 0.75; dish.position.set(1.4, 5.6, 0); g.add(dish); g.add(cyl(0.12, 0.12, 1.2, 6, mat(P.steel), 1.4, 5.1));
      return 6.6;
    },
    billboard(g) { // Marketing
      g.add(box(6, 3, 4.4, mat(P.wall)));
      g.add(box(0.3, 4, 0.3, mat(P.steel), -2.4, 5)); g.add(box(0.3, 4, 0.3, mat(P.steel), 2.4, 5));
      g.add(box(6.6, 2.6, 0.3, mat(0xf2c84b), 0, 6.6, 0.2));
      g.add(box(5.6, 0.5, 0.32, mat(0xc94b4b), 0, 7.2, 0.25)); g.add(box(3.6, 0.5, 0.32, mat(P.roofBlue), -0.9, 6.2, 0.25));
      return 8;
    },
    tent(g) { // Events
      const stripes = [mat(P.canvasRed), mat(P.white)];
      for (let i = 0; i < 8; i++) {
        const seg = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 2.6, 8, 1, true, (i / 8) * Math.PI * 2, Math.PI / 4), stripes[i % 2]);
        seg.position.y = 1.3; g.add(seg);
      }
      const top = new THREE.Mesh(new THREE.ConeGeometry(3.8, 2.8, 8), stripes[0]); top.position.y = 4; g.add(top);
      g.add(cyl(0.08, 0.08, 1.6, 5, mat(P.steel), 0, 6)); g.add(box(0.8, 0.45, 0.04, mat(0xf2c84b), 0.42, 6.5));
      return 6.9;
    },
    warehouse(g) { // Fulfillment: delivery
      g.add(box(8, 3.2, 5, mat(P.wall2)));
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 8, 10, 1, false, 0, Math.PI), mat(P.roofBlue));
      roof.rotation.z = Math.PI / 2; roof.rotation.y = Math.PI / 2; roof.position.y = 3.2; g.add(roof);
      for (let i = 0; i < 3; i++) g.add(box(1.6, 2, 0.1, mat(P.steel), -2.6 + i * 2.6, 1, 2.55));
      const crate = mat(0xb9874f);
      [[4.8, 0.5, 2.6], [5.6, 0.5, 2.2], [5.2, 1.4, 2.4]].forEach(([x, y, z]) => g.add(box(0.9, 0.9, 0.9, crate, x, y, z)));
      g.add(box(1.6, 1.4, 2.6, mat(0xd8d8d8), -5.4, 0.9, 1.4)); g.add(box(1.4, 1, 1.2, mat(0xc94b4b), -5.4, 0.7, 3.2));
      return 5.8;
    },
    factory(g) { // Operations
      g.add(box(7, 3, 4.8, mat(P.wall2)));
      for (let i = 0; i < 3; i++) {
        const tooth = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 1.3, 1.4, 3), mat(P.roofBlue));
        tooth.rotation.set(0, 0, Math.PI / 2); tooth.rotation.y = Math.PI / 2; tooth.scale.set(1, 1, 3.6); tooth.position.set(-2.3 + i * 2.3, 3.7, 0); g.add(tooth);
      }
      g.add(cyl(0.5, 0.7, 6, 8, mat(0x9b5b44), 2.8, 3, -1.4));
      return 6.2;
    },
    office(g) { // Admin & People
      g.add(box(5, 6.4, 4.2, mat(P.wall))); windowBands(g, 5, 4.2, 6.4, 1.3, 1.5, mat(P.glass));
      g.add(box(5.4, 0.4, 4.6, mat(P.trim), 0, 6.6));
      const clock = cyl(0.9, 0.9, 0.15, 16, mat(P.white), 0, 5.4, 2.18); clock.rotation.x = Math.PI / 2; g.add(clock);
      return 7.2;
    },
    datacenter(g) { // CTO / AI
      g.add(box(6, 2.8, 4.6, mat(0x5a6573)));
      for (let i = 0; i < 6; i++) g.add(box(0.25, 2.2, 4.7, mat(0x3c4552), -2.5 + i, 1.2));
      g.add(cyl(0.08, 0.16, 6, 5, mat(P.steel), 2.3, 5.8, -1.4)); g.add(cyl(0.25, 0.25, 0.25, 8, mat(P.white), 2.3, 8.9, -1.4));
      return 9;
    },
    clubhouse(g) { // Community & RDs
      g.add(box(6.4, 3, 4.6, mat(P.wall)));
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 4, 2, 4), mat(P.roof)); roof.rotation.y = Math.PI / 4; roof.scale.set(1.15, 1, 0.85); roof.position.y = 4; g.add(roof);
      g.add(box(1.2, 2, 0.1, mat(0x6b4a33), 0, 1, 2.35));
      g.add(cyl(0.07, 0.07, 6, 5, mat(P.steel), 3.4, 3, 1.8)); g.add(box(1.2, 0.7, 0.05, mat(0x2f6b4a), 4, 5.6, 1.8));
      return 6.2;
    },
    house(g, variant = 0) { // a region's main house
      const walls = [P.wall, 0xf0dcc3, 0xdfe7ee][variant % 3];
      g.add(box(3.2, 2.4, 3, mat(walls)));
      const roof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.8, 4), mat(P.roof)); roof.rotation.y = Math.PI / 4; roof.position.y = 3.3; g.add(roof);
      g.add(box(0.8, 1.3, 0.08, mat(0x6b4a33), 0, 0.65, 1.52));
      return 4.2;
    },
  };
  const SHAPE_FOR = {
    hq: 'hq', renewals: 'bank', payments: 'vault', cash: 'treasury', admissions: 'salesTower', setters: 'callCenter', marketing: 'billboard',
    events: 'tent', fulfillment: 'warehouse', operations: 'factory', admin: 'office', ai: 'datacenter', community: 'clubhouse',
  };

  // Regions: neighbourhoods on an arc behind the departments.
  const regionList = buildings.filter((b) => b.kind === 'region');
  regionList.forEach((b, i) => {
    const a = Math.PI * (1.12 + (0.76 * i) / Math.max(1, regionList.length - 1));
    SPOTS[b.id] = [Math.cos(a) * 50, Math.sin(a) * 42 - 4];
  });

  // ---------- place buildings ----------
  const nodes = [];
  const pickables = [];
  buildings.forEach((b) => {
    const spot = SPOTS[b.id]; if (!spot) return;
    const [x, z] = spot;
    const root = new THREE.Group(); root.position.set(x, 0, z);
    root.rotation.y = Math.atan2(-x, -z) + Math.PI; // face the plaza
    if (b.kind === 'hq') root.rotation.y = 0;

    // pad + status ring
    const padR = b.kind === 'region' ? 5.4 : b.kind === 'hq' ? 0 : 5.6;
    if (padR) {
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(padR, padR, 0.2, 32), mat(b.kind === 'region' ? P.grass2 : P.plaza));
      pad.position.y = 0.1; pad.receiveShadow = true; root.add(pad);
    }
    const ringMat = new THREE.MeshBasicMaterial({ color: STATUS_HEX[b.status] ?? STATUS_HEX.grey, transparent: true, opacity: 0.95 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(b.kind === 'hq' ? 9.6 : padR - 0.25, b.kind === 'hq' ? 0.32 : 0.28, 6, 56), ringMat);
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.24; root.add(ring);

    // the building, scaled by volume on a capped scale
    const body = new THREE.Group();
    let h;
    if (b.kind === 'region') {
      h = SHAPES.house(body, nodes.length);
      // two smaller neighbour houses and a fence make it read as a neighbourhood
      [[-3.6, 1.2], [3.4, 1.6]].forEach(([dx, dz], k) => {
        const n = new THREE.Group(); SHAPES.house(n, k + 1); n.scale.setScalar(0.62); n.position.set(dx, 0, dz); root.add(n);
        n.traverse((m) => { if (m.isMesh) m.castShadow = true; });
      });
    } else {
      h = SHAPES[SHAPE_FOR[b.id] || 'office'](body);
    }
    const f = b.volume && b.volume.cap ? 0.75 + 0.6 * Math.min(b.volume.value, b.volume.cap) / b.volume.cap : 1;
    body.scale.y = f; h *= f;
    body.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    root.add(body);

    // invisible, generous hit area for taps
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(padR || 6, padR || 6, h + 2, 12), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = (h + 2) / 2; hit.userData.id = b.id; root.add(hit); pickables.push(hit);
    scene.add(root);

    // floating tag (HTML so text stays crisp) + flag badge
    const t = STATUS_TEXT[b.status] || STATUS_TEXT.grey;
    const tag = document.createElement('button');
    tag.type = 'button';
    tag.className = `tag ${b.status}${b.kind === 'placeholder' ? ' mock' : ''}${b.kind === 'region' ? ' region' : ''}`;
    tag.setAttribute('aria-label', `${b.name}: ${t.word}${b.keyText ? `, ${b.keyText} ${b.keyCaption || ''}` : ''}`);
    tag.innerHTML = `<span class="tagName">${b.short}${b.kind === 'placeholder' ? ' <i class="mockTag">mock</i>' : ''}</span>`
      + `<span class="tagVal"><b aria-hidden="true">${t.icon}</b><span class="tagNum"> ${b.keyText ?? '—'}${b.keyCaption ? ` <small>${b.keyCaption}</small>` : ''}</span></span>`
      + (b.flags?.count ? `<span class="flag ${b.flags.status}" aria-hidden="true">⚑ ${b.flags.count}</span>` : '');
    tag.addEventListener('click', () => onSelect(b.id));
    labelsEl.appendChild(tag);

    const meshes = []; root.traverse((m) => { if (m.isMesh && m !== hit) meshes.push(m); });
    nodes.push({ b, root, ring, tag, meshes, h, anchor: new THREE.Vector3(x, h + 1.4, z), pulse: b.status === 'red' });
  });

  // ---------- cars on the roads ----------
  const cars = [];
  const carColors = [0xd04a4a, 0x3d7bd8, 0xf2f2f2, 0xf2c84b, 0x3fa86b];
  [[saleCurve, 0.0, 0.018], [saleCurve, 0.5, 0.018], [backCurve, 0.2, -0.022], [outerCurve, 0.6, 0.012], [saleCurve, 0.8, -0.016]].forEach(([curve, t, speed], i) => {
    const car = new THREE.Group();
    car.add(box(1.1, 0.55, 2, mat(carColors[i % carColors.length]), 0, 0.5));
    car.add(box(0.95, 0.45, 1, mat(0xdbe9f5), 0, 0.98, -0.1));
    car.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    scene.add(car); cars.push({ car, curve, t, speed });
  });
  function placeCar(c) {
    const t = ((c.t % 1) + 1) % 1, p = c.curve.getPointAt(t), tan = c.curve.getTangentAt(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize().multiplyScalar(c.speed > 0 ? 0.85 : -0.85);
    c.car.position.set(p.x + side.x, 0.05, p.z + side.z);
    c.car.rotation.y = Math.atan2(tan.x, tan.z) + (c.speed > 0 ? 0 : Math.PI);
  }
  cars.forEach(placeCar);

  // ---------- camera & controls ----------
  const controls = new THREE.OrbitControls(camera, canvas);
  controls.enableDamping = !reducedMotion;
  controls.dampingFactor = 0.09;
  controls.screenSpacePanning = false;
  controls.minPolarAngle = THREE.MathUtils.degToRad(22);
  controls.maxPolarAngle = THREE.MathUtils.degToRad(68);
  controls.minDistance = 22; controls.maxDistance = 230;

  function homeView() {
    const narrow = container.clientWidth / container.clientHeight < 1.05;
    const dist = narrow ? 150 : 104;
    const polar = THREE.MathUtils.degToRad(52); // camera tilted about 40° above the ground
    const az = THREE.MathUtils.degToRad(28); // from the front-right, so the sales tower doesn't hide HQ
    const target = new THREE.Vector3(0, 0, narrow ? -2 : 0);
    const flat = Math.sin(polar) * dist;
    const pos = new THREE.Vector3(Math.sin(az) * flat, Math.cos(polar) * dist, Math.cos(az) * flat).add(target);
    return { pos, target };
  }

  let fly = null;
  function flyTo(pos, target, ms = 650) {
    if (reducedMotion) { camera.position.copy(pos); controls.target.copy(target); controls.update(); requestRender(); return; }
    fly = { from: camera.position.clone(), to: pos, fromT: controls.target.clone(), toT: target, start: performance.now(), ms };
    wake();
  }
  // Space covered by the info panel (right side on desktop, bottom sheet on phones), in pixels.
  let insets = { right: 0, bottom: 0 };
  function flyToBuilding(id) {
    const n = nodes.find((x) => x.b.id === id); if (!n) return;
    const focus = new THREE.Vector3(n.root.position.x, n.h * 0.35, n.root.position.z);
    const dir = camera.position.clone().sub(controls.target).setY(0).normalize();
    const polar = THREE.MathUtils.degToRad(52);
    const dist = Math.max(48, n.h * 3.2) * (isPhone() ? 1.35 : 1.1);
    // keep the building in the part of the screen the panel leaves free
    const wpp = (2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / container.clientHeight;
    const right = new THREE.Vector3(dir.z, 0, -dir.x); // screen-right on the ground
    const target = focus.clone()
      .add(right.multiplyScalar((insets.right / 2) * wpp))
      .add(dir.clone().multiplyScalar((insets.bottom / 2) * wpp * 1.3)); // toward the camera = higher on screen
    const pos = target.clone().add(dir.clone().multiplyScalar(Math.sin(polar) * dist)).setY(target.y + Math.cos(polar) * dist);
    flyTo(pos, target);
  }

  // ---------- tags: project, avoid overlaps, never cut off ----------
  const v = new THREE.Vector3();
  let filter = 'all', selected = null;
  function placeTags() {
    const w = container.clientWidth - insets.right, h = container.clientHeight - insets.bottom;
    const pad = 6, legendH = insets.bottom ? 0 : 40;
    const items = nodes.map((n) => {
      v.copy(n.anchor).project(camera);
      return { n, x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h, z: v.z };
    });
    const visible = (n) => filter === 'all' || n.b.status === 'red' || n.b.status === 'amber' || n.b.id === selected;
    // most important first: selected, red, amber, then nearest
    items.sort((a, b) => (b.n.b.id === selected) - (a.n.b.id === selected)
      || (PRIORITY[b.n.b.status] || 0) - (PRIORITY[a.n.b.status] || 0) || a.z - b.z);
    const placed = [];
    const clash = (r) => placed.some((p) => r.l < p.r + 3 && r.r > p.l - 3 && r.t < p.b + 3 && r.b > p.t - 3);
    for (const it of items) {
      const el = it.n.tag;
      if (!visible(it.n) || it.z > 1) { el.hidden = true; continue; }
      el.hidden = false;
      // on a phone only areas that need action (and the one selected) get a full tag; the rest show as pins
      const compact = w < 640 && !['red', 'amber', 'hq'].includes(it.n.b.status) && it.n.b.id !== selected;
      el.classList.toggle('pin', compact || (w < 640 && it.n.b.kind === 'region' && it.n.b.status !== 'red' && it.n.b.id !== selected));
      let tw = el.offsetWidth, th = el.offsetHeight;
      const fits = (y) => {
        const x = Math.min(Math.max(it.x, tw / 2 + pad), w - tw / 2 - pad);
        const r = { l: x - tw / 2, r: x + tw / 2, t: y - th, b: y };
        return r.t >= pad && r.b <= h - legendH && !clash(r) ? { x, y, r } : null;
      };
      let spot = fits(it.y) || fits(it.y - th - 4) || fits(it.y + th + 4);
      if (!spot) { // collapse to a small pin with just the status icon
        el.classList.add('pin'); tw = el.offsetWidth; th = el.offsetHeight;
        spot = fits(it.y) || fits(it.y - th - 2) || fits(it.y + th + 2);
      }
      if (!spot) { el.hidden = true; continue; } // still reachable by tapping the building or from the list
      placed.push(spot.r);
      el.style.transform = `translate(${Math.round(spot.x - tw / 2)}px, ${Math.round(spot.y - th)}px)`;
      el.style.zIndex = String(10 + (PRIORITY[it.n.b.status] || 0));
    }
    for (const s of signLabels) {
      v.copy(s.pos).project(camera);
      const x = ((v.x + 1) / 2) * w, y = ((1 - v.y) / 2) * h;
      const ok = v.z < 1 && x > 30 && x < w - 30 && y > 20 && y < h - legendH && filter === 'all';
      s.el.hidden = !ok;
      if (ok) s.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
    }
  }

  // ---------- theme ----------
  function applyTheme() {
    const dark = document.documentElement.dataset.theme === 'dark'
      || (document.documentElement.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
    const sky = new THREE.Color(dark ? 0x16233b : 0xbfdcef);
    scene.background = sky;
    scene.fog = new THREE.Fog(sky, 170, 360);
    ground.material.color.setHex(dark ? 0x355f3d : P.grass);
    hemi.intensity = dark ? 0.5 : 0.75;
    sun.intensity = dark ? 0.6 : 0.95;
    sun.color.setHex(dark ? 0xb9c8ff : 0xfff3dc);
    requestRender();
  }
  new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);

  // ---------- loop: runs only while visible; idles when nothing moves ----------
  let running = false, onScreen = true, dirty = true, lastInteract = 0;
  const clock = new THREE.Clock();
  function requestRender() { dirty = true; wake(); }
  function frame() {
    const now = performance.now();
    const dt = Math.min(clock.getDelta(), 0.05);
    if (fly) {
      const k = Math.min(1, (now - fly.start) / fly.ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      camera.position.lerpVectors(fly.from, fly.to, e); controls.target.lerpVectors(fly.fromT, fly.toT, e);
      if (k >= 1) fly = null;
      dirty = true;
    }
    if (!reducedMotion) {
      const t = now / 1000;
      for (const n of nodes) if (n.pulse) { const s = 1 + Math.sin(t * 3.2) * 0.045; n.ring.scale.set(s, s, 1); n.ring.material.opacity = 0.75 + Math.sin(t * 3.2) * 0.2; }
      for (const c of cars) { c.t += c.speed * dt; placeCar(c); }
      dirty = true;
    }
    if (controls.update()) dirty = true;
    if (dirty) { renderer.render(scene, camera); placeTags(); dirty = false; }
    // with reduced motion the loop sleeps once the camera settles
    if (reducedMotion && !fly && now - lastInteract > 400) stop();
  }
  function wake() { if (onScreen && !document.hidden && !running) { running = true; clock.getDelta(); renderer.setAnimationLoop(frame); } }
  function stop() { running = false; renderer.setAnimationLoop(null); }
  controls.addEventListener('change', () => { lastInteract = performance.now(); requestRender(); });
  new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; if (onScreen) wake(); else stop(); }, { threshold: 0.02 }).observe(container);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : wake()));

  // ---------- picking: tap selects, double-tap resets ----------
  const ray = new THREE.Raycaster(), p = new THREE.Vector2();
  let down = null, lastTap = 0;
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; lastInteract = performance.now(); wake(); });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
    const now = performance.now();
    if (now - lastTap < 320) { lastTap = 0; api.reset(); return; }
    lastTap = now;
    const r = canvas.getBoundingClientRect();
    p.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(p, camera);
    const hit = ray.intersectObjects(pickables)[0];
    if (hit) onSelect(hit.object.userData.id);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || e.buttons) return;
    const r = canvas.getBoundingClientRect();
    p.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(p, camera);
    canvas.style.cursor = ray.intersectObjects(pickables).length ? 'pointer' : 'grab';
  });

  function fit() {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    if (!fit.done) { const hv = homeView(); camera.position.copy(hv.pos); controls.target.copy(hv.target); controls.update(); fit.done = true; }
    requestRender();
  }
  new ResizeObserver(fit).observe(container);
  applyTheme();
  fit();
  wake();

  const api = {
    select(id) {
      selected = id;
      for (const n of nodes) {
        n.tag.classList.toggle('sel', n.b.id === id);
        n.root.position.y = n.b.id === id ? 0.35 : 0;
      }
      if (id) flyToBuilding(id);
      requestRender();
    },
    setFilter(mode) {
      filter = mode;
      for (const n of nodes) {
        const on = mode === 'all' || n.b.status === 'red' || n.b.status === 'amber';
        for (const m of n.meshes) {
          if (!m.material.userData.base) {
            m.material = m.material.clone();
            m.material.userData.base = { t: m.material.transparent, o: m.material.opacity };
          }
          const base = m.material.userData.base;
          m.material.transparent = on ? base.t : true;
          m.material.opacity = on ? base.o : Math.min(base.o, 0.18);
        }
      }
      requestRender();
    },
    reset() { const hv = homeView(); flyTo(hv.pos, hv.target); },
    setInsets(next) { insets = { right: 0, bottom: 0, ...next }; requestRender(); },
  };
  return api;
}
