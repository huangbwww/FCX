// @ts-nocheck
// Editable routine center backed by the current page-session catalog.

const routineModeLabel = (mode) =>
  mode === "round_robin" ? "逐轮滚卡" : "分段滚卡";

const normalizeRoutineRunsInput = (value, fallback = 1) => {
  const parsed = Math.trunc(Number(value));
  if (parsed === -1) return -1;
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(100, parsed);
};

const routinePackKey = (packId, tradable) =>
  `${Number(packId)}:${Boolean(tradable)}`;

const formatRoutineRuns = (runs) =>
  Number(runs) === -1 ? "全部" : `×${Number(runs || 1)}`;

const describeRoutineStep = (step, setById) => {
  if (step.kind === "pack") {
    return `开包：${step.packName || `卡包 #${step.packId}`} ${formatRoutineRuns(step.runs)}`;
  }
  const name = setById.get(Number(step.setId))?.name || `SBC #${step.setId}`;
  return `${name} ${Number(step.runs) === -1 ? "持续" : formatRoutineRuns(step.runs)}`;
};

const getRoutineSetState = (set) => {
  if (!set) return { label: "已过期或不可用", kind: "unavailable" };
  const repeatability = getSbcRepeatability(set);
  if (repeatability.kind === "finite" && repeatability.remaining <= 0) {
    return { label: "次数已耗尽", kind: "exhausted" };
  }
  if (repeatability.kind === "unlimited") {
    return { label: "可用 · 无限", kind: "available" };
  }
  if (repeatability.kind === "finite") {
    return { label: `可用 · 剩余 ${repeatability.remaining} 次`, kind: "available" };
  }
  return { label: "可用 · 次数未知", kind: "available" };
};

const createRoutineCounter = () => {
  const snapshot = getSubmissionSnapshot();
  const element = document.createElement("div");
  element.className = "fcx-routine-counter";
  element.innerHTML = `
    <span>当前小时 <strong>${snapshot.hour}</strong> / ${snapshot.hourLimit}</span>
    <span>今日 <strong>${snapshot.day}</strong> / ${snapshot.dayLimit}</span>
  `;
  if (snapshot.remaining <= 0 && snapshot.nextAvailableAt) {
    const next = document.createElement("small");
    next.textContent = "已达到统计提醒值，仅记录，不限制继续提交";
    element.appendChild(next);
  }
  return element;
};

const cloneRoutineDraft = (routine) => JSON.parse(JSON.stringify(routine));

