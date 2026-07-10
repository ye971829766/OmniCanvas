<script setup lang="ts">
import { computed } from "vue";
import { Download, Play } from "lucide-vue-next";

const props = defineProps<{
  refId: string;
  title?: string;
  state?: {
    refId: string;
    type: "image" | "video" | "text" | "rect" | string;
    status: "generating" | "done" | "error";
    url?: string;
    thumbnailUrl?: string;
    error?: string;
  };
}>();

const emit = defineEmits<{ (e: "zoom", refId: string): void }>();

const displayTitle = computed(() => {
  if (props.title) return props.title;
  const stateVal = props.state as any;
  if (stateVal?.prompt) {
    const p = String(stateVal.prompt).trim();
    if (p.length > 0) {
      // Pick first 16 characters or Chinese title
      return p.length > 18 ? p.slice(0, 18) + "…" : p;
    }
  }
  return "视觉设计方案";
});

function downloadMedia(e: MouseEvent) {
  e.stopPropagation();
  const url = props.state?.url || props.state?.thumbnailUrl;
  if (!url) return;

  const a = document.createElement("a");
  a.href = url;
  a.download = `${displayTitle.value || "design"}_${Date.now()}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
</script>

<template>
  <div class="preview-card" @click="emit('zoom', refId)">
    <!-- ── GENERATING: gradient mesh skeleton ──────────────────── -->
    <div v-if="!state || state.status === 'generating'" class="preview-mesh">
      <div class="mesh-gradient" />
      <div class="mesh-content">
        <p class="mesh-label">生成中</p>
      </div>
    </div>

    <!-- ── ERROR ──────────────────────────────────────────────── -->
    <div v-else-if="state.status === 'error'" class="preview-error">
      <span class="error-icon">⚠</span>
      <span class="error-text">{{ state.error || "生成失败" }}</span>
    </div>

    <!-- ── DONE: image ────────────────────────────────────────── -->
    <div
      v-else-if="state.status === 'done' && state.type === 'image'"
      class="preview-done"
    >
      <img :src="state.url" class="preview-img" />
      <button
        class="action-download-btn"
        @click.stop="downloadMedia"
        title="下载图片"
        aria-label="下载图片"
      >
        <Download :size="16" />
      </button>
    </div>

    <!-- ── DONE: video ────────────────────────────────────────── -->
    <div
      v-else-if="state.status === 'done' && state.type === 'video'"
      class="preview-done"
    >
      <img :src="state.thumbnailUrl || state.url" class="preview-img" />

      <!-- Play button with breathing pulse -->
      <button
        class="play-btn"
        @click.stop="emit('zoom', refId)"
        aria-label="定位画布"
      >
        <Play :size="16" fill="currentColor" />
      </button>

      <!-- Floating Download Button -->
      <button
        class="action-download-btn"
        @click.stop="downloadMedia"
        title="下载视频"
        aria-label="下载视频"
      >
        <Download :size="16" />
      </button>

      <span class="video-badge">VIDEO</span>
      <div class="preview-overlay">
        <span class="preview-tip">点击定位画布</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ── Title Header ───────────────────────────────────────────────── */
.card-title-header {
  padding: 8px 12px 6px;
  background: var(--p-surface-0, #ffffff);
  border-bottom: 1px solid var(--p-surface-100, #f4f4f5);
}

.card-title-text {
  font-size: 13px;
  font-weight: 650;
  color: var(--text-primary);
  letter-spacing: 0.2px;
}

/* ── Floating Download Button (Reference Image style) ──────────── */
.action-download-btn {
  position: absolute;
  bottom: 12px;
  right: 12px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(0, 0, 0, 0.08);
  color: var(--text-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 5;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
  transition: all 0.18s ease;
}

.action-download-btn:hover {
  background: var(--accent-primary);
  color: #ffffff;
  transform: scale(1.08);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
}

/* ── Card shell ─────────────────────────────────────────────────── */
.preview-card {
  position: relative;
  margin: 8px 0;
  border-radius: 14px;
  overflow: hidden;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
  transition:
    transform 0.18s cubic-bezier(0, 0, 0.2, 1),
    box-shadow 0.18s cubic-bezier(0, 0, 0.2, 1);
  border: 1px solid rgba(0, 0, 0, 0.04);
}

/* .preview-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
} */

/* .preview-card:hover .preview-img {
  transform: scale(1.02);
} */

/* Glow ring flash on complete */
.glow-ring {
  box-shadow:
    0 0 0 3px rgba(16, 185, 129, 0.2),
    0 8px 24px rgba(0, 0, 0, 0.1);
  animation: glow-flash 0.7s ease-out forwards;
}

@keyframes glow-flash {
  0% {
    box-shadow:
      0 0 0 4px rgba(16, 185, 129, 0.35),
      0 8px 24px rgba(0, 0, 0, 0.1);
  }
  100% {
    box-shadow:
      0 0 0 0px rgba(16, 185, 129, 0),
      0 4px 16px rgba(0, 0, 0, 0.06);
  }
}

/* ── Gradient mesh skeleton ─────────────────────────────────────── */
.preview-mesh {
  min-height: 180px;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.mesh-gradient {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    135deg,
    #f4f4f5 0%,
    #e4e4e7 25%,
    #fafafa 50%,
    #e4e4e7 75%,
    #f4f4f5 100%
  );
  background-size: 400% 400%;
  animation: mesh-flow 4s ease-in-out infinite;
}

@keyframes mesh-flow {
  0%,
  100% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
}

.mesh-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.mesh-label {
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 500;
  user-select: none;
}

.mesh-progress {
  width: 80px;
  height: 2px;
  border-radius: 1px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.06);
  position: relative;
}

.mesh-progress::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, #7c3aed, transparent);
  background-size: 200% 100%;
  animation: mesh-progress-flow 1.8s ease-in-out infinite;
}

@keyframes mesh-progress-flow {
  0% {
    background-position: 150% 0;
  }
  100% {
    background-position: -150% 0;
  }
}

/* ── Error ──────────────────────────────────────────────────────── */
.preview-error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
  background: #fef2f2;
  border-radius: 14px;
  font-size: 12.5px;
}

.error-icon {
  font-size: 16px;
}
.error-text {
  color: var(--accent-error);
  font-weight: 500;
}

/* ── Done content ───────────────────────────────────────────────── */
.preview-done {
  position: relative;
  overflow: hidden;
  background: #111;
}

.preview-img {
  width: 100%;
  height: auto;
  max-height: 480px;
  display: block;
  object-fit: contain;
}

/* Overlay */
.preview-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.55) 0%, transparent 55%);
  display: flex;
  align-items: flex-end;
  padding: 10px 12px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.preview-card:hover .preview-overlay {
  opacity: 1;
}

.preview-tip {
  color: rgba(255, 255, 255, 0.9);
  font-size: 11px;
  font-weight: 500;
}

/* ── Video play button ──────────────────────────────────────────── */
.play-btn {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.92);
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-primary);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
  z-index: 3;
  animation: play-breathe 2s ease-in-out infinite;
  transition:
    background 0.15s ease,
    transform 0.15s ease;
}

.play-btn:hover {
  background: var(--accent-primary);
  color: #fff;
  transform: translate(-50%, -50%) scale(1.1);
  animation: none;
}

@keyframes play-breathe {
  0%,
  100% {
    transform: translate(-50%, -50%) scale(0.95);
  }
  50% {
    transform: translate(-50%, -50%) scale(1.05);
  }
}

.video-badge {
  position: absolute;
  top: 10px;
  right: 10px;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(6px);
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.8px;
  padding: 3px 8px;
  border-radius: 99px;
  z-index: 3;
  border: 1px solid rgba(255, 255, 255, 0.15);
}

/* ── Dark mode ──────────────────────────────────────────────────── */
:global(.p-dark .preview-card) {
  border-color: rgba(255, 255, 255, 0.05);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
}

:global(.p-dark .mesh-gradient) {
  background: linear-gradient(
    135deg,
    #18181b 0%,
    #27272a 25%,
    #1f1f23 50%,
    #27272a 75%,
    #18181b 100%
  );
  background-size: 400% 400%;
}

:global(.p-dark .preview-error) {
  background: #1c1111;
}

:global(.p-dark .curtain) {
  background: #18181b;
}

:global(.p-dark .error-text) {
  color: #f87171;
}
</style>
