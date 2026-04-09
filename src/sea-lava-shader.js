import * as THREE from 'three';

/**
 * three.js examples/webgl_shader_lava.html 기반.
 * 바다 스케일에서는 fragment의 depth 기반 fog가 거의 전부 fogColor(기본 검정)로 믹스되어
 * 화면이 검게 보이는 경우가 많아 fogDensity 기본값을 0으로 둠.
 */
const LAVA_VERTEX_SHADER = /* glsl */ `
uniform vec2 uvScale;
uniform float uWaveTime;
attribute float wavePhase;
attribute float waveAmp;
attribute float waveSpeed;
varying vec2 vUv;

void main() {
  vUv = uvScale * uv;
  vec3 waveRest = vec3( position );
  float wAng = wavePhase + waveSpeed * uWaveTime;
  vec3 transformed = vec3(
    waveRest.x + cos( wAng ) * waveAmp,
    waveRest.y + sin( wAng ) * waveAmp,
    waveRest.z
  );
  vec4 mvPosition = modelViewMatrix * vec4( transformed, 1.0 );
  gl_Position = projectionMatrix * mvPosition;
}
`;

const LAVA_FRAGMENT_SHADER = /* glsl */ `
uniform float time;
uniform float fogDensity;
uniform vec3 fogColor;
uniform sampler2D texture1;
uniform sampler2D texture2;
varying vec2 vUv;

void main() {
  vec2 position = -1.0 + 2.0 * vUv;
  vec4 noise = texture2D( texture1, vUv );
  vec2 T1 = vUv + vec2( 1.5, -1.5 ) * time * 0.02;
  vec2 T2 = vUv + vec2( -0.5, 2.0 ) * time * 0.01;
  T1.x += noise.x * 2.0;
  T1.y += noise.y * 2.0;
  T2.x -= noise.y * 0.2;
  T2.y += noise.z * 0.2;
  float p = texture2D( texture1, T1 * 2.0 ).a;
  vec4 color = texture2D( texture2, T2 * 2.0 );
  vec4 temp = color * ( vec4( p, p, p, p ) * 2.0 ) + ( color * color - 0.1 );
  if ( temp.r > 1.0 ) { temp.bg += clamp( temp.r - 2.0, 0.0, 100.0 ); }
  if ( temp.g > 1.0 ) { temp.rb += temp.g - 1.0; }
  if ( temp.b > 1.0 ) { temp.rg += temp.b - 1.0; }
  gl_FragColor = temp;
  float depth = gl_FragCoord.z / gl_FragCoord.w;
  const float LOG2 = 1.442695;
  float fogFactor = exp2( - fogDensity * fogDensity * depth * depth * LOG2 );
  fogFactor = 1.0 - clamp( fogFactor, 0.0, 1.0 );
  gl_FragColor = mix( gl_FragColor, vec4( fogColor, gl_FragColor.w ), fogFactor );
}
`;

/**
 * @returns {{ material: THREE.ShaderMaterial, uniforms: Object }}
 */
export function createSeaLavaShaderMaterial() {
  const loader = new THREE.TextureLoader();
  const cloudTexture = loader.load('/textures/lava/cloud.png');
  const lavaTexture = loader.load('/textures/lava/lavatile.jpg');

  lavaTexture.colorSpace = THREE.SRGBColorSpace;
  cloudTexture.wrapS = cloudTexture.wrapT = THREE.RepeatWrapping;
  lavaTexture.wrapS = lavaTexture.wrapT = THREE.RepeatWrapping;

  const uniforms = {
    fogDensity: { value: 0.0 },
    fogColor: { value: new THREE.Vector3(0, 0, 0) },
    time: { value: 1.0 },
    uvScale: { value: new THREE.Vector2(3.0, 1.0) },
    texture1: { value: cloudTexture },
    texture2: { value: lavaTexture },
    uWaveTime: { value: 0 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: LAVA_VERTEX_SHADER,
    fragmentShader: LAVA_FRAGMENT_SHADER,
  });

  return { material, uniforms };
}
