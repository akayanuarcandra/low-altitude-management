'use client';
import { Canvas } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { div } from "three/src/nodes/math/OperatorNode.js";

function DroneModel() {
    //load the GLB model using useGLTF hook
    const { scene } = useGLTF('/models/drone.glb');

    return (
        <primitive
            object={scene} // Render the loaded GLB model as a primitive object in the scene
            scale={12} // Adjust the scale as needed
            position={[0, -0.5, 0]} // Position the model at the origin
        />
    );
}

export default function Drone3DModel() {
    return (
        <div className="w-full h-full overflow-hidden">
            <Canvas camera={{ position: [5, 5, 5], fov: 25 }}>
                { /* Lighting */}
                <ambientLight intensity={2} />
                <directionalLight position={[10, 10, 5]} intensity={1} />

                { /* Render the Drone Model */}
                <DroneModel />

                { /* Add orbit controls for better viewing */}
                <OrbitControls
                    enableZoom={false}
                    enablePan={false}
                    autoRotate={true}
                    autoRotateSpeed={0.5}
                />
            </Canvas>
        </div>
    );
}