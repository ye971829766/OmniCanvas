import { describe, expect, test } from "bun:test";
import { FinalImageQualityBudget } from "./final-image-quality-budget";

describe("FinalImageQualityBudget", () => {
  test("allows one repair and two visual checks for one image chain", () => {
    const budget = new FinalImageQualityBudget();
    budget.recordGeneration("initial");

    expect(budget.authorizeReview("initial")).toBeUndefined();
    budget.recordVerification("initial", {
      success: false,
      failureType: "composition",
      repairRecommended: true,
    });

    const repair = budget.authorizeRepair("initial");
    expect(repair).toEqual({ root: "initial" });
    budget.recordEdit("repaired", repair.root);

    expect(budget.authorizeReview("repaired")).toBeUndefined();
    expect(budget.authorizeReview("repaired")).toContain("budget exhausted");
    expect(budget.authorizeRepair("initial").error).toContain("budget exhausted");
  });

  test("does not spend repair budget for infrastructure-only verification failures", () => {
    const budget = new FinalImageQualityBudget();
    budget.recordGeneration("image");
    budget.recordVerification("image", {
      success: false,
      critique: "Vision provider unavailable",
    });

    expect(budget.authorizeRepair("image")).toEqual({});
  });

  test("requires repairOf for regeneration and keeps it in the original budget", () => {
    const budget = new FinalImageQualityBudget();
    budget.recordGeneration("initial", { chainKey: "generic:main" });
    budget.recordVerification("initial", {
      success: false,
      failureType: "composition",
      repairStrategy: "regenerate",
    });

    expect(
      budget.authorizeGeneration({ chainKey: "generic:main" }).error,
    ).toContain("repairOf");

    const regeneration = budget.authorizeGeneration({
      repairOf: "initial",
      chainKey: "generic:main",
    });
    expect(regeneration).toEqual({ root: "initial" });
    budget.recordGeneration("regenerated", {
      chainKey: "generic:main",
      repairRoot: regeneration.root,
    });

    expect(budget.authorizeReview("regenerated")).toBeUndefined();
    budget.recordVerification("regenerated", {
      success: false,
      failureType: "prompt_fidelity",
      repairStrategy: "regenerate",
    });
    expect(
      budget.authorizeGeneration({ repairOf: "regenerated" }).error,
    ).toContain("budget exhausted");
  });

  test("allows a genuinely distinct suite role after another role fails", () => {
    const budget = new FinalImageQualityBudget();
    budget.recordGeneration("main", { chainKey: "generic:main" });
    budget.recordVerification("main", {
      success: false,
      repairStrategy: "edit",
    });

    expect(
      budget.authorizeGeneration({ chainKey: "generic:detail" }),
    ).toEqual({});
  });
});
