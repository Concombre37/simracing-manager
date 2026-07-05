import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';

type Variant = 'dashboard' | 'stations' | 'sessions' | 'servers' | 'login' | 'wizard';
type Mode = 'dust' | 'network' | 'streaks' | 'warp' | 'circuit';

const WIZARD_STEP_COLORS = ['#00d4ff', '#ff6b35', '#22c55e'];

let wizardStepValue = 1;
const wizardListeners = new Set<() => void>();

/** Called by the create-server wizard so the background can tint itself per step. */
export function setWizardBackgroundStep(step: number) {
  wizardStepValue = step;
  wizardListeners.forEach((listener) => listener());
}

function subscribeWizard(cb: () => void) {
  wizardListeners.add(cb);
  return () => wizardListeners.delete(cb);
}

function useWizardStep() {
  return useSyncExternalStore(
    subscribeWizard,
    () => wizardStepValue,
    () => 1,
  );
}

function resolveVariant(pathname: string): Variant {
  if (pathname === '/login') return 'login';
  if (pathname.startsWith('/dedicated-servers/create')) return 'wizard';
  if (pathname.startsWith('/dedicated-servers')) return 'servers';
  if (pathname.startsWith('/stations')) return 'stations';
  if (pathname.startsWith('/en-cours')) return 'sessions';
  return 'dashboard';
}

const THEME: Record<Variant, { colors: [string, string]; mode: Mode }> = {
  dashboard: { colors: ['#ff6b35', '#00d4ff'], mode: 'dust' },
  stations: { colors: ['#00d4ff', '#ff6b35'], mode: 'network' },
  sessions: { colors: ['#ff6b35', '#ffc93c'], mode: 'streaks' },
  servers: { colors: ['#22c55e', '#ff6b35'], mode: 'circuit' },
  login: { colors: ['#ff6b35', '#ff3333'], mode: 'warp' },
  wizard: { colors: ['#00d4ff', '#ff6b35'], mode: 'dust' },
};

export function PageBackground() {
  const location = useLocation();
  const variant = resolveVariant(location.pathname);
  const wizardStep = useWizardStep();
  const theme = THEME[variant];
  const accent =
    variant === 'wizard' ? WIZARD_STEP_COLORS[Math.min(wizardStep - 1, 2)] : theme.colors[0];

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden bg-dark-950">
      <div
        className="absolute inset-0 transition-[background] duration-700 ease-out"
        style={{
          background: `radial-gradient(ellipse 70% 45% at 50% 0%, ${accent}22, transparent 65%)`,
        }}
      />

      <div
        className="absolute -top-1/3 -left-1/4 w-[60vw] h-[60vw] rounded-full blur-3xl opacity-15 animate-blob-drift transition-colors duration-700"
        style={{ backgroundColor: accent }}
      />
      <div
        className="absolute -bottom-1/3 -right-1/4 w-[50vw] h-[50vw] rounded-full blur-3xl opacity-10 animate-blob-drift transition-colors duration-700"
        style={{ backgroundColor: theme.colors[1], animationDelay: '-8s' }}
      />

      <div
        className="absolute inset-0 opacity-[0.08] animate-grid-pan"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      <ParticleField key={variant} mode={theme.mode} colors={theme.colors} accent={accent} />

      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-dark-950/90" />
      <div className="absolute inset-0 bg-gradient-to-r from-dark-950/40 via-transparent to-dark-950/40" />
    </div>
  );
}

