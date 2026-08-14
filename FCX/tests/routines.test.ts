import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { builtinRoutines } from "../src/config/builtin-routines";
import { runRoutineSchedule } from "../src/domain/routines/scheduler";
import {
  detectTotwShortage,
  hasSupportedSpecialRequirement,
} from "../src/domain/routines/special-shortage";
import {
  ROUTINE_STORAGE_KEY,
  RoutineStore,
} from "../src/state/routine-store";
import { SubmissionCounter } from "../src/state/submission-counter";
import type { RoutineStepResult } from "../src/types/routines";

class MemoryStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function done(stepId: string, setId: number): RoutineStepResult {
  return {
    stepId,
    stepKind: "sbc",
    setId,
    completedRuns: 1,
    rewardPackIds: [setId + 10_000],
    stopKind: "done",
  };
}

const sbcStep = (id: string, setId: number, runs = 1) => ({
  kind: "sbc" as const,
  id,
  setId,
  runs,
});

const packStep = (
  id: string,
  packId: number,
  runs = 1,
  tradable = false,
) => ({
  kind: "pack" as const,
  id,
  packId,
  packName: `卡包 ${packId}`,
  tradable,
  runs,
});

const stepTargetId = (step: { kind: "sbc"; setId: number } | { kind: "pack"; packId: number }) =>
  step.kind === "sbc" ? step.setId : step.packId;

