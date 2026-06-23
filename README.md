# AgentsBoard

基于 Leafer UI 的智能白板协作工具，集成 AI Agent 实现自然语言驱动的可视化创作。

## 功能特性

- 🎨 **无限画布** - 基于 Leafer UI 的高性能矢量绘图引擎
- 🤖 **AI Agent 集成** - 通过自然语言生成图形、图像和视频
- 📐 **丰富工具** - 形状、文本、标记、连线等完整绘图工具
- 🎭 **实时协作** - 多工作空间支持，状态自动同步
- 🖼️ **AI 生成** - 集成图像和视频生成能力
- ⚡ **即时响应** - 图层管理、历史记录、快速编辑

## 快速开始

### 环境要求

- Node.js >= 18
- Bun >= 1.0 (推荐) 或 npm/pnpm

### 安装依赖

```bash
# 前端
npm install

# 后端
cd server
bun install
```

### 配置环境变量

复制环境变量模板并配置：

```bash
# 前端根目录
cp .env.example .env

# 后端
cd server
cp .env.example .env
```

编辑 `.env` 文件，配置必要的 API 密钥（详见下方配置说明）。

### 启动项目

```bash
# 启动后端服务（终端 1）
cd server
bun run dev

# 启动前端开发服务器（终端 2）
npm run dev
```

访问 http://localhost:5173

## 环境变量配置

### 前端 (`.env`)

```bash
# API 服务地址
VITE_API_BASE_URL=http://localhost:3000

# 可选：其他配置
# VITE_APP_TITLE=AgentsBoard
```

### 后端 (`server/.env`)

```bash
# 服务端口
PORT=3000

# OpenAI API 配置
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_BASE_URL=https://api.openai.com/v1

# Google Gemini API 配置（可选）
GOOGLE_API_KEY=your_google_api_key_here

# 文件上传配置
MAX_FILE_SIZE=10485760
UPLOAD_DIR=./files
```

## 项目结构

```
.
├── src/                    # 前端源码
│   ├── components/         # Vue 组件
│   │   ├── Canvas.vue      # 画布主组件
│   │   ├── AgentPanel.vue  # AI 助手面板
│   │   └── toolbar/        # 工具栏组件
│   ├── composables/        # 组合式函数
│   │   ├── useCanvas.ts    # 画布逻辑
│   │   └── useAgent.ts     # Agent 逻辑
│   └── views/              # 页面视图
├── server/                 # 后端服务
│   ├── src/
│   │   ├── main.ts         # 入口文件
│   │   └── routes/         # API 路由
│   └── data/               # 数据存储
└── public/                 # 静态资源
```

## 技术栈

### 前端
- Vue 3 + TypeScript
- Vite
- Leafer UI (画布引擎)
- PrimeVue (UI 组件库)
- TipTap (富文本编辑)
- UnoCSS (原子化 CSS)

### 后端
- Bun + TypeScript
- NestJS / Express
- OpenAI API
- Google Gemini API

## 开发指南

### 构建生产版本

```bash
# 前端构建
npm run build

# 预览构建结果
npm run preview
```

### 类型检查

```bash
npm run build  # 包含 vue-tsc 类型检查
```

### 运行测试

```bash
# 运行单元测试
npm test

# 运行测试并打开 UI 界面
npm run test:ui
```

## P1 功能改进（已完成）

✅ **数据持久化** - 画布状态自动保存至后端，切换工作空间自动加载  
✅ **性能优化工具** - 提供 debounce/throttle 工具和批量更新优化  
✅ **TypeScript 类型** - 完善核心类型定义（Canvas、Workspace、Tool 等）  
✅ **测试框架** - 集成 Vitest，包含性能工具的单元测试示例

## 常见问题

**Q: 启动后看不到工作空间？**  
A: 首次运行需要点击左侧边栏的"创建新工作空间"按钮。

**Q: AI 功能无法使用？**  
A: 检查后端 `.env` 中的 API 密钥是否正确配置。

**Q: 文件上传失败？**  
A: 检查文件大小是否超过限制（默认 10MB），确保 `server/files` 目录存在且有写入权限。

## 许可证

Private - All Rights Reserved

## 联系方式

如有问题或建议，请提交 Issue。
