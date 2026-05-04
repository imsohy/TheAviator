# 메인 게임 Scene 트리 (`src/game.js`)

Three.js에서 **`scene.add(...)`로 붙는 객체**와, **씬에 들어가지 않지만 렌더링에 쓰이는 객체**(카메라, 렌더러, OrbitControls)를 구분해 정리했습니다.

---

## 1. 씬 그래프 (Scene 자식)

`createScene` → `createLights` → `createPlane` / `createSea` / `createSky` / `createCoins` / `createEnnemies` / `createParticles` 순으로 구성됩니다.

```mermaid
flowchart TB
  subgraph Scene["THREE.Scene (scene)"]
    direction TB
    AX[AxesHelper 길이 300]
    HL[HemisphereLight]
    DL[DirectionalLight shadowLight]
    AL[AmbientLight]
    subgraph Rig["airplaneRig Object3D name airPlaneRig translation only"]
      subgraph Air["airplane.mesh Object3D name airPlane rotation scale"]
      CAB[cabin Mesh]
      ENG[engine Mesh]
      TAIL[tailPlane Mesh]
      WING[sideWing Mesh]
      WIND[windshield Mesh]
      subgraph PROP["propeller Mesh"]
        B1[blade1 Mesh]
        B2[blade2 Mesh]
      end
      WPR[wheelProtecR Mesh]
      WTR[wheelTireR + wheelAxis]
      WPL[wheelProtecL Mesh]
      WTL[wheelTireL Mesh]
      WTB[wheelTireB Mesh]
      SUS[suspension Mesh]
      subgraph Pilot["pilot.mesh Object3D name pilot"]
        BODY[body Mesh]
        FACE[face Mesh]
        subgraph HAIR["hairs Object3D"]
          HT[hairsTop 12x hair Mesh]
          HSR[hairSideR Mesh]
          HSL[hairSideL Mesh]
          HB[hairBack Mesh]
        end
        GR[glassR Mesh]
        GL[glassL Mesh]
        GA[glassA Mesh]
        EL[earL Mesh]
        ER[earR Mesh]
      end
      end
      FP["PerspectiveCamera 1인칭 시 Rig 자식"]
    end
    SEA[sea.mesh Mesh name waves]
    subgraph SKY["sky.mesh Object3D"]
      C1["Cloud.mesh × 20"]
      C1 --> CB["각 cloud: cube Mesh × 3~5"]
    end
    COI[coinsHolder.mesh Object3D]
    ENI[ennemiesHolder.mesh Object3D]
    PTI[particlesHolder.mesh Object3D]
  end
```

동적 추가:

- **coinsHolder.mesh** 아래: 스폰 시 `coin.mesh` (TetrahedronGeometry)
- **ennemiesHolder.mesh** 아래: 스폰 시 `ennemy.mesh` (TetrahedronGeometry)
- **particlesHolder.mesh** 아래: 이펙트 시 `particle.mesh` (TetrahedronGeometry)

**바다 메시 (`Sea`)**: `CylinderGeometry`에 `rotateX(-π/2)`를 적용한 뒤 `mergeVertices(geom, SEA_MERGE_VERTICES_TOLERANCE)`를 호출합니다. 현재 `SEA_MERGE_VERTICES_TOLERANCE`는 **작은 값(기본 `1e-4`)**으로 유지합니다. 이유는 용암 셰이더처럼 **UV seam이 중요한 재질에서** 과도한 병합이 seam을 붕괴시켜 **부채꼴/핀치(깊은 줄무늬)**를 만들 수 있기 때문입니다. 대신 파도 파라미터(`wavePhase/amp/speed`)를 **position 기반으로 결정적으로 생성**해 seam에서도 변위가 연속이 되도록 했습니다.

---

## 2. 씬 밖 · 렌더 파이프라인

카메라는 **`scene`의 자식이 아닙니다.** `renderer.render(scene, camera)`로 씬과 함께 사용됩니다.

```mermaid
flowchart LR
  subgraph DOM["HTML"]
    DIV["#world div"]
  end
  CAM["PerspectiveCamera near 0.1 far 10000"]
  REN["WebGLRenderer"]
  ORB["OrbitControls camera + domElement"]
  DIV --> REN
  REN --> ORB
  Scene["THREE.Scene"] --> REN
  CAM --> REN
```

- **OrbitControls**: `viewMode === 'orbit'`일 때 `enabled`, `target`이 `airplaneRig.position`을 부드럽게 추적합니다.
- **카메라**: 3인칭·Orbit일 때는 씬에 붙지 않은 월드 카메라. 1인칭일 때만 `airplaneRig`의 자식(메시와 형제).
- **안개**: 현재 `scene.fog = null` (비활성). 자세한 내용은 `FOG_DISABLED.md` 참고.

---

## 3. 다이어그램 파일

| 파일 | 용도 |
|------|------|
| 이 문서 (`SCENE_TREE_DIAGRAM.md`) | Mermaid 다이어그램 (GitHub, VS Code 등에서 미리보기) |
| `scene-tree.dot` | Graphviz (`dot -Tpng scene-tree.dot -o scene-tree.png`) |
| `COLOR_MANAGEMENT_LEGACY.md` | 렌더 색 공간·`ColorManagement` 정책 (룩 정렬 vs 추후 검토) |
| `SEA_WAVES_AND_ROTATION.md` | 바다 회전(`SEA_MESH_ROTATION_SCALE`)·`moveWaves` 정점 파도 |

