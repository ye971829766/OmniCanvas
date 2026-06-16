# Agent 模块 v2（类 Lovart.ai 设计智能体）

集成在 `board/server` 里的设计智能体。它用一个会规划的 LLM（走你现有的渠道）调用一组设计工具,**复用你已有的生图/生视频/任务轮询管线**,并把过程通过 SSE 实时流式推给前端画布。

## 它如何复用你现有的能力

- **大脑**：`AgentService` 用 openai SDK,凭据来自 `AiService.resolveChannelAndModel('chat', model)` —— 即你 `data/channels.json` 里配置的渠道（MN / ePhone / 云雾）。零额外配置。
- **生图/生视频**：`generate_image` / `generate_video` 工具直接调用 `AiService.generateImageFromJson/generateVideoFromJson`,拿到 **taskId**。
- **完成生成**：agent 不自己等图。它把 taskId 通过 `generation_started` 事件发给前端,前端复用 `useCanvas.ts` 里已有的 `resumeNodePolling` 完成"占位 → 真图"的替换。

```
前端（leafer 画布 + 聊天）
   │  SSE: thinking | tool_call | canvas_op(含 generation_started+taskId) | usage | final
   ▼
AgentController(/agent/:sessionId/stream)
   └─ AgentService  think→act→observe 循环（带超时 + 互斥锁）
        ├─ openai SDK 流式 + function calling（渠道来自 AiService）
        ├─ 工具:set_frame / generate_image / generate_video / add_text / add_rect / update_node / remove_node / query_canvas
        ├─ AgentMemory  token 感知截断 + 会话 TTL 自动清理
        └─ EventSink  SSE 心跳(15s keepalive)
```

## v2 改进清单

| 改进 | 说明 |
|---|---|
| **SSE 心跳** | 每 15 秒发 `: keepalive` 注释,防止 nginx/LB 断开长连接 |
| **超时机制** | LLM 调用 60s / 工具调用 120s,超时自动中断 |
| **Session 互斥锁** | 同一 session 同时只能运行一个 agent 循环,防竞态 |
| **输入校验** | 工具参数运行时类型检查 + 自动强制转换（string→number） |
| **Token 感知截断** | 记忆按 ~24K token 上限截断（CJK/ASCII 混合估算）,不再粗暴按消息数 |
| **会话 TTL** | 30 分钟无活动自动清除,防内存泄漏 |
| **Usage 追踪** | 每轮结束推送 `usage` 事件（token 数/步数/工具调用数/耗时） |
| **结构化日志** | `[session=xxx] turn done — steps=3 tools=5 tokens=1200+800 elapsed=15000ms` |
| **query_canvas** | 新工具,Agent 可查询画布当前有哪些节点及其位置 |
| **协议 v2** | 新增 `progress` / `usage` / `keepalive` 事件类型,CanvasNodeSpec 增加 `opacity` / `rotation` |

## API

| Method | Path | 说明 |
|---|---|---|
| GET | `/agent/:sessionId/stream?message=...` | SSE 流（EventSource 友好） |
| POST | `/agent/:sessionId/chat` `{ message }` | SSE 流（fetch + ReadableStream） |
| DELETE | `/agent/:sessionId` | 清空该会话历史 |

### 事件类型（`agent.protocol.ts`）
`thinking` · `tool_call` · `tool_result` · `canvas_op` · `progress` · `usage` · `final` · `error` · `keepalive` · `done`

### canvas_op 操作
`set_frame` · `add_node` · `update_node` · `remove_node` · `generation_started`
节点字段（prompt / model / size / aspectRatio / text / fill / opacity / rotation…）对齐你的 `ImageGen` / `VideoGen` 节点。

### 工具列表（8 个）
| 工具 | 用途 |
|---|---|
| `set_frame` | 设置画板尺寸和背景色 |
| `generate_image` | 生成图片并放置到画布 |
| `generate_video` | 生成视频并放置到画布 |
| `add_text` | 添加文字层 |
| `add_rect` | 添加矩形 |
| `update_node` | 修改已有节点 |
| `remove_node` | 删除节点 |
| `query_canvas` | 查询画布当前状态（所有节点的 refId/类型/位置） |

## 配置

```bash
# Agent 大脑用的 chat 模型（默认 gpt-4o-mini）。任何你渠道支持的 chat 模型都行。
AGENT_CHAT_MODEL=gpt-4o-mini
```

模型必须支持 function calling（GPT-4o、Claude、Gemini、DeepSeek 等主流模型都支持）。

## 前端集成

参考 `useAgent.example.ts`。它：
1. `EventSource` 连 `/agent/:sessionId/stream`。
2. `thinking`/`final` → 聊天 UI；`canvas_op` → `applyCanvasOp()`。
3. `applyCanvasOp` 把 `add_node` 映射成 `new ImageGen(...)` / `new VideoGen(...)`，`generation_started` 时设置 `node.taskId` 并 `node.emit('task-start')` —— 这正是你 `useCanvas.ts` 里轮询逻辑监听的事件。
4. `usage` 事件可用于在聊天 UI 中展示 token 消耗和耗时。
5. `keepalive` 事件自动由 EventSource 忽略（作为 SSE 注释发送）。

也就是说，**前端基本不用写新的生成逻辑**，agent 产出的就是你画布已经认识的节点 + taskId。

## 已验证

- 整个 `board/server` 项目 `tsc --noEmit` 零错误。
- 服务启动，所有 agent 路由正常注册，不影响现有路由。

## 已知行为 / 注意

- **模型偶尔"光说不做"**：能力弱的 chat 模型有时会用文字描述工具调用却不真正发起。system prompt 已加了强约束。若仍频繁出现，把 `AGENT_CHAT_MODEL` 换成更强的模型（如 gpt-4o、claude）。
- **AiService 构造依赖环境 key**：`new OpenAI` 在无 key 时会抛错（openai@6 行为）。启动 server 需要设置任一 `API_KEY` 环境变量（真实的按渠道走 channels.json）。
- **无鉴权**：agent 端点目前无鉴权，与你现有接口一致；对外暴露前请统一加鉴权。
- **历史存内存**：重启丢失。需要持久化时把 `AgentMemory` 的 Map 换成 Redis/DB。现在已有 TTL 自动清理（30 分钟），不会泄漏。
- **query_canvas 仅跟踪当前 session 内 agent 创建的节点**：不包含用户手动在画布上创建的节点。如需完整的画布状态，需前端配合上报。
