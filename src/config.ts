/**
 * 全局配置 — 从 Vite 环境变量读取，统一管理所有配置项。
 */
export const API_BASE_URL: string =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";
