// South Florida town: the Command Center's 3D town kit (same renderer settings, low-poly palette,
// building kit, camera, fly-to, tag placement and tap mechanics as ../../js/town.js), laid out as
// the South Florida beach-house region: the RD beach house in the middle, four work-queue buildings
// around it, a row of Art Deco storefronts (one per communication source) on the avenue, an events
// bandshell, a beach with palms and umbrellas, and the renewal race as a sailboat regatta offshore.
//
// Pure view: it receives buildings ({ id, name, short, kind, status, keyText, keyCaption, asOfText,
// warn, health, race }) and calls onSelect(id). It knows nothing about where numbers come from.
/* global THREE */
import { STATUS_TEXT } from '../../js/data/format.js';

const STATUS_HEX = { red: 0xd03b3b, amber: 0xfab219, green: 0x0ca30c, grey: 0x898781, hq: 0x2f8f8a, blue: 0x3d7bd8 };
const PRIORITY = { red: 4, amber: 3, green: 2, blue: 2, grey: 1, hq: 5 };

// Where each building stands (x, z). +z is toward the camera's starting side; the ocean is at -z.
const SPOTS = {
  home: [0, 0],
  to_send: [-17, 9], pending: [17, 9], new_members: [-16, -9], at_risk: [16, -9],
  events: [0, -14],
  gmail: [-27.5, 25], slack: [-16.5, 25], fathom: [-5.5, 25], ghl: [5.5, 25], whatsapp: [16.5, 25], plaud: [27.5, 25],
};
const SHORE_Z = -30; // where sand meets water
const RACE = { x0: -30, x1: 30, laneNow: -37.6, lanePrior: -42.6, zNear: -35, zFar: -45.4 };
const raceX = (pct) => RACE.x0 + ((RACE.x1 - RACE.x0) * Math.max(0, Math.min(100, pct))) / 100;

