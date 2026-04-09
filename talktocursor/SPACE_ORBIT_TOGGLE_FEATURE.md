# Spacebar 시점 모드 (3인칭 · 1인칭 · Orbit)

본 문서는 메인 게임(`src/game.js`)의 **`Space` 키로 시점을 순환**하는 기능을 정리합니다. (구버전 명칭: Orbit만 토글하던 문서를 이 내용으로 대체했습니다.)

---

## 목적

- **3인칭**: 기존과 같이 뒤에서 따라보는 카메라 (FOV·높이 추적).
- **1인칭**: 조종석에 가까운 시점. 비행기 **회전(roll/pitch)은 카메라에 반영하지 않고**, **이동(translation)만** 따름.
- **Orbit**: `OrbitControls`로 마우스 자유 시점.

---

## Space 순환 순서

`3인칭 → 1인칭 → Orbit → 3인칭` (한 번 누를 때마다 다음 모드)

---

## 구현 요약

| 항목 | 내용 |
|------|------|
| 적용 파일 | `src/game.js` |
| 상태 | `viewMode`: `'third'` \| `'first'` \| `'orbit'` |
| Orbit API | `OrbitControls` (`three/addons/controls/OrbitControls.js`) |
| 비행기 계층 | `airplaneRig` (위치만) → 자식 `airplane.mesh`(스케일·자세 회전) |

### 1인칭에서 회전이 카메라에 안 오는 이유

- **위치**는 `airplaneRig`에만 적용 (`airplaneRig.position.x/y`).
- **기체 기울기**는 자식 `airplane.mesh.rotation`에만 적용.
- **1인칭 카메라**는 `airplaneRig.add(camera)`로 **메시와 형제**이므로, 메시 회전의 영향을 받지 않고 리그의 이동만 따름.

조종석 위치·시선은 `FIRST_PERSON_CAMERA_LOCAL` (`position` / `rotation`)으로 조절합니다.

---

## 입력·카메라 처리

- **Orbit**일 때만: 마우스로 비행기 조종 좌표 갱신 안 함 (`handleMouseMove` / `touchmove` 조기 반환).
- **3인칭**일 때만: `camera.fov`, `camera.position.y` 추적.
- **1인칭**·**Orbit**: 위 3인칭 추적 로직 미적용.
- **Orbit** 루프: `orbitControls.target`이 `airplaneRig.position`을 부드럽게 추종.

### 모드 전환 시 카메라

- **3인칭 ↔ 1인칭**: 카메라를 리그에 붙였다 뗌. 월드 변환 보존이 필요할 때는 `matrixWorld.decompose` 후 부모 제거.
- **→ Orbit**: 카메라를 부모에서 분리한 뒤 월드 좌표 유지 후 Orbit 활성화.
- **Orbit → 3인칭**: Orbit 끄고 `applyThirdPersonCamera()`로 `(0, rigY, 200)` 등 3인칭 기본값에 맞춤.

---

## 사용 방법

- 게임 중 **`Space`**: 다음 시점 모드로 전환 (위 순환 순서).
- **Orbit**에서 마우스 드래그: 궤도 시점.

---

## 범위

- **메인 게임(`src/game.js`)만** 적용. `part1.js`, `part2.js`는 동일 기능 없음.

---

## 관련 문서

- 설계·계획: `VIEW_MODE_FIRST_PERSON_PLAN.md` (구현 반영 후 갱신됨)
- 씬 계층: `SCENE_TREE_DIAGRAM.md`
- 1인칭·마우스·기체 뒤틀림 설명: `FIRST_PERSON_ROLL_AND_MOUSE.md`