describe("FCX routine definitions", () => {
  it("ships seven validated offline fallback routines", () => {
    expect(builtinRoutines).toHaveLength(7);
    expect(builtinRoutines.map((routine) => routine.id)).toEqual([
      "upgrade-80-x5",
      "upgrade-85-x10",
      "upgrade-84-x10",
      "solve-all-dailies",
      "provisions-to-picks",
      "totw-x5",
      "futties-provisions-x5",
    ]);
    expect(builtinRoutines.every((routine) => routine.ignoreValue)).toBe(true);
    expect(
      builtinRoutines.every(
        (routine) =>
          !routine.storageFallback.enabled
          && routine.storageFallback.setId === 0
          && routine.storageFallback.runs === 1,
      ),
    ).toBe(true);
    const runtime = readFileSync(
      resolve(import.meta.dirname, "../src/ui/routines-runtime.ts"),
      "utf8",
    );
    expect(runtime).not.toContain('fetch("https://third-party.invalid/config');
    expect(runtime).not.toContain("推荐流程已有新版");
    expect(runtime).not.toContain("恢复最新推荐");
    expect(runtime).toContain("流程修改仅保存在当前浏览器。");
    expect(runtime).toContain('createModalButton("恢复默认")');
    const packsRuntime = readFileSync(
      resolve(import.meta.dirname, "../src/domain/packs/runtime.ts"),
      "utf8",
    );
    expect(packsRuntime).toContain("btnRoutineRoll");
    expect(packsRuntime).not.toContain("btnAutoGrind");
    expect(packsRuntime).not.toContain("futAutoGrind");
    expect(packsRuntime).not.toContain("const openPick = async");
    expect(packsRuntime).toContain("小时 ${submitSnapshot.hour}/${submitSnapshot.hourLimit}");
  });

  it("records every FCX submit without blocking at the reminder thresholds", () => {
    const hooks = readFileSync(
      resolve(import.meta.dirname, "../src/hooks/items-runtime.ts"),
      "utf8",
    );
    const sbcRuntime = readFileSync(
      resolve(import.meta.dirname, "../src/domain/sbc/runtime.ts"),
      "utf8",
    );
    const inventoryRuntime = readFileSync(
      resolve(import.meta.dirname, "../src/domain/inventory/runtime.ts"),
      "utf8",
    );
    const settingsRuntime = readFileSync(
      resolve(import.meta.dirname, "../src/ui/settings-runtime.ts"),
      "utf8",
    );
    expect(hooks).toContain("observeSubmissionCount(1)");
    expect(hooks).toContain("recordSuccessfulSubmission()");
    expect(sbcRuntime).toContain("observeSubmissionCount(unfinished.length)");
    expect(sbcRuntime).not.toContain("ensureSubmissionCapacity");
    expect(inventoryRuntime).toContain("const observeSubmissionCount");
    expect(inventoryRuntime).toContain("blocking: false");
    expect(inventoryRuntime).not.toContain("已达到SBC提交限制");
    expect(settingsRuntime).toContain("每小时 FCX 提交提醒值");
    expect(settingsRuntime).toContain("默认 300，仅提醒、不限制");
    const routineRuntime = readFileSync(
      resolve(import.meta.dirname, "../src/domain/routines/runtime.ts"),
      "utf8",
    );
    expect(routineRuntime).not.toContain("counterSnapshot.remaining");
    expect(routineRuntime).not.toContain("全局提交余量不足");
  });

  it("persists builtin overrides and supports custom deletion and restore", () => {
    const storage = new MemoryStorage();
    const store = new RoutineStore(storage);
    const builtin = store.get("totw-x5")!;
    store.save({ ...builtin, name: "我的周黑流程", ignoreValue: true });
    expect(new RoutineStore(storage).get("totw-x5")?.name).toBe("我的周黑流程");
    expect(new RoutineStore(storage).get("totw-x5")?.ignoreValue).toBe(true);
    expect(store.resetBuiltin("totw-x5")).toBe(true);
    expect(store.get("totw-x5")?.name).not.toBe("我的周黑流程");

    const custom = store.create("自定义测试");
    expect(custom.ignoreValue).toBe(true);
    expect(custom.storageFallback).toEqual({ enabled: false, setId: 0, runs: 1 });
    custom.steps.push(sbcStep("one", 1017));
    store.save(custom);
    expect(store.get(custom.id)?.origin).toBe("custom");
    expect(store.deleteCustom(custom.id)).toBe(true);
    expect(store.get(custom.id)).toBeUndefined();
  });

  it("drops stale target metadata when a saved step points at another SBC", () => {
    const storage = new MemoryStorage();
    const store = new RoutineStore(storage);
    const builtin = store.get("provisions-to-picks")!;
    const pick = builtin.steps.find((step) => step.id === "player-pick")!;
    expect(pick.kind).toBe("sbc");
    if (pick.kind !== "sbc") throw new Error("expected SBC step");

    pick.setId = 1500;
    store.save(builtin);
    const saved = new RoutineStore(storage).get("provisions-to-picks")!;
    expect(saved.steps.find((step) => step.id === "player-pick"))
      .toMatchObject({ kind: "sbc", setId: 1500 });
    expect((saved.steps.find((step) => step.id === "player-pick") as any).target)
      .toBeUndefined();

    const document = JSON.parse(storage.values.get(ROUTINE_STORAGE_KEY)!);
    expect(document.builtinOverrides["provisions-to-picks"].steps[1].target)
      .toBeUndefined();
  });

  it("sanitizes an already persisted setId and preferredSetId conflict", () => {
    const storage = new MemoryStorage();
    const builtin = builtinRoutines.find((routine) => routine.id === "provisions-to-picks")!;
    const stale = structuredClone(builtin);
    const pick = stale.steps.find((step) => step.id === "player-pick")!;
    if (pick.kind !== "sbc" || !pick.target) throw new Error("expected targeted SBC step");
    pick.setId = 1500;
    pick.target.preferredSetId = 1332;
    storage.setItem(ROUTINE_STORAGE_KEY, JSON.stringify({
      version: 4,
      builtinOverrides: { [stale.id]: stale },
      custom: {},
    }));

    const store = new RoutineStore(storage);
    const saved = store.get(stale.id)!;
    expect((saved.steps.find((step) => step.id === "player-pick") as any).target)
      .toBeUndefined();
    expect(JSON.parse(storage.values.get(ROUTINE_STORAGE_KEY)!)
      .builtinOverrides[stale.id].steps[1].target).toBeUndefined();
  });

  it("defaults old saved routines without ignoreValue to protected value mode", () => {
    const storage = new MemoryStorage();
    storage.setItem(ROUTINE_STORAGE_KEY, JSON.stringify({
      version: 1,
      builtinOverrides: {},
      custom: {
        legacy: {
          id: "legacy",
          origin: "custom",
          name: "旧流程",
          description: "",
          mode: "round_robin",
          steps: [{ id: "one", setId: 1017, maxRuns: 1 }],
          totwFallback: { enabled: true, setId: 1017, runs: 1 },
        },
      },
    }));

    expect(new RoutineStore(storage).get("legacy")?.ignoreValue).toBe(false);
    expect(new RoutineStore(storage).get("legacy")?.totalCycles).toBe(5);
    expect(new RoutineStore(storage).get("legacy")?.steps[0]).toEqual(
      sbcStep("one", 1017),
    );
    expect(new RoutineStore(storage).get("legacy")?.storageFallback).toEqual({
      enabled: false,
      setId: 0,
      runs: 1,
    });
    expect(JSON.parse(storage.values.get(ROUTINE_STORAGE_KEY)!).version).toBe(4);
  });

  it("persists typed pack steps and bounds cycle and step counts", () => {
    const storage = new MemoryStorage();
    const store = new RoutineStore(storage);
    const custom = store.create("混合流程");
    custom.totalCycles = 500;
    custom.steps.push(packStep("pack", 9001, 500, true));
    store.save(custom);
    const saved = new RoutineStore(storage).get(custom.id)!;
    expect(saved.totalCycles).toBe(100);
    expect(saved.steps[0]).toEqual(packStep("pack", 9001, 100, true));
    expect(JSON.parse(storage.values.get(ROUTINE_STORAGE_KEY)!).version).toBe(4);
  });

  it("ships the mixed step editor and keeps numeric inputs spinner-free", () => {
    const source = readFileSync(
      resolve(import.meta.dirname, "../src/ui/routines-runtime.ts"),
      "utf8",
    );
    expect(source).toContain('createModalButton("添加开包"');
    expect(source).toContain('stepHeader.innerHTML = "<div><h3>流程步骤</h3>');
    expect(source).toContain('totalCyclesInput.type = "text"');
    expect(source).toContain('input.inputMode = "numeric"');
    expect(source).toContain("delete step.target");
    expect(source).toContain("const savedRoutine = fcxRoutineStore.get(draft.id)");
    expect(source).toContain("await runFcxRoutine(savedRoutine)");
    const runtime = readFileSync(
      resolve(import.meta.dirname, "../src/domain/routines/runtime.ts"),
      "utf8",
    );
    expect(runtime).toContain("executeRoutinePackStep");
    expect(runtime).toContain("runPackSelections(");
    expect(runtime).toContain("showSummary: false");
    expect(runtime).toContain("createStorageOverflowRecovery(packExecution)");
    expect(runtime).not.toContain("probeRequestedRuns");
    expect(runtime).not.toContain("probeRepeatable");
  });

  it("reads at most one configured or uniquely resolved SBC target", () => {
    const runtime = readFileSync(
      resolve(import.meta.dirname, "../src/domain/routines/runtime.ts"),
      "utf8",
    );
    expect(runtime).toContain("getChallenges(candidate, true)");
    expect(runtime).toContain("challengeRequestCount > 1");
    expect(runtime).toContain("candidateCount:");
    expect(runtime).toContain("matchedRating:");
    expect(runtime).toContain("initialExecutionState:");
    expect(runtime).toContain("isEaThrottleStatus(status)");
    expect(runtime).not.toContain("target resolved by live catalog");
  });
});

