export interface QualityRepairAuthorization {
  root?: string;
  error?: string;
}

/**
 * Per-turn budget for automatic bitmap QA.
 *
 * One quality chain is: initial image -> review -> optional edit -> review.
 * User-authored edits are not counted unless they repair a ref that failed the
 * automatic visual gate in the same turn.
 */
export class FinalImageQualityBudget {
  private readonly failedRefs = new Set<string>();
  private readonly rootByRef = new Map<string, string>();
  private readonly rootByChain = new Map<string, string>();
  private readonly repairsByRoot = new Map<string, number>();
  private readonly reviewsByRoot = new Map<string, number>();

  authorizeReview(refId: string): string | undefined {
    const root = this.rootByRef.get(refId) || refId;
    const reviews = this.reviewsByRoot.get(root) || 0;
    if (reviews >= 2) {
      return "Automatic quality-review budget exhausted for this image: one initial check and one repaired-result check are allowed.";
    }
    this.reviewsByRoot.set(root, reviews + 1);
    return undefined;
  }

  authorizeRepair(source: string): QualityRepairAuthorization {
    if (!this.failedRefs.has(source)) return {};
    const root = this.rootByRef.get(source) || source;
    if ((this.repairsByRoot.get(root) || 0) >= 1) {
      return {
        root,
        error:
          "Automatic bitmap-repair budget exhausted: keep the best result and report the remaining limitation.",
      };
    }
    // Reserve before the paid call so a provider failure or duplicate call
    // cannot silently reopen the automatic repair budget.
    this.repairsByRoot.set(root, (this.repairsByRoot.get(root) || 0) + 1);
    return { root };
  }

  authorizeGeneration(input: {
    repairOf?: string;
    chainKey?: string;
  }): QualityRepairAuthorization {
    const repairOf = input.repairOf?.trim();
    if (repairOf) {
      const repair = this.authorizeRepair(repairOf);
      return repair.root
        ? repair
        : {
            error:
              `repairOf must reference an image that failed visual verification in this turn: ${repairOf}`,
          };
    }

    const failedRoots = new Set(
      [...this.failedRefs].map((refId) => this.rootByRef.get(refId) || refId),
    );
    if (failedRoots.size === 0) return {};

    const existingRoot = input.chainKey
      ? this.rootByChain.get(input.chainKey)
      : undefined;
    if (input.chainKey && !existingRoot) {
      // A distinct role in a suite is a new deliverable, not a repair bypass.
      return {};
    }
    return {
      root: existingRoot,
      error:
        "A previous image failed visual verification. Regeneration must set repairOf to that failed refId so it stays inside the one-repair budget.",
    };
  }

  recordGeneration(
    refId: string,
    input: { chainKey?: string; repairRoot?: string } = {},
  ): void {
    if (!refId) return;
    const root = input.repairRoot || refId;
    this.rootByRef.set(refId, root);
    if (input.chainKey) this.rootByChain.set(input.chainKey, root);
  }

  recordEdit(refId: string, repairRoot?: string): void {
    if (!refId) return;
    if (!repairRoot) {
      this.rootByRef.set(refId, refId);
      return;
    }
    this.rootByRef.set(refId, repairRoot);
  }

  recordVerification(refId: string, output: Record<string, any>): void {
    if (!refId) return;
    if (output.success === true) {
      const root = this.rootByRef.get(refId) || refId;
      for (const failedRef of this.failedRefs) {
        if ((this.rootByRef.get(failedRef) || failedRef) === root) {
          this.failedRefs.delete(failedRef);
        }
      }
      return;
    }
    const actionable =
      output.repairRecommended === true ||
      output.repairStrategy === "edit" ||
      output.repairStrategy === "regenerate";
    if (actionable) this.failedRefs.add(refId);
  }
}
