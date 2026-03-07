import * as THREE from 'three';

export type FocusLevel = 'GALAXY' | 'STAR' | 'PLANET';
export type FocusTargetType = 'star' | 'planet';
export type SceneVector3Tuple = [number, number, number];

export interface SceneViewState {
  level: FocusLevel;
  focusTargetId: string | null;
  focusTargetType: FocusTargetType | null;
  parentStarId: string | null;
  cameraPosition: SceneVector3Tuple;
  controlsTarget: SceneVector3Tuple;
  infoPanelOpen: boolean;
  planetAngles: Record<string, number>;
  universeRotationY: number;
}

export interface SceneMountOptions {
  initialViewState?: SceneViewState | null;
  onViewStateChange?: (state: SceneViewState) => void;
}

interface SceneViewStateInput {
  level: FocusLevel;
  focusTargetId: string | null;
  focusTargetType: FocusTargetType | null;
  parentStarId: string | null;
  cameraPosition: SceneVector3Tuple | THREE.Vector3;
  controlsTarget: SceneVector3Tuple | THREE.Vector3;
  infoPanelOpen: boolean;
  planetAngles: Record<string, number>;
  universeRotationY: number;
}

export function createVector(
  tuple: SceneVector3Tuple | THREE.Vector3,
): THREE.Vector3 {
  return tuple instanceof THREE.Vector3
    ? tuple.clone()
    : new THREE.Vector3(tuple[0], tuple[1], tuple[2]);
}

export function toVectorTuple(vector: THREE.Vector3): SceneVector3Tuple {
  return [vector.x, vector.y, vector.z];
}

export function createSceneViewState(
  input: SceneViewStateInput,
): SceneViewState {
  return {
    level: input.level,
    focusTargetId: input.focusTargetId,
    focusTargetType: input.focusTargetType,
    parentStarId: input.parentStarId,
    cameraPosition: toVectorTuple(createVector(input.cameraPosition)),
    controlsTarget: toVectorTuple(createVector(input.controlsTarget)),
    infoPanelOpen: input.infoPanelOpen,
    planetAngles: { ...input.planetAngles },
    universeRotationY: input.universeRotationY,
  };
}
