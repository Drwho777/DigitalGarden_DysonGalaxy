import * as THREE from 'three';
import gsap from 'gsap';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { FocusLevel } from './galaxy-scene-view-state';

const CAMERA_OFFSET_TUPLES: Record<FocusLevel, [number, number, number]> = {
  GALAXY: [0, 600, 1200],
  STAR: [130, 100, 220],
  PLANET: [34, 24, 54],
};

export function getCameraOffset(level: FocusLevel) {
  const [x, y, z] = CAMERA_OFFSET_TUPLES[level];
  return new THREE.Vector3(x, y, z);
}

export function shouldReleaseFocus(
  level: FocusLevel,
  distanceToTarget: number,
) {
  if (level === 'PLANET') {
    return distanceToTarget > 220;
  }

  if (level === 'STAR') {
    return distanceToTarget > 620;
  }

  return false;
}

interface CaptureSceneSnapshotOptions {
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  currentFocusObject: THREE.Object3D | null;
  currentFocusOffset: THREE.Vector3 | null;
  isTransitioning: boolean;
}

export function captureSceneSnapshot({
  camera,
  controls,
  currentFocusObject,
  currentFocusOffset,
  isTransitioning,
}: CaptureSceneSnapshotOptions) {
  const cameraPosition = camera.position.clone();
  const controlsTarget = controls.target.clone();

  if (isTransitioning && currentFocusObject && currentFocusOffset) {
    const focusPosition = new THREE.Vector3();
    currentFocusObject.getWorldPosition(focusPosition);
    controlsTarget.copy(focusPosition);
    cameraPosition.copy(focusPosition).add(currentFocusOffset);
  }

  return { cameraPosition, controlsTarget };
}

interface FlyToTargetOptions {
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  duration: number;
  offset: THREE.Vector3;
  targetObject: THREE.Object3D | null;
  onComplete: () => void;
  onTargetPosition: (targetPosition: THREE.Vector3) => void;
}

export function flyToTarget({
  camera,
  controls,
  duration,
  offset,
  targetObject,
  onComplete,
  onTargetPosition,
}: FlyToTargetOptions) {
  const startCameraPosition = camera.position.clone();
  const startTarget = controls.target.clone();
  const fallbackTarget = new THREE.Vector3(0, 0, 0);

  return gsap.to({ t: 0 }, {
    duration,
    ease: 'power2.inOut',
    t: 1,
    onUpdate() {
      const progress = this.targets()[0].t;
      const targetPosition = new THREE.Vector3();

      if (targetObject) {
        targetObject.getWorldPosition(targetPosition);
      } else {
        targetPosition.copy(fallbackTarget);
      }

      const desiredCameraPosition = targetPosition.clone().add(offset);
      camera.position.lerpVectors(
        startCameraPosition,
        desiredCameraPosition,
        progress,
      );
      controls.target.lerpVectors(startTarget, targetPosition, progress);
      onTargetPosition(targetPosition);
    },
    onComplete,
  });
}
