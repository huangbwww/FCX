export interface FcxSwitchControl {
  element: HTMLLabelElement;
  input: HTMLInputElement;
  track: HTMLSpanElement;
}

export function createFcxSwitchControl(
  document: Document,
  options: { label: string; checked?: boolean },
): FcxSwitchControl {
  const element = document.createElement("label");
  element.className = "fcx-switch";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = options.checked === true;
  input.setAttribute("aria-label", options.label);
  const track = document.createElement("span");
  track.className = "fcx-switch__track";
  element.append(input, track);
  return { element, input, track };
}
