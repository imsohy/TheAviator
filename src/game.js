import * as THREE from 'three';
import { ColorManagement } from 'three';
import gsap from 'gsap';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  deformCabinGeometry,
  propellerTipDeform,
  applyTranslationToBufferGeometry,
  mergeVertices,
} from './geometry-helpers.js';
import { createSeaLavaShaderMaterial } from './sea-lava-shader.js';

// COLORS
const Colors = {
  red: 0xf25346,
  white: 0xd8d0d1,
  brown: 0x59332e,
  brownDark: 0x23190f,
  pink: 0xf5986e,
  yellow: 0xf4ce93,
  blue: 0x68c3c0,
};

/** 비행기 위치(translation) 전용 부모. 자식으로 `airplane.mesh`(회전)와 1인칭 카메라를 두면 기체 roll/pitch가 카메라에 전달되지 않음. */
const FIRST_PERSON_CAMERA_LOCAL = {
  position: new THREE.Vector3(8 - 100, 7, 0),
  /** 이전(Math.PI/2) 대비 수평 시선 180° 반대 */
  rotation: new THREE.Euler(0, -Math.PI / 2, 0),
};

// GAME VARIABLES
let game;
let deltaTime = 0;
let newTime = new Date().getTime();
let oldTime = new Date().getTime();
const ennemiesPool = [];
const particlesPool = [];
function resetGame() {
  game = {
    speed: 0,
    initSpeed: 0.00035,
    baseSpeed: 0.00035,
    targetBaseSpeed: 0.00035,
    incrementSpeedByTime: 0.0000025,
    incrementSpeedByLevel: 0.000005,
    distanceForSpeedUpdate: 100,
    speedLastUpdate: 0,

    distance: 0,
    ratioSpeedDistance: 50,
    energy: 100,
    ratioSpeedEnergy: 3,

    level: 1,
    levelLastUpdate: 0,
    distanceForLevelUpdate: 1000,

    planeDefaultHeight: 100,
    planeAmpHeight: 80,
    planeAmpWidth: 75,
    planeMoveSensivity: 0.005,
    planeRotXSensivity: 0.0008,
    planeRotZSensivity: 0.0004,
    planeFallSpeed: 0.001,
    planeMinSpeed: 1.2,
    planeMaxSpeed: 1.6,
    planeSpeed: 0,
    planeCollisionDisplacementX: 0,
    planeCollisionSpeedX: 0,

    planeCollisionDisplacementY: 0,
    planeCollisionSpeedY: 0,

    seaRadius: 600,
    seaLength: 800,
    wavesMinAmp: 5,
    wavesMaxAmp: 20,
    wavesMinSpeed: 0.001,
    wavesMaxSpeed: 0.003,

    cameraFarPos: 500,
    cameraNearPos: 150,
    cameraSensivity: 0.002,

    coinDistanceTolerance: 15,
    coinValue: 3,
    coinsSpeed: 0.5,
    coinLastSpawn: 0,
    distanceForCoinsSpawn: 100,

    ennemyDistanceTolerance: 10,
    ennemyValue: 10,
    ennemiesSpeed: 0.6,
    ennemyLastSpawn: 0,
    distanceForEnnemiesSpawn: 50,

    status: 'playing',
  };
  fieldLevel.innerHTML = Math.floor(game.level);

  if (typeof sea !== 'undefined' && sea && sea.lavaUniforms) {
    sea.lavaUniforms.uWaveTime.value = 0;
    sea.lavaUniforms.time.value = 1.0;
  }
}

// THREEJS RELATED VARIABLES

let scene;
let camera;
let fieldOfView;
let aspectRatio;
let nearPlane;
let farPlane;
let renderer;
let container;
let orbitControls;
/** `'third'` | `'first'` | `'orbit'` — Space로 순환 */
let viewMode = 'third';

// SCREEN & MOUSE VARIABLES

let HEIGHT;
let WIDTH;
let mousePos = { x: 0, y: 0 };

/** 월드 축 이동: W/S → Y+, Y− / D/A → Z+, Z− (`KeyW` 등 `event.code`) */
const keysDown = new Set();
const KEYBOARD_PLANE_SPEED = 140;
const KEYBOARD_PLANE_Z_LIMIT = 120;
/** Air mesh nose along +local X: rotation.z ≈ pitch, rotation.x ≈ roll (radians scale ~0.45 ≈ 26°). */
const KEYBOARD_PLANE_PITCH_TILT = 0.45;
const KEYBOARD_PLANE_ROLL_TILT = 0.45;

/**
 * `mergeVertices` tolerance for sea cylinder.
 * - 파도 파라미터를 position 기반으로 결정적으로 만들면(아래 Sea 생성자) seam에서 크랙이 덜 나므로
 *   UV가 중요한 용암 셰이더에서는 과도한 병합(예: 2.1)로 UV seam이 붕괴되지 않게 작은 값을 유지합니다.
 */
const SEA_MERGE_VERTICES_TOLERANCE = 1e-4;
/**
 * 바다 **메시 전체**가 도는 속도만 `game.speed` 대비 줄이기 (0~1). 1이면 구버전과 동일 비율.
 * 정점 파도·용암 셰이더와는 별개. `talktocursor/SEA_WAVES_AND_ROTATION.md`, `talktocursor/SEA_LAVA_SHADER.md` 참고.
 */
const SEA_MESH_ROTATION_SCALE = 0.25;

