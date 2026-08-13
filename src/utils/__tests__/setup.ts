import { vi } from 'vitest';

// Mock environment variables
vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000');
vi.stubEnv('VITE_ENABLE_AGENT', 'true');
vi.stubEnv('VITE_ENABLE_IMAGE_GEN', 'true');
vi.stubEnv('VITE_ENABLE_VIDEO_GEN', 'true');
vi.stubEnv('VITE_ENABLE_REMOVE_BG', 'true');

// Mock fetch globally
global.fetch = vi.fn();
