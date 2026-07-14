<template>
  <div style="display: flex; flex-direction: column; gap: 20px">
    <!-- Stat Cards Overview -->
    <div
      style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px"
    >
      <el-card
        shadow="none"
        style="
          background-color: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 20px;
        "
      >
        <div
          style="
            display: flex;
            align-items: center;
            justify-content: space-between;
          "
        >
          <div>
            <div style="font-size: 13px; color: #64748b; font-weight: 600">
              总注册用户
            </div>
            <div
              style="
                font-size: 28px;
                font-weight: 800;
                color: #0f172a;
                margin-top: 4px;
              "
            >
              {{ users.length }}
            </div>
          </div>
          <div
            style="
              width: 44px;
              height: 44px;
              border-radius: 50%;
              background-color: #f1f5f9;
              display: flex;
              align-items: center;
              justify-content: center;
            "
          >
            <el-icon style="font-size: 22px; color: #0f172a"><User /></el-icon>
          </div>
        </div>
      </el-card>

      <el-card
        shadow="none"
        style="
          background-color: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 20px;
        "
      >
        <div
          style="
            display: flex;
            align-items: center;
            justify-content: space-between;
          "
        >
          <div>
            <div style="font-size: 13px; color: #64748b; font-weight: 600">
              管理员账号
            </div>
            <div
              style="
                font-size: 28px;
                font-weight: 800;
                color: #0f172a;
                margin-top: 4px;
              "
            >
              {{ adminCount }}
            </div>
          </div>
          <div
            style="
              width: 44px;
              height: 44px;
              border-radius: 50%;
              background-color: #ffedd5;
              display: flex;
              align-items: center;
              justify-content: center;
            "
          >
            <el-icon style="font-size: 22px; color: #c2410c"><Lock /></el-icon>
          </div>
        </div>
      </el-card>

      <el-card
        shadow="none"
        style="
          background-color: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 20px;
        "
      >
        <div
          style="
            display: flex;
            align-items: center;
            justify-content: space-between;
          "
        >
          <div>
            <div style="font-size: 13px; color: #64748b; font-weight: 600">
              普通用户
            </div>
            <div
              style="
                font-size: 28px;
                font-weight: 800;
                color: #0f172a;
                margin-top: 4px;
              "
            >
              {{ regularCount }}
            </div>
          </div>
          <div
            style="
              width: 44px;
              height: 44px;
              border-radius: 50%;
              background-color: #dcfce7;
              display: flex;
              align-items: center;
              justify-content: center;
            "
          >
            <el-icon style="font-size: 22px; color: #15803d"
              ><UserFilled
            /></el-icon>
          </div>
        </div>
      </el-card>
    </div>

    <!-- User Table Card -->
    <el-card
      shadow="none"
      style="
        background-color: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 20px;
      "
    >
      <template #header>
        <div
          style="
            display: flex;
            justify-content: space-between;
            align-items: center;
          "
        >
          <span
            style="
              font-size: 16px;
              font-weight: 700;
              color: #0f172a;
              display: flex;
              align-items: center;
              gap: 8px;
            "
          >
            <el-icon style="color: #0f172a"><User /></el-icon>
            用户列表与权限管理
          </span>
          <div style="display: flex; gap: 12px">
            <el-input
              v-model="searchKeyword"
              placeholder="搜索用户名或昵称..."
              clearable
              style="width: 240px"
              :prefix-icon="Search"
            />
            <el-button type="primary" @click="openCreateModal">
              <el-icon style="margin-right: 4px"><Plus /></el-icon>新增用户
            </el-button>
          </div>
        </div>
      </template>

      <el-table v-loading="loading" :data="filteredUsers" style="width: 100%">
        <el-table-column label="用户信息" min-width="220">
          <template #default="{ row }">
            <div style="display: flex; align-items: center; gap: 12px">
              <el-avatar
                :src="row.avatarUrl"
                style="
                  background-color: #0f172a;
                  color: #fff;
                  font-weight: 700;
                  flex-shrink: 0;
                "
              >
                {{ getUserInitials(row) }}
              </el-avatar>
              <div>
                <div style="font-weight: 700; color: #0f172a; font-size: 14px">
                  {{ row.nickname || row.username }}
                </div>
                <div style="font-size: 12px; color: #64748b">
                  @{{ row.username }}
                </div>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="用户角色" width="120">
          <template #default="{ row }">
            <el-tag :type="row.role === 'admin' ? 'warning' : 'info'">
              {{ row.role === "admin" ? "管理员" : "普通用户" }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="账号状态" width="120">
          <template #default="{ row }">
            <el-tag
              :type="row.status === 'banned' ? 'danger' : 'success'"
              effect="light"
              round
            >
              {{ row.status === "banned" ? "已封禁" : "正常" }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="注册时间" width="170">
          <template #default="{ row }">
            <span style="color: #64748b; font-size: 13px">
              {{ formatDate(row.createdAt) }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="280" align="right" fixed="right">
          <template #default="{ row }">
            <div
              style="
                display: flex;
                align-items: center;
                justify-content: flex-end;
                gap: 6px;
                flex-wrap: wrap;
              "
            >
              <el-button
                size="small"
                type="primary"
                plain
                @click="openEditModal(row)"
              >
                编辑
              </el-button>
              <el-button
                v-if="row.status !== 'banned' && row.role !== 'admin'"
                size="small"
                type="warning"
                plain
                @click="handleBan(row)"
              >
                封禁
              </el-button>
              <el-button
                v-if="row.status === 'banned'"
                size="small"
                type="success"
                plain
                @click="handleUnban(row)"
              >
                解封
              </el-button>
              <el-button
                size="small"
                type="danger"
                plain
                @click="handleDelete(row)"
              >
                删除
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- Create User Dialog -->
    <el-dialog
      v-model="createModalVisible"
      title="新增用户账号"
      width="480px"
      :close-on-click-modal="false"
      @closed="resetCreateForm"
    >
      <el-form :model="createForm" label-position="top">
        <el-form-item label="用户名 / 邮箱" required>
          <el-input
            v-model="createForm.username"
            placeholder="请输入唯一用户名或邮箱"
            autocomplete="off"
          />
        </el-form-item>
        <el-form-item label="显示昵称">
          <el-input v-model="createForm.nickname" placeholder="可选显示昵称" />
        </el-form-item>
        <el-form-item label="初始密码" required>
          <el-input
            v-model="createForm.password"
            type="password"
            show-password
            placeholder="至少 6 位字符"
            autocomplete="new-password"
          />
        </el-form-item>
        <el-form-item label="用户角色" required>
          <el-radio-group v-model="createForm.role">
            <el-radio label="user">普通用户</el-radio>
            <el-radio label="admin">管理员</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createModalVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="submitLoading"
          @click="handleCreate"
        >
          确认创建
        </el-button>
      </template>
    </el-dialog>

    <!-- Edit User Dialog -->
    <el-dialog
      v-model="editModalVisible"
      title="编辑用户信息"
      width="480px"
      :close-on-click-modal="false"
    >
      <el-form v-if="editingUser" :model="editForm" label-position="top">
        <el-form-item label="用户名">
          <el-input :model-value="editingUser.username" disabled />
        </el-form-item>
        <el-form-item label="显示昵称">
          <el-input v-model="editForm.nickname" placeholder="请输入新昵称" />
        </el-form-item>
        <el-form-item label="用户角色">
          <el-radio-group v-model="editForm.role">
            <el-radio label="user">普通用户</el-radio>
            <el-radio label="admin">管理员</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="重置密码（留空则不修改）">
          <el-input
            v-model="editForm.password"
            type="password"
            show-password
            placeholder="留空保持原密码"
            autocomplete="new-password"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editModalVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="submitLoading"
          @click="handleUpdate"
        >
          保存修改
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { User, UserFilled, Lock, Search, Plus } from "@element-plus/icons-vue";
import {
  getAdminUsers,
  createAdminUser,
  updateAdminUser,
  deleteAdminUser,
  banAdminUser,
  unbanAdminUser,
  type AdminUser,
} from "../utils/api";
import { confirmAdminAction } from "../utils/adminConfirm";

const users = ref<AdminUser[]>([]);
const loading = ref(false);
const submitLoading = ref(false);
const searchKeyword = ref("");

const createModalVisible = ref(false);
const editModalVisible = ref(false);
const editingUser = ref<AdminUser | null>(null);

const createForm = ref({
  username: "",
  nickname: "",
  password: "",
  role: "user" as "user" | "admin",
});

const editForm = ref({
  nickname: "",
  role: "user" as "user" | "admin",
  password: "",
});

const adminCount = computed(
  () => users.value.filter((u) => u.role === "admin").length,
);
const regularCount = computed(
  () => users.value.filter((u) => u.role === "user").length,
);

const filteredUsers = computed(() => {
  if (!searchKeyword.value.trim()) return users.value;
  const kw = searchKeyword.value.toLowerCase();
  return users.value.filter(
    (u) =>
      u.username.toLowerCase().includes(kw) ||
      (u.nickname && u.nickname.toLowerCase().includes(kw)),
  );
});

function getUserInitials(user: AdminUser): string {
  const name = user.nickname || user.username || "U";
  return name.slice(0, 2).toUpperCase();
}

function formatDate(isoStr?: string): string {
  if (!isoStr) return "-";
  try {
    const d = new Date(isoStr);
    return d.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoStr;
  }
}

async function fetchUsers() {
  loading.value = true;
  try {
    users.value = await getAdminUsers();
  } catch (err: any) {
    console.error("Fetch users failed:", err);
    ElMessage.error(err?.response?.data?.message || "获取用户列表失败");
  } finally {
    loading.value = false;
  }
}

function openCreateModal() {
  resetCreateForm();
  createModalVisible.value = true;
}

function resetCreateForm() {
  createForm.value = {
    username: "",
    nickname: "",
    password: "",
    role: "user",
  };
}

async function handleCreate() {
  if (!createForm.value.username || !createForm.value.password) {
    ElMessage.warning("请填写完整的用户名和初始密码");
    return;
  }
  submitLoading.value = true;
  try {
    await createAdminUser(createForm.value);
    ElMessage.success("用户创建成功");
    createModalVisible.value = false;
    await fetchUsers();
  } catch (err: any) {
    console.error("Create user failed:", err);
    ElMessage.error(err?.response?.data?.message || "创建用户失败");
  } finally {
    submitLoading.value = false;
  }
}

function openEditModal(user: AdminUser) {
  editingUser.value = user;
  editForm.value = {
    nickname: user.nickname || "",
    role: user.role,
    password: "",
  };
  editModalVisible.value = true;
}

async function handleUpdate() {
  if (!editingUser.value) return;
  submitLoading.value = true;
  try {
    await updateAdminUser(editingUser.value.id, editForm.value);
    ElMessage.success("用户信息已成功更新");
    editModalVisible.value = false;
    await fetchUsers();
  } catch (err: any) {
    console.error("Update user failed:", err);
    ElMessage.error(err?.response?.data?.message || "更新用户信息失败");
  } finally {
    submitLoading.value = false;
  }
}

async function handleBan(user: AdminUser) {
  try {
    const { value: reason } = await ElMessageBox.prompt(
      `确定封禁用户 @${user.username}？封禁后将无法登录。`,
      "封禁账号",
      {
        confirmButtonText: "继续",
        cancelButtonText: "取消",
        type: "warning",
        inputPlaceholder: "封禁原因（将展示给用户）",
        inputValue: "违反平台使用规范",
      },
    );
    const ok = await confirmAdminAction({
      title: "二次确认 · 封禁",
      message: `即将封禁 @${user.username}。此操作立即生效。`,
      requireText: "确认封禁",
      confirmButtonText: "封禁",
      type: "error",
    });
    if (!ok) return;
    await banAdminUser(user.id, reason || "违反平台使用规范");
    ElMessage.success("已封禁该用户");
    await fetchUsers();
  } catch (err: any) {
    if (err === "cancel" || err === "close") return;
    console.error("Ban user failed:", err);
    ElMessage.error(err?.response?.data?.message || "封禁失败");
  }
}

async function handleUnban(user: AdminUser) {
  const ok = await confirmAdminAction({
    title: "解除封禁",
    message: `确认解封 @${user.username}？解封后可立即登录。`,
    confirmButtonText: "确认解封",
    type: "warning",
  });
  if (!ok) return;
  try {
    await unbanAdminUser(user.id);
    ElMessage.success("已解除封禁");
    await fetchUsers();
  } catch (err: any) {
    console.error("Unban user failed:", err);
    ElMessage.error(err?.response?.data?.message || "解封失败");
  }
}

async function handleDelete(user: AdminUser) {
  const ok = await confirmAdminAction({
    title: "二次确认 · 删除用户",
    message: `将永久删除 @${user.username}，数据不可恢复。`,
    requireText: "确认删除",
    confirmButtonText: "删除",
    type: "error",
  });
  if (!ok) return;
  try {
    await deleteAdminUser(user.id);
    ElMessage.success("已删除该用户");
    await fetchUsers();
  } catch (err: any) {
    console.error("Delete user failed:", err);
    ElMessage.error(err?.response?.data?.message || "删除用户失败");
  }
}

defineExpose({
  openCreateModal,
});

onMounted(() => {
  void fetchUsers();
});
</script>
