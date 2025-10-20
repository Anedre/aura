"use client";

import React from "react";

type IconProps = { className?: string; size?: number };

const Svg = ({ children, className, size = 20 }: React.PropsWithChildren<IconProps>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    {children}
  </svg>
);

export const HomeIcon = (p: IconProps) => (
  <Svg {...p}><path d="M3 10.5 12 3l9 7.5"/><path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9"/></Svg>
);

export const FeedIcon = (p: IconProps) => (
  <Svg {...p}><path d="M4 5h16M4 12h16M4 19h10"/></Svg>
);

export const DemoIcon = (p: IconProps) => (
  <Svg {...p}><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 20h8"/><path d="M10 12h4"/></Svg>
);

export const RiskIcon = (p: IconProps) => (
  <Svg {...p}><path d="M12 2v6"/><path d="M12 10a6 6 0 1 0 6 6"/><path d="M12 14v4"/></Svg>
);

export const InvestIcon = (p: IconProps) => (
  <Svg {...p}><path d="M3 12h18"/><path d="M7 8l-4 4 4 4"/><path d="M21 8l-4 4 4 4"/></Svg>
);

export const SimIcon = (p: IconProps) => (
  <Svg {...p}><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M7 12h4M7 9h6M7 15h8"/></Svg>
);

export const UserIcon = (p: IconProps) => (
  <Svg {...p}><path d="M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"/><path d="M4 20a8 8 0 0 1 16 0"/></Svg>
);

export const MenuIcon = (p: IconProps) => (
  <Svg {...p}><path d="M4 6h16M4 12h16M4 18h16"/></Svg>
);

export const CloseIcon = (p: IconProps) => (
  <Svg {...p}><path d="M6 6l12 12M18 6l-12 12"/></Svg>
);

