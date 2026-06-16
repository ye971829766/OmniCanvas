import { type Ref } from "vue";
import { App, Text } from "leafer-ui";

/**
 * Composable for managing text creation and inline editing.
 * Listens to click events on the empty canvas to create text elements.
 */
export function useCanvasText(
  canvasAppRef: Ref<App | null>,
  activeTool: Ref<string>,
  fontSizeState: Ref<number>,
  fontFamilyState: Ref<string>,
  recordHistory: () => void,
) {
  let clickHandler: ((e: MouseEvent) => void) | null = null;

  const enableTextDraw = () => {
    const canvasApp = canvasAppRef.value;
    if (!canvasApp?.view) return;
    const view = canvasApp.view as HTMLElement;

    // Clean up any existing handler
    if (clickHandler) {
      view.removeEventListener("click", clickHandler);
    }

    clickHandler = (e: MouseEvent) => {
      if (activeTool.value !== "text") return;

      const pagePoint = canvasApp.tree.getPagePointByClient(e);
      const hit = canvasApp.tree.pick(pagePoint);

      // Prevent creating a new text node on top of an existing editable shape or text node
      const target = hit?.target;
      if (
        target &&
        (target.editable === true ||
          target.tag === "text" ||
          target.tag === "rect" ||
          target.tag === "ellipse" ||
          target.tag === "polygon" ||
          target.tag === "star" ||
          target.tag === "line" ||
          target.__tag === "VideoNode")
      ) {
        return;
      }

      const textNode = new Text({
        x: pagePoint.x,
        y: pagePoint.y,
        text: "Text",
        fontSize: fontSizeState.value,
        fontFamily: fontFamilyState.value,
        fill: "black",
        editable: true,
      });

      canvasApp.tree.add(textNode);

      // Select and trigger edit mode on the new text node
      if (canvasApp.editor) {
        canvasApp.editor.select(textNode);
        
        // Record history snapshot
        recordHistory();
        
        // Wait briefly for editor selection and layout to finalize before editing
        setTimeout(() => {
          canvasApp.editor.openInnerEditor(textNode);
        }, 50);
      }

      // Revert tool back to select mode so standard text editor & viewport interactions work
      activeTool.value = "select";
    };

    view.addEventListener("click", clickHandler);
  };

  const disableTextDraw = () => {
    const canvasApp = canvasAppRef.value;
    if (!canvasApp?.view) return;
    const view = canvasApp.view as HTMLElement;

    if (clickHandler) {
      view.removeEventListener("click", clickHandler);
      clickHandler = null;
    }
  };

  return {
    enableTextDraw,
    disableTextDraw,
  };
}