const openRoutineCenter = async () => {
  const catalogRevisionAtOpen = fcxRoutineStore.getBuiltinCatalogRevision();
  const content = document.createElement("div");
  content.className = "fcx-routine-center";
  const counter = createRoutineCounter();
  const loading = document.createElement("p");
  loading.className = "fcx-modal-status";
  loading.textContent = "正在读取 EA 当前 SBC 与卡包列表…";
  content.append(counter, loading);

  const modal = openFcxModal({
    id: "fcx-routine-center-modal",
    title: "永动机滚卡",
    description: "流程配置保存在本机；每个 SBC 完成后只开启它对应的整组奖励包。",
    content,
  });
  modal.panel.classList.add("fcx-modal-panel--routine");
  const close = createModalButton("关闭");
  const create = createModalButton("新建自定义流程", "fcx-button--primary");
  modal.footer.append(close, create);
  close.addEventListener("click", modal.close);
  void fcxRoutineCatalogController.loadOnce().then(() => {
    if (
      modal.root.isConnected
      && fcxRoutineStore.getBuiltinCatalogRevision() !== catalogRevisionAtOpen
    ) {
      modal.close();
      void openRoutineCenter();
    }
  });

  const snapshot = fcxAutoSbcSessionSnapshot.get(autoSbcRenderVersion);
  const { catalog, packGroups: initialPackGroups } =
    await resolveAutoSbcSessionData({
      snapshot,
      loadCatalog: async () => {
        try {
          return await sbcSets();
        } catch (error) {
          loading.textContent = "SBC 数据读取失败，仍可查看本地流程配置。";
          console.error("[FCX][Routine] catalog failed", error);
          return { sets: [] };
        }
      },
      loadPackGroups: async () => {
        try {
          return await loadAutoSbcPackGroups();
        } catch (error) {
          console.warn("[FCX][Routine] pack catalog failed", error);
          return [];
        }
      },
    });
  const sets = catalog?.sets || [];
  const setById = new Map(sets.map((set) => [Number(set.id), set]));
  let packGroups = [...initialPackGroups];
  const packByKey = new Map(
    packGroups.map((group) => [
      routinePackKey(group.packId, group.tradable),
      group,
    ])
  );
  loading.remove();

  const grid = document.createElement("div");
  grid.className = "fcx-routine-grid";
  for (const routine of fcxRoutineStore.list()) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "fcx-routine-card";
    const title = document.createElement("strong");
    title.textContent = routine.name;
    const origin = document.createElement("span");
    origin.className = "fcx-routine-origin";
    origin.textContent = routine.origin === "builtin" ? "内置" : "自定义";
    const description = document.createElement("p");
    description.textContent = routine.description || "未填写流程说明";
    const steps = document.createElement("div");
    steps.className = "fcx-routine-card-steps";
    steps.textContent = routine.steps
      .map((step) => describeRoutineStep(step, setById))
      .join(" → ");
    const footer = document.createElement("div");
    footer.className = "fcx-routine-card-footer";
    const mode = document.createElement("span");
    mode.textContent = routine.mode === "round_robin"
      ? `${routineModeLabel(routine.mode)} · ${routine.totalCycles === -1 ? "无限轮" : `${routine.totalCycles}轮`}`
      : routineModeLabel(routine.mode);
    const unavailable = routine.steps.filter(
      (step) => step.kind === "pack"
        ? !packByKey.has(routinePackKey(step.packId, step.tradable))
        : getRoutineSetState(setById.get(Number(step.setId))).kind !== "available"
    ).length;
    const status = document.createElement("span");
    status.className = unavailable ? "is-warning" : "is-ready";
    status.textContent = unavailable ? `${unavailable} 项当前不可用` : "可以启动";
    footer.append(mode, status);
    card.append(title, origin, description, steps, footer);
    card.addEventListener("click", () => {
      modal.close();
      openRoutineEditor(routine, sets, packGroups);
    });
    grid.appendChild(card);
  }
  content.appendChild(grid);

  create.addEventListener("click", () => {
    const draft = fcxRoutineStore.create();
    if (sets[0]) {
      draft.steps.push({
        kind: "sbc",
        id: `step-${Date.now()}`,
        setId: Number(sets[0].id),
        runs: 1,
      });
    }
    modal.close();
    openRoutineEditor(draft, sets, packGroups);
  });
};

