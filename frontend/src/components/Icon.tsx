type IconName =
  | "chevronDown"
  | "chevronRight"
  | "maximize"
  | "minimize"
  | "moon"
  | "reset"
  | "sun"
  | "x";

type IconProps = {
  name: IconName;
};

function Icon({ name }: IconProps) {
  const paths: Record<IconName, ReactNode> = {
    chevronDown: <polyline points="6 9 12 15 18 9" />,
    chevronRight: <polyline points="9 6 15 12 9 18" />,
    maximize: (
      <>
        <polyline points="15 3 21 3 21 9" />
        <polyline points="9 21 3 21 3 15" />
        <line x1="21" x2="14" y1="3" y2="10" />
        <line x1="3" x2="10" y1="21" y2="14" />
      </>
    ),
    minimize: (
      <>
        <polyline points="4 14 10 14 10 20" />
        <polyline points="20 10 14 10 14 4" />
        <line x1="14" x2="21" y1="10" y2="3" />
        <line x1="3" x2="10" y1="21" y2="14" />
      </>
    ),
    moon: <path d="M21 12.7A7.6 7.6 0 1 1 11.3 3a6 6 0 0 0 9.7 9.7Z" />,
    reset: (
      <>
        <path d="M3 12a9 9 0 1 0 3-6.7" />
        <polyline points="3 4 3 10 9 10" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <line x1="12" x2="12" y1="2" y2="5" />
        <line x1="12" x2="12" y1="19" y2="22" />
        <line x1="2" x2="5" y1="12" y2="12" />
        <line x1="19" x2="22" y1="12" y2="12" />
        <line x1="4.9" x2="7" y1="4.9" y2="7" />
        <line x1="17" x2="19.1" y1="17" y2="19.1" />
        <line x1="19.1" x2="17" y1="4.9" y2="7" />
        <line x1="7" x2="4.9" y1="17" y2="19.1" />
      </>
    ),
    x: (
      <>
        <line x1="18" x2="6" y1="6" y2="18" />
        <line x1="6" x2="18" y1="6" y2="18" />
      </>
    ),
  };

  return (
    <svg aria-hidden="true" className="ui-icon" viewBox="0 0 24 24">
      {paths[name]}
    </svg>
  );
}

export default Icon;
import type { ReactNode } from "react";
