import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  captureSceneSnapshot,
  flyToTarget,
  getCameraOffset,
  shouldReleaseFocus,
} from './galaxy-scene-camera';
import {
  createPointerDownState,
  isTapGesture,
  resolvePickedRecord,
  shouldIgnoreSceneTarget,
  type PointerDownState,
} from './galaxy-scene-interaction';
import {
  disposeMaterial,
  findTeleportTarget,
  flashMeshMaterial,
  showFallback,
} from './galaxy-scene-helpers';
import {
  GALAXY_ACTION_EVENT,
  type GalaxyActionEvent,
} from './galaxy-events';
import { createPanelRenderer } from './galaxy-scene-panel';
import {
  advanceSceneRuntime,
  createSceneRuntime,
  type PlanetRecord,
  type SceneGalaxy,
  type StarRecord,
} from './galaxy-scene-runtime';
import {
  createSceneViewState,
  createVector,
  type FocusLevel,
  type FocusTargetType,
  type SceneMountOptions,
  type SceneViewState,
} from './galaxy-scene-view-state';

export { findTeleportTarget } from './galaxy-scene-helpers';
export type { SceneGalaxy } from './galaxy-scene-runtime';
export type {
  FocusLevel,
  FocusTargetType,
  SceneVector3Tuple,
  SceneMountOptions,
  SceneViewState,
} from './galaxy-scene-view-state';

export interface GalaxySceneHandle {
  dispose: () => void;
}

const NOOP_SCENE_HANDLE: GalaxySceneHandle = {
  dispose() {},
};

function disposeSceneResources(scene: THREE.Scene) {
  const disposedGeometries = new Set<THREE.BufferGeometry>();
  const disposedMaterials = new Set<THREE.Material>();
  const disposedTextures = new Set<THREE.Texture>();

  scene.traverse((object) => {
    if (
      (object instanceof THREE.Mesh ||
        object instanceof THREE.Line ||
        object instanceof THREE.Points) &&
      object.geometry instanceof THREE.BufferGeometry &&
      !disposedGeometries.has(object.geometry)
    ) {
      disposedGeometries.add(object.geometry);
      object.geometry.dispose();
    }

    if (
      object instanceof THREE.Mesh ||
      object instanceof THREE.Line ||
      object instanceof THREE.Points
    ) {
      disposeMaterial(object.material, {
        materials: disposedMaterials,
        textures: disposedTextures,
      });
    }
  });
}

