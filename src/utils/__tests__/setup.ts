import { vi } from 'vitest';

// Mock environment variables
vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000');

// Mock fetch globally
global.fetch = vi.fn();
