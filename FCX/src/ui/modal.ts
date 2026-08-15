export interface FcxModalOptions {
  id: string;
  title: string;
  description?: string;
  content: Node;
  labelledBy?: string;
  documentRef?: Document;
  dismissible?: boolean;
  /**
   * Places a required decision dialog above the FCX task shield while the
   * shield continues to block the underlying EA page.
   */
  taskInteraction?: boolean;
}

export interface FcxModalHandle {
  root: HTMLElement;
  panel: HTMLElement;
  footer: HTMLElement;
  close(): void;
}

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

export function openFcxModal(options: FcxModalOptions): FcxModalHandle {
  const documentRef = options.documentRef ?? document;
  const dismissible = options.dismissible !== false;
  documentRef.getElementById(options.id)?.remove();
  const previousFocus = documentRef.activeElement as HTMLElement | null;

  const root = documentRef.createElement("div");
  root.id = options.id;
  root.className = "fcx-modal-backdrop";
  if (options.taskInteraction === true) {
    root.classList.add("fcx-modal-backdrop--task-interaction");
  }
  const panel = documentRef.createElement("section");
  panel.className = "fcx-modal-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.tabIndex = -1;

  const headingId = options.labelledBy ?? `${options.id}-title`;
  panel.setAttribute("aria-labelledby", headingId);
  const header = documentRef.createElement("header");
  header.className = "fcx-modal-header";
  const headingWrap = documentRef.createElement("div");
  const title = documentRef.createElement("h2");
  title.id = headingId;
  title.className = "fcx-modal-title";
  title.textContent = options.title;
  headingWrap.appendChild(title);
  if (options.description) {
    const description = documentRef.createElement("p");
    description.className = "fcx-modal-description";
    description.textContent = options.description;
    headingWrap.appendChild(description);
  }
  const closeButton = documentRef.createElement("button");
  closeButton.type = "button";
  closeButton.className = "fcx-modal-close";
  closeButton.setAttribute("aria-label", "关闭弹窗");
  closeButton.textContent = "×";
  header.appendChild(headingWrap);
  if (dismissible) header.appendChild(closeButton);

  const body = documentRef.createElement("div");
  body.className = "fcx-modal-body";
  body.appendChild(options.content);
  const footer = documentRef.createElement("footer");
  footer.className = "fcx-modal-footer";
  panel.append(header, body, footer);
  root.appendChild(panel);

  const close = () => {
    root.removeEventListener("keydown", onKeyDown);
    root.remove();
    previousFocus?.focus?.();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && dismissible) {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (focusable.length === 0) {
      event.preventDefault();
      panel.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && documentRef.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && documentRef.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  if (dismissible) closeButton.addEventListener("click", close);
  root.addEventListener("click", (event) => {
    if (dismissible && event.target === root) close();
  });
  root.addEventListener("keydown", onKeyDown);
  documentRef.body.appendChild(root);
  if (dismissible) closeButton.focus();
  else panel.focus();
  return { root, panel, footer, close };
}
