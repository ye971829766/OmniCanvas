import { ref } from "vue";
import { App, MoveEvent, ZoomEvent, PropertyEvent } from "leafer-ui";
import { EditorEvent } from "@leafer-in/editor";

export function useCanvasToolbar() {
  const selectTarget = ref<any>(undefined);
  const toolbarStyle = ref({
    left: "0px",
    top: "0px",
  });
  const toolbarVersion = ref(0);

  const refreshToolbar = () => {
    toolbarVersion.value = (toolbarVersion.value + 1) % 1_000_000;
  };

  const updateToolbarPosition = () => {
    if (!selectTarget.value) return;

    const bounds = selectTarget.value.worldBoxBounds;
    if (!bounds) return;

    const isBelow = selectTarget.value.tag === "ImageGen" || selectTarget.value.tag === "VideoGen";
    const top = isBelow ? bounds.y + bounds.height + 30 : bounds.y - 30;
    const left = bounds.x + bounds.width / 2;

    toolbarStyle.value = {
      left: `${left}px`,
      top: `${top}px`,
    };
  };

  const updateToolbarPositionAndRefresh = () => {
    updateToolbarPosition();
    refreshToolbar();
  };

  let zIndexRaisedTarget: any = null;
  let watchedTarget: any = null;

  const initToolbarListeners = (canvasApp: App) => {
    const onTargetPropertyChange = (e: any) => {
      if (
        e.propertyName === "name" ||
        e.propertyName === "width" ||
        e.propertyName === "height"
      ) {
        updateToolbarPositionAndRefresh();
      }
    };

    canvasApp.editor.on(EditorEvent.SELECT, () => {
      console.log(
        "SELECT event, list:",
        canvasApp.editor.list.map((item) => item.tag),
      );

      // Clean up previous property watcher
      if (watchedTarget) {
        watchedTarget.off(PropertyEvent.CHANGE, onTargetPropertyChange);
        watchedTarget = null;
      }

      // Restore previous target's zIndex to 0
      if (zIndexRaisedTarget) {
        zIndexRaisedTarget.zIndex = 0;
        zIndexRaisedTarget = null;
      }

      if (canvasApp.editor.list.length === 1) {
        const target = canvasApp.editor.list[0];
        selectTarget.value = target;

        // 选中元素时将层级提到最高（重排序操作时跳过，直接将 zIndex 设为 0 以显示真实层级）
        // if (!(canvasApp as any).isReordering) {
        //   const parent = target.parent;
        //   if (parent?.children) {
        //     const maxZIndex = Math.max(
        //       ...parent.children
        //         .filter((c: any) => c !== target)
        //         .map((c: any) => c.zIndex ?? 0),
        //       0
        //     );
        //     target.zIndex = maxZIndex + 1;
        //     zIndexRaisedTarget = target;
        //   }
        // } else {
        //   target.zIndex = 0;
        // }

        // Setup property watcher on the new selected target to update label/toolbar reactively
        target.on(PropertyEvent.CHANGE, onTargetPropertyChange);
        watchedTarget = target;
      } else if (canvasApp.editor.list.length > 1) {
        selectTarget.value = {
          tag: "MultipleSelect",
          get editor() {
            return canvasApp.editor;
          },
          get selectedList() {
            return canvasApp.editor.list;
          },
          updateToolbarPosition,
          get worldBoxBounds() {
            return canvasApp.editor.element?.worldBoxBounds;
          },
          get width() {
            const bounds = canvasApp.editor.element?.worldBoxBounds;
            const scale = canvasApp.tree?.scaleX || 1;
            return bounds ? bounds.width / scale : 0;
          },
          get height() {
            const bounds = canvasApp.editor.element?.worldBoxBounds;
            const scale = canvasApp.tree?.scaleY || 1;
            return bounds ? bounds.height / scale : 0;
          },
        };
      } else {
        selectTarget.value = undefined;
      }

      updateToolbarPositionAndRefresh();
    });

    canvasApp.editor.on("editor.scale", updateToolbarPositionAndRefresh);
    canvasApp.editor.on("editor.move", updateToolbarPositionAndRefresh);
    canvasApp.editor.on("editor.rotate", updateToolbarPositionAndRefresh);

    // Track viewport zoom/pan changes
    canvasApp.tree.on(MoveEvent.MOVE, updateToolbarPositionAndRefresh);
    canvasApp.tree.on(ZoomEvent.ZOOM, updateToolbarPositionAndRefresh);
  };

  return {
    selectTarget,
    toolbarStyle,
    toolbarVersion,
    updateToolbarPosition,
    initToolbarListeners,
  };
}
