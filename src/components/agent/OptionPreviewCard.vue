<script setup lang="ts">
defineProps<{
  refId: string;
  state?: {
    refId: string;
    type: "image" | "video" | "text" | "rect" | string;
    status: "generating" | "done" | "error";
    url?: string;
    thumbnailUrl?: string;
    error?: string;
  };
}>();

const emit = defineEmits<{
  (e: "zoom", refId: string): void;
}>();
</script>

<template>
  <div class="option-preview-card" @click="emit('zoom', refId)">
    <!-- Loading status -->
    <div v-if="!state || state.status === 'generating'" class="preview-skeleton">
      <div class="skeleton-shimmer" />
      <div class="skeleton-label">生成中…</div>
    </div>

    <!-- Error status -->
    <div v-else-if="state.status === 'error'" class="preview-error">
      <span class="text-red-500 mr-2">⚠️</span>
      <span class="error-text">{{ state.error || "生成失败" }}</span>
    </div>

    <!-- Done status (Image) -->
    <div
      v-else-if="state.status === 'done' && state.type === 'image'"
      class="preview-content"
    >
      <img :src="state.url" class="preview-img" />
      <div class="preview-overlay">
        <span class="preview-tip">点击定位画布</span>
      </div>
    </div>

    <!-- Done status (Video) -->
    <div
      v-else-if="state.status === 'done' && state.type === 'video'"
      class="preview-content"
    >
      <img :src="state.thumbnailUrl || state.url" class="preview-img" />
      <div class="video-play-btn">
        <span class="play-icon">▶</span>
      </div>
      <div class="preview-overlay">
        <span class="preview-tip">点击定位画布</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.option-preview-card {
  margin-top: 8px;
  margin-bottom: 8px;
  border-radius: 12px;
  border: 1px solid var(--p-surface-200, #e5e7eb);
  background: var(--p-surface-50, #f9fafb);
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}

.option-preview-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
  border-color: var(--p-primary-color);
}

.preview-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12.5px;
  color: var(--p-text-muted-color, #6b7280);
}

.preview-error {
  display: flex;
  align-items: center;
  padding: 16px;
  font-size: 12.5px;
  color: #ef4444;
}

.error-text {
  font-weight: 500;
}

.preview-content {
  position: relative;
  width: 100%;
  background: #111;
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-img {
  width: 100%;
  height: auto;
  max-height: 480px;
  display: block;
  object-fit: contain;
  transition: transform 0.3s ease;
}

.preview-skeleton {
  height: 200px;
  position: relative;
  overflow: hidden;
  background: var(--p-surface-100, #f3f4f6);
  display: flex;
  align-items: center;
  justify-content: center;
}

.skeleton-shimmer {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.5) 50%, transparent 100%);
  background-size: 200% 100%;
  animation: shimmer-sweep 1.6s ease-in-out infinite;
}

@keyframes shimmer-sweep {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.skeleton-label {
  font-size: var(--text-sm, 13px);
  color: var(--p-text-muted-color, #9ca3af);
  position: relative;
  z-index: 1;
}

.preview-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to top,
    rgba(0, 0, 0, 0.6) 0%,
    rgba(0, 0, 0, 0) 60%
  );
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding: 10px 12px;
  opacity: 0.85;
  transition: opacity 0.2s ease;
}

.option-preview-card:hover .preview-overlay {
  opacity: 1;
}

.preview-tag {
  background: rgba(255, 255, 255, 0.25);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  color: #fff;
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.video-tag {
  background: rgba(109, 40, 217, 0.4);
  border-color: rgba(109, 40, 217, 0.2);
}

.preview-tip {
  color: rgba(255, 255, 255, 0.85);
  font-size: 11px;
}

.video-play-btn {
  position: absolute;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 2;
  transition: transform 0.2s ease;
}

.option-preview-card:hover .video-play-btn {
  transform: scale(1.1);
}

.play-icon {
  color: var(--p-primary-color);
  font-size: 12px;
  margin-left: 2px;
}
</style>
