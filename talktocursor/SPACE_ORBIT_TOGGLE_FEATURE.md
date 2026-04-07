# Spacebar Orbit Toggle 기능

본 문서는 메인 게임(`src/game.js`)에 추가한 **Spacebar 기반 OrbitControls 토글 기능**을 정리합니다.

---

## 목적

- 플레이 도중 `Space` 키로 자유 카메라 모드(Orbit)를 켜고 끌 수 있게 함.
- Orbit 모드에서 마우스로 시점을 회전하며 장면을 확인할 수 있게 함.

---

## 구현 요약

| 항목 | 내용 |
|------|------|
| 적용 파일 | `src/game.js` |
| 사용 API | `OrbitControls` (`three/addons/controls/OrbitControls.js`) |
| 토글 키 | `Space` (`event.code === 'Space'`) |
| 기본 상태 | 비활성화 (`orbitModeEnabled = false`, `orbitControls.enabled = false`) |

---

## 동작 방식

1. `createScene()`에서 `OrbitControls`를 생성하고 초기값을 설정합니다.
2. `keydown` 이벤트에서 `Space` 입력 시 `toggleOrbitMode()`를 호출합니다.
3. Orbit 모드가 켜지면:
   - `orbitControls.enabled = true`
   - `orbitControls.target`을 비행기 위치로 맞춤
   - 매 프레임 `target.lerp(airplane.mesh.position, 0.12)`로 자연스럽게 추적
4. Orbit 모드가 꺼지면:
   - `orbitControls.enabled = false`
   - 기존 게임 카메라 동작(FOV/높이 보정)으로 복귀

---

## 입력 충돌 방지 처리

- Orbit 모드 중에는 `handleMouseMove`, `handleTouchMove`에서 즉시 `return`하여
  비행기 조작용 마우스 입력과 충돌하지 않게 처리했습니다.
- `updatePlane()` 내부의 카메라 자동 갱신은 `!orbitModeEnabled`일 때만 실행되도록 분기했습니다.

---

## 핵심 코드 포인트

- 컨트롤 import
  - `import { OrbitControls } from 'three/addons/controls/OrbitControls.js';`
- 상태 변수
  - `let orbitControls;`
  - `let orbitModeEnabled = false;`
- 초기화
  - `orbitControls = new OrbitControls(camera, renderer.domElement);`
  - `orbitControls.enableDamping = true;`
- 토글
  - `handleKeyDown()`에서 `Space` 감지 후 `toggleOrbitMode()` 호출
- 루프 연동
  - `if (orbitModeEnabled) { orbitControls.target.lerp(...); orbitControls.update(); }`

---

## 사용 방법

- 게임 실행 후 `Space` 키를 누르면 Orbit 모드 ON
- 다시 `Space` 키를 누르면 Orbit 모드 OFF
- ON 상태에서 마우스 드래그로 자유 시점 회전 가능

---

## 현재 범위

- 본 기능은 **메인 게임(`src/game.js`)에만 적용**되어 있습니다.
- `part1.js`, `part2.js`에는 동일 토글 기능을 추가하지 않았습니다.
