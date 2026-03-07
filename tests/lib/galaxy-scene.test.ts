import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { shouldReleaseFocus } from '../../src/lib/browser/galaxy-scene-camera';
import {
  createPointerDownState,
  isTapGesture,
} from '../../src/lib/browser/galaxy-scene-interaction';
import { findTeleportTarget } from '../../src/lib/browser/galaxy-scene-helpers';
import { createSceneViewState } from '../../src/lib/browser/galaxy-scene-view-state';
import { fixtureHydratedGalaxy } from '../fixtures/galaxy-fixtures';

describe('findTeleportTarget', () => {
  it('finds a star by target id', () => {
    expect(
      findTeleportTarget(fixtureHydratedGalaxy, {
        targetType: 'star',
        targetId: 'acg',
      }),
    ).toMatchObject({ id: 'acg' });
  });

  it('finds a planet by target id', () => {
    expect(
      findTeleportTarget(fixtureHydratedGalaxy, {
        targetType: 'planet',
        targetId: 'p_garden',
      }),
    ).toMatchObject({ id: 'p_garden' });
  });

  it('returns null for an unknown target id', () => {
    expect(
      findTeleportTarget(fixtureHydratedGalaxy, {
        targetType: 'planet',
        targetId: 'missing',
      }),
    ).toBeNull();
  });
});

describe('createSceneViewState', () => {
  it('serializes vectors into restorable tuple state', () => {
    const cameraPosition = new THREE.Vector3(12, 34, 56);
    const controlsTarget = new THREE.Vector3(-7, 8, 9);

    const viewState = createSceneViewState({
      level: 'PLANET',
      focusTargetId: 'p_garden',
      focusTargetType: 'planet',
      parentStarId: 'tech',
      cameraPosition,
      controlsTarget,
      infoPanelOpen: true,
      planetAngles: { p_garden: Math.PI / 4 },
      universeRotationY: 0.25,
    });

    cameraPosition.set(0, 0, 0);
    controlsTarget.set(0, 0, 0);

    expect(viewState).toEqual({
      level: 'PLANET',
      focusTargetId: 'p_garden',
      focusTargetType: 'planet',
      parentStarId: 'tech',
      cameraPosition: [12, 34, 56],
      controlsTarget: [-7, 8, 9],
      infoPanelOpen: true,
      planetAngles: { p_garden: Math.PI / 4 },
      universeRotationY: 0.25,
    });
  });
});

describe('isTapGesture', () => {
  it('accepts short, low-distance pointer interactions as taps', () => {
    const pointerDown = createPointerDownState({ clientX: 10, clientY: 20 }, 1000);

    expect(
      isTapGesture(pointerDown, { clientX: 13, clientY: 24 }, 1200),
    ).toBe(true);
  });

  it('rejects drags and long presses', () => {
    const pointerDown = createPointerDownState({ clientX: 10, clientY: 20 }, 1000);

    expect(
      isTapGesture(pointerDown, { clientX: 18, clientY: 20 }, 1200),
    ).toBe(false);
    expect(
      isTapGesture(pointerDown, { clientX: 13, clientY: 24 }, 1400),
    ).toBe(false);
  });
});

describe('shouldReleaseFocus', () => {
  it('uses the current focus thresholds for planet and star views', () => {
    expect(shouldReleaseFocus('PLANET', 221)).toBe(true);
    expect(shouldReleaseFocus('PLANET', 220)).toBe(false);
    expect(shouldReleaseFocus('STAR', 621)).toBe(true);
    expect(shouldReleaseFocus('STAR', 620)).toBe(false);
  });

  it('never releases galaxy focus from camera distance alone', () => {
    expect(shouldReleaseFocus('GALAXY', 5000)).toBe(false);
  });
});
