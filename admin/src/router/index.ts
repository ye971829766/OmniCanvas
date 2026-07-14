import { createRouter, createWebHistory } from "vue-router";
import DashboardSection from "../components/DashboardSection.vue";
import ChannelsSection from "../components/ChannelsSection.vue";
import ModelsSection from "../components/ModelsSection.vue";
import UsersSection from "../components/UsersSection.vue";
import TokensSection from "../components/TokensSection.vue";
import AgentSection from "../components/AgentSection.vue";
import DiagnosticsSection from "../components/DiagnosticsSection.vue";
import BillingSection from "../components/BillingSection.vue";

const routes = [
  {
    path: "/",
    redirect: "/dashboard",
  },
  {
    path: "/dashboard",
    name: "Dashboard",
    component: DashboardSection,
    meta: {
      key: "dashboard",
      title: "系统概览",
      description: "用户、积分、支付、用量与配置健康一览",
    },
  },
  {
    path: "/channels",
    name: "Channels",
    component: ChannelsSection,
    meta: {
      key: "channels",
      title: "上游渠道管理",
      description: "维护可用的上游渠道、密钥和路由优先级",
    },
  },
  {
    path: "/models",
    name: "Models",
    component: ModelsSection,
    meta: {
      key: "models",
      title: "模型目录",
      description: "维护前端显示名、上游渠道、上游模型名及图标的映射表与配置模板",
    },
  },
  {
    path: "/users",
    name: "Users",
    component: UsersSection,
    meta: {
      key: "users",
      title: "用户管理",
      description: "管理系统注册账号、用户角色权限及密码重置",
    },
  },
  {
    path: "/billing",
    name: "Billing",
    component: BillingSection,
    meta: {
      key: "billing",
      title: "计费与支付",
      description: "查看积分账户、支付订单、计价规则并执行可审计调账",
    },
  },
  {
    path: "/tokens",
    name: "Tokens",
    component: TokensSection,
    meta: {
      key: "tokens",
      title: "Token 消耗统计",
      description: "全站及各用户 AI Token 资源消耗分布与实时指标分析",
    },
  },
  {
    path: "/agent",
    name: "Agent",
    component: AgentSection,
    meta: {
      key: "agent",
      title: "Agent配置",
      description: "配置 Agent 提示词、驱动/视觉模型，以及局部重绘所用图片模型",
    },
  },
  {
    path: "/diagnostics",
    name: "Diagnostics",
    component: DiagnosticsSection,
    meta: {
      key: "diagnostics",
      title: "路由与接口测试",
      description: "测试模型映射关系并实时诊断接口延迟与底座返回负载",
    },
  },
  {
    path: "/:pathMatch(.*)*",
    redirect: "/dashboard",
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
