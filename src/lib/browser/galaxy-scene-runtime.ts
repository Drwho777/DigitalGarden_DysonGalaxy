import * as THREE from 'three';
import type { GalaxyLane } from '../../types/galaxy';
import type {
  HydratedGalaxy,
  HydratedPlanet,
  HydratedStar,
} from '../galaxy-model';
import { applyOrbitPosition } from './galaxy-scene-helpers';

export type SceneGalaxy = HydratedGalaxy & { lanes: GalaxyLane[] };

export interface PlanetRecord {
  data: HydratedPlanet;
  mesh: THREE.Mesh;
  parentStarId: string;
  angle: number;
}

export interface StarRecord {
  data: HydratedStar;
  glowMesh: THREE.Mesh;
  group: THREE.Group;
  starMesh: THREE.Mesh;
}

export interface LanePacket {
  curve: THREE.QuadraticBezierCurve3;
  mesh: THREE.Mesh;
  progress: number;
  speed: number;
}

interface CreateSceneRuntimeOptions {
  galaxy: SceneGalaxy;
  initialPlanetAngles?: Record<string, number>;
  universeGroup: THREE.Group;
}

export function createSceneRuntime({
  galaxy,
  initialPlanetAngles = {},
  universeGroup,
}: CreateSceneRuntimeOptions) {
  const interactableObjects: THREE.Object3D[] = [];
  const starRecords = new Map<string, StarRecord>();
  const planetRecords = new Map<string, PlanetRecord>();
  const lanePackets: LanePacket[] = [];

  universeGroup.add(createDustCloud());

  galaxy.stars.forEach((star) => {
    const systemGroup = new THREE.Group();
    systemGroup.position.set(...star.position);

    const baseSize = 18 + star.planets.length * 3 + star.totalNodes * 1.2;
    const starGeometry = new THREE.SphereGeometry(baseSize, 32, 32);
    const starMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(star.color),
    });
    const starMesh = new THREE.Mesh(starGeometry, starMaterial);
    starMesh.userData = { kind: 'star', id: star.id };
    systemGroup.add(starMesh);
    interactableObjects.push(starMesh);

    const glowGeometry = new THREE.SphereGeometry(baseSize * 1.6, 32, 32);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(star.color),
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
    });
    const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
    systemGroup.add(glowMesh);

    starRecords.set(star.id, {
      data: star,
      glowMesh,
      group: systemGroup,
      starMesh,
    });

    star.planets.forEach((planet) => {
      const orbitGroup = new THREE.Group();
      orbitGroup.rotation.x = planet.tilt;

      const orbitGeometry = new THREE.RingGeometry(
        planet.orbitDistance - 0.5,
        planet.orbitDistance + 0.5,
        72,
      );
      const orbitMaterial = new THREE.MeshBasicMaterial({
        color: new THREE.Color(planet.color),
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide,
      });
      const orbitLine = new THREE.Mesh(orbitGeometry, orbitMaterial);
      orbitLine.rotation.x = Math.PI / 2;
      orbitGroup.add(orbitLine);

      const planetRadius =
        planet.pageType === 'gallery'
          ? 7.2
          : 6 + Math.max(planet.nodeCount, 1) * 1.2;
      const planetGeometry = new THREE.SphereGeometry(planetRadius, 24, 24);
      const planetMaterial = new THREE.MeshBasicMaterial({
        color: new THREE.Color(planet.color),
      });
      const planetMesh = new THREE.Mesh(planetGeometry, planetMaterial);
      planetMesh.userData = { kind: 'planet', id: planet.id };

      const ringInner = planetRadius + 1.6;
      const ringOuter = ringInner + 3.6 + planet.nodeCount * 0.35;
      const ringGeometry = new THREE.RingGeometry(ringInner, ringOuter, 40);
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: new THREE.Color(planet.color),
        transparent: true,
        opacity: 0.46,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
      const ringMesh = new THREE.Mesh(ringGeometry, ringMaterial);
      ringMesh.rotation.x = Math.PI / 2;
      planetMesh.add(ringMesh);

      const angle =
        initialPlanetAngles[planet.id] ?? Math.random() * Math.PI * 2;
      applyOrbitPosition(planetMesh, planet.orbitDistance, angle);

      orbitGroup.add(planetMesh);
      systemGroup.add(orbitGroup);
      interactableObjects.push(planetMesh);
      planetRecords.set(planet.id, {
        data: planet,
        mesh: planetMesh,
        parentStarId: star.id,
        angle,
      });
    });

    addSwarmNodes(systemGroup, star);
    universeGroup.add(systemGroup);
  });

  galaxy.lanes.forEach((lane) => {
    const source = starRecords.get(lane.from);
    const target = starRecords.get(lane.to);
    if (!source || !target) {
      return;
    }

    const sourcePosition = source.group.position.clone();
    const targetPosition = target.group.position.clone();
    const midPoint = new THREE.Vector3()
      .addVectors(sourcePosition, targetPosition)
      .multiplyScalar(0.5);
    midPoint.y += 80 + Math.random() * 100;

    const curve = new THREE.QuadraticBezierCurve3(
      sourcePosition,
      midPoint,
      targetPosition,
    );
    const curveGeometry = new THREE.BufferGeometry().setFromPoints(
      curve.getPoints(60),
    );
    const curveMaterial = new THREE.LineBasicMaterial({
      color: 0x00bfff,
      transparent: true,
      opacity: 0.2,
      blending: THREE.AdditiveBlending,
    });
    universeGroup.add(new THREE.Line(curveGeometry, curveMaterial));

    for (let index = 0; index < 2; index += 1) {
      const packet = new THREE.Mesh(
        new THREE.SphereGeometry(1.5, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
      );
      universeGroup.add(packet);
      lanePackets.push({
        curve,
        mesh: packet,
        progress: Math.random(),
        speed: 0.0012 + Math.random() * 0.0015,
      });
    }
  });

  return {
    interactableObjects,
    lanePackets,
    planetRecords,
    starRecords,
  };
}

