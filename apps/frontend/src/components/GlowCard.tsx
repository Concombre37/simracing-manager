import { useRef, type ReactNode } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';

interface GlowCardProps {
  children: ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  glowColor?: string;
  tilt?: boolean;
  onClick?: () => void;
}

const PADDING = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

export function GlowCard({
  children,
  className = '',
  padding = 'md',
  glowColor = '#ff6b35',
  tilt = true,
  onClick,
}: GlowCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.5);

  const rotateX = useSpring(useTransform(my, [0, 1], [7, -7]), { stiffness: 260, damping: 24 });
  const rotateY = useSpring(useTransform(mx, [0, 1], [-7, 7]), { stiffness: 260, damping: 24 });

  const glowBackground = useTransform([mx, my], (latest) => {
    const [lx, ly] = latest as [number, number];
    return `radial-gradient(360px circle at ${lx * 100}% ${ly * 100}%, ${glowColor}4d, transparent 70%)`;
  });

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!tilt || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    mx.set((e.clientX - rect.left) / rect.width);
    my.set((e.clientY - rect.top) / rect.height);
  }

  function handleMouseLeave() {
    mx.set(0.5);
    my.set(0.5);
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      style={{
        rotateX: tilt ? rotateX : 0,
        rotateY: tilt ? rotateY : 0,
        transformPerspective: 900,
      }}
      whileHover={{ scale: 1.015, y: -4 }}
      whileTap={onClick ? { scale: 0.985 } : undefined}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
      className={`group relative rounded-2xl h-full ${onClick ? 'cursor-pointer' : ''}`}
    >
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -inset-px rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-0"
        style={{ background: glowBackground }}
      />
      <div
        className={`relative z-10 h-full bg-dark-800/80 rounded-2xl border border-dark-600 group-hover:border-dark-500 shadow-xl shadow-black/20 backdrop-blur-sm transition-colors duration-300 ${PADDING[padding]} ${className}`}
      >
        {children}
      </div>
    </motion.div>
  );
}
