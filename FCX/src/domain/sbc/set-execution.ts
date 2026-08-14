import type {
  PlannedSbcChallenge,
  SbcChallengeExecutionResult,
  SbcSetExecutionPlan,
} from "../../types/sbc-run";

export interface ExecuteSetPlanOptions<TPayload> {
  setId: number;
  setName: string;
  challengeIds: number[];
  isCancelled?: () => boolean;
  planChallenge(
    challengeId: number,
    excludedItemIds: ReadonlySet<number>,
  ): Promise<PlannedSbcChallenge<TPayload>>;
  submitChallenge(
    planned: PlannedSbcChallenge<TPayload>,
    index: number,
    total: number,
  ): Promise<SbcChallengeExecutionResult>;
  initialExcludedItemIds?: ReadonlySet<number>;
  reviewPlan?(
    plan: SbcSetExecutionPlan<TPayload>,
    excludedItemIds: ReadonlySet<number>,
  ): Promise<
    | { action: "submit" }
    | { action: "cancel"; reason?: string }
    | { action: "replan"; excludedItemIds: ReadonlySet<number> }
  >;
}

export interface ExecuteSetPlanResult<TPayload> {
  plan: SbcSetExecutionPlan<TPayload>;
  submitted: SbcChallengeExecutionResult[];
  stoppedReason?: string;
}

/** Plans every unfinished challenge before any EA squad is applied or submitted. */
export async function executeSbcSetPlan<TPayload>(
  options: ExecuteSetPlanOptions<TPayload>,
): Promise<ExecuteSetPlanResult<TPayload>> {
  let previewExcludedItemIds = new Set(options.initialExcludedItemIds || []);
  let lastReviewedPlan: SbcSetExecutionPlan<TPayload> | undefined;
  let lastReviewedExclusions = new Set<number>();
  planning: for (let planAttempt = 1; planAttempt <= 50; planAttempt += 1) {
    let planned: PlannedSbcChallenge<TPayload>[] = [];
    let planAlreadyReviewed = false;
    const reservedItemIds = new Set<number>(previewExcludedItemIds);

    for (const challengeId of options.challengeIds) {
      if (options.isCancelled?.()) {
        return {
          plan: { setId: options.setId, setName: options.setName, challenges: planned },
          submitted: [],
          stoppedReason: "用户结束了SBC任务。",
        };
      }
      try {
        const challenge = await options.planChallenge(
          challengeId,
          new Set(reservedItemIds),
        );
        planned.push(challenge);
        for (const itemId of challenge.playerItemIds) {
          if (itemId > 0) reservedItemIds.add(itemId);
        }
      } catch (error) {
        if (options.reviewPlan && lastReviewedPlan) {
          const review = await options.reviewPlan(
            lastReviewedPlan,
            new Set(lastReviewedExclusions),
          );
          if (review.action === "cancel") {
            return {
              plan: lastReviewedPlan,
              submitted: [],
              stoppedReason: review.reason || "用户取消了整组提交。",
            };
          }
          if (review.action === "replan") {
            previewExcludedItemIds = new Set(review.excludedItemIds);
            continue planning;
          }
          planned = [...lastReviewedPlan.challenges];
          planAlreadyReviewed = true;
          break;
        }
        return {
          plan: { setId: options.setId, setName: options.setName, challenges: planned },
          submitted: [],
          stoppedReason: error instanceof Error ? error.message : String(error),
        };
      }
    }

    const plan: SbcSetExecutionPlan<TPayload> = {
      setId: options.setId,
      setName: options.setName,
      challenges: planned,
    };
    if (options.reviewPlan && !planAlreadyReviewed) {
      const review = await options.reviewPlan(plan, new Set(previewExcludedItemIds));
      if (review.action === "cancel") {
        return { plan, submitted: [], stoppedReason: review.reason || "用户取消了整组提交。" };
      }
      if (review.action === "replan") {
        lastReviewedPlan = plan;
        lastReviewedExclusions = new Set(previewExcludedItemIds);
        previewExcludedItemIds = new Set(review.excludedItemIds);
        continue;
      }
    }

    const submitted: SbcChallengeExecutionResult[] = [];
    for (let index = 0; index < planned.length; index += 1) {
      if (options.isCancelled?.()) {
        return { plan, submitted, stoppedReason: "用户结束了SBC任务。" };
      }
      const challenge = planned[index];
      if (!challenge) continue;
      try {
        const result = await options.submitChallenge(challenge, index + 1, planned.length);
        submitted.push(result);
        if (!result.submitted) {
          return {
            plan,
            submitted,
            stoppedReason: result.reason || `${challenge.name} 提交失败。`,
          };
        }
      } catch (error) {
        return {
          plan,
          submitted,
          stoppedReason: error instanceof Error ? error.message : String(error),
        };
      }
    }
    return { plan, submitted };
  }

  return {
    plan: { setId: options.setId, setName: options.setName, challenges: [] },
    submitted: [],
    stoppedReason: "整组重新规划次数过多，任务已停止。",
  };
}
