export type StyleValues = Partial<CSSStyleDeclaration>;

export function rootElement<T extends Element>(
  value: T | { getRootElement(): T },
): T {
  return "getRootElement" in value ? value.getRootElement() : value;
}

export function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Record<string, string> = {},
  html = "",
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.innerHTML = html;
  for (const [name, value] of Object.entries(attributes)) {
    if (!value) continue;
    element.setAttribute(name === "className" ? "class" : name, value);
  }
  return element;
}

export function applyStyles<T extends HTMLElement>(
  element: T,
  styles: StyleValues,
): T {
  Object.assign(element.style, styles);
  return element;
}

export function insertAfter(newNode: Node, existingNode: Node): void {
  existingNode.parentNode?.insertBefore(newNode, existingNode.nextSibling);
}
