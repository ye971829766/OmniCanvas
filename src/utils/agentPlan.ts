import type { AgentPlan, AgentPlanStep } from "@/types/agent";

function matchesPlanStep(step: AgentPlanStep, tool: string, input: any): boolean {
  if (!step.tools?.includes(tool)) return false;
  if (step.platform && input?.platform && step.platform !== input.platform) return false;
  if (step.deliverable && input?.deliverable && step.deliverable !== input.deliverable) return false;
  return true;
}

export function updateAgentPlanFromTool(
  plan: AgentPlan | undefined,
  tool: string,
  input: any,
  completed: boolean,
): AgentPlan | undefined {
  if (!plan) return plan;
  const candidates = plan.steps.filter((step) => matchesPlanStep(step, tool, input));
  const step =
    candidates.find((item) => item.status === "in_progress") ||
    candidates.find((item) => item.status === "pending");
  if (!step) return plan;

  if (completed && step.completionTool === tool) step.status = "completed";
  else if (step.status === "pending") step.status = "in_progress";
  return plan;
}
