import type { ToastServiceMethods } from 'primevue/toastservice';

let toastInstance: ToastServiceMethods | null = null;

export function setToastInstance(instance: ToastServiceMethods) {
  toastInstance = instance;
}

export function getToast() {
  return toastInstance;
}
