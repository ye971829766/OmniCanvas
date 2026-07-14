<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Download, Play } from "lucide-vue-next";
import type { NodeState } from "@/composables/useAgent";

const props = defineProps<{
  refId: string;
  title?: string;
  state?: NodeState;
  compact?: boolean;
}>();

const emit = defineEmits<{ (e: "zoom", refId: string): void }>();

const displayTitle = computed(() => {
  if (props.title) return props.title;
  const stateVal = props.state as any;
  if (stateVal?.prompt) {
    const p = String(stateVal.prompt).trim();
    if (p.length > 0) {
      return p.length > 18 ? p.slice(0, 18) + "…" : p;
    }
  }
  return "视觉设计方案";
});

const isVideo = computed(
  () => props.state?.status === "done" && props.state?.type === "video",
);

const videoSrc = computed(() => {
  if (!isVideo.value || !props.state) return "";
  return props.state.url || "";
});

/** Poster must be an image URL — never a .mp4 / video URL. */
const posterSrc = computed(() => {
  if (!props.state) return "";
  const thumb = props.state.thumbnailUrl || "";
  if (thumb && !looksLikeVideoUrl(thumb)) return thumb;
  return "";
});

const posterFailed = ref(false);
const inlinePlaying = ref(false);
const videoEl = ref<HTMLVideoElement | null>(null);

watch(
  () => [props.state?.url, props.state?.thumbnailUrl, props.state?.type],
  () => {
    posterFailed.value = false;
    inlinePlaying.value = false;
  },
);

function looksLikeVideoUrl(url: string): boolean {
  if (!url) return false;
  const lower = url.split("?")[0].toLowerCase();
  return (
    lower.endsWith(".mp4") ||
    lower.endsWith(".webm") ||
    lower.endsWith(".mov") ||
    lower.endsWith(".m4v") ||
    lower.includes("/video") ||
    lower.includes("video/")
  );
}

