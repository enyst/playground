import React from "react";

/**
 * A small line-art cat face for the sidebar, drawn with `currentColor` strokes
 * so it matches the other lucide icons in the rail (New Chat, Settings, …).
 */
export function SecretaryCatIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* ears */}
      <path d="M5 4l2.2 4.2" />
      <path d="M19 4l-2.2 4.2" />
      <path d="M5 4l2.4 1" />
      <path d="M19 4l-2.4 1" />
      {/* head */}
      <path d="M4.8 11.5a7.2 6 0 0 0 14.4 0a7.2 6 0 0 0 -14.4 0Z" />
      {/* eyes */}
      <path d="M9.3 11.2v1.2" />
      <path d="M14.7 11.2v1.2" />
      {/* nose + whiskers */}
      <path d="M12 14.2v1" />
      <path d="M8 13.5H5.5" />
      <path d="M16 13.5H18.5" />
    </svg>
  );
}
