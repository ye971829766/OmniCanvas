<template>
  <Dialog
    v-model:visible="profileModalVisible"
    modal
    header="个人中心"
    :dismissableMask="true"
    :style="{ width: '420px', maxWidth: '92vw' }"
    :pt="{
      root: {
        class:
          '!rounded-3xl !border-none !shadow-2xl !bg-[var(--p-surface-0)] !text-[var(--p-text-color)]',
      },
      header: {
        class: '!pt-5 !px-6 flex items-center justify-between !bg-transparent',
      },
      content: { class: '!px-6 !pb-6 !pt-2 !bg-transparent' },
    }"
  >
    <div v-if="currentUser" class="flex flex-col items-center w-full">
      <!-- Hidden File Input for Avatar Upload -->
      <input
        ref="fileInputRef"
        type="file"
        accept="image/*"
        class="hidden"
        @change="handleFileSelect"
      />

      <!-- User Avatar & Header Info with Edit Badge -->
      <div class="flex flex-col items-center text-center mb-5">
        <div
          class="relative group cursor-pointer mb-2"
          title="点击更换头像"
          @click="triggerAvatarUpload"
        >
          <!-- Avatar Preview Image or Fallback Label -->
          <div
            class="w-20 h-20 rounded-full bg-[var(--p-primary-color)] flex items-center justify-center text-white text-2xl font-bold select-none shadow-md overflow-hidden border-2 border-[var(--p-surface-0)] group-hover:opacity-90 transition-opacity"
          >
            <img
              v-if="previewAvatarUrl"
              :src="previewAvatarUrl"
              alt="Avatar"
              class="w-full h-full object-cover"
            />
            <span v-else>{{ userInitials }}</span>
          </div>

          <!-- Camera Badge Overlay -->
          <div
            class="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-[var(--p-primary-color)] text-white flex items-center justify-center shadow-lg border-2 border-[var(--p-surface-0)] transition-transform group-hover:scale-110"
          >
            <Camera :size="14" />
          </div>

          <!-- Uploading Spinner Overlay -->
          <div
            v-if="uploadingAvatar"
            class="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center text-white"
          >
            <i class="pi pi-spin pi-spinner text-xl"></i>
          </div>
        </div>

        <h2 class="text-xl font-bold text-[var(--p-text-color)] tracking-tight">
          {{ displayName }}
        </h2>
        <span class="text-xs text-[var(--p-text-muted-color)] mt-0.5">
          @{{ currentUser.username }}
        </span>
      </div>

      <!-- Settings Form -->
      <form @submit.prevent="handleSave" class="flex flex-col gap-4 w-full">
        <div class="flex flex-col gap-1 text-left">
          <label class="text-xs font-semibold text-[var(--p-text-muted-color)]">
            显示名称 / 昵称
          </label>
          <InputText
            v-model="form.nickname"
            placeholder="请输入新昵称"
            class="w-full !rounded-xl !bg-[var(--p-surface-0)] !text-[var(--p-text-color)] !border-[var(--p-surface-200)]"
            :disabled="loading"
          />
        </div>

        <!-- Password Change Toggle -->
        <div class="pt-1">
          <Button
            type="button"
            variant="link"
            class="!p-0 !text-xs font-semibold !text-[var(--p-primary-color)] flex items-center gap-1"
            @click="showPasswordFields = !showPasswordFields"
          >
            <Key :size="14" />
            <span>{{
              showPasswordFields ? "收起密码修改" : "修改账号密码"
            }}</span>
          </Button>
        </div>

        <div
          v-if="showPasswordFields"
          class="flex flex-col gap-3 p-3.5 rounded-2xl bg-[var(--p-surface-100)] border border-[var(--p-surface-200)]"
        >
          <div class="flex flex-col gap-1 text-left">
            <label
              class="text-xs font-semibold text-[var(--p-text-muted-color)]"
              >当前密码</label
            >
            <Password
              v-model="form.oldPassword"
              placeholder="请输入当前密码"
              :feedback="false"
              toggleMask
              class="w-full"
              inputClass="w-full !rounded-xl !bg-[var(--p-surface-0)] !text-[var(--p-text-color)] !border-[var(--p-surface-200)]"
              :disabled="loading"
            />
          </div>

          <div class="flex flex-col gap-1 text-left">
            <label
              class="text-xs font-semibold text-[var(--p-text-muted-color)]"
              >新密码</label
            >
            <Password
              v-model="form.newPassword"
              placeholder="至少 6 个字符"
              toggleMask
              class="w-full"
              inputClass="w-full !rounded-xl !bg-[var(--p-surface-0)] !text-[var(--p-text-color)] !border-[var(--p-surface-200)]"
              :disabled="loading"
            />
          </div>
        </div>

        <!-- Submit Button -->
        <Button
          type="submit"
          label="保存修改"
          :loading="loading"
          class="w-full !py-2.5 !rounded-xl font-semibold mt-2"
        />

        <!-- Logout Button -->
        <Button
          type="button"
          severity="danger"
          variant="outlined"
          class="w-full !py-2.5 !rounded-xl font-semibold flex items-center justify-center gap-1.5"
          @click="handleLogout"
        >
          <LogOut :size="16" />
          <span>退出登录</span>
        </Button>
      </form>
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { Dialog, InputText, Password, Button } from "primevue";
import { Key, LogOut, Camera } from "lucide-vue-next";
import { useToast } from "primevue/usetoast";
import { useUser } from "@/composables/useUser";
import { uploadImage } from "@/utils/api";

