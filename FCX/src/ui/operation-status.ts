export type OperationStatusLevel = "info" | "success" | "error";

export interface OperationStatusEvent {
  scope: "SBC" | "Price" | "Pack";
  message: string;
  level: OperationStatusLevel;
  occurredAt: string;
}

const listeners = new Set<(event: OperationStatusEvent) => void>();

export function subscribeOperationStatus(
  listener: (event: OperationStatusEvent) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function reportOperationStatus(
  scope: "SBC" | "Price" | "Pack",
  message: string,
  level: OperationStatusLevel = "info",
  documentRef: Document = document,
): HTMLElement | null {
  console[level === "error" ? "error" : "log"](`[FCX][${scope}] ${message}`);
  const event = {
    scope,
    message,
    level,
    occurredAt: new Date().toISOString(),
  } satisfies OperationStatusEvent;
  for (const listener of listeners) listener(event);
  const root = documentRef.getElementById("fcx-task-overlay-root");
  if (!root) return null;
  let container = documentRef.getElementById("fcx-operation-status");
  if (!container) {
    container = documentRef.createElement("div");
    container.id = "fcx-operation-status";
    container.className = "fcx-operation-status";
    container.setAttribute("role", "status");
    container.setAttribute("aria-live", "polite");
    root.appendChild(container);
  }

  const entry = documentRef.createElement("div");
  entry.className = `fcx-operation-status__entry is-${level}`;
  entry.textContent = message;
  container.appendChild(entry);
  while (container.children.length > 3) container.firstElementChild?.remove();
  return container;
}

export function clearOperationStatus(documentRef: Document = document): void {
  documentRef.getElementById("fcx-operation-status")?.remove();
}
