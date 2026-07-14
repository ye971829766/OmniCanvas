<template>
  <div class="flex flex-col w-full">
    <Message
      v-if="errorMessage"
      severity="error"
      class="mb-4 text-xs"
      :closable="false"
    >
      {{ errorMessage }}
    </Message>

    <div class="flex flex-col gap-2.5 w-full mb-4">
      <Button
        variant="outlined"
        class="w-full !py-2.5 !rounded-xl flex items-center justify-center gap-2 font-medium !bg-[var(--p-surface-100)] hover:!bg-[var(--p-surface-200)] !text-[var(--p-text-color)] !border-[var(--p-surface-200)]"
        @click="handleGoogleLogin"
      >
        <i class="pi pi-google text-lg text-[var(--p-primary-color)]"></i>
        <span>使用 Google 账号登录</span>
      </Button>
    </div>

    <Divider align="center" class="!my-4">
      <span
        class="text-xs text-[var(--p-text-muted-color)] px-3 py-1 bg-[var(--p-surface-0)] rounded-md"
      >
        或使用账号
      </span>
    </Divider>

    <form
      v-if="isLogin"
      @submit.prevent="handleLogin"
      class="flex flex-col gap-3.5 w-full"
    >
      <div class="flex flex-col gap-1 text-left">
        <label class="text-xs font-semibold text-[var(--p-text-muted-color)]"
          >用户名</label
        >
        <InputText
          v-model="loginForm.username"
          placeholder="请输入用户名"
          class="w-full !rounded-xl !bg-[var(--p-surface-0)] !text-[var(--p-text-color)] !border-[var(--p-surface-200)]"
          autocomplete="username"
          required
          :disabled="loading"
        />
      </div>

      <div class="flex flex-col gap-1 text-left">
        <label class="text-xs font-semibold text-[var(--p-text-muted-color)]"
          >密码</label
        >
        <Password
          v-model="loginForm.password"
          placeholder="请输入密码"
          :feedback="false"
          toggleMask
          class="w-full"
          inputClass="w-full !rounded-xl !bg-[var(--p-surface-0)] !text-[var(--p-text-color)] !border-[var(--p-surface-200)]"
          autocomplete="current-password"
          required
          :disabled="loading"
        />
      </div>

      <Button
        type="submit"
        label="登录"
        :loading="loading"
        class="w-full !py-3 !rounded-xl font-semibold mt-1"
      />
    </form>

    <form
      v-else
      @submit.prevent="handleRegister"
      class="flex flex-col gap-3.5 w-full"
    >
      <div class="flex flex-col gap-1 text-left">
        <label class="text-xs font-semibold text-[var(--p-text-muted-color)]"
          >用户名 <span class="text-red-500">*</span></label
        >
        <InputText
          v-model="registerForm.username"
          placeholder="设置用户名 (至少 3 个字符)"
          class="w-full !rounded-xl !bg-[var(--p-surface-0)] !text-[var(--p-text-color)] !border-[var(--p-surface-200)]"
          autocomplete="username"
          required
          :disabled="loading"
        />
      </div>

      <div class="flex flex-col gap-1 text-left">
        <label class="text-xs font-semibold text-[var(--p-text-muted-color)]"
          >显示昵称</label
        >
        <InputText
          v-model="registerForm.nickname"
          placeholder="显示昵称 (可选)"
          class="w-full !rounded-xl !bg-[var(--p-surface-0)] !text-[var(--p-text-color)] !border-[var(--p-surface-200)]"
          :disabled="loading"
        />
      </div>

      <div class="flex flex-col gap-1 text-left">
        <label class="text-xs font-semibold text-[var(--p-text-muted-color)]"
          >密码 <span class="text-red-500">*</span></label
        >
        <Password
          v-model="registerForm.password"
          placeholder="设置密码 (至少 6 个字符)"
          toggleMask
          class="w-full"
          inputClass="w-full !rounded-xl !bg-[var(--p-surface-0)] !text-[var(--p-text-color)] !border-[var(--p-surface-200)]"
          autocomplete="new-password"
          required
          :disabled="loading"
        />
      </div>

      <div class="flex flex-col gap-1 text-left">
        <label class="text-xs font-semibold text-[var(--p-text-muted-color)]"
          >确认密码 <span class="text-red-500">*</span></label
        >
        <Password
          v-model="registerForm.confirmPassword"
          placeholder="确认密码"
          :feedback="false"
          toggleMask
          class="w-full"
          inputClass="w-full !rounded-xl !bg-[var(--p-surface-0)] !text-[var(--p-text-color)] !border-[var(--p-surface-200)]"
          autocomplete="new-password"
          required
          :disabled="loading"
        />
      </div>

      <Button
        type="submit"
        label="注册并登录"
        :loading="loading"
        class="w-full !py-3 !rounded-xl font-semibold mt-1"
      />
    </form>

    <div class="mt-5 text-center text-xs text-[var(--p-text-muted-color)]">
      <span v-if="isLogin">
        还没有账号？
        <Button
          link
          label="免费注册"
          class="!p-0 !text-xs font-semibold !text-[var(--p-primary-color)]"
          @click="authModalMode = 'register'"
        />
      </span>
      <span v-else>
        已有账号？
        <Button
          link
          label="直接登录"
          class="!p-0 !text-xs font-semibold !text-[var(--p-primary-color)]"
          @click="authModalMode = 'login'"
        />
      </span>
    </div>

    <p
      class="text-[11px] text-[var(--p-text-muted-color)] text-center mt-3 mb-0"
    >
      继续即表示您同意
      <a href="#" class="underline hover:text-[var(--p-text-color)]"
        >使用条款</a
      >
      和
      <a href="#" class="underline hover:text-[var(--p-text-color)]"
        >隐私政策</a
      >
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { InputText, Password, Button, Divider, Message } from "primevue";
import { useToast } from "primevue/usetoast";
import { userFacingError } from "@/utils/userFacingError";
import { useUser } from "@/composables/useUser";