// INIT THREE JS, SCREEN AND MOUSE EVENTS

function createScene() {
  /** r75 룩에 가깝게. 장기 정책·트레이드오프: talktocursor/COLOR_MANAGEMENT_LEGACY.md — WebGLRenderer보다 먼저. */
  ColorManagement.enabled = false;

  HEIGHT = window.innerHeight;
  WIDTH = window.innerWidth;

  scene = new THREE.Scene();
  const worldAxes = new THREE.AxesHelper(300);
  scene.add(worldAxes);
  aspectRatio = WIDTH / HEIGHT;
  fieldOfView = 50;
  nearPlane = 0.1;
  farPlane = 10000;
  camera = new THREE.PerspectiveCamera(fieldOfView, aspectRatio, nearPlane, farPlane);
  scene.fog = null;
  camera.position.x = 0;
  camera.position.z = 200;
  camera.position.y = game.planeDefaultHeight;

  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(WIDTH, HEIGHT);
  renderer.shadowMap.enabled = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  container = document.getElementById('world');
  container.appendChild(renderer.domElement);

  orbitControls = new OrbitControls(camera, renderer.domElement);
  orbitControls.enabled = false;
  orbitControls.enableDamping = true;
  orbitControls.dampingFactor = 0.08;
  orbitControls.target.set(0, game.planeDefaultHeight, 0);
  orbitControls.update();

  window.addEventListener('resize', handleWindowResize, false);
}

// MOUSE AND SCREEN EVENTS

function handleWindowResize() {
  HEIGHT = window.innerHeight;
  WIDTH = window.innerWidth;
  renderer.setSize(WIDTH, HEIGHT);
  camera.aspect = WIDTH / HEIGHT;
  camera.updateProjectionMatrix();
}

function handleMouseMove(event) {
  if (viewMode === 'orbit') return;
  const tx = -1 + (event.clientX / WIDTH) * 2;
  const ty = 1 - (event.clientY / HEIGHT) * 2;
  mousePos = { x: tx, y: ty };
}

function handleTouchMove(event) {
  event.preventDefault();
  if (viewMode === 'orbit') return;
  const tx = -1 + (event.touches[0].pageX / WIDTH) * 2;
  const ty = 1 - (event.touches[0].pageY / HEIGHT) * 2;
  mousePos = { x: tx, y: ty };
}

function detachCameraPreserveWorld() {
  if (!camera.parent) return;
  camera.updateMatrixWorld(true);
  const wp = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  camera.matrixWorld.decompose(wp, quat, scl);
  camera.parent.remove(camera);
  camera.position.copy(wp);
  camera.quaternion.copy(quat);
  camera.scale.set(1, 1, 1);
}

function applyThirdPersonCamera() {
  detachCameraPreserveWorld();
  camera.position.set(0, airplaneRig.position.y, 200);
  camera.rotation.set(0, 0, 0);
  camera.updateProjectionMatrix();
}

function enterFirstPerson() {
  orbitControls.enabled = false;
  camera.removeFromParent();
  airplaneRig.add(camera);
  camera.position.copy(FIRST_PERSON_CAMERA_LOCAL.position);
  camera.rotation.copy(FIRST_PERSON_CAMERA_LOCAL.rotation);
  camera.updateProjectionMatrix();
  viewMode = 'first';
}

function enterOrbitFromCurrent() {
  detachCameraPreserveWorld();
  orbitControls.target.copy(airplaneRig.position);
  orbitControls.update();
  orbitControls.enabled = true;
  viewMode = 'orbit';
}

function enterThirdPersonFromOrbit() {
  orbitControls.enabled = false;
  applyThirdPersonCamera();
  viewMode = 'third';
}

function cycleViewMode() {
  if (viewMode === 'third') {
    enterFirstPerson();
  } else if (viewMode === 'first') {
    enterOrbitFromCurrent();
  } else {
    enterThirdPersonFromOrbit();
  }
}

function handleKeyDown(event) {
  if (event.code === 'Space') {
    event.preventDefault();
    cycleViewMode();
    return;
  }
  if (event.code === 'KeyW' || event.code === 'KeyS' || event.code === 'KeyA' || event.code === 'KeyD') {
    keysDown.add(event.code);
    event.preventDefault();
  }
}

function handleKeyUp(event) {
  if (event.code === 'KeyW' || event.code === 'KeyS' || event.code === 'KeyA' || event.code === 'KeyD') {
    keysDown.delete(event.code);
    event.preventDefault();
  }
}

function handleMouseUp() {
  if (game.status == 'waitingReplay') {
    resetGame();
    hideReplay();
  }
}

function handleTouchEnd() {
  if (game.status == 'waitingReplay') {
    resetGame();
    hideReplay();
  }
}

// LIGHTS

let ambientLight;
let hemisphereLight;
let shadowLight;

function createLights() {
  hemisphereLight = new THREE.HemisphereLight(0xaaaaaa, 0x000000, 0.9);

  ambientLight = new THREE.AmbientLight(0xdc8874, 0.5);

  shadowLight = new THREE.DirectionalLight(0xffffff, 0.9);
  shadowLight.position.set(150, 350, 350);
  shadowLight.castShadow = true;
  shadowLight.shadow.camera.left = -400;
  shadowLight.shadow.camera.right = 400;
  shadowLight.shadow.camera.top = 400;
  shadowLight.shadow.camera.bottom = -400;
  shadowLight.shadow.camera.near = 1;
  shadowLight.shadow.camera.far = 1000;
  shadowLight.shadow.mapSize.width = 4096;
  shadowLight.shadow.mapSize.height = 4096;

  scene.add(hemisphereLight);
  scene.add(shadowLight);
  scene.add(ambientLight);
}

