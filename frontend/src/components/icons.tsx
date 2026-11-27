// Inline SVG icons (no icon library needed).

type P = { size?: number };
const base = (size = 22) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export const PinIcon = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12Z" />
    <circle cx="12" cy="9" r="2.5" />
  </svg>
);
export const PlusIcon = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const NotesIcon = ({ size }: P) => (
  <svg {...base(size)}>
    <rect x="4" y="3" width="16" height="18" rx="3" />
    <path d="M8 8h8M8 12h8M8 16h5" />
  </svg>
);
export const RefreshIcon = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" />
  </svg>
);
export const BackIcon = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M15 18l-6-6 6-6" />
  </svg>
);
export const EyeIcon = ({ size, off }: P & { off?: boolean }) => (
  <svg {...base(size)}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
    {off && <path d="M3 3l18 18" />}
  </svg>
);
export const InfoIcon = ({ size }: P) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8h.01M11 12h1v5h1" />
  </svg>
);
export const LogoutIcon = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3M16 17l5-5-5-5M21 12H9" />
  </svg>
);
export const CrosshairIcon = ({ size }: P) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="6" />
    <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
  </svg>
);
export const ListIcon = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
  </svg>
);
export const GroupIcon = ({ size }: P) => (
  <svg {...base(size)}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.2a6.5 6.5 0 0 1 3.5 5.8" />
  </svg>
);
export const CopyIcon = ({ size }: P) => (
  <svg {...base(size)}>
    <rect x="9" y="9" width="11" height="11" rx="2.5" />
    <path d="M5 15H4a1 1 0 0 1-1-1V5a2 2 0 0 1 2-2h9a1 1 0 0 1 1 1v1" />
  </svg>
);
export const MapIcon = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5L9 4Z" />
    <path d="M9 4v13.5M15 6.5V20" />
  </svg>
);
