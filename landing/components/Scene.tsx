'use client';

import { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import {
  Environment,
  Lightformer,
  MeshTransmissionMaterial,
} from '@react-three/drei';
import {
  EffectComposer,
  Bloom,
  Noise,
  ChromaticAberration,
} from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import * as THREE from 'three';
import { scrollStore, lerp, clamp } from '@/lib/scroll';
import { track } from '@/lib/analytics';

/*
 * TODO(webgpu): react-three/fiber's WebGPU renderer (three/webgpu +
 * <Canvas gl={(props) => new WebGPURenderer(props)}>) is on the near horizon.
 * The scene graph, materials, and postprocessing below are renderer-agnostic,
 * so migrating later is a Canvas-level swap, not a rewrite. Flagging now.
 */

// Cool indigo → warm magenta, the same arc the DOM color-grade follows.
const COLOR_COOL = new THREE.Color('#6366f1');
const COLOR_WARM = new THREE.Color('#d946ef');

const SHARD_COUNT = 48;
const BURST_MS = 1300;

/** The refractive hero form + its shatter shards. One transmission draw. */
function GlassKnot() {
  const group = useRef<THREE.Group>(null!);
  const knot = useRef<THREE.Mesh>(null!);
  // MeshTransmissionMaterial extends MeshPhysicalMaterial with extra uniforms;
  // there's no exported type, so we ref it loosely and poke color per-frame.
  const material = useRef<any>(null);
  const cursorLight = useRef<THREE.PointLight>(null!);
  const shards = useRef<THREE.InstancedMesh>(null!);

  // Easter egg state: triple-click within 500ms fires a burst.
  const clicks = useRef<{ n: number; t: number }>({ n: 0, t: 0 });
  const burstStart = useRef<number | null>(null);
  const shardsPrimed = useRef(false);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Per-shard directions / spins / sizes — fixed for the life of the scene.
  const shardData = useMemo(() => {
    return Array.from({ length: SHARD_COUNT }, () => {
      const dir = new THREE.Vector3(
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
        Math.random() * 2 - 1
      ).normalize();
      return {
        dir,
        spin: new THREE.Vector3(
          Math.random() * 6 - 3,
          Math.random() * 6 - 3,
          Math.random() * 6 - 3
        ),
        reach: 1.6 + Math.random() * 2.4,
        size: 0.12 + Math.random() * 0.16,
      };
    });
  }, []);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const now = performance.now();
    const c = clicks.current;
    c.n = now - c.t < 500 ? c.n + 1 : 1;
    c.t = now;
    if (c.n >= 3 && burstStart.current === null) {
      burstStart.current = now;
      c.n = 0;
      track('easter_egg');
    }
  };

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const { pointer } = state;

    // Scroll drives the morph: object grows, tumbles, and warms as you scroll.
    const p = clamp(scrollStore.heroProgress);
    const smooth = p * p * (3 - 2 * p); // smoothstep

    // --- Burst / reform envelope (0 → 1 → 0 over BURST_MS) ---
    let burst = 0;
    if (burstStart.current !== null) {
      const elapsed = performance.now() - burstStart.current;
      if (elapsed >= BURST_MS) {
        burstStart.current = null;
      } else {
        burst = Math.sin((elapsed / BURST_MS) * Math.PI); // ease up then down
      }
    }

    if (group.current) {
      // Idle rotation — slow, always alive.
      group.current.rotation.y += delta * 0.18;
      group.current.rotation.x = Math.sin(t * 0.25) * 0.12;

      // Cursor parallax tilt — subtle, not full drag control.
      group.current.rotation.y += pointer.x * 0.0025;
      const targetTiltX = -pointer.y * 0.28;
      const targetTiltZ = pointer.x * 0.12;
      group.current.rotation.x = lerp(group.current.rotation.x, targetTiltX, 0.04);
      group.current.rotation.z = lerp(group.current.rotation.z, targetTiltZ, 0.04);

      // Scroll morph: scale + extra spin.
      const s = lerp(1, 1.35, smooth) * (1 - burst * 0.35);
      group.current.scale.setScalar(lerp(group.current.scale.x, s, 0.08));
      group.current.rotation.y += smooth * delta * 0.4;
    }

    // Cursor-reactive point light — the refraction visibly follows the mouse.
    if (cursorLight.current) {
      cursorLight.current.position.x = lerp(
        cursorLight.current.position.x,
        pointer.x * 5,
        0.08
      );
      cursorLight.current.position.y = lerp(
        cursorLight.current.position.y,
        pointer.y * 5,
        0.08
      );
    }

    // Color-shift + distortion react to scroll and to the burst.
    if (material.current) {
      material.current.color.copy(COLOR_COOL).lerp(COLOR_WARM, smooth);
      if ('distortion' in material.current) {
        material.current.distortion = 0.25 + burst * 1.4;
      }
      if ('temporalDistortion' in material.current) {
        material.current.temporalDistortion = 0.1 + burst * 0.4;
      }
    }
    if (knot.current) {
      // Knot fades toward transparent while shattered, then reforms.
      const opacity = 1 - burst * 0.85;
      (knot.current.material as THREE.Material).opacity = opacity;
      (knot.current.material as THREE.Material).transparent = true;
    }

    // --- Shards ---
    if (shards.current) {
      if (burst > 0.001) {
        shardsPrimed.current = true;
        for (let i = 0; i < SHARD_COUNT; i++) {
          const d = shardData[i];
          const dist = d.reach * burst;
          dummy.position.copy(d.dir).multiplyScalar(dist);
          dummy.rotation.set(
            d.spin.x * burst,
            d.spin.y * burst,
            d.spin.z * burst
          );
          const sc = d.size * (0.3 + burst);
          dummy.scale.setScalar(sc);
          dummy.updateMatrix();
          shards.current.setMatrixAt(i, dummy.matrix);
        }
        shards.current.instanceMatrix.needsUpdate = true;
      } else if (shardsPrimed.current) {
        // Collapse to zero once, when the burst ends.
        for (let i = 0; i < SHARD_COUNT; i++) {
          dummy.position.set(0, 0, 0);
          dummy.scale.setScalar(0);
          dummy.updateMatrix();
          shards.current.setMatrixAt(i, dummy.matrix);
        }
        shards.current.instanceMatrix.needsUpdate = true;
        shardsPrimed.current = false;
      }
    }
  });

  return (
    <group ref={group}>
      {/* Light that tracks the cursor, feeding the glass its refraction. */}
      <pointLight ref={cursorLight} position={[3, 3, 4]} intensity={30} color="#a5b4fc" />

      <mesh ref={knot} onClick={handleClick}>
        {/* Procedural geometry only — no GLTF, one transmission surface. */}
        <torusKnotGeometry args={[1, 0.34, 220, 32]} />
        <MeshTransmissionMaterial
          ref={material}
          // Transmission renders the scene to an FBO every frame — the single
          // biggest GPU cost. Lower samples/resolution keeps the GPU free
          // enough that scrolling stays smooth; the blur hides the difference.
          samples={4}
          resolution={256}
          transmission={1}
          thickness={1.6}
          roughness={0.06}
          ior={1.42}
          chromaticAberration={0.28}
          anisotropicBlur={0.4}
          distortion={0.3}
          distortionScale={0.4}
          temporalDistortion={0.1}
          iridescence={1}
          iridescenceIOR={1.5}
          iridescenceThicknessRange={[100, 900]}
          color="#6366f1"
          background={new THREE.Color('#050505')}
        />
      </mesh>

      {/* Shatter shards — hidden until the easter egg fires. */}
      <instancedMesh
        ref={shards}
        // geometry + material come from children; count is the only real arg.
        args={[undefined as never, undefined as never, SHARD_COUNT]}
        frustumCulled={false}
      >
        <tetrahedronGeometry args={[1, 0]} />
        <meshStandardMaterial
          color="#c4b5fd"
          emissive="#8b5cf6"
          emissiveIntensity={0.6}
          metalness={0.2}
          roughness={0.15}
          transparent
          opacity={0.9}
        />
      </instancedMesh>
    </group>
  );
}

