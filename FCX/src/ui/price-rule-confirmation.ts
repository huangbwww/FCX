import { openFcxModal } from "./modal";
import { ensureTaskOverlayRoot } from "./task-overlay";

export interface PriceRuleConfirmationOptions {
  setName: string;
  timeoutMs?: number;
  documentRef?: Document;
}

export function confirmIgnoringPriceRules(options: PriceRuleConfirmationOptions): Promise<boolean> {
  const documentRef = options.documentRef ?? document;
  const content = documentRef.createElement("div");
  const warning = documentRef.createElement("p");
  warning.textContent = `“${options.setName}”配置了球员价格范围。忽略球员价值后，本次任务将不读取价格，也不会应用该价格范围。`;
  content.appendChild(warning);
  const modal = openFcxModal({
    id: "fcx-price-rule-confirmation",
    title: "价格规则需要确认",
    description: "请选择是否跳过价格限制继续执行。",
    content,
    documentRef,
    dismissible: false,
  });
  const taskOverlay = ensureTaskOverlayRoot(documentRef);
  modal.root.style.zIndex = "4";
  modal.root.style.pointerEvents = "auto";
  taskOverlay.appendChild(modal.root);
  const cancel = documentRef.createElement("button");
  cancel.type = "button";
  cancel.className = "fcx-modal-button fcx-modal-button--secondary";
  cancel.textContent = "取消任务";
  const proceed = documentRef.createElement("button");
  proceed.type = "button";
  proceed.className = "fcx-modal-button fcx-modal-button--primary";
  proceed.textContent = "跳过价格限制并继续";
  modal.footer.append(cancel, proceed);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      modal.close();
      resolve(value);
    };
    const timer = setTimeout(() => finish(false), options.timeoutMs ?? 60_000);
    cancel.addEventListener("click", () => finish(false));
    proceed.addEventListener("click", () => finish(true));
    proceed.focus();
  });
}
