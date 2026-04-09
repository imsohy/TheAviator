# 시점 모드 확장 계획 (3인칭 · 1인칭 · Orbit)

Space 키로 시점을 전환하는 기능에 **1인칭(비행기 자식 카메라)** 을 추가하기 위한 설계 문서입니다.  
**현재 저장소에는 아직 구현하지 않은 계획**만 정리합니다.

---

## 목표

| 모드 | 카메라 | 조작 |
|------|--------|------|
| **3인칭** | 월드 공간, 비행기 자식 아님 | 기존과 동일: 마우스 비행 + 카메라 FOV/높이 추적 |
| **1인칭** | `airplane.mesh`(또는 그 아래 `cameraRig`)의 **자식** | 로컬 `position` / `rotation` 으로 조종석 시점 |
| **Orbit** | 월드 공간, `OrbitControls` | 기존과 동일: 마우스로 궤도 시점 |

---

## Space 키 동작 (제안)

한 키로 순환하는 방식이 단순합니다.

`3인칭 → 1인칭 → Orbit → 3인칭`

필요 시 순서만 조정하면 됩니다.

---

## 구현 시 작업 항목

### 1. 상태 표현

- `viewMode` (또는 동등한 이름): `'third' | 'first' | 'orbit'`  
- 기존 `orbitModeEnabled` 는 `viewMode === 'orbit'` 으로 통합하거나, Orbit 전용 플래그와 병행해 전환 시 일관되게 맞출 것.

### 2. 모드 전환 함수

- **→ 1인칭**  
  - Orbit 끄기: `orbitControls.enabled = false`  
  - 카메라를 `airplane.mesh.add(camera)` (또는 `cameraRig.add(camera)`)  
  - 조종석에 맞게 **로컬** `position` / `rotation` 설정  

- **→ 3인칭**  
  - `airplane.mesh.remove(camera)`  
  - 월드 좌표계에서 이전과 비슷한 3인칭 위치·FOV로 복원 (초기 `createScene` 기준 또는 저장해 둔 값)  

- **→ Orbit**  
  - 카메라를 비행기에서 **반드시 분리**  
  - `orbitControls.enabled = true`, `target` 을 비행기 위치에 맞춤 (현재 구현과 동일한 패턴)  

### 3. `updatePlane()` / 게임 루프

- **3인칭**일 때만: 기존 `camera.fov`, `camera.position.y` 추적 로직 실행  
- **1인칭**일 때: 위 카메라 추적 **비활성화** (자식이므로 기체와 함께 이동)  
- **Orbit**일 때: 기존처럼 `orbitControls.update()` 및 `target` 추적  

### 4. 입력

- **1인칭**에서도 비행기 마우스 조종을 유지할지 정책 결정 (보통 유지).  
- `handleMouseMove` 등: Orbit 모드에서만 입력 무시하는 현재 패턴을 1인칭에 맞게 확장.

### 5. 튜닝용 리그 (선택)

- `cameraRig` 빈 `Object3D`를 비행기에 달고 카메라는 그 자식으로 두면, 조종석 위치만 `cameraRig` 로 옮기기 쉬움.

### 6. 주의

- 부모 전환 시 **한 프레임에** 월드/로컬 행렬·`OrbitControls.target` 순서를 맞추지 않으면 화면이 튈 수 있음.  
- 1인칭은 기체 **전체 회전**에 카메라가 함께 돌아가므로, 이후 “요만 고정”이 필요하면 별도 리그(요 축만 추종)를 2단계로 설계할 수 있음.

---

## 문서·코드 연동 (구현 후)

- `talktocursor/SPACE_ORBIT_TOGGLE_FEATURE.md` 를 **다중 시점(3·1·Orbit)** 설명으로 갱신하거나, 본 문서와 링크로 연결.

---

## 요약

- **3인칭**: 지금과 같은 추적 카메라.  
- **1인칭**: 카메라를 비행기에 **자식으로 부착**해 조종석 시점.  
- **Orbit**: 기존 자유 시점.  
- **Space** 로 위 세 가지를 **순환**하는 구현이 구조상 단순합니다.
