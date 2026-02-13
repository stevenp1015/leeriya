import { Canvas, useFrame } from "@react-three/fiber";
import { memo, useMemo, useRef } from "react";
import * as THREE from "three";

interface LiquidBlobProps {
  getFrequencyData: (target: Uint8Array) => void;
}

function BlobCore({ getFrequencyData }: LiquidBlobProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const frameRef = useRef(0);

  const geometry = useMemo(() => new THREE.IcosahedronGeometry(1.25, 5), []);
  const base = useMemo(
    () => Float32Array.from((geometry.attributes.position.array as Float32Array) ?? []),
    [geometry]
  );
  const frequency = useMemo(() => new Uint8Array(256), []);

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) {
      return;
    }

    getFrequencyData(frequency);

    let energySum = 0;
    for (let index = 0; index < frequency.length; index += 1) {
      energySum += frequency[index];
    }
    const energy = energySum / (frequency.length * 255);

    const position = geometry.attributes.position;
    const array = position.array as Float32Array;
    const time = clock.getElapsedTime();

    for (let idx = 0; idx < array.length; idx += 3) {
      const x = base[idx];
      const y = base[idx + 1];
      const z = base[idx + 2];

      const radial = 1 + (energy * 0.45);
      const waveA = Math.sin((x + y + z) * 2.1 + (time * 1.8) + (idx * 0.004)) * 0.08;
      const waveB = Math.cos((x - z) * 3.4 - (time * 1.2)) * 0.05;
      const waveC = Math.sin((y * 2.7) + (time * 2.2)) * (0.03 + energy * 0.04);
      const scale = radial + waveA + waveB + waveC;

      array[idx] = x * scale;
      array[idx + 1] = y * scale;
      array[idx + 2] = z * scale;
    }

    position.needsUpdate = true;

    frameRef.current += 1;
    if (frameRef.current % 8 === 0) {
      geometry.computeVertexNormals();
    }

    const material = mesh.material as THREE.MeshPhysicalMaterial;
    const hue = 0.55 - (energy * 0.18);
    material.color.setHSL(hue, 0.82, 0.56);
    material.emissive.setHSL(0.58 + (energy * 0.12), 0.9, 0.35 + (energy * 0.2));
    material.roughness = 0.28 - (energy * 0.12);
    material.clearcoat = 0.9;
    material.transmission = 0.12 + (energy * 0.15);

    mesh.rotation.y += 0.0015;
    mesh.rotation.x = Math.sin(time * 0.17) * 0.12;
  });

  return (
    <mesh ref={meshRef} geometry={geometry} position={[0, 0.2, 0]}>
      <meshPhysicalMaterial
        color="#4f8cff"
        emissive="#2a3e9f"
        roughness={0.2}
        metalness={0.2}
        clearcoat={0.8}
        clearcoatRoughness={0.18}
        transmission={0.08}
        thickness={0.9}
      />
    </mesh>
  );
}

export const LiquidBlob = memo(function LiquidBlob({ getFrequencyData }: LiquidBlobProps) {
  return (
    <div className="blob-stage" aria-hidden="true">
      <Canvas camera={{ position: [0, 0, 3.6], fov: 50 }} dpr={[1, 1.8]}>
        <ambientLight intensity={0.5} color="#8ab7ff" />
        <directionalLight position={[2, 3, 1]} intensity={1.2} color="#c8daff" />
        <pointLight position={[-2, -1.5, 1]} intensity={1.6} color="#56d4ff" />
        <pointLight position={[2, 1.5, 2]} intensity={1.1} color="#ff9f66" />
        <BlobCore getFrequencyData={getFrequencyData} />
      </Canvas>
      <div className="blob-halo" />
    </div>
  );
});
