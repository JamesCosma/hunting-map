import { STORAGE_KEYS } from '../config';
import { readJson, writeJson } from '../lib/storage';

export const THEMES = ['auto', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

/** The stored preference, or 'auto' when nothing valid is saved. */
export function readTheme(): Theme {
  const saved = readJson(STORAGE_KEYS.theme);
  return isTheme(saved) ? saved : 'auto';
}

/**
 * Applies a theme by setting `data-theme` on the root element, which flips
 * `color-scheme` and so every `light-dark()` token in tokens.css. 'auto'
 * removes the attribute and lets the OS setting decide.
 *
 * Kept free of DOM lookups beyond the root so the inline boot script in
 * index.html can do the same thing before first paint without loading the app.
 */
export function applyTheme(theme: Theme): void {
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  syncBrowserThemeColor();
}

/**
 * Keeps the iOS status bar and Android browser chrome matching the header.
 * The value is read back from the cascade so it can never drift from tokens.
 */
function syncBrowserThemeColor(): void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta == null) return;
  const color = getComputedStyle(document.documentElement)
    .getPropertyValue('--color-header-solid')
    .trim();
  if (color !== '') meta.content = color;
}

/**
 * Three-way color theme control. Uses real radio inputs so that grouping,
 * arrow-key navigation and screen reader semantics come from the platform
 * rather than from hand-rolled key handling.
 */
export class ThemeToggle {
  constructor(private readonly root: HTMLElement) {
    const current = readTheme();
    applyTheme(current);

    for (const input of this.inputs()) {
      input.checked = input.value === current;
      input.addEventListener('change', () => {
        if (!input.checked || !isTheme(input.value)) return;
        applyTheme(input.value);
        writeJson(STORAGE_KEYS.theme, input.value);
      });
    }

    // While on 'auto', follow the OS so the status bar color keeps up.
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (readTheme() === 'auto') syncBrowserThemeColor();
    });
  }

  private inputs(): HTMLInputElement[] {
    return [...this.root.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
  }
}
