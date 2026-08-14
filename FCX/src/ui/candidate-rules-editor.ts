import type { CandidateRuleSettings, ResolvedCandidateRules } from "../config/fcx-sbc-recommendations";

export type CandidateRuleKey = keyof CandidateRuleSettings;

export interface CandidateRulesEditorOptions {
  value: ResolvedCandidateRules;
  documentRef?: Document;
  onChange?: (key: CandidateRuleKey, value: CandidateRuleSettings[CandidateRuleKey]) => void;
  onRestore?: () => ResolvedCandidateRules | void;
}

export interface CandidateRulesEditorHandle {
  element: HTMLElement;
  getValue(): CandidateRuleSettings;
  changedKeys(): ReadonlySet<CandidateRuleKey>;
  restored(): boolean;
}

export const candidateRuleStandaloneSaveChallengeId = (
  supportsWholeSetAction: boolean,
  selectedChallengeId: unknown,
): number => supportsWholeSetAction
  ? 0
  : Math.max(0, Math.trunc(Number(selectedChallengeId) || 0));

export function createCandidateRulesEditor(options: CandidateRulesEditorOptions): CandidateRulesEditorHandle {
  const documentRef = options.documentRef ?? document;
  let current = structuredClone(options.value);
  let restored = false;
  const changed = new Set<CandidateRuleKey>();
  const renderers: Array<() => void> = [];
  const synchronizers: Array<() => void> = [];
  const root = documentRef.createElement("section");
  root.className = "fcx-candidate-rules";
  const heading = documentRef.createElement("div");
  heading.className = "fcx-candidate-rules__heading";
  heading.innerHTML = "<strong>球员使用范围</strong><small>总评、未折扣市场价与特殊分组保护</small>";
  const restore = documentRef.createElement("button");
  restore.type = "button";
  restore.className = "fcx-candidate-rules__restore";
  restore.textContent = "恢复推荐值";
  heading.appendChild(restore);
  const grid = documentRef.createElement("div");
  grid.className = "fcx-candidate-rules__grid";

  const numericPair = (
    label: string,
    key: "ratingRange" | "priceRange",
    min: number,
    max: number,
    nullable: boolean,
  ) => {
    const row = documentRef.createElement("label");
    row.className = "fcx-candidate-rules__field";
    const title = documentRef.createElement("span");
    title.textContent = label;
    const controls = documentRef.createElement("span");
    controls.className = "fcx-candidate-rules__range";
    const low = documentRef.createElement("input");
    const high = documentRef.createElement("input");
    for (const input of [low, high]) {
      input.type = "number";
      input.inputMode = "numeric";
      input.min = String(min);
      input.max = String(max);
      input.placeholder = nullable ? "不限" : String(min);
    }
    const dash = documentRef.createElement("span");
    dash.textContent = "—";
    const render = () => {
      const range = current[key] as [number | null, number | null];
      low.value = range[0] === null ? "" : String(range[0]);
      high.value = range[1] === null ? "" : String(range[1]);
    };
    renderers.push(render);
    const update = (shouldRender = true) => {
      const parse = (input: HTMLInputElement, fallback: number | null) => {
        if (nullable && input.value.trim() === "") return null;
        const value = Number(input.value);
        return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
      };
      let next: [number | null, number | null] = [
        parse(low, nullable ? null : min),
        parse(high, nullable ? null : max),
      ];
      if (next[0] !== null && next[1] !== null && next[0] > next[1]) next = [next[1], next[1]];
      const previous = current[key] as [number | null, number | null];
      if (previous[0] !== next[0] || previous[1] !== next[1]) {
        (current as unknown as Record<string, unknown>)[key] = next;
        changed.add(key);
        restored = false;
        options.onChange?.(key, next as never);
      }
      if (shouldRender) render();
    };
    synchronizers.push(() => update(false));
    low.addEventListener("input", () => update(false));
    high.addEventListener("input", () => update(false));
    low.addEventListener("change", () => update(true));
    high.addEventListener("change", () => update(true));
    controls.append(low, dash, high);
    row.append(title, controls);
    render();
    grid.appendChild(row);
  };

  const toggle = (
    label: string,
    key: "commonOnly" | "allowExtraRequiredRarityGroupPlayers",
    help: string,
  ) => {
    const row = documentRef.createElement("label");
    row.className = "fcx-candidate-rules__field fcx-candidate-rules__toggle";
    const copy = documentRef.createElement("span");
    const title = documentRef.createElement("span");
    title.textContent = label;
    const detail = documentRef.createElement("small");
    detail.textContent = help;
    copy.append(title, detail);
    const input = documentRef.createElement("input");
    input.type = "checkbox";
    input.checked = current[key];
    input.setAttribute("aria-label", label);
    const track = documentRef.createElement("span");
    track.className = "fcx-switch__track";
    const control = documentRef.createElement("span");
    control.className = "fcx-switch";
    control.append(input, track);
    const render = () => {
      input.checked = current[key];
    };
    renderers.push(render);
    input.addEventListener("change", () => {
      current[key] = input.checked;
      changed.add(key);
      restored = false;
      options.onChange?.(key, input.checked);
      render();
    });
    row.append(copy, control);
    render();
    grid.appendChild(row);
  };

  numericPair("球员总评范围", "ratingRange", 0, 99, false);
  numericPair("球员价格范围（读不到价格时不要设置）", "priceRange", 0, 15_000_000, true);
  toggle("只用普通卡", "commonOnly", "仅允许 EA 卡片 rareflag = 0；稀有金卡和特殊卡都会被排除。 ");
  toggle(
    "允许额外消耗必需特殊卡",
    "allowExtraRequiredRarityGroupPlayers",
    "关闭时，挑战点名的特殊分组只使用要求数量；不限制其他特殊卡。 ",
  );
  restore.addEventListener("click", () => {
    const next = options.onRestore?.();
    if (!next) return;
    current = structuredClone(next);
    changed.clear();
    restored = true;
    renderers.forEach((render) => render());
  });
  root.append(heading, grid);
  return {
    element: root,
    getValue: () => {
      synchronizers.forEach((synchronize) => synchronize());
      return {
        ratingRange: [...current.ratingRange],
        priceRange: [...current.priceRange],
        commonOnly: current.commonOnly,
        allowExtraRequiredRarityGroupPlayers:
          current.allowExtraRequiredRarityGroupPlayers,
      };
    },
    changedKeys: () => new Set(changed),
    restored: () => restored,
  };
}
