import { createRouter, createWebHistory } from "vue-router";
import BoardView from "../views/BoardView.vue";
import LoginView from "../views/LoginView.vue";
import { useUser } from "@/composables/useUser";

const routes = [
  {
    path: "/",
    redirect: "/canvas",
  },
  {
    path: "/canvas",
    name: "canvas",
    component: BoardView,
  },
  {
    path: "/login",
    name: "login",
    component: LoginView,
    meta: { public: true },
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

let authReady = false;

router.beforeEach(async (to) => {
  const { ensureSession, fetchProfile, isLoggedIn } = useUser();

  if (!authReady) {
    // Prefer ensureSession (includes one retry) so a flaky first request
    // after browser-back from Stripe does not dump the user on /login.
    await ensureSession();
    authReady = true;
  } else if (!isLoggedIn.value && localStorage.getItem("omnicanvas_token")) {
    // Token present but session not hydrated (bfcache / race) — rehydrate.
    await fetchProfile();
  }

  if (to.meta.public) {
    if (to.path === "/login" && isLoggedIn.value) {
      return "/canvas";
    }
    // Token exists but profile not loaded yet — try once more on the login page.
    if (to.path === "/login" && !isLoggedIn.value && localStorage.getItem("omnicanvas_token")) {
      await ensureSession();
      if (isLoggedIn.value) return "/canvas";
    }
    return true;
  }

  if (!isLoggedIn.value) {
    if (localStorage.getItem("omnicanvas_token")) {
      await ensureSession();
      if (isLoggedIn.value) return true;
    }
    return "/login";
  }

  return true;
});

export default router;