function downloadMedia(e: MouseEvent) {
  e.stopPropagation();
  const state = props.state;
  if (!state) return;

  const url =
    state.type === "video"
      ? state.url || state.thumbnailUrl
      : state.url || state.thumbnailUrl;
  if (!url) return;

  const isVid = state.type === "video" || looksLikeVideoUrl(url);
  let ext = isVid ? "mp4" : "png";
  try {
    const path = new URL(url, window.location.origin).pathname;
    const match = path.match(/\.([a-z0-9]{2,5})$/i);
    if (match) ext = match[1].toLowerCase();
  } catch {
    /* keep default */
  }

  const a = document.createElement("a");
  a.href = url;
  a.download = `${displayTitle.value || "media"}_${Date.now()}.${ext}`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

async function onPlayClick(e: MouseEvent) {
  e.stopPropagation();
  if (!videoSrc.value) {
    emit("zoom", props.refId);
    return;
  }
  // Prefer inline preview play in the agent panel
  inlinePlaying.value = true;
  await Promise.resolve();
  const el = videoEl.value;
  if (!el) {
    emit("zoom", props.refId);
    return;
  }
  try {
    el.muted = false;
    el.volume = 1;
    await el.play();
  } catch {
    // Autoplay with sound may fail — still show controls for user to play
    try {
      el.muted = true;
      await el.play();
    } catch {
      emit("zoom", props.refId);
    }
  }
}

function onVideoEnded() {
  inlinePlaying.value = false;
}
</script>

<template>
  <div
    class="preview-card"
    :class="{ compact, 'is-video': isVideo }"
    role="button"
    tabindex="0"
    title="定位到画布"
    :aria-label="`${displayTitle}，点击定位到画布`"
    @click="emit('zoom', refId)"
    @keydown.enter="emit('zoom', refId)"
    @keydown.space.prevent="emit('zoom', refId)"
  >
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
      <img :src="state.url" class="preview-img" alt="" />
      <button
        class="action-download-btn"
        type="button"
        aria-label="下载图片"
        @click.stop="downloadMedia"
      >
        <Download :size="15" />
      </button>
    </div>

    <!-- ── DONE: video ────────────────────────────────────────── -->
    <div
      v-else-if="state.status === 'done' && state.type === 'video'"
      class="preview-done preview-video"
    >
      <!-- Inline player after user hits play -->
      <video
        v-if="inlinePlaying && videoSrc"
        ref="videoEl"
        class="preview-video-el"
        :src="videoSrc"
        :poster="posterSrc || undefined"
        controls
        playsinline
        @ended="onVideoEnded"
        @click.stop
      />

      <!-- Poster / placeholder (never use video URL as <img>) -->
      <template v-else>
        <img
          v-if="posterSrc && !posterFailed"
          :src="posterSrc"
          class="preview-img"
          alt=""
          @error="posterFailed = true"
        />
        <div v-else class="video-poster-fallback" aria-hidden="true">
          <div class="video-poster-shine" />
          <span class="video-poster-label">VIDEO</span>
        </div>

        <button
          class="play-btn"
          type="button"
          aria-label="播放预览"
          @click="onPlayClick"
        >
          <Play :size="16" fill="currentColor" />
        </button>

        <span class="video-badge">VIDEO</span>
        <div class="preview-overlay">
          <span class="preview-tip">点击定位画布 · 播放预览</span>
        </div>
      </template>

      <button
        class="action-download-btn"
        type="button"
        aria-label="下载视频"
        @click.stop="downloadMedia"
      >
        <Download :size="15" />
      </button>
    </div>
  </div>
</template>

<style scoped>
/* ── Card shell ─────────────────────────────────────────────────── */
.preview-card {
  position: relative;
  margin: 0;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
  transition:
    transform 0.18s cubic-bezier(0, 0, 0.2, 1),
    box-shadow 0.18s cubic-bezier(0, 0, 0.2, 1);
  border: 1px solid var(--agent-border-subtle, rgba(0, 0, 0, 0.08));
}

.preview-card:focus-visible {
  outline: 2px solid var(--p-primary-color, #161618);
  outline-offset: 2px;
}

.preview-card.compact {
  width: 100%;
  aspect-ratio: 1;
}

.preview-card.is-video:not(.compact) {
  /* Stable 16:9 frame so missing posters never collapse into a thin control bar */
  aspect-ratio: 16 / 9;
}

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

.compact .preview-mesh,
.compact .preview-error,
.compact .preview-done {
  width: 100%;
  height: 100%;
  min-height: 0;
}

.is-video:not(.compact) .preview-mesh,
.is-video:not(.compact) .preview-done {
  min-height: 0;
  height: 100%;
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
  max-height: 280px;
}

.preview-video {
  max-height: none;
  height: 100%;
  min-height: 160px;
}

.preview-img {
  width: 100%;
  height: auto;
  max-height: 280px;
  display: block;
  object-fit: contain;
  background: #0a0a0a;
}

.preview-video .preview-img {
  width: 100%;
  height: 100%;
  max-height: none;
  object-fit: cover;
}

.preview-video-el {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: contain;
  background: #000;
  vertical-align: middle;
}

.video-poster-fallback {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(145deg, #18181b 0%, #27272a 50%, #111 100%);
  overflow: hidden;
}

.video-poster-shine {
  position: absolute;
  inset: -40%;
  background: radial-gradient(
    circle at 30% 30%,
    rgba(96, 165, 250, 0.22),
    transparent 55%
  );
}

.video-poster-label {
  position: relative;
  z-index: 1;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: rgba(255, 255, 255, 0.45);
}

.compact .preview-done {
  max-height: none;
}

.compact .preview-img {
  height: 100%;
  max-height: none;
}

.action-download-btn {
  position: absolute;
  right: 9px;
  bottom: 9px;
  z-index: 5;
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 999px;
  background: rgba(24, 24, 27, 0.84);
  color: #ffffff;
  box-shadow: 0 3px 12px rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(8px);
  cursor: pointer;
  transition:
    background-color 150ms ease,
    transform 150ms ease;
}

.action-download-btn:hover {
  background: rgba(24, 24, 27, 0.96);
  transform: translateY(-1px);
}

.action-download-btn:focus-visible {
  outline: 2px solid #ffffff;
  outline-offset: 2px;
}

.compact .action-download-btn {
  right: 7px;
  bottom: 7px;
  width: 27px;
  height: 27px;
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
  pointer-events: none;
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
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(24, 24, 27, 0.86);
  border: 1px solid rgba(255, 255, 255, 0.26);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
  z-index: 3;
  animation: play-breathe 2s ease-in-out infinite;
  transition:
    background 0.15s ease,
    transform 0.15s ease;
}

.play-btn:hover {
  background: rgba(37, 99, 235, 0.95);
  color: #fff;
  transform: translate(-50%, -50%) scale(1.08);
  animation: none;
}

@keyframes play-breathe {
  0%,
  100% {
    transform: translate(-50%, -50%) scale(0.96);
  }
  50% {
    transform: translate(-50%, -50%) scale(1.04);
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

:global(.p-dark .error-text) {
  color: #f87171;
}
</style>
