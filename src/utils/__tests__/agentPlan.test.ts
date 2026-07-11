import { describe, expect, it } from "vitest";
import { updateAgentPlanFromTool } from "@/utils/agentPlan";
import type { AgentPlan } from "@/types/agent";

function createPlan(): AgentPlan {
  return {
    id: "plan-1",
    title: "电商套图",
    steps: [
      {
        id: "amazon-main",
        title: "Amazon 主图",
        status: "pending",
        platform: "amazon",
        deliverable: "main",
        tools: ["generate_image", "verify_design"],
        completionTool: "verify_design",
      },
      {
        id: "taobao-main",
        title: "淘宝主图",
        status: "pending",
        platform: "taobao",
        deliverable: "main",
        tools: ["generate_image", "verify_design"],
        completionTool: "verify_design",
      },
    ],
  };
}

describe("agent plan progress", () => {
  it("starts the matching platform deliverable", () => {
    const plan = createPlan();
    updateAgentPlanFromTool(
      plan,
      "generate_image",
      { platform: "taobao", deliverable: "main" },
      false,
    );
    expect(plan.steps[0].status).toBe("pending");
    expect(plan.steps[1].status).toBe("in_progress");
  });

  it("completes a step only at its completion tool", () => {
    const plan = createPlan();
    updateAgentPlanFromTool(
      plan,
      "generate_image",
      { platform: "amazon", deliverable: "main" },
      true,
    );
    expect(plan.steps[0].status).toBe("in_progress");
    updateAgentPlanFromTool(
      plan,
      "verify_design",
      { platform: "amazon", deliverable: "main" },
      true,
    );
    expect(plan.steps[0].status).toBe("completed");
  });

  it("marks a matching step failed when its tool reaches an error terminal state", () => {
    const plan = createPlan();
    updateAgentPlanFromTool(
      plan,
      "generate_image",
      { platform: "amazon", deliverable: "main" },
      true,
      true,
    );
    expect(plan.steps[0].status).toBe("failed");
    expect(plan.steps[1].status).toBe("pending");
  });
});
