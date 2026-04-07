   # The Aviator — Vite + Three.js 업그레이드 문서

   ## 업데이트가 완료되었나요?

   **예.** 이 저장소는 **Three.js r75(번들 `js/three.min.js`)에서 벗어나**, **npm의 Three.js 최신 계열(예: 0.183.x)** 과 **Vite** 기반으로 동작하도록 옮겨진 상태입니다. 개발 서버·프로덕션 빌드가 가능하도록 구성되어 있습니다.

   ---

   ## 무엇을 수행했는지

   ### 도구·의존성

   - **Vite**로 개발 서버와 프로덕션 번들(`dist/`) 생성
   - **`three`** 패키지로 최신 Three.js 사용 (ES module `import`)
   - **GSAP**으로 기존 **TweenMax** 파티클 애니메이션 대체

   ### 코드·구조

   | 항목 | 설명 |
   |------|------|
   | `src/main.js` | 메인 게임 진입 (`game.js`의 `init` 호출) |
   | `src/game.js` | 본페이지 게임 로직 (최신 Three API로 마이그레이션) |
   | `src/part1.js` / `src/part2.js` | 튜토리얼 Part 1·2 (기존 `main_step1.js` / `main_step2.js` 대체) |
   | `src/geometry-helpers.js` | 구 API의 박스 꼭짓점 변형 등 BufferGeometry용 헬퍼 |
   | `vite.config.js` | `index.html`, `part1.html`, `part2.html` 멀티 페이지 빌드 |
   | `public/css/` | 스타일시트 (기존 `css/` 복사본, `/css/...` 로 제공) |
   | `public/fonts/` | Codrops 아이콘 폰트 (`/fonts/...`, `demo.css`의 `@font-face`와 연동) |

   ### Three.js 관련 마이그레이션 요지

   - `shading: THREE.FlatShading` → `flatShading: true`
   - `applyMatrix` → `applyMatrix4` (BufferGeometry)
   - `CubeGeometry` → `BoxGeometry`
   - 레거시 `Geometry.vertices` / `verticesNeedUpdate` → **`position` attribute** 갱신 (`setXYZ`, `needsUpdate`)
   - 지오메트리 병합·변형에 **`mergeVertices`** 등 (`three/addons/utils/BufferGeometryUtils.js`)
   - 렌더러 **`outputColorSpace = THREE.SRGBColorSpace`**
   - 파티클: **TweenMax → `gsap`**

   ### 포팅 전후 색감 차이 분석

   - **핵심 원인(유력):** 색 공간/컬러 매니지먼트 차이.  
     포팅 후는 최신 Three 파이프라인(`renderer.outputColorSpace = THREE.SRGBColorSpace`)을 사용하고, r75 시절 렌더링과 감마 처리 방식이 달라 동일한 hex 색도 체감 톤이 달라질 수 있음.
   - **보조 원인:** `Geometry` → `BufferGeometry` 마이그레이션 과정에서 노멀/면 처리 차이로 flat shading의 명암 분포가 약간 달라질 수 있음.
   - **확인 방법:** `renderer.outputColorSpace`와 `THREE.ColorManagement.enabled`를 토글 비교하면 색 공간 영향 여부를 빠르게 분리 가능.
   - **권장 방향:** 최신 파이프라인을 유지한 채 조명 강도/재질 색상/안개 색을 미세 조정해 레거시 톤에 맞추는 방식.

   ### HTML

   - `<script type="module" src="/src/...">` 로 스크립트 로드
   - 구형 IE 조건부 주석·로컬 `three.min.js` / `TweenMax` 스크립트 제거

   ### 더 이상 쓰이지 않는 파일 (레거시)

   아래는 **실행 경로에서 제외**된 참고용·구버전 파일입니다. 필요 시 백업 후 삭제해도 Vite 빌드에는 영향 없습니다.

   - `js/three.min.js`
   - `js/game.js`
   - `js/main_step1.js`, `js/main_step2.js`
   - (루트) `css/` — 실제 서빙은 `public/css/` 기준

   ---

   ## 이후에 할 수 있는 조치

   ### 필수에 가까운 것

   1. **로컬에서 실행 확인**  
      - `npm install`  
      - `npm run dev` → 브라우저에서 게임·Part1·Part2 동작·콘솔 에러 확인

   2. **배포**  
      - `npm run build` 후 `dist/`를 정적 호스팅에 넣기  
      - 또는 `npm run preview`로 빌드 결과만 미리보기

   ### 선택

   3. **레거시 정리**  
      - 위 `js/`·루트 `css/` 중복을 정리하거나 Git에서 제거해 혼동 방지

   4. **favicon**  
      - `public/favicon.ico`를 두면 `index.html` 등의 링크가 404를 내지 않음

   5. **버전 고정**  
      - `package.json`에서 `three`를 `0.183.x`처럼 원하는 범위로 핀

   6. **TypeScript**  
      - `@types/three` 도입 시 `src/`를 점진적으로 `.ts`로 옮기기

   7. **성능·품질**  
      - 그림자·안개·재질 튜닝, 모바일 터치 테스트, 접근성(대비·키보드) 등

   ### 폰트 경고 (`Failed to decode font` / `OTS parsing error: invalid sfntVersion`)

   - **의미:** 브라우저가 **실제 바이너리 폰트가 아닌 응답**(대개 **HTML** 또는 빈 본문)을 폰트로 읽으려 할 때 자주 납니다. `invalid sfntVersion`에 보이는 숫자는 파일 맨 앞 바이트를 숫자로 해석한 값입니다.
   - **원인(이 프로젝트):** 처음 Vite용으로 `public/css/`만 복사했을 때 **`public/fonts/`가 없어** `/fonts/codropsicons/*.woff` 등이 404였고, 또 **`demo.css`의 `../fonts/...`는 빌드 후 CSS가 `dist/assets/`에 있으면 `/assets/fonts/...`로 잘못 해석될 수 있음**.
   - **조치:** `fonts/`를 **`public/fonts/`에 포함**하고, `@font-face`의 `url`은 **`/fonts/codropsicons/...`처럼 사이트 루트 기준 절대 경로**로 통일함. (`npm run build` 후 `dist/fonts/`에 복사되는지 확인.)

   ---

   ## 빠른 명령어 참고

   ```bash
   npm install      # 의존성 설치
   npm run dev      # 개발 서버 (보통 http://localhost:5173/)
   npm run build    # dist/ 생성
   npm run preview  # 빌드 결과 미리보기
   ```

   ---

   ## 요약

   - **업그레이드 작업은 완료된 상태**로 두었고, 실행·배포는 위 명령으로 이어가면 됩니다.  
   - 문제가 생기면 **브라우저 개발자 도구 콘솔**과 **`npm run build` 로그**를 먼저 확인하는 것이 좋습니다.
