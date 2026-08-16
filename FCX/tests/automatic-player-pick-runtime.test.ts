import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const source = readFileSync(resolve(root, "src/domain/packs/runtime.ts"), "utf8");
const itemRuntime = readFileSync(resolve(root, "src/hooks/items-runtime.ts"), "utf8");
const pickModule = readFileSync(resolve(root, "src/domain/packs/player-pick.ts"), "utf8");

function between(start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  expect(from).toBeGreaterThan(-1);
  expect(to).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe("FCX automatic player-pick runtime", () => {
  it("checks an already-open pick before the bounded unassigned loop", () => {
    const block = between(
      "const runAutomaticPlayerPicks = async",
      "const hasPendingTrackedPlayerPicks",
    );
    expect(block.indexOf("requestPendingPlayerPick()")).toBeLessThan(
      block.indexOf("for (; !stopped"),
    );
    expect(block.indexOf("if (!options.autoPick)")).toBeLessThan(
      block.indexOf("confirmAutomaticPlayerPick({"),
    );
    expect(block).toContain("attempt <= PLAYER_PICK_MAX_ATTEMPTS");
    expect(block).toContain("PLAYER_PICK_REWARD_ATTEMPTS");
    expect(block).toContain("PLAYER_PICK_REWARD_WAIT_MS");
    expect(block).toContain("isTaskCancellationRequested()");
  });

  it("parses redeem directly and stops instead of retrying an open failure", () => {
    const block = between(
      "const runAutomaticPlayerPicks = async",
      "const hasPendingTrackedPlayerPicks",
    );
    expect(block).toContain("services.Item.redeem(pick)");
    expect(block).toContain("normalizePlayerPickPayload(opened.raw)");
    expect(block).toContain('playerPickFailureMessage("open", opened.status)');
    expect(block).not.toContain("requestPendingPlayerPickItemSelection()\n    );\n    const payload = opened");
  });

  it("records only confirmed picks, queues harvest, then waits before continuing", () => {
    const confirm = between(
      "const confirmAutomaticPlayerPick = async",
      "const routePlayerPickResults",
    );
    expect(confirm.indexOf("if (!confirmation.ok)")).toBeLessThan(
      confirm.indexOf("recordConfirmedPlayerPick"),
    );
    expect(confirm).toContain("PLAYER_PICK_CONFIRM_WAIT_MS");
    const record = between(
      "const recordConfirmedPlayerPick =",
      "const confirmAutomaticPlayerPick",
    );
    expect(record).toContain("taskSummary.picksCompleted += 1");
    expect(record).toContain("addPackPlayers");
    expect(record).toContain("harvestMoment.captureItems");
    expect(record).toContain("Promise.resolve().then");
  });

  it("uses three post-pick routing passes and leaves manual pick pages untouched", () => {
    const routing = between(
      "const routePlayerPickResults = async",
      "const runAutomaticPlayerPicks = async",
    );
    expect(routing).toContain("PLAYER_PICK_ROUTING_PASSES");
    expect(routing).toContain("PLAYER_PICK_ROUTING_WAIT_MS");
    expect(source).not.toContain("UTPlayerPicksViewController");
    expect(itemRuntime).not.toContain("UTPlayerPicksViewController");
    expect(source).not.toContain("const openPick = async");
  });

  it("adds an idempotent manual action that processes all unassigned picks", () => {
    expect(source).toContain('const FCX_MANUAL_PICK_BUTTON_ID = "fcx-manual-auto-pick"');
    expect(source).toContain('button.textContent = "自动挑选"');
    expect(source).toContain('autoPick: true');
    expect(source).toContain('runPackSelections([], options)');
    expect(source).toContain("installManualPlayerPickAction");
    expect(source).toContain("new MutationObserver(scheduleManualPlayerPickButtonSync)");
    expect(source).not.toContain("UTPlayerPicksViewController");
  });

  it("guards asynchronous player-card enhancement against destroyed roots", () => {
    expect(itemRuntime).toContain('Symbol("fcx-player-render")');
    expect(itemRuntime).toContain("this.__root === renderRoot");
    expect(itemRuntime).toContain("if (!isCurrentRender())");
    expect(itemRuntime).not.toContain('this.__root.style.opacity = "0.4"');
  });

  it("keeps new automatic-pick code free of third-party branding", () => {
    expect(pickModule).not.toMatch(/external player-pick branding/i);
  });
});
