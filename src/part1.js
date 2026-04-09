import * as THREE from 'three';

const Colors = {
  red: 0xf25346,
  white: 0xd8d0d1,
  brown: 0x59332e,
  pink: 0xf5986e,
  brownDark: 0x23190f,
  blue: 0x68c3c0,
};

let scene;
let camera;
let fieldOfView;
let aspectRatio;
let nearPlane;
let farPlane;
let renderer;
let container;

let HEIGHT;
let WIDTH;
let mousePos = { x: 0, y: 0 };

function createScene() {
  HEIGHT = window.innerHeight;
  WIDTH = window.innerWidth;

  scene = new THREE.Scene();
  aspectRatio = WIDTH / HEIGHT;
  fieldOfView = 60;
  nearPlane = 1;
  farPlane = 10000;
  camera = new THREE.PerspectiveCamera(fieldOfView, aspectRatio, nearPlane, farPlane);
  scene.fog = null;
  camera.position.x = 0;
  camera.position.z = 200;
  camera.position.y = 100;

  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(WIDTH, HEIGHT);
  renderer.shadowMap.enabled = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container = document.getElementById('world');
  container.appendChild(renderer.domElement);

  window.addEventListener('resize', handleWindowResize, false);
}

function handleWindowResize() {
  HEIGHT = window.innerHeight;
  WIDTH = window.innerWidth;
  renderer.setSize(WIDTH, HEIGHT);
  camera.aspect = WIDTH / HEIGHT;
  camera.updateProjectionMatrix();
}

let ambientLight;
let hemisphereLight;
let shadowLight;

function createLights() {
  hemisphereLight = new THREE.HemisphereLight(0xaaaaaa, 0x000000, 0.9);
  shadowLight = new THREE.DirectionalLight(0xffffff, 0.9);
  shadowLight.position.set(150, 350, 350);
  shadowLight.castShadow = true;
  shadowLight.shadow.camera.left = -400;
  shadowLight.shadow.camera.right = 400;
  shadowLight.shadow.camera.top = 400;
  shadowLight.shadow.camera.bottom = -400;
  shadowLight.shadow.camera.near = 1;
  shadowLight.shadow.camera.far = 1000;
  shadowLight.shadow.mapSize.width = 2048;
  shadowLight.shadow.mapSize.height = 2048;

  scene.add(hemisphereLight);
  scene.add(shadowLight);
}

const AirPlane = function () {
  this.mesh = new THREE.Object3D();
  this.mesh.name = 'airPlane';

  const geomCockpit = new THREE.BoxGeometry(60, 50, 50, 1, 1, 1);
  const matCockpit = new THREE.MeshPhongMaterial({ color: Colors.red, flatShading: true });
  const cockpit = new THREE.Mesh(geomCockpit, matCockpit);
  cockpit.castShadow = true;
  cockpit.receiveShadow = true;
  this.mesh.add(cockpit);

  const geomEngine = new THREE.BoxGeometry(20, 50, 50, 1, 1, 1);
  const matEngine = new THREE.MeshPhongMaterial({ color: Colors.white, flatShading: true });
  const engine = new THREE.Mesh(geomEngine, matEngine);
  engine.position.x = 40;
  engine.castShadow = true;
  engine.receiveShadow = true;
  this.mesh.add(engine);

  const geomTailPlane = new THREE.BoxGeometry(15, 20, 5, 1, 1, 1);
  const matTailPlane = new THREE.MeshPhongMaterial({ color: Colors.red, flatShading: true });
  const tailPlane = new THREE.Mesh(geomTailPlane, matTailPlane);
  tailPlane.position.set(-35, 25, 0);
  tailPlane.castShadow = true;
  tailPlane.receiveShadow = true;
  this.mesh.add(tailPlane);

  const geomSideWing = new THREE.BoxGeometry(40, 8, 150, 1, 1, 1);
  const matSideWing = new THREE.MeshPhongMaterial({ color: Colors.red, flatShading: true });
  const sideWing = new THREE.Mesh(geomSideWing, matSideWing);
  sideWing.position.set(0, 0, 0);
  sideWing.castShadow = true;
  sideWing.receiveShadow = true;
  this.mesh.add(sideWing);

  const geomPropeller = new THREE.BoxGeometry(20, 10, 10, 1, 1, 1);
  const matPropeller = new THREE.MeshPhongMaterial({ color: Colors.brown, flatShading: true });
  this.propeller = new THREE.Mesh(geomPropeller, matPropeller);
  this.propeller.castShadow = true;
  this.propeller.receiveShadow = true;

  const geomBlade = new THREE.BoxGeometry(1, 100, 20, 1, 1, 1);
  const matBlade = new THREE.MeshPhongMaterial({ color: Colors.brownDark, flatShading: true });

  const blade = new THREE.Mesh(geomBlade, matBlade);
  blade.position.set(8, 0, 0);
  blade.castShadow = true;
  blade.receiveShadow = true;
  this.propeller.add(blade);
  this.propeller.position.set(50, 0, 0);
  this.mesh.add(this.propeller);
};

