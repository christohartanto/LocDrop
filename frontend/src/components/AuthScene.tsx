// Animated background for the opening screen: a sunny adventure landscape with drifting clouds,
// a walker following a trail, and note pins dropping onto the hills. Pure SVG + CSS (no downloads),
// and it stands still for people who prefer reduced motion.

const TRAIL = "M-20 250 C 60 200, 120 285, 200 235 S 330 170, 420 225";

function Pin({ x, y, delay, kind }: { x: number; y: number; delay: number; kind: "note" | "fire" | "anon" }) {
  const fill = kind === "fire" ? "#ff9f1c" : kind === "anon" ? "#9b7bff" : "#ff6b4a";
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse className="scene__pinshadow" style={{ animationDelay: `${delay}s` }} cx="0" cy="2" rx="9" ry="3" fill="#2d6a2e" opacity="0.25" />
      <g className="scene__pin" style={{ animationDelay: `${delay}s` }}>
        <path d="M0 0 C -14 -16 -15 -34 0 -38 C 15 -34 14 -16 0 0 Z" fill={fill} stroke="#fff" strokeWidth="3" />
        <circle cx="0" cy="-24" r="6" fill="#fff" />
      </g>
    </g>
  );
}

export function AuthScene() {
  return (
    <div className="scene" aria-hidden="true">
      <div className="scene__sun" />
      <div className="scene__cloud scene__cloud--1" />
      <div className="scene__cloud scene__cloud--2" />
      <div className="scene__cloud scene__cloud--3" />
      <svg className="scene__land" viewBox="0 0 400 320" preserveAspectRatio="xMidYMax slice">
        {/* far hills */}
        <path d="M0 150 C 70 95, 130 120, 200 140 S 330 80, 400 125 V320 H0 Z" fill="#a9e58c" />
        {/* tiny far-away town */}
        <g fill="#f3f9e6" stroke="#cfe6b8" strokeWidth="1.5">
          <rect x="262" y="96" width="14" height="22" rx="2" />
          <rect x="279" y="86" width="12" height="32" rx="2" />
          <rect x="294" y="100" width="16" height="18" rx="2" />
        </g>
        {/* middle hill */}
        <path d="M0 205 C 90 150, 170 215, 260 180 S 360 165, 400 190 V320 H0 Z" fill="#8fdb72" />
        {/* front hill */}
        <path d="M0 255 C 80 215, 150 290, 240 245 S 350 205, 400 240 V320 H0 Z" fill="#74cf5a" />
        {/* trail */}
        <path d={TRAIL} fill="none" stroke="#fffbe6" strokeWidth="7" strokeLinecap="round" strokeDasharray="2 14" />
        {/* trees */}
        {[
          [36, 228],
          [118, 262],
          [352, 214],
        ].map(([x, y]) => (
          <g key={`${x}-${y}`} transform={`translate(${x} ${y})`}>
            <rect x="-2" y="-6" width="4" height="10" rx="2" fill="#8a5a3c" />
            <circle cx="0" cy="-14" r="11" fill="#3fae49" />
          </g>
        ))}
        {/* dropped notes */}
        <Pin x={88} y={196} delay={0.2} kind="note" />
        <Pin x={300} y={186} delay={1.6} kind="fire" />
        <Pin x={206} y={252} delay={3.0} kind="anon" />
        {/* walker following the trail, with a 100 m-style range ring */}
        <g>
          <animateMotion dur="16s" repeatCount="indefinite" path={TRAIL} rotate="0" />
          <circle r="20" fill="#fff" opacity="0.28" className="scene__range" />
          <circle r="8" fill="#2f80ed" stroke="#fff" strokeWidth="3" />
        </g>
      </svg>
    </div>
  );
}
