import { useEffect, useState } from "react";

type Theme = "light" | "dark";
const KEY = "veildrop-theme";
const EVT = "veildrop-theme-change";

// Build a theme-matched favicon as an inline SVG data URI: the Dossier
// envelope + wax seal, on a manila tile that flips with the theme so the tab
// icon tracks the in-app light/dark toggle.
function faviconDataUri(dark: boolean): string {
  const tile = dark ? "#2a2708" : "#fff5c9";
  const ink = dark ? "#f4f4f2" : "#111314";
  const seal = "#ffd208";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">` +
    `<rect width="64" height="64" rx="14" fill="${tile}"/>` +
    `<path d="M11 16 L32 34 L53 16" fill="none" stroke="${ink}" stroke-opacity="0.55" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<rect x="14" y="43" width="21" height="5.2" rx="2" fill="${ink}" opacity="0.8"/>` +
    `<rect x="14" y="51.2" width="13" height="5.2" rx="2" fill="${ink}" opacity="0.45"/>` +
    `<circle cx="32" cy="32.4" r="10" fill="${seal}"/>` +
    `<circle cx="32" cy="32.4" r="5.6" fill="none" stroke="#fff6ea" stroke-opacity="0.55" stroke-width="2.2"/>` +
    `</svg>`;
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

// Keep the mobile browser chrome on the page background - values must match
// --bg for each theme in index.css.
function setThemeColor(dark: boolean) {
  if (typeof document === "undefined") return;
  const meta = document.querySelector<HTMLMetaElement>("meta[name='theme-color']");
  if (meta) meta.content = dark ? "#0e0f10" : "#f4f2ec";
}

// Apply the stored theme + matching favicon on first import. Default is light.
if (typeof document !== "undefined") {
  const dark = localStorage.getItem(KEY) === "dark";
  document.documentElement.classList.toggle("dark", dark);
  setFavicon(dark);
  setThemeColor(dark);
}

function apply(theme: Theme) {
  const dark = theme === "dark";
  document.documentElement.classList.toggle("dark", dark);
  localStorage.setItem(KEY, theme);
  setFavicon(dark);
  setThemeColor(dark);
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