const Sky = function () {
  this.mesh = new THREE.Object3D();
  this.nClouds = 20;
  this.clouds = [];
  const stepAngle = (Math.PI * 2) / this.nClouds;
  for (let i = 0; i < this.nClouds; i++) {
    const c = new Cloud();
    this.clouds.push(c);
    const a = stepAngle * i;
    const h = 750 + Math.random() * 200;
    c.mesh.position.y = Math.sin(a) * h;
    c.mesh.position.x = Math.cos(a) * h;
    c.mesh.position.z = -400 - Math.random() * 400;
    c.mesh.rotation.z = a + Math.PI / 2;
    const s = 1 + Math.random() * 2;
    c.mesh.scale.set(s, s, s);
    this.mesh.add(c.mesh);
  }
};

const Sea = function () {
  const geom = new THREE.CylinderGeometry(600, 600, 800, 40, 10);
  geom.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
  const mat = new THREE.MeshPhongMaterial({
    color: Colors.blue,
    transparent: true,
    opacity: 0.6,
    flatShading: true,
  });
  this.mesh = new THREE.Mesh(geom, mat);
  this.mesh.receiveShadow = true;
};

const Cloud = function () {
  this.mesh = new THREE.Object3D();
  this.mesh.name = 'cloud';
  const geom = new THREE.BoxGeometry(20, 20, 20);
  const mat = new THREE.MeshPhongMaterial({
    color: Colors.white,
  });

  const nBlocs = 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < nBlocs; i++) {
    const m = new THREE.Mesh(geom.clone(), mat);
    m.position.x = i * 15;
    m.position.y = Math.random() * 10;
    m.position.z = Math.random() * 10;
    m.rotation.z = Math.random() * Math.PI * 2;
    m.rotation.y = Math.random() * Math.PI * 2;
    const s = 0.1 + Math.random() * 0.9;
    m.scale.set(s, s, s);
    m.castShadow = true;
    m.receiveShadow = true;
    this.mesh.add(m);
  }
};

let sea;
let airplane;
let sky;

function createPlane() {
  airplane = new AirPlane();
  airplane.mesh.scale.set(0.25, 0.25, 0.25);
  airplane.mesh.position.y = 100;
  scene.add(airplane.mesh);
}

function createSea() {
  sea = new Sea();
  sea.mesh.position.y = -600;
  scene.add(sea.mesh);
}

function createSky() {
  sky = new Sky();
  sky.mesh.position.y = -600;
  scene.add(sky.mesh);
}

function loop() {
  updatePlane();
  sea.mesh.rotation.z += 0.005;
  sky.mesh.rotation.z += 0.01;
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

function updatePlane() {
  const targetY = normalize(mousePos.y, -0.75, 0.75, 25, 175);
  const targetX = normalize(mousePos.x, -0.75, 0.75, -100, 100);
  airplane.mesh.position.y = targetY;
  airplane.mesh.position.x = targetX;
  airplane.propeller.rotation.x += 0.3;
}

function normalize(v, vmin, vmax, tmin, tmax) {
  const nv = Math.max(Math.min(v, vmax), vmin);
  const dv = vmax - vmin;
  const pc = (nv - vmin) / dv;
  const dt = tmax - tmin;
  return tmin + pc * dt;
}

function handleMouseMove(event) {
  const tx = -1 + (event.clientX / WIDTH) * 2;
  const ty = 1 - (event.clientY / HEIGHT) * 2;
  mousePos = { x: tx, y: ty };
}

function init() {
  document.addEventListener('mousemove', handleMouseMove, false);
  createScene();
  createLights();
  createPlane();
  createSea();
  createSky();
  loop();
}

window.addEventListener('load', init, false);