const {
  currentUser,
  profileModalVisible,
  userInitials,
  displayName,
  updateProfile,
  logout,
} = useUser();

const toast = useToast();
const loading = ref(false);
const uploadingAvatar = ref(false);
const showPasswordFields = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);

const form = ref({
  nickname: "",
  avatarUrl: "",
  oldPassword: "",
  newPassword: "",
});

const previewAvatarUrl = computed(() => {
  return form.value.avatarUrl || currentUser.value?.avatarUrl || "";
});

watch(profileModalVisible, (visible) => {
  if (visible && currentUser.value) {
    form.value.nickname = currentUser.value.nickname || "";
    form.value.avatarUrl = currentUser.value.avatarUrl || "";
    form.value.oldPassword = "";
    form.value.newPassword = "";
    showPasswordFields.value = false;
  }
});

const triggerAvatarUpload = () => {
  fileInputRef.value?.click();
};

const handleFileSelect = async (e: Event) => {
  const input = e.target as HTMLInputElement;
  if (!input.files || input.files.length === 0) return;

  const file = input.files[0];
  if (!file.type.startsWith("image/")) {
    toast.add({
      severity: "warn",
      summary: "文件格式不支持",
      detail: "请选择有效图片文件 (JPG, PNG, WebP)",
      life: 3000,
    });
    return;
  }

  uploadingAvatar.value = true;
  try {
    const res = await uploadImage(file);
    if (res.url) {
      form.value.avatarUrl = res.url;
      // Auto save avatar update so sidebar and profile reflect change instantly
      await updateProfile({
        nickname: form.value.nickname,
        avatarUrl: res.url,
      });
      toast.add({
        severity: "success",
        summary: "头像修改成功",
        detail: "您的个人头像已成功更新",
        life: 3000,
      });
    }
  } catch (err: any) {
    console.error("Upload avatar error:", err);
    toast.add({
      severity: "error",
      summary: "上传失败",
      detail: err?.response?.data?.message || err?.message || "图片上传失败",
      life: 3000,
    });
  } finally {
    uploadingAvatar.value = false;
    input.value = "";
  }
};

const handleSave = async () => {
  loading.value = true;
  try {
    const payload: any = {
      nickname: form.value.nickname,
      avatarUrl: form.value.avatarUrl,
    };
    if (showPasswordFields.value && form.value.newPassword) {
      payload.oldPassword = form.value.oldPassword;
      payload.newPassword = form.value.newPassword;
    }
    await updateProfile(payload);
    toast.add({
      severity: "success",
      summary: "保存成功",
      detail: "个人资料已成功更新",
      life: 3000,
    });
    profileModalVisible.value = false;
  } catch (err: any) {
    console.error("Update profile error:", err);
    toast.add({
      severity: "error",
      summary: "更新失败",
      detail: err?.response?.data?.message || err?.message || "网络请求失败",
      life: 3000,
    });
  } finally {
    loading.value = false;
  }
};

const handleLogout = () => {
  logout();
  toast.add({
    severity: "info",
    summary: "已退出登录",
    detail: "您已成功退出登录",
    life: 3000,
  });
};
</script>