function createDustCloud() {
  const dustGeometry = new THREE.BufferGeometry();
  const dustCount = 4000;
  const dustPositions = new Float32Array(dustCount * 3);
  const dustColors = new Float32Array(dustCount * 3);
  const dustBlue = new THREE.Color(0x001144);
  const dustPurple = new THREE.Color(0x220033);

  for (let index = 0; index < dustCount; index += 1) {
    const radius = 120 + Math.pow(Math.random(), 2) * 1400;
    const theta = radius * 0.005 + Math.random() * 16;
    const offset = index * 3;
    dustPositions[offset] = Math.cos(theta) * radius;
    dustPositions[offset + 1] = (Math.random() - 0.5) * (radius * 0.12);
    dustPositions[offset + 2] = Math.sin(theta) * radius;

    const mixedColor = dustBlue.clone().lerp(dustPurple, Math.random());
    dustColors[offset] = mixedColor.r;
    dustColors[offset + 1] = mixedColor.g;
    dustColors[offset + 2] = mixedColor.b;
  }

  dustGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(dustPositions, 3),
  );
  dustGeometry.setAttribute('color', new THREE.BufferAttribute(dustColors, 3));

  return new THREE.Points(
    dustGeometry,
    new THREE.PointsMaterial({
      size: 1.2,
      vertexColors: true,
      transparent: true,
      opacity: 0.55,
    }),
  );
}

function addSwarmNodes(systemGroup: THREE.Group, star: HydratedStar) {
  const nodeGeometry = new THREE.SphereGeometry(1.2, 8, 8);
  const nodeMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const swarmCount = Math.min(Math.max(star.totalNodes * 10, 16), 54);
  const maxOrbit = star.planets.reduce(
    (max, planet) => Math.max(max, planet.orbitDistance),
    50,
  );

  for (let index = 0; index < swarmCount; index += 1) {
    const node = new THREE.Mesh(nodeGeometry, nodeMaterial);
    const radius = maxOrbit + 24 + Math.pow(Math.random(), 1.4) * 50;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    node.position.set(
      radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.sin(phi) * Math.sin(theta),
      radius * Math.cos(phi),
    );
    node.userData = {
      axis: new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5,
      ).normalize(),
      speed: 0.002 + Math.random() * 0.004,
    };
    systemGroup.add(node);
  }
}

interface AdvanceSceneRuntimeOptions {
  lanePackets: LanePacket[];
  planetRecords: Map<string, PlanetRecord>;
  starRecords: Map<string, StarRecord>;
  time: number;
  universeGroup: THREE.Group;
}

export function advanceSceneRuntime({
  lanePackets,
  planetRecords,
  starRecords,
  time,
  universeGroup,
}: AdvanceSceneRuntimeOptions) {
  starRecords.forEach((record) => {
    const pulse = 1 + Math.sin(time * 0.0016 + record.group.position.x) * 0.05;
    record.starMesh.scale.setScalar(pulse);
    record.glowMesh.scale.setScalar(pulse);
  });

  planetRecords.forEach((record) => {
    record.angle += record.data.orbitSpeed;
    applyOrbitPosition(record.mesh, record.data.orbitDistance, record.angle);
    record.mesh.rotation.y += 0.01;
  });

  lanePackets.forEach((packet) => {
    packet.progress += packet.speed;
    if (packet.progress > 1) {
      packet.progress = 0;
    }
    packet.mesh.position.copy(packet.curve.getPointAt(packet.progress));
  });

  universeGroup.rotation.y += 0.00025;

  universeGroup.traverse((object) => {
    if ('axis' in object.userData && object instanceof THREE.Mesh) {
      object.position.applyAxisAngle(
        object.userData.axis as THREE.Vector3,
        object.userData.speed as number,
      );
    }
  });
}
