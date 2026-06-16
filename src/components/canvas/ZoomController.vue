<template>
  <div class="zoom-controller-wrapper">
    <div class="zoom-controller-container">
      <!-- Zoom Out Button (-) using PrimeVue Button -->
      <Button
        type="button"
        severity="secondary"
        text
        rounded
        class="zoom-btn"
        title="缩小"
        @click="zoomOut"
      >
        <Minus :size="14" />
      </Button>

      <!-- Zoom Options Dropdown using PrimeVue Button + Menu -->
      <div class="relative">
        <Button
          type="button"
          severity="secondary"
          text
          rounded
          class="zoom-dropdown-trigger"
          @click="toggleMenu"
          title="缩放选项"
        >
          <span>{{ currentZoom }}%</span>
        </Button>

        <!-- PrimeVue Popup Menu -->
        <Menu ref="menuRef" :model="menuItems" :popup="true" />
      </div>

      <!-- Zoom In Button (+) using PrimeVue Button -->
      <Button
        type="button"
        severity="secondary"
        text
        rounded
        class="zoom-btn"
        title="放大"
        @click="zoomIn"
      >
        <Plus :size="14" />
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, type PropType } from "vue";
import { App, ZoomEvent, MoveEvent } from "leafer-ui";
import { Minus, Plus } from "lucide-vue-next";

const props = defineProps({
  canvasApp: {
    type: Object as PropType<App | null>,
    default: null,
  },
});

const currentZoom = ref(100);
const menuRef = ref();

const menuItems = ref([
  { label: "50%", command: () => selectZoomOption(0.5) },
  { label: "75%", command: () => selectZoomOption(0.75) },
  { label: "100%", command: () => selectZoomOption(1.0) },
  { label: "150%", command: () => selectZoomOption(1.5) },
  { label: "200%", command: () => selectZoomOption(2.0) },
  { label: "适应画布", command: () => selectZoomOption("fit") },
]);

const updateZoomState = () => {
  const app = props.canvasApp;
  if (!app?.tree) return;
  const scale = app.tree.scaleX || 1;
  currentZoom.value = Math.round(scale * 100);
};

const toggleMenu = (event: Event) => {
  menuRef.value?.toggle(event);
};

const selectZoomOption = (val: number | string) => {
  const app = props.canvasApp;
  if (!app?.tree) return;

  if (val === "fit") {
    try {
      (app.tree as any).zoom("fit", 80, undefined, 0.4);
    } catch (err) {
      console.warn("Failed to zoom fit:", err);
    }
  } else if (typeof val === "number") {
    try {
      (app.tree as any).zoom(val, undefined, undefined, 0.3);
    } catch (err) {
      console.warn("Failed to zoom scale:", err);
    }
  }

  setTimeout(updateZoomState, 50);
  setTimeout(updateZoomState, 350);
};

const zoomIn = () => {
  const app = props.canvasApp;
  if (!app?.tree) return;
  try {
    (app.tree as any).zoom("in", undefined, undefined, 0.2);
  } catch (err) {
    console.warn("Failed to zoom in:", err);
  }
  setTimeout(updateZoomState, 50);
  setTimeout(updateZoomState, 250);
};

const zoomOut = () => {
  const app = props.canvasApp;
  if (!app?.tree) return;
  try {
    (app.tree as any).zoom("out", undefined, undefined, 0.2);
  } catch (err) {
    console.warn("Failed to zoom out:", err);
  }
  setTimeout(updateZoomState, 50);
  setTimeout(updateZoomState, 250);
};

let pollInterval: any = null;

const setupListeners = (app: App) => {
  if (!app.tree) return;
  app.tree.on(ZoomEvent.ZOOM, updateZoomState);
  app.tree.on(MoveEvent.MOVE, updateZoomState);
  updateZoomState();
};

const cleanupListeners = (app: App) => {
  if (!app.tree) return;
  app.tree.off(ZoomEvent.ZOOM, updateZoomState);
  app.tree.off(MoveEvent.MOVE, updateZoomState);
};

watch(
  () => props.canvasApp,
  (newApp, oldApp) => {
    if (oldApp) {
      cleanupListeners(oldApp);
    }
    if (newApp) {
      setupListeners(newApp);
    }
  },
  { immediate: true },
);

onMounted(() => {
  pollInterval = setInterval(updateZoomState, 500);
});

onUnmounted(() => {
  if (pollInterval) {
    clearInterval(pollInterval);
  }
  if (props.canvasApp) {
    cleanupListeners(props.canvasApp);
  }
});
</script>

<style scoped>
.zoom-controller-wrapper {
  position: absolute;
  right: 16px;
  top: 16px;
  z-index: 40;
  user-select: none;
  pointer-events: auto;
}

.zoom-controller-container {
  display: flex;
  align-items: center;
  gap: 2px;
  background-color: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--border-color, var(--p-surface-200));
  border-radius: 9999px;
  padding: 4px 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.05);
}

.p-dark .zoom-controller-container {
  background-color: rgba(30, 30, 30, 0.85);
  border-color: rgba(255, 255, 255, 0.1);
}

.zoom-btn {
  width: 28px !important;
  height: 28px !important;
  min-width: 28px !important;
  padding: 0 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  color: var(--text-primary) !important;
}

.zoom-btn:hover {
  background-color: var(--p-surface-100) !important;
}

.zoom-btn:active {
  transform: scale(0.92);
}

.zoom-dropdown-trigger {
  height: 28px !important;
  padding: 0 10px !important;
  display: flex !important;
  align-items: center !important;
  gap: 4px !important;
  font-size: 0.82rem !important;
  font-weight: 600 !important;
  border-radius: 9999px !important;
  color: var(--text-primary) !important;
}

.zoom-dropdown-trigger:hover {
  background-color: var(--p-surface-100) !important;
}
</style>
