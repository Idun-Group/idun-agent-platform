import { useEffect, useRef } from 'react';
import styled from 'styled-components';

const COLORS = ['#0C5CAB', '#5B9BD5', '#34d399', '#60a5fa', '#fbbf24', '#f472b6', '#10b981'];
const PARTICLE_COUNT = 80;
const DURATION_MS = 3000;

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    color: string;
    size: number;
    rotation: number;
    rotationSpeed: number;
    shape: 'rect' | 'circle';
    opacity: number;
}

export default function Confetti() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;

        const particles: Particle[] = Array.from({ length: PARTICLE_COUNT }, () => ({
            x: canvas.width / 2 + (Math.random() - 0.5) * canvas.width * 0.4,
            y: canvas.height * 0.3,
            vx: (Math.random() - 0.5) * 12,
            vy: -Math.random() * 14 - 4,
            color: COLORS[Math.floor(Math.random() * COLORS.length)],
            size: Math.random() * 6 + 3,
            rotation: Math.random() * Math.PI * 2,
            rotationSpeed: (Math.random() - 0.5) * 0.3,
            shape: Math.random() > 0.5 ? 'rect' : 'circle',
            opacity: 1,
        }));

        const startTime = performance.now();
        let rafId: number;

        const animate = (now: number) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / DURATION_MS, 1);

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            for (const p of particles) {
                p.x += p.vx;
                p.vy += 0.25; // gravity
                p.y += p.vy;
                p.rotation += p.rotationSpeed;
                p.vx *= 0.99;
                p.opacity = 1 - Math.pow(progress, 2);

                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rotation);
                ctx.globalAlpha = p.opacity;
                ctx.fillStyle = p.color;

                if (p.shape === 'rect') {
                    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
                } else {
                    ctx.beginPath();
                    ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
                    ctx.fill();
                }

                ctx.restore();
            }

            if (progress < 1) {
                rafId = requestAnimationFrame(animate);
            }
        };

        rafId = requestAnimationFrame(animate);

        return () => cancelAnimationFrame(rafId);
    }, []);

    return <Canvas ref={canvasRef} />;
}

const Canvas = styled.canvas`
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 10;
`;
