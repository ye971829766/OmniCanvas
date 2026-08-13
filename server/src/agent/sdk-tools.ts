import { jsonSchema, type ToolSet } from "ai";
import { isAgentToolEnabled } from "../utils/feature-flags";
import { TOOL_MAP } from "./tool.registry";

export function buildAgentSdkTools(
  selectedToolNames: Iterable<string>,
): ToolSet {
  const sdkTools: ToolSet = {};

  for (const name of selectedToolNames) {
    if (!isAgentToolEnabled(name)) continue;
    const tool = TOOL_MAP.get(name);
    if (!tool) continue;

    sdkTools[name] = {
      description: tool.description,
      inputSchema: jsonSchema(tool.parameters),
    };
  }

  return sdkTools;
}
