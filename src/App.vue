<script setup lang="ts">
import Canvas from "./components/Canvas.vue";
import Sidebar from "./components/sidebar.vue";
</script>

<template>
  <div class="w-full h-full relative flex">
    <Sidebar />
    <Canvas />
  </div>
</template>
