import * as THREE from 'three';
import type { TeleportAction } from '../../types/agent';
import type { HydratedGalaxy } from '../galaxy-model';

export const WEBGL_FALLBACK_MESSAGE =
  '当前设备暂时无法初始化星系场景，已切换为静态模式。';

interface FlashMeshMaterialOptions {
  onSettled?: (timeoutId: number) => void;
  shouldRestore?: () => boolean;
}

export function findTeleportTarget(
  galaxy: Pick<HydratedGalaxy, 'stars'>,
  action: Pick<TeleportAction, 'targetType' | 'targetId'>,
) {
  if (action.targetType === 'star') {
    return galaxy.stars.find((star) => star.id === action.targetId) ?? null;
  }

  return (
    galaxy.stars
      .flatMap((star) => star.planets)
      .find((planet) => planet.id === action.targetId) ?? null
  );
}

export function showFallback(
  container: HTMLElement | null,
  fallback: HTMLElement | null,
  message = WEBGL_FALLBACK_MESSAGE,
) {
  if (container) {
    container.innerHTML = '';
  }

  if (fallback) {
    fallback.classList.remove('hidden');
    fallback.textContent = message;
  }
}

export function applyOrbitPosition(
  mesh: THREE.Mesh,
  orbitDistance: number,
  angle: number,
) {
  mesh.position.x = Math.cos(angle) * orbitDistance;
  mesh.position.z = Math.sin(angle) * orbitDistance;
}

export function flashMeshMaterial(
  mesh: THREE.Mesh,
  duration = 220,
  options: FlashMeshMaterialOptions = {},
) {
  const material = mesh.material;
  if (!(material instanceof THREE.MeshBasicMaterial)) {
    return null;
  }

  const { onSettled, shouldRestore = () => true } = options;
  const originalColor = material.color.clone();
  material.color.setHex(0xffffff);

  let timeoutId = 0;
  timeoutId = window.setTimeout(() => {
    if (shouldRestore()) {
      material.color.copy(originalColor);
    }

    onSettled?.(timeoutId);
  }, duration);

  return timeoutId;
}

export function disposeMaterial(material: THREE.Material | THREE.Material[]) {
  if (Array.isArray(material)) {
    material.forEach((entry) => entry.dispose());
    return;
  }

  material.dispose();
}
