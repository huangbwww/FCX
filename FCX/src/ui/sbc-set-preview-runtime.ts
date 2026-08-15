// @ts-nocheck

const reviewWholeSbcSetPlan = (plan, excludedItemIds, { ignoreValue = false } = {}) =>
  new Promise((resolve) => {
    const exclusions = new Set([...excludedItemIds].map(Number));
    const content = document.createElement("div");
    content.className = "fcx-set-preview";
    let modal;

    if (exclusions.size) {
      const excluded = document.createElement("section");
      excluded.className = "fcx-set-preview__excluded";
      const title = document.createElement("strong");
      title.textContent = `本次临时排除 ${exclusions.size} 名球员`;
      const undo = createModalButton("撤销全部排除");
      undo.addEventListener("click", () => {
        modal.close();
        resolve({ action: "replan", excludedItemIds: new Set() });
      });
      excluded.append(title, undo);
      content.appendChild(excluded);
    }

    let totalCost = 0;
    let totalPlayers = 0;
    for (const challenge of plan.challenges) {
      const payload = challenge.payload || {};
      const squad = (payload.solutionSquad || []).filter((item) => Number(item?.id) > 0);
      const cost = Number(payload.totalCost || 0);
      totalCost += cost;
      totalPlayers += squad.length;
      const section = document.createElement("section");
      section.className = "fcx-set-preview__challenge";
      const heading = document.createElement("div");
      heading.className = "fcx-set-preview__heading";
      const windowLabel = payload.ratingWindow
        ? `${Number(payload.ratingWindow.minimum).toFixed(2)}–${Number(payload.ratingWindow.maximum).toFixed(2)}`
        : "无评分窗口";
      heading.innerHTML = `<strong>${challenge.name}</strong><span>目标 ${windowLabel} · 实际 ${payload.actualRating == null ? "—" : Number(payload.actualRating).toFixed(2)} · ${ignoreValue ? "本次忽略价值" : `预计 ${Math.round(cost).toLocaleString()}`}</span>`;
      const list = document.createElement("div");
      list.className = "fcx-set-preview__players";
      for (const player of squad) {
        const row = document.createElement("div");
        row.className = "fcx-set-preview__player";
        const rating = Number(player?._rating ?? player?.rating) || 0;
        const name = String(player?._staticData?.name || player?.name || player?.definitionId || "球员");
        const flags = [
          player?.isStorage ? "仓库" : "俱乐部",
          player?.isDuplicate ? "重复" : "非重复",
          player?.isTradeable?.() === true ? "可交易" : "不可交易",
        ].join(" · ");
        const copy = document.createElement("span");
        copy.innerHTML = `<strong>${rating} ${name}</strong><small>${flags}</small>`;
        const exclude = createModalButton("排除并重新规划", "fcx-button--danger");
        exclude.addEventListener("click", () => {
          exclusions.add(Number(player.id));
          modal.close();
          resolve({ action: "replan", excludedItemIds: exclusions });
        });
        row.append(copy, exclude);
        list.appendChild(row);
      }
      section.append(heading, list);
      content.appendChild(section);
    }

    modal = openFcxModal({
      id: "fcx-whole-set-preview-modal",
      title: `整组提交预览 · ${plan.setName}`,
      description: `${plan.challenges.length} 个挑战 · ${totalPlayers} 名球员 · ${ignoreValue ? "本次忽略价值" : `总预计成本 ${Math.round(totalCost).toLocaleString()}`}。确认前不会应用、保存或提交阵容。`,
      content,
      dismissible: false,
      taskInteraction: true,
    });
    modal.panel.classList.add("fcx-modal-panel--routine");
    const cancel = createModalButton("取消任务");
    const replan = createModalButton("重新规划");
    const submit = createModalButton("确认并提交", "fcx-button--primary");
    cancel.addEventListener("click", () => {
      modal.close();
      resolve({ action: "cancel", reason: "用户取消了整组提交。" });
    });
    replan.addEventListener("click", () => {
      modal.close();
      resolve({ action: "replan", excludedItemIds: exclusions });
    });
    submit.addEventListener("click", () => {
      modal.close();
      resolve({ action: "submit" });
    });
    modal.footer.append(cancel, replan, submit);
  });
