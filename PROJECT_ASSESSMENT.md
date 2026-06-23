# AgentsBoard 项目评估报告（对标 Lovart.ai）

> 评估日期：2026-06-23
> 评估范围：前端（`src/`）、后端（`server/src/`）、管理后台（`admin/`）、配置与测试
> 对标产品：[Lovart.ai](https://www.lovart.ai) —— 自然语言驱动的 AI 设计 Agent（在无限画布上生成海报/图像/视频/品牌设计）

---

## 一、一句话结论

AgentsBoard 是一个**已远超原型阶段的、可运行的单循环工具调用型 AI 设计 Agent**。它具备 Lovart 的核心骨架：无限 Leafer 画布 + LLM 工具协议 + 多供应商图像/视频生成 + 截图自查（MCoT）。但与 Lovart 的差距集中在三处：**(1) 缺少真正的多步规划/编排（仅靠提示词驱动，非状态机）；(2) 大量"假完成"的 UI 与死代码；(3) 工程化与安全短板（硬编码凭证、几乎无自动化测试、无鉴权）**。

**总体完成度估计：约 70%（核心链路可用，产品化/健壮性/规模化能力欠缺）。**

---

## 二、整体能力对照表（vs Lovart.ai）

| 能力维度 | Lovart 的标准 | AgentsBoard 现状 | 完成度 |
|---|---|---|---|
| 无限画布编辑 | ✅ 成熟 | ✅ Leafer 引擎，图层/历史/吸附/分组完整 | **85%** |
| 自然语言 → 画布操作 | ✅ | ✅ 19 个工具的 ReAct 循环，SSE 流式 | **80%** |
| 多供应商图像生成 | ✅ | ✅ 非常完整（GPT-Image / DALL·E / Gemini-Nano-Banana / Qwen / Seedream / FLUX / Grok / MJ / Kling） | **90%** |
| 视频生成 | ✅ | ✅ 多部分上传 + 轮询 + ffmpeg 缩略图（含 mock 模式） | **80%** |
| 截图自查 / 视觉反思（MCoT） | ✅ 闭环 Agent | ⚠️ 有，但**纯提示词驱动**、依赖前端回传、非强制状态机 | **55%** |
| 多步规划 / 任务分解 | ✅ 复杂多画板营销活动 | ❌ 仅单循环逐步决策，规划层（LangGraph）只剩**死代码** | **10%** |
| 灵感 / 素材检索 | ✅ 真实搜索 | ❌ **硬编码 Unsplash 链接 + 关键词 if 链**（桩） | **15%** |
| 品牌系统 / 配色 | ✅ | ⚠️ 10 套配色可用，但对比度/字体知识写了**没被调用** | **70%** |
| 多语言 | ✅ | ✅ 用户语言回复、英文生图提示 | **80%** |
| 鉴权 / 多用户 | ✅ | ❌ 完全没有，头像写死 `"jr"` | **0%** |
| 管理后台（渠道/模型/Agent 配置） | —（Lovart 无对外） | ✅ Element Plus 控制台，CRUD + 连通性测试 + 模型发现 | **80%** |
| 自动化测试 | — | ❌ 仅 1 个 53 行的工具函数测试 | **5%** |

---

## 三、做得好的部分（保持）

### 1. AI 供应商网关（`server/src/ai/ai.service.ts`，~1816 行）—— 最成熟，约 90%
- 多供应商、多格式统一网关：原生 Gemini（`@google/genai`）、OpenAI `images.generate`、多部分 `/images/edits`（img2img + mask）。
- `getImageModelOptionsInternal`（`ai.service.ts:514-984`）**硬编码了准确且最新（2026 年初）的各模型尺寸/质量/宽高比预设**，每个都带文档来源 URL。这是真实、可用的供应商知识。
- 视频：多部分 POST `/videos` → 每 5s 轮询最长 5 分钟 → 下载并用 ffmpeg 抽帧（`ai.service.ts:1561-1610`）；支持 `MOCK_VIDEO=true` 离线开发。

### 2. 记忆与持久化（`server/src/agent/agent.memory.ts`）—— 约 85%
- 基于 `bun:sqlite`，会话历史跨重启持久化。
- **Token 感知截断**（~24k 预算、CJK 启发式、保留 tool-call/result 配对，`agent.memory.ts:269-350`）。
- 图像卫生：只保留最近 6 条消息内的图，截图落盘而非塞进 DB（`stripOldImages`，`agent.memory.ts:296`）。
- 会话 TTL 30 分钟 + 5 分钟清理定时器，顺带清理孤儿图片文件。

### 3. 画布引擎与历史（`useCanvas.ts` ~964 行 / `useCanvasHistory.ts` ~485 行）—— 约 85%
- **增量 JSON 快照历史 + diff 恢复**（`restoreToDiff`，`useCanvasHistory.ts:237`）：只 patch 变更节点，工程质量高。
- 关键架构决策：**手动生成与 Agent 生成复用同一套 `ImageGen`/`VideoGen` 占位节点 + taskId 轮询管线**，避免重复实现。
- 图层面板（`LayerPanel.vue` ~667 行）功能完整：树形、折叠、重排、显隐、锁定、重命名、双击聚焦。

### 4. 管理后台（`admin/`）—— 约 80%
- 五大模块：Dashboard / 渠道管理 / 模型目录 / **Agent 配置** / 诊断测试。
- Agent 配置页（`admin/src/components/AgentSection.vue`）持有**真正的产品规格**——可编辑的 `DEFAULT_SYSTEM_PROMPT` + 选择 `chatModel`（驱动）与 `visionModel`（MCoT 自查）。

---

## 四、做得不对 / 必须修的问题（高优先级）

### 🔴 P0-1 源码中硬编码明文凭证与单点 HTTP 依赖
`server/src/ai/ai.service.ts:1781-1782`：
```ts
const url = "http://101.200.138.2:8092/api/upload/private";
const apiKey = "sk-a9f76e82c4df42f58afbefd53d3b4f8e";
```
- 明文 API Key 进了仓库（且应检查 git 历史）；**每一次截图/视觉调用都路由经过这个单 IP 的 HTTP（非 HTTPS）服务**——既是安全泄露，又是可用性单点。
- 渠道 API Key 也以**明文存 SQLite**。
- **修复**：移到环境变量；改 HTTPS；轮换已泄露的 key；考虑加密存储。

### 🔴 P0-2 `Prompt.md` 泄露第三方厂商提示词与个人路径
根目录 `Prompt.md` **不是本项目的需求文档**，而是误提交的 **Google DeepMind "Antigravity" 编码助手的完整系统提示词**（`Prompt.md:2`），还含个人路径 `c:\Users\Lucas\...`（`Prompt.md:10`）。
- **修复**：从仓库删除并清理 git 历史（可能涉及他方版权/合规）。本项目真实规格在 `system-prompt.ts` 与 `AgentSection.vue` 的 `DEFAULT_SYSTEM_PROMPT`。

### 🟠 P1-1 MCoT 自查闭环是"祈祷式"而非强制
- 系统提示要求 `generate → export_node_image → analyze_design → update_node` 闭环（`system-prompt.ts:69-90`，末尾直言 *"like Lovart.ai"*），但**没有状态机强制**，完全依赖 LLM 自觉执行。
- 截图回传依赖前端：后端发 `export_node`（带 `requestId`），前端 `node.export("png")` 后 POST `/agent/export-result`（`useAgent.ts:618-624`）——**fire-and-forget，无 ack/超时/重试**。前端不配合则后端 `requestId` 等待可能挂起，自查静默降级。
- **修复**：用 LangGraph（仓库里已有 `langgraph-example.ts` 死代码，正是为此设计）把 MCoT 固化为状态机；export 回传加超时/重试/兜底。

### 🟠 P1-2 前端存在"假完成"的 UI 与死代码
| 位置 | 问题 |
|---|---|
| `useAgent.ts:571` | `generation_started` 注册 `node.once("generation-complete", …)` 自动追发"检查布局并调整"——但**全代码无任何地方 emit `generation-complete`**，此自动复查腿是**死的**（且若触发会偷偷消耗 token） |
| `AgentPanel.vue:178` | ETA 计时器写死 `"30秒"`/`"1分钟"`，假的 |
| `AgentPanel.vue:189` | `enableNotification` 只是 `alert("任务完成通知已开启")`，无真实通知 |
| `AgentPanel.vue:195` | `suggestions` 数组硬编码 |
| `Canvas.vue:129` | `option` ref 被深度 watch 但只 `console.log`，死状态 |
| `Canvas.vue:222` | `onSubmitLink` 是 `alert("Submitted Link…")` 桩 |
| `sidebar.vue:188/193` | 用户头像/名写死 `"jr"`/`"jr y"`；设置按钮无功能；`Ctrl+Shift+O/F` 快捷键提示**未接线** |
| `api.ts:405` | `sendAgentMessage`/`nodeStates` 非流式接口是死代码 |

### 🟠 P1-3 灵感检索是桩
`collect_inspiration`（`inspiration.tools.ts`）只是**硬编码 Unsplash URL + 关键词 if 链**（cyberpunk/zen/tea/cafe…），无真实图像搜索。对标 Lovart 的"参考图驱动"能力基本缺失。

### 🟡 P2 其他正确性问题
- **生成任务状态有两个真相源**：`ai.service.ts:1048` 的内存 Map 与 `agent.service.ts:31` 的 `generationStates`（仅靠前端 `generation-callback` 更新），易不一致；且**内存态，重启即丢**所有在途任务。
- **`columns` 布局不可达**：`layout-engine.ts` 实现了 `columns`，但没进 `auto_layout` 的枚举（`layout.tools.ts:16`），LLM 调不到。
- **`review_and_adjust` 与 `analyze_design` 功能重叠**，两个相似的批评工具易让模型困惑。
- 死代码：`langgraph-example.ts`、`typography.ts`、`color-system.ts` 的 `matchPalette`/`ensureReadable`/`contrastRatio`（导出但从未使用）。
- 残留调试日志：`useCanvas.ts:875/879` 的"拖拽结束"/"移动结束"。
- `buildClient` 注入伪造的 Google `thought_signature`（`agent.service.ts:510-568`）绕过聚合器校验——脆弱的兼容性 hack。
- 会话 ID 用 `localStorage` UUID，**与 workspaceId 解耦**（`useAgent.ts:184`）——聊天历史不跟随工作空间切换。
- `admin/src/utils/api.ts:3` 把 `API_BASE_URL` 写死 `http://localhost:3000`，未读 `VITE_API_BASE_URL`。
- 强耦合 Bun 运行时（`Bun.write`/`Bun.spawn`/`tls.rejectUnauthorized:false`，`files.service.ts:27-44`），难迁移到 Node。

---

## 五、需要做 / 需要完善的功能（路线图）

### 第一阶段：止血与产品化基线（1-2 周）
1. **安全**：清除 P0-1 硬编码凭证、轮换 key、删 `Prompt.md` 并洗历史（P0-2）。
2. **清理死代码与假 UI**：移除/实现 P1-2 中的所有桩；删除未用的 LangGraph 示例、typography、重复工具。
3. **会话与工作空间绑定**：sessionId ↔ workspaceId，聊天历史跟随切换。
4. **任务状态单一真相源 + 持久化**：把生成任务状态落 SQLite，重启可恢复在途任务。

### 第二阶段：补齐与 Lovart 对标的核心能力（3-6 周）
5. **真正的多步规划/编排**：用 LangGraph 把"规划 → 分解 → 执行 → 自查 → 调整"做成状态机，支撑**多画板营销活动**这类复杂任务（Lovart 的杀手锏）。
6. **MCoT 强制闭环**：把 generate→export→analyze→fix 固化进图，export 回传加 ack/超时/兜底。
7. **真实灵感/素材检索**：接 Unsplash/Pexels API 或图像搜索，替换 `collect_inspiration` 桩；支持参考图驱动设计。
8. **品牌系统落地**：让已写好的对比度/字体可读性逻辑（`color-system.ts`/`typography.ts`）真正参与生成与自查。
9. **打通 `columns` 等已实现但不可达的布局**。

### 第三阶段：规模化与体验（持续）
10. **鉴权与多用户**：登录、用户隔离、工作空间归属。
11. **真实通知系统**：替换假 ETA 与 alert，做 WebSocket/浏览器通知 + 真实进度。
12. **自动化测试**：把 `agent-test-questions.md` 的 7 维测试矩阵（尤其"语义关系判断/parentId 归属"这一零容忍项）变成自动化用例；补后端工具与画布逻辑单测/集成测试。
13. **导出与协作**：当前 `export-multiple` 仅本地下载；补云端导出、分享、模板库。
14. **健壮性**：去 Bun 硬耦合、加错误边界、统一错误提示（替换散落的 `alert()`）。

---

## 六、风险提示
- **合规风险**：`Prompt.md` 含他方厂商提示词，建议立即处理。
- **安全风险**：明文凭证已入库，视作已泄露，须轮换。
- **架构风险**：MCoT 与生成状态过度依赖前端配合且无强一致，复杂任务下可靠性会成为最大瓶颈——这正是与 Lovart 拉开差距的关键所在。

---

*报告依据：对 `server/src/agent/*`、`server/src/ai/ai.service.ts`、`src/composables/*`、`src/components/agent/*`、`admin/src/*`、`system-prompt.ts`、`agent-test-questions.md` 的源码走读，关键结论（硬编码凭证、系统提示词、MCoT 闭环）已逐项核实。*