export function initGalaxyScene(
  galaxy: SceneGalaxy,
  options: SceneMountOptions = {},
): GalaxySceneHandle {
  const { initialViewState = null, onViewStateChange } = options;
  const container = document.getElementById('canvas-container');
  const fallback = document.getElementById('webgl-fallback');
  const backButton = document.getElementById('hub-back-btn');
  const closeButton = document.getElementById('info-panel-close');
  const panelRenderer = createPanelRenderer();

  if (!(container instanceof HTMLElement)) {
    return NOOP_SCENE_HANDLE;
  }

  const sceneContainer = container;

  if (!window.WebGLRenderingContext) {
    showFallback(sceneContainer, fallback);
    return NOOP_SCENE_HANDLE;
  }

  let renderer: THREE.WebGLRenderer;

  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
  } catch {
    showFallback(sceneContainer, fallback);
    return NOOP_SCENE_HANDLE;
  }

  fallback?.classList.add('hidden');

  let animationFrame = 0;
  let destroyed = false;
  let currentLevel: FocusLevel = 'GALAXY';
  let currentFocusObject: THREE.Object3D | null = null;
  let currentFocusOffset: THREE.Vector3 | null = null;
  let currentFocusTargetId: string | null = null;
  let currentFocusTargetType: FocusTargetType | null = null;
  let currentParentStarId: string | null = null;
  let isTransitioning = false;
  let activeFlyToTween: ReturnType<typeof flyToTarget> | null = null;
  let pointerDown: PointerDownState = createPointerDownState(
    { clientX: 0, clientY: 0 },
    0,
  );

  const lastFocusPos = new THREE.Vector3();
  const currentFocusPosition = new THREE.Vector3();
  const focusDelta = new THREE.Vector3();
  const flashTimeouts = new Set<number>();
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x00050a, 0.00075);

  const camera = new THREE.PerspectiveCamera(
    55,
    window.innerWidth / window.innerHeight,
    0.1,
    8000,
  );
  camera.position.copy(getCameraOffset('GALAXY'));

  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  sceneContainer.innerHTML = '';
  sceneContainer.appendChild(renderer.domElement);

  const universeGroup = new THREE.Group();
  scene.add(universeGroup);
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));

  const pointLight = new THREE.PointLight(0x66ccff, 1.1, 3200);
  pointLight.position.set(300, 260, 200);
  scene.add(pointLight);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxDistance = 3000;
  controls.minDistance = 40;

  const { interactableObjects, lanePackets, planetRecords, starRecords } =
    createSceneRuntime({
      galaxy,
      initialPlanetAngles: initialViewState?.planetAngles,
      universeGroup,
    });

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function getCurrentViewState(): SceneViewState {
    const snapshotVectors = captureSceneSnapshot({
      camera,
      controls,
      currentFocusObject,
      currentFocusOffset,
      isTransitioning,
    });

    return createSceneViewState({
      level: currentLevel,
      focusTargetId: currentFocusTargetId,
      focusTargetType: currentFocusTargetType,
      parentStarId: currentParentStarId,
      cameraPosition: snapshotVectors.cameraPosition,
      controlsTarget: snapshotVectors.controlsTarget,
      infoPanelOpen: panelRenderer.isOpen(),
      planetAngles: Object.fromEntries(
        Array.from(planetRecords.entries(), ([planetId, record]) => [
          planetId,
          record.angle,
        ]),
      ),
      universeRotationY: universeGroup.rotation.y,
    });
  }

  function notifyViewStateChange() {
    if (destroyed) {
      return;
    }

    onViewStateChange?.(getCurrentViewState());
  }

  function setBackButtonVisible(visible: boolean) {
    if (!backButton) {
      return;
    }

    backButton.classList.toggle('hidden', !visible);
    backButton.classList.toggle('inline-flex', visible);
  }

  function syncFocusPosition() {
    if (!currentFocusObject) {
      lastFocusPos.copy(controls.target);
      return;
    }

    currentFocusObject.getWorldPosition(lastFocusPos);
  }

  function applyGalaxyFocusState() {
    currentLevel = 'GALAXY';
    currentFocusObject = null;
    currentFocusOffset = null;
    currentFocusTargetId = null;
    currentFocusTargetType = null;
    currentParentStarId = null;
  }

  function applyStarFocusState(starRecord: StarRecord) {
    currentLevel = 'STAR';
    currentFocusObject = starRecord.starMesh;
    currentFocusOffset = getCameraOffset('STAR');
    currentFocusTargetId = starRecord.data.id;
    currentFocusTargetType = 'star';
    currentParentStarId = starRecord.data.id;
  }

  function applyPlanetFocusState(planetRecord: PlanetRecord) {
    currentLevel = 'PLANET';
    currentFocusObject = planetRecord.mesh;
    currentFocusOffset = getCameraOffset('PLANET');
    currentFocusTargetId = planetRecord.data.id;
    currentFocusTargetType = 'planet';
    currentParentStarId = planetRecord.parentStarId;
  }

  function restoreViewState(viewState: SceneViewState | null) {
    if (!viewState) {
      applyGalaxyFocusState();
      panelRenderer.closePanel();
      setBackButtonVisible(false);
      syncFocusPosition();
      return;
    }

    universeGroup.rotation.y = viewState.universeRotationY;
    camera.position.copy(createVector(viewState.cameraPosition));
    controls.target.copy(createVector(viewState.controlsTarget));
    currentLevel = viewState.level;
    currentParentStarId = viewState.parentStarId;
    currentFocusTargetId = viewState.focusTargetId;
    currentFocusTargetType = viewState.focusTargetType;
    currentFocusObject = null;
    currentFocusOffset = null;

    if (viewState.focusTargetType === 'planet' && viewState.focusTargetId) {
      const planetRecord = planetRecords.get(viewState.focusTargetId);
      const parentStar = planetRecord
        ? starRecords.get(planetRecord.parentStarId)
        : null;

      if (planetRecord && parentStar) {
        applyPlanetFocusState(planetRecord);
        panelRenderer.renderPlanet(planetRecord.data, parentStar.data, {
          open: viewState.infoPanelOpen,
        });
        setBackButtonVisible(true);
        syncFocusPosition();
        controls.update();
        return;
      }
    }

    if (viewState.focusTargetType === 'star' && viewState.focusTargetId) {
      const starRecord = starRecords.get(viewState.focusTargetId);

      if (starRecord) {
        applyStarFocusState(starRecord);
        panelRenderer.renderStar(starRecord.data, {
          open: viewState.infoPanelOpen,
        });
        setBackButtonVisible(true);
        syncFocusPosition();
        controls.update();
        return;
      }
    }

    applyGalaxyFocusState();
    panelRenderer.closePanel();
    setBackButtonVisible(false);
    syncFocusPosition();
    controls.update();
  }

  function startFlyTo(
    targetObject: THREE.Object3D | null,
    offset: THREE.Vector3,
    duration: number,
  ) {
    activeFlyToTween?.kill();
    activeFlyToTween = null;
    isTransitioning = true;
    activeFlyToTween = flyToTarget({
      camera,
      controls,
      duration,
      offset,
      targetObject,
      onComplete() {
        isTransitioning = false;
        activeFlyToTween = null;
      },
      onTargetPosition(targetPosition) {
        lastFocusPos.copy(targetPosition);
      },
    });
  }

  function focusOnGalaxy() {
    if (currentLevel === 'GALAXY' && !currentFocusObject) {
      return;
    }

    applyGalaxyFocusState();
    panelRenderer.closePanel();
    setBackButtonVisible(false);
    startFlyTo(null, getCameraOffset('GALAXY'), 1.8);
    notifyViewStateChange();
  }

  function focusOnStar(starRecord: StarRecord) {
    applyStarFocusState(starRecord);
    panelRenderer.renderStar(starRecord.data);
    setBackButtonVisible(true);
    startFlyTo(starRecord.starMesh, getCameraOffset('STAR'), 1.8);
    notifyViewStateChange();
  }

  function focusOnPlanet(planetRecord: PlanetRecord) {
    applyPlanetFocusState(planetRecord);
    const parentStar = starRecords.get(planetRecord.parentStarId);
    if (parentStar) {
      panelRenderer.renderPlanet(planetRecord.data, parentStar.data);
    }
    setBackButtonVisible(true);
    startFlyTo(planetRecord.mesh, getCameraOffset('PLANET'), 1.4);
    notifyViewStateChange();
  }

  function goUpLevel() {
    if (isTransitioning) {
      return;
    }

    if (currentLevel === 'PLANET' && currentParentStarId) {
      const parentStar = starRecords.get(currentParentStarId);
      if (parentStar) {
        focusOnStar(parentStar);
        return;
      }
    }

    if (currentLevel !== 'GALAXY') {
      focusOnGalaxy();
    }
  }

  function handlePanelClose() {
    panelRenderer.closePanel();
    notifyViewStateChange();
  }

  function handleResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  function handlePointerDown(event: PointerEvent) {
    pointerDown = createPointerDownState(event);
  }

  function handlePointerUp(event: PointerEvent) {
    if (shouldIgnoreSceneTarget(event.target)) {
      return;
    }

    if (!isTapGesture(pointerDown, event)) {
      return;
    }

    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);

    const [hit] = raycaster.intersectObjects(interactableObjects, false);
    if (!hit || !(hit.object instanceof THREE.Mesh)) {
      return;
    }

    const flashTimeoutId = flashMeshMaterial(hit.object, 220, {
      onSettled(timeoutId) {
        flashTimeouts.delete(timeoutId);
      },
      shouldRestore: () => !destroyed,
    });
    if (flashTimeoutId !== null) {
      flashTimeouts.add(flashTimeoutId);
    }
    const selection = resolvePickedRecord(hit.object, starRecords, planetRecords);
    if (!selection) {
      return;
    }

    if (selection.kind === 'star') {
      focusOnStar(selection.record);
      return;
    }

    focusOnPlanet(selection.record);
  }

  function handleAction(event: GalaxyActionEvent) {
    const detail = event.detail;
    if (!detail) {
      return;
    }

    const target = findTeleportTarget(galaxy, detail);
    if (!target) {
      return;
    }

    const starRecord = starRecords.get(target.id);
    if (detail.targetType === 'star' || (!detail.targetType && starRecord)) {
      if (starRecord) {
        focusOnStar(starRecord);
      }
      return;
    }

    const record = planetRecords.get(target.id);
    if (record) {
      focusOnPlanet(record);
    }
  }

  function animate() {
    if (destroyed) {
      return;
    }

    animationFrame = window.requestAnimationFrame(animate);
    controls.update();
    advanceSceneRuntime({
      lanePackets,
      planetRecords,
      starRecords,
      time: performance.now(),
      universeGroup,
    });

    if (currentFocusObject && !isTransitioning) {
      currentFocusObject.getWorldPosition(currentFocusPosition);
      focusDelta.subVectors(currentFocusPosition, lastFocusPos);
      camera.position.add(focusDelta);
      controls.target.copy(currentFocusPosition);
      lastFocusPos.copy(currentFocusPosition);

      const distanceToTarget = camera.position.distanceTo(controls.target);
      if (shouldReleaseFocus(currentLevel, distanceToTarget)) {
        goUpLevel();
      }
    }

    renderer.render(scene, camera);
  }

  function dispose() {
    if (destroyed) {
      return;
    }

    onViewStateChange?.(getCurrentViewState());
    destroyed = true;
    isTransitioning = false;
    activeFlyToTween?.kill();
    activeFlyToTween = null;
    window.cancelAnimationFrame(animationFrame);
    window.removeEventListener('resize', handleResize);
    window.removeEventListener('pointerdown', handlePointerDown);
    window.removeEventListener('pointerup', handlePointerUp);
    window.removeEventListener(GALAXY_ACTION_EVENT, handleAction);
    backButton?.removeEventListener('click', goUpLevel);
    closeButton?.removeEventListener('click', handlePanelClose);
    panelRenderer.closePanel();
    setBackButtonVisible(false);
    flashTimeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
    flashTimeouts.clear();
    disposeSceneResources(scene);
    scene.clear();
    controls.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
    if (sceneContainer.isConnected) {
      sceneContainer.replaceChildren();
    }
  }

  window.addEventListener('resize', handleResize);
  window.addEventListener('pointerdown', handlePointerDown);
  window.addEventListener('pointerup', handlePointerUp);
  window.addEventListener(GALAXY_ACTION_EVENT, handleAction);
  backButton?.addEventListener('click', goUpLevel);
  closeButton?.addEventListener('click', handlePanelClose);

  restoreViewState(initialViewState);
  animate();
  return { dispose };
}