const Pilot = function () {
  this.mesh = new THREE.Object3D();
  this.mesh.name = 'pilot';
  this.angleHairs = 0;

  const bodyGeom = new THREE.BoxGeometry(15, 15, 15);
  const bodyMat = new THREE.MeshPhongMaterial({ color: Colors.brown, flatShading: true });
  const body = new THREE.Mesh(bodyGeom, bodyMat);
  body.position.set(2, -12, 0);

  this.mesh.add(body);

  const faceGeom = new THREE.BoxGeometry(10, 10, 10);
  const faceMat = new THREE.MeshLambertMaterial({ color: Colors.pink });
  const face = new THREE.Mesh(faceGeom, faceMat);
  this.mesh.add(face);

  const hairGeom = new THREE.BoxGeometry(4, 4, 4);
  const hairMat = new THREE.MeshLambertMaterial({ color: Colors.brown });
  const hair = new THREE.Mesh(hairGeom, hairMat);
  applyTranslationToBufferGeometry(hair.geometry, 0, 2, 0);
  const hairs = new THREE.Object3D();

  this.hairsTop = new THREE.Object3D();

  for (let i = 0; i < 12; i++) {
    const h = hair.clone();
    const col = i % 3;
    const row = Math.floor(i / 3);
    const startPosZ = -4;
    const startPosX = -4;
    h.position.set(startPosX + row * 4, 0, startPosZ + col * 4);
    this.hairsTop.add(h);
  }
  hairs.add(this.hairsTop);

  const hairSideGeom = new THREE.BoxGeometry(12, 4, 2);
  applyTranslationToBufferGeometry(hairSideGeom, -6, 0, 0);
  const hairSideR = new THREE.Mesh(hairSideGeom, hairMat);
  const hairSideL = hairSideR.clone();
  hairSideR.position.set(8, -2, 6);
  hairSideL.position.set(8, -2, -6);
  hairs.add(hairSideR);
  hairs.add(hairSideL);

  const hairBackGeom = new THREE.BoxGeometry(2, 8, 10);
  const hairBack = new THREE.Mesh(hairBackGeom, hairMat);
  hairBack.position.set(-1, -4, 0);
  hairs.add(hairBack);
  hairs.position.set(-5, 5, 0);

  this.mesh.add(hairs);

  const glassGeom = new THREE.BoxGeometry(5, 5, 5);
  const glassMat = new THREE.MeshLambertMaterial({ color: Colors.brown });
  const glassR = new THREE.Mesh(glassGeom, glassMat);
  glassR.position.set(6, 0, 3);
  const glassL = glassR.clone();
  glassL.position.z = -glassR.position.z;

  const glassAGeom = new THREE.BoxGeometry(11, 1, 11);
  const glassA = new THREE.Mesh(glassAGeom, glassMat);
  this.mesh.add(glassR);
  this.mesh.add(glassL);
  this.mesh.add(glassA);

  const earGeom = new THREE.BoxGeometry(2, 3, 2);
  const earL = new THREE.Mesh(earGeom, faceMat);
  earL.position.set(0, 0, -6);
  const earR = earL.clone();
  earR.position.set(0, 0, 6);
  this.mesh.add(earL);
  this.mesh.add(earR);
};

Pilot.prototype.updateHairs = function () {
  const hairs = this.hairsTop.children;

  const l = hairs.length;
  for (let i = 0; i < l; i++) {
    const h = hairs[i];
    h.scale.y = 0.75 + Math.cos(this.angleHairs + i / 3) * 0.25;
  }
  this.angleHairs += game.speed * deltaTime * 40;
};

