<template>
  <div class="property-panel" id="panel-text">
    <div class="text-panel-content">
      <!-- Font Family Selector -->
      <Select
        v-model="fontFamily"
        :options="fontOptions"
        optionLabel="label"
        optionValue="value"
        placeholder="选择字体"
        class="font-family-dropdown"
        id="font-family-select"
      />
      
      <div class="panel-divider"></div>

      <div class="text-size-controls">
        <Slider
          v-model="fontSize"
          :min="MIN"
          :max="MAX"
          class="font-size-slider"
          id="font-size-slider"
        />
        <InputNumber
          v-model="fontSize"
          :min="MIN"
          :max="MAX"
          class="font-size-input"
          id="font-size-input"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// import Select from 'primevue/select';
// import Slider from 'primevue/slider';
// import InputNumber from 'primevue/inputnumber';

const fontSize = defineModel<number>('fontSize', { default: 24 });
const fontFamily = defineModel<string>('fontFamily', { default: 'Inter' });

const fontOptions = [
  { label: 'Inter (Sans)', value: 'Inter' },
  { label: 'Outfit (Modern)', value: 'Outfit' },
  { label: 'Roboto (Clean)', value: 'Roboto' },
  { label: 'Arial', value: 'Arial' },
  { label: 'Georgia (Serif)', value: 'Georgia' },
  { label: 'Times New Roman', value: 'Times New Roman' },
  { label: 'Courier New (Mono)', value: 'Courier New' },
  { label: 'Consolas', value: 'Consolas' },
  { label: 'Comic Sans', value: 'Comic Sans MS' },
  { label: 'Impact', value: 'Impact' }
];

const MIN = 12;
const MAX = 64;
</script>

<style>
@import '../toolbar.css';
</style>

<style scoped>
.text-panel-content {
  display: flex;
  align-items: center;
  gap: 4px;
}

.font-family-dropdown {
  width: 120px;
  height: 24px !important;
  font-size: 0.75rem;
  border-radius: 6px;
  background: transparent !important;
  border-color: var(--p-surface-200) !important;
  display: flex;
  align-items: center;
  transition: all 0.2s ease;
}

.font-family-dropdown:hover {
  background-color: var(--p-surface-100) !important;
  border-color: var(--p-surface-300) !important;
}

.font-family-dropdown:focus-within {
  border-color: var(--p-primary-color) !important;
  box-shadow: 0 0 0 2px rgba(108, 92, 255, 0.1) !important;
}

:deep(.p-select-label) {
  padding: 0 8px !important;
  line-height: 22px !important;
  font-size: 0.75rem !important;
  font-weight: 600 !important;
  color: var(--p-text-color) !important;
  font-family: inherit;
  text-align: left;
}

:deep(.p-select-dropdown) {
  width: 22px !important;
  color: var(--p-text-muted-color) !important;
}

.text-size-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.font-size-slider {
  flex: 1;
  min-width: 50px;
}

.font-size-input {
  width: 50px;
}

:deep(.p-inputnumber-input) {
  width: 50px !important;
  height: 24px !important;
  font-size: 0.75rem !important;
  font-weight: 600 !important;
  text-align: center !important;
  border-radius: 6px !important;
  background: transparent !important;
  border: 1px solid var(--p-surface-200) !important;
  color: var(--p-text-color) !important;
  font-family: var(--font-family-mono) !important;
  padding: 0 4px !important;
  transition: all 0.2s ease;
}

:deep(.p-inputnumber-input:hover) {
  background-color: var(--p-surface-100) !important;
  border-color: var(--p-surface-300) !important;
}

:deep(.p-inputnumber-input:focus) {
  outline: none !important;
  border-color: var(--blue-text) !important;
  box-shadow: 0 0 0 2px rgba(108, 92, 255, 0.1) !important;
}
</style>
