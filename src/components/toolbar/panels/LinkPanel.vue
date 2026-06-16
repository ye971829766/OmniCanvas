<template>
  <div class="property-panel" id="panel-link">
    <form class="link-submit-form" id="link-form" @submit.prevent="submitLink">
      <input
        v-model="linkUrl"
        type="url"
        required
        id="link-input"
        placeholder="https://example.com"
        autocomplete="off"
      />
      <button type="submit" class="submit-btn" title="Submit Link">
        <CornerDownLeft class="panel-icon" style="color: white" />
      </button>
    </form>
    <label class="file-upload-label" title="Upload Image File">
      <Upload class="panel-icon" />
      <input
        type="file"
        id="file-input"
        accept="image/*,video/*"
        style="display: none"
        @change="handleFileUpload"
      />
    </label>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { CornerDownLeft, Upload } from "lucide-vue-next";

const emit = defineEmits<{
  (e: 'submit-link', url: string): void;
  (e: 'upload-file', file: File): void;
}>();

const linkUrl = ref("");

function submitLink() {
  if (!linkUrl.value) return;
  emit("submit-link", linkUrl.value);
  linkUrl.value = "";
}

function handleFileUpload(e: Event) {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file) {
    emit("upload-file", file);
  }
}
</script>

<style>
@import "../toolbar.css";
</style>

<style scoped>
.link-submit-form {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

#link-input {
  flex: 1;
  background-color: var(--zinc-100);
  border: 1px solid rgba(228, 228, 231, 0.5);
  border-radius: 9999px;
  padding: 4px 10px;
  height: 26px;
  font-size: 0.75rem;
  font-family: var(--font-family-sans);
  color: var(--text-primary);
  outline: none;
  transition:
    background 0.15s,
    border-color 0.15s;
}

#link-input:focus {
  background-color: white;
  border-color: var(--brand-text);
  box-shadow: 0 0 0 3px rgba(108, 92, 255, 0.15);
}

.submit-btn {
  background-color: var(--brand-text);
  border: none;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(108, 92, 255, 0.25);
  flex-shrink: 0;
  transition:
    background 0.2s,
    transform 0.2s;
}

.submit-btn:hover {
  background-color: #5a4be8;
  transform: scale(1.05);
}

.submit-btn:active {
  transform: scale(0.95);
}

.file-upload-label {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: var(--text-secondary);
  cursor: pointer;
  flex-shrink: 0;
  transition:
    background 0.2s,
    color 0.2s;
}

.file-upload-label:hover {
  background-color: var(--zinc-100);
  color: var(--text-primary);
}
</style>
