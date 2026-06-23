/**
 * LangGraph 实现示例 - 解决异步生成等待问题
 *
 * 安装: npm install @langchain/langgraph @langchain/core
 */

import { StateGraph, END } from "@langchain/langgraph";
import { AIMessage, HumanMessage } from "@langchain/core/messages";

// 定义工作流状态
interface AgentState {
  messages: Array<HumanMessage | AIMessage>;
  generatingImages: string[]; // 正在生成的图片 refId
  canvasState: any[];
  currentStep: 'thinking' | 'generating' | 'reviewing' | 'done';
}

// 创建工作流图
const workflow = new StateGraph<AgentState>({
  channels: {
    messages: { default: () => [] },
    generatingImages: { default: () => [] },
    canvasState: { default: () => [] },
    currentStep: { default: () => 'thinking' },
  }
});

// 节点 1: Agent 思考和生成图片
async function agentThinking(state: AgentState) {
  // 调用 LLM，决定要生成什么
  const response = await callLLM(state.messages);

  // 如果需要生成图片
  if (response.toolCalls?.some(tc => tc.name === 'generate_image')) {
    const imageRefIds = response.toolCalls
      .filter(tc => tc.name === 'generate_image')
      .map(tc => tc.args.refId);

    return {
      ...state,
      generatingImages: imageRefIds,
      currentStep: 'generating',
    };
  }

  return { ...state, currentStep: 'done' };
}

// 节点 2: 等待生成完成（条件节点）
async function checkGenerationStatus(state: AgentState) {
  // 查询生成状态（从 Redis/数据库/内存缓存）
  const allComplete = await Promise.all(
    state.generatingImages.map(refId => isGenerationComplete(refId))
  );

  if (allComplete.every(Boolean)) {
    return { ...state, currentStep: 'reviewing' };
  }

  // 如果还在生成中，保持在此节点（LangGraph 会自动重试或等待）
  return state;
}

// 节点 3: 检查布局并调整
async function reviewAndAdjust(state: AgentState) {
  // 获取最新的画布状态
  const updatedCanvas = await fetchLatestCanvasState();

  // 调用 review_and_adjust 工具
  const report = await callReviewTool(updatedCanvas);

  // 调用 update_node 调整布局
  if (report.needsAdjustment) {
    await adjustLayout(report);
  }

  return { ...state, currentStep: 'done', canvasState: updatedCanvas };
}

// 构建工作流图
workflow
  .addNode("thinking", agentThinking)
  .addNode("wait_generation", checkGenerationStatus)
  .addNode("review", reviewAndAdjust);

// 定义边（状态转换）
workflow
  .addEdge("__start__", "thinking")
  .addConditionalEdges(
    "thinking",
    (state) => state.currentStep,
    {
      generating: "wait_generation",
      done: END,
    }
  )
  .addConditionalEdges(
    "wait_generation",
    (state) => state.currentStep,
    {
      generating: "wait_generation", // 循环等待
      reviewing: "review",
    }
  )
  .addEdge("review", END);

// 编译并运行
const app = workflow.compile({
  // 支持中断和恢复
  checkpointer: new MemorySaver(), // 或使用 RedisSaver 持久化
});

// 使用方式
export async function runAgentWithWait(userMessage: string, canvasState: any[]) {
  const config = {
    configurable: { thread_id: "session-123" },
    // 设置重试策略：每2秒检查一次生成状态
    recursionLimit: 50,
  };

  const result = await app.invoke({
    messages: [new HumanMessage(userMessage)],
    canvasState,
    currentStep: 'thinking',
  }, config);

  return result;
}

// 当前端通知生成完成时，可以手动触发继续
export async function notifyGenerationComplete(sessionId: string) {
  // LangGraph 会自动继续执行到下一个节点
  await app.invoke({ currentStep: 'reviewing' }, {
    configurable: { thread_id: sessionId },
  });
}

// 辅助函数（示例）
async function callLLM(messages: any[]) {
  // 调用你的 LLM
  return { toolCalls: [] };
}

async function isGenerationComplete(refId: string): Promise<boolean> {
  // 查询生成状态
  return false;
}

async function fetchLatestCanvasState() {
  return [];
}

async function callReviewTool(canvasState: any[]) {
  return { needsAdjustment: false };
}

async function adjustLayout(report: any) {
  // 调整布局
}
