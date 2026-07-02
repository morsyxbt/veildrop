import { useEffect, useState } from "react";

type Theme = "light" | "dark";
const KEY = "veildrop-theme";
const EVT = "veildrop-theme-change";

// Build a theme-matched favicon as an inline SVG data URI. The droplet stays
// violet→teal; only the tile + veil cells flip with the theme, so the tab icon
// tracks the in-app light/dark toggle.
function faviconDataUri(dark: boolean): string {
  const tile = dark ? "#14121e" : "#ece9f7";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">` +
    `<defs><linearGradient id="g" x1="32" y1="10" x2="32" y2="54" gradientUnits="userSpaceOnUse">` +
    `<stop offset="0" stop-color="#7c3aed"/><stop offset="1" stop-color="#2dd4bf"/></linearGradient>` +
    `<clipPath id="d"><path d="M32 10 C32 10 17 26.8 17 38 a15 15 0 0 0 30 0 C47 26.8 32 10 32 10 Z"/></clipPath></defs>` +
    `<rect width="64" height="64" rx="16" fill="${tile}"/>` +
    `<g clip-path="url(#d)"><rect x="12" y="8" width="40" height="46" fill="url(#g)"/>` +
    `<g fill="${tile}" opacity="0.92">` +
    `<rect x="18" y="36" width="6.4" height="6.4" rx="1.4"/>` +
    `<rect x="30.8" y="36" width="6.4" height="6.4" rx="1.4"/>` +
    `<rect x="24.4" y="42.8" width="6.4" height="6.4" rx="1.4"/>` +
    `<rect x="37.2" y="42.8" width="6.4" height="6.4" rx="1.4"/></g></g></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function setFavicon(dark: boolean) {
  if (typeof document === "undefined") return;
  let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.type = "image/svg+xml";
  link.href = faviconDataUri(dark);
}

// Apply the stored theme + matching favicon on first import. Default is light.
if (typeof document !== "undefined") {
  const dark = localStorage.getItem(KEY) === "dark";
  document.documentElement.classList.toggle("dark", dark);
  setFavicon(dark);
}

function apply(theme: Theme) {
  const dark = theme === "dark";
  document.documentElement.classList.toggle("dark", dark);
  localStorage.setItem(KEY, theme);
  setFavicon(dark);
  window.dispatchEvent(new Event(EVT));
}

/** Shared light/dark theme. Toggling in one place updates every consumer + the favicon. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() =>
    typeof document !== "undefined" && document.documentElement.classList.contains("dark")
      ? "dark"
      : "light",
  );

  useEffect(() => {
    const sync = () =>
      setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
    window.addEventListener(EVT, sync);
    return () => window.removeEventListener(EVT, sync);
  }, []);

  return { theme, toggle: () => apply(theme === "dark" ? "light" : "dark") };
}