/** Studio lighting built from lightformers — no network HDR fetch. */
function StudioEnv() {
  return (
    <Environment resolution={256} frames={1}>
      <Lightformer
        intensity={2}
        position={[0, 4, -6]}
        scale={[10, 6, 1]}
        color="#818cf8"
      />
      <Lightformer
        intensity={1.6}
        position={[-6, 1, 2]}
        scale={[4, 8, 1]}
        color="#22d3ee"
      />
      <Lightformer
        intensity={1.4}
        position={[6, -2, 2]}
        scale={[4, 8, 1]}
        color="#ec4899"
      />
      <Lightformer
        intensity={1}
        position={[0, -5, 3]}
        scale={[10, 4, 1]}
        color="#a78bfa"
      />
    </Environment>
  );
}

function Effects() {
  const caOffset = useMemo(() => new THREE.Vector2(0.0009, 0.0012), []);
  return (
    <EffectComposer multisampling={0}>
      <Bloom
        intensity={0.9}
        luminanceThreshold={0.15}
        luminanceSmoothing={0.9}
        mipmapBlur
        radius={0.7}
      />
      <ChromaticAberration
        offset={caOffset}
        radialModulation={false}
        modulationOffset={0}
        blendFunction={BlendFunction.NORMAL}
      />
      <Noise premultiply blendFunction={BlendFunction.OVERLAY} opacity={0.18} />
    </EffectComposer>
  );
}

export default function Scene() {
  return (
    <Canvas
      // Cap DPR so high-density displays don't melt on transmission + bloom.
      // 1.5 leaves clear GPU headroom for smooth scroll on retina panels.
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 6], fov: 42 }}
      gl={{
        antialias: false,
        alpha: true,
        powerPreference: 'high-performance',
      }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <color attach="background" args={['#050505']} />
      <ambientLight intensity={0.4} />
      <Suspense fallback={null}>
        <GlassKnot />
        <StudioEnv />
      </Suspense>
      <Effects />
    </Canvas>
  );
}
