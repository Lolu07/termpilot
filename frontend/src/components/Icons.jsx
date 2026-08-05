import React from "react";

function Icon({ children, size = 18 }) {
  return (
    <svg
      aria-hidden="true"
      className="icon-svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export function ArrowUpRightIcon({ size }) {
  return <Icon size={size}><path d="M7 17 17 7" /><path d="M8 7h9v9" /></Icon>;
}

export function MoonIcon({ size }) {
  return <Icon size={size}><path d="M20.2 15.2A8.5 8.5 0 0 1 8.8 3.8 8.5 8.5 0 1 0 20.2 15.2Z" /></Icon>;
}

export function SunIcon({ size }) {
  return (
    <Icon size={size}>
      <circle cx="12" cy="12" r="3.6" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Icon>
  );
}

export function CloseIcon({ size }) {
  return <Icon size={size}><path d="m7 7 10 10M17 7 7 17" /></Icon>;
}

export function TrashIcon({ size }) {
  return (
    <Icon size={size}>
      <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" />
    </Icon>
  );
}

export function DocumentIcon({ size }) {
  return (
    <Icon size={size}>
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v5h5M10 13h5M10 17h5" />
    </Icon>
  );
}
