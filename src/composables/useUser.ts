import { ref, computed } from "vue";
import {
  type UserProfile,
  loginUser,
  loginWithGoogleApi,
  registerUser,
  getCurrentUser,
  updateUserProfile,
} from "@/utils/api";

const TOKEN_KEY = "omnicanvas_token";

// Shared reactive state
const currentUser = ref<UserProfile | null>(null);
const token = ref<string | null>(localStorage.getItem(TOKEN_KEY));
const authModalVisible = ref(false);
const profileModalVisible = ref(false);
const authModalMode = ref<"login" | "register">("login");
const isInitializing = ref(true);

export function useUser() {
  const isLoggedIn = computed(() => !!currentUser.value);

  const userInitials = computed(() => {
    if (!currentUser.value) return "游";
    const name = currentUser.value.nickname || currentUser.value.username;
    return name.slice(0, 2).toUpperCase();
  });

  const displayName = computed(() => {
    if (!currentUser.value) return "游客模式";
    return currentUser.value.nickname || currentUser.value.username;
  });

  const setToken = (newToken: string | null) => {
    token.value = newToken;
    if (newToken) {
      localStorage.setItem(TOKEN_KEY, newToken);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  };

  const fetchProfile = async () => {
    if (!token.value) {
      currentUser.value = null;
      isInitializing.value = false;
      return null;
    }
    try {
      const profile = await getCurrentUser();
      currentUser.value = profile;
      authModalVisible.value = false;
      return profile;
    } catch (err) {
      console.warn("Failed to fetch current user profile:", err);
      currentUser.value = null;
      setToken(null);
      return null;
    } finally {
      isInitializing.value = false;
    }
  };

  const login = async (credentials: { username: string; password: string }) => {
    const res = await loginUser(credentials);
    setToken(res.token);
    console.log("login res:", res);
    currentUser.value = res.user;
    authModalVisible.value = false;
    return res.user;
  };

  const register = async (payload: {
    username: string;
    nickname?: string;
    password: string;
    avatarUrl?: string;
  }) => {
    const res = await registerUser(payload);
    setToken(res.token);
    currentUser.value = res.user;
    authModalVisible.value = false;
    return res.user;
  };

  const logout = () => {
    currentUser.value = null;
    setToken(null);
    profileModalVisible.value = false;
  };

  const updateProfile = async (data: {
    nickname?: string;
    avatarUrl?: string;
    oldPassword?: string;
    newPassword?: string;
  }) => {
    const updated = await updateUserProfile(data);
    currentUser.value = updated;
    return updated;
  };

  const openAuthModal = (mode: "login" | "register" = "login") => {
    if (currentUser.value) {
      authModalVisible.value = false;
      return;
    }
    authModalMode.value = mode;
    authModalVisible.value = true;
  };

  const openProfileModal = () => {
    profileModalVisible.value = true;
  };

  const loginWithGoogle = async (idToken: string) => {
    const res = await loginWithGoogleApi(idToken);
    setToken(res.token);
    currentUser.value = res.user;
    authModalVisible.value = false;
    return res.user;
  };

  return {
    currentUser,
    token,
    isLoggedIn,
    isInitializing,
    userInitials,
    displayName,
    authModalVisible,
    profileModalVisible,
    authModalMode,
    openAuthModal,
    openProfileModal,
    fetchProfile,
    login,
    loginWithGoogle,
    register,
    logout,
    updateProfile,
  };
}

// Global listener setup
if (typeof window !== "undefined") {
  window.addEventListener("omnicanvas:unauthorized", () => {
    currentUser.value = null;
    token.value = null;
  });
}
