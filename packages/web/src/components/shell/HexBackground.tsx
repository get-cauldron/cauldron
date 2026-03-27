'use client';

export function HexBackground() {
  // Hexagon pattern: flat-top hex tile at ~40px per cell
  // SVG pattern approach for tiling without canvas
  const hexSize = 40;
  const hexWidth = hexSize * 2;
  const hexHeight = hexSize * Math.sqrt(3);
  const patternWidth = hexWidth * 1.5;
  const patternHeight = hexHeight;

  // Points for a flat-top hexagon centered at 0,0
  function hexPoints(cx: number, cy: number, r: number): string {
    const pts: string[] = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i;
      pts.push(`${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`);
    }
    return pts.join(' ');
  }

  return (
    <div
      className="fixed inset-0 overflow-hidden"
      style={{ zIndex: 0, pointerEvents: 'none' }}
      aria-hidden="true"
    >
      <svg
        className="absolute inset-0 w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
        style={{ opacity: 0.04 }}
      >
        <defs>
          <pattern
            id="hex-pattern"
            x="0"
            y="0"
            width={patternWidth}
            height={patternHeight}
            patternUnits="userSpaceOnUse"
          >
            {/* First hexagon in pattern */}
            <polygon
              points={hexPoints(hexSize / 2, hexHeight / 2, hexSize / 2 - 1)}
              fill="none"
              stroke="#1a2330"
              strokeWidth="1"
            />
            {/* Second hexagon offset */}
            <polygon
              points={hexPoints(hexSize * 1.5, 0, hexSize / 2 - 1)}
              fill="none"
              stroke="#1a2330"
              strokeWidth="1"
            />
            <polygon
              points={hexPoints(hexSize * 1.5, hexHeight, hexSize / 2 - 1)}
              fill="none"
              stroke="#1a2330"
              strokeWidth="1"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#hex-pattern)" />
      </svg>
    </div>
  );
}