describe("routine scheduling semantics", () => {
  it("runs round-robin as A → A reward → B → B reward", async () => {
    const events: string[] = [];
    const routine = {
      ...builtinRoutines[0]!,
      mode: "round_robin" as const,
      totalCycles: 1,
      steps: [
        sbcStep("a", 1),
        sbcStep("b", 2),
      ],
    };
    await runRoutineSchedule(routine, {
      isCancelled: () => false,
      runStep: async (step) => {
        events.push(`run:${step.id}`);
        return done(step.id, stepTargetId(step));
      },
      openRewards: async (result) => {
        events.push(`pack:${result.stepId}`);
        return true;
      },
    });
    expect(events).toEqual(["run:a", "pack:a", "run:b", "pack:b"]);
  });

  it("repeats the complete mixed workflow using per-cycle counts", async () => {
    const events: string[] = [];
    const cycles: number[] = [];
    const routine = {
      ...builtinRoutines[0]!,
      mode: "round_robin" as const,
      totalCycles: 3,
      steps: [
        sbcStep("a", 1, 1),
        sbcStep("b", 2, 5),
        packStep("open", 9001, 2),
      ],
    };
    await runRoutineSchedule(routine, {
      isCancelled: () => false,
      onCycleStart: (cycle) => cycles.push(cycle),
      runStep: async (step, runs) => {
        events.push(`run:${step.id}:${runs}`);
        if (step.kind === "pack") {
          return {
            stepId: step.id,
            stepKind: "pack",
            packId: step.packId,
            completedRuns: 0,
            packsOpened: runs,
            progressUnits: runs,
            rewardPackIds: [],
            stopKind: "done",
          };
        }
        return {
          ...done(step.id, step.setId),
          completedRuns: runs,
          progressUnits: runs,
        };
      },
      openRewards: async (result) => {
        events.push(`reward:${result.stepId}`);
        return true;
      },
    });
    expect(cycles).toEqual([0, 1, 2]);
    expect(events).toEqual([
      "run:a:1", "reward:a", "run:b:5", "reward:b", "run:open:2",
      "run:a:1", "reward:a", "run:b:5", "reward:b", "run:open:2",
      "run:a:1", "reward:a", "run:b:5", "reward:b", "run:open:2",
    ]);
  });

  it("stops an unlimited cycle plan after a complete zero-progress cycle", async () => {
    let calls = 0;
    const routine = {
      ...builtinRoutines[0]!,
      mode: "round_robin" as const,
      totalCycles: -1,
      steps: [sbcStep("a", 1, -1), packStep("open", 9001, -1)],
    };
    const result = await runRoutineSchedule(routine, {
      isCancelled: () => false,
      runStep: async (step) => {
        calls += 1;
        return {
          stepId: step.id,
          stepKind: step.kind,
          ...(step.kind === "sbc" ? { setId: step.setId } : { packId: step.packId }),
          completedRuns: 0,
          packsOpened: 0,
          progressUnits: 0,
          rewardPackIds: [],
          stopKind: "unavailable",
        };
      },
      openRewards: async () => true,
    });
    expect(calls).toBe(2);
    expect(result.stoppedReason).toContain("无进展");
  });

  it("runs segmented steps once with their configured cap and opens afterwards", async () => {
    const events: string[] = [];
    const requested: number[] = [];
    const routine = {
      ...builtinRoutines[0]!,
      mode: "exhaust_step" as const,
      steps: [
        sbcStep("a", 1, -1),
        sbcStep("b", 2, 4),
      ],
    };
    await runRoutineSchedule(routine, {
      isCancelled: () => false,
      runStep: async (step, runs) => {
        requested.push(runs);
        events.push(`run:${step.id}`);
        return done(step.id, stepTargetId(step));
      },
      openRewards: async (result) => {
        events.push(`pack:${result.stepId}`);
        return true;
      },
    });
    expect(requested).toEqual([-1, 4]);
    expect(events).toEqual(["run:a", "pack:a", "run:b", "pack:b"]);
  });

  it("runs a segmented pack step without treating it as an SBC reward", async () => {
    const events: string[] = [];
    const routine = {
      ...builtinRoutines[0]!,
      mode: "exhaust_step" as const,
      steps: [packStep("open", 9001, -1)],
    };
    await runRoutineSchedule(routine, {
      isCancelled: () => false,
      runStep: async (step, runs) => {
        events.push(`run:${step.id}:${runs}`);
        return {
          stepId: step.id,
          stepKind: "pack",
          packId: step.kind === "pack" ? step.packId : 0,
          completedRuns: 0,
          packsOpened: 3,
          progressUnits: 3,
          rewardPackIds: [],
          stopKind: "done",
        };
      },
      openRewards: async () => {
        events.push("unexpected-reward");
        return true;
      },
    });
    expect(events).toEqual(["run:open:-1"]);
  });

  it("continues after a zero-submit no-solution step without opening a pack", async () => {
    const events: string[] = [];
    const routine = {
      ...builtinRoutines[0]!,
      steps: [
        sbcStep("a", 1),
        sbcStep("b", 2),
      ],
    };
    const result = await runRoutineSchedule(routine, {
      isCancelled: () => false,
      runStep: async (step) => {
        events.push(`run:${step.id}`);
        return step.id === "a"
          ? {
              stepId: "a",
              stepKind: "sbc",
              setId: 1,
              completedRuns: 0,
              rewardPackIds: [],
              stopKind: "no_solution",
            }
          : done(step.id, stepTargetId(step));
      },
      openRewards: async (result) => {
        events.push(`pack:${result.stepId}`);
        return true;
      },
    });
    expect(events).toEqual(["run:a", "run:b", "pack:b"]);
    expect(result.notices).toEqual([]);
  });

  it("preserves a no-solution reason as a non-fatal routine notice", async () => {
    const routine = {
      ...builtinRoutines[0]!,
      mode: "exhaust_step" as const,
      steps: [sbcStep("a", 1), sbcStep("b", 2)],
    };
    const result = await runRoutineSchedule(routine, {
      isCancelled: () => false,
      runStep: async (step) => step.id === "a"
        ? {
            stepId: "a",
            stepKind: "sbc",
            setId: 1,
            completedRuns: 0,
            rewardPackIds: [],
            stopKind: "no_solution",
            reason: "步骤“A”已跳过：无法找到可行方案。",
          }
        : done(step.id, stepTargetId(step)),
      openRewards: async () => true,
    });
    expect(result.stoppedReason).toBeUndefined();
    expect(result.notices).toEqual(["步骤“A”已跳过：无法找到可行方案。"]);
  });

  it("opens A rewards and continues to B after an unlimited A step is exhausted", async () => {
    const events: string[] = [];
    const routine = {
      ...builtinRoutines[0]!,
      mode: "exhaust_step" as const,
      steps: [
        sbcStep("a", 1, -1),
        sbcStep("b", 2, -1),
      ],
    };
    const result = await runRoutineSchedule(routine, {
      isCancelled: () => false,
      runStep: async (step) => {
        events.push(`run:${step.id}`);
        return step.id === "a"
          ? {
              stepId: "a",
              stepKind: "sbc",
              setId: 1,
              completedRuns: 4,
              rewardPackIds: [101],
              stopKind: "exhausted",
              reason: "A 已经没有可执行次数",
            }
          : done(step.id, stepTargetId(step));
      },
      openRewards: async (step) => {
        events.push(`pack:${step.stepId}`);
        return true;
      },
    });
    expect(events).toEqual(["run:a", "pack:a", "run:b", "pack:b"]);
    expect(result.stoppedReason).toBeUndefined();
  });

  it("continues to B when A cannot satisfy its required special-card group", async () => {
    const events: string[] = [];
    const routine = {
      ...builtinRoutines[0]!,
      mode: "exhaust_step" as const,
      steps: [
        sbcStep("a", 1, -1),
        sbcStep("b", 2, -1),
      ],
    };
    const result = await runRoutineSchedule(routine, {
      isCancelled: () => false,
      runStep: async (step) => {
        events.push(`run:${step.id}`);
        return step.id === "a"
          ? {
              stepId: "a",
              stepKind: "sbc",
              setId: 1,
              completedRuns: 0,
              rewardPackIds: [],
              stopKind: "special_shortage",
              reason: "步骤“A”已跳过：缺少周黑或特殊卡，且未启用自动补给。",
            }
          : done(step.id, stepTargetId(step));
      },
      openRewards: async (step) => {
        events.push(`pack:${step.stepId}`);
        return true;
      },
    });
    expect(events).toEqual(["run:a", "run:b", "pack:b"]);
    expect(result.notices).toEqual([
      "步骤“A”已跳过：缺少周黑或特殊卡，且未启用自动补给。",
    ]);
  });

  it("still stops before B after a real submit failure", async () => {
    const events: string[] = [];
    const routine = {
      ...builtinRoutines[0]!,
      mode: "exhaust_step" as const,
      steps: [
        sbcStep("a", 1, -1),
        sbcStep("b", 2, -1),
      ],
    };
    const result = await runRoutineSchedule(routine, {
      isCancelled: () => false,
      runStep: async (step) => {
        events.push(`run:${step.id}`);
        return {
          stepId: step.id,
          stepKind: step.kind,
          setId: stepTargetId(step),
          completedRuns: 0,
          rewardPackIds: [],
          stopKind: "submit_failed",
          reason: "EA提交失败",
        };
      },
      openRewards: async () => true,
    });
    expect(events).toEqual(["run:a"]);
    expect(result.stoppedReason).toBe("EA提交失败");
  });

  it("does not start a reward operation after cancellation", async () => {
    let cancelled = false;
    let opened = false;
    const routine = {
      ...builtinRoutines[0]!,
      steps: [sbcStep("a", 1)],
    };
    await runRoutineSchedule(routine, {
      isCancelled: () => cancelled,
      runStep: async (step) => {
        cancelled = true;
        return done(step.id, stepTargetId(step));
      },
      openRewards: async () => {
        opened = true;
        return true;
      },
    });
    expect(opened).toBe(false);
  });
});

