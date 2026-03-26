'use client';

import { useEffect, useRef } from 'react';

export default function DotGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouse = useRef({ x: -1000, y: -1000 });
  const raf = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const GAP = 14;
    const DOT_R = 1.2;
    const GLOW_R = 180;
    const BASE_ALPHA = 0.12;
    const MAX_ALPHA = 0.55;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const getThemeColor = () => {
      const theme = document.documentElement.getAttribute('data-theme');
      return theme === 'light'
        ? { r: 27, g: 51, b: 75 }
        : { r: 130, g: 135, b: 145 };
    };

    const draw = () => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      ctx.clearRect(0, 0, w, h);

      const { r, g, b } = getThemeColor();
      const mx = mouse.current.x;
      const my = mouse.current.y;

      const cols = Math.ceil(w / GAP) + 1;
      const rows = Math.ceil(h / GAP) + 1;
      const offsetX = (w - (cols - 1) * GAP) / 2;
      const offsetY = (h - (rows - 1) * GAP) / 2;

      for (let row = 0; row < rows; row++) {
        const y = offsetY + row * GAP;
        for (let col = 0; col < cols; col++) {
          const x = offsetX + col * GAP;

          const dx = x - mx;
          const dy = y - my;
          const dist = Math.sqrt(dx * dx + dy * dy);

          let alpha = BASE_ALPHA;
          if (dist < GLOW_R) {
            const t = 1 - dist / GLOW_R;
            alpha = BASE_ALPHA + (MAX_ALPHA - BASE_ALPHA) * t * t;
          }

          ctx.beginPath();
          ctx.arc(x, y, DOT_R, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
          ctx.fill();
        }
      }

      raf.current = requestAnimationFrame(draw);
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.current.x = e.clientX - rect.left;
      mouse.current.y = e.clientY - rect.top;
    };

    resize();
    raf.current = requestAnimationFrame(draw);

    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      cancelAnimationFrame(raf.current);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full pointer-events-none z-0"
    />
  );
}
