const LEGACY_CONTROL_SELECTOR =
  "#sbc-log-toggle, #sbc-info, #sbc-stop-overlay";
const TASK_OVERLAY_ROOT_ID = "fcx-task-overlay-root";

export function ensureTaskOverlayRoot(
  documentRef: Document = document,
): HTMLElement {
  const existing = documentRef.getElementById(TASK_OVERLAY_ROOT_ID);
  if (existing) return existing;

  const root = documentRef.createElement("div");
  root.id = TASK_OVERLAY_ROOT_ID;
  root.className = "fcx-task-overlay-root";
  root.setAttribute("aria-busy", "true");

  const fallbackBackdrop = documentRef.createElement("div");
  fallbackBackdrop.className = "fcx-task-overlay__fallback-backdrop";
  fallbackBackdrop.setAttribute("aria-hidden", "true");

  const fallbackSpinner = documentRef.createElement("div");
  fallbackSpinner.className = "fcx-task-overlay__fallback-spinner";
  fallbackSpinner.setAttribute("aria-hidden", "true");

  fallbackBackdrop.appendChild(fallbackSpinner);
  root.appendChild(fallbackBackdrop);
  (documentRef.body || documentRef.documentElement).appendChild(root);
  return root;
}

export function setTaskOverlayFallbackActive(
  active: boolean,
  documentRef: Document = document,
): HTMLElement {
  const root = ensureTaskOverlayRoot(documentRef);
  root.classList.toggle("is-fallback", active);
  root.dataset.shieldMode = active ? "fallback" : "native";
  return root;
}

export function removeTaskOverlayRoot(
  documentRef: Document = document,
): void {
  documentRef.getElementById(TASK_OVERLAY_ROOT_ID)?.remove();
}

export function removeLegacyTaskControls(
  documentRef: Document = document,
): void {
  documentRef
    .querySelectorAll(LEGACY_CONTROL_SELECTOR)
    .forEach((element) => element.remove());
}

export function removeTaskEndButton(documentRef: Document = document): void {
  documentRef.getElementById("fcx-task-end-overlay")?.remove();
}

export function mountTaskEndButton(
  onEnd: () => void,
  documentRef: Document = document,
): HTMLButtonElement | null {
  removeLegacyTaskControls(documentRef);
  const existing = documentRef.querySelector<HTMLButtonElement>(
    "#fcx-task-end-overlay",
  );
  if (existing) return existing;

  const root = ensureTaskOverlayRoot(documentRef);

  const button = documentRef.createElement("button");
  button.id = "fcx-task-end-overlay";
  button.type = "button";
  button.className = "fcx-task-end-overlay";
  button.textContent = "结束任务";
  button.setAttribute("aria-label", "结束当前自动任务");
  button.addEventListener("click", () => {
    if (button.disabled) return;
    button.disabled = true;
    button.textContent = "正在结束";
    onEnd();
  });
  root.appendChild(button);
  return button;
}
