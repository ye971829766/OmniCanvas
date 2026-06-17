import { createRouter, createWebHistory } from "vue-router";
import BoardView from "../views/BoardView.vue";

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
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
