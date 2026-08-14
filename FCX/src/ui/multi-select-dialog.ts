import { openFcxModal } from "./modal";

export type FcxMultiSelectValue = number | string;

export interface FcxMultiSelectOption {
  value: FcxMultiSelectValue;
  label: string;
  iconUrl?: string;
  searchText?: string;
}

export interface FcxMultiSelectControlOptions {
  id: string;
  label: string;
  help: string;
  modalTitle: string;
  options: readonly FcxMultiSelectOption[];
  selected: readonly FcxMultiSelectValue[];
  onSave(values: FcxMultiSelectValue[]): void | Promise<void>;
  documentRef?: Document;
}

export interface FcxMultiSelectControl {
  root: HTMLElement;
  button: HTMLButtonElement;
  setSelected(values: readonly FcxMultiSelectValue[]): void;
  getSelected(): FcxMultiSelectValue[];
  open(): void;
}

const valueKey = (value: FcxMultiSelectValue) => String(value);

function normalizedOptions(
  options: readonly FcxMultiSelectOption[],
): FcxMultiSelectOption[] {
  const unique = new Map<string, FcxMultiSelectOption>();
  for (const option of options) {
    const label = String(option.label || "").trim();
    if (!label) continue;
    const key = valueKey(option.value);
    if (!unique.has(key)) unique.set(key, { ...option, label });
  }
  return [...unique.values()];
}

