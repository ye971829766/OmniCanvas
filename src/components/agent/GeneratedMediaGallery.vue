<script setup lang="ts">
import { computed } from "vue";
import type {
  NodeState,
  ToolCallItem,
} from "@/composables/useAgent";
import { resolveMediaDisplayUrl } from "@/utils/agentMediaState";
import OptionPreviewCard from "./OptionPreviewCard.vue";

const MEDIA_TOOL_NAMES = new Set([
  "generate_image",
  "generate_video",
  "edit_image",
  "remove_background",
  "inpaint_image",
  "upscale_image",
]);

const props = defineProps<{
  tools: ToolCallItem[];
  nodeStates: Record<string, NodeState>;
}>();

const emit = defineEmits<{
  (e: "zoom", refId: string): void;
}>();

const mediaItems = computed(() => {
  const seen = new Set<string>();

  return props.tools.flatMap((tool) => {
    const rawOutput = tool.output as any;
    const output =
      rawOutput &&
      typeof rawOutput === "object" &&
      (rawOutput.type === "json" || rawOutput.type === "text") &&
      "value" in rawOutput
        ? rawOutput.value
        : rawOutput;
    const refId = output?.refId;
    if (
      !MEDIA_TOOL_NAMES.has(tool.name) ||
      typeof refId !== "string" ||
      seen.has(refId)
    ) {
      return [];
    }

    const rawPersistedUrl = output?.url || output?.imageUrl || output?.videoUrl;
    const persistedUrl = resolveMediaDisplayUrl(rawPersistedUrl) || rawPersistedUrl;
    const liveState = props.nodeStates[refId];
    const liveUrl =
      resolveMediaDisplayUrl(liveState?.url) || liveState?.url || undefined;
    const persistedState: (NodeState & { prompt?: string }) | undefined = persistedUrl
      ? {
          refId,
          type: tool.name === "generate_video" ? "video" : "image",
          status: "done",
          url: persistedUrl,
          thumbnailUrl:
            resolveMediaDisplayUrl(output?.thumbnailUrl) || output?.thumbnailUrl,
          prompt: tool.input?.prompt,
        }
      : liveUrl && liveState?.status === "done"
        ? {
            refId,
            type: tool.name === "generate_video" ? "video" : "image",
            status: "done",
            url: liveUrl,
            thumbnailUrl:
              resolveMediaDisplayUrl(liveState.thumbnailUrl) ||
              liveState.thumbnailUrl,
            prompt: tool.input?.prompt,
          }
      : output?.status === "error"
        ? {
            refId,
            type: tool.name === "generate_video" ? "video" : "image",
            status: "error",
            error: output?.error,
            prompt: tool.input?.prompt,
          }
        : output?.status === "generating" || output?.status === "success"
          ? {
              refId,
              type: tool.name === "generate_video" ? "video" : "image",
              // success without URL is still waiting for media_ready / poll
              status: persistedUrl || liveUrl ? "done" : "generating",
              url: persistedUrl || liveUrl,
              prompt: tool.input?.prompt,
            }
          : undefined;
    const terminalPersistedState =
      persistedState && persistedState.status !== "generating"
        ? persistedState
        : undefined;
    // A terminal tool result is authoritative. It must win over a stale live
    // canvas state left at "generating" by an earlier start event.
    const state =
      terminalPersistedState || props.nodeStates[refId] || persistedState;
    // Failed generation attempts belong in the tool timeline, not the media
    // gallery. Keeping them here turns repeated retries into a wall of error
    // thumbnails and separates the error from the tool that produced it.
    if (!state || state.status === "error") return [];

    seen.add(refId);
    return [{ refId, state }];
  });
});

const isMultiple = computed(() => mediaItems.value.length > 1);
const isDense = computed(() => mediaItems.value.length > 2);
</script>

<template>
  <div
    v-if="mediaItems.length"
    class="generated-media-gallery"
    :class="{
      'is-multiple': isMultiple,
      'is-dense': isDense,
    }"
    :aria-label="`生成结果，共 ${mediaItems.length} 项`"
  >
    <div
      v-for="item in mediaItems"
      :key="item.refId"
      class="generated-media-item"
    >
      <OptionPreviewCard
        :ref-id="item.refId"
        :state="item.state"
        :compact="isMultiple"
        @zoom="emit('zoom', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.generated-media-gallery {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  min-width: 0;
  margin-top: 8px;
}

.generated-media-gallery.is-multiple {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.generated-media-gallery.is-dense {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.generated-media-item {
  min-width: 0;
}
</style>
