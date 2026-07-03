<div align="center">

# 🎨 AgentsBoard

**AI-Powered Infinite Canvas for Visual Creation**

An open-source intelligent whiteboard that turns natural language into visual designs through integrated AI agents.

基于 AI Agent 的智能无限画布，通过自然语言驱动可视化创作。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Vue 3](https://img.shields.io/badge/Vue-3.x-4FC08D?logo=vue.js)](https://vuejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Leafer UI](https://img.shields.io/badge/Leafer_UI-2.x-00D4AA)](https://www.leaferjs.com/)

[English](#features) · [中文](#功能特性) · [Getting Started](#getting-started) · [Contributing](CONTRIBUTING.md)

</div>

---

## Features

- 🎨 **Infinite Canvas** — High-performance vector drawing engine powered by Leafer UI
- 🤖 **AI Agent Integration** — Generate graphics, images, and videos through natural language
- 📐 **Rich Toolset** — Shapes, text, markers, connectors, crop, and more
- 🖼️ **AI Generation** — Integrated image and video generation with real-time progress
- ⚡ **Instant Feedback** — Layer management, undo/redo history, quick editing
- 🎭 **Multi-Workspace** — Multiple workspaces with automatic state sync
- 🔌 **Extensible** — Pluggable tool registry and model configuration system
- 🧠 **Smart Agent** — Context-aware design agent that understands canvas state

## 功能特性

- 🎨 **无限画布** — 基于 Leafer UI 的高性能矢量绘图引擎
- 🤖 **AI Agent 集成** — 通过自然语言生成图形、图像和视频
- 📐 **丰富工具** — 形状、文本、标记、连线、裁剪等完整绘图工具
- 🖼️ **AI 生成** — 集成图像和视频生成，支持实时进度显示
- ⚡ **即时响应** — 图层管理、撤销/重做历史、快速编辑
- 🎭 **多工作空间** — 支持多个工作空间，状态自动同步
- 🔌 **可扩展** — 可插拔的工具注册表和模型配置系统
- 🧠 **智能 Agent** — 理解画布状态的上下文感知设计 Agent

---

## Tech Stack

### Frontend
- **Vue 3** + TypeScript
- **Vite** — Build tooling
- **Leafer UI** — Canvas engine
- **PrimeVue** — UI component library
- **TipTap** — Rich text editing
- **UnoCSS** — Atomic CSS

### Backend
- **Bun** + TypeScript
- **NestJS** — Server framework
- **OpenAI API** — LLM and image generation
- **Google Gemini API** — Alternative AI provider
- **Yunwu API** — Optional third-party AI gateway (see [configuration](#backend-serverenv))

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [Bun](https://bun.sh/) >= 1.0 (recommended for backend) or npm/pnpm

### Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/agentsboard.git
cd agentsboard

# Install frontend dependencies
npm install

# Install backend dependencies
cd server
bun install
```

### Configuration

Copy the environment variable templates:

```bash
# Frontend (project root)
cp .env.example .env

# Backend
cd server
cp .env.example .env
```

Edit each `.env` file to configure your API keys. See the configuration sections below.

### Running

```bash
# Terminal 1: Start the backend
cd server
bun run dev

# Terminal 2: Start the frontend dev server
npm run dev
```

Visit http://localhost:5173

---

## Configuration

### Frontend (`.env`)

```bash
# Backend API base URL
VITE_API_BASE_URL=http://localhost:3000

# Application title
VITE_APP_TITLE=AgentsBoard

# Feature flags
VITE_ENABLE_IMAGE_GEN=true
VITE_ENABLE_VIDEO_GEN=true
```

### Backend (`server/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | ✅ | Server port (default: `3000`) |
| `OPENAI_API_KEY` | ✅ | OpenAI API key |
| `OPENAI_BASE_URL` | ❌ | Custom OpenAI-compatible endpoint |
| `GOOGLE_API_KEY` | ❌ | Google Gemini API key |
| `MAX_FILE_SIZE` | ❌ | Max upload size in bytes (default: 10MB) |
| `UPLOAD_DIR` | ❌ | Upload directory (default: `./files`) |
| `CORS_ORIGIN` | ❌ | Allowed CORS origins |
| `MOCK_AGENT` | ❌ | Bypass LLM calls for development |
| `MOCK_IMAGE_GENERATION` | ❌ | Use color block placeholders |
| `MOCK_VIDEO` | ❌ | Use local FFmpeg mock video |

<details>
<summary><strong>Optional: Yunwu (云雾) API Integration</strong></summary>

[Yunwu](https://yunwu.ai) is a third-party AI gateway that provides unified access to multiple model providers. If configured, Yunwu keys take priority over default OpenAI keys.

| Variable | Purpose |
|----------|---------|
| `API_KEY` / `YUNWU_API_KEY` | Unified fallback key |
| `CHAT_API_KEY` / `YUNWU_CHAT_API_KEY` | LLM chat completions |
| `IMAGE_API_KEY` / `YUNWU_IMAGE_API_KEY` | Image generation |
| `YUNWU_VIDEO_API_KEY` | Video generation |

</details>

---

## Project Structure

```
.
├── src/                        # Frontend source
│   ├── components/             # Vue components
│   │   ├── Canvas.vue          # Main canvas component
│   │   ├── AgentPanel.vue      # AI assistant panel
│   │   ├── canvas/             # Canvas sub-components
│   │   └── toolbar/            # Toolbar components
│   ├── composables/            # Vue composables
│   │   ├── useCanvas.ts        # Canvas logic
│   │   ├── useAgent.ts         # Agent interaction logic
│   │   ├── useCanvasCrop.ts    # Image cropping
│   │   ├── useCanvasHistory.ts # Undo/redo history
│   │   └── ...                 # Other canvas composables
│   ├── types/                  # TypeScript type definitions
│   ├── utils/                  # Utility functions
│   └── views/                  # Page views
├── server/                     # Backend service
│   └── src/
│       ├── agent/              # AI Agent module
│       │   ├── agent.service.ts    # Core agent logic
│       │   ├── system-prompt.ts    # Agent system prompt
│       │   ├── tools/              # Agent tool implementations
│       │   └── design-knowledge/   # Design knowledge base
│       ├── ai/                 # AI service (LLM, image, video)
│       ├── workspaces/         # Workspace management
│       ├── channels/           # Communication channels
│       └── model-config/       # Model configuration
├── agent-integration/          # Agent integration guide & examples
└── public/                     # Static assets
```

---

## Development

### Build for Production

```bash
npm run build      # Includes vue-tsc type checking
npm run preview    # Preview the production build
```

### Run Tests

```bash
npm test           # Run unit tests
npm run test:ui    # Run tests with UI
```

---

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## License

This project is licensed under the [MIT License](LICENSE).

---

## FAQ

**Q: No workspace visible after starting?**
A: Click the "Create New Workspace" button in the left sidebar.

**Q: AI features not working?**
A: Check that the API keys in `server/.env` are correctly configured. You can also set `MOCK_AGENT=true` to test without API credits.

**Q: File upload failed?**
A: Check the file size limit (default 10MB) and ensure the `server/files` directory exists with write permissions.
