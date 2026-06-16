import { shallowReactive, watch } from "vue";
import { UI, defineKey } from "leafer-ui";

// 定义proxyData
defineKey(UI.prototype, "proxyData", {
  get() {
    return (this as any).__proxyData
      ? (this as any).__proxyData
      : ((this as any).__proxyData = (this as any).createProxyData());
  },
});

// 设置元素属性时，内部同步设置代理数据
(UI.prototype as any).setProxyAttr = function (name: string, newValue: unknown): void {
  const data = (this as any).__proxyData as any;
  if (data && data[name] !== newValue) data[name] = newValue;
};

// 获取元素属性时，内部优先返回代理数据
(UI.prototype as any).getProxyAttr = function (name: string): any {
  const data = (this as any).__proxyData as any;
  const value = data ? data[name] : undefined;
  return value === undefined ? (this as any).__.__get(name) : value;
};

// 创建响应式数据
(UI.prototype as any).createProxyData = function () {
  // 1.获取所有样式数据(含默认值)
  const data = (this as any).__.__getData();

  // 2. 生成响应式数据
  const proxyData = shallowReactive(data);

  // 3.观察响应式数据变化，同步更新元素数据
  for (const name in data) {
    watch(
      () => proxyData[name], // source
      (newValue) => {
        if ((this as any).__.__get(name) !== newValue) (this as any)[name] = newValue;
      }, // callback
    );
  }

  return proxyData;
};

// 清理响应式数据
(UI.prototype as any).clearProxyData = function () {
  if ((this as any).__proxyData) delete (this as any).__proxyData;
};
