<template>
  <div class="login-page">
    <div class="login-card">
      <div class="brand-mark"><el-icon :size="25"><Cpu /></el-icon></div>
      <h1>OmniAdmin</h1>
      <p>使用管理员账号登录控制台</p>
      <el-form label-position="top" @submit.prevent="submit">
        <el-form-item label="管理员账号">
          <el-input v-model="username" size="large" autocomplete="username" placeholder="用户名或邮箱" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="password" size="large" type="password" show-password autocomplete="current-password" placeholder="输入密码" @keyup.enter="submit" />
        </el-form-item>
        <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
        <el-button type="primary" size="large" native-type="submit" :loading="loading" style="width: 100%; margin-top: 18px">登录管理端</el-button>
      </el-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { Cpu } from "@element-plus/icons-vue";
import { loginAdmin } from "../utils/api";

const emit = defineEmits<{ authenticated: [] }>();
const username = ref("");
const password = ref("");
const loading = ref(false);
const error = ref("");

async function submit() {
  if (!username.value || !password.value) {
    error.value = "请输入管理员账号和密码";
    return;
  }
  loading.value = true;
  error.value = "";
  try {
    await loginAdmin(username.value, password.value);
    emit("authenticated");
  } catch (err: any) {
    localStorage.removeItem("omnicanvas_admin_token");
    error.value = err?.response?.data?.message || err?.message || "登录失败";
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-page { width: 100vw; height: 100vh; display: grid; place-items: center; background: radial-gradient(circle at 20% 0%, #e2e8f0, transparent 34%), #f1f3f5; }
.login-card { width: 390px; padding: 38px; border-radius: 28px; background: #fff; border: 1px solid #e2e8f0; box-shadow: 0 24px 60px rgba(15, 23, 42, .1); }
.brand-mark { width: 50px; height: 50px; display: grid; place-items: center; margin-bottom: 22px; border-radius: 16px; color: white; background: #0f172a; }
h1 { margin: 0; font-size: 28px; color: #0f172a; letter-spacing: -.04em; }
p { margin: 8px 0 28px; color: #64748b; font-size: 14px; }
</style>
