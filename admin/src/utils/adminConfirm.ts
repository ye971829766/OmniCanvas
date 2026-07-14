import { ElMessageBox } from "element-plus";

/**
 * Secondary confirmation for sensitive admin actions.
 * - confirm: simple Yes/No
 * - typeConfirm: user must type the exact phrase (default「确认」)
 */
export async function confirmAdminAction(options: {
  title: string;
  message: string;
  confirmButtonText?: string;
  type?: "warning" | "error" | "info";
  /** When set, opens a prompt; user must type this exact string */
  requireText?: string;
}): Promise<boolean> {
  const {
    title,
    message,
    confirmButtonText = "确认执行",
    type = "warning",
    requireText,
  } = options;

  try {
    if (requireText) {
      const { value } = await ElMessageBox.prompt(
        `${message}\n\n请输入「${requireText}」以继续：`,
        title,
        {
          confirmButtonText,
          cancelButtonText: "取消",
          type,
          inputPattern: new RegExp(
            `^${requireText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
          ),
          inputErrorMessage: `请准确输入：${requireText}`,
          inputPlaceholder: requireText,
        },
      );
      return value === requireText;
    }

    await ElMessageBox.confirm(message, title, {
      confirmButtonText,
      cancelButtonText: "取消",
      type,
    });
    return true;
  } catch {
    return false;
  }
}
