## Lab1 회전(Ours) 방식의 한계: `targetQuat`을 “명시적으로 찍지” 않을 수 있음

### 맥락
- 과제 skeleton 예시는 `updatePlane()`에서 진행률 `t`/`slerpT`로 회전 단계를 나눠,
  1) `startQuat → targetQuat`로 기울기
  2) `targetQuat → endQuat`로 수평 복귀
  를 수행합니다. 이 구조에서는 (이상적 조건에서) **`targetQuat`을 한 번 도달(=찍고) 복귀**하는 흐름이 자연스럽습니다.

### Ours 방식(assignment1)의 회전 개요
- Ours는 매 프레임 남은 이동량(`spanYZ`)에서 블렌드 값을 만들고,
  그 값으로 “이번 프레임의 이상적인 목표 자세”를 만든 뒤,
  실제 `airplane.mesh.quaternion`이 그 목표를 `dtStep`만큼 **추종(follow)**하도록 구성되어 있습니다.

핵심 구조(요약):

```js
blendFromMotion = smoothstep(spanYZ, 0, STEP * 0.66);
midQuat = SLERP(startQuat, targetQuat, blendFromMotion);
orientBlendScratch = SLERP(endQuat, midQuat, blendFromMotion);
meshQuat = SLERP(meshQuat, orientBlendScratch, dtStep); // dtStep ∝ deltaTime
```

### 한계(관찰 가능한 현상)
- skeleton처럼 “**`targetQuat`에 도달한 뒤(end로 복귀)**”가 아니라,
  **목표 자체(`orientBlendScratch`)가 프레임마다 변하는** 구조입니다.
- 이동이 많이 남았을 때는 `blendFromMotion ≈ 1`이라 `orientBlendScratch ≈ targetQuat`이 되지만,
  실제 자세는 `dtStep`만큼만 따라가므로 **즉시 `targetQuat`에 도달하지 않습니다**(지수적으로 접근).
- 목표에 가까워지면 `spanYZ`가 줄어 `blendFromMotion`이 내려가고,
  그 순간부터 `orientBlendScratch`가 `endQuat`(수평) 쪽으로 이동합니다.
  따라서 **`targetQuat`을 “정확히 1번 찍는 순간”이 보장되지 않을 수** 있습니다.

### 왜 이렇게 했나(의도)
- `dtStep`을 `deltaTime` 기반으로 두어 FPS 변화에도 회전 속도 체감이 과도하게 바뀌지 않게 하고,
- `smoothstep` 기반 블렌드로 시작/끝 구간에서 급격한 변화가 덜 보이게 하여
  **체감상 부드러운 모션**을 얻기 위한 튜닝입니다.

### 보고서에 안전한 한 문장(권장)
- “Ours 구현은 남은 이동량으로 목표 자세를 매 프레임 재계산하고(`blendFromMotion`), 현재 자세가 이를 시간 기반 계수(`dtStep`)로 추종하도록 만들어 **부드러움은 증가**하지만, skeleton의 2단계 구조처럼 `targetQuat`을 ‘명시적으로 1회 도달’하는 것은 보장되지 않을 수 있다.”

