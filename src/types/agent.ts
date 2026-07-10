export interface AgentAttachmentInput {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  previewUrl: string;
  file?: File;
  url?: string;
}

export interface AgentAssetPayload {
  id: string;
  url: string;
  name?: string;
  mimeType?: string;
  size?: number;
  width?: number;
  height?: number;
}

export type AgentPlanStepStatus = "pending" | "in_progress" | "completed";

export interface AgentPlanStep {
  id: string;
  title: string;
  description?: string;
  status: AgentPlanStepStatus;
  platform?: string;
  deliverable?: string;
  tools?: string[];
  completionTool?: string;
}

export interface AgentPlan {
  id: string;
  title: string;
  sourceAssetId?: string;
  steps: AgentPlanStep[];
}