function seeded(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

export function createTown({ container, canvas, labelsEl, buildings, onSelect, reducedMotion = false }) {
  if (!window.THREE || !THREE.OrbitControls) throw new Error('3D library did not load');

  const isPhone = () => container.clientWidth < 640;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isPhone() ? 1.75 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 1, 600);

  // ---------- materials (the town's low-poly palette, warmed for the coast) ----------
  const matCache = new Map();
  const mat = (color, extra = {}) => {
    const key = Object.keys(extra).length ? null : color;
    if (key !== null && matCache.has(key)) return matCache.get(key);
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, flatShading: true, ...extra });
    if (key !== null) matCache.set(key, m);
    return m;
  };
  const P = {
    wall: 0xf3efe6, wall2: 0xd9d2c3, trim: 0xb7ad9b, road: 0x3a404c, line: 0xf2c84b, grass: 0x6aa54b, grass2: 0x79b65a,
    plaza: 0xeadfc8, sand: 0xf1dfa8, sand2: 0xe8d29a, water: 0x2aa7c9, shallow: 0x6fd3d8, foam: 0xf7fbfb,
    trunk: 0x8a6a46, leaf: 0x2f8a46, leaf2: 0x3f9f52, steel: 0x9aa3ad, white: 0xf7f6f2, coral: 0xf28b74, pink: 0xf4b6c2,
    teal: 0x5fc1c9, mint: 0x9fe0cf, lemon: 0xf6d55c, lilac: 0xd9c7f0, sky: 0xbfe3f5, deco: 0xfde3a7, red: 0xd04a4a,
  };

  // ---------- lights ----------
  const hemi = new THREE.HemisphereLight(0xe6f4ff, 0x5a6a40, 0.75);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 0.95);
  sun.position.set(-34, 64, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(isPhone() ? 1024 : 2048, isPhone() ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 10, far: 200 });
  sun.shadow.bias = -0.0008;
  scene.add(sun);

  // ---------- ground: lawn, beach, ocean ----------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 160), mat(P.grass));
  ground.rotation.x = -Math.PI / 2; ground.position.z = 50; ground.receiveShadow = true; scene.add(ground);
  const beach = new THREE.Mesh(new THREE.PlaneGeometry(260, 12), mat(P.sand));
  beach.rotation.x = -Math.PI / 2; beach.position.set(0, 0.02, SHORE_Z + 5); beach.receiveShadow = true; scene.add(beach);
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(420, 220), mat(P.water, { roughness: 0.25, metalness: 0.15 }));
  ocean.rotation.x = -Math.PI / 2; ocean.position.set(0, -0.05, SHORE_Z - 110); scene.add(ocean);
  const shallow = new THREE.Mesh(new THREE.PlaneGeometry(260, 4), mat(P.shallow, { roughness: 0.3 }));
  shallow.rotation.x = -Math.PI / 2; shallow.position.set(0, -0.02, SHORE_Z - 1.6); scene.add(shallow);
  const foam = new THREE.Mesh(new THREE.BoxGeometry(260, 0.08, 0.5), mat(P.foam));
  foam.position.set(0, 0.02, SHORE_Z + 0.3); scene.add(foam);

  const plaza = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 0.3, 40), mat(P.plaza));
  plaza.position.y = 0.15; plaza.receiveShadow = true; scene.add(plaza);
  const ringRoad = new THREE.Mesh(new THREE.RingGeometry(9, 11.2, 64), mat(P.road));
  ringRoad.rotation.x = -Math.PI / 2; ringRoad.position.y = 0.06; ringRoad.receiveShadow = true; scene.add(ringRoad);

  // ---------- roads ----------
  function roadAlong(points, width, y = 0.05, centreLine = true, color = P.road) {
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
    const m = new THREE.Mesh(g, mat(color)); m.receiveShadow = true; scene.add(m);
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
  const avenue = roadAlong([[-70, 17], [-30, 17.4], [0, 17], [30, 17.4], [70, 17]], 3.6); // the avenue of source storefronts
  const oceanDrive = roadAlong([[-70, -21], [-30, -20.4], [0, -21], [30, -20.4], [70, -21]], 3.4);
  roadAlong([[0, 11], [0, 14], [0, 17]], 2.6, 0.051, false);
  roadAlong([[-31, 17], [-30, 0], [-31, -20.6]], 2.8, 0.051, false);
  roadAlong([[31, 17], [30, 0], [31, -20.6]], 2.8, 0.051, false);
  // the boardwalk in front of the storefronts
  const boardwalk = new THREE.Mesh(new THREE.BoxGeometry(66, 0.12, 2.2), mat(0xc79a68));
  boardwalk.position.set(0, 0.07, 20.2); boardwalk.receiveShadow = true; scene.add(boardwalk);

  // ---------- greenery: palms and sea-grape bushes (instanced, seeded so the town looks the same) ----------
  const rnd = seeded(11);
  const avoid = [...Object.values(SPOTS).map(([x, z]) => [x, z, 7]), [0, 0, 12.5]];
  const onRoad = (x, z) => Math.abs(z - 17) < 3.2 || Math.abs(z + 20.8) < 3 || Math.abs(z - 20.2) < 2 || (Math.abs(Math.abs(x) - 30.6) < 2.6 && z > -21 && z < 17) || (Math.abs(x) < 2 && z > 10 && z < 18);
  const palms = [];
  for (let i = 0; i < 600 && palms.length < 90; i++) {
    const x = rnd() * 150 - 75, z = rnd() * 80 - 27;
    if (z < SHORE_Z + 2.5 || onRoad(x, z) || avoid.some(([ax, az, r]) => Math.hypot(x - ax, z - az) < r)) continue;
    if (z > -19 && z < -10 && Math.abs(x) < 8) continue;
    palms.push([x, z, 0.8 + rnd() * 0.55, rnd() * 6.28, (rnd() - 0.5) * 0.3]);
  }
  const FRONDS = 6;
  const pTrunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.13, 0.22, 3.4, 5), mat(P.trunk), palms.length);
  const pLeaf = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.07, 2.1), mat(P.leaf2), palms.length * FRONDS);
  const o3 = new THREE.Object3D();
  palms.forEach(([x, z, s, rot, lean], i) => {
    o3.position.set(x, 1.7 * s, z); o3.rotation.set(lean, 0, lean * 0.6); o3.scale.set(s, s, s); o3.updateMatrix(); pTrunk.setMatrixAt(i, o3.matrix);
    const tx = x + Math.sin(lean * 0.6) * -1.7 * s, tz = z + Math.sin(lean) * 1.7 * s;
    for (let k = 0; k < FRONDS; k++) {
      o3.position.set(tx, 3.45 * s, tz); o3.rotation.set(0, rot + (k / FRONDS) * Math.PI * 2, 0); o3.scale.set(s, s, s);
      o3.rotateX(0.38); o3.translateZ(0.95 * s); o3.updateMatrix(); pLeaf.setMatrixAt(i * FRONDS + k, o3.matrix);
    }
  });
  pTrunk.castShadow = pLeaf.castShadow = true;
  scene.add(pTrunk, pLeaf);

  const bushes = [];
  for (let i = 0; i < 400 && bushes.length < 60; i++) {
    const x = rnd() * 140 - 70, z = rnd() * 70 - 22;
    if (z < SHORE_Z + 4 || onRoad(x, z) || avoid.some(([ax, az, r]) => Math.hypot(x - ax, z - az) < r - 1)) continue;
    bushes.push([x, z, 0.6 + rnd() * 0.7]);
  }
  const bush = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), mat(0x3d8a48), bushes.length);
  bushes.forEach(([x, z, s], i) => { o3.position.set(x, 0.5 * s, z); o3.rotation.set(0, i, 0); o3.scale.set(s * 1.2, s * 0.8, s); o3.updateMatrix(); bush.setMatrixAt(i, o3.matrix); });
  bush.castShadow = true; scene.add(bush);

  // ---------- building kit ----------
  const box = (w, h, d, m, x = 0, y = h / 2, z = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); return b; };
  const cyl = (rt, rb, h, seg, m, x = 0, y = h / 2, z = 0) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m); c.position.set(x, y, z); return c; };
  function palm(g, x, z, s = 1) {
    const trunk = cyl(0.12 * s, 0.2 * s, 3.2 * s, 5, mat(P.trunk), x, 1.6 * s, z); trunk.rotation.z = 0.12; g.add(trunk);
    for (let i = 0; i < 5; i++) {
      const leaf = box(0.3 * s, 0.08, 1.9 * s, mat(P.leaf2), x, 3.25 * s, z);
      leaf.rotation.set(0.35, (i / 5) * Math.PI * 2, 0); leaf.translateZ(0.85 * s); g.add(leaf);
    }
  }
  function signTexture(text, bg, fg, { round = false, w = 512, h = 112, font = 'bold 58px system-ui, sans-serif' } = {}) {
    const c = document.createElement('canvas'); c.width = round ? 256 : w; c.height = round ? 256 : h;
    const x = c.getContext('2d');
    x.fillStyle = bg;
    if (round) { x.beginPath(); x.arc(128, 128, 124, 0, Math.PI * 2); x.fill(); x.strokeStyle = fg; x.lineWidth = 6; x.beginPath(); x.arc(128, 128, 108, 0, Math.PI * 2); x.stroke(); }
    else x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = round ? 'bold 100px Georgia, serif' : font;
    x.fillText(text, c.width / 2, c.height / 2 + (round ? 6 : 3));
    const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
  }
  const signPlane = (text, w, h, bg, fg, opts) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: signTexture(text, bg, fg, opts) }));
  function checkerTexture(cols = 8, rows = 2) {
    const c = document.createElement('canvas'); c.width = cols * 16; c.height = rows * 16; const x = c.getContext('2d');
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) { x.fillStyle = (i + j) % 2 ? '#111' : '#fff'; x.fillRect(i * 16, j * 16, 16, 16); }
    const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; return t;
  }
  function warningTexture() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 224; const x = c.getContext('2d');
    x.fillStyle = '#fab219'; x.strokeStyle = '#2b2f36'; x.lineWidth = 14; x.lineJoin = 'round';
    x.beginPath(); x.moveTo(128, 14); x.lineTo(244, 212); x.lineTo(12, 212); x.closePath(); x.fill(); x.stroke();
    x.fillStyle = '#2b2f36'; x.font = 'bold 130px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('!', 128, 140);
    return new THREE.CanvasTexture(c);
  }

  const beacons = []; // health lamps that pulse
  const beams = []; // lighthouse light

  // Each returns the building height. Shapes follow the job.
  const SHAPES = {
    home(g) { // the RD's beach house on stilts (the template's South Florida landmark, at home scale)
      const s = new THREE.Group();
      for (const [x, z] of [[-1.2, -1], [1.2, -1], [-1.2, 1], [1.2, 1]]) s.add(cyl(0.12, 0.12, 1.4, 5, mat(P.white), x, 0.7, z));
      s.add(box(3.4, 2.2, 3, mat(P.pink), 0, 2.5)); s.add(box(3.4, 0.2, 3.6, mat(0xe8d9b5), 0, 1.45, 0.3));
      for (const x of [-0.9, 0.9]) s.add(box(0.8, 0.8, 0.06, mat(0x4b8fc4, { roughness: 0.3 }), x, 2.7, 1.53));
      s.add(box(0.7, 1.3, 0.06, mat(0x6b4a33), 0, 2.05, 1.53));
      const roof = new THREE.Mesh(new THREE.ConeGeometry(2.8, 1.4, 4), mat(P.teal)); roof.rotation.y = Math.PI / 4; roof.position.y = 4.3; s.add(roof);
      s.add(box(4.6, 0.12, 2.6, mat(P.sand), 0, 0.06, 3.4));
      palm(s, -3, 2.4, 1.1); palm(s, 3.2, 1.6, 0.9);
      const stand = new THREE.Group(); stand.add(box(0.8, 0.8, 0.8, mat(P.red), 0, 1.6)); stand.add(cyl(0.06, 0.06, 1.2, 4, mat(P.white), 0, 0.6));
      stand.position.set(2.6, 0, 3.6); s.add(stand);
      const seal = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: signTexture('SF', '#155e63', '#fde3a7', { round: true }) }));
      seal.position.set(0, 4.05, 1.32); seal.rotation.x = -0.45; s.add(seal);
      s.scale.setScalar(1.55); g.add(s);
      return 7.6;
    },
    outbox(g) { // Messages to send: Art Deco post office with a big blue mailbox
      g.add(box(6, 4.4, 4.2, mat(P.mint)));
      const front = cyl(2.1, 2.1, 4.4, 16, mat(P.mint), 0, 2.2, 1.2); front.scale.z = 0.5; g.add(front);
      for (const x of [-1.6, -0.55, 0.55, 1.6]) g.add(box(0.22, 5.4, 0.22, mat(P.white), x, 2.7, 2.25));
      g.add(box(6.4, 0.35, 4.6, mat(P.white), 0, 4.55)); g.add(box(3.4, 1.1, 2.8, mat(P.mint), 0, 5.25)); g.add(box(3.8, 0.25, 3.2, mat(P.white), 0, 5.9));
      const sign = signPlane('OUTBOX', 3, 0.66, '#155e63', '#fde3a7'); sign.position.set(0, 3.5, 2.33); g.add(sign);
      g.add(box(0.9, 1.1, 0.8, mat(0x2a5fae), 3.6, 0.85, 2.4));
      const top = cyl(0.45, 0.45, 0.8, 12, mat(0x2a5fae), 3.6, 1.4, 2.4); top.rotation.x = Math.PI / 2; top.scale.set(1, 1, 1); g.add(top);
      g.add(box(0.12, 0.6, 0.12, mat(0x2a5fae), 3.6, 0.3, 2.4));
      for (let k = 0; k < 3; k++) g.add(box(0.9, 0.06, 0.6, mat(P.white), -3.6, 0.1 + k * 0.07, 2.6 + (k % 2) * 0.08));
      return 6.1;
    },
    lifeguard(g) { // Messages pending: a lifeguard tower, watching for replies
      for (const [x, z] of [[-1.3, -1.1], [1.3, -1.1], [-1.3, 1.1], [1.3, 1.1]]) g.add(cyl(0.13, 0.15, 3.2, 5, mat(P.white), x, 1.6, z));
      g.add(box(3.3, 0.25, 3, mat(0xc79a68), 0, 3.3));
      g.add(box(3, 2.2, 2.6, mat(P.lemon), 0, 4.5));
      for (const x of [-0.75, 0.75]) g.add(box(1.1, 1, 0.06, mat(0x4b8fc4, { roughness: 0.3 }), x, 4.7, 1.32));
      const roof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.2, 4), mat(P.coral)); roof.rotation.y = Math.PI / 4; roof.position.y = 6.2; g.add(roof);
      const ramp = box(1.1, 0.12, 4.2, mat(0xc79a68), 0, 1.7, 3); ramp.rotation.x = 0.72; g.add(ramp);
      g.add(cyl(0.05, 0.05, 2.4, 4, mat(P.steel), 1.3, 7.2, -1)); g.add(box(0.9, 0.5, 0.04, mat(P.red), 1.75, 8, -1));
      const cross = signPlane('+', 0.8, 0.8, '#d04a4a', '#ffffff', { w: 128, h: 128, font: 'bold 120px system-ui' }); cross.position.set(0, 5.35, 1.33); g.add(cross);
      return 8.3;
    },
    cabana(g) { // New members: a welcome beach club with striped umbrellas and balloons
      g.add(box(6.4, 2.8, 3.8, mat(P.white), 0, 1.4, -0.6));
      for (let i = 0; i < 8; i++) { const s = box(0.8, 0.08, 1.8, mat(i % 2 ? P.white : P.teal), -2.8 + i * 0.8, 2.7, 1.9); s.rotation.x = 0.35; g.add(s); }
      g.add(box(6.8, 0.3, 4.2, mat(P.teal), 0, 2.95, -0.6));
      const sign = signPlane('WELCOME', 3.6, 0.7, '#f28b74', '#ffffff'); sign.position.set(0, 3.55, 1.5); g.add(sign);
      g.add(box(3.6, 0.9, 0.1, mat(P.coral), 0, 3.55, 1.44));
      for (const [x, z, c] of [[-3.6, 3, P.coral], [3.8, 2.6, P.lemon], [0, 4, P.teal]]) {
        g.add(cyl(0.05, 0.05, 2.4, 4, mat(P.white), x, 1.2, z));
        for (let k = 0; k < 8; k++) { const seg = new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.6, 8, 1, true, (k / 8) * Math.PI * 2, Math.PI / 4), mat(k % 2 ? P.white : c, { side: THREE.DoubleSide })); seg.position.set(x, 2.5, z); g.add(seg); }
      }
      for (const [x, c] of [[2.6, P.red], [3, P.lemon], [3.3, 0x3d7bd8]]) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), mat(c, { roughness: 0.3 })); b.scale.y = 1.2; b.position.set(x, 5 + (x - 2.6), -0.2); g.add(b);
        g.add(cyl(0.01, 0.01, 1.4, 3, mat(P.white), x, 4 + (x - 2.6), -0.2));
      }
      return 5.6;
    },
    lighthouse(g) { // At risk: the lighthouse, with a turning beam
      for (let i = 0; i < 6; i++) g.add(cyl(1.3 - i * 0.12, 1.42 - i * 0.12, 1.4, 12, mat(i % 2 ? P.white : P.red), 0, 0.7 + i * 1.4));
      g.add(cyl(1.1, 1.1, 0.2, 12, mat(0x2b2f36), 0, 8.5)); g.add(cyl(0.7, 0.7, 1.2, 10, mat(0xfff6c8, { emissive: 0x6a5200, roughness: 0.2 }), 0, 9.2));
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.95, 0.9, 10), mat(P.red)); cap.position.y = 10.25; g.add(cap);
      g.add(box(3.2, 1.8, 2.4, mat(P.white), 2.2, 0.9, 0.6)); const r = new THREE.Mesh(new THREE.ConeGeometry(2.1, 0.9, 4), mat(P.red)); r.rotation.y = Math.PI / 4; r.position.set(2.2, 2.25, 0.6); g.add(r);
      const beam = new THREE.Mesh(new THREE.ConeGeometry(1.6, 9, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
      beam.geometry.translate(0, -4.5, 0); beam.rotation.z = Math.PI / 2;
      const pivot = new THREE.Group(); pivot.position.y = 9.2; pivot.add(beam); g.add(pivot); beams.push(pivot);
      return 10.7;
    },
    bandshell(g) { // Events: a beachfront bandshell with a stage and string lights
      g.add(box(7.4, 0.7, 4.4, mat(P.wall2), 0, 0.35));
      const shell = new THREE.Mesh(new THREE.SphereGeometry(3.6, 18, 10, 0, Math.PI, 0, Math.PI / 2), mat(P.white, { side: THREE.DoubleSide }));
      shell.rotation.y = Math.PI; shell.position.set(0, 0.7, -0.6); shell.scale.set(1, 1.15, 0.9); g.add(shell);
      for (let i = 0; i < 4; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(3.6 - i * 0.55, 0.06, 4, 24, Math.PI), mat(i % 2 ? P.coral : P.teal)); r.position.set(0, 0.7, -0.4 - i * 0.2); g.add(r); }
      for (const x of [-4.2, 4.2]) g.add(cyl(0.07, 0.07, 3.6, 5, mat(P.steel), x, 1.8, 2.6));
      for (let k = 0; k < 9; k++) { const t = k / 8, bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), mat(0xfff1a8, { emissive: 0x806a00 })); bulb.position.set(-4.2 + 8.4 * t, 3.5 - Math.sin(t * Math.PI) * 0.6, 2.6); g.add(bulb); }
      const sign = signPlane('EVENTS', 2.6, 0.6, '#155e63', '#fde3a7'); sign.position.set(0, 4.6, -0.3); g.add(sign);
      return 5;
    },
    storefront(g, b) { // one per communication source: a pastel Art Deco storefront with a health beacon
      const ghost = b.kind === 'source' && b.future;
      const color = { gmail: 0xf7c6c0, slack: P.lilac, fathom: P.sky, ghl: P.deco, whatsapp: 0xc8efd4, plaud: 0xa7adb5 }[b.id] || P.wall;
      const wall = ghost ? mat(color, { transparent: true, opacity: 0.32 }) : mat(color);
      const body = box(4.6, 3.6, 3.4, wall); g.add(body);
      if (ghost) {
        const e = new THREE.LineSegments(new THREE.EdgesGeometry(body.geometry), new THREE.LineDashedMaterial({ color: 0x4a4f57, dashSize: 0.4, gapSize: 0.28 }));
        e.position.copy(body.position); e.computeLineDistances(); g.add(e);
      } else {
        g.add(box(4.9, 0.3, 3.7, mat(P.white), 0, 3.75)); g.add(box(2.4, 0.9, 2.4, wall, 0, 4.35)); g.add(box(1.2, 0.6, 1.6, wall, 0, 5.1));
        for (const x of [-1.6, 1.6]) g.add(box(0.2, 3.4, 0.2, mat(P.white), x, 1.9, 1.75));
        g.add(box(2.6, 1.7, 0.06, mat(0x4b8fc4, { roughness: 0.25, metalness: 0.2 }), 0, 1.3, 1.72));
        for (let i = 0; i < 6; i++) { const s = box(0.72, 0.06, 1, mat(i % 2 ? P.white : P.teal), -1.8 + i * 0.72, 2.55, 2.1); s.rotation.x = 0.4; g.add(s); }
      }
      const label = { gmail: 'GMAIL', slack: 'SLACK', fathom: 'FATHOM', ghl: 'GHL', whatsapp: 'WHATSAPP', plaud: 'PLAUD · SOON' }[b.id] || b.short.toUpperCase();
      const sign = signPlane(label, 3.6, 0.66, ghost ? '#e9eaec' : '#ffffff', '#1f2a37', { font: `bold ${label.length > 8 ? 44 : 56}px system-ui, sans-serif` });
      sign.position.set(0, 3.15, 1.74); g.add(sign);
      // health lamp on a mast: blue last verified, amber content unreadable, red offline, grey unknown / not connected (never 'online': there is no heartbeat)
      g.add(cyl(0.06, 0.06, 1.8, 5, mat(P.steel), 1.6, ghost ? 4.5 : 5.4, -0.8));
      const lampColor = STATUS_HEX[b.status] ?? STATUS_HEX.grey;
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 8), new THREE.MeshStandardMaterial({ color: lampColor, emissive: lampColor, emissiveIntensity: ghost ? 0.1 : 0.55, roughness: 0.3 }));
      lamp.position.set(1.6, ghost ? 5.6 : 6.5, -0.8); g.add(lamp);
      if (b.status === 'red') beacons.push(lamp);
      if (b.warn) { // coverage warning sign out front
        g.add(cyl(0.06, 0.06, 2.2, 5, mat(P.steel), -2.9, 1.1, 2.4));
        const w = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.3), new THREE.MeshBasicMaterial({ map: warningTexture(), transparent: true, side: THREE.DoubleSide }));
        w.position.set(-2.9, 2.6, 2.42); g.add(w);
      }
      return ghost ? 6 : 6.9;
    },
  };
  const SHAPE_FOR = { home: 'home', to_send: 'outbox', pending: 'lifeguard', new_members: 'cabana', at_risk: 'lighthouse', events: 'bandshell' };

  // beach umbrellas and loungers
  const umbrellaCols = [P.coral, P.teal, P.lemon, 0x3d7bd8];
  for (let i = 0; i < 11; i++) {
    const x = -62 + i * 12 + (rnd() - 0.5) * 4, z = SHORE_Z + 3.4 + rnd() * 2.6;
    if (Math.abs(x) < 7) continue;
    const g = new THREE.Group(); g.position.set(x, 0, z);
    g.add(cyl(0.05, 0.05, 2.2, 4, mat(P.white), 0, 1.1));
    for (let k = 0; k < 8; k++) { const seg = new THREE.Mesh(new THREE.ConeGeometry(1.2, 0.5, 8, 1, true, (k / 8) * Math.PI * 2, Math.PI / 4), mat(k % 2 ? P.white : umbrellaCols[i % 4], { side: THREE.DoubleSide })); seg.position.y = 2.2; g.add(seg); }
    const towel = box(0.9, 0.04, 1.8, mat(umbrellaCols[(i + 1) % 4]), 1.2, 0.05, 0.4); g.add(towel);
    g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    scene.add(g);
  }

  // ---------- the renewal race: a regatta offshore, start at 0%, finish line at the goal ----------
  const raceB = buildings.find((b) => b.kind === 'race');
  const signLabels = [];
  const boats = [];
  function sailboat(sailColor, ghost = false) {
    const g = new THREE.Group();
    const o = ghost ? { transparent: true, opacity: 0.45, depthWrite: false } : {};
    const hull = box(3.2, 0.55, 1.1, mat(ghost ? P.white : 0xf7f6f2, o), 0, 0.2); g.add(hull);
    const bow = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.2, 4), mat(ghost ? P.white : 0xf7f6f2, o)); bow.rotation.z = -Math.PI / 2; bow.rotation.x = Math.PI / 4; bow.scale.set(1, 1, 0.75); bow.position.set(2.2, 0.2, 0); g.add(bow);
    g.add(box(3.25, 0.12, 1.15, mat(ghost ? P.white : 0x155e63, o), 0, 0.42));
    g.add(cyl(0.06, 0.06, 4.6, 5, mat(P.steel, o), 0.2, 2.6));
    const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(2.3, 0); sh.lineTo(0, 4); sh.closePath();
    const sail = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshStandardMaterial({ color: sailColor, side: THREE.DoubleSide, roughness: 0.7, transparent: ghost, opacity: ghost ? 0.5 : 1, depthWrite: !ghost }));
    sail.position.set(0.3, 0.7, 0.04); g.add(sail);
    const jib = new THREE.Shape(); jib.moveTo(0, 0); jib.lineTo(-1.6, 0); jib.lineTo(0, 3.2); jib.closePath();
    const j = new THREE.Mesh(new THREE.ShapeGeometry(jib), new THREE.MeshStandardMaterial({ color: ghost ? 0xffffff : 0xfdf6e3, side: THREE.DoubleSide, transparent: ghost, opacity: ghost ? 0.45 : 1, depthWrite: !ghost }));
    j.position.set(0.1, 0.8, -0.04); g.add(j);
    const wake = box(2.6, 0.02, 0.9, mat(P.foam, { transparent: true, opacity: ghost ? 0.3 : 0.75 }), -2.6, 0.02); g.add(wake);
    if (!ghost) g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    return g;
  }
  let raceHit = null;
  if (raceB) {
    const r = raceB.race;
    // lane ropes with floats
    const floatsA = [], floatsB = [];
    for (const z of [RACE.zNear, (RACE.laneNow + RACE.lanePrior) / 2, RACE.zFar]) for (let x = RACE.x0; x <= RACE.x1 + 0.01; x += 1.5) ((Math.round((x - RACE.x0) / 1.5) % 2) ? floatsB : floatsA).push([x, z]);
    const fGeo = new THREE.SphereGeometry(0.22, 6, 4);
    [[floatsA, P.red], [floatsB, P.white]].forEach(([list, c]) => {
      const inst = new THREE.InstancedMesh(fGeo, mat(c), list.length);
      list.forEach(([x, z], i) => { o3.position.set(x, 0.05, z); o3.rotation.set(0, 0, 0); o3.scale.set(1, 0.7, 1); o3.updateMatrix(); inst.setMatrixAt(i, o3.matrix); });
      scene.add(inst);
    });
    // distance buoys and the finish line at the goal
    for (const pct of [0, 25, 50, 75, 100]) {
      const x = raceX(pct), goal = pct === r.target;
      if (!goal) { const bu = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.4, 8), mat(pct === 0 ? 0x3fa86b : P.lemon)); bu.position.set(x, 0.6, RACE.zFar - 0.8); bu.castShadow = true; scene.add(bu); }
      const el = document.createElement('div'); el.className = `stageSign${goal ? ' goal' : ''}`; el.textContent = goal ? `${pct}% goal` : `${pct}%`; el.setAttribute('aria-hidden', 'true');
      labelsEl.appendChild(el); signLabels.push({ el, pos: new THREE.Vector3(x, goal ? 6.6 : 1.6, RACE.zFar - 0.4) });
    }
    const fx = raceX(r.target);
    if (r.target !== 75 && r.target !== 0 && r.target !== 25 && r.target !== 50 && r.target !== 100) {
      const el = document.createElement('div'); el.className = 'stageSign goal'; el.textContent = `${r.target}% goal`; labelsEl.appendChild(el); signLabels.push({ el, pos: new THREE.Vector3(fx, 6.4, RACE.zFar - 0.8) });
    }
    const chk = checkerTexture(2, 14);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.7, RACE.zNear - RACE.zFar), new THREE.MeshBasicMaterial({ map: chk, transparent: true, opacity: 0.9 }));
    line.rotation.x = -Math.PI / 2; line.position.set(fx, 0.03, (RACE.zNear + RACE.zFar) / 2); scene.add(line);
    for (const z of [RACE.zNear + 0.4, RACE.zFar - 0.4]) {
      for (let i = 0; i < 6; i++) { const seg = cyl(0.16, 0.16, 0.9, 8, mat(i % 2 ? P.white : P.red), fx, 0.45 + i * 0.9, z); seg.castShadow = true; scene.add(seg); }
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.1), new THREE.MeshBasicMaterial({ map: checkerTexture(6, 4), side: THREE.DoubleSide }));
      flag.position.set(fx + 0.95, 4.9, z); scene.add(flag);
    }
    // the boats: this period (status colour) and last month (ghost)
    const now = sailboat(STATUS_HEX[raceB.status] ?? STATUS_HEX.grey);
    now.position.set(raceX(r.rate ?? 0) - 1.9, 0, RACE.laneNow); scene.add(now); boats.push({ g: now, phase: 0 });
    const prior = sailboat(0xffffff, true);
    prior.position.set(raceX(r.prior ?? 0) - 1.9, 0, RACE.lanePrior); scene.add(prior); boats.push({ g: prior, phase: 1.7 });
    const pl = document.createElement('div'); pl.className = 'stageSign ghost'; pl.textContent = r.prior === null ? 'Last month: —' : `Last month ${r.prior}%`; pl.setAttribute('aria-hidden', 'true');
    labelsEl.appendChild(pl); signLabels.push({ el: pl, pos: new THREE.Vector3(raceX(r.prior ?? 0), 5.6, RACE.lanePrior) });
    raceHit = new THREE.Mesh(new THREE.BoxGeometry(RACE.x1 - RACE.x0 + 6, 7, RACE.zNear - RACE.zFar + 2), new THREE.MeshBasicMaterial({ visible: false }));
    raceHit.position.set(0, 3.5, (RACE.zNear + RACE.zFar) / 2); raceHit.userData.id = raceB.id; scene.add(raceHit);
  }

  // ---------- place buildings ----------
  const nodes = [];
  const pickables = raceHit ? [raceHit] : [];
  buildings.forEach((b) => {
    if (b.kind === 'race') {
      const tag = makeTag(b);
      const meshes = [];
      boats.forEach((x) => x.g.traverse((m) => { if (m.isMesh) meshes.push(m); }));
      // anchored on the near rope and drawn below it, so the goal flag and distance signs stay visible
      nodes.push({ b, root: boats[0].g, ring: null, tag, meshes, h: 5, anchor: new THREE.Vector3(raceX(b.race.rate ?? 0) - 2, 0, RACE.zNear + 1), below: true, pulse: false });
      return;
    }
    const spot = SPOTS[b.id]; if (!spot) return;
    const [x, z] = spot;
    const root = new THREE.Group(); root.position.set(x, 0, z);
    root.rotation.y = b.kind === 'source' ? 0 : Math.atan2(-x, -z) + Math.PI; // queues face the house, storefronts face the avenue
    if (b.kind === 'home') root.rotation.y = 0;
    if (b.id === 'events') root.rotation.y = 0;

    const padR = b.kind === 'home' ? 0 : b.kind === 'source' ? 4.4 : 5.6;
    if (padR) {
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(padR, padR, 0.2, 32), mat(b.kind === 'source' ? P.sand2 : P.plaza));
      pad.position.y = 0.1; pad.receiveShadow = true; root.add(pad);
    }
    const ringMat = new THREE.MeshBasicMaterial({ color: STATUS_HEX[b.status] ?? STATUS_HEX.grey, transparent: true, opacity: 0.95 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(b.kind === 'home' ? 8.1 : padR - 0.25, b.kind === 'home' ? 0.3 : 0.26, 6, 56), ringMat);
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.24; root.add(ring);

    const body = new THREE.Group();
    let h = b.kind === 'source' ? SHAPES.storefront(body, b) : SHAPES[SHAPE_FOR[b.id] || 'outbox'](body, b);
    const f = b.volume && b.volume.cap ? 0.8 + 0.45 * Math.min(b.volume.value, b.volume.cap) / b.volume.cap : 1;
    body.scale.y = f; h *= f;
    body.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    root.add(body);

    const hit = new THREE.Mesh(new THREE.CylinderGeometry(padR || 6.5, padR || 6.5, h + 2, 12), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = (h + 2) / 2; hit.userData.id = b.id; root.add(hit); pickables.push(hit);
    scene.add(root);

    const tag = makeTag(b);
    const meshes = []; root.traverse((m) => { if (m.isMesh && m !== hit) meshes.push(m); });
    nodes.push({ b, root, ring, tag, meshes, h, anchor: new THREE.Vector3(x, h + 1.4, z), pulse: b.status === 'red' });
  });

  function makeTag(b) {
    const t = b.status === 'blue' ? { icon: '◷', word: 'Last verified' } : STATUS_TEXT[b.status] || STATUS_TEXT.grey;
    const tag = document.createElement('button');
    tag.type = 'button';
    tag.className = `tag ${b.status}${b.future ? ' mock' : ''}${b.warn ? ' warned' : ''}`;
    tag.setAttribute('aria-label', `${b.name}: ${b.keyText ?? t.word}${b.keyCaption ? ` ${b.keyCaption}` : ''}${b.warn ? `. Warning: ${b.warnShort || b.warn}` : ''}${b.asOfText ? `. ${b.asOfText}` : ''}`);
    tag.innerHTML = `<span class="tagName">${b.short}${b.future ? ' <i class="mockTag">soon</i>' : ''}</span>`
      + `<span class="tagVal"><b aria-hidden="true">${t.icon}</b><span class="tagNum"> ${b.keyText ?? '—'}${b.keyCaption ? ` <small>${b.keyCaption}</small>` : ''}</span></span>`
      + (b.warn ? `<span class="tagWarn">⚠ ${b.warnShort || 'Coverage incomplete'}</span>` : '')
      + (b.asOfText ? `<span class="tagAsOf">${b.asOfText}</span>` : '')
      + (b.flags?.count ? `<span class="flag ${b.flags.status}" aria-hidden="true">⚑ ${b.flags.count}</span>` : '');
    tag.addEventListener('click', () => onSelect(b.id));
    labelsEl.appendChild(tag);
    return tag;
  }

  // ---------- cars on the avenue and Ocean Drive ----------
  const cars = [];
  const carColors = [0xf28b74, 0x5fc1c9, 0xf7f6f2, 0xf6d55c, 0x3d7bd8];
  [[avenue, 0.05, 0.014], [avenue, 0.55, -0.012], [oceanDrive, 0.3, 0.013], [oceanDrive, 0.8, -0.015]].forEach(([curve, t, speed], i) => {
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

  // ---------- camera & controls (same feel as the Command Center) ----------
  const controls = new THREE.OrbitControls(camera, canvas);
  controls.enableDamping = !reducedMotion;
  controls.dampingFactor = 0.09;
  controls.screenSpacePanning = false;
  controls.minPolarAngle = THREE.MathUtils.degToRad(22);
  controls.maxPolarAngle = THREE.MathUtils.degToRad(68);
  controls.minDistance = 18; controls.maxDistance = 190;

  function homeView() {
    const aspect = container.clientWidth / container.clientHeight;
    const narrow = aspect < 1.05;
    const dist = narrow ? 128 / Math.max(0.62, aspect) * 0.62 + 20 : 96;
    const polar = THREE.MathUtils.degToRad(narrow ? 46 : 50);
    const az = THREE.MathUtils.degToRad(narrow ? 12 : 20);
    const target = new THREE.Vector3(0, 0, narrow ? -6 : -5);
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
  let insets = { right: 0, bottom: 0 };
  function flyToBuilding(id) {
    const n = nodes.find((x) => x.b.id === id); if (!n) return;
    const focus = n.b.kind === 'race' ? new THREE.Vector3(raceX(n.b.race.target) - 12, 1.5, (RACE.zNear + RACE.zFar) / 2) : new THREE.Vector3(n.root.position.x, n.h * 0.35, n.root.position.z);
    const dir = camera.position.clone().sub(controls.target).setY(0).normalize();
    const polar = THREE.MathUtils.degToRad(52);
    const dist = (n.b.kind === 'race' ? 64 : Math.max(48, n.h * 3.6)) * (isPhone() ? 1.35 : 1.1);
    const wpp = (2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / container.clientHeight;
    const right = new THREE.Vector3(dir.z, 0, -dir.x);
    const target = focus.clone()
      .add(right.multiplyScalar((insets.right / 2) * wpp))
      .add(dir.clone().multiplyScalar((insets.bottom / 2) * wpp * 1.3));
    const pos = target.clone().add(dir.clone().multiplyScalar(Math.sin(polar) * dist)).setY(target.y + Math.cos(polar) * dist);
    flyTo(pos, target);
  }

  // ---------- tags: project, avoid overlaps, never cut off ----------
  const v = new THREE.Vector3();
  let filter = 'all', selected = null;
  const needs = (b) => b.status === 'red' || b.status === 'amber' || Boolean(b.warn);
  function placeTags() {
    const fullW = container.clientWidth, fullH = container.clientHeight;
    const w = fullW - insets.right, h = fullH - insets.bottom;
    const pad = 6, legendH = insets.bottom ? 0 : 40;
    const items = nodes.map((n) => {
      v.copy(n.anchor).project(camera);
      return { n, x: ((v.x + 1) / 2) * fullW, y: ((1 - v.y) / 2) * fullH, z: v.z };
    });
    const visible = (n) => filter === 'all' || needs(n.b) || n.b.kind === 'home' || n.b.id === selected;
    items.sort((a, b) => (b.n.b.id === selected) - (a.n.b.id === selected)
      || (b.n.b.kind === 'race') - (a.n.b.kind === 'race')
      || (PRIORITY[b.n.b.status] || 0) + (b.n.b.warn ? 1.5 : 0) - (PRIORITY[a.n.b.status] || 0) - (a.n.b.warn ? 1.5 : 0) || a.z - b.z);
    const placed = [];
    const clash = (r) => placed.some((p) => r.l < p.r + 3 && r.r > p.l - 3 && r.t < p.b + 3 && r.b > p.t - 3);
    for (const it of items) {
      const el = it.n.tag;
      if (!visible(it.n) || it.z > 1) { el.hidden = true; continue; }
      el.hidden = false;
      const keepFull = ['red', 'amber', 'hq'].includes(it.n.b.status) || it.n.b.warn || it.n.b.kind === 'race' || it.n.b.id === selected;
      el.classList.toggle('pin', w < 640 && !keepFull);
      el.classList.toggle('slim', w < 640 && keepFull && it.n.b.id !== selected);
      let tw = el.offsetWidth, th = el.offsetHeight;
      const fits = (y) => {
        const x = Math.min(Math.max(it.x, tw / 2 + pad), w - tw / 2 - pad);
        const r = { l: x - tw / 2, r: x + tw / 2, t: y - th, b: y };
        return r.t >= pad && r.b <= h - legendH && !clash(r) ? { x, y, r } : null;
      };
      let spot = it.n.below ? fits(it.y + th + 2) || fits(it.y + th * 2 + 6) || fits(it.y) : fits(it.y) || fits(it.y - th - 4) || fits(it.y + th + 4);
      if (!spot) {
        el.classList.add('pin'); tw = el.offsetWidth; th = el.offsetHeight;
        spot = fits(it.y) || fits(it.y - th - 2) || fits(it.y + th + 2);
      }
      if (!spot) { el.hidden = true; continue; }
      placed.push(spot.r);
      el.style.transform = `translate(${Math.round(spot.x - tw / 2)}px, ${Math.round(spot.y - th)}px)`;
      el.style.zIndex = String(10 + (PRIORITY[it.n.b.status] || 0));
    }
    for (const s of signLabels) {
      v.copy(s.pos).project(camera);
      const x = ((v.x + 1) / 2) * fullW, y = ((1 - v.y) / 2) * fullH;
      let ok = v.z < 1 && x > 24 && x < w - 24 && y > 16 && y < h - legendH && (filter === 'all' || s.el.classList.contains('goal'));
      if (ok) { const sw = s.el.offsetWidth || 40, sh = s.el.offsetHeight || 16; ok = !clash({ l: x - sw / 2, r: x + sw / 2, t: y - sh, b: y }); }
      s.el.hidden = !ok;
      if (ok) s.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
    }
  }

  // ---------- theme ----------
  function applyTheme() {
    const dark = document.documentElement.dataset.theme === 'dark'
      || (document.documentElement.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
    const sky = new THREE.Color(dark ? 0x14213a : 0xbfe6f5);
    scene.background = sky;
    scene.fog = new THREE.Fog(sky, 150, 330);
    ground.material.color.setHex(dark ? 0x3d6a3a : P.grass);
    ocean.material.color.setHex(dark ? 0x1b5f7d : P.water);
    hemi.intensity = dark ? 0.5 : 0.78;
    sun.intensity = dark ? 0.6 : 0.98;
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
      for (const n of nodes) if (n.pulse && n.ring) { const s = 1 + Math.sin(t * 3.2) * 0.045; n.ring.scale.set(s, s, 1); n.ring.material.opacity = 0.75 + Math.sin(t * 3.2) * 0.2; }
      for (const l of beacons) l.material.emissiveIntensity = 0.35 + (Math.sin(t * 4) + 1) * 0.35;
      for (const b of beams) b.rotation.y = t * 0.9;
      for (const b of boats) { b.g.position.y = Math.sin(t * 1.6 + b.phase) * 0.08; b.g.rotation.x = Math.sin(t * 1.3 + b.phase) * 0.04; }
      for (const c of cars) { c.t += c.speed * dt; placeCar(c); }
      dirty = true;
    }
    if (controls.update()) dirty = true;
    if (dirty) { renderer.render(scene, camera); placeTags(); dirty = false; }
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
        if (n.b.kind !== 'race') n.root.position.y = n.b.id === id ? 0.35 : 0;
      }
      if (id) flyToBuilding(id);
      requestRender();
    },
    setFilter(mode) {
      filter = mode;
      for (const n of nodes) {
        const on = mode === 'all' || needs(n.b) || n.b.kind === 'home';
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
