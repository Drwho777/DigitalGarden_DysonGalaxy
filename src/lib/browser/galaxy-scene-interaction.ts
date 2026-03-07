import * as THREE from 'three';
import type { PlanetRecord, StarRecord } from './galaxy-scene-runtime';

export interface PointerDownState {
  time: number;
  x: number;
  y: number;
}

export function createPointerDownState(
  pointer: Pick<PointerEvent, 'clientX' | 'clientY'>,
  time = Date.now(),
): PointerDownState {
  return {
    x: pointer.clientX,
    y: pointer.clientY,
    time,
  };
}

export function isTapGesture(
  pointerDown: PointerDownState,
  pointer: Pick<PointerEvent, 'clientX' | 'clientY'>,
  time = Date.now(),
) {
  const distance = Math.hypot(
    pointer.clientX - pointerDown.x,
    pointer.clientY - pointerDown.y,
  );
  const duration = time - pointerDown.time;

  return distance <= 5 && duration <= 300;
}

export function shouldIgnoreSceneTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(
      target.closest('#info-panel') ||
        target.closest('#ai-terminal') ||
        target.closest('#ai-terminal-fab') ||
        target.closest('#hub-back-btn'),
    )
  );
}

export function resolvePickedRecord(
  object: THREE.Object3D,
  starRecords: Map<string, StarRecord>,
  planetRecords: Map<string, PlanetRecord>,
) {
  const kind = object.userData.kind as 'star' | 'planet' | undefined;
  const id = object.userData.id as string | undefined;
  if (!kind || !id) {
    return null;
  }

  if (kind === 'star') {
    const record = starRecords.get(id);
    return record ? { kind, record } : null;
  }

  const record = planetRecords.get(id);
  return record ? { kind, record } : null;
}
