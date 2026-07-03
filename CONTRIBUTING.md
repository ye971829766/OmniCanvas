# Contributing to AgentsBoard

Thank you for considering contributing to AgentsBoard! Every contribution helps make this project better for everyone.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [How to Contribute](#how-to-contribute)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)

## Code of Conduct

This project adheres to the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold this code.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/agentsboard.git`
3. Create a branch: `git checkout -b feature/your-feature-name`
4. Make your changes
5. Push to your fork: `git push origin feature/your-feature-name`
6. Open a Pull Request

## Development Setup

### Prerequisites

- Node.js >= 18
- Bun >= 1.0 (for the backend)

### Installation

```bash
# Frontend
npm install

# Backend
cd server
bun install
```

### Environment Variables

```bash
cp .env.example .env
cd server && cp .env.example .env
```

You can set `MOCK_AGENT=true`, `MOCK_IMAGE_GENERATION=true`, and `MOCK_VIDEO=true` in `server/.env` to develop without API credits.

### Running

```bash
# Terminal 1: Backend
cd server && bun run dev

# Terminal 2: Frontend
npm run dev
```

### Running Tests

```bash
npm test
```

## How to Contribute

### Reporting Bugs

- Use the [Bug Report](https://github.com/YOUR_USERNAME/agentsboard/issues/new?template=bug_report.md) issue template
- Include steps to reproduce, expected vs actual behavior
- Include browser/OS information and screenshots if applicable

### Suggesting Features

- Use the [Feature Request](https://github.com/YOUR_USERNAME/agentsboard/issues/new?template=feature_request.md) issue template
- Describe the problem you're trying to solve
- Explain why this feature would be useful

### Submitting Code Changes

1. Check existing issues and PRs to avoid duplicate work
2. For significant changes, open an issue first to discuss the approach
3. Keep PRs focused — one feature or fix per PR
4. Write or update tests as needed
5. Update documentation if your changes affect it

## Pull Request Process

1. Update the README.md or relevant docs if your changes affect them
2. Ensure all tests pass: `npm test`
3. Ensure TypeScript compiles: `npm run build`
4. Fill out the PR template completely
5. Request review from a maintainer

### PR Title Convention

Use [Conventional Commits](https://www.conventionalcommits.org/) format:

- `feat: add new shape tool`
- `fix: correct crop boundary calculation`
- `docs: update API configuration guide`
- `refactor: simplify agent service error handling`
- `test: add canvas history unit tests`
- `chore: update dependencies`

## Coding Standards

### General

- Use **TypeScript** for all source files
- Use **Vue 3 Composition API** (not Options API) for components
- Use **composables** (`use*.ts`) for reusable stateful logic
- Follow existing code patterns in the codebase

### Frontend

- Components go in `src/components/`
- Composables go in `src/composables/`
- Types go in `src/types/`
- Utility functions go in `src/utils/`

### Backend

- Follow NestJS module structure
- Agent tools go in `server/src/agent/tools/`
- Keep services focused on a single responsibility

### Commit Messages

- Use clear, descriptive commit messages
- Reference issue numbers where applicable: `fix: handle null canvas state (#42)`

---

Thank you for contributing! 🎉
