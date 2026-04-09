# 바다 메시: 실시간 파도·회전 동작

`src/game.js`에서 바다는 크게 **두 가지 움직임**이 겹칩니다.

1. **메시 전체 회전** — 여전히 CPU에서 `sea.mesh.rotation.z`만 갱신.
2. **정점 파도 + 용암 룩** — **`ShaderMaterial`** (`src/sea-lava-shader.js`, three.js `webgl_shader_lava` 기반). 정점마다 `wavePhase` / `waveAmp` / `waveSpeed`와 **`uWaveTime`**으로 파도 변위, fragment에서 용암 텍스처·애니메이션. 상세·검은 화면 이슈는 **`talktocursor/SEA_LAVA_SHADER.md`** 참고.

---

## 1. 전체 메시 회전 (원통이 “빙글” 도는 느낌)

- **코드** (`loop()` 안, 매 프레임):

  ```text
  sea.mesh.rotation.z += game.speed * deltaTime * SEA_MESH_ROTATION_SCALE;
  ```

- **의미**: 바다 메시(`CylinderGeometry`를 눕힌 형태)를 **월드 Z축 기준**으로 회전시킵니다.  
  각도는 `rotation.z`에 **누적**되고, `2π`를 넘으면 한 바퀴 줄입니다.

- **`game.speed`**: 플레이 중에는 대략  
  `game.speed = game.baseSpeed * game.planeSpeed`  
  이며, `baseSpeed`는 `initSpeed`·레벨·시간에 따라 `targetBaseSpeed` 쪽으로 서서히 따라갑니다.  
  즉 **게임 진행 속도**와 같은 스칼라를 쓰기 때문에, 예전에는 바다·하늘·거리 등이 **한꺼번에** 빨라집니다.

### 바다만 천천히 돌리고 싶을 때 (권장)

| 조정 대상 | 위치 | 설명 |
|-----------|------|------|
| **`SEA_MESH_ROTATION_SCALE`** | `src/game.js` 상단 상수 | **`game.speed`에 곱해 바다 회전만 줄임.** `1`이면 회전량이 예전과 동일 비율, `0.25`면 그 1/4 속도로만 도는 느낌. 거리·코인·에너지 등 **다른 시스템은 그대로**. |

- 하늘(`sky.mesh.rotation.z`)은 여전히 `game.speed`만 쓰므로, **바다만** 느리게 보려면 이 상수가 맞는 레버입니다.

### 게임 전체를 느리게 하면 바다도 느려질 때

| 조정 대상 | 위치 (`resetGame()` / `game` 객체) | 부작용 |
|-----------|-------------------------------------|--------|
| `initSpeed`, `targetBaseSpeed`, `incrementSpeedByTime`, `incrementSpeedByLevel` | 기본 속도·가속 곡선 | **거리 증가, 코인/적 이동, 하늘 회전, 에너지 소모** 등 `game.speed`를 쓰는 모든 요소가 함께 느려짐 |

---

## 2. 정점별 파도 (개요)

물리 해역 시뮬이 아니라, **정점마다 독립적인 위상과 sin/cos 변위**로 “물결 같은” 움직임을 냅니다.  
**구현**은 §4(GPU) 참고. 수식 자체는 §3과 동일합니다.

### 파도만 느리게/빠르게 보고 싶을 때

| 조정 대상 | 위치 | 설명 |
|-----------|------|------|
| **`wavesMinSpeed`**, **`wavesMaxSpeed`** | `resetGame()` 안 `game` | 정점 위상 `ang`이 도는 속도. **메시 전체 회전과는 무관**합니다. |
| **`wavesMinAmp`**, **`wavesMaxAmp`** | 같음 | 파도 **크기**(튀는 정도)만 변경 |

---

## 3. 수학 (CPU 시절과 동일, 현재 GPU에서도 동일)

각 정점의 **기준 위치** `position`(레스트 포즈)과, 정점마다 다른 **`phase`**, **`amp`**, **`speed`**가 있을 때:

- CPU에서는 매 프레임 `ang += speed * deltaTime` (`deltaTime`은 ms)이었고,
- 위치는 `x = rest.x + cos(ang) * amp`, `y = rest.y + sin(ang) * amp`, `z = rest.z`.

`speed`가 일정하면 `ang = phase + speed * T`이고, `T`는 **누적 시간(ms)**. 그래서 GPU에서는 `uWaveTime`에 `T`를 넣고 `wAng = wavePhase + waveSpeed * uWaveTime`으로 같은 식을 씁니다.

