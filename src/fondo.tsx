import './fondo.css'
import { Warp } from '@paper-design/shaders-react'

interface FondoProps {
    className?: string
}

export default function Fondo({ className }: FondoProps) {
    return (
        <div className={['shader-background', className].filter(Boolean).join(' ')} aria-hidden="true">
            <Warp
                style={{ height: '100%', width: '100%' }}
                proportion={1.45}
                softness={4}
                distortion={0.5}
                swirl={0.8}
                swirlIterations={10}
                shape="checks"
                shapeScale={0.5}
                scale={1}
                rotation={0}
                speed={1.5}
                colors={['hsl(0, 0%, 100%)', 'hsl(0, 0%, 82%)', 'hsl(60, 0%, 50%)', 'hsl(60, 2%, 11%)']}
            />
        </div>
    )
}
