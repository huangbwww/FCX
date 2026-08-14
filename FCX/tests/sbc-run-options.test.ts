import { describe, expect, it } from "vitest";
import {
  createSbcExecutionContext,
  defaultSbcRunOptions,
  normalizeSbcRunOptions,
} from "../src/types/sbc-run";

describe("SBC run options", () => {
  it("defaults to value-aware solving and only opts out explicitly", () => {
    expect(defaultSbcRunOptions.ignoreValue).toBe(false);
    expect(normalizeSbcRunOptions(undefined)).toEqual({
      ignoreValue: false,
      requestedRuns: 1,
      deferRewards: false,
      deferSummary: false,
      detectSpecialShortage: false,
      submitStrategy: null,
      autoOpenRewards: null,
      storageFallback: null,
      wholeSetPreview: false,
    });
    expect(normalizeSbcRunOptions({ ignoreValue: true })).toEqual({
      ignoreValue: true,
      requestedRuns: 1,
      deferRewards: false,
      deferSummary: false,
      detectSpecialShortage: false,
      submitStrategy: null,
      autoOpenRewards: null,
      storageFallback: null,
      wholeSetPreview: false,
    });
    expect(normalizeSbcRunOptions({ requestedRuns: -1 })).toEqual({
      ignoreValue: false,
      requestedRuns: -1,
      deferRewards: false,
      deferSummary: false,
      detectSpecialShortage: false,
      submitStrategy: null,
      autoOpenRewards: null,
      storageFallback: null,
      wholeSetPreview: false,
    });
  });

  it("creates a task context that preserves ignore-value across nested calls", () => {
    const context = createSbcExecutionContext({ ignoreValue: true });
    expect(context.id).toMatch(/^fcx-sbc-/);
    expect(context.options.ignoreValue).toBe(true);
    expect(context.options.requestedRuns).toBe(1);
    expect(context.activeCalls).toBe(0);
    expect(context.completedRuns).toBe(0);
    expect(context).not.toHaveProperty("protectionSnapshot");
    expect(context.packSummary.players).toEqual([]);
    expect(context.packSummary.sbcSubmissions).toEqual([]);
    expect(context.storageRecoveryCount).toBe(0);
  });

  it("normalizes storage cleanup runs for nested recovery tasks", () => {
    expect(normalizeSbcRunOptions({
      storageFallback: { enabled: true, setId: 1017, runs: 3 },
    }).storageFallback).toEqual({ enabled: true, setId: 1017, runs: 3 });
    expect(normalizeSbcRunOptions({
      storageFallback: { enabled: true, setId: 1017, runs: 99 },
    }).storageFallback).toEqual({ enabled: true, setId: 1017, runs: 99 });
    expect(normalizeSbcRunOptions({
      storageFallback: { enabled: true, setId: 1017, runs: 101 },
    }).storageFallback).toEqual({ enabled: true, setId: 1017, runs: 100 });
    expect(normalizeSbcRunOptions({
      storageFallback: { enabled: true, setId: 1017, runs: -1 },
    }).storageFallback).toEqual({ enabled: true, setId: 1017, runs: -1 });
  });
});
