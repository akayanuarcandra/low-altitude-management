'use client'
import { useRef } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { useGLTF, OrbitControls } from "@react-three/drei"

function Drone() {
    const { scene } = useGLTF("/models/drone.glb")
    const meshRef = useRef<any>()

    useFrame(() => {
        if (meshRef.current) {
            meshRef.current.rotation.y += 0.001
        }
    })

    return <primitive ref={meshRef} object={scene} scale={4} rotation={[0, 0, 0]} />
}

export default function DroneModel() {
    return (
        <Canvas 
            className="w-full h-full"
            camera={{ position: [0, 0, 2], fov: 50}}
        >
            <ambientLight intensity={2} />
            <directionalLight position={[10, 10, 5]} />
            <Drone />
            <OrbitControls enableZoom={false} enablePan={false} />
        </Canvas>
    )
}