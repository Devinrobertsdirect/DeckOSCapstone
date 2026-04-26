import { useEffect, useRef } from "react";
import { useVisualMode } from "@/contexts/VisualMode";

interface Particle {
  x: number;
  y: number;
  speed: number;
  opacity: number;
  char: string;
  size: number;
  trail: number;
}

const DATA_CHARS = "01アイウエオカキクケコサシスセソタチツテトナニヌネノ<>[]{}|/\\+-=_~";

function randomChar() {
  return DATA_CHARS[Math.floor(Math.random() * DATA_CHARS.length)];
}

function readPrimaryRgb(): string {
  const val = getComputedStyle(document.documentElement)
    .getPropertyValue("--primary-rgb")
    .trim();
  return val || "63, 132, 243";
}

export function ParticleOverlay() {
  const { mode } = useVisualMode();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);

  useEffect(() => {
    if (mode !== "cinematic") return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let cachedRgb = readPrimaryRgb();

    const colorObserver = new MutationObserver(() => {
      cachedRgb = readPrimaryRgb();
    });
    colorObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-color"],
    });

    function resize() {
      if (!canvas) return;
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      initParticles();
    }

    function initParticles() {
      if (!canvas) return;
      const count = Math.floor((canvas.width * canvas.height) / 18000);
      particlesRef.current = Array.from({ length: Math.max(count, 18) }, () =>
        spawnParticle(canvas.width, canvas.height, true)
      );
    }

    function spawnParticle(w: number, h: number, randomY = false): Particle {
      return {
        x: Math.random() * w,
        y: randomY ? Math.random() * h : -20,
        speed: 0.4 + Math.random() * 1.1,
        opacity: 0.08 + Math.random() * 0.18,
        char: randomChar(),
        size: 9 + Math.random() * 5,
        trail: Math.floor(3 + Math.random() * 6),
      };
    }

    function draw() {
      if (!canvas || !ctx) return;

      const rgb = cachedRgb;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const particles = particlesRef.current;
      const w = canvas.width;
      const h = canvas.height;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        ctx.font = `${p.size}px 'JetBrains Mono', monospace`;

        for (let t = 0; t < p.trail; t++) {
          const trailY = p.y - t * (p.size * 1.4);
          const trailOpacity = p.opacity * (1 - t / p.trail);
          ctx.fillStyle = `rgba(${rgb}, ${trailOpacity})`;
          ctx.fillText(p.char, p.x, trailY);
        }

        p.y += p.speed;

        if (Math.random() < 0.02) {
          p.char = randomChar();
        }

        if (p.y - p.trail * p.size * 1.4 > h) {
          particles[i] = spawnParticle(w, h, false);
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    }

    resize();
    rafRef.current = requestAnimationFrame(draw);

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      colorObserver.disconnect();
    };
  }, [mode]);

  if (mode !== "cinematic") return null;

  return (
    <canvas
      ref={canvasRef}
      className="particle-overlay"
      aria-hidden="true"
    />
  );
}
