import React from "react";

interface DeskhiveIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
  className?: string;
}

export function DeskhiveIcon({ size = 28, className = "", ...props }: DeskhiveIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <defs>
        {/* Main vibrant gradient */}
        <linearGradient id="dh-grad-primary" x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#06b6d4" />
          <stop offset="35%" stopColor="#3b82f6" />
          <stop offset="70%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>

        {/* Specular glass reflection */}
        <linearGradient id="dh-glass-sheen" x1="12" y1="6" x2="36" y2="38" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.8" />
          <stop offset="50%" stopColor="#ffffff" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>

        {/* Luminous Core Glow */}
        <linearGradient id="dh-grad-core" x1="18" y1="18" x2="30" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>

        {/* Soft shadow filter */}
        <filter id="dh-shadow" x="0" y="0" width="48" height="48" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#4f46e5" floodOpacity="0.25" />
        </filter>
      </defs>

      {/* Outer Hexagon 1 (Top) */}
      <path
        d="M24 4L38 12.08V28.25L24 36.33L10 28.25V12.08L24 4Z"
        fill="url(#dh-grad-primary)"
        filter="url(#dh-shadow)"
      />

      {/* Glass Inner Facet - Top Hex Cell */}
      <path
        d="M24 7.5L34.5 13.56V25.69L24 31.75L13.5 25.69V13.56L24 7.5Z"
        fill="#ffffff"
        fillOpacity="0.18"
        stroke="url(#dh-glass-sheen)"
        strokeWidth="1.2"
      />

      {/* Hexagonal Hive Connection Grid Lines */}
      <path
        d="M24 7.5V19.5M24 31.75V19.5M13.5 25.69L24 19.5M34.5 13.56L24 19.5"
        stroke="#ffffff"
        strokeWidth="1.2"
        strokeOpacity="0.45"
        strokeLinecap="round"
      />

      {/* Central Hive Cell - Workspace Core Node */}
      <polygon
        points="24,14.5 29,17.4 29,23.2 24,26.1 19,23.2 19,17.4"
        fill="url(#dh-grad-core)"
        stroke="#ffffff"
        strokeWidth="1.2"
        strokeOpacity="0.9"
      />

      {/* Specular Glint Highlight */}
      <circle cx="21.5" cy="17" r="1.2" fill="#ffffff" fillOpacity="0.95" />
    </svg>
  );
}

export function DeskhiveBrand({
  iconSize = 28,
  className = "",
  showTagline = false,
}: {
  iconSize?: number;
  className?: string;
  showTagline?: boolean;
}) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div className="relative flex-shrink-0 flex items-center justify-center p-1 rounded-xl bg-gradient-to-tr from-cyan-500/10 via-indigo-500/10 to-purple-500/10 border border-white/80 dark:border-white/10 shadow-[0_2px_12px_rgba(99,102,241,0.18)] backdrop-blur-md">
        <DeskhiveIcon size={iconSize} />
      </div>
      <div className="flex flex-col">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-sm tracking-tight bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-800 dark:from-white dark:via-indigo-200 dark:to-slate-200 bg-clip-text text-transparent">
            Deskhive
          </span>
          <span className="text-[10px] bg-indigo-50/90 text-indigo-600 border border-indigo-200/80 dark:bg-indigo-950/70 dark:text-indigo-300 dark:border-indigo-800/80 px-1.5 py-0.2 rounded font-mono font-semibold shadow-xs">
            v1.2
          </span>
        </div>
        {showTagline && (
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
            AI Workspace & Multi-Agent Hive
          </span>
        )}
      </div>
    </div>
  );
}
