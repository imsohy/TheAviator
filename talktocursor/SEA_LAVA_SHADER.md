# 바다 용암 셰이더 (`webgl_shader_lava`)

## 출처

- [three.js example: webgl_shader_lava](https://threejs.org/examples/webgl_shader_lava.html)
- 구현: `src/sea-lava-shader.js` + `src/game.js`의 `Sea` 생성자

## 구성

| 항목 | 내용 |
|------|------|
| 재질 | `ShaderMaterial` — 예제의 fragment + **파도용 vertex** (기존 GPU 파도와 동일 수식) |
| 텍스처 | `public/textures/lava/cloud.png`, `lavatile.jpg` — 로드 경로 `/textures/lava/...` |
| `lavatile.jpg` | `colorSpace = SRGBColorSpace` (Three 권장) |
| `time` uniform | 용암 흐름 애니메이션 — `Sea.tickWaveTime()`에서 예제와 비슷하게 증가 |
| `uWaveTime` | 정점 파도 위상(ms 누적) |

## 검게만 보이는 현상 — 원인과 대응

1. **절차적 안개(fragment 끝)**  
   예제는 `fogDensity`(기본 0.45)와 `fogColor`(검정)로 `gl_FragCoord` 기반 깊이에 안개를 섞습니다.  
   **바다 메시는 카메라에서 매우 멀리 있어** `depth`가 커지고, `fogFactor`가 거의 1이 되어 **출력이 거의 전부 검정 안개색**이 됩니다.  
   **대응:** 기본값 **`fogDensity = 0`**으로 안개를 끄거나, 켤 경우 `fogDensity`를 극소로 하고 `fogColor`를 배경색에 맞춥니다.

2. **텍스처 미로드**  
   경로 오류·404면 샘플이 검게 나옵니다. Vite에서는 **`public/textures/lava/`**에 두고 URL은 **`/textures/lava/...`** 로 요청합니다.

3. **그림자**  
   `ShaderMaterial`은 기본 메시처럼 그림자 맵을 받지 않습니다. 바다는 **`receiveShadow = false`** 로 두었습니다.

4. **예제의 Bloom**  
   원본은 `EffectComposer` + `BloomPass`로 발광을 강조합니다. **메인 게임 렌더러에는 아직 넣지 않았**으므로, 예제보다 덜 “빛나는” 것처럼 보일 수 있습니다. 필요 시 후처리 파이프라인을 별도로 검토합니다.

## 파도(버텍스)와의 결합

- 예제 토러스 vertex는 `uvScale * uv` + `modelViewMatrix * position` 만 사용.
- 여기서는 동일 fragment에 맞추고, vertex만 **기존 파도**(`wavePhase` / `waveAmp` / `waveSpeed` / `uWaveTime`)로 `position`을 변형한 뒤 동일하게 투영합니다.