export function createFcxMultiSelectControl(
  input: FcxMultiSelectControlOptions,
): FcxMultiSelectControl {
  const documentRef = input.documentRef ?? document;
  const options = normalizedOptions(input.options);
  const optionByKey = new Map(options.map((option) => [valueKey(option.value), option]));
  let selected = new Set(
    input.selected.map(valueKey).filter((key) => optionByKey.has(key)),
  );

  const root = documentRef.createElement("section");
  root.id = input.id;
  root.className = "sbc-settings-field fcx-exclusion-field";
  const copy = documentRef.createElement("div");
  copy.className = "fcx-exclusion-field__copy";
  const label = documentRef.createElement("strong");
  label.textContent = input.label;
  const help = documentRef.createElement("small");
  help.textContent = input.help;
  copy.append(label, help);

  const summary = documentRef.createElement("div");
  summary.className = "fcx-exclusion-field__summary";
  const count = documentRef.createElement("b");
  const preview = documentRef.createElement("span");
  summary.append(count, preview);

  const button = documentRef.createElement("button");
  button.type = "button";
  button.className = "fcx-button fcx-exclusion-field__button";

  const getSelected = () =>
    options
      .filter((option) => selected.has(valueKey(option.value)))
      .map((option) => option.value);

  const renderSummary = () => {
    const selectedOptions = options.filter((option) =>
      selected.has(valueKey(option.value)),
    );
    count.textContent = `${selectedOptions.length} 项`;
    preview.textContent = selectedOptions.length
      ? selectedOptions
          .slice(0, 3)
          .map((option) => option.label)
          .join("、") + (selectedOptions.length > 3 ? ` 等 ${selectedOptions.length} 项` : "")
      : "尚未选择";
    button.textContent = selectedOptions.length ? "修改" : "选择";
    button.setAttribute("aria-label", `${button.textContent}${input.label}`);
  };

  const setSelected = (values: readonly FcxMultiSelectValue[]) => {
    selected = new Set(values.map(valueKey).filter((key) => optionByKey.has(key)));
    renderSummary();
  };

  const open = () => {
    const working = new Set(selected);
    const content = documentRef.createElement("div");
    content.className = "fcx-picker";
    const toolbar = documentRef.createElement("div");
    toolbar.className = "fcx-picker__toolbar";
    const search = documentRef.createElement("input");
    search.type = "search";
    search.className = "fcx-picker__search";
    search.placeholder = `搜索${input.label.replace(/^排除/, "")}`;
    search.setAttribute("aria-label", search.placeholder);
    const selection = documentRef.createElement("span");
    selection.className = "fcx-picker__selection";
    const clear = documentRef.createElement("button");
    clear.type = "button";
    clear.className = "fcx-picker__clear";
    clear.textContent = "清空选择";
    toolbar.append(search, selection, clear);
    const list = documentRef.createElement("div");
    list.className = "fcx-picker__list";
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-multiselectable", "true");
    const empty = documentRef.createElement("p");
    empty.className = "fcx-picker__empty";
    empty.textContent = "没有找到匹配项目";
    content.append(toolbar, list);

    const updateSelectionLabel = () => {
      selection.textContent = `已选择 ${working.size} 项`;
      clear.disabled = working.size === 0;
    };

    const renderList = () => {
      const query = search.value.trim().toLocaleLowerCase();
      const matches = options.filter((option) => {
        const haystack = `${option.label} ${option.searchText || ""}`.toLocaleLowerCase();
        return !query || haystack.includes(query);
      });
      list.replaceChildren();
      if (!matches.length) {
        list.appendChild(empty);
        updateSelectionLabel();
        return;
      }
      const fragment = documentRef.createDocumentFragment();
      for (const option of matches) {
        const key = valueKey(option.value);
        const row = documentRef.createElement("button");
        row.type = "button";
        row.className = "fcx-picker__option";
        row.setAttribute("role", "option");
        row.setAttribute("aria-selected", String(working.has(key)));
        if (working.has(key)) row.classList.add("is-selected");
        const visual = documentRef.createElement("span");
        visual.className = "fcx-picker__option-visual";
        if (option.iconUrl) {
          const image = documentRef.createElement("img");
          image.src = option.iconUrl;
          image.alt = "";
          image.loading = "lazy";
          visual.appendChild(image);
        }
        const text = documentRef.createElement("span");
        text.className = "fcx-picker__option-label";
        text.textContent = option.label;
        const check = documentRef.createElement("span");
        check.className = "fcx-picker__option-check";
        check.setAttribute("aria-hidden", "true");
        check.textContent = "✓";
        row.append(visual, text, check);
        row.addEventListener("click", () => {
          if (working.has(key)) working.delete(key);
          else working.add(key);
          row.classList.toggle("is-selected", working.has(key));
          row.setAttribute("aria-selected", String(working.has(key)));
          updateSelectionLabel();
        });
        fragment.appendChild(row);
      }
      list.appendChild(fragment);
      updateSelectionLabel();
    };

    search.addEventListener("input", renderList);
    clear.addEventListener("click", () => {
      working.clear();
      renderList();
    });
    renderList();

    const modal = openFcxModal({
      id: `fcx-picker-${input.id}`,
      title: input.modalTitle,
      description: "选择后立即保存到当前规则范围。",
      content,
      documentRef,
    });
    modal.panel.classList.add("fcx-modal-panel--picker");
    const status = documentRef.createElement("p");
    status.className = "fcx-modal-status";
    status.setAttribute("aria-live", "polite");
    const cancel = documentRef.createElement("button");
    cancel.type = "button";
    cancel.className = "fcx-button";
    cancel.textContent = "取消";
    const save = documentRef.createElement("button");
    save.type = "button";
    save.className = "fcx-button fcx-button--primary";
    save.textContent = "保存选择";
    modal.footer.append(status, cancel, save);
    cancel.addEventListener("click", modal.close);
    save.addEventListener("click", async () => {
      save.disabled = true;
      cancel.disabled = true;
      clear.disabled = true;
      search.disabled = true;
      status.textContent = "正在保存…";
      const values = options
        .filter((option) => working.has(valueKey(option.value)))
        .map((option) => option.value);
      try {
        await input.onSave(values);
        setSelected(values);
        modal.close();
      } catch (error) {
        status.textContent = `保存失败：${error instanceof Error ? error.message : String(error)}`;
        save.disabled = false;
        cancel.disabled = false;
        search.disabled = false;
        updateSelectionLabel();
      }
    });
    queueMicrotask(() => search.focus());
  };

  button.addEventListener("click", open);
  root.append(copy, summary, button);
  renderSummary();
  return { root, button, setSelected, getSelected, open };
}