### 3.1 전체 메시 회전과의 관계

- **§1**의 `sea.mesh.rotation.z`는 **메시 오브젝트 전체** 회전입니다.
- 정점 변위는 **로컬 공간에서** 셰이더로 적용됩니다. 두 동작은 **합쳐져** 최종 화면에 보입니다.

---

## 4. GPU 구현 (현재 코드)

- **Geometry**: `position`은 **변경하지 않고** 레스트 포즈로 둡니다. 대신 `wavePhase`, `waveAmp`, `waveSpeed` **Float32BufferAttribute** (각 itemSize 1)를 한 번만 세팅합니다.
- **Material**: **`ShaderMaterial`** (`createSeaLavaShaderMaterial`) — vertex에서 §3과 동일 파도 변위, fragment는 용암 예제 셰이더. (이전 `MeshPhongMaterial` + `onBeforeCompile` 대체.)
- **Uniform**: `uWaveTime`(파도), `time`(용암 흐름) — `sea.tickWaveTime()`에서 갱신.
- **리플레이**: `resetGame()`에서 `sea.lavaUniforms`의 `uWaveTime` / `time` 초기화.

### 4.1 CPU `for` 루프와 비교

| 항목 | 과거 CPU | 현재 GPU |
|------|----------|----------|
| 정점 수가 커질 때 | 메인 스레드에서 루프 비용 ↑ | 버텍스 병렬 처리로 확장에 유리 |
| 매 프레임 | `setXYZ` × N + `needsUpdate` | uniform 1개 +α |
| 법선 | 노멀을 매번 재계산하지 않는 한 근사(스타일 유지) | 동일 |

### 4.2 주의

- `MeshPhongMaterial` + 커스텀 버텍스 변형은 **그림자/깊이 패스**가 다른 셰이더를 쓸 수 있어, **그림자가 찢어진 것처럼 보이면** depth용 `onBeforeCompile`을 맞추거나, 별도 `customDepthMaterial` 검토가 필요할 수 있습니다. (이 바다는 **그림자를 받기만** 하고, 비행기 그림자는 대략적인 룩에 맞춰져 있음.)

---

## 5. 요약 표

| 현상 | 주로 건드리는 값 |
|------|------------------|
| 바다 통째로 도는 속도만 (게임 진행은 유지) | **`SEA_MESH_ROTATION_SCALE`** |
| 물결 파동만 느리게 | **`wavesMinSpeed` / `wavesMaxSpeed`** |
| 물결 크기만 | **`wavesMinAmp` / `wavesMaxAmp`** |
| 전체 게임 템포(바다·하늘·거리 등 일괄) | **`initSpeed`**, **`targetBaseSpeed`**, **`incrementSpeedByTime`**, **`incrementSpeedByLevel`** 등 |

---

## 6. 관련 코드 위치

| 내용 | 파일·대략 위치 |
|------|----------------|
| `SEA_MESH_ROTATION_SCALE`, `SEA_MERGE_VERTICES_TOLERANCE` | `src/game.js` 상단 상수 |
| `sea.mesh.rotation.z += …` | `src/game.js` `loop()` |
| `Sea` 생성자 — `wavePhase` / `waveAmp` / `waveSpeed` attribute, `onBeforeCompile` | `src/game.js` — `Sea` 함수 본문 |
| `sea.tickWaveTime()` — `uWaveTime`에 `deltaTime` 추가 | `src/game.js` `loop()` |
| `Sea.prototype.tickWaveTime` | `src/game.js` |
| `game.speed` 갱신 | `src/game.js` `loop()` (`playing` 분기) |
| 파도·용암 시간 리셋 | `resetGame()` — `sea.lavaUniforms` |
| 용암 셰이더 소스 | `src/sea-lava-shader.js` |

---

## 7. 향후 (GERSTNER·노멀 등)

파도는 이미 **버텍스 셰이더에서** 변위됩니다. 더 물리스러운 룩이나 정확한 조명을 원하면 **법선을 변위에 맞게** 계산하거나, **GERSTNER 파도** 등으로 바꾸는 것이 일반적입니다. CPU `for` 루프는 정점 수가 커지면 비용이 커지므로, **고해상도 바다**에서는 지금과 같은 GPU 방식이 적합합니다.