const { authModalMode, login, loginWithGoogle, register } = useUser();
const toast = useToast();

const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  "377817957215-m56vckjbc681ha19p1dn1vmrt50kdii7.apps.googleusercontent.com";

const isLogin = computed(() => authModalMode.value === "login");
const loading = ref(false);
const errorMessage = ref("");

const loginForm = ref({
  username: "",
  password: "",
});

const registerForm = ref({
  username: "",
  nickname: "",
  password: "",
  confirmPassword: "",
});

const resetForms = () => {
  errorMessage.value = "";
  loginForm.value = { username: "", password: "" };
  registerForm.value = {
    username: "",
    nickname: "",
    password: "",
    confirmPassword: "",
  };
};

watch(authModalMode, () => {
  errorMessage.value = "";
});

defineExpose({ resetForms });

const handleGoogleLogin = () => {
  const redirectUri = window.location.origin;
  const nonce = Math.random().toString(36).substring(2);
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(
    GOOGLE_CLIENT_ID,
  )}&redirect_uri=${encodeURIComponent(
    redirectUri,
  )}&response_type=id_token&scope=openid%20profile%20email&nonce=${nonce}`;

  const width = 500;
  const height = 620;
  const left = window.screen.width / 2 - width / 2;
  const top = window.screen.height / 2 - height / 2;

  const popup = window.open(
    authUrl,
    "GoogleAuth",
    `width=${width},height=${height},top=${top},left=${left},scrollbars=yes`,
  );

  if (!popup) {
    toast.add({
      severity: "error",
      summary: "弹窗被拦截",
      detail: "请允许浏览器弹出窗口以完成 Google 账号登录",
      life: 4000,
    });
    return;
  }

  const timer = setInterval(async () => {
    if (!popup || popup.closed) {
      clearInterval(timer);
      return;
    }
    try {
      if (popup.location.href.includes("id_token=")) {
        const hash = popup.location.hash || popup.location.search;
        const params = new URLSearchParams(hash.replace(/^#\/?/, ""));
        const idToken = params.get("id_token");
        popup.close();
        clearInterval(timer);

        if (idToken) {
          loading.value = true;
          errorMessage.value = "";
          try {
            const user = await loginWithGoogle(idToken);
            toast.add({
              severity: "success",
              summary: "Google 登录成功",
              detail: `欢迎回来，${user.nickname || user.username}！`,
              life: 3000,
            });
          } catch (err: any) {
            console.error("Google login failed:", err);
            errorMessage.value = userFacingError(err, "Google 登录验证失败");
          } finally {
            loading.value = false;
          }
        }
      }
    } catch {
      // Ignore cross-origin errors before redirecting back
    }
  }, 250);
};

const handleLogin = async () => {
  if (!loginForm.value.username || !loginForm.value.password) {
    errorMessage.value = "请填写完整的用户名和密码";
    return;
  }
  loading.value = true;
  errorMessage.value = "";
  try {
    const user = await login(loginForm.value);
    toast.add({
      severity: "success",
      summary: "登录成功",
      detail: `欢迎回来，${user.nickname || user.username}！`,
      life: 3000,
    });
  } catch (err: any) {
    console.error("Login failed:", err);
    errorMessage.value = userFacingError(err, "登录失败，请检查用户名和密码");
  } finally {
    loading.value = false;
  }
};

const handleRegister = async () => {
  if (!registerForm.value.username || !registerForm.value.password) {
    errorMessage.value = "请填写必填字段";
    return;
  }
  if (registerForm.value.password !== registerForm.value.confirmPassword) {
    errorMessage.value = "两次输入的密码不一致";
    return;
  }
  loading.value = true;
  errorMessage.value = "";
  try {
    const user = await register({
      username: registerForm.value.username,
      nickname: registerForm.value.nickname,
      password: registerForm.value.password,
    });
    toast.add({
      severity: "success",
      summary: "注册成功",
      detail: `欢迎加入 OmniCanvas，${user.nickname || user.username}！`,
      life: 3000,
    });
  } catch (err: any) {
    console.error("Register failed:", err);
    errorMessage.value = userFacingError(err, "注册失败，请更换用户名重试");
  } finally {
    loading.value = false;
  }
};
</script>
