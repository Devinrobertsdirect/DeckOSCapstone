import { useEffect, useRef } from "react";
import { useVisualMode } from "@/contexts/VisualMode";
import { useActivityLevel } from "@/contexts/WebSocketContext";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  opacity: number;
  char: string;
  size: number;
  trail: number;
  tier: "bg" | "mid" | "accent";
  charTimer: number;
}

interface Streak {
  x: number;
  y: number;
  length: number;
  speed: number;
  opacity: number;
  life: number;
  maxLife: number;
}

const DATA_CHARS  = "01アイウエオカキクケコサシスセソタチツテトナニヌネノ<>[]{}|/\\+-=_~·";
const COORD_CHARS = "0123456789ABCDEF.,";

function randomChar(tier: Particle["tier"]) {
  const pool = tier === "accent" ? COORD_CHARS : DATA_CHARS;
  return pool[Math.floor(Math.random() * pool.length)];
}

function readPrimaryRgb(): string {
  const val = getComputedStyle(document.documentElement)
    .getPropertyValue("--primary-rgb")
    .trim();
  return val || "63, 132, 243";
}

export function ParticleOverlay() {
  const { mode } = useVisualMode();
  const activity = useActivityLevel();

  const canvasRef      = useRef<HTMLCanvasElement>(null);
  const rafRef         = useRef<number>(0);
  const particlesRef   = useRef<Particle[]>([]);
  const streaksRef     = useRef<Streak[]>([]);
  /** Live activity level (0–1) readable inside the animation loop */
  const activityRef    = useRef<number>(0);
  /** Smoothed multiplier applied to particle speed */
  const multiplierRef  = useRef<number>(1);

  // Keep the ref in sync whenever React re-renders with a new activity value
  useEffect(() => {
    activityRef.current = activity;
  }, [activity]);

  useEffect(() => {
    if (mode !== "cinematic") return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let cachedRgb = readPrimaryRgb();

    const colorObs = new MutationObserver(() => { cachedRgb = readPrimaryRgb(); });
    colorObs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-color"] });

    function resize() {
      if (!canvas) return;
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      initParticles();
    }

    function spawnParticle(w: number, h: number, randomY = false): Particle {
      // 60% background, 30% mid, 10% accent
      const r = Math.random();
      const tier: Particle["tier"] = r < 0.60 ? "bg" : r < 0.90 ? "mid" : "accent";

      const tiers = {
        bg:     { opacity: [0.04, 0.12], speed: [0.25, 0.7],  size: [7,  10], trail: [2, 5] },
        mid:    { opacity: [0.10, 0.24], speed: [0.5,  1.4],  size: [9,  13], trail: [3, 7] },
        accent: { opacity: [0.30, 0.55], speed: [0.8,  1.8],  size: [10, 14], trail: [4, 9] },
      };
      const t = tiers[tier];

      return {
        x: Math.random() * w,
        y: randomY ? Math.random() * h : -20,
        vx: (Math.random() - 0.5) * 0.15,
        vy: t.speed[0] + Math.random() * (t.speed[1] - t.speed[0]),
        opacity: t.opacity[0] + Math.random() * (t.opacity[1] - t.opacity[0]),
        char: randomChar(tier),
        size: t.size[0] + Math.random() * (t.size[1] - t.size[0]),
        trail: Math.floor(t.trail[0] + Math.random() * (t.trail[1] - t.trail[0])),
        tier,
        charTimer: Math.floor(Math.random() * 40),
      };
    }

    function spawnStreak(w: number, h: number): Streak {
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        length: 60 + Math.random() * 140,
        speed: 4 + Math.random() * 8,
        opacity: 0.08 + Math.random() * 0.12,
        life: 0,
        maxLife: 30 + Math.random() * 20,
      };
    }

    function initParticles() {
      if (!canvas) return;
      const area = canvas.width * canvas.height;
      const count = Math.floor(area / 9000);
      particlesRef.current = Array.from({ length: Math.max(count, 32) }, () =>
        spawnParticle(canvas.width, canvas.height, true)
      );
    }

    let frameCount = 0;

    function draw() {
      if (!canvas || !ctx) return;
      frameCount++;

      // ── Activity multiplier ───────────────────────────────────────────
      // Target: 1.0 at idle → up to 3.5x at full activity (smoothly lerped)
      const targetMultiplier = 1 + activityRef.current * 2.5;
      multiplierRef.current += (targetMultiplier - multiplierRef.current) * 0.04;
      const mult = multiplierRef.current;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const w = canvas.width;
      const h = canvas.height;
      const rgb = cachedRgb;

      // ── Horizontal streaks ───────────────────────────────────────────
      // Spawn interval shrinks from 180 frames (idle) down to 60 frames (full activity)
      const streakInterval = Math.max(60, Math.round(180 - activityRef.current * 120));
      if (frameCount % streakInterval === 0 && Math.random() < 0.7) {
        streaksRef.current.push(spawnStreak(w, h));
      }

      streaksRef.current = streaksRef.current.filter((s) => {
        s.x += s.speed * mult;
        s.life++;
        const progress = s.life / s.maxLife;
        const fadeOut  = progress > 0.7 ? 1 - (progress - 0.7) / 0.3 : 1;
        const alpha    = s.opacity * fadeOut;

        const grad = ctx.createLinearGradient(s.x - s.length, s.y, s.x, s.y);
        grad.addColorStop(0, `rgba(${rgb}, 0)`);
        grad.addColorStop(0.6, `rgba(${rgb}, ${alpha})`);
        grad.addColorStop(1, `rgba(${rgb}, 0)`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(s.x - s.length, s.y);
        ctx.lineTo(s.x, s.y);
        ctx.stroke();

        return s.x - s.length < w && s.life < s.maxLife;
      });

      // ── Falling character particles ───────────────────────────────────
      const particles = particlesRef.current;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        p.charTimer--;
        if (p.charTimer <= 0) {
          p.char = randomChar(p.tier);
          p.charTimer = p.tier === "accent"
            ? Math.floor(20 + Math.random() * 40)
            : Math.floor(5  + Math.random() * 25);
        }

        ctx.font = `${p.size}px 'JetBrains Mono', monospace`;

        for (let t = 0; t < p.trail; t++) {
          const trailY = p.y - t * (p.size * 1.35);
          const trailOpacity = p.opacity * Math.pow(1 - t / p.trail, 1.8);
          ctx.fillStyle = `rgba(${rgb}, ${trailOpacity})`;
          ctx.fillText(p.char, p.x, trailY);
        }

        // Leading char brighter for accent tier
        if (p.tier === "accent") {
          ctx.fillStyle = `rgba(${rgb}, ${Math.min(p.opacity * 1.8, 0.9)})`;
          ctx.fillText(p.char, p.x, p.y);
        }

        p.x += p.vx;
        // Scale vertical speed by the smoothed multiplier
        p.y += p.vy * mult;

        if (p.y - p.trail * p.size * 1.35 > h || p.x < -20 || p.x > w + 20) {
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
      colorObs.disconnect();
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
