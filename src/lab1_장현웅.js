import * as THREE from 'three';
import { ColorManagement } from 'three';
import gsap from 'gsap';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
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
/** Lab1 O·Legacy Space 1인칭: mesh에 완전 고정(roll/pitch 그대로). 코가 보이도록 약간 더 위·뒤(로컬 −X) */
const FIRST_PERSON_CAMERA_LOCAL = {
  position: new THREE.Vector3(11, 44, 0),
  rotation: new THREE.Euler(0, -Math.PI / 2, 0),
};

/** Lab1 K: 기체 위치 동행 + 월드 위·살짝 뒤, 시선은 비행 전방(+X) */
const FOLLOW_CAM_UP_OFFSET = 30;
const FOLLOW_CAM_BACK_OFFSET = 28;
const FOLLOW_CAM_LOOK_AHEAD = 500;

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
    // d92f... 원본 체감에 맞춰 전체 진행 속도 기본값을 소폭 낮춤
    initSpeed: 0.00028,
    baseSpeed: 0.00028,
    targetBaseSpeed: 0.00028,
    incrementSpeedByTime: 0.0000020,
    incrementSpeedByLevel: 0.000004,
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
    // planeSpeed는 game.speed(진행/회전 속도)에 곱해지므로 범위를 과하게 키우면 오브젝트가 과속으로 돎.
    // d92f...에서 mousePos.x의 평균이 중앙 근처였던 점을 고려해, 키보드(targetPos) 기반에서는 범위를 보수적으로 둠.
    planeMinSpeed: 1.0,
    planeMaxSpeed: 1.3,
    // 초기에는 "도착 상태"에 가깝게 시작(스텝 입력 전 급가속 느낌 방지)
    planeSpeed: 1.0,
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

  if (typeof airplane !== 'undefined' && airplane?.mesh && airplaneRig) {
    lab1ResetPlaneState();
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
let composer;
/** `'third'` | `'first'` | `'orbit'` — Space로 순환(단, `legacyViewSwitchingEnabled`일 때만) */
let viewMode = 'third';

/** Space로 third↔first↔orbit 순환 — 기본 끔. HTML `legacyViewToggleBtn`으로만 켬. */
let legacyViewSwitchingEnabled = false;

/** Lab1: I=third, O=cockpit(100% 1인칭), P=top, K=follow(위에서 동행) — third/top만 lerp/slerp, O·K는 매 프레임 스냅 */
let lab1CamActivePreset = null;
const lab1CamTargetPos = new THREE.Vector3();
const lab1CamTargetQuat = new THREE.Quaternion();
const _lab1CamLookMtx = new THREE.Matrix4();
const _WORLD_UP = new THREE.Vector3(0, 1, 0);
const _qFpLocal = new THREE.Quaternion();
const _qMeshWorld = new THREE.Quaternion();
const _camFollowForward = new THREE.Vector3();
const _camFollowLookAt = new THREE.Vector3();

// SCREEN & MOUSE VARIABLES

let HEIGHT;
let WIDTH;
let mousePos = { x: 0, y: 0 };

/**
 * Lab1 (WASD):
 * - keydown에서는 "목표값"만 세팅한다. (targetPos / startQuat / targetQuat)
 * - 실제 이동/회전 보간은 매 프레임 `updatePlane()`에서 수행한다.
 */
const KEYBOARD_PLANE_Z_LIMIT = 120;
/** Air mesh nose along +local X: rotation.z ≈ pitch, rotation.x ≈ roll (radians scale ~0.45 ≈ 26°). */
const KEYBOARD_PLANE_PITCH_TILT = 0.45;
const KEYBOARD_PLANE_ROLL_TILT = 0.45;

// --- Lab1 skeleton: 전역 (과제 스켈레톤 코드 구성 가이드.md 그대로) ---
const LAB1_TARGET_STEP = 30.0;
const targetPos = new THREE.Vector3();
// keydown 당시 자세(회전 보간의 시작점)
const startQuat = new THREE.Quaternion();
// 과제 예시의 "중간 자세": updatePlane()의 1단계 slerp에서 저장/참조됨
// (주의) keydown에서는 임시 피치 쿼터니언 버퍼로도 재사용한다. updatePlane에서 곧 덮어쓴다.
const midQuat = new THREE.Quaternion();
/** 과제 가이드: 수평(레벨) 쪽 끝 orientation — 리셋 시 identity만 두고, 매 프레임 multiply 등으로 mutate 하지 않음. */
const endQuat = new THREE.Quaternion();
// keydown 방향에 따른 목표 기울기(회전 보간의 첫 번째 목표점)
const targetQuat = new THREE.Quaternion();
// 과제 예시의 2단계 복귀 진행률(0~1): updatePlane에서 조금씩 증가
let slerpT = 0;

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

/** Lava Bloom (global postprocess). Tune if too strong. */
const LAVA_BLOOM = {
  // Only the hottest lava highlights should bloom.
  strength: 0.55,
  radius: 0.25,
  threshold: 0.78,
};

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
  renderer.autoClear = false;

  container = document.getElementById('world');
  container.appendChild(renderer.domElement);

  composer = new EffectComposer(renderer);
  composer.setSize(WIDTH, HEIGHT);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(
    new UnrealBloomPass(new THREE.Vector2(WIDTH, HEIGHT), LAVA_BLOOM.strength, LAVA_BLOOM.radius, LAVA_BLOOM.threshold),
  );
  composer.addPass(new OutputPass());

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
  if (composer) composer.setSize(WIDTH, HEIGHT);
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
  getPlaneWorldPosition(_planeWorldPositionScratch);
  camera.position.set(0, _planeWorldPositionScratch.y, 235);
  camera.rotation.set(0, 0, 0);
  camera.updateProjectionMatrix();
}

