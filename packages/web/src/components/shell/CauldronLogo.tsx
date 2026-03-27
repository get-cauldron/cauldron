'use client';

interface CauldronLogoProps {
  size?: number;
  animate?: boolean;
  className?: string;
}

export function CauldronLogo({ size = 32, animate = false, className }: CauldronLogoProps) {
  const half = size / 2;
  const outerR = size * 0.44;
  const innerR = size * 0.30;
  const coreR = size * 0.16;

  function hexPoints(cx: number, cy: number, r: number): string {
    const pts: string[] = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 6;
      pts.push(`${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`);
    }
    return pts.join(' ');
  }

  return (
    <>
      {animate && (
        <style>{`
          @keyframes cauldron-glow {
            0%, 100% { filter: drop-shadow(0 0 4px #f5a623); }
            50% { filter: drop-shadow(0 0 12px #f5a623); }
          }
          .cauldron-logo-animate {
            animation: cauldron-glow 2000ms ease-in-out infinite;
          }
        `}</style>
      )}
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`${animate ? 'cauldron-logo-animate' : ''} ${className ?? ''}`}
        aria-label="Cauldron logo"
        role="img"
      >
        {/* Outer hexagon ring */}
        <polygon
          points={hexPoints(half, half, outerR)}
          stroke="#3d5166"
          strokeWidth="1.5"
          fill="none"
        />
        {/* Inner hexagon ring */}
        <polygon
          points={hexPoints(half, half, innerR)}
          stroke="#6b8399"
          strokeWidth="1"
          fill="none"
        />
        {/* Amber core */}
        <circle
          cx={half}
          cy={half}
          r={coreR}
          fill="#f5a623"
        />
      </svg>
    </>
  );
}
