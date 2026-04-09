# 키보드 비행 및 기체 기울기 (WASD)

## 월드 이동

| 키 | 월드 축 | 방향 |
|----|---------|------|
| W / S | Y | +Y / −Y |
| D / A | Z | +Z / −Z |

속도·클램프는 `src/game.js`의 `KEYBOARD_PLANE_SPEED`, `KEYBOARD_PLANE_Z_LIMIT`, `planeDefaultHeight ± planeAmpHeight`를 참고합니다.

## 기체 메시 로컬 축과 회전 (pitch / roll)

`AirPlane` 메시는 **코가 로컬 +X** 쪽을 향하도록 모델링되어 있습니다(프로펠러·엔진이 +X).

Three.js 기본 오일러 적용 시 이 자세에서는:

- **`mesh.rotation.z`** — 로컬 Z축 회전 → **피치**(코가 위·아래로 기울어 “사선”으로 보임)
- **`mesh.rotation.x`** — 로컬 X축 회전 → **롤**(날개가 좌·우로 뱅크)

초기 마우스 조작 버전(`js/game.js`)도 수직 조종에 `rotation.z` / `rotation.x`를 함께 쓰며, 여기서와 같이 **Z가 수직 기동에 더 직접적인 시각**을 줍니다.

### WASD와 회전 매핑 (수정 후)

| 입력 | 의미 | 회전 |
|------|------|------|
| W / S | 상·하 이동 | `rotation.z` ← `+inputY` — 로컬 Z 오른손 규칙으로 양의 회전이 코(+X)를 +Y 쪽으로 기울임(상승 시 코가 위) |
| D / A | Z 평면 좌·우 | `rotation.x` ← `inputZ` (롤) |

이전에 피치에 `−inputY`를 쓰면 상승(W)일 때 코가 아래로 기울어 보였다(부호 반대).

상수: `KEYBOARD_PLANE_PITCH_TILT`, `KEYBOARD_PLANE_ROLL_TILT` (라디안 스케일, 기본 약 0.45).

## 기타

- **Orbit** 모드: WASD로 위치·이 위 기울기 갱신 없음.
- **게임 오버 낙하**: `game.status === 'gameover'`일 때만 별도의 `rotation` 보간이 적용됨.
- **마우스**: 비행기 위치가 아니라 3인칭 FOV 등에 사용.
