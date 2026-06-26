import { ref, type Ref } from "vue";
import { Group, Rect, DragEvent, MoveEvent, ZoomEvent } from "leafer-ui";
import { uploadImage } from "@/utils/api";

export function useCanvasCrop(
  canvasApp: Ref<any>,
  selectTarget: Ref<any>,
  recordHistoryDebounced: () => void,
  toast: any
) {
  const isCropping = ref(false);
  const cropRatio = ref("free");
  const cropToolbarStyle = ref({ left: "0px", top: "0px" });

  let cropGroup: Group | null = null;
  let imageNode: any = null;

  // Crop box local coordinates (within image dimensions)
  let cx = 0;
  let cy = 0;
  let cw = 0;
  let ch = 0;

  // UI Nodes
  let topDim: Rect;
  let bottomDim: Rect;
  let leftDim: Rect;
  let rightDim: Rect;
  let cropBorder: Rect;
  
  let nwHandle: Rect;
  let nHandle: Rect;
  let neHandle: Rect;
  let eHandle: Rect;
  let seHandle: Rect;
  let sHandle: Rect;
  let swHandle: Rect;
  let wHandle: Rect;

  const ratios = [
    { label: "自由比例", value: "free" },
    { label: "1:1 正方形", value: "1" },
    { label: "16:9 宽屏", value: "1.7777777777777777" },
    { label: "4:3 标清", value: "1.3333333333333333" },
    { label: "3:2 画幅", value: "1.5" }
  ];

  const updateCropToolbarPosition = () => {
    if (!cropBorder || !isCropping.value) return;
    const bounds = cropBorder.worldBoxBounds;
    if (!bounds) return;
    
    // Position toolbar 45px above crop box
    const top = bounds.y - 45;
    const left = bounds.x + bounds.width / 2;
    cropToolbarStyle.value = {
      left: `${left}px`,
      top: `${top}px`
    };
  };

  const updateCropUI = () => {
    if (!imageNode || !cropGroup) return;
    const W = imageNode.width;
    const H = imageNode.height;

    // Overlays
    topDim.set({ x: 0, y: 0, width: W, height: cy });
    bottomDim.set({ x: 0, y: cy + ch, width: W, height: H - (cy + ch) });
    leftDim.set({ x: 0, y: cy, width: cx, height: ch });
    rightDim.set({ x: cx + cw, y: cy, width: W - (cx + cw), height: ch });

    // Border
    cropBorder.set({ x: cx, y: cy, width: cw, height: ch });

    // Handles
    const size = 12;
    const half = size / 2;

    nwHandle.set({ x: cx - half, y: cy - half });
    nHandle.set({ x: cx + cw / 2 - half, y: cy - half });
    neHandle.set({ x: cx + cw - half, y: cy - half });
    eHandle.set({ x: cx + cw - half, y: cy + ch / 2 - half });
    seHandle.set({ x: cx + cw - half, y: cy + ch - half });
    sHandle.set({ x: cx + cw / 2 - half, y: cy + ch - half });
    swHandle.set({ x: cx - half, y: cy + ch - half });
    wHandle.set({ x: cx - half, y: cy + ch / 2 - half });

    // Toggle handles visibility based on ratio lock
    const isFree = cropRatio.value === "free";
    nHandle.visible = isFree;
    sHandle.visible = isFree;
    eHandle.visible = isFree;
    wHandle.visible = isFree;

    updateCropToolbarPosition();
  };

  // Drag handler registration helper
  const registerDrag = (
    handle: Rect,
    onDrag: (
      dx: number,
      dy: number,
      startLocalPos: { x: number; y: number },
      startBox: { cx: number; cy: number; cw: number; ch: number }
    ) => void
  ) => {
    let startLocalPos = { x: 0, y: 0 };
    let startBox = { cx: 0, cy: 0, cw: 0, ch: 0 };

    handle.on(DragEvent.START, (e) => {
      const local = { x: e.x, y: e.y };
      cropGroup!.worldToLocal(local);
      startLocalPos = { x: local.x, y: local.y };
      startBox = { cx, cy, cw, ch };
    });

    handle.on(DragEvent.DRAG, (e) => {
      const local = { x: e.x, y: e.y };
      cropGroup!.worldToLocal(local);
      const dx = local.x - startLocalPos.x;
      const dy = local.y - startLocalPos.y;
      onDrag(dx, dy, startLocalPos, startBox);
      updateCropUI();
    });
  };

  const startCanvasCrop = () => {
    const app = canvasApp.value;
    const target = selectTarget.value;
    if (!app || !target || target.tag !== "Image") return;

    imageNode = target;
    isCropping.value = true;
    cropRatio.value = "free";

    // Disable default editor
    app.editor.cancel();
    app.editor.hittable = false;

    // Define initial crop box size (80% of image size, centered)
    cw = imageNode.width * 0.8;
    ch = imageNode.height * 0.8;
    cx = (imageNode.width - cw) / 2;
    cy = (imageNode.height - ch) / 2;

    // Create Group container overlay sharing same dimensions & transforms as image
    cropGroup = new Group({
      x: imageNode.x,
      y: imageNode.y,
      width: imageNode.width,
      height: imageNode.height,
      scaleX: imageNode.scaleX,
      scaleY: imageNode.scaleY,
      rotation: imageNode.rotation,
      skewX: imageNode.skewX,
      skewY: imageNode.skewY,
      zIndex: 99999
    });
    // Explicitly set flags to bypass history tracking and state persistence
    Object.defineProperty(cropGroup, "__tag", {
      value: "SimulateElement",
      writable: true,
      configurable: true,
      enumerable: true
    });
    Object.defineProperty(cropGroup, "tag", {
      value: "SimulateElement",
      writable: true,
      configurable: true,
      enumerable: true
    });
    (cropGroup as any).isCropOverlay = true;

    // Create overlay elements
    topDim = new Rect({ fill: "rgba(0,0,0,0.6)" });
    bottomDim = new Rect({ fill: "rgba(0,0,0,0.6)" });
    leftDim = new Rect({ fill: "rgba(0,0,0,0.6)" });
    rightDim = new Rect({ fill: "rgba(0,0,0,0.6)" });

    cropBorder = new Rect({
      stroke: "#10b981",
      strokeWidth: 2.5,
      fill: "rgba(255,255,255,0.01)",
      cursor: "move",
      draggable: true
    });

    const createHandle = (cursorStyle: string) => {
      return new Rect({
        width: 12,
        height: 12,
        fill: "#ffffff",
        stroke: "#10b981",
        strokeWidth: 2,
        cornerRadius: 2,
        cursor: cursorStyle,
        draggable: true
      });
    };

    nwHandle = createHandle("nwse-resize");
    nHandle = createHandle("ns-resize");
    neHandle = createHandle("nesw-resize");
    eHandle = createHandle("ew-resize");
    seHandle = createHandle("nwse-resize");
    sHandle = createHandle("ns-resize");
    swHandle = createHandle("nesw-resize");
    wHandle = createHandle("ew-resize");

    // Add elements to group
    cropGroup.add(topDim);
    cropGroup.add(bottomDim);
    cropGroup.add(leftDim);
    cropGroup.add(rightDim);
    cropGroup.add(cropBorder);
    cropGroup.add(nwHandle);
    cropGroup.add(nHandle);
    cropGroup.add(neHandle);
    cropGroup.add(eHandle);
    cropGroup.add(seHandle);
    cropGroup.add(sHandle);
    cropGroup.add(swHandle);
    cropGroup.add(wHandle);

    // Add crop group to parent of image
    imageNode.parent.add(cropGroup);

    // Setup drag logic for crop border (moves entire crop frame)
    registerDrag(cropBorder, (dx, dy, _, start) => {
      let newX = start.cx + dx;
      let newY = start.cy + dy;
      newX = Math.max(0, Math.min(newX, imageNode.width - cw));
      newY = Math.max(0, Math.min(newY, imageNode.height - ch));
      cx = newX;
      cy = newY;
    });

    // Setup drag logic for corners and edges
    const minSize = 25;

    registerDrag(seHandle, (dx, dy, _, start) => {
      if (cropRatio.value !== "free") {
        const ratio = Number(cropRatio.value);
        let newW = Math.max(minSize, start.cw + dx);
        newW = Math.min(newW, imageNode.width - start.cx);
        let newH = newW / ratio;
        if (start.cy + newH > imageNode.height) {
          newH = imageNode.height - start.cy;
          newW = newH * ratio;
        }
        cw = newW;
        ch = newH;
      } else {
        cw = Math.max(minSize, Math.min(start.cw + dx, imageNode.width - start.cx));
        ch = Math.max(minSize, Math.min(start.ch + dy, imageNode.height - start.cy));
      }
    });

    registerDrag(nwHandle, (dx, dy, _, start) => {
      if (cropRatio.value !== "free") {
        const ratio = Number(cropRatio.value);
        let newW = Math.max(minSize, start.cw - dx);
        let proposedX = start.cx + (start.cw - newW);
        if (proposedX < 0) {
          proposedX = 0;
          newW = start.cx + start.cw;
        }
        let newH = newW / ratio;
        let proposedY = start.cy + (start.ch - newH);
        if (proposedY < 0) {
          proposedY = 0;
          newH = start.cy + start.ch;
          newW = newH * ratio;
          proposedX = start.cx + (start.cw - newW);
        }
        cx = proposedX;
        cy = proposedY;
        cw = newW;
        ch = newH;
      } else {
        let newW = Math.max(minSize, start.cw - dx);
        let proposedX = start.cx + (start.cw - newW);
        if (proposedX < 0) {
          proposedX = 0;
          newW = start.cx + start.cw;
        }
        let newH = Math.max(minSize, start.ch - dy);
        let proposedY = start.cy + (start.ch - newH);
        if (proposedY < 0) {
          proposedY = 0;
          newH = start.cy + start.ch;
        }
        cx = proposedX;
        cy = proposedY;
        cw = newW;
        ch = newH;
      }
    });

    registerDrag(neHandle, (dx, dy, _, start) => {
      if (cropRatio.value !== "free") {
        const ratio = Number(cropRatio.value);
        let newW = Math.max(minSize, start.cw + dx);
        newW = Math.min(newW, imageNode.width - start.cx);
        let newH = newW / ratio;
        let proposedY = start.cy + (start.ch - newH);
        if (proposedY < 0) {
          proposedY = 0;
          newH = start.cy + start.ch;
          newW = newH * ratio;
        }
        cy = proposedY;
        cw = newW;
        ch = newH;
      } else {
        cw = Math.max(minSize, Math.min(start.cw + dx, imageNode.width - start.cx));
        let newH = Math.max(minSize, start.ch - dy);
        let proposedY = start.cy + (start.ch - newH);
        if (proposedY < 0) {
          proposedY = 0;
          newH = start.cy + start.ch;
        }
        cy = proposedY;
        ch = newH;
      }
    });

    registerDrag(swHandle, (dx, dy, _, start) => {
      if (cropRatio.value !== "free") {
        const ratio = Number(cropRatio.value);
        let newW = Math.max(minSize, start.cw - dx);
        let proposedX = start.cx + (start.cw - newW);
        if (proposedX < 0) {
          proposedX = 0;
          newW = start.cx + start.cw;
        }
        let newH = newW / ratio;
        if (start.cy + newH > imageNode.height) {
          newH = imageNode.height - start.cy;
          newW = newH * ratio;
          proposedX = start.cx + (start.cw - newW);
        }
        cx = proposedX;
        cw = newW;
        ch = newH;
      } else {
        let newW = Math.max(minSize, start.cw - dx);
        let proposedX = start.cx + (start.cw - newW);
        if (proposedX < 0) {
          proposedX = 0;
          newW = start.cx + start.cw;
        }
        cx = proposedX;
        cw = newW;
        ch = Math.max(minSize, Math.min(start.ch + dy, imageNode.height - start.cy));
      }
    });

    registerDrag(nHandle, (_, dy, __, start) => {
      let newH = Math.max(minSize, start.ch - dy);
      let proposedY = start.cy + (start.ch - newH);
      if (proposedY < 0) {
        proposedY = 0;
        newH = start.cy + start.ch;
      }
      cy = proposedY;
      ch = newH;
    });

    registerDrag(sHandle, (_, dy, __, start) => {
      ch = Math.max(minSize, Math.min(start.ch + dy, imageNode.height - start.cy));
    });

    registerDrag(eHandle, (dx, _, __, start) => {
      cw = Math.max(minSize, Math.min(start.cw + dx, imageNode.width - start.cx));
    });

    registerDrag(wHandle, (dx, _, __, start) => {
      let newW = Math.max(minSize, start.cw - dx);
      let proposedX = start.cx + (start.cw - newW);
      if (proposedX < 0) {
        proposedX = 0;
        newW = start.cx + start.cw;
      }
      cx = proposedX;
      cw = newW;
    });

    // Listen to move/zoom/pan events on the canvas to update floating toolbar position dynamically
    app.tree.on(MoveEvent.MOVE, updateCropToolbarPosition);
    app.tree.on(ZoomEvent.ZOOM, updateCropToolbarPosition);

    updateCropUI();
  };

  const applyRatioPreset = () => {
    if (!imageNode || cropRatio.value === "free") {
      updateCropUI();
      return;
    }
    const ratio = Number(cropRatio.value);
    const w = imageNode.width;
    const h = imageNode.height;

    const midX = cx + cw / 2;
    const midY = cy + ch / 2;

    let newW = cw;
    let newH = newW / ratio;

    if (newH > h) {
      newH = h * 0.8;
      newW = newH * ratio;
    }
    if (newW > w) {
      newW = w * 0.8;
      newH = newW / ratio;
    }

    let newX = midX - newW / 2;
    let newY = midY - newH / 2;

    if (newX < 0) newX = 0;
    if (newY < 0) newY = 0;
    if (newX + newW > w) newX = w - newW;
    if (newY + newH > h) newY = h - newH;

    cx = newX;
    cy = newY;
    cw = newW;
    ch = newH;
    updateCropUI();
  };

  const cleanup = () => {
    const app = canvasApp.value;
    if (app) {
      app.editor.hittable = true;
      app.tree.off(MoveEvent.MOVE, updateCropToolbarPosition);
      app.tree.off(ZoomEvent.ZOOM, updateCropToolbarPosition);
    }
    if (cropGroup) {
      cropGroup.destroy();
      cropGroup = null;
    }
    isCropping.value = false;
  };

  const cancelCanvasCrop = () => {
    const app = canvasApp.value;
    const target = imageNode;
    cleanup();
    if (app && app.editor && target) {
      app.editor.select(target);
    }
  };

  const confirmCanvasCrop = async () => {
    if (cw <= 0 || ch <= 0 || !imageNode) return;
    
    // Save references before cleaning up overlay
    const target = imageNode;
    const app = canvasApp.value;
    
    const imgObj = new Image();
    imgObj.crossOrigin = "anonymous";
    imgObj.src = target.url;

    // Get cropping coordinates
    const finalCx = cx;
    const finalCy = cy;
    const finalCw = cw;
    const finalCh = ch;

    cleanup();

    toast.add({
      severity: "info",
      summary: "正在处理",
      detail: "正在应用裁剪并上传图片...",
      life: 2000
    });

    try {
      await new Promise<void>((resolve, reject) => {
        imgObj.onload = () => resolve();
        imgObj.onerror = reject;
      });

      const originalWidth = imgObj.naturalWidth;
      const originalHeight = imgObj.naturalHeight;

      // Scale factors from original pixels to canvas width/height
      const scaleX = target.width / originalWidth;
      const scaleY = target.height / originalHeight;

      // Crop coordinates in pixel space
      const origCropX = finalCx / scaleX;
      const origCropY = finalCy / scaleY;
      const origCropW = finalCw / scaleX;
      const origCropH = finalCh / scaleY;

      const canvas = document.createElement("canvas");
      canvas.width = origCropW;
      canvas.height = origCropH;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("无法创建 2D 绘图上下文");

      ctx.drawImage(imgObj, origCropX, origCropY, origCropW, origCropH, 0, 0, origCropW, origCropH);

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), "image/png");
      });
      if (!blob) throw new Error("图片导出 Blob 失败");

      const file = new File([blob], `cropped_${Date.now()}.png`, { type: "image/png" });
      const response = await uploadImage(file);

      // Convert inner space offset (relative to target's top-left) to parent coordinates using innerToWorld
      const point = { x: finalCx, y: finalCy };
      const parentPoint = { x: 0, y: 0 };
      target.innerToWorld(point, parentPoint, false, target.parent);

      target.set({
        x: parentPoint.x,
        y: parentPoint.y,
        width: finalCw,
        height: finalCh,
        url: response.imageUrl
      });

      recordHistoryDebounced();

      if (app && app.editor) {
        app.editor.cancel();
        setTimeout(() => {
          app.editor.select(target);
        }, 50);
      }

      toast.add({
        severity: "success",
        summary: "裁剪成功",
        detail: "图片裁剪已应用到画布",
        life: 3000
      });
    } catch (error: any) {
      console.error("图片裁剪失败:", error);
      toast.add({
        severity: "error",
        summary: "裁剪失败",
        detail: error.message || "裁剪图片时出错，请重试。",
        life: 4000
      });
      if (app && app.editor) {
        app.editor.select(target);
      }
    }
  };

  return {
    isCropping,
    cropRatio,
    cropToolbarStyle,
    ratios,
    startCanvasCrop,
    confirmCanvasCrop,
    cancelCanvasCrop,
    applyRatioPreset
  };
}
