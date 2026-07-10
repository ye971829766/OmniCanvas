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
  const { fetchProfile, isLoggedIn } = useUser();

  if (!authReady) {
    await fetchProfile();
    authReady = true;
  }

  if (to.meta.public) {
    if (to.path === "/login" && isLoggedIn.value) {
      return "/canvas";
    }
    return true;
  }

  if (!isLoggedIn.value) {
    return "/login";
  }

  return true;
});

export default router;
