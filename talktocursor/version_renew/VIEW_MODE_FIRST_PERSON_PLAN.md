# 시점 모드 (3인칭 · 1인칭 · Orbit)

원래는 **계획만** 적어 두었으나, 아래 내용은 **현재 코드(`src/game.js`)에 구현된 동작**과 맞춰 두었습니다.

---

## 목표 (구현됨)

| 모드 | 카메라 | 조작 |
|------|--------|------|
| **3인칭** | 월드 공간, 비행기 자식 아님 | 마우스 비행 + 카메라 FOV·Y 추적 |
| **1인칭** | `airplaneRig`의 자식 (메시와 **형제**) | 리그의 **translation만** 따름. 기체 `airplane.mesh`의 회전은 카메라에 전달되지 않음 |
| **Orbit** | 월드 공간, `OrbitControls` | 마우스 궤도 시점, `target` ≈ `airplaneRig.position` |

---

## Space 순환

`3인칭 → 1인칭 → Orbit → 3인칭`

---

## 비행기 계층 구조 (핵심)

```
airplaneRig (Object3D, name: airPlaneRig)  ← world position.x / .y 만 갱신
├── airplane.mesh (Object3D, name: airPlane)  ← scale, rotation.x/z (기울기)
│   └── (기체 메시·파일럿 등 기존 구조)
└── camera  ← 1인칭일 때만 자식으로 붙음 (로컬 위치·회전은 FIRST_PERSON_CAMERA_LOCAL)
```

- 예전에는 `scene.add(airplane.mesh)` 이었으나, 현재는 **`scene.add(airplaneRig)`** 이고 `airplane.mesh.position`은 로컬 `(0,0,0)`입니다.
- 충돌·거리 계산 등 **기체 월드 위치**는 `airplaneRig.position`을 사용합니다.

---

## 코드 앵커

- 상태: `viewMode`
- 순환: `cycleViewMode()` ← `handleKeyDown` / `Space`
- 1인칭 진입: `enterFirstPerson()`
- Orbit 진입: `enterOrbitFromCurrent()` (카메라 월드 변환 유지)
- 3인칭 복귀: `enterThirdPersonFromOrbit()` → `applyThirdPersonCamera()`
- 조종석 튜닝: 파일 상단 `FIRST_PERSON_CAMERA_LOCAL`

---

## 문서 연동

- 사용법·요약: `SPACE_ORBIT_TOGGLE_FEATURE.md`
- 씬 트리 다이어그램: `SCENE_TREE_DIAGRAM.md`
- 1인칭에서 위·아래 마우스와 좌우 뒤틀림(롤) 체감: `FIRST_PERSON_ROLL_AND_MOUSE.md`