describe("TOTW shortage and global submission counts", () => {
  it("shows fallback only for positive group 23/83 requirements", () => {
    const requirement = (
      eligibilityValues: number[],
      scope: "GREATER" | "LOWER" | "EXACT" = "EXACT",
      count = 1,
      requirementKey = "PLAYER_RARITY_GROUP",
    ) => ({ requirementKey, eligibilityValues, scope, count });

    expect(hasSupportedSpecialRequirement([requirement([23])])).toBe(true);
    expect(hasSupportedSpecialRequirement([requirement([83])])).toBe(true);
    expect(hasSupportedSpecialRequirement([requirement([23, 83])])).toBe(true);
    expect(hasSupportedSpecialRequirement([requirement([4])])).toBe(false);
    expect(
      hasSupportedSpecialRequirement([requirement([83], "LOWER")]),
    ).toBe(false);
    expect(
      hasSupportedSpecialRequirement([requirement([83], "EXACT", 0)]),
    ).toBe(false);
    expect(hasSupportedSpecialRequirement([
      requirement([83], "EXACT", 1, "PLAYER_QUALITY"),
    ])).toBe(false);
  });

  it("reports group 23 when the actual backend-eligible pool is short", () => {
    const constraints = [
      {
        requirementKey: "PLAYER_RARITY_GROUP",
        eligibilityValues: [23],
        scope: "EXACT",
        count: 2,
      },
    ];
    expect(
      detectTotwShortage(constraints as never, [{ groups: [23], price: 10_000 }], 77),
    ).toEqual({ groupIds: [23], required: 2, available: 1, challengeId: 77 });
    expect(
      detectTotwShortage(
        constraints as never,
        [{ groups: [23], price: 10_000 }, { groups: [23, 4], price: 50_000 }],
        77,
      ),
    ).toBeUndefined();
  });

  it("supports group 83 and counts a multi-group candidate only once", () => {
    const constraints = [{
      requirementKey: "PLAYER_RARITY_GROUP",
      eligibilityValues: [23, 83],
      scope: "GREATER",
      count: 2,
    }];

    expect(detectTotwShortage(
      constraints as never,
      [{ groups: [23, 83], price: 5_000 }],
      88,
    )).toEqual({ groupIds: [23, 83], required: 2, available: 1, challengeId: 88 });
    expect(detectTotwShortage(
      constraints as never,
      [{ groups: [83], price: 5_000 }, { groups: [23, 83], price: 5_000 }],
      88,
    )).toBeUndefined();
  });

  it("mirrors backend price and concept filtering before counting group 83", () => {
    const constraints = [{
      requirementKey: "PLAYER_RARITY_GROUP",
      eligibilityValues: [83],
      scope: "EXACT",
      count: 1,
    }];

    expect(detectTotwShortage(
      constraints as never,
      [{ groups: [83], price: 50_001 }],
      99,
    )?.available).toBe(0);
    expect(detectTotwShortage(
      constraints as never,
      [{ groups: [83], price: 50_000 }],
      99,
    )).toBeUndefined();
    expect(detectTotwShortage(
      constraints as never,
      [{ groups: [83], price: 1, concept: true, futggPrice: null }],
      99,
    )?.available).toBe(0);
  });

  it("ignores lower-bound exclusions because a TOTW fallback cannot satisfy them", () => {
    expect(detectTotwShortage([{
      requirementKey: "PLAYER_RARITY_GROUP",
      eligibilityValues: [83],
      scope: "LOWER",
      count: 0,
    }] as never, [], 100)).toBeUndefined();
  });

  it("keeps sliding counters isolated per persona", () => {
    const storage = new MemoryStorage();
    const one = new SubmissionCounter(storage, "persona-1");
    const two = new SubmissionCounter(storage, "persona-2");
    const now = Date.UTC(2026, 7, 3, 8);
    one.record(now - 2_000);
    one.record(now - 3_700_000);
    expect(one.snapshot(90, 300, now)).toMatchObject({ hour: 1, day: 2 });
    expect(two.snapshot(90, 300, now)).toMatchObject({ hour: 0, day: 0 });
  });

  it("records threshold timing but never blocks submission", () => {
    const storage = new MemoryStorage();
    const counter = new SubmissionCounter(storage, "limited");
    const now = Date.UTC(2026, 7, 3, 9);
    counter.record(now - 3_000);
    counter.record(now - 2_000);
    const snapshot = counter.snapshot(2, 300, now);
    expect(snapshot.remaining).toBe(0);
    expect(snapshot.nextAvailableAt).toBe(now - 3_000 + 3_600_000);
    expect(counter.canSubmit(1, 2, 300, now)).toBe(true);
  });
});