const AirPlane = function () {
  this.mesh = new THREE.Object3D();
  this.mesh.name = 'airPlane';

  const geomCabin = deformCabinGeometry(new THREE.BoxGeometry(80, 50, 50, 1, 1, 1));
  const matCabin = new THREE.MeshPhongMaterial({ color: Colors.red, flatShading: true });

  const cabin = new THREE.Mesh(geomCabin, matCabin);
  cabin.castShadow = true;
  cabin.receiveShadow = true;
  this.mesh.add(cabin);

  const geomEngine = new THREE.BoxGeometry(20, 50, 50, 1, 1, 1);
  const matEngine = new THREE.MeshPhongMaterial({ color: Colors.white, flatShading: true });
  const engine = new THREE.Mesh(geomEngine, matEngine);
  engine.position.x = 50;
  engine.castShadow = true;
  engine.receiveShadow = true;
  this.mesh.add(engine);

  const geomTailPlane = new THREE.BoxGeometry(15, 20, 5, 1, 1, 1);
  const matTailPlane = new THREE.MeshPhongMaterial({ color: Colors.red, flatShading: true });
  const tailPlane = new THREE.Mesh(geomTailPlane, matTailPlane);
  tailPlane.position.set(-40, 20, 0);
  tailPlane.castShadow = true;
  tailPlane.receiveShadow = true;
  this.mesh.add(tailPlane);

  const geomSideWing = new THREE.BoxGeometry(30, 5, 120, 1, 1, 1);
  const matSideWing = new THREE.MeshPhongMaterial({ color: Colors.red, flatShading: true });
  const sideWing = new THREE.Mesh(geomSideWing, matSideWing);
  sideWing.position.set(0, 15, 0);
  sideWing.castShadow = true;
  sideWing.receiveShadow = true;
  this.mesh.add(sideWing);

  const geomWindshield = new THREE.BoxGeometry(3, 15, 20, 1, 1, 1);
  const matWindshield = new THREE.MeshPhongMaterial({
    color: Colors.white,
    transparent: true,
    opacity: 0.3,
    flatShading: true,
  });
  const windshield = new THREE.Mesh(geomWindshield, matWindshield);
  windshield.position.set(5, 27, 0);

  windshield.castShadow = true;
  windshield.receiveShadow = true;

  this.mesh.add(windshield);

  const geomPropeller = propellerTipDeform(new THREE.BoxGeometry(20, 10, 10, 1, 1, 1));
  const matPropeller = new THREE.MeshPhongMaterial({ color: Colors.brown, flatShading: true });
  this.propeller = new THREE.Mesh(geomPropeller, matPropeller);

  this.propeller.castShadow = true;
  this.propeller.receiveShadow = true;

  const geomBlade = new THREE.BoxGeometry(1, 80, 10, 1, 1, 1);
  const matBlade = new THREE.MeshPhongMaterial({ color: Colors.brownDark, flatShading: true });
  const blade1 = new THREE.Mesh(geomBlade, matBlade);
  blade1.position.set(8, 0, 0);

  blade1.castShadow = true;
  blade1.receiveShadow = true;

  const blade2 = blade1.clone();
  blade2.rotation.x = Math.PI / 2;

  blade2.castShadow = true;
  blade2.receiveShadow = true;

  this.propeller.add(blade1);
  this.propeller.add(blade2);
  this.propeller.position.set(60, 0, 0);
  this.mesh.add(this.propeller);

  const wheelProtecGeom = new THREE.BoxGeometry(30, 15, 10, 1, 1, 1);
  const wheelProtecMat = new THREE.MeshPhongMaterial({ color: Colors.red, flatShading: true });
  const wheelProtecR = new THREE.Mesh(wheelProtecGeom, wheelProtecMat);
  wheelProtecR.position.set(25, -20, 25);
  this.mesh.add(wheelProtecR);

  const wheelTireGeom = new THREE.BoxGeometry(24, 24, 4);
  const wheelTireMat = new THREE.MeshPhongMaterial({ color: Colors.brownDark, flatShading: true });
  const wheelTireR = new THREE.Mesh(wheelTireGeom, wheelTireMat);
  wheelTireR.position.set(25, -28, 25);

  const wheelAxisGeom = new THREE.BoxGeometry(10, 10, 6);
  const wheelAxisMat = new THREE.MeshPhongMaterial({ color: Colors.brown, flatShading: true });
  const wheelAxis = new THREE.Mesh(wheelAxisGeom, wheelAxisMat);
  wheelTireR.add(wheelAxis);

  this.mesh.add(wheelTireR);

  const wheelProtecL = wheelProtecR.clone();
  wheelProtecL.position.z = -wheelProtecR.position.z;
  this.mesh.add(wheelProtecL);

  const wheelTireL = wheelTireR.clone();
  wheelTireL.position.z = -wheelTireR.position.z;
  this.mesh.add(wheelTireL);

  const wheelTireB = wheelTireR.clone();
  wheelTireB.scale.set(0.5, 0.5, 0.5);
  wheelTireB.position.set(-35, -5, 0);
  this.mesh.add(wheelTireB);

  const suspensionGeom = new THREE.BoxGeometry(4, 20, 4);
  applyTranslationToBufferGeometry(suspensionGeom, 0, 10, 0);
  const suspensionMat = new THREE.MeshPhongMaterial({ color: Colors.red, flatShading: true });
  const suspension = new THREE.Mesh(suspensionGeom, suspensionMat);
  suspension.position.set(-35, -5, 0);
  suspension.rotation.z = -0.3;
  this.mesh.add(suspension);

  this.pilot = new Pilot();
  this.pilot.mesh.position.set(-10, 27, 0);
  this.mesh.add(this.pilot.mesh);

  this.mesh.castShadow = true;
  this.mesh.receiveShadow = true;
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
    const h = game.seaRadius + 150 + Math.random() * 200;
    c.mesh.position.y = Math.sin(a) * h;
    c.mesh.position.x = Math.cos(a) * h;
    c.mesh.position.z = -300 - Math.random() * 500;
    c.mesh.rotation.z = a + Math.PI / 2;
    const s = 1 + Math.random() * 2;
    c.mesh.scale.set(s, s, s);
    this.mesh.add(c.mesh);
  }
};

Sky.prototype.moveClouds = function () {
  for (let i = 0; i < this.nClouds; i++) {
    const c = this.clouds[i];
    c.rotate();
  }
  this.mesh.rotation.z += game.speed * deltaTime;
};