interface Point {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

interface Streak {
  x: number;
  y: number;
  len: number;
  speed: number;
  opacity: number;
}

interface WarpParticle {
  angle: number;
  dist: number;
  speed: number;
  prevDist: number;
}

function ParticleField({
  mode,
  colors,
  accent,
}: {
  mode: Mode;
  colors: [string, string];
  accent: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let width = 0;
    let height = 0;
    let raf = 0;
    let frame = 0;

    function resize() {
      width = canvas!.clientWidth;
      height = canvas!.clientHeight;
      canvas!.width = width * dpr;
      canvas!.height = height * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    const rand = (min: number, max: number) => min + Math.random() * (max - min);

    if (mode === 'dust') {
      const count = 60;
      const points: Point[] = Array.from({ length: count }, () => ({
        x: rand(0, width),
        y: rand(0, height),
        vx: rand(-0.08, 0.08),
        vy: rand(-0.15, -0.03),
        r: rand(0.6, 2.2),
      }));

      const draw = () => {
        ctx!.clearRect(0, 0, width, height);
        for (const p of points) {
          p.x += p.vx;
          p.y += p.vy;
          if (p.y < -10) {
            p.y = height + 10;
            p.x = rand(0, width);
          }
          if (p.x < -10) p.x = width + 10;
          if (p.x > width + 10) p.x = -10;

          const grad = ctx!.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 6);
          grad.addColorStop(0, `${accent}aa`);
          grad.addColorStop(1, `${accent}00`);
          ctx!.fillStyle = grad;
          ctx!.beginPath();
          ctx!.arc(p.x, p.y, p.r * 6, 0, Math.PI * 2);
          ctx!.fill();
        }
        raf = requestAnimationFrame(draw);
      };
      raf = requestAnimationFrame(draw);
    } else if (mode === 'network') {
      const count = 26;
      const nodes: Point[] = Array.from({ length: count }, () => ({
        x: rand(0, width),
        y: rand(0, height),
        vx: rand(-0.18, 0.18),
        vy: rand(-0.18, 0.18),
        r: rand(1.5, 3),
      }));
      const maxDist = 160;

      const draw = () => {
        frame++;
        ctx!.clearRect(0, 0, width, height);
        for (const n of nodes) {
          n.x += n.vx;
          n.y += n.vy;
          if (n.x < 0 || n.x > width) n.vx *= -1;
          if (n.y < 0 || n.y > height) n.vy *= -1;
        }
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const dx = nodes[i].x - nodes[j].x;
            const dy = nodes[i].y - nodes[j].y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < maxDist) {
              ctx!.strokeStyle = `${colors[0]}${Math.floor((1 - dist / maxDist) * 60)
                .toString(16)
                .padStart(2, '0')}`;
              ctx!.lineWidth = 1;
              ctx!.beginPath();
              ctx!.moveTo(nodes[i].x, nodes[i].y);
              ctx!.lineTo(nodes[j].x, nodes[j].y);
              ctx!.stroke();
            }
          }
        }
        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i];
          const pulse = (Math.sin(frame * 0.02 + i) + 1) / 2;
          ctx!.fillStyle = i % 5 === 0 ? colors[1] : colors[0];
          ctx!.globalAlpha = 0.4 + pulse * 0.6;
          ctx!.beginPath();
          ctx!.arc(n.x, n.y, n.r + pulse * 1.5, 0, Math.PI * 2);
          ctx!.fill();
          ctx!.globalAlpha = 1;
        }
        raf = requestAnimationFrame(draw);
      };
      raf = requestAnimationFrame(draw);
    } else if (mode === 'streaks') {
      const count = 22;
      const streaks: Streak[] = Array.from({ length: count }, () => ({
        x: rand(0, width),
        y: rand(0, height),
        len: rand(60, 160),
        speed: rand(3, 9),
        opacity: rand(0.08, 0.35),
      }));

      const draw = () => {
        ctx!.clearRect(0, 0, width, height);
        for (const s of streaks) {
          s.x -= s.speed;
          if (s.x + s.len < 0) {
            s.x = width + s.len;
            s.y = rand(0, height);
          }
          const grad = ctx!.createLinearGradient(s.x, s.y, s.x + s.len, s.y);
          grad.addColorStop(0, `${accent}00`);
          grad.addColorStop(
            1,
            `${accent}${Math.floor(s.opacity * 255)
              .toString(16)
              .padStart(2, '0')}`,
          );
          ctx!.strokeStyle = grad;
          ctx!.lineWidth = 1.5;
          ctx!.beginPath();
          ctx!.moveTo(s.x, s.y);
          ctx!.lineTo(s.x + s.len, s.y);
          ctx!.stroke();
        }
        raf = requestAnimationFrame(draw);
      };
      raf = requestAnimationFrame(draw);
    } else if (mode === 'warp') {
      const count = 90;
      const particles: WarpParticle[] = Array.from({ length: count }, () => ({
        angle: rand(0, Math.PI * 2),
        dist: rand(0, 1),
        speed: rand(0.004, 0.012),
        prevDist: 0,
      }));

      const draw = () => {
        ctx!.fillStyle = 'rgba(5,5,8,0.18)';
        ctx!.fillRect(0, 0, width, height);
        const cx = width / 2;
        const cy = height / 2;
        const maxR = Math.hypot(cx, cy);
        for (const p of particles) {
          p.prevDist = p.dist;
          p.dist += p.speed * (0.4 + p.dist * 2);
          if (p.dist > 1) {
            p.dist = 0;
            p.angle = rand(0, Math.PI * 2);
            p.prevDist = 0;
          }
          const r1 = p.prevDist * maxR;
          const r2 = p.dist * maxR;
          const x1 = cx + Math.cos(p.angle) * r1;
          const y1 = cy + Math.sin(p.angle) * r1;
          const x2 = cx + Math.cos(p.angle) * r2;
          const y2 = cy + Math.sin(p.angle) * r2;
          const alpha = Math.min(1, p.dist * 1.4);
          ctx!.strokeStyle = `${accent}${Math.floor(alpha * 200)
            .toString(16)
            .padStart(2, '0')}`;
          ctx!.lineWidth = 1 + p.dist * 1.5;
          ctx!.beginPath();
          ctx!.moveTo(x1, y1);
          ctx!.lineTo(x2, y2);
          ctx!.stroke();
        }
        raf = requestAnimationFrame(draw);
      };
      raf = requestAnimationFrame(draw);
    } else if (mode === 'circuit') {
      let path: { x: number; y: number }[] = [];
      const buildPath = () => {
        path = [];
        const cx = width / 2;
        const cy = height / 2;
        const rx = width * 0.42;
        const ry = height * 0.32;
        const samples = 220;
        for (let i = 0; i < samples; i++) {
          const t = (i / samples) * Math.PI * 2;
          const x = cx + Math.sin(t * 1) * rx * 0.9 + Math.sin(t * 3 + 1) * rx * 0.12;
          const y = cy + Math.sin(t * 2 + 1.3) * ry * 0.55 + Math.cos(t) * ry * 0.4;
          path.push({ x, y });
        }
      };
      buildPath();

      const runners = [0, 0.33, 0.66].map((offset) => ({ t: offset, speed: rand(0.0009, 0.0013) }));

      const draw = () => {
        ctx!.clearRect(0, 0, width, height);
        ctx!.strokeStyle = `${colors[0]}22`;
        ctx!.lineWidth = 2;
        ctx!.beginPath();
        path.forEach((pt, i) => (i === 0 ? ctx!.moveTo(pt.x, pt.y) : ctx!.lineTo(pt.x, pt.y)));
        ctx!.closePath();
        ctx!.stroke();

        for (const runner of runners) {
          runner.t = (runner.t + runner.speed) % 1;
          const idx = Math.floor(runner.t * path.length);
          const tailLen = 26;
          for (let k = 0; k < tailLen; k++) {
            const pIdx = (idx - k + path.length) % path.length;
            const pt = path[pIdx];
            const alpha = 1 - k / tailLen;
            ctx!.fillStyle = `${accent}${Math.floor(alpha * 200)
              .toString(16)
              .padStart(2, '0')}`;
            ctx!.beginPath();
            ctx!.arc(pt.x, pt.y, 2.5 * alpha + 0.5, 0, Math.PI * 2);
            ctx!.fill();
          }
        }
        raf = requestAnimationFrame(draw);
      };
      raf = requestAnimationFrame(draw);

      const onResize = () => {
        resize();
        buildPath();
      };
      window.removeEventListener('resize', resize);
      window.addEventListener('resize', onResize);
      return () => {
        cancelAnimationFrame(raf);
        window.removeEventListener('resize', onResize);
      };
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [mode, colors, accent]);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-40" />;
}
