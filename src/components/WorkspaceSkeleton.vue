<template>
  <div class="w-full h-full flex overflow-hidden bg-[var(--p-surface-50)] select-none">
    <!-- 1. Sidebar Skeleton -->
    <div class="w-72 h-full bg-[var(--p-surface-0)] border-r border-[var(--p-surface-200)] p-3 flex flex-col justify-between shrink-0">
      <div class="flex flex-col gap-4">
        <!-- Sidebar Header -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <div class="w-7 h-7 rounded-full bg-[var(--p-surface-200)] animate-pulse shrink-0"></div>
            <div class="w-16 h-5 rounded-md bg-[var(--p-surface-200)] animate-pulse"></div>
          </div>
          <div class="w-6 h-6 rounded-md bg-[var(--p-surface-200)] animate-pulse"></div>
        </div>

        <!-- Sidebar Action Buttons Skeleton -->
        <div class="flex flex-col gap-2 mt-1">
          <div class="w-full h-9 rounded-lg bg-[var(--p-surface-100)] animate-pulse"></div>
          <div class="w-full h-9 rounded-lg bg-[var(--p-surface-100)] animate-pulse"></div>
        </div>

        <!-- Workspace List Skeleton Items -->
        <div class="flex flex-col gap-2 mt-3">
          <div
            v-for="i in 7"
            :key="i"
            class="w-full h-8 rounded-lg bg-[var(--p-surface-50)] animate-pulse flex items-center px-3 gap-2"
          >
            <div class="w-4 h-4 rounded bg-[var(--p-surface-200)] shrink-0"></div>
            <div
              class="h-3 rounded bg-[var(--p-surface-200)]"
              :style="{ width: (35 + ((i * 17) % 45)) + '%' }"
            ></div>
          </div>
        </div>
      </div>

      <!-- Sidebar Footer Skeleton -->
      <div class="pt-3 border-t border-[var(--p-surface-200)] flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-full bg-[var(--p-surface-200)] animate-pulse"></div>
          <div class="flex flex-col gap-1">
            <div class="w-20 h-3.5 rounded bg-[var(--p-surface-200)] animate-pulse"></div>
            <div class="w-12 h-2.5 rounded bg-[var(--p-surface-200)] animate-pulse"></div>
          </div>
        </div>
        <div class="flex gap-2">
          <div class="w-5 h-5 rounded bg-[var(--p-surface-200)] animate-pulse"></div>
          <div class="w-5 h-5 rounded bg-[var(--p-surface-200)] animate-pulse"></div>
        </div>
      </div>
    </div>

    <!-- 2. Canvas Area Skeleton -->
    <div class="flex-1 h-full relative flex flex-col items-center justify-center bg-[var(--p-surface-50)] overflow-hidden">
      <!-- Canvas dot grid background simulation -->
      <div
        class="absolute inset-0 opacity-40 pointer-events-none"
        style="background-image: radial-gradient(var(--p-surface-300) 1px, transparent 1px); background-size: 24px 24px;"
      ></div>

      <!-- Center Node Skeleton Placeholder -->
      <div class="w-[380px] h-[260px] rounded-2xl bg-[var(--p-surface-0)] border border-[var(--p-surface-200)] p-4 flex flex-col gap-3 shadow-sm animate-pulse z-10">
        <div class="w-full flex-1 rounded-xl bg-[var(--p-surface-100)] flex flex-col items-center justify-center gap-2">
          <div class="w-10 h-10 rounded-full bg-[var(--p-surface-200)]"></div>
          <div class="w-32 h-3 rounded bg-[var(--p-surface-200)]"></div>
        </div>
        <div class="w-full h-8 rounded-lg bg-[var(--p-surface-100)]"></div>
      </div>

      <!-- Top Right Control Buttons Skeleton -->
      <div class="absolute top-4 right-4 flex items-center gap-2 z-10">
        <div class="w-24 h-9 rounded-xl bg-[var(--p-surface-0)] border border-[var(--p-surface-200)] animate-pulse shadow-sm"></div>
        <div class="w-9 h-9 rounded-full bg-[var(--p-surface-0)] border border-[var(--p-surface-200)] animate-pulse shadow-sm"></div>
      </div>

      <!-- Bottom Floating Toolbar Skeleton -->
      <div class="absolute bottom-6 left-1/2 -translate-x-1/2 w-[340px] h-11 rounded-full bg-[var(--p-surface-0)] border border-[var(--p-surface-200)] animate-pulse shadow-md z-10"></div>
    </div>

    <!-- 3. Agent Panel Skeleton -->
    <div class="w-[380px] h-full bg-[var(--p-surface-0)] border-l border-[var(--p-surface-200)] flex flex-col justify-between p-4 shrink-0">
      <!-- Agent Header -->
      <div class="flex items-center justify-between pb-3 border-b border-[var(--p-surface-200)]">
        <div class="flex items-center gap-2">
          <div class="w-6 h-6 rounded-full bg-[var(--p-surface-200)] animate-pulse"></div>
          <div class="w-24 h-4 rounded bg-[var(--p-surface-200)] animate-pulse"></div>
        </div>
        <div class="w-5 h-5 rounded bg-[var(--p-surface-200)] animate-pulse"></div>
      </div>

      <!-- Agent Messages Stream Skeleton -->
      <div class="flex-1 flex flex-col gap-4 py-4 overflow-hidden">
        <!-- User Bubble (Right) -->
        <div class="self-end max-w-[80%] p-3 rounded-2xl rounded-tr-sm bg-[var(--p-primary-100)] dark:bg-[var(--p-primary-950)] animate-pulse flex flex-col gap-1.5">
          <div class="w-36 h-3.5 rounded bg-[var(--p-primary-200)] dark:bg-[var(--p-primary-800)]"></div>
        </div>
        <!-- Agent Response (Left) -->
        <div class="self-start max-w-[90%] flex gap-2.5 items-start">
          <div class="w-7 h-7 rounded-full bg-[var(--p-surface-200)] animate-pulse shrink-0"></div>
          <div class="p-3 rounded-2xl rounded-tl-sm bg-[var(--p-surface-100)] animate-pulse flex-1 flex flex-col gap-2">
            <div class="w-full h-3.5 rounded bg-[var(--p-surface-200)]"></div>
            <div class="w-[85%] h-3.5 rounded bg-[var(--p-surface-200)]"></div>
            <div class="w-[60%] h-3.5 rounded bg-[var(--p-surface-200)]"></div>
          </div>
        </div>
      </div>

      <!-- Agent Input Bar Skeleton -->
      <div class="w-full h-24 rounded-2xl bg-[var(--p-surface-100)] border border-[var(--p-surface-200)] animate-pulse p-3 flex flex-col justify-between">
        <div class="w-3/4 h-3 rounded bg-[var(--p-surface-200)]"></div>
        <div class="flex justify-between items-center">
          <div class="w-16 h-5 rounded-full bg-[var(--p-surface-200)]"></div>
          <div class="w-7 h-7 rounded-full bg-[var(--p-surface-200)]"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
</script>
