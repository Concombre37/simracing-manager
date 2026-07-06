interface CircularGaugeProps {
  value: number;
  max: number;
  label: string;
  unit: string;
  color?: string;
  size?: number;
}

export function CircularGauge({
  value,
  max,
  label,
  unit,
  color = '#00d4ff',
  size = 160,
}: CircularGaugeProps) {
  const clamped = Math.max(0, Math.min(value, max));
  const ratio = max > 0 ? clamped / max : 0;
  const radius = (size - 24) / 2;
  const stroke = 10;
  const center = size / 2;
  const startAngle = 135;
  const endAngle = 405;
  const sweep = endAngle - startAngle;
  const angle = startAngle + ratio * sweep;

  const polar = (deg: number, r: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return {
      x: center + r * Math.cos(rad),
      y: center + r * Math.sin(rad),
    };
  };

  const start = polar(startAngle, radius);
  const end = polar(endAngle, radius);
  const largeArc = sweep > 180 ? 1 : 0;
  const trackPath = `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`;

  const valueEnd = polar(angle, radius);
  const valueLargeArc = ratio * sweep > 180 ? 1 : 0;
  const valuePath = `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${valueLargeArc} 1 ${valueEnd.x} ${valueEnd.y}`;

  const needleEnd = polar(angle, radius - 6);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="block">
        <defs>
          <linearGradient id={`gaugeGradient-${label}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={color} />
            <stop offset="70%" stopColor={color} />
            <stop offset="100%" stopColor="#ff2d2d" />
          </linearGradient>
        </defs>
        <path
          d={trackPath}
          fill="none"
          stroke="#1a1a25"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        <path
          d={valuePath}
          fill="none"
          stroke={`url(#gaugeGradient-${label})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 6px ${color}99)` }}
        />
        <circle cx={center} cy={center} r={radius - 16} fill="#0a0a0f" />
        <circle
          cx={center}
          cy={center}
          r={radius - 16}
          fill="none"
          stroke="#252536"
          strokeWidth={1}
        />
        <line
          x1={center}
          y1={center}
          x2={needleEnd.x}
          y2={needleEnd.y}
          stroke="#fff"
          strokeWidth={2}
          strokeLinecap="round"
        />
        <circle cx={center} cy={center} r={4} fill={color} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-white leading-none">{Math.round(clamped)}</span>
        <span className="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5">{unit}</span>
      </div>
      <div className="absolute -bottom-5 left-0 right-0 text-center">
        <span className="text-xs text-gray-400 uppercase tracking-wider">{label}</span>
      </div>
    </div>
  );
}
