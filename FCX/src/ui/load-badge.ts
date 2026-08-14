import { uiText } from "../config/ui-text";

export const FCX_LOADED_BADGE_ID = "fcx-loaded-badge";

const VISIBLE_DURATION_MS = 2_500;
const FADE_DURATION_MS = 400;

function ensureLoadedBadgeStyles(documentRef: Document): void {
  if (documentRef.getElementById("fcx-loaded-badge-style")) {
    return;
  }

  const style = documentRef.createElement("style");
  style.id = "fcx-loaded-badge-style";
  style.textContent = `
#${FCX_LOADED_BADGE_ID} {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2147483647;
  padding: 9px 14px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 8px;
  background: #16a34a;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.45);
  color: #fff;
  font: 600 13px/1 system-ui, -apple-system, "Segoe UI", sans-serif;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.3s ease;
}
@media (prefers-reduced-motion: reduce) {
  #${FCX_LOADED_BADGE_ID} { transition: none; }
}`;
  (documentRef.head ?? documentRef.documentElement).appendChild(style);
}

export function showFcxLoadedBadge(documentRef: Document = document): HTMLElement {
  documentRef.getElementById(FCX_LOADED_BADGE_ID)?.remove();
  ensureLoadedBadgeStyles(documentRef);

  const badge = documentRef.createElement("div");
  badge.id = FCX_LOADED_BADGE_ID;
  badge.setAttribute("role", "status");
  badge.setAttribute("aria-live", "polite");
  badge.textContent = uiText.loading.success;
  (documentRef.body ?? documentRef.documentElement).appendChild(badge);

  requestAnimationFrame(() => {
    if (badge.isConnected) {
      badge.style.opacity = "1";
    }
  });

  window.setTimeout(() => {
    badge.style.opacity = "0";
    window.setTimeout(() => badge.remove(), FADE_DURATION_MS);
  }, VISIBLE_DURATION_MS);

  return badge;
}
