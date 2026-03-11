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
  hudMesh: THREE.Mesh;
  group: THREE.Group;
  starMesh: THREE.Mesh;
}

export interface LanePacket {
  curve: THREE.QuadraticBezierCurve3;
  line: THREE.Line;
  mesh: THREE.Mesh;
  trail: THREE.Mesh[]; // Add comet trail meshes
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

    const isCenter = (star.planets.length + star.totalNodes) > 10;
    const baseSize = (18 + star.planets.length * 3 + star.totalNodes * 1.2) * (isCenter ? 1.6 : 1.0);
    const starGeometry = new THREE.SphereGeometry(baseSize, 32, 32);
    
    // 2. Core Active Pulse Shader (Internal boiling plasma & High-Energy Core)
    const starMaterial = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color(star.color) },
        time: { value: 0 },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPositionNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vPositionNormal = normalize((modelViewMatrix * vec4(position, 1.0)).xyz);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        uniform float time;
        varying vec3 vNormal;
        varying vec3 vPositionNormal;
        
        float activeNoise(vec3 p) {
           float n = sin(p.x * 8.0 + time) * cos(p.y * 8.0 - time * 0.8) * sin(p.z * 8.0 + time * 0.4);
           n += 0.5 * sin(p.x * 16.0 - time * 1.2) * cos(p.y * 16.0 + time * 0.9);
           return n;
        }
        
        void main() {
          float fresnel = dot(vNormal, vPositionNormal);
          fresnel = clamp(1.0 - fresnel, 0.0, 1.0);
          fresnel = pow(fresnel, 2.0);
          
          float n = activeNoise(vPositionNormal * 1.5);
          float flow = smoothstep(-1.5, 1.5, n);
          
          // 1. Core layer: bright yellow/white, representing extreme heat
          vec3 coreWhite = vec3(1.0, 0.95, 0.8); 
          // 2. Photosphere layer: base color mixed with turbulence
          vec3 photoSphere = color * (1.2 + flow * 1.5); 
          
          // The center points toward the camera, make it biased towards the hot core
          float centerBias = dot(vNormal, vec3(0, 0, 1.0));
          vec3 surfaceColor = mix(photoSphere, coreWhite, pow(centerBias, 3.0) * flow);
          
          vec3 edgeColor = color * 6.0; 
          
          vec3 finalColor = mix(surfaceColor, edgeColor, fresnel * (0.8 + flow * 0.4));
          gl_FragColor = vec4(finalColor, 1.0);
        }
      `,
    });
    
    const starMesh = new THREE.Mesh(starGeometry, starMaterial);
    starMesh.userData = { kind: 'star', id: star.id };
    systemGroup.add(starMesh);
    interactableObjects.push(starMesh);

    // 3. Enhanced Star Corona Shader (Asymmetrical soft jets)
    const coronaFactor = isCenter ? 2.8 : 1.8;
    const glowGeometry = new THREE.SphereGeometry(baseSize * coronaFactor, 32, 32);
    const glowMaterial = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color(star.color) },
        time: { value: 0 },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPositionNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vPositionNormal = normalize((modelViewMatrix * vec4(position, 1.0)).xyz);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        uniform float time;
        varying vec3 vNormal;
        varying vec3 vPositionNormal;
        
        float jetNoise(vec3 p) {
           return sin(p.x * 4.0 + time * 0.5) * cos(p.y * 4.0 - time * 0.3) * sin(p.z * 4.0);
        }

        void main() {
          float centerDist = dot(vNormal, vec3(0, 0, 1.0));
          float baseIntensity = pow(0.65 - centerDist, 3.5);
          
          float n = jetNoise(vPositionNormal);
          float jets = pow(max(0.0, n + 0.5), 3.0) * 0.5;
          
          float finalIntensity = (baseIntensity + jets * baseIntensity * 1.5) * 2.5;
          gl_FragColor = vec4(color, finalIntensity);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
    systemGroup.add(glowMesh);

    // 4. Tactical Star HUD Ring (Constraining the energy)
    const hudInner = baseSize * coronaFactor * 0.8;
    const hudOuter = hudInner + 5.0;
    const hudGeometry = new THREE.RingGeometry(hudInner, hudOuter, 64);
    const hudMaterial = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color(star.color) },
        innerRadius: { value: hudInner },
        outerRadius: { value: hudOuter },
        time: { value: 0 }
      },
      vertexShader: `
        varying vec2 vPosition;
        void main() {
          vPosition = position.xy;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        uniform float innerRadius;
        uniform float outerRadius;
        uniform float time;
        varying vec2 vPosition;
        
        void main() {
          float dist = length(vPosition);
          float normDist = (dist - innerRadius) / (outerRadius - innerRadius);
          if (normDist < 0.0 || normDist > 1.0) discard;
          
          float angle = atan(vPosition.y, vPosition.x);
          float rotAngle1 = angle + time * 0.4;
          float rotAngle2 = angle - time * 0.2;
          
          // Deep analysis ticks
          float ticks = step(0.9, normDist) * step(fract(angle * 60.0), 0.3);
          
          // Inner solid constraint bounds
          float innerBound = step(normDist, 0.05) * 0.5;
          float outerBound = step(0.95, normDist) * 0.5;
          
          // Broken data arcs
          float arc = step(0.4, normDist) * step(normDist, 0.6) * step(fract(rotAngle1 * 3.0), 0.4);
          
          // High energy Scanner sweeps
          float sweep1 = pow(mod(rotAngle1, 6.28318) / 6.28318, 8.0) * step(0.1, normDist) * step(normDist, 0.9);
          float sweep2 = pow(mod(rotAngle2, 6.28318) / 6.28318, 4.0) * step(0.6, normDist) * step(normDist, 0.8);
          
          float finalAlpha = max(ticks, max(innerBound, max(outerBound, max(arc, max(sweep1 * 2.5, sweep2 * 1.5)))));
          float radialMask = smoothstep(0.0, 0.1, normDist) * smoothstep(1.0, 0.9, normDist);
          
          gl_FragColor = vec4(color * 1.5, finalAlpha * radialMask);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const hudMesh = new THREE.Mesh(hudGeometry, hudMaterial);
    hudMesh.rotation.x = Math.PI / 2; // Flat tactical ring
    systemGroup.add(hudMesh);

    starRecords.set(star.id, {
      data: star,
      glowMesh,
      hudMesh,
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
      // --- Create Planet Core FIRST ---
      const planetRadius =
        planet.pageType === 'gallery'
          ? 7.2
          : 6 + Math.max(planet.nodeCount, 1) * 1.2;
      const planetGeometry = new THREE.SphereGeometry(planetRadius, 64, 64);
      
      // Neon Holographic Shader for Planet Core
      const planetMaterial = new THREE.ShaderMaterial({
        uniforms: {
          color: { value: new THREE.Color(planet.color) },
          viewVector: { value: new THREE.Vector3() },
        },
        vertexShader: `
          varying vec3 vNormal;
          varying vec3 vPositionNormal;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            vPositionNormal = normalize((modelViewMatrix * vec4(position, 1.0)).xyz);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 color;
          varying vec3 vNormal;
          varying vec3 vPositionNormal;
          void main() {
            // Calculate fresnel for bright glowing edges
            float fresnel = dot(vNormal, vPositionNormal);
            fresnel = clamp(1.0 - fresnel, 0.0, 1.0);
            fresnel = pow(fresnel, 1.5);
            
            // Brighten inner core again since global bloom is gone
            vec3 innerColor = color * 0.6;
            vec3 edgeColor = color * 3.0; // Overdrive edge to punch through
            
            vec3 finalColor = mix(innerColor, edgeColor, fresnel);
            gl_FragColor = vec4(finalColor, 1.0);
          }
        `,
      });
      const planetMesh = new THREE.Mesh(planetGeometry, planetMaterial);
      planetMesh.userData = { kind: 'planet', id: planet.id };

      // --- Fake Local Bloom Halo for Planet ---
      const haloGeometry = new THREE.SphereGeometry(planetRadius * 1.25, 32, 32);
      const haloMaterial = new THREE.ShaderMaterial({
        uniforms: {
          color: { value: new THREE.Color(planet.color) },
          viewVector: { value: new THREE.Vector3() },
        },
        vertexShader: `
          varying vec3 vNormal;
          varying vec3 vPositionNormal;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            vPositionNormal = normalize((modelViewMatrix * vec4(position, 1.0)).xyz);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 color;
          varying vec3 vNormal;
          varying vec3 vPositionNormal;
          void main() {
            // Soft atmospheric fade-out based on view angle
            float intensity = pow(0.6 - dot(vNormal, vPositionNormal), 3.0);
            gl_FragColor = vec4(color, intensity * 2.5); // Overdrive alpha for additive glow
          }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const haloMesh = new THREE.Mesh(haloGeometry, haloMaterial);
      planetMesh.add(haloMesh);

      // --- Create HUD Ring AFTER ---
      const ringInner = planetRadius + 1.6;
      const ringOuter = ringInner + 2.8 + planet.nodeCount * 0.4;
      const ringGeometry = new THREE.RingGeometry(ringInner, ringOuter, 64);
      const ringMaterial = new THREE.ShaderMaterial({
        uniforms: {
          color: { value: new THREE.Color(planet.color) },
          innerRadius: { value: ringInner },
          outerRadius: { value: ringOuter },
          time: { value: 0.0 }
        },
        vertexShader: `
          varying vec2 vPosition;
          void main() {
            vPosition = position.xy;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 color;
          uniform float innerRadius;
          uniform float outerRadius;
          uniform float time;
          varying vec2 vPosition;

          void main() {
            float dist = length(vPosition);
            float normDist = (dist - innerRadius) / (outerRadius - innerRadius);
            
            if (normDist < 0.0 || normDist > 1.0) discard;
            
            float angle = atan(vPosition.y, vPosition.x);
            float rotAngle = angle - time * 0.5;
            float revRotAngle = angle + time * 0.3;
            
            // 1. Ticks (fine dashes on the very outer edge)
            float ticks = step(0.85, normDist) * step(fract(angle * 40.0), 0.4);
            
            // 2. Solid inner structural line
            float innerLine = step(normDist, 0.1) * 0.6;
            
            // 3. Segmented data arcs (middle)
            float segments = step(0.3, normDist) * step(normDist, 0.6) * step(fract(revRotAngle * 4.0), 0.6);
            
            // 4. Rotating scanner sweep (intense)
            float sweep = pow(mod(rotAngle, 6.28318) / 6.28318, 5.0) * step(0.1, normDist) * step(normDist, 0.85);
            
            // Combine alpha layers
            float finalAlpha = max(ticks * 0.9, max(innerLine, max(segments * 0.4, sweep * 2.0)));
            
            // Smooth edge masking just to be safe
            float radialMask = smoothstep(0.0, 0.05, normDist) * smoothstep(1.0, 0.95, normDist);
            
            // Overdrive final color
            gl_FragColor = vec4(color * 1.5, finalAlpha * radialMask);
          }
        `,
        transparent: true,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
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
      color: new THREE.Color(0x00bfff).multiplyScalar(2.0), // High intensity additive
      transparent: true,
      opacity: 0.15,
      blending: THREE.AdditiveBlending,
      depthWrite: false, 
    });
    const curveLine = new THREE.Line(curveGeometry, curveMaterial);
    universeGroup.add(curveLine);

    for (let index = 0; index < 2; index += 1) {
      // Main packet head
      const packet = new THREE.Mesh(
        new THREE.SphereGeometry(1.6, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
      );
      universeGroup.add(packet);
      
      // Comet tail (multiple smaller fading spheres)
      const trailMeshes: THREE.Mesh[] = [];
      const trailCount = 6;
      for (let t = 0; t < trailCount; t++) {
        const trailMesh = new THREE.Mesh(
          new THREE.SphereGeometry(1.4 - t * 0.2, 8, 8),
          new THREE.MeshBasicMaterial({ 
            color: new THREE.Color(0x00bfff).multiplyScalar(1.5), // Overdrive color
            transparent: true, 
            opacity: 0.8 - (t * 0.12), // Slower fade for fake bloom
            blending: THREE.AdditiveBlending,
            depthWrite: false
          }),
        );
        universeGroup.add(trailMesh);
        trailMeshes.push(trailMesh);
      }

      lanePackets.push({
        curve,
        line: curveLine,
        mesh: packet,
        trail: trailMeshes,
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
  const dustCount = 1500; // Sparse deep space
  const dustPositions = new Float32Array(dustCount * 3);
  const dustColors = new Float32Array(dustCount * 3);
  const baseColor = new THREE.Color(0xffffff);

  for (let index = 0; index < dustCount; index += 1) {
    // Push them much further out so they act as a stable backdrop
    const radius = 300 + Math.pow(Math.random(), 1.5) * 2200;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    
    const offset = index * 3;
    dustPositions[offset] = radius * Math.sin(phi) * Math.cos(theta);
    dustPositions[offset + 1] = radius * Math.sin(phi) * Math.sin(theta);
    dustPositions[offset + 2] = radius * Math.cos(phi);

    // Mostly white, slightly dimmed randomly
    const dimFactor = 0.3 + Math.random() * 0.7;
    dustColors[offset] = baseColor.r * dimFactor;
    dustColors[offset + 1] = baseColor.g * dimFactor;
    dustColors[offset + 2] = baseColor.b * dimFactor;
  }

  dustGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(dustPositions, 3),
  );
  dustGeometry.setAttribute('color', new THREE.BufferAttribute(dustColors, 3));

  return new THREE.Points(
    dustGeometry,
    new THREE.PointsMaterial({
      size: 1.0,
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
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
  camera: THREE.Camera;
  lanePackets: LanePacket[];
  planetRecords: Map<string, PlanetRecord>;
  starRecords: Map<string, StarRecord>;
  time: number;
  universeGroup: THREE.Group;
}

export function advanceSceneRuntime({
  camera,
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
    
    // Drive internal star plasma boiling and external tactical rings
    const timeValue = time * 0.0015;
    const mat = record.starMesh.material as THREE.ShaderMaterial;
    if (mat.uniforms?.time) mat.uniforms.time.value = timeValue;
    
    const glowMat = record.glowMesh.material as THREE.ShaderMaterial;
    if (glowMat.uniforms?.time) glowMat.uniforms.time.value = timeValue;

    const hudMat = record.hudMesh.material as THREE.ShaderMaterial;
    if (hudMat.uniforms?.time) hudMat.uniforms.time.value = timeValue;
  });

  planetRecords.forEach((record) => {
    record.angle += record.data.orbitSpeed;
    applyOrbitPosition(record.mesh, record.data.orbitDistance, record.angle);
    record.mesh.rotation.y += 0.01;

    // Update the viewVector uniform for the holographic shader
    // and the time uniform for the dynamic HUD ring
    record.mesh.children.forEach((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.ShaderMaterial) {
        if (child.material.uniforms.viewVector) {
          child.material.uniforms.viewVector.value.subVectors(
            camera.position,
            child.getWorldPosition(new THREE.Vector3())
          ).normalize();
        }
        if (child.geometry instanceof THREE.RingGeometry && child.material.uniforms.time) {
          child.material.uniforms.time.value = time * 0.001; // passing seconds
        }
      }
    });
    
    // Also update viewVector on the planet core itself
    if (record.mesh.material instanceof THREE.ShaderMaterial && record.mesh.material.uniforms.viewVector) {
      record.mesh.material.uniforms.viewVector.value.subVectors(
        camera.position,
        record.mesh.getWorldPosition(new THREE.Vector3())
      ).normalize();
    }
  });

  lanePackets.forEach((lane) => {
    lane.progress += lane.speed * 1.5;
    if (lane.progress > 1) {
      lane.progress = 0;
    }

    // Pulse lane line opacity base on time + speed to simulate energy flowing
    if (lane.line.material instanceof THREE.Material) {
       lane.line.material.opacity = 0.08 + Math.sin(time * 0.003 + lane.speed * 1000) * 0.08;
    }
    
    // Position lead packet
    lane.mesh.position.copy(lane.curve.getPointAt(lane.progress));
    
    // Position trailing comet particles slightly behind
    lane.trail.forEach((trailMesh, idx) => {
       const trailProgress = Math.max(0, lane.progress - (idx + 1) * 0.012);
       if (trailProgress > 0) {
         trailMesh.position.copy(lane.curve.getPointAt(trailProgress));
         trailMesh.visible = true;
       } else {
         trailMesh.visible = false;
       }
    });
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
