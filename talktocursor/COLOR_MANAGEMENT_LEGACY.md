# 색 공간·ColorManagement (레거시 룩 정렬)

> **상태:** 본 문서는 **현재 채택한 설정과 그 이유**를 기록한 것입니다.  
> **`ColorManagement.enabled = false`가 장기적으로 “올바른” 선택인지는 별도 검토가 필요합니다.** (아래 [추후 검토](#추후-검토-체크리스트) 참고)

---

## 1. 무엇을 하고 있는가

| 항목 | 내용 |
|------|------|
| **설정** | `ColorManagement.enabled = false` |
| **호출 시점** | `createScene()` **맨 앞**, **`new THREE.WebGLRenderer(...)` 이전** |
| **적용 파일** | `src/game.js`, `src/part1.js`, `src/part2.js` |
| **유지하는 것** | `renderer.outputColorSpace = THREE.SRGBColorSpace` (캔버스/브라우저 출력은 sRGB로 두는 현재 관행 유지) |

`import { ColorManagement } from 'three'` 후 `ColorManagement.enabled = false` 한 줄이 각 진입점에 동일하게 들어 있습니다.

---

## 2. 왜 필요해졌는가 (포팅 전·후)

- **구버전 (약 r75, `js/three.min.js`)**  
  - 현재 색 관리 API와는 다른, 사실상 **헥스 색을 “그대로” 셰이딩에 가깝게 쓰는** 체감이 있었습니다.  
  - 튜토리얼·Codrops 룩(밝은 바다 `0x68c3c0` 등)은 그 전제에 맞춰 눈으로 맞춰진 경우가 많습니다.

- **최신 Three.js (npm, 예: 0.183.x)**  
  - 기본값 **`ColorManagement.enabled === true`**  
  - 재질 `color` 등에 넣은 **헥스는 sRGB로 해석된 뒤**, 내부 **선형(working) 공간**으로 변환되어 조명·셰이딩에 사용됩니다.  
  - 같은 숫자라도 **구버전 대비 더 어둡거나 덜 밝게** 보일 수 있으며, 사용자 피드백으로 **바다가 짙다**는 인상이 났습니다.

- **이번에 한 선택**  
  - **레거시와의 시각적 근접**을 우선하기 위해 `ColorManagement`를 끄고, 구 튜토리얼에 가까운 밝기·채도를 복원하는 쪽을 택했습니다.

---

## 3. 이 방법의 의미 (기술적으로 짧게)

- `ColorManagement.enabled === false`이면, Three가 **재질 색·일부 경로에서 자동 sRGB ↔ 선형 변환을 하지 않는** 레거시에 가까운 동작으로 돌아갑니다.  
- **물리적으로 일관된 선형 작업 공간**을 쓰는 최신 권장안과는 다를 수 있습니다.  
- **“맞다/틀리다”보다는 “어떤 룩을 목표로 하느냐”**의 트레이드오프에 가깝습니다.

---

## 4. 장점과 한계

| 장점 | 한계 |
|------|------|
| 기존 헥스 팔레트(`Colors` 등)를 크게 바꾸지 않고도 r75에 가까운 인상 | 텍처·GLTF 등 **다른 자산**과 섞을 때 색 일관성 검증이 필요 |
| 조명 숫자만으로는 안 잡히던 “전체가 한 단계 어둡다” 완화 | **물리 기반 워크플로**·다른 Three 예제와 색 해석이 달라짐 |
| 구현이 단순하고 되돌리기 쉬움 | 팀/과제에서 **색 관리 정책**을 명시해야 할 수 있음 |

---

## 5. 추후 검토 체크리스트

아래를 검토할 때 **`ColorManagement.enabled = true`로 되돌린 뒤** 시각을 다시 맞추는 방안과 비교하는 것이 좋습니다.

1. **`ColorManagement.enabled = true` 복귀**  
   - Three.js 권장 파이프라인에 맞추는지 여부.

2. **팔레트 재튜닝**  
   - `Colors.blue` 등 **헥스를 밝게** 조정하거나,  
   - `Sea` 등 **개별 메시**만 `emissive`·`color` 보정.

3. **조명**  
   - `HemisphereLight` / `AmbientLight` / `DirectionalLight`의 **intensity**와 색을 “선형 + 색 관리 켠 상태” 기준으로 다시 맞추기.

4. **텍처**  
   - 나중에 이미지를 쓸 경우 `colorSpace` 설정과의 정합성.

5. **문서·팀 규칙**  
   - “이 프로젝트는 레거시 색 정렬을 위해 ColorManagement off” 같은 **한 줄 정책**을 README 또는 본 문서에 유지할지 결정.

---

## 6. 참고 (Three.js)

- [Color management](https://threejs.org/docs/#manual/en/introduction/Color-management) — 공식 매뉴얼  
- `WebGLRenderer.outputColorSpace` — 최종 프레임버퍼/디스플레이 쪽과의 관계

---

## 7. 관련 파일

| 파일 | 역할 |
|------|------|
| `src/game.js` | 메인 게임 `createScene()`에서 `ColorManagement` 설정 |
| `src/part1.js` / `src/part2.js` | 튜토리얼 파트 동일 정책 |
| `talktocursor/VITE_THREE_UPGRADE.md` | 전체 포팅 요약·본 문서로 링크 |

---

## 8. 변경 이력 (요약)

- Vite + 최신 Three 포팅 이후, 바다 등이 **구버전보다 짙게** 보인다는 피드백에 대응해 `ColorManagement.enabled = false`를 도입함.  
- **이 문서는 그 결정을 “임시 합의·추후 재검토 가능”으로 남기기 위해 작성됨.**
