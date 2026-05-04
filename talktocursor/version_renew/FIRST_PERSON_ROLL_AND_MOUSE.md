# 1인칭에서 위·아래 마우스와 좌우 뒤틀림(롤) 현상

## 질문에 대한 답

**위·아래로만 마우스를 움직여도 기체가 좌우로 뒤틀리는 것처럼 보이는 것은, 1인칭 카메라 버그라기보다 원래 비행 조종 로직의 결과에 가깝습니다.**

1인칭에서는 카메라가 `airplaneRig`에만 붙어 있고 `airplane.mesh`의 회전을 따르지 않지만, **메시 자체는 그대로 `rotation.x` / `rotation.z`가 갱신**되므로, 화면 안에서 날개·동체가 기울어 보입니다.

---

## 코드상 이유

`updatePlane()`에서 **목표 높이 `targetY`와 실제 높이 `airplaneRig.position.y`의 차이**로, **두 축 회전을 동시에** 설정합니다.

```javascript
airplane.mesh.rotation.z = (targetY - airplaneRig.position.y) * deltaTime * game.planeRotXSensivity;
airplane.mesh.rotation.x =
  (airplaneRig.position.y - targetY) * deltaTime * game.planeRotZSensivity;
```

- **`rotation.z`**: 좌우로 비행기가 기울어 보이는(롤에 가까운) 성분  
- **`rotation.x`**: 앞뒤로 도는(피치에 가까운) 성분  

둘 다 **같은 높이 오차**에 비례합니다. 그래서 “위·아래만 조종”하는 것처럼 보여도, **높이 오차 하나로 z와 x가 같이 변합니다.**  
3인칭일 때도 동일한 식이었고, 1인칭에서는 카메라가 기체 기울기를 따라가지 않아 **기체 기울기가 더 잘 보일 뿐**입니다.

이는 Codrops 원본 튜토리얼 계열의 **아케이드식 뱅크 연출**에 해당합니다.

---

## 조정하고 싶을 때

위·아래 입력일 때 **좌우 뒤틀림을 줄이거나 없애고** 싶다면 예를 들어:

- **1인칭(`viewMode === 'first'`)일 때만** `rotation.z`를 0으로 고정하거나 감도를 낮추기  
- 또는 1인칭에서만 `planeRotXSensivity`에 별도 계수 적용  

등으로 **같은 함수 안에서 모드별 분기**를 두면 됩니다. (3인칭·Orbit 동작을 유지하려면 분기 조건을 명확히 할 것.)

---

## 관련 문서

- 시점 모드·`airplaneRig` 구조: `VIEW_MODE_FIRST_PERSON_PLAN.md`, `SPACE_ORBIT_TOGGLE_FEATURE.md`
