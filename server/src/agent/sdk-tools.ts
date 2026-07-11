import { jsonSchema, type ToolSet } from "ai";
import { TOOL_MAP } from "./tool.registry";

export function buildAgentSdkTools(
  selectedToolNames: Iterable<string>,
): ToolSet {
  const sdkTools: ToolSet = {};

  for (const name of selectedToolNames) {
    const tool = TOOL_MAP.get(name);
    if (!tool) continue;

    sdkTools[name] = {
      description: tool.description,
      inputSchema: jsonSchema(tool.parameters),
    };
  }

  return sdkTools;
}
