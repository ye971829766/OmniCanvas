<div align="center">

# 🎨 OmniCanvas

### **The Next-Generation AI-Native Infinite Canvas for Multimodal Spatial Creation**

_Redefining visual design and creative workflows by fusing high-performance vector graphics, autonomous multi-agent reasoning networks, and multimodal generative AI._

基于自主多模态 AI Agent 驱动的下一代空间化矢量无限画布与智能设计创作引擎。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Vue 3](https://img.shields.io/badge/Vue-3.5-4FC08D?logo=vue.js)](https://vuejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Leafer UI](https://img.shields.io/badge/Leafer_UI-2.x-00D4AA)](https://www.leaferjs.com/)
[![NestJS](https://img.shields.io/badge/NestJS-11.x-E0234E?logo=nestjs)](https://nestjs.com/)
[![Bun](https://img.shields.io/badge/Bun-1.x-F9F1E1?logo=bun)](https://bun.sh/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[English](#-key-features) · [中文特性](#-中文核心特性) · [Architecture](#-system-architecture) · [Getting Started](#-getting-started) · [Admin System](#-admin-dashboard--management) · [Vision & Roadmap](#-vision--future-roadmap)

<br />

<img src="public/示例.png" alt="OmniCanvas Screenshot" width="100%" style="border-radius: 12px; box-shadow: 0 12px 32px rgba(0, 0, 0, 0.15);" />

</div>

---

## 💡 Vision & Mission / 愿景与使命

Traditional whiteboards and vector editing tools are bounded by manual interaction overhead. **OmniCanvas** transforms the infinite canvas from a static design dynamic canvas into an **Active Cognitive Space**.

By deeply combining real-time spatial state parsing with LLM reasoning, visual analysis models, and multi-modal generative AI, OmniCanvas empowers creators to articulate concepts in natural language, while autonomous agents turn high-level intent into pixel-perfect vector structures, styled layouts, and generative media.

> **"From canvas as a canvas, to canvas as an autonomous co-creator."**

---

## 🔥 Key Features

### 🎨 1. High-Performance Vector Infinite Canvas Engine

- **Leafer UI 2.x Engine Integration**: Ultra-fast vector rendering with unlimited zoom, smooth pan, GPU hardware acceleration, and sub-millisecond response.
- **Rich Vector Primitive Suite**: Rectangles, circles, ellipses, stars, regular polygons, straight lines, directional arrows, and dynamic connectors.
- **Natural Freehand & Marker Stroke**: Smooth marker pen drawing with customizable stroke thickness, pressure sensitivity, and live smoothing.
- **TipTap Rich Text & KaTeX Math**: Seamless integration of TipTap markdown rich text editing alongside LaTeX/KaTeX mathematical formula rendering.
- **Smart Image Manipulation & Crop**: Non-destructive image insertion, precise dynamic cropping (`useCanvasCrop`), aspect-ratio lock, and mask controls.
- **Containers & Framing (Frame)**: Nested frame artboards supporting grouping, boundary snapping (`leafer-x-easy-snap`), and spatial region management.
- **Non-Destructive History & Background**: Full undo/redo stack snapshot management, coupled with customizable grid, dot matrix, and infinite viewport backgrounds.
- **Interactive Mouse-Glowing Grid**: A premium obsidian dark background gradient (`#16161a` -> `#0a0a0c`) with dynamic, mouse-following radial glowing dot matrix and soft spotlight illumination.

### 🤖 2. Autonomous Multi-Modal AI Agent & MCOT Reasoning Network

- **Real-Time Spatial Context Awareness**: The Agent continuously reads, serializes, and understands the precise JSON state of all canvas elements in real time.
- **MCOT (Multi-Chain of Thought) Visual Reasoning**: Displays the Agent's multi-step decision graph and internal thought tree in an interactive visual flow.
- **SSE Stream Protocol & Live Execution**: Zero-latency Server-Sent Events streaming response with live feedback on tool calling steps.
- **Interactive Option Preview Cards**: The Agent automatically generates multiple design variants, enabling creators to preview and switch options with a single click.

### 🧰 3. Industrial-Grade Agent Tool Calling Matrix

OmniCanvas provides a modular, pluggable 10+ tool registry (`server/src/agent/tools/`):

- 📐 `canvas.tools`: Full CRUD operations over canvas elements, layering, grouping, and styling.
- 🎨 `style.tools`: Automated color palette extraction, gradient synthesis, and visual style transfer.
- 📐 `layout.tools`: Algorithmic alignment, dynamic grid auto-layout, spacing distribution, and smart arrangement.
- 💡 `plan-design.tools`: Step-by-step design breakdown, UI layout planning, and multi-option generator.
- 👁️ `vision-analysis.tools`: LLM Vision-assisted aesthetic evaluation, visual hierarchy checking, and design compliance verification.
- 🔍 `web-search.tools` & `inspiration.tools`: Real-time web inspiration fetching, color moodboard curation, and reference search.

### 🖼️ 4. Native Multi-Modal Generation & Intelligent Image Editing

- **AI Image & Video Generation**: Direct integration with Flux, DALL-E 3, Gemini, Luma, CogVideo, and local FFmpeg video rendering. Supports dynamic parameter configuration customized by the Agent based on user instructions.
- **AI Image Editing (Remove BG & Inpaint)**: High-precision background removal and selective region inpainting (via Baidu AI) integrated directly onto vector image objects.
- **Local Super-Resolution (Real-ESRGAN)**: 4x high-fidelity image upscaling and clarity reconstruction using local `realesrgan-ncnn-vulkan` pipelines.
- **Parabolic Fly-to-Agent Reference Flow**: Press `Ctrl + Mouse Left Click` on any canvas element to send it to the Agent conversation input via a GSAP parabolic curve flight animation (with automatic closed-panel final position prediction).
- **Private Asset Library (素材库)**: Full-featured PrimeVue-based user private asset manager with folder groups (CRUD, inline rename), drag-and-drop custom sorting, multi-type filters, and collision-free canvas placement.

### 🛠️ 5. Enterprise Admin & Dynamic Gateway Management

- **Dedicated Admin Portal (`/admin`)**: Vue 3 + Element Plus dashboard for managing system metrics, channels, models, and diagnostic tools.
- **Dynamic AI Model Catalog**: Flexible assignment of Chat, Image, and Video models per workspace or user request.
- **Hybrid Offline Mock Engine**: Complete local mock modes (`MOCK_AGENT`, `MOCK_IMAGE_GENERATION`, `MOCK_VIDEO`) allowing full feature development without API keys.

---

## 🌟 中文核心特性

- 🎨 **超高性能矢量无限画布**：底层基于 Leafer UI 2.x 极速渲染引擎构建，支持无级缩放、GPU 硬件加速、丰富矢量图形（矩形/星形/多边形/连接线）、Mark 画笔标注、TipTap 富文本与 KaTeX 数学公式。
- ✨ **动态鼠标泛光矩阵背景**：暗黑模式下精美深炭灰渐变背景，点阵在鼠标周围 200px 内自动平滑泛光，并带有动态蓝光聚光灯跟随。
- 🤖 **自主多模态 AI Agent 与 MCOT 思维链**：具备实时空间状态感知能力，可将画布 JSON 结构即时解析入上下文；内置 Multi-Chain of Thought (MCOT) 可视化思维链与 SSE 低延迟流式响应。
- 🧰 **工业级 10+ Tool Calling 工具矩阵**：涵盖矢量控制、对齐布局、自动调色板、UI方案规划、视觉图像审查（Vision Analysis）及联网搜索。
- 🖼️ **原生多模态生成与参数自由定制**：打通 Flux / DALL-E 3 / Gemini / Luma / CogVideo 生成，支持 Agent 根据用户需求自主推荐并微调多维度生成参数，集成 FFmpeg 视频渲染。
- 🪄 **AI 智能图像处理（一键去背景与局部重绘）**：原生集成高精度智能去背景（Remove Background）与局部重绘擦除（Inpaint）算法，生成结果无损回填矢量画布。
- 🔍 **本地超分清晰化修复 (Real-ESRGAN)**：支持基于本地 `realesrgan-ncnn-vulkan` 的 4x 图像高保真超分修复与降噪，彻底解决素材模糊问题。
- 💫 **GSAP 曲线引用飞入流**：画布元素上 `Ctrl + 鼠标左键` 触发抛物线飞入动画并添加为 Agent 参考图，支持 Agent 面板折叠状态下的轨迹智能终点预测。
- 📦 **用户私有素材库（素材管理器）**：全面基于 PrimeVue 构建，提供图片/视频过滤、分类自定义文件夹（CRUD 及行内重命名）、最新上传/名称/拖拽自定义重排、双击非重叠自动防碰撞置入画布。
- 🎛️ **交互式方案选项卡 (Option Preview Cards)**：Agent 自动生成多套设计变体并渲染选型卡片，用户在聊天面板中一键预览并应用至画布。
- 📐 **专业图层与画板框架管理 (Layer & Frame)**：支持树状图层面板、拖拽重排、锁定/隐藏、成组/解组、容器画板 (Frame)。
- 🛠️ **专属 Admin 企业级管理后台**：内置独立控制台（Vue 3 + Element Plus），提供系统监控、多上游渠道管理、模型配置及 API 连通性测试。
- 🔌 **全能 AI 网关与混合脱机开发引擎**：原生支持 OpenAI、Google Gemini、Anthropic 及第三方网关，支持全套脱机 Mock 仿真调试。

---

## 🏗️ System Architecture

```mermaid
flowchart TB
    subgraph ClientLayer ["Client Layer (Frontend & Admin)"]
        CanvasApp["🎨 Main Canvas App (Vue 3 + Leafer UI 2.x)"]
        AdminDashboard["🛠️ Admin Dashboard (Vue 3 + Element Plus)"]
    end

    subgraph ServerLayer ["Server Layer (NestJS 11 Engine)"]
        AgentCore["🧠 Agent Core Service (NestJS)"]
        CanvasSerializer["📐 Canvas State Serializer"]
        ToolRegistry["🧰 Agent Tool Registry (10+ Tools)"]
        MCOTGraph["⛓️ MCOT Reasoning Engine"]
        ChannelRouter["🔀 Upstream Channel Router"]
    end

    subgraph ToolMatrix ["Agent Tool Calling Matrix"]
        CanvasTools["canvas.tools"]
        LayoutTools["layout.tools"]
        StyleTools["style.tools"]
        GenTools["generation.tools"]
        VisionTools["vision-analysis.tools"]
        SearchTools["web-search.tools"]
    end

    subgraph MultiModalGateways ["AI Providers & Multi-Modal Gateways"]
        OpenAI["OpenAI GPT-4o / DALL-E 3"]
        Gemini["Google Gemini Pro / Imagen"]
        Yunwu["Yunwu Unified AI Gateway"]
        LocalMock["Offline Mock Engine"]
    end

    CanvasApp <-->|SSE Stream / JSON State| AgentCore
    AdminDashboard <-->|REST APIs| ChannelRouter
    AgentCore --> CanvasSerializer
    AgentCore --> MCOTGraph
    AgentCore --> ToolRegistry

    ToolRegistry --> CanvasTools
    ToolRegistry --> LayoutTools
    ToolRegistry --> StyleTools
    ToolRegistry --> GenTools
    ToolRegistry --> VisionTools
    ToolRegistry --> SearchTools

    AgentCore --> ChannelRouter
    ChannelRouter --> OpenAI
    ChannelRouter --> Gemini
    ChannelRouter --> Yunwu
    ChannelRouter --> LocalMock
```

---

## 💻 Tech Stack Matrix

| Area                  | Technologies & Frameworks                                                       | Description                                                  |
| --------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **Canvas Engine**     | Leafer UI 2.x, `@leafer-in/editor`, `@leafer-in/viewport`, `leafer-x-easy-snap` | High-performance vector graphics rendering engine            |
| **Frontend Core**     | Vue 3.5 (Composition API), TypeScript 5.x, Vite 5, Vue Router 4                 | Main user application architecture                           |
| **UI Components**     | PrimeVue 4, Lucide Icons, PrimeIcons, Element Plus (Admin)                      | Component libraries for App & Admin                          |
| **Rich Text & Math**  | TipTap 3, KaTeX, Marked, Incremark                                              | Canvas text formatting and mathematical expression rendering |
| **Styling & Animate** | UnoCSS, GSAP Animation Engine, Sass                                             | Atomic CSS utility styling and smooth transitions            |
| **Server Framework**  | NestJS 11, Express, Bun Runtime, RxJS                                           | Enterprise backend web framework and fast execution          |
| **AI Integration**    | Vercel AI SDK (`ai`, `@ai-sdk/openai`), `@google/genai`                         | Multi-provider unified LLM & multi-modal orchestration       |
| **Media Engine**      | FFmpeg Installer, Multer File Manager                                           | Server-side video processing and file upload pipeline        |

---

## 🚀 Getting Started

### 1. Prerequisites

- **Node.js** >= 18
- **Bun** >= 1.0 (Recommended for high performance) or `npm`/`pnpm`

### 2. Installation

```bash
# Clone the repository
git clone https://github.com/ye971829766/OmniCanvas.git
cd OmniCanvas

# Install root & frontend dependencies
npm install

# Install backend dependencies
cd server
bun install
cd ..

# Install admin dependencies
cd admin
npm install
cd ..
```

### 3. Environment Setup

Create `.env` files for both frontend and backend:

```bash
# Frontend
cp .env.example .env

# Backend
cd server
cp .env.example .env
cd ..
```

#### Frontend Environment (`.env`)

```env
VITE_API_BASE_URL=http://localhost:3000
VITE_APP_TITLE=OmniCanvas
VITE_ENABLE_IMAGE_GEN=true
VITE_ENABLE_VIDEO_GEN=true
```

#### Backend Environment (`server/.env`)

```env
PORT=3000
OPENAI_API_KEY=your_openai_key_here
OPENAI_BASE_URL=https://api.openai.com/v1
GOOGLE_API_KEY=your_gemini_key_here

# Offline Development Mocks (Set true to test without API credits)
MOCK_AGENT=false
MOCK_IMAGE_GENERATION=false
MOCK_VIDEO=false
```

### 4. Configuring Google Sign-In (Optional) / 配置 Google 登录 (可选)

OmniCanvas supports quick login using Google OAuth 2.0. If you wish to configure Google Sign-In:

1. **Get Client ID**: Go to the [Google Cloud Console Credentials Page](https://console.cloud.google.com/apis/credentials), create an **OAuth client ID** for a Web Application.
2. **Set Redirect URIs**: Configure Authorized JavaScript origins to include `http://localhost:5173` (or your production domain).
3. **Configure Environment Variables**:
   - **Frontend (`.env`)**: Add `VITE_GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com`
   - **Backend (`server/.env`)**: Add `GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com`

---

OmniCanvas 原生支持使用 Google OAuth 2.0 进行快捷登录。如需启用 Google 登录：

1. **获取客户端 ID**：访问 [Google Cloud Console 凭据页面](https://console.cloud.google.com/apis/credentials)，创建一个 **OAuth 2.0 客户端 ID** (应用类型选择 Web 应用)。
2. **设置授权源**：将您的前端来源（如 `http://localhost:5173`，生产环境则是您的域名）添加至 **"已授权的 JavaScript 来源"** 中。
3. **配置环境变量**：
   - **前端 (`.env`)**：配置 `VITE_GOOGLE_CLIENT_ID=您的客户端ID.apps.googleusercontent.com`
   - **后端 (`server/.env`)**：配置 `GOOGLE_CLIENT_ID=您的客户端ID.apps.googleusercontent.com`

---

## ⚡ Running the Application

### Option A: Docker One-Click Deployment (Recommended for Production)

Deploy Frontend, Admin Dashboard, and Backend API using Docker & Docker Compose:

```bash
# Linux / Mac
chmod +x deploy-docker.sh
./deploy-docker.sh

# Windows (PowerShell)
.\deploy-docker.ps1

# Or run via Docker Compose directly
docker compose up -d --build
```

### Option B: Local One-Click Start All Services

Run all three services (Frontend, Backend, and Admin Dashboard) concurrently for development:

```bash
bun dev:all
# or
npm run dev:all
```

| Service | Local URL | Description |
|---------|-----------|-------------|
| **Frontend App** | `http://localhost` (Docker) / `http://localhost:5173` (Dev) | Main infinite canvas & AI agent interface |
| **Admin Dashboard** | `http://localhost/admin` (Docker) / `http://localhost:5174` (Dev) | System monitoring, channels, and diagnostics |
| **Backend Service** | `http://localhost:3000` | NestJS REST & SSE Agent service |

### Option C: Individual Service Startup

```bash
# Terminal 1: Backend
cd server && bun run dev

# Terminal 2: Main Frontend App
npm run dev

# Terminal 3: Admin Dashboard
cd admin && npm run dev
```

---

## 🛠️ Admin Dashboard & Management

OmniCanvas contains a dedicated enterprise administration suite in `./admin`:

1. **System Dashboard (概览)**: Monitor active sessions, service uptime, and model configuration quotas.
2. **Upstream Channels (上游渠道)**: Configure OpenAI API, Google Gemini, and custom gateway routes with failover priority.
3. **Model Catalog (模型目录)**: Set default model mappings for Chat (e.g., GPT-4o), Image (e.g., Flux/DALL-E 3), and Video (e.g., Luma).
4. **Agent Presets (Agent 配置)**: Adjust system prompts, temperature, and fine-tune available tool definitions.
5. **API Diagnostics (接口诊断)**: Test real-time connection status, latency, and response payloads across all registered API channels.

---

## 📁 Deep Repository Architecture

```
omnicanvas/
├── src/                        # Main Frontend Application
│   ├── components/             # UI Components
│   │   ├── Canvas.vue          # Main infinite canvas container & event layer
│   │   ├── AgentPanel.vue      # AI Agent streaming interaction panel
│   │   ├── ViboardToolbar.vue  # Main floating drawing tool palette
│   │   ├── sidebar.vue         # Workspace sidebar & navigation manager
│   │   ├── agent/              # MCOT graph, tool cards, option preview cards
│   │   ├── canvas/             # Layer panel, zoom controller, grid background
│   │   └── toolbar/            # Stroke slider, color picker, text controls
│   ├── composables/            # Vue Composition Hooks
│   │   ├── useCanvas.ts        # Core element management & Leafer UI bindings
│   │   ├── useAgent.ts         # Agent SSE streaming & execution dispatcher
│   │   ├── useCanvasCrop.ts    # Interactive image cropping hook
│   │   ├── useCanvasHistory.ts # State snapshots & Undo/Redo pipeline
│   │   └── useCanvasFrame.ts   # Artboard containers & Frame management
│   ├── types/                  # Shared TypeScript data models
│   └── views/                  # Application views
├── server/                     # Backend NestJS Engine
│   └── src/
│       ├── agent/              # Autonomous Agent Core
│       │   ├── agent.service.ts    # ReAct agent execution loop & tool runner
│       │   ├── canvas-state.ts     # Canvas JSON state parser & serializer
│       │   ├── mcot-graph.ts       # MCOT reasoning graph generator
│       │   ├── system-prompt.ts    # Domain-aware prompt templates
│       │   └── tools/              # 10+ Tool Calling implementations
│       ├── ai/                 # Multi-provider LLM, Image & Video adapters
│       ├── workspaces/         # Workspace persistence & session management
│       ├── channels/           # Gateway channel router & failover manager
│       └── model-config/       # Dynamic model directory service
├── admin/                      # Vue 3 + Element Plus Admin Dashboard
├── run-all.js                  # Cross-platform concurrent task orchestrator
└── agent-integration/          # Integration specs & developer guides
```

---

## 🗺️ Vision & Future Roadmap (2026 - 2027)

OmniCanvas is advancing towards a comprehensive spatial AI ecosystem. Our strategic roadmap includes:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            OMNICANVAS ROADMAP                               │
└─────────────────────────────────────────────────────────────────────────────┘
  Phase 1 (Q3 2026)      Phase 2 (Q4 2026)      Phase 3 (Q1 2027)      Phase 4 (Q2 2027)
  Multi-Agent Network  ──► Code-to-Canvas UI ──► Spatial 3D & Vector ──► Open Plugin Ecosystem
```

- [x] **Phase 1: Real-time Multi-Agent Collaborative Network**
  - Multi-agent orchestration (e.g. Design Agent + Critic Agent + Layout Specialist Agent working concurrently on one canvas).
  - WebSockets / WebRTC real-time multi-user & multi-agent collaborative editing.
- [ ] **Phase 2: Bidirectional Code-to-Canvas & UI Component Export**
  - One-click transformation of canvas vector components into Vue 3 / React / Tailwind CSS production code.
  - Live preview of running frontend components directly embedded in canvas artboards.
- [ ] **Phase 3: Spatial 3D & Generative Vector Intelligence**
  - Integration of 3D Gaussian Splatting & WebGL 3D canvas viewports alongside Leafer 2D vector elements.
  - Fine-tuned local Diffusion Models for native SVG vector icon and illustration generation.
- [ ] **Phase 4: Autonomous Design Workflow Plugin Ecosystem**
  - Open-source SDK for third-party developers to register custom Agent tools, canvas nodes, and AI workflows.
  - Marketplace for sharing Agent prompts, design knowledge bases, and custom UI components.

---

## 🤝 Contributing

We welcome contributions from developers, designers, and AI enthusiasts around the globe!

1. Fork the Repository
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

Please refer to our [Contributing Guide](CONTRIBUTING.md) for detailed guidelines.

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for more information.

---

<div align="center">
  <sub>Built with ❤️ by the OmniCanvas Open Source Team & Community.</sub>
</div>            # Vue Composition Hooks
│   │   ├── useCanvas.ts        # Core element management & Leafer UI bindings
│   │   ├── useAgent.ts         # Agent SSE streaming & execution dispatcher
│   │   ├── useCanvasCrop.ts    # Interactive image cropping hook
│   │   ├── useCanvasHistory.ts # State snapshots & Undo/Redo pipeline
│   │   └── useCanvasFrame.ts   # Artboard containers & Frame management
│   ├── types/                  # Shared TypeScript data models
│   └── views/                  # Application views
├── server/                     # Backend NestJS Engine
│   └── src/
│       ├── agent/              # Autonomous Agent Core
│       │   ├── agent.service.ts    # ReAct agent execution loop & tool runner
│       │   ├── canvas-state.ts     # Canvas JSON state parser & serializer
│       │   ├── mcot-graph.ts       # MCOT reasoning graph generator
│       │   ├── system-prompt.ts    # Domain-aware prompt templates
│       │   └── tools/              # 10+ Tool Calling implementations
│       ├── ai/                 # Multi-provider LLM, Image & Video adapters
│       ├── workspaces/         # Workspace persistence & session management
│       ├── channels/           # Gateway channel router & failover manager
│       └── model-config/       # Dynamic model directory service
├── admin/                      # Vue 3 + Element Plus Admin Dashboard
├── run-all.js                  # Cross-platform concurrent task orchestrator
└── agent-integration/          # Integration specs & developer guides
```

---

## 🗺️ Vision & Future Roadmap (2026 - 2027)

OmniCanvas is advancing towards a comprehensive spatial AI ecosystem. Our strategic roadmap includes:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            AGENTBOARD ROADMAP                               │
└─────────────────────────────────────────────────────────────────────────────┘
  Phase 1 (Q3 2026)      Phase 2 (Q4 2026)      Phase 3 (Q1 2027)      Phase 4 (Q2 2027)
  Multi-Agent Network  ──► Code-to-Canvas UI ──► Spatial 3D & Vector ──► Open Plugin Ecosystem
```

- [x] **Phase 1: Real-time Multi-Agent Collaborative Network**
  - Multi-agent orchestration (e.g. Design Agent + Critic Agent + Layout Specialist Agent working concurrently on one canvas).
  - WebSockets / WebRTC real-time multi-user & multi-agent collaborative editing.
- [ ] **Phase 2: Bidirectional Code-to-Canvas & UI Component Export**
  - One-click transformation of canvas vector components into Vue 3 / React / Tailwind CSS production code.
  - Live preview of running frontend components directly embedded in canvas artboards.
- [ ] **Phase 3: Spatial 3D & Generative Vector Intelligence**
  - Integration of 3D Gaussian Splatting & WebGL 3D canvas viewports alongside Leafer 2D vector elements.
  - Fine-tuned local Diffusion Models for native SVG vector icon and illustration generation.
- [ ] **Phase 4: Autonomous Design Workflow Plugin Ecosystem**
  - Open-source SDK for third-party developers to register custom Agent tools, canvas nodes, and AI workflows.
  - Marketplace for sharing Agent prompts, design knowledge bases, and custom UI components.

---

## 🤝 Contributing

We welcome contributions from developers, designers, and AI enthusiasts around the globe!

1. Fork the Repository
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

Please refer to our [Contributing Guide](CONTRIBUTING.md) for detailed guidelines.

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for more information.

---

<div align="center">
  <sub>Built with ❤️ by the OmniCanvas Open Source Team & Community.</sub>
</div>
