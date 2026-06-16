<template>
  <div class="property-panel" id="panel-marker">
    <ThicknessSlider
      v-model="thickness"
      :color="`hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha / 100})`"
    />

    <div class="panel-divider"></div>

    <ColorSlider
      v-model:hue="hue"
      v-model:saturation="saturation"
      v-model:lightness="lightness"
      v-model:alpha="alpha"
    />
  </div>
</template>

<script setup lang="ts">
import ThicknessSlider from "../../ThicknessSlider.vue";
import ColorSlider from "../../ColorSlider.vue";

const hue = defineModel<number>("hue", { default: 45 });
const saturation = defineModel<number>("saturation", { default: 100 });
const lightness = defineModel<number>("lightness", { default: 50 });
const alpha = defineModel<number>("alpha", { default: 100 });
const thickness = defineModel<number>("thickness", { default: 4 });
</script>

<style>
@import "../toolbar.css";
</style>