const Sea = function () {
  let geom = new THREE.CylinderGeometry(game.seaRadius, game.seaRadius, game.seaLength, 40, 10);
  geom.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
  geom = mergeVertices(geom, SEA_MERGE_VERTICES_TOLERANCE);

  const pos = geom.attributes.position;
  const l = pos.count;

  const phaseArr = new Float32Array(l);
  const ampArr = new Float32Array(l);
  const speedArr = new Float32Array(l);

  // UV seam(원통 u=0/1)에서 정점이 중복될 수 있어도, 같은 위치는 같은 파도 파라미터를 갖게 만든다.
  // (mergeVertices tolerance를 크게 올려 seam을 강제 용접하면 UV가 무너져 부채꼴/핀치가 생길 수 있음)
  const q = 1000; // position quantize for stable hashing
  const hash3 = (x, y, z) => {
    // integer mix (xorshift-ish) using quantized position
    let h = 2166136261;
    h = Math.imul(h ^ (x | 0), 16777619);
    h = Math.imul(h ^ (y | 0), 16777619);
    h = Math.imul(h ^ (z | 0), 16777619);
    // final avalanche
    h ^= h >>> 13;
    h = Math.imul(h, 1274126177);
    h ^= h >>> 16;
    return h >>> 0;
  };
  const rand01 = (seed) => {
    // deterministic [0,1)
    let t = (seed + 0x6d2b79f5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  for (let i = 0; i < l; i++) {
    const xq = Math.round(pos.getX(i) * q);
    const yq = Math.round(pos.getY(i) * q);
    const zq = Math.round(pos.getZ(i) * q);
    const h = hash3(xq, yq, zq);
    const r0 = rand01(h);
    const r1 = rand01(h ^ 0x9e3779b9);
    const r2 = rand01(h ^ 0x85ebca6b);

    phaseArr[i] = r0 * Math.PI * 2;
    ampArr[i] = game.wavesMinAmp + r1 * (game.wavesMaxAmp - game.wavesMinAmp);
    speedArr[i] = game.wavesMinSpeed + r2 * (game.wavesMaxSpeed - game.wavesMinSpeed);
  }
  geom.setAttribute('wavePhase', new THREE.BufferAttribute(phaseArr, 1));
  geom.setAttribute('waveAmp', new THREE.BufferAttribute(ampArr, 1));
  geom.setAttribute('waveSpeed', new THREE.BufferAttribute(speedArr, 1));

  const { material: mat, uniforms: lavaUniforms } = createSeaLavaShaderMaterial();
  this.lavaUniforms = lavaUniforms;

  this.mesh = new THREE.Mesh(geom, mat);
  this.mesh.name = 'waves';
  /** ShaderMaterial은 기본 그림자 맵 수신 없음 — 용암만 쓰려면 끔 */
  this.mesh.receiveShadow = false;
};

/**
 * 파도 위상(uWaveTime) + 용암 애니메이션(time). 예제 webgl_shader_lava 와 유사한 time 증가.
 */
Sea.prototype.tickWaveTime = function () {
  if (!this.lavaUniforms) return;
  this.lavaUniforms.uWaveTime.value += deltaTime;
  const ds = deltaTime * 0.001;
  this.lavaUniforms.time.value += 0.2 * 5.0 * ds;
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
    this.mesh.add(m);
    m.castShadow = true;
    m.receiveShadow = true;
  }
};

Cloud.prototype.rotate = function () {
  const l = this.mesh.children.length;
  for (let i = 0; i < l; i++) {
    const m = this.mesh.children[i];
    m.rotation.z += Math.random() * 0.005 * (i + 1);
    m.rotation.y += Math.random() * 0.002 * (i + 1);
  }
};

const Ennemy = function () {
  const geom = new THREE.TetrahedronGeometry(8, 2);
  const mat = new THREE.MeshPhongMaterial({
    color: Colors.red,
    shininess: 0,
    specular: 0xffffff,
    flatShading: true,
  });
  this.mesh = new THREE.Mesh(geom, mat);
  this.mesh.castShadow = true;
  this.angle = 0;
  this.dist = 0;
};

const EnnemiesHolder = function () {
  this.mesh = new THREE.Object3D();
  this.ennemiesInUse = [];
};

EnnemiesHolder.prototype.spawnEnnemies = function () {
  const nEnnemies = game.level;

  for (let i = 0; i < nEnnemies; i++) {
    let ennemy;
    if (ennemiesPool.length) {
      ennemy = ennemiesPool.pop();
    } else {
      ennemy = new Ennemy();
    }

    ennemy.angle = -(i * 0.1);
    ennemy.distance =
      game.seaRadius + game.planeDefaultHeight + (-1 + Math.random() * 2) * (game.planeAmpHeight - 20);
    ennemy.mesh.position.y = -game.seaRadius + Math.sin(ennemy.angle) * ennemy.distance;
    ennemy.mesh.position.x = Math.cos(ennemy.angle) * ennemy.distance;

    this.mesh.add(ennemy.mesh);
    this.ennemiesInUse.push(ennemy);
  }
};

EnnemiesHolder.prototype.rotateEnnemies = function () {
  for (let i = 0; i < this.ennemiesInUse.length; i++) {
    const ennemy = this.ennemiesInUse[i];
    ennemy.angle += game.speed * deltaTime * game.ennemiesSpeed;

    if (ennemy.angle > Math.PI * 2) ennemy.angle -= Math.PI * 2;

    ennemy.mesh.position.y = -game.seaRadius + Math.sin(ennemy.angle) * ennemy.distance;
    ennemy.mesh.position.x = Math.cos(ennemy.angle) * ennemy.distance;
    ennemy.mesh.rotation.z += Math.random() * 0.1;
    ennemy.mesh.rotation.y += Math.random() * 0.1;

    const diffPos = airplaneRig.position.clone().sub(ennemy.mesh.position);
    const d = diffPos.length();
    if (d < game.ennemyDistanceTolerance) {
      particlesHolder.spawnParticles(ennemy.mesh.position.clone(), 15, Colors.red, 3);

      ennemiesPool.unshift(this.ennemiesInUse.splice(i, 1)[0]);
      this.mesh.remove(ennemy.mesh);
      game.planeCollisionSpeedX = (100 * diffPos.x) / d;
      game.planeCollisionSpeedY = (100 * diffPos.y) / d;
      ambientLight.intensity = 2;

      removeEnergy();
      i--;
    } else if (ennemy.angle > Math.PI) {
      ennemiesPool.unshift(this.ennemiesInUse.splice(i, 1)[0]);
      this.mesh.remove(ennemy.mesh);
      i--;
    }
  }
};

const Particle = function () {
  const geom = new THREE.TetrahedronGeometry(3, 0);
  const mat = new THREE.MeshPhongMaterial({
    color: 0x009999,
    shininess: 0,
    specular: 0xffffff,
    flatShading: true,
  });
  this.mesh = new THREE.Mesh(geom, mat);
};

Particle.prototype.explode = function (pos, color, scale) {
  const _this = this;
  const _p = this.mesh.parent;
  this.mesh.material.color = new THREE.Color(color);
  this.mesh.material.needsUpdate = true;
  this.mesh.scale.set(scale, scale, scale);
  const targetX = pos.x + (-1 + Math.random() * 2) * 50;
  const targetY = pos.y + (-1 + Math.random() * 2) * 50;
  const speed = 0.6 + Math.random() * 0.2;
  gsap.to(this.mesh.rotation, {
    x: Math.random() * 12,
    y: Math.random() * 12,
    duration: speed,
  });
  gsap.to(this.mesh.scale, { x: 0.1, y: 0.1, z: 0.1, duration: speed });
  gsap.to(this.mesh.position, {
    x: targetX,
    y: targetY,
    duration: speed,
    delay: Math.random() * 0.1,
    ease: 'power2.out',
    onComplete: function () {
      if (_p) _p.remove(_this.mesh);
      _this.mesh.scale.set(1, 1, 1);
      particlesPool.unshift(_this);
    },
  });
};

const ParticlesHolder = function () {
  this.mesh = new THREE.Object3D();
  this.particlesInUse = [];
};

ParticlesHolder.prototype.spawnParticles = function (pos, density, color, scale) {
  const nPArticles = density;
  for (let i = 0; i < nPArticles; i++) {
    let particle;
    if (particlesPool.length) {
      particle = particlesPool.pop();
    } else {
      particle = new Particle();
    }
    this.mesh.add(particle.mesh);
    particle.mesh.visible = true;
    particle.mesh.position.y = pos.y;
    particle.mesh.position.x = pos.x;
    particle.explode(pos, color, scale);
  }
};

const Coin = function () {
  const geom = new THREE.TetrahedronGeometry(5, 0);
  const mat = new THREE.MeshPhongMaterial({
    color: 0x009999,
    shininess: 0,
    specular: 0xffffff,

    flatShading: true,
  });
  this.mesh = new THREE.Mesh(geom, mat);
  this.mesh.castShadow = true;
  this.angle = 0;
  this.dist = 0;
};

const CoinsHolder = function (nCoins) {
  this.mesh = new THREE.Object3D();
  this.coinsInUse = [];
  this.coinsPool = [];
  for (let i = 0; i < nCoins; i++) {
    const coin = new Coin();
    this.coinsPool.push(coin);
  }
};

CoinsHolder.prototype.spawnCoins = function () {
  const nCoins = 1 + Math.floor(Math.random() * 10);
  const d =
    game.seaRadius + game.planeDefaultHeight + (-1 + Math.random() * 2) * (game.planeAmpHeight - 20);
  const amplitude = 10 + Math.round(Math.random() * 10);
  for (let i = 0; i < nCoins; i++) {
    let coin;
    if (this.coinsPool.length) {
      coin = this.coinsPool.pop();
    } else {
      coin = new Coin();
    }
    this.mesh.add(coin.mesh);
    this.coinsInUse.push(coin);
    coin.angle = -(i * 0.02);
    coin.distance = d + Math.cos(i * 0.5) * amplitude;
    coin.mesh.position.y = -game.seaRadius + Math.sin(coin.angle) * coin.distance;
    coin.mesh.position.x = Math.cos(coin.angle) * coin.distance;
  }
};

CoinsHolder.prototype.rotateCoins = function () {
  for (let i = 0; i < this.coinsInUse.length; i++) {
    const coin = this.coinsInUse[i];
    if (coin.exploding) continue;
    coin.angle += game.speed * deltaTime * game.coinsSpeed;
    if (coin.angle > Math.PI * 2) coin.angle -= Math.PI * 2;
    coin.mesh.position.y = -game.seaRadius + Math.sin(coin.angle) * coin.distance;
    coin.mesh.position.x = Math.cos(coin.angle) * coin.distance;
    coin.mesh.rotation.z += Math.random() * 0.1;
    coin.mesh.rotation.y += Math.random() * 0.1;

    const diffPos = airplaneRig.position.clone().sub(coin.mesh.position);
    const d = diffPos.length();
    if (d < game.coinDistanceTolerance) {
      const hitPos = coin.mesh.position.clone();
      this.coinsPool.unshift(this.coinsInUse.splice(i, 1)[0]);
      this.mesh.remove(coin.mesh);
      particlesHolder.spawnParticles(hitPos, 5, 0x009999, 0.8);
      addEnergy();
      i--;
    } else if (coin.angle > Math.PI) {
      this.coinsPool.unshift(this.coinsInUse.splice(i, 1)[0]);
      this.mesh.remove(coin.mesh);
      i--;
    }
  }
};

// 3D Models
let sea;
let airplane;
/** translation만 담당. 자식: `airplane.mesh`(회전), 1인칭 시 `camera` */
let airplaneRig;
let sky;
let coinsHolder;
let ennemiesHolder;
let particlesHolder;

function createPlane() {
  airplaneRig = new THREE.Object3D();
  airplaneRig.name = 'airPlaneRig';
  airplane = new AirPlane();
  airplane.mesh.scale.set(0.25, 0.25, 0.25);
  airplane.mesh.position.set(0, 0, 0);
  airplaneRig.position.set(0, game.planeDefaultHeight, 0);
  airplaneRig.add(airplane.mesh);
  scene.add(airplaneRig);
}

function createSea() {
  sea = new Sea();
  sea.mesh.position.y = -game.seaRadius;
  scene.add(sea.mesh);
}

function createSky() {
  sky = new Sky();
  sky.mesh.position.y = -game.seaRadius;
  scene.add(sky.mesh);
}

function createCoins() {
  coinsHolder = new CoinsHolder(20);
  scene.add(coinsHolder.mesh);
}

function createEnnemies() {
  for (let i = 0; i < 10; i++) {
    const ennemy = new Ennemy();
    ennemiesPool.push(ennemy);
  }
  ennemiesHolder = new EnnemiesHolder();
  scene.add(ennemiesHolder.mesh);
}

function createParticles() {
  for (let i = 0; i < 10; i++) {
    const particle = new Particle();
    particlesPool.push(particle);
  }
  particlesHolder = new ParticlesHolder();
  scene.add(particlesHolder.mesh);
}

function loop() {
  newTime = new Date().getTime();
  deltaTime = newTime - oldTime;
  oldTime = newTime;

  if (game.status == 'playing') {
    if (
      Math.floor(game.distance) % game.distanceForCoinsSpawn == 0 &&
      Math.floor(game.distance) > game.coinLastSpawn
    ) {
      game.coinLastSpawn = Math.floor(game.distance);
      coinsHolder.spawnCoins();
    }

    if (
      Math.floor(game.distance) % game.distanceForSpeedUpdate == 0 &&
      Math.floor(game.distance) > game.speedLastUpdate
    ) {
      game.speedLastUpdate = Math.floor(game.distance);
      game.targetBaseSpeed += game.incrementSpeedByTime * deltaTime;
    }

    if (
      Math.floor(game.distance) % game.distanceForEnnemiesSpawn == 0 &&
      Math.floor(game.distance) > game.ennemyLastSpawn
    ) {
      game.ennemyLastSpawn = Math.floor(game.distance);
      ennemiesHolder.spawnEnnemies();
    }

    if (
      Math.floor(game.distance) % game.distanceForLevelUpdate == 0 &&
      Math.floor(game.distance) > game.levelLastUpdate
    ) {
      game.levelLastUpdate = Math.floor(game.distance);
      game.level++;
      fieldLevel.innerHTML = Math.floor(game.level);

      game.targetBaseSpeed = game.initSpeed + game.incrementSpeedByLevel * game.level;
    }

    updatePlane();
    updateDistance();
    updateEnergy();
    game.baseSpeed += (game.targetBaseSpeed - game.baseSpeed) * deltaTime * 0.02;
    game.speed = game.baseSpeed * game.planeSpeed;
  } else if (game.status == 'gameover') {
    game.speed *= 0.99;
    airplane.mesh.rotation.z += (-Math.PI / 2 - airplane.mesh.rotation.z) * 0.0002 * deltaTime;
    airplane.mesh.rotation.x += 0.0003 * deltaTime;
    game.planeFallSpeed *= 1.05;
    airplaneRig.position.y -= game.planeFallSpeed * deltaTime;

    if (airplaneRig.position.y < -200) {
      showReplay();
      game.status = 'waitingReplay';
    }
  } else if (game.status == 'waitingReplay') {
    // waiting
  }

  airplane.propeller.rotation.x += 0.2 + game.planeSpeed * deltaTime * 0.005;
  sea.mesh.rotation.z += game.speed * deltaTime * SEA_MESH_ROTATION_SCALE;

  if (sea.mesh.rotation.z > 2 * Math.PI) sea.mesh.rotation.z -= 2 * Math.PI;

  ambientLight.intensity += (0.5 - ambientLight.intensity) * deltaTime * 0.005;

  coinsHolder.rotateCoins();
  ennemiesHolder.rotateEnnemies();

  sky.moveClouds();
  sea.tickWaveTime();

  if (viewMode === 'orbit') {
    orbitControls.target.lerp(airplaneRig.position, 0.12);
    orbitControls.update();
  }

  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

function updateDistance() {
  game.distance += game.speed * deltaTime * game.ratioSpeedDistance;
  fieldDistance.innerHTML = Math.floor(game.distance);
  const d = 502 * (1 - (game.distance % game.distanceForLevelUpdate) / game.distanceForLevelUpdate);
  levelCircle.setAttribute('stroke-dashoffset', d);
}

function updateEnergy() {
  game.energy -= game.speed * deltaTime * game.ratioSpeedEnergy;
  game.energy = Math.max(0, game.energy);
  energyBar.style.right = 100 - game.energy + '%';
  energyBar.style.backgroundColor = game.energy < 50 ? '#f25346' : '#68c3c0';

  if (game.energy < 30) {
    energyBar.style.animationName = 'blinking';
  } else {
    energyBar.style.animationName = 'none';
  }

  if (game.energy < 1) {
    game.status = 'gameover';
  }
}

function addEnergy() {
  game.energy += game.coinValue;
  game.energy = Math.min(game.energy, 100);
}

function removeEnergy() {
  game.energy -= game.ennemyValue;
  game.energy = Math.max(0, game.energy);
}

function updatePlane() {
  const dtSec = deltaTime * 0.001;

  const movingKeys =
    keysDown.has('KeyW') ||
    keysDown.has('KeyS') ||
    keysDown.has('KeyA') ||
    keysDown.has('KeyD');
  game.planeSpeed = movingKeys ? game.planeMaxSpeed : game.planeMinSpeed;

  if (viewMode !== 'orbit') {
    let inputY = 0;
    let inputZ = 0;
    if (keysDown.has('KeyW')) inputY += 1;
    if (keysDown.has('KeyS')) inputY -= 1;
    if (keysDown.has('KeyD')) inputZ += 1;
    if (keysDown.has('KeyA')) inputZ -= 1;
    const len = Math.hypot(inputY, inputZ);
    if (len > 1e-6) {
      inputY /= len;
      inputZ /= len;
    }
    airplaneRig.position.y += inputY * KEYBOARD_PLANE_SPEED * dtSec;
    airplaneRig.position.z += inputZ * KEYBOARD_PLANE_SPEED * dtSec;

    const yMin = game.planeDefaultHeight - game.planeAmpHeight;
    const yMax = game.planeDefaultHeight + game.planeAmpHeight;
    airplaneRig.position.y = THREE.MathUtils.clamp(airplaneRig.position.y, yMin, yMax);
    airplaneRig.position.z = THREE.MathUtils.clamp(
      airplaneRig.position.z,
      -KEYBOARD_PLANE_Z_LIMIT,
      KEYBOARD_PLANE_Z_LIMIT,
    );

    // Pitch: +rotation.z (local Z, RH rule) tips +X nose toward +Y — use +inputY so W (climb) nose-up.
    airplane.mesh.rotation.z = inputY * KEYBOARD_PLANE_PITCH_TILT;
    airplane.mesh.rotation.x = inputZ * KEYBOARD_PLANE_ROLL_TILT;
  }

  game.planeCollisionDisplacementX += game.planeCollisionSpeedX;
  game.planeCollisionDisplacementY += game.planeCollisionSpeedY;

  const targetX = game.planeCollisionDisplacementX;
  const targetY = airplaneRig.position.y + game.planeCollisionDisplacementY;

  airplaneRig.position.x += (targetX - airplaneRig.position.x) * deltaTime * game.planeMoveSensivity;
  airplaneRig.position.y += (targetY - airplaneRig.position.y) * deltaTime * game.planeMoveSensivity;

  game.planeCollisionSpeedX += (0 - game.planeCollisionSpeedX) * deltaTime * 0.03;
  game.planeCollisionDisplacementX += (0 - game.planeCollisionDisplacementX) * deltaTime * 0.01;
  game.planeCollisionSpeedY += (0 - game.planeCollisionSpeedY) * deltaTime * 0.03;
  game.planeCollisionDisplacementY += (0 - game.planeCollisionDisplacementY) * deltaTime * 0.01;

  if (viewMode === 'third') {
    camera.fov = normalize(mousePos.x, -1, 1, 40, 80);
    camera.updateProjectionMatrix();
    camera.position.y += (airplaneRig.position.y - camera.position.y) * deltaTime * game.cameraSensivity;
  }

  airplane.pilot.updateHairs();
}

function showReplay() {
  replayMessage.style.display = 'block';
}

function hideReplay() {
  replayMessage.style.display = 'none';
}

function normalize(v, vmin, vmax, tmin, tmax) {
  const nv = Math.max(Math.min(v, vmax), vmin);
  const dv = vmax - vmin;
  const pc = (nv - vmin) / dv;
  const dt = tmax - tmin;
  const tv = tmin + pc * dt;
  return tv;
}

let fieldDistance;
let energyBar;
let replayMessage;
let fieldLevel;
let levelCircle;

function init() {
  fieldDistance = document.getElementById('distValue');
  energyBar = document.getElementById('energyBar');
  replayMessage = document.getElementById('replayMessage');
  fieldLevel = document.getElementById('levelValue');
  levelCircle = document.getElementById('levelCircleStroke');

  resetGame();
  createScene();

  createLights();
  createPlane();
  createSea();
  createSky();
  createCoins();
  createEnnemies();
  createParticles();

  document.addEventListener('mousemove', handleMouseMove, false);
  document.addEventListener('touchmove', handleTouchMove, false);
  document.addEventListener('mouseup', handleMouseUp, false);
  document.addEventListener('touchend', handleTouchEnd, false);
  document.addEventListener('keydown', handleKeyDown, false);
  document.addEventListener('keyup', handleKeyUp, false);

  loop();
}

export { init };
