<template>
  <div
    class="w-full h-full flex flex-col items-center justify-center bg-[var(--p-surface-50)] text-[var(--p-text-color)] relative overflow-hidden login-splash-viewport"
  >
    <div class="absolute inset-0 login-grid-bg"></div>
    <div
      class="absolute top-1/4 left-1/4 w-[400px] h-[400px] rounded-full bg-[var(--p-primary-color)]/10 blur-[100px] animate-blob-float pointer-events-none"
    ></div>
    <div
      class="absolute bottom-1/4 right-1/4 w-[350px] h-[350px] rounded-full bg-emerald-500/10 blur-[90px] animate-blob-float-delayed pointer-events-none"
    ></div>

    <div
      class="z-10 flex flex-col md:flex-row items-stretch max-w-4xl w-[92%] rounded-3xl bg-[var(--glass-bg)] border border-[var(--glass-border)] shadow-2xl backdrop-blur-xl overflow-hidden login-portal-box"
    >
      <div
        class="hidden md:flex flex-col justify-between p-10 flex-1 border-r border-[var(--glass-border)] bg-[var(--p-surface-0)]/20 relative overflow-hidden"
      >
        <div class="flex items-center gap-3">
          <img
            src="@/assets/logo.png"
            alt="OmniCanvas Logo"
            class="w-9 h-9 rounded-xl object-cover shadow-md"
          />
          <span
            class="text-xl font-bold tracking-tight bg-gradient-to-r from-[var(--p-text-color)] to-[var(--p-text-muted-color)] bg-clip-text text-transparent"
          >
            OmniCanvas
          </span>
        </div>

        <div class="my-auto flex flex-col gap-6 text-left relative z-10">
          <h2
            class="text-3xl font-extrabold leading-tight text-[var(--p-text-color)]"
          >
            自主多模态 AI <br />
            空间化设计画布
          </h2>
          <p class="text-sm text-[var(--p-text-muted-color)] leading-relaxed">
            融合 Leafer UI 高性能渲染与智能 Agent
            交互，通过自然语言或矢量操作，激发并落实您的无限创意。
          </p>
        </div>

        <div class="text-xs text-[var(--p-text-muted-color)] font-medium">
          © 2026 OmniCanvas Team. All rights reserved.
        </div>
      </div>

      <div
        class="flex flex-col justify-center p-8 md:p-10 w-full md:w-[420px] bg-[var(--p-surface-0)]/50 backdrop-blur-md"
      >
        <div class="flex items-center gap-3 mb-6 md:hidden">
          <img
            src="@/assets/logo.png"
            alt="OmniCanvas Logo"
            class="w-8 h-8 rounded-lg object-cover shadow-sm"
          />
          <span class="text-lg font-bold text-[var(--p-text-color)]"
            >OmniCanvas</span
          >
        </div>

        <div class="mb-6 text-left">
          <h3
            class="text-2xl font-bold text-[var(--p-text-color)] tracking-tight mb-2"
          >
            {{ isLogin ? "欢迎回来" : "创建账号" }}
          </h3>
          <p class="text-sm text-[var(--p-text-muted-color)] leading-relaxed">
            {{
              isLogin
                ? "登录以访问您的工作空间与设计工程。"
                : "注册 OmniCanvas 账号，开始您的创意之旅。"
            }}
          </p>
        </div>

        <AuthForm />

        <div
          class="mt-6 flex items-center justify-center gap-6 text-xs text-[var(--p-text-secondary)] font-medium"
        >
          <span class="flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            安全加密
          </span>
          <span class="flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            云端同步
          </span>
          <span class="flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            AI 赋能
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useUser } from "@/composables/useUser";
import AuthForm from "@/components/auth/AuthForm.vue";

const router = useRouter();
const { isLoggedIn, authModalMode, ensureSession } = useUser();

const isLogin = computed(() => authModalMode.value === "login");

onMounted(() => {
  authModalMode.value = "login";
  // Returning from payment / hard refresh may land here with a still-valid token.
  if (localStorage.getItem("omnicanvas_token") && !isLoggedIn.value) {
    void ensureSession().then((profile) => {
      if (profile) void router.replace("/canvas");
    });
  }
});

watch(
  isLoggedIn,
  (loggedIn) => {
    // A successful auth response is already authoritative. Do not let a stale
    // bootstrap flag keep an authenticated user on the login page.
    if (loggedIn) void router.replace("/canvas");
  },
  { immediate: true },
);
</script>

<style scoped>
.login-splash-viewport {
  width: 100vw;
  height: 100vh;
}

.login-grid-bg {
  position: absolute;
  inset: 0;
  background-image: radial-gradient(
    var(--border-color) 1.2px,
    transparent 1.2px
  );
  background-size: 20px 20px;
  opacity: 0.45;
}

.login-portal-box {
  animation: scale-spring 0.6s var(--ease-spring);
}

@keyframes blob-float {
  0%,
  100% {
    transform: translateY(0) scale(1);
  }
  50% {
    transform: translateY(-20px) scale(1.05);
  }
}

@keyframes blob-float-delayed {
  0%,
  100% {
    transform: translateY(0) scale(1);
  }
  50% {
    transform: translateY(20px) scale(1.05);
  }
}

.animate-blob-float {
  animation: blob-float 8s ease-in-out infinite;
}

.animate-blob-float-delayed {
  animation: blob-float-delayed 10s ease-in-out infinite;
}
</style>