function enterFirstPerson() {
  orbitControls.enabled = false;
  camera.removeFromParent();
  // skeleton이 mesh.local Y/Z를 쓰므로 FP 카메라는 mesh 자식으로 두어 기체와 같이 이동
  airplane.mesh.add(camera);
  camera.position.copy(FIRST_PERSON_CAMERA_LOCAL.position);
  camera.rotation.copy(FIRST_PERSON_CAMERA_LOCAL.rotation);
  camera.updateProjectionMatrix();
  viewMode = 'first';
}

function enterOrbitFromCurrent() {
  detachCameraPreserveWorld();
  getPlaneWorldPosition(_planeWorldPositionScratch);
  orbitControls.target.copy(_planeWorldPositionScratch);
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

/** Lab1 I/O/P 전: orbit 끄고, legacy 1인칭이면 카메라를 mesh에서 떼 월드로 둔다. */
function detachCameraForLabIOP() {
  orbitControls.enabled = false;
  if (viewMode === 'first') {
    detachCameraPreserveWorld();
    viewMode = 'third';
  }
}

/** I/O/P 공통: 매 프레임 목표 월드 pose를 정한 뒤 카메라를 lerp/slerp(쿼터니언으로 자연스럽게 이어짐). */
function updateLab1CameraIOP() {
  if (lab1CamActivePreset === null || !camera || !airplane?.mesh || game.status !== 'playing') return;

  camera.fov = normalize(mousePos.x, -1, 1, 40, 80);
  getPlaneWorldPosition(_planeWorldPositionScratch);
  const p = _planeWorldPositionScratch;

  if (lab1CamActivePreset === 'third') {
    lab1CamTargetPos.set(0, p.y, 235);
    lab1CamTargetQuat.identity();
  } else if (lab1CamActivePreset === 'follow') {
    airplane.mesh.getWorldQuaternion(_qMeshWorld);
    _camFollowForward.set(1, 0, 0).applyQuaternion(_qMeshWorld).normalize();
    lab1CamTargetPos.copy(p);
    lab1CamTargetPos.addScaledVector(_WORLD_UP, FOLLOW_CAM_UP_OFFSET);
    lab1CamTargetPos.addScaledVector(_camFollowForward, -FOLLOW_CAM_BACK_OFFSET);
    _camFollowLookAt.copy(lab1CamTargetPos).addScaledVector(_camFollowForward, FOLLOW_CAM_LOOK_AHEAD);
    _lab1CamLookMtx.lookAt(lab1CamTargetPos, _camFollowLookAt, _WORLD_UP);
    lab1CamTargetQuat.setFromRotationMatrix(_lab1CamLookMtx);
  } else if (lab1CamActivePreset === 'cockpit') {
    lab1CamTargetPos.copy(FIRST_PERSON_CAMERA_LOCAL.position);
    airplane.mesh.localToWorld(lab1CamTargetPos);
    airplane.mesh.getWorldQuaternion(_qMeshWorld);
    _qFpLocal.setFromEuler(FIRST_PERSON_CAMERA_LOCAL.rotation);
    lab1CamTargetQuat.copy(_qMeshWorld).multiply(_qFpLocal);
  } else if (lab1CamActivePreset === 'top') {
    lab1CamTargetPos.set(p.x, p.y + 420, p.z);
    _lab1CamLookMtx.lookAt(lab1CamTargetPos, p, _WORLD_UP);
    lab1CamTargetQuat.setFromRotationMatrix(_lab1CamLookMtx);
  }

  // O·K: 위치/시선을 매 프레임 목표에 맞춤(WASD 지연 없음). I·P만 부드럽게 블렌드.
  if (lab1CamActivePreset === 'follow' || lab1CamActivePreset === 'cockpit') {
    camera.position.copy(lab1CamTargetPos);
    camera.quaternion.copy(lab1CamTargetQuat);
  } else {
    const k = Math.min(1, (5 * deltaTime) / 1000);
    camera.position.lerp(lab1CamTargetPos, k);
    camera.quaternion.slerp(lab1CamTargetQuat, k);
  }
  camera.updateProjectionMatrix();
}

function handleKeyDown(event) {
  if (event.code === 'Space') {
    event.preventDefault();
    if (lab1CamActivePreset !== null) {
      lab1CamActivePreset = null;
      orbitControls.enabled = false;
      applyThirdPersonCamera();
      viewMode = 'third';
      return;
    }
    if (!legacyViewSwitchingEnabled) return;
    cycleViewMode();
    return;
  }
  if (event.code === 'KeyI' || event.code === 'KeyO' || event.code === 'KeyP' || event.code === 'KeyK') {
    if (game.status !== 'playing') return;
    event.preventDefault();
    detachCameraForLabIOP();
    if (event.code === 'KeyI') lab1CamActivePreset = 'third';
    else if (event.code === 'KeyO') lab1CamActivePreset = 'cockpit';
    else if (event.code === 'KeyP') lab1CamActivePreset = 'top';
    else lab1CamActivePreset = 'follow';
    viewMode = 'third';
    return;
  }
  if (event.code === 'KeyW' || event.code === 'KeyS' || event.code === 'KeyA' || event.code === 'KeyD') {
    event.preventDefault();
    lab1OnPlaneKeyDown(event.code);
  }
}

function handleKeyUp(event) {
  if (event.code === 'KeyW' || event.code === 'KeyS' || event.code === 'KeyA' || event.code === 'KeyD') {
    event.preventDefault();
  }
}

/**
 * Lab1: keydown이 만든 `targetPos`를 "허용 이동 범위"로 제한한다.
 * - 대상: 목표점(targetPos)
 * - mesh 자체 clamp는 updatePlane()의 (D) Clamp에서 별도로 수행한다. (대상: airplane.mesh.position)
 */
function lab1ClampTargetPosToPlayBounds() {
  const yMin = game.planeDefaultHeight - game.planeAmpHeight;
  const yMax = game.planeDefaultHeight + game.planeAmpHeight;
  targetPos.y = THREE.MathUtils.clamp(targetPos.y, yMin, yMax);
  targetPos.z = THREE.MathUtils.clamp(targetPos.z, -KEYBOARD_PLANE_Z_LIMIT, KEYBOARD_PLANE_Z_LIMIT);
}

/**
 * Lab1: keydown에서 "한 번의 입력"에 대한 목표값을 세팅한다.
 *
 * 세팅하는 값:
 * - targetPos  : 이번 입력의 목표 위치
 * - startQuat           : 입력 순간의 현재 자세(회전 보간 시작)
 * - targetQuat          : 입력 방향에 따른 목표 기울기(피치/롤)
 */
function lab1OnPlaneKeyDown(code) {
  if (!airplane?.mesh || game.status !== 'playing') return;

  // (1) Rotation setup: keydown 순간의 자세를 "회전 보간 시작점"으로 고정
  startQuat.copy(airplane.mesh.quaternion);
  // 과제 예시: 2단계 복귀 진행률은 keydown마다 0으로 리셋
  slerpT = 0;

  // (2) Translation setup: WASD → (dy, dz) 한 스텝 목표점 생성 후, 플레이 범위로 clamp
  const p = airplane.mesh.position;
  const step = LAB1_TARGET_STEP;
  let dy = 0;
  let dz = 0;
  if (code === 'KeyW') dy += step;
  if (code === 'KeyS') dy -= step;
  if (code === 'KeyD') dz += step;
  if (code === 'KeyA') dz -= step;
  targetPos.set(p.x, p.y + dy, p.z + dz);

  // (3) Rotation target: 입력 방향에 맞는 목표 기울기(targetQuat) 설정
  // - 과제 가이드: targetQuat은 setFromAxisAngle로 설정(한 축만이면 직접, 대각은 두 축을 만든 뒤 곱)
  if (dy !== 0 && dz === 0) {
    targetQuat.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.sign(dy) * KEYBOARD_PLANE_PITCH_TILT);
  } else if (dz !== 0 && dy === 0) {
    targetQuat.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.sign(dz) * KEYBOARD_PLANE_ROLL_TILT);
  } else if (dy !== 0 && dz !== 0) {
    midQuat.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.sign(dy) * KEYBOARD_PLANE_PITCH_TILT); // pitch
    targetQuat.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.sign(dz) * KEYBOARD_PLANE_ROLL_TILT); // roll
    targetQuat.premultiply(midQuat); // targetQuat = pitch * roll
  } else {
    targetQuat.identity();
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
  getPlaneWorldPosition(_planeWorldPositionScratch);
  for (let i = 0; i < this.ennemiesInUse.length; i++) {
    const ennemy = this.ennemiesInUse[i];
    ennemy.angle += game.speed * deltaTime * game.ennemiesSpeed;

    if (ennemy.angle > Math.PI * 2) ennemy.angle -= Math.PI * 2;

    ennemy.mesh.position.y = -game.seaRadius + Math.sin(ennemy.angle) * ennemy.distance;
    ennemy.mesh.position.x = Math.cos(ennemy.angle) * ennemy.distance;
    ennemy.mesh.rotation.z += Math.random() * 0.1;
    ennemy.mesh.rotation.y += Math.random() * 0.1;

    _planeCollisionDiffScratch.subVectors(_planeWorldPositionScratch, ennemy.mesh.position);
    const d = _planeCollisionDiffScratch.length();
    if (d < game.ennemyDistanceTolerance) {
      particlesHolder.spawnParticles(ennemy.mesh.position.clone(), 15, Colors.red, 3);

      ennemiesPool.unshift(this.ennemiesInUse.splice(i, 1)[0]);
      this.mesh.remove(ennemy.mesh);
      game.planeCollisionSpeedX = (100 * _planeCollisionDiffScratch.x) / d;
      game.planeCollisionSpeedY = (100 * _planeCollisionDiffScratch.y) / d;
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
  getPlaneWorldPosition(_planeWorldPositionScratch);
  for (let i = 0; i < this.coinsInUse.length; i++) {
    const coin = this.coinsInUse[i];
    if (coin.exploding) continue;
    coin.angle += game.speed * deltaTime * game.coinsSpeed;
    if (coin.angle > Math.PI * 2) coin.angle -= Math.PI * 2;
    coin.mesh.position.y = -game.seaRadius + Math.sin(coin.angle) * coin.distance;
    coin.mesh.position.x = Math.cos(coin.angle) * coin.distance;
    coin.mesh.rotation.z += Math.random() * 0.1;
    coin.mesh.rotation.y += Math.random() * 0.1;

    _planeCollisionDiffScratch.subVectors(_planeWorldPositionScratch, coin.mesh.position);
    const d = _planeCollisionDiffScratch.length();
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

/** Lab1 step1: `airplane.mesh` 월드 좌표 — skeleton에서 mesh Y/Z 보간 시 rig와 달라져도 거리 판정 정합 */
const _planeWorldPositionScratch = new THREE.Vector3();
const _planeCollisionDiffScratch = new THREE.Vector3();

function getPlaneWorldPosition(out) {
  if (!airplane?.mesh) return out.set(0, 0, 0);
  return airplane.mesh.getWorldPosition(out);
}
let sky;
let coinsHolder;
let ennemiesHolder;
let particlesHolder;

/** 리플레이 시 Lab1 비행 상태 초기화 (init에서는 airplane 미생성) */
function lab1ResetPlaneState() {
  if (!airplane?.mesh || !airplaneRig) return;
  airplaneRig.position.set(0, 0, 0);
  airplane.mesh.position.set(0, 100, 0);
  targetPos.copy(airplane.mesh.position);
  startQuat.identity();
  endQuat.identity();
  targetQuat.identity();
  airplane.mesh.quaternion.identity();
  airplane.mesh.rotation.set(0, 0, 0);
  lab1CamActivePreset = null;
}

function createPlane() {
  airplaneRig = new THREE.Object3D();
  airplaneRig.name = 'airPlaneRig';
  airplane = new AirPlane();
  airplane.mesh.scale.set(0.25, 0.25, 0.25);
  // skeleton: airplane.mesh.position.y = 100 에서 시작 — rig 원점, 높이는 mesh.local Y
  airplaneRig.position.set(0, 0, 0);
  airplane.mesh.position.set(0, 100, 0);
  targetPos.set(airplane.mesh.position.x, airplane.mesh.position.y, airplane.mesh.position.z);
  startQuat.identity();
  endQuat.identity();
  targetQuat.identity();
  airplane.mesh.quaternion.identity();
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

/** RAF 간격이 벌어질 때(탭 복귀·드래그 등) 한 프레임에 몰아치지 않게 상한. */
const MAX_DELTA_TIME_MS = 64;

function loop() {
  newTime = new Date().getTime();
  deltaTime = newTime - oldTime;
  oldTime = newTime;
  if (deltaTime <= 0) deltaTime = 16;
  else if (deltaTime > MAX_DELTA_TIME_MS) deltaTime = MAX_DELTA_TIME_MS;

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
    // 원작: `planeSpeed`(목표 근접 등)로 전체 진행 체감도 함께 바뀜. 느려짐 체감은 프레임/CPU 쪽(루프 최적화)과 별개로 볼 것.
    game.speed = game.baseSpeed * game.planeSpeed;
  } else if (game.status == 'gameover') {
    game.speed *= 0.99;
    airplane.mesh.rotation.z += (-Math.PI / 2 - airplane.mesh.rotation.z) * 0.0002 * deltaTime;
    airplane.mesh.rotation.x += 0.0003 * deltaTime;
    game.planeFallSpeed *= 1.05;
    airplane.mesh.position.y -= game.planeFallSpeed * deltaTime;

    getPlaneWorldPosition(_planeWorldPositionScratch);
    if (_planeWorldPositionScratch.y < -200) {
      showReplay();
      game.status = 'waitingReplay';
    }
  } else if (game.status == 'waitingReplay') {
    // waiting
  }

  // --- 프로펠러: 시간 기반 추가 회전 (원작 The Aviator 잔여. 목적 = 시각적 RPM 보조) ---
  // `game.planeSpeed`는 updatePlane의 nearTarget에서 갱신되며, 위의 `game.speed`와 이 줄 둘 다에 반영됨.
  airplane.propeller.rotation.x += game.planeSpeed * deltaTime * 0.005;
  sea.mesh.rotation.z += game.speed * deltaTime * SEA_MESH_ROTATION_SCALE;

  if (sea.mesh.rotation.z > 2 * Math.PI) sea.mesh.rotation.z -= 2 * Math.PI;

  ambientLight.intensity += (0.5 - ambientLight.intensity) * deltaTime * 0.005;

  coinsHolder.rotateCoins();
  ennemiesHolder.rotateEnnemies();

  sky.moveClouds();
  sea.tickWaveTime();

  if (viewMode === 'orbit') {
    getPlaneWorldPosition(_planeWorldPositionScratch);
    orbitControls.target.lerp(_planeWorldPositionScratch, 0.12);
    orbitControls.update();
  }

  renderer.clear();
  composer.render();
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

/** Lab1 skeleton */
function updatePlane() {
  // ---------------- planeSpeed LERP 계산 -------------------
  // 원리 설명:
  //
  // game.planeSpeed란?
  // `game.speed = game.baseSpeed * game.planeSpeed` 에서 쓰이는 값으로,
  // "게임이 얼마나 빨리 진행되는지" (바다/코인/적 회전, 거리/에너지 변화 등)의 배율입니다.
  // 원본(The Aviator)은 mousePos.x를 normalize해서 planeSpeed가 1.0~1.3처럼 연속적으로 변한다.
  // Lab1(keydown WASD)은 매 프레임 입력이 아니라 **keydown 순간에 목표점 `targetPos`를 갱신**하고,
  // 그 다음 프레임들에서는 비행기가 `targetPos` 으로 부드럽게 이동합니다(0.1 보간). 그래서 여기서는
  // `현재 위치 ↔ targetPos` 사이의 남은 거리로 **planeSpeed를 lerp로 계산**해서 즉시 반영합니다.
  // 
  // u란? 
  // u는 posErr를 0~1로 바꾼 "상태 값"입니다.
  // - posErr=0 → u=0 (목표 도착) → planeSpeed=planeMinSpeed
  // - posErr가 커질수록 u→1 (이동 중) → planeSpeed→planeMaxSpeed
  // smoothstep은 "posErr를 0~1로 바꾸는 방법" 중 하나입니다:
  // - posErr <= 0 이면 u=0
  // - posErr >= (LAB1_TARGET_STEP*2) 이면 u=1
  //   ※ 상한을 STEP×1로 잡으면, 키 한 번(목표가 약 STEP만큼 바뀜) 직후 posErr가 곧바로 u=1에 닿아 planeSpeed가 max로 튀기 쉽다.
  //     상한을 STEP에 맞춘 **2배**로 두면 “대략 두 칸 분량 이상 멀 때”를 완전 이동 중으로 보는 척도가 되어, 한 칸 입력과 체감이 덜 날카롭다(값은 튜닝).
  // - 그 사이는 직선(posErr / maxErr) 대신 S자 곡선으로 바꿔서,
  //   u가 0에서 시작할 때/1에 도착할 때 갑자기 꺾이지 않게(급변 감소) 만듭니다.

  // 알고리즘 설명
  // 1) "목표(targetPos)까지 얼마나 남았나"를 숫자(posErr)로 만든다.
  // 2) 그 숫자를 0~1 범위(u)로 바꾼다. (0=도착, 1=이동 중)
  // 3) u로 planeSpeed를 min~max 사이에서 LERP한다.
  // 결과: 목표에 가까울수록 planeSpeed↓(min), 멀수록 planeSpeed↑(max) → game.speed(전체 진행/회전)도 같은 방향으로 변함.
  const dy = Math.abs(airplane.mesh.position.y - targetPos.y); // Y 방향: 목표까지 남은 거리
  const dz = Math.abs(airplane.mesh.position.z - targetPos.z); // Z 방향: 목표까지 남은 거리
  const posErr = Math.max(dy, dz); // 대표 오차(둘 중 하나라도 멀면 아직 이동 중이므로 큰 값 채택)
  const u = THREE.MathUtils.smoothstep(posErr, 0, LAB1_TARGET_STEP * 2); // posErr→u; 구간 [0, STEP×2] 설명은 위 주석
  game.planeSpeed = THREE.MathUtils.lerp(game.planeMinSpeed, game.planeMaxSpeed, u);  // 최종: u로 min~max 사이를 선형보간(lerp)해 planeSpeed를 결정


  if (viewMode !== 'orbit') { 
    // ------------- 키보드 조종: translation + quaternion rotation ------------------
    // - translation: `targetPos`로 mesh.local Y/Z를 매 프레임 보간 이동
    // - quaternion rotation: 과제 핵심인 SLERP(구면 선형 보간)로 orientation을 갱신 — 아래 (B) 참고
    // orbit 모드에서는 OrbitControls(관전) 위주로 두기 위해, 이 조종 블록은 실행하지 않음
    
    // --- (A) Translation: targetPos를 향해 부드럽게 이동 ---
    // 1차 지수 보간(지수 평활): 남은 거리의 일정 비율(여기서는 10%)만 매 프레임 따라가면, 오버슈트 없이 지수적으로 수렴합니다.
    // 비고: skeleton code 유지
    var targetY = targetPos.y; // WASD 입력으로 정해 둔 목표 Y (mesh.local)
    var targetZ = targetPos.z; // WASD 입력으로 정해 둔 목표 Z (mesh.local)

    // Move the plane at each frame by adding a fraction of the remaining distance
    // 남은 거리의 10%만큼만 이동 → 1차 지수 보간(지수 평활)으로 목표에 수렴
    // 비고: skeleton code 유지
    airplane.mesh.position.y += (targetY - airplane.mesh.position.y) * 0.1;
    airplane.mesh.position.z += (targetZ - airplane.mesh.position.z) * 0.1;
    // --- (B) Rotation: SLERP로 orientation 보간 (과제 핵심) ------------------
    // 목표:
    // - keydown 순간의 자세(startQuat)에서, 입력 방향에 맞는 목표 자세(targetQuat)로 부드럽게 기울인다.
    // - 목표 위치에 가까워질수록, 목표 자세(targetQuat)에서 수평 자세(endQuat)로 부드럽게 복귀한다.
    //
    // 사용 quaternion:
    // - startQuat  : keydown 순간의 airplane.mesh.quaternion
    // - targetQuat : keydown 방향에 따라 setFromAxisAngle(...)로 만든 기울어진 자세
    // - midQuat    : startQuat -> targetQuat 보간 중간에 저장되는 자세
    // - endQuat    : 최종적으로 돌아갈 수평 자세(identity quaternion)
    //
    // SLERP 설명:
    // - Quaternion.slerpQuaternions(q0, q1, t)는 q0에서 q1까지의 orientation을 t만큼 보간한다.
    // - 여기서 t는 반드시 0~1 범위로 해석된다.
    //   t = 0이면 q0, t = 1이면 q1, 그 사이는 두 자세 사이의 부드러운 중간 자세이다.
    //
    // 전체 이동 진행률 (과제 가이드 그대로):
    // - t = 1 - max(tY, tZ) / 30.0
    // - 여기서 30.0은 keydown에서 만드는 목표 스텝(LAB1_TARGET_STEP)
    const tY = Math.abs(airplane.mesh.position.y - targetY);
    const tZ = Math.abs(airplane.mesh.position.z - targetZ);
    const t = 1 - Math.max(tY, tZ) / LAB1_TARGET_STEP;

    if (t <= 0.5) {
      // update airplane.mesh.quaternion by using slerpQuaternions with t (or any step you want)
      // 과제 요구사항: midQuat = airplane.mesh.quaternion
      // update airplane.mesh.quaternion by using slerpQuaternions with t (or any step you want)
      // and then set midQuat to airplane.mesh.quaternion, i.e, midQuat.copy(airplane.mesh.quaternion);
      const localSlerpT = t / 0.5; // t: 0~0.5 → slerpT: 0~1
      airplane.mesh.quaternion.slerpQuaternions(startQuat, targetQuat, localSlerpT);
      midQuat.copy(airplane.mesh.quaternion);
      slerpT = 0;
    } else if (slerpT <= 1.0) {
      // 2단계: 목표 기울기(targetQuat)에서 수평 자세(endQuat)로 복귀 (가이드 예시의 slerpT 사용)
      // update airplane.mesh.quaternion by using slerpQuaternions with slerpT (or any step you want)
      // increase slerpT by small value
      airplane.mesh.quaternion.slerpQuaternions(targetQuat, endQuat, slerpT);
      slerpT += 0.05;
      slerpT = Math.min(1, slerpT);
    }

    // 수치 오차 누적 방지.
    // quaternion은 단위 quaternion이어야 올바른 회전을 표현하므로 normalize 해 둔다.
    airplane.mesh.quaternion.normalize();

    // --- (C) Propeller: '항상 돌아가는' 기본 회전(프레임당 고정 증가) ---
    // 원리: 매 프레임 일정 각도를 더해 시각적으로 기본 RPM을 만들고,
    // loop의 `planeSpeed * deltaTime` 보조 항과 합쳐 최종 회전 속도(=RPM 느낌)가 됩니다.
    // 비고: 과제 예시 `+= 0.2` 유지.
    airplane.propeller.rotation.x += 0.2;

    // --- (D) Clamp: mesh Y/Z를 허용 범위로 자름 ---
    // 여기서 하는 일: `airplane.mesh.position`의 Y·Z만 위·아래·좌·우 한계로 clamp.
    // `lab1ClampTargetPosToPlayBounds`에서 하는 일: 목표점 `targetPos`의 Y·Z만 같은 한계로 clamp(updatePlane 맨 앞·keydown).
    // 둘은 대상이 다름(메시 위치 vs 목표점). 보간·충돌 등으로 mesh만 박스 밖으로 나갈 수 있어서, 여기서 mesh를 다시 자른다.
    const yMin = game.planeDefaultHeight - game.planeAmpHeight;
    const yMax = game.planeDefaultHeight + game.planeAmpHeight;
    airplane.mesh.position.y = THREE.MathUtils.clamp(airplane.mesh.position.y, yMin, yMax);
    airplane.mesh.position.z = THREE.MathUtils.clamp(
      airplane.mesh.position.z,
      -KEYBOARD_PLANE_Z_LIMIT,
      KEYBOARD_PLANE_Z_LIMIT,
    );
  }

  // --- 충돌 시 밀려난 만큼을 속도/변위에 누적(원작 The Aviator 로직) ---
  game.planeCollisionDisplacementX += game.planeCollisionSpeedX;
  game.planeCollisionDisplacementY += game.planeCollisionSpeedY;

  const colTargetX = game.planeCollisionDisplacementX; // rig가 따라가야 할 X 목표
  const colTargetY = airplane.mesh.position.y + game.planeCollisionDisplacementY; // mesh Y + 충돌 Y 오프셋

  // rig는 전체 기체 위치(X), mesh Y는 충돌 반동까지 합쳐서 부드럽게 보간
  airplaneRig.position.x += (colTargetX - airplaneRig.position.x) * deltaTime * game.planeMoveSensivity;
  airplane.mesh.position.y += (colTargetY - airplane.mesh.position.y) * deltaTime * game.planeMoveSensivity;

  // 충돌 속도·변위를 0 쪽으로 감쇠 → 정지 시 원래 비행 라인으로 복귀
  game.planeCollisionSpeedX += (0 - game.planeCollisionSpeedX) * deltaTime * 0.03;
  game.planeCollisionDisplacementX += (0 - game.planeCollisionDisplacementX) * deltaTime * 0.01;
  game.planeCollisionSpeedY += (0 - game.planeCollisionSpeedY) * deltaTime * 0.03;
  game.planeCollisionDisplacementY += (0 - game.planeCollisionDisplacementY) * deltaTime * 0.01;

  if (lab1CamActivePreset !== null) {
    updateLab1CameraIOP();
  } else if (viewMode === 'third') {
    // 마우스 X에 따라 시야각(FOV) 변경
    camera.fov = normalize(mousePos.x, -1, 1, 40, 80);
    camera.updateProjectionMatrix();
    getPlaneWorldPosition(_planeWorldPositionScratch); // 비행기 월드 Y(충돌 보정 반영)
    camera.position.y +=
      (_planeWorldPositionScratch.y - camera.position.y) * deltaTime * game.cameraSensivity; // 카메라 높이가 기체를 부드럽게 추적
  }

  airplane.pilot.updateHairs(); // 속도에 맞춰 파일럿 머리카락 흔들림
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

  const legacyBtn = document.getElementById('legacyViewToggleBtn');
  if (legacyBtn) {
    legacyBtn.addEventListener('click', () => {
      legacyViewSwitchingEnabled = !legacyViewSwitchingEnabled;
      if (legacyViewSwitchingEnabled && lab1CamActivePreset !== null) {
        lab1CamActivePreset = null;
        orbitControls.enabled = false;
        applyThirdPersonCamera();
        viewMode = 'third';
      }
      legacyBtn.textContent = legacyViewSwitchingEnabled
        ? 'Legacy view switching: ON'
        : 'Legacy view switching: OFF';
      legacyBtn.setAttribute('aria-pressed', legacyViewSwitchingEnabled ? 'true' : 'false');
    });
  }

  loop();
}

export { init };

window.addEventListener('load', init, false);