const openRoutineEditor = (routine, sets, initialPackGroups = []) => {
  const draft = cloneRoutineDraft(routine);
  const setById = new Map(sets.map((set) => [Number(set.id), set]));
  const content = document.createElement("div");
  content.className = "fcx-routine-editor";
  content.appendChild(createRoutineCounter());

  const basics = document.createElement("section");
  basics.className = "fcx-routine-editor-section";
  basics.innerHTML = "<h3>流程设置</h3>";
  const nameLabel = document.createElement("label");
  nameLabel.className = "fcx-routine-field";
  nameLabel.innerHTML = "<span>流程名称</span>";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.value = draft.name;
  nameLabel.appendChild(nameInput);
  const descLabel = document.createElement("label");
  descLabel.className = "fcx-routine-field";
  descLabel.innerHTML = "<span>说明</span>";
  const descInput = document.createElement("textarea");
  descInput.rows = 2;
  descInput.value = draft.description;
  descLabel.appendChild(descInput);
  const modeLabel = document.createElement("label");
  modeLabel.className = "fcx-routine-field";
  modeLabel.innerHTML = "<span>执行方式</span>";
  const modeSelect = document.createElement("select");
  modeSelect.innerHTML = `
    <option value="round_robin">逐轮滚卡：按完整步骤列表循环</option>
    <option value="exhaust_step">分段滚卡：按顺序执行一次</option>
  `;
  modeSelect.value = draft.mode;
  modeLabel.appendChild(modeSelect);
  const totalCyclesLabel = document.createElement("label");
  totalCyclesLabel.className = "fcx-routine-field fcx-routine-cycle-field";
  totalCyclesLabel.innerHTML = "<span>总轮数</span>";
  const totalCyclesInput = document.createElement("input");
  totalCyclesInput.type = "text";
  totalCyclesInput.inputMode = "numeric";
  totalCyclesInput.value = String(draft.totalCycles ?? 5);
  totalCyclesInput.placeholder = "1–100 或 -1";
  totalCyclesInput.title = "输入 1–100；-1 表示持续循环";
  totalCyclesLabel.appendChild(totalCyclesInput);
  const syncCycleVisibility = () => {
    totalCyclesLabel.hidden = modeSelect.value !== "round_robin";
  };
  modeSelect.addEventListener("change", syncCycleVisibility);
  syncCycleVisibility();
  const ignoreValueRow = document.createElement("label");
  ignoreValueRow.className = "fcx-routine-option";
  const ignoreValueCopy = document.createElement("span");
  const ignoreValueTitle = document.createElement("strong");
  ignoreValueTitle.textContent = "忽略球员价值";
  const ignoreValueHelp = document.createElement("small");
  ignoreValueHelp.textContent = "作用于整条流程、周黑补给及补给后的重试。";
  ignoreValueCopy.append(ignoreValueTitle, ignoreValueHelp);
  const ignoreValueSwitch = document.createElement("span");
  ignoreValueSwitch.className = "fcx-switch";
  const ignoreValueInput = document.createElement("input");
  ignoreValueInput.type = "checkbox";
  ignoreValueInput.checked = draft.ignoreValue === true;
  ignoreValueInput.setAttribute("aria-label", "永动机忽略球员价值");
  const ignoreValueTrack = document.createElement("span");
  ignoreValueTrack.className = "fcx-switch__track";
  ignoreValueSwitch.append(ignoreValueInput, ignoreValueTrack);
  ignoreValueRow.append(ignoreValueCopy, ignoreValueSwitch);
  const fatalRecoveryEnabledRow = document.createElement("label");
  fatalRecoveryEnabledRow.className = "fcx-routine-option";
  const fatalRecoveryEnabledCopy = document.createElement("span");
  const fatalRecoveryEnabledTitle = document.createElement("strong");
  fatalRecoveryEnabledTitle.textContent =
    "流程异常自动刷新恢复（解除300ban之前、没用明白脚本不要开不要开！）";
  const fatalRecoveryEnabledHelp = document.createElement("small");
  fatalRecoveryEnabledHelp.textContent =
    "开启后，技术错误才会自动保存进度并刷新页面。";
  fatalRecoveryEnabledCopy.append(
    fatalRecoveryEnabledTitle,
    fatalRecoveryEnabledHelp
  );
  const fatalRecoveryEnabledSwitch = document.createElement("span");
  fatalRecoveryEnabledSwitch.className = "fcx-switch";
  const fatalRecoveryEnabledInput = document.createElement("input");
  fatalRecoveryEnabledInput.type = "checkbox";
  fatalRecoveryEnabledInput.checked = draft.fatalRecoveryEnabled === true;
  fatalRecoveryEnabledInput.setAttribute("aria-label", "流程异常自动刷新恢复");
  const fatalRecoveryEnabledTrack = document.createElement("span");
  fatalRecoveryEnabledTrack.className = "fcx-switch__track";
  fatalRecoveryEnabledSwitch.append(
    fatalRecoveryEnabledInput,
    fatalRecoveryEnabledTrack
  );
  fatalRecoveryEnabledRow.append(
    fatalRecoveryEnabledCopy,
    fatalRecoveryEnabledSwitch
  );
  const fatalRecoveryLabel = document.createElement("label");
  fatalRecoveryLabel.className = "fcx-routine-field";
  fatalRecoveryLabel.innerHTML = "<span>刷新后的处理方式</span>";
  const fatalRecoverySelect = document.createElement("select");
  fatalRecoverySelect.innerHTML = `
    <option value="stop">刷新后停止任务</option>
    <option value="resume">刷新后从中断处恢复</option>
    <option value="restart">刷新后重新执行本流程</option>
  `;
  fatalRecoverySelect.value = draft.fatalRecoveryMode || "restart";
  fatalRecoverySelect.title =
    "遇到会终止永动机的EA请求、提交或开包错误时，FCX会保存进度并自动刷新页面。";
  const fatalRecoveryControls = document.createElement("div");
  fatalRecoveryControls.className = "fcx-routine-recovery-controls";
  fatalRecoveryControls.append(fatalRecoverySelect);
  fatalRecoveryLabel.appendChild(fatalRecoveryControls);
  const fatalRecoveryMaxLabel = document.createElement("label");
  fatalRecoveryMaxLabel.className = "fcx-routine-field";
  fatalRecoveryMaxLabel.innerHTML = "<span>最大自动刷新次数</span>";
  const fatalRecoveryMaxInput = document.createElement("input");
  fatalRecoveryMaxInput.type = "number";
  fatalRecoveryMaxInput.min = "1";
  fatalRecoveryMaxInput.max = "100";
  fatalRecoveryMaxInput.step = "1";
  fatalRecoveryMaxInput.value = String(
    normalizeRoutineRecoveryMaxReloads(draft.fatalRecoveryMaxReloads)
  );
  fatalRecoveryMaxInput.title = "输入1–100；次数不包含首次执行。";
  fatalRecoveryMaxInput.setAttribute("aria-label", "最大自动刷新次数");
  fatalRecoveryMaxLabel.appendChild(fatalRecoveryMaxInput);
  const syncFatalRecoveryControls = () => {
    fatalRecoverySelect.disabled = !fatalRecoveryEnabledInput.checked;
    fatalRecoveryMaxInput.disabled = !fatalRecoveryEnabledInput.checked;
    fatalRecoveryLabel.classList.toggle(
      "is-disabled",
      !fatalRecoveryEnabledInput.checked
    );
    fatalRecoveryMaxLabel.classList.toggle(
      "is-disabled",
      !fatalRecoveryEnabledInput.checked
    );
  };
  fatalRecoveryEnabledInput.addEventListener("change", syncFatalRecoveryControls);
  syncFatalRecoveryControls();
  basics.append(
    nameLabel,
    descLabel,
    modeLabel,
    totalCyclesLabel,
    ignoreValueRow,
    fatalRecoveryEnabledRow,
    fatalRecoveryLabel,
    fatalRecoveryMaxLabel
  );

  const stepSection = document.createElement("section");
  stepSection.className = "fcx-routine-editor-section";
  const stepHeader = document.createElement("div");
  stepHeader.className = "fcx-routine-section-header";
  stepHeader.innerHTML = "<div><h3>流程步骤</h3><p>逐轮时次数按每轮计算；-1 表示 SBC 做到不能继续，或打开该类型全部库存。</p></div>";
  const stepActions = document.createElement("div");
  stepActions.className = "fcx-routine-step-actions";
  const addStep = createModalButton("添加 SBC");
  const addPackStep = createModalButton("添加开包", "fcx-button--primary");
  stepActions.append(addStep, addPackStep);
  stepHeader.appendChild(stepActions);
  const stepList = document.createElement("div");
  stepList.className = "fcx-routine-step-list";
  stepSection.append(stepHeader, stepList);

  let packGroups = [...initialPackGroups];
  const packGroupByKey = () => new Map(
    packGroups.map((group) => [
      routinePackKey(group.packId, group.tradable),
      group,
    ])
  );

  const createRunsInput = (step) => {
    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = "numeric";
    input.value = String(step.runs);
    input.placeholder = "1–100 / -1";
    input.title = draft.mode === "round_robin"
      ? "本轮执行次数；-1 表示本轮做到不能继续"
      : "本段执行上限；-1 表示做到不能继续";
    input.setAttribute("aria-label", step.kind === "pack" ? "开包次数" : "SBC执行次数");
    input.addEventListener("change", () => {
      step.runs = normalizeRoutineRunsInput(input.value);
      input.value = String(step.runs);
    });
    return input;
  };

  const renderSteps = () => {
    stepList.replaceChildren();
    draft.steps.forEach((step, index) => {
      const row = document.createElement("div");
      row.className = "fcx-routine-step";
      const order = document.createElement("span");
      order.className = "fcx-routine-step-index";
      order.textContent = String(index + 1);
      const copy = document.createElement("div");
      copy.className = "fcx-routine-step-main";
      const select = document.createElement("select");
      let state;
      if (step.kind === "pack") {
        const currentKey = routinePackKey(step.packId, step.tradable);
        const groups = packGroupByKey();
        if (!groups.has(currentKey)) {
          const option = document.createElement("option");
          option.value = currentKey;
          option.textContent = `${step.packName || `卡包 #${step.packId}`}（当前无库存）`;
          select.appendChild(option);
        }
        for (const group of packGroups) {
          const option = document.createElement("option");
          option.value = routinePackKey(group.packId, group.tradable);
          option.textContent = `${group.packName} · ${group.tradable ? "可交易" : "不可交易"}`;
          select.appendChild(option);
        }
        select.value = currentKey;
        select.addEventListener("change", () => {
          const group = groups.get(select.value);
          if (!group) return;
          step.packId = group.packId;
          step.tradable = group.tradable;
          step.packName = group.packName;
          renderSteps();
        });
        const group = groups.get(currentKey);
        state = group
          ? { label: `开包 · 当前 ${group.count} 个`, kind: "available" }
          : { label: "开包 · 当前无库存", kind: "unavailable" };
      } else {
        const known = sets.some((set) => Number(set.id) === Number(step.setId));
        if (!known) {
          const option = document.createElement("option");
          option.value = String(step.setId);
          option.textContent = `SBC #${step.setId}（已过期或不可用）`;
          select.appendChild(option);
        }
        for (const set of sets) {
          const option = document.createElement("option");
          option.value = String(set.id);
          option.textContent = set.name;
          select.appendChild(option);
        }
        select.value = String(step.setId);
        select.addEventListener("change", () => {
          const nextSetId = Number(select.value);
          if (nextSetId !== Number(step.setId)) {
            step.setId = nextSetId;
            delete step.target;
          }
          renderSteps();
        });
        state = getRoutineSetState(setById.get(Number(step.setId)));
      }
      const status = document.createElement("small");
      status.className = `fcx-routine-step-status is-${state.kind}`;
      status.textContent = state.label;
      copy.append(select, status);
      const runs = createRunsInput(step);
      const controls = document.createElement("div");
      controls.className = "fcx-routine-step-controls";
      const up = createModalButton("↑");
      const down = createModalButton("↓");
      const remove = createModalButton("删除", "fcx-button--danger");
      up.disabled = index === 0;
      down.disabled = index === draft.steps.length - 1;
      up.addEventListener("click", () => {
        [draft.steps[index - 1], draft.steps[index]] = [draft.steps[index], draft.steps[index - 1]];
        renderSteps();
      });
      down.addEventListener("click", () => {
        [draft.steps[index], draft.steps[index + 1]] = [draft.steps[index + 1], draft.steps[index]];
        renderSteps();
      });
      remove.addEventListener("click", () => {
        draft.steps.splice(index, 1);
        renderSteps();
      });
      controls.append(up, down, remove);
      row.dataset.stepKind = step.kind;
      row.append(order, copy, runs, controls);
      stepList.appendChild(row);
    });
    if (!draft.steps.length) {
      const empty = document.createElement("p");
      empty.className = "auto-sbc-empty";
      empty.textContent = "请至少添加一个 SBC 或开包步骤。";
      stepList.appendChild(empty);
    }
  };
  addStep.addEventListener("click", () => {
    if (!sets.length) return;
    draft.steps.push({
      kind: "sbc",
      id: `step-${Date.now()}-${draft.steps.length}`,
      setId: Number(sets[0].id),
      runs: 1,
    });
    renderSteps();
  });
  addPackStep.addEventListener("click", async () => {
    try {
      packGroups = await loadAutoSbcPackGroups();
    } catch (error) {
      console.warn("[FCX][Routine] pack choices failed", error);
      packGroups = [];
    }
    if (!packGroups.length) {
      queueFcxNotification([
        "当前没有可添加的卡包，请先获得卡包后再配置。",
        UINotificationType.NEGATIVE,
      ]);
      return;
    }
    const pickerContent = document.createElement("div");
    pickerContent.className = "fcx-routine-pack-picker";
    const choices = document.createElement("div");
    choices.className = "fcx-modal-grid";
    let selectedKey = routinePackKey(
      packGroups[0].packId,
      packGroups[0].tradable
    );
    for (const group of packGroups) {
      const row = document.createElement("label");
      row.className = "fcx-choice-row";
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "fcx-routine-pack-choice";
      radio.value = routinePackKey(group.packId, group.tradable);
      radio.checked = radio.value === selectedKey;
      radio.addEventListener("change", () => {
        if (radio.checked) selectedKey = radio.value;
      });
      const copy = document.createElement("span");
      copy.className = "fcx-choice-copy";
      const title = document.createElement("span");
      title.className = "fcx-choice-title";
      title.textContent = group.packName;
      const meta = document.createElement("span");
      meta.className = "fcx-choice-meta";
      meta.textContent = `${group.tradable ? "可交易" : "不可交易"} · 当前 ${group.count} 个`;
      copy.append(title, meta);
      row.append(radio, copy);
      choices.appendChild(row);
    }
    const quantityLabel = document.createElement("label");
    quantityLabel.className = "fcx-routine-field";
    quantityLabel.innerHTML = "<span>每轮开包数量</span>";
    const quantity = document.createElement("input");
    quantity.type = "text";
    quantity.inputMode = "numeric";
    quantity.value = "1";
    quantity.placeholder = "1–100 或 -1（全部）";
    quantityLabel.appendChild(quantity);
    pickerContent.append(choices, quantityLabel);
    const picker = openFcxModal({
      id: "fcx-routine-pack-picker-modal",
      title: "添加开包步骤",
      description: "选择一种当前持有的卡包。保存后即使暂时没有库存，该步骤也会保留。",
      content: pickerContent,
    });
    const cancel = createModalButton("取消");
    const confirm = createModalButton("添加开包", "fcx-button--primary");
    picker.footer.append(cancel, confirm);
    cancel.addEventListener("click", picker.close);
    confirm.addEventListener("click", () => {
      const group = packGroups.find(
        (candidate) =>
          routinePackKey(candidate.packId, candidate.tradable) === selectedKey
      );
      if (!group) return;
      draft.steps.push({
        kind: "pack",
        id: `pack-${Date.now()}-${draft.steps.length}`,
        packId: group.packId,
        tradable: group.tradable,
        packName: group.packName,
        runs: normalizeRoutineRunsInput(quantity.value),
      });
      picker.close();
      renderSteps();
    });
  });
  renderSteps();

  const fallback = document.createElement("section");
  fallback.className = "fcx-routine-editor-section";
  fallback.innerHTML = "<h3>缺周黑自动做</h3><p>仅在实际周黑候选数低于挑战要求时触发，补给流程不会递归触发自身。</p>";
  const fallbackGrid = document.createElement("div");
  fallbackGrid.className = "fcx-routine-fallback-grid";
  const enabledLabel = document.createElement("label");
  enabledLabel.className = "fcx-routine-check";
  const enabled = document.createElement("input");
  enabled.type = "checkbox";
  enabled.checked = draft.totwFallback.enabled;
  enabledLabel.append(enabled, document.createTextNode("启用缺周黑自动补给"));
  const fallbackSelect = document.createElement("select");
  const fallbackKnown = sets.some(
    (set) => Number(set.id) === Number(draft.totwFallback.setId)
  );
  if (!fallbackKnown) {
    const option = document.createElement("option");
    option.value = String(draft.totwFallback.setId);
    option.textContent = `84+ TOTW 升级（回退 ID ${draft.totwFallback.setId}）`;
    fallbackSelect.appendChild(option);
  }
  for (const set of sets) {
    const option = document.createElement("option");
    option.value = String(set.id);
    option.textContent = set.name;
    fallbackSelect.appendChild(option);
  }
  fallbackSelect.value = String(draft.totwFallback.setId);
  const fallbackRuns = document.createElement("input");
  fallbackRuns.type = "number";
  fallbackRuns.min = "1";
  fallbackRuns.step = "1";
  fallbackRuns.value = String(draft.totwFallback.runs);
  fallbackRuns.title = "补给执行次数";
  fallbackGrid.append(enabledLabel, fallbackSelect, fallbackRuns);
  fallback.appendChild(fallbackGrid);

  const solveFailureFallback = document.createElement("section");
  solveFailureFallback.className = "fcx-routine-editor-section";
  solveFailureFallback.innerHTML =
    "<h3>求解失败自动做</h3><p>目标SBC无解或无法满足评分窗口时，先完成所选SBC并开启准确奖励，再重试原步骤一次；输入 -1 持续执行。</p>";
  const solveFailureFallbackGrid = document.createElement("div");
  solveFailureFallbackGrid.className = "fcx-routine-fallback-grid";
  const solveFailureEnabledLabel = document.createElement("label");
  solveFailureEnabledLabel.className = "fcx-routine-check";
  const solveFailureEnabled = document.createElement("input");
  solveFailureEnabled.type = "checkbox";
  solveFailureEnabled.checked = draft.solveFailureFallback?.enabled === true;
  solveFailureEnabledLabel.append(
    solveFailureEnabled,
    document.createTextNode("启用求解失败自动做")
  );
  const solveFailureSelect = document.createElement("select");
  const solveFailurePlaceholder = document.createElement("option");
  solveFailurePlaceholder.value = "0";
  solveFailurePlaceholder.textContent = "请选择补偿 SBC";
  solveFailureSelect.appendChild(solveFailurePlaceholder);
  const solveFailureSetId = Number(draft.solveFailureFallback?.setId || 0);
  const solveFailureKnown = sets.some(
    (set) => Number(set.id) === solveFailureSetId
  );
  if (solveFailureSetId > 0 && !solveFailureKnown) {
    const option = document.createElement("option");
    option.value = String(solveFailureSetId);
    option.textContent = `SBC #${solveFailureSetId}（已过期或不可用）`;
    solveFailureSelect.appendChild(option);
  }
  for (const set of sets) {
    const option = document.createElement("option");
    option.value = String(set.id);
    option.textContent = set.name;
    solveFailureSelect.appendChild(option);
  }
  solveFailureSelect.value = String(solveFailureSetId);
  const solveFailureRuns = document.createElement("input");
  solveFailureRuns.type = "text";
  solveFailureRuns.inputMode = "numeric";
  solveFailureRuns.value = String(draft.solveFailureFallback?.runs || 1);
  solveFailureRuns.title = "输入 1–100；-1 表示持续执行";
  solveFailureFallbackGrid.append(
    solveFailureEnabledLabel,
    solveFailureSelect,
    solveFailureRuns
  );
  solveFailureFallback.appendChild(solveFailureFallbackGrid);

  const storageFallback = document.createElement("section");
  storageFallback.className = "fcx-routine-editor-section";
  storageFallback.innerHTML =
    "<h3>仓库满自动清仓</h3><p>开包遇到SBC仓库已满时，按设置次数完成所选SBC释放位置，并继续当前流程；输入 -1 持续执行。</p>";
  const storageFallbackGrid = document.createElement("div");
  storageFallbackGrid.className = "fcx-routine-fallback-grid";
  const storageEnabledLabel = document.createElement("label");
  storageEnabledLabel.className = "fcx-routine-check";
  const storageEnabled = document.createElement("input");
  storageEnabled.type = "checkbox";
  storageEnabled.checked = draft.storageFallback?.enabled === true;
  storageEnabledLabel.append(
    storageEnabled,
    document.createTextNode("启用仓库满自动清仓")
  );
  const storageSelect = document.createElement("select");
  const storagePlaceholder = document.createElement("option");
  storagePlaceholder.value = "0";
  storagePlaceholder.textContent = "请选择清仓 SBC";
  storageSelect.appendChild(storagePlaceholder);
  const storageSetId = Number(draft.storageFallback?.setId || 0);
  const storageKnown = sets.some(
    (set) => Number(set.id) === storageSetId
  );
  if (storageSetId > 0 && !storageKnown) {
    const option = document.createElement("option");
    option.value = String(storageSetId);
    option.textContent = `SBC #${storageSetId}（已过期或不可用）`;
    storageSelect.appendChild(option);
  }
  for (const set of sets) {
    const option = document.createElement("option");
    option.value = String(set.id);
    option.textContent = set.name;
    storageSelect.appendChild(option);
  }
  storageSelect.value = String(storageSetId);
  const storageRuns = document.createElement("input");
  storageRuns.type = "number";
  storageRuns.min = "-1";
  storageRuns.max = "100";
  storageRuns.step = "1";
  storageRuns.value = String(draft.storageFallback?.runs || 1);
  storageRuns.title = "输入 1–100；-1 表示持续执行";
  storageFallbackGrid.append(storageEnabledLabel, storageSelect, storageRuns);
  storageFallback.appendChild(storageFallbackGrid);
  content.append(
    basics,
    stepSection,
    fallback,
    solveFailureFallback,
    storageFallback
  );

  const modal = openFcxModal({
    id: "fcx-routine-editor-modal",
    title: routine.origin === "builtin" ? "编辑内置流程" : "编辑自定义流程",
    description: "流程修改仅保存在当前浏览器。",
    content,
  });
  modal.panel.classList.add("fcx-modal-panel--routine");
  const back = createModalButton("返回");
  const destructive = routine.origin === "builtin"
    ? createModalButton("恢复默认")
    : createModalButton("删除流程", "fcx-button--danger");
  const save = createModalButton("保存");
  const start = createModalButton("保存并启动", "fcx-button--primary");
  modal.footer.append(back, destructive, save, start);

  const applyFields = () => {
    draft.name = nameInput.value.trim();
    draft.description = descInput.value.trim();
    draft.mode = modeSelect.value === "round_robin" ? "round_robin" : "exhaust_step";
    draft.totalCycles = normalizeRoutineRunsInput(totalCyclesInput.value, 5);
    totalCyclesInput.value = String(draft.totalCycles);
    draft.ignoreValue = ignoreValueInput.checked;
    draft.fatalRecoveryEnabled = fatalRecoveryEnabledInput.checked;
    draft.fatalRecoveryMode = fatalRecoverySelect.value === "stop"
      ? "stop"
      : fatalRecoverySelect.value === "resume"
        ? "resume"
        : "restart";
    draft.fatalRecoveryMaxReloads = normalizeRoutineRecoveryMaxReloads(
      fatalRecoveryMaxInput.value
    );
    fatalRecoveryMaxInput.value = String(draft.fatalRecoveryMaxReloads);
    draft.totwFallback.enabled = enabled.checked;
    draft.totwFallback.setId = Number(fallbackSelect.value) || 1017;
    draft.totwFallback.runs = Math.max(1, Math.trunc(Number(fallbackRuns.value) || 1));
    draft.solveFailureFallback = {
      enabled: solveFailureEnabled.checked,
      setId: Number(solveFailureSelect.value) || 0,
      runs: normalizeRoutineRunsInput(solveFailureRuns.value, 1),
    };
    solveFailureRuns.value = String(draft.solveFailureFallback.runs);
    draft.storageFallback = {
      enabled: storageEnabled.checked,
      setId: Number(storageSelect.value) || 0,
      runs: Math.trunc(Number(storageRuns.value)) === -1
        ? -1
        : Math.min(
            100,
            Math.max(1, Math.trunc(Number(storageRuns.value)) || 1),
          ),
    };
    storageRuns.value = String(draft.storageFallback.runs);
    const solveFailureSet = setById.get(
      Number(draft.solveFailureFallback.setId)
    );
    if (
      draft.solveFailureFallback.enabled
      && (
        !draft.solveFailureFallback.setId
        || getRoutineSetState(solveFailureSet).kind !== "available"
      )
    ) {
      queueFcxNotification([
        "请先选择一个当前可用的求解失败补偿 SBC。",
        UINotificationType.NEGATIVE,
      ]);
      return false;
    }
    const storageSet = setById.get(Number(draft.storageFallback.setId));
    if (
      draft.storageFallback.enabled
      && (
        !draft.storageFallback.setId
        || getRoutineSetState(storageSet).kind !== "available"
      )
    ) {
      queueFcxNotification([
        "请先选择一个当前可用的清仓 SBC。",
        UINotificationType.NEGATIVE,
      ]);
      return false;
    }
    if (!draft.name || !draft.steps.length) {
      queueFcxNotification([
        "请填写流程名称并至少添加一个 SBC 或开包步骤。",
        UINotificationType.NEGATIVE,
      ]);
      return false;
    }
    return true;
  };
  back.addEventListener("click", () => {
    modal.close();
    openRoutineCenter();
  });
  destructive.addEventListener("click", () => {
    if (routine.origin === "builtin") fcxRoutineStore.resetBuiltin(routine.id);
    else fcxRoutineStore.deleteCustom(routine.id);
    modal.close();
    openRoutineCenter();
  });
  save.addEventListener("click", () => {
    if (!applyFields()) return;
    fcxRoutineStore.save(draft);
    queueFcxNotification(["滚卡流程已保存。", UINotificationType.POSITIVE]);
    modal.close();
    openRoutineCenter();
  });
  start.addEventListener("click", async () => {
    if (!applyFields()) return;
    if (hasBlockingFcxTask()) {
      queueFcxNotification([
        "当前FCX任务尚未结束，请稍候。",
        UINotificationType.NEGATIVE,
      ]);
      return;
    }
    fcxRoutineStore.save(draft);
    const savedRoutine = fcxRoutineStore.get(draft.id);
    if (!savedRoutine) {
      queueFcxNotification([
        "流程保存后读取失败，请重新打开后再试。",
        UINotificationType.NEGATIVE,
      ]);
      return;
    }
    const currentlyAvailable = savedRoutine.steps.some(
      (step) => step.kind === "pack"
        || getRoutineSetState(setById.get(Number(step.setId))).kind === "available"
    );
    if (!currentlyAvailable) {
      queueFcxNotification(["该流程当前没有可执行的步骤。", UINotificationType.NEGATIVE]);
      return;
    }
    modal.close();
    await runFcxRoutine(savedRoutine);
  });
};
