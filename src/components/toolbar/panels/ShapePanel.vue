<template>
  <div class="property-panel" id="panel-shape">
    <!-- Shape type icon buttons -->
    <div class="flex justify-start">
      <button
        v-for="item in shapeTypes"
        :key="item.type"
        type="button"
        :class="['panel-icon-btn', { active: selectedShapeType === item.type }]"
        :title="item.label"
        @click="selectedShapeType = item.type"
      >
        <div class="btn-hover-shim"></div>
        <component :is="item.icon" class="panel-icon" />
      </button>
    </div>

    <div class="panel-divider"></div>

    <!-- Color Slider -->
    <ColorSlider
      v-model:hue="hue"
      v-model:saturation="saturation"
      v-model:lightness="lightness"
      v-model:alpha="alpha"
    />

    <!-- Polygon: sides input -->
    <template v-if="selectedShapeType === 'polygon'">
      <div class="panel-divider"></div>

      <div class="param-field">
        <label class="param-label">Sides</label>
        <input
          class="param-input"
          type="number"
          min="3"
          max="12"
          step="1"
          v-model.number="shapeSides"
          @keydown.stop
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { markRaw } from "vue";
import { Square, Circle, Triangle, Star, Minus } from "lucide-vue-next";
import ColorSlider from "../../ColorSlider.vue";
import {
  selectedShapeType,
  shapeSides,
  type ShapeType,
} from "../../../composables/useShapeState";

const hue = defineModel<number>("hue", { default: 45 });
const saturation = defineModel<number>("saturation", { default: 100 });
const lightness = defineModel<number>("lightness", { default: 50 });
const alpha = defineModel<number>("alpha", { default: 100 });

interface ShapeItem {
  type: ShapeType;
  label: string;
  icon: any;
}

const shapeTypes: ShapeItem[] = [
  { type: "rect", label: "Rectangle", icon: markRaw(Square) },
  { type: "ellipse", label: "Ellipse", icon: markRaw(Circle) },
  { type: "polygon", label: "Polygon", icon: markRaw(Triangle) },
  { type: "star", label: "Star", icon: markRaw(Star) },
  { type: "line", label: "Line", icon: markRaw(Minus) },
];
</script>

<style>
@import "../toolbar.css";
</style>

<style scoped>
#panel-shape {
  justify-content: flex-start;
}
.param-field {
  display: flex;
  align-items: center;
  gap: 4px;
}

.param-label {
  font-size: 0.65rem;
  font-weight: 600;
  color: var(--text-secondary);
  white-space: nowrap;
  user-select: none;
}

.param-input {
  width: 38px;
  height: 24px;
  border: 1px solid var(--p-surface-200);
  border-radius: 6px;
  background: var(--p-surface-100);
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--text-primary);
  text-align: center;
  outline: none;
  font-family: var(--font-family-mono);
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
  -moz-appearance: textfield;
}

.param-input::-webkit-inner-spin-button,
.param-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.param-input:focus {
  border-color: var(--blue-text);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
}
</style>
