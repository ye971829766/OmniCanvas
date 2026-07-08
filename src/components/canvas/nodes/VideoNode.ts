import {
  Box,
  PropertyEvent,
  PointerEvent,
  MoveEvent,
  ZoomEvent,
  registerUI,
} from "leafer-ui";

export class VideoNode extends Box {
  public get __tag() {
    return "VideoNode";
  }

  public isSnap = true;

  /**
   * 异步工厂方法：
   * 1. 检测缩略图是否可访问，失败则返回 null
   * 2. 若未指定 width/height，自动从视频元数据中获取原始尺寸
   */
  static async create(data: {
    x: number;
    y: number;
    width?: number;
    height?: number;
    videoUrl?: string;
    thumbnailUrl?: string;
    [key: string]: any;
  }): Promise<VideoNode | null> {
    const tUrl = data.thumbnailUrl || data.thumbnail || "";
    const vUrl = data.videoUrl || data.url || "";

    // 预检缩略图可访问性
    if (tUrl) {
      try {
        const ok = await new Promise<boolean>((resolve) => {
          const img = new Image();
          img.onload = () => resolve(true);
          img.onerror = () => resolve(false);
          img.src = tUrl;
        });
        if (!ok) {
          console.warn("[VideoNode] thumbnail not accessible:", tUrl);
          return null;
        }
      } catch {
        console.warn("[VideoNode] thumbnail load failed:", tUrl);
        return null;
      }
    }

    // 若未指定宽高，从视频元数据自动获取
    if (!data.width || !data.height) {
      const size = await VideoNode.detectVideoSize(vUrl || tUrl);
      if (size) {
        data.width = data.width || size.width;
        data.height = data.height || size.height;
      } else {
        // 兜底默认尺寸
        data.width = data.width || 320;
        data.height = data.height || 180;
      }
    }

    return new VideoNode(data as Required<typeof data>);
  }

  /**
   * 通过加载视频/图片元数据检测原始尺寸
   */
  private static detectVideoSize(url: string): Promise<{ width: number; height: number } | null> {
    if (!url) return Promise.resolve(null);
    return new Promise((resolve) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.muted = true;
      // 允许跨域视频
      video.crossOrigin = "anonymous";
      video.onloadedmetadata = () => {
        const w = video.videoWidth;
        const h = video.videoHeight;
        video.remove();
        resolve(w && h ? { width: w, height: h } : null);
      };
      video.onerror = () => {
        video.remove();
        resolve(null);
      };
      video.src = url;
    });
  }
  public videoEl?: HTMLVideoElement;
  public videoUrl: string;
  public url: string;
  public thumbnailUrl: string;
  public thumbnail: string;
  private _updatePosition?: () => void;
  private _isCreatingVideoLayer = false;

  private controlsContainer?: HTMLElement;
  private playBtn?: HTMLButtonElement;
  private progressContainer?: HTMLDivElement;
  private progressBar?: HTMLDivElement;
  private timeDisplay?: HTMLSpanElement;
  private volumeBtn?: HTMLButtonElement;
  private fullscreenBtn?: HTMLButtonElement;

  // 进度条拖动相关
  private _isProgressDragging = false;
  private _progressDragRafId: number | null = null;
  private _pendingSeekTime: number | null = null;
  private _onDocMouseMove?: (e: MouseEvent) => void;
  private _onDocMouseUp?: () => void;

  constructor(data: {
    x: number;
    y: number;
    width: number;
    height: number;
    videoUrl?: string;
    url?: string;
    thumbnailUrl?: string;
    thumbnail?: string;
    [key: string]: any;
  }) {
    const { videoUrl, url, thumbnailUrl, thumbnail, ...boxData } = data;
    super(boxData);

    const vUrl = videoUrl || url || "";
    const tUrl = thumbnailUrl || thumbnail || "";

    this.videoUrl = vUrl;
    this.url = vUrl;
    this.thumbnailUrl = tUrl;
    this.thumbnail = tUrl;

    // Set background to cover thumbnail image
    this.fill = {
      type: "image",
      url: this.thumbnailUrl,
      mode: "cover",
    };

    // Force opacity to 1 initially since the video layer is not playing/active yet
    this.opacity = 1;

    // Force lockRatio to true since video elements must lock aspect ratio
    this.lockRatio = true;

    // 监听鼠标移入事件 — 拖拽期间不创建视频层，避免误触播放
    this.on(PointerEvent.ENTER, () => {
      const appInstance = (this as any).app;
      const editor = appInstance?.editor;
      if (editor?.dragging) return;
      this.createVideoLayer();
    });

    // 监听鼠标移出
    this.on(PointerEvent.LEAVE, () => {
      console.log("移除");
      this.removeVideoLayer();
    });

    // 监听大小改变事件以重新定位播放控件
    this.on(PropertyEvent.CHANGE, (e: PropertyEvent) => {
      if (e.attrName === "width" || e.attrName === "height") {
      }
    });
  }

  public clone(data?: any): this {
    const cloned = super.clone(data) as any;
    cloned.videoUrl = this.videoUrl;
    cloned.url = this.videoUrl;
    cloned.thumbnailUrl = this.thumbnailUrl;
    cloned.thumbnail = this.thumbnailUrl;
    cloned.fill = {
      type: "image",
      url: this.thumbnailUrl,
      mode: "cover",
    };
    cloned.opacity = 1;
    cloned.lockRatio = true;
    return cloned as this;
  }

  public getLayoutPoints(type?: any, relative?: any): any[] {
    try {
      const points = super.getLayoutPoints(type, relative);
      if (points && points.length > 0) {
        return points;
      }
    } catch (e) {
      // Ignore and fallback
    }

    try {
      const bounds = this.getBounds((type || "box") as any, relative);
      if (bounds) {
        return [
          { x: bounds.x, y: bounds.y },
          { x: bounds.x + bounds.width, y: bounds.y },
          { x: bounds.x, y: bounds.y + bounds.height },
          { x: bounds.x + bounds.width, y: bounds.y + bounds.height }
        ];
      }
    } catch (e) {
      // Ignore and fallback
    }

    // Absolute local coordinate fallback
    const x = this.x ?? 0;
    const y = this.y ?? 0;
    const w = this.width ?? 100;
    const h = this.height ?? 100;
    return [
      { x, y },
      { x: x + w, y },
      { x, y: y + h },
      { x: x + w, y: y + h }
    ];
  }

  async createVideoLayer() {
    if (this.videoEl || this._isCreatingVideoLayer) return;

    this._isCreatingVideoLayer = true;
    const appInstance = (this as any).app;
    const leaferInstance = (this as any).leafer;
    const parent = (appInstance?.view ||
      leaferInstance?.view ||
      document.body) as HTMLElement;

    const videoEl = document.createElement("video");
    this.videoEl = videoEl;
    videoEl.src = this.videoUrl;
    videoEl.loop = true;
    videoEl.style.position = "absolute";
    videoEl.style.left = "0";
    videoEl.style.top = "0";
    videoEl.style.zIndex = "-1";
    videoEl.style.objectFit = "cover";
    videoEl.muted = true;
    await new Promise((resolve) => setTimeout(resolve, 150));
    this._isCreatingVideoLayer = false;
    if (this.videoEl !== videoEl) return;
    this.opacity = 0;
    videoEl.play().catch((err) => {
      console.warn("[VideoNode] Failed to auto-play video:", err);
    });

    // 视频层不接收指针事件，由 Leafer 元素层统一处理鼠标交互
    videoEl.style.pointerEvents = "none";

    const updatePosition = () => {
      if (!this.videoEl) return;
      const wt = this.worldTransform;
      // Apply full world transform matrix (includes canvas zoom, position, scale, rotation)
      this.videoEl.style.width = `${this.width}px`;
      this.videoEl.style.height = `${this.height}px`;
      this.videoEl.style.transformOrigin = '0 0';
      this.videoEl.style.transform = `matrix(${wt.a}, ${wt.b}, ${wt.c}, ${wt.d}, ${wt.e}, ${wt.f})`;
    };

    updatePosition();
    parent.appendChild(videoEl);

    // 监听视图变换，实现视频跟随
    if (appInstance?.tree) {
      appInstance.tree.on(MoveEvent.MOVE, updatePosition);
      appInstance.tree.on(ZoomEvent.ZOOM, updatePosition);
    }
    this.on(PropertyEvent.CHANGE, updatePosition);

    this._updatePosition = updatePosition;

    this.createVideoControls();
  }

  removeVideoLayer() {
    this._isCreatingVideoLayer = false;

    if (this.videoEl) {
      this.videoEl.pause();
      this.videoEl.remove();
      
      const updateTime = (this as any)._updateTime;
      if (updateTime) {
        this.videoEl.removeEventListener("timeupdate", updateTime);
        this.videoEl.removeEventListener("loadedmetadata", updateTime);
      }
      
      this.videoEl = undefined;
    }

    if (this.controlsContainer) {
      // 清除隐藏定时器
      const hideTimeout = (this as any)._controlsHideTimeout;
      if (hideTimeout) {
        clearTimeout(hideTimeout);
        (this as any)._controlsHideTimeout = null;
      }
      
      this.controlsContainer.remove();
      this.controlsContainer = undefined;
      this.playBtn = undefined;
      this.progressContainer = undefined;
      this.progressBar = undefined;
      this.timeDisplay = undefined;
      this.volumeBtn = undefined;
      this.fullscreenBtn = undefined;
    }

    if (this._updatePosition) {
      const appInstance = (this as any).app;
      if (appInstance?.tree) {
        appInstance.tree.off(MoveEvent.MOVE, this._updatePosition);
        appInstance.tree.off(ZoomEvent.ZOOM, this._updatePosition);
      }
      this.off(PropertyEvent.CHANGE, this._updatePosition);
      this._updatePosition = undefined;
    }

    // 清理进度条拖动的 document 监听器
    if (this._onDocMouseMove) {
      document.removeEventListener("mousemove", this._onDocMouseMove);
      this._onDocMouseMove = undefined;
    }
    if (this._onDocMouseUp) {
      document.removeEventListener("mouseup", this._onDocMouseUp);
      this._onDocMouseUp = undefined;
    }
    if (this._progressDragRafId !== null) {
      cancelAnimationFrame(this._progressDragRafId);
      this._progressDragRafId = null;
    }
    this._isProgressDragging = false;
    this._pendingSeekTime = null;
    
    const updateControlsPosition = (this as any)._updateControlsPosition;
    if (updateControlsPosition) {
        const appInstance = (this as any).app;
        if (appInstance?.tree) {
            appInstance.tree.off(MoveEvent.MOVE, updateControlsPosition);
            appInstance.tree.off(ZoomEvent.ZOOM, updateControlsPosition);
        }
        this.off(PropertyEvent.CHANGE, updateControlsPosition);
        (this as any)._updateControlsPosition = undefined;
    }
    
    (this as any)._updateTime = undefined;

    this.opacity = 1;
  }

  // 创建播放器控件  进度条  播放暂停按钮   全屏  时间   音量等，需要适配画布的缩放 元素的尺寸变化 要根据画布的缩放比例进行缩放
  createVideoControls() {
    if (!this.videoEl) return;

    const appInstance = (this as any).app;
    const leaferInstance = (this as any).leafer;
    const parent = (appInstance?.view ||
      leaferInstance?.view ||
      document.body) as HTMLElement;

    // 创建控件容器
    this.controlsContainer = document.createElement("div");
    this.controlsContainer.style.position = "absolute";
    this.controlsContainer.style.zIndex = "10";
    this.controlsContainer.style.display = "flex";
    this.controlsContainer.style.alignItems = "center";
    this.controlsContainer.style.gap = "8px";
    this.controlsContainer.style.padding = "6px 10px";
    this.controlsContainer.style.background = "rgba(0,0,0,0.6)";
    this.controlsContainer.style.borderRadius = "6px";
    this.controlsContainer.style.pointerEvents = "auto";
    this.controlsContainer.style.opacity = "0";
    this.controlsContainer.style.transition = "opacity 0.2s";

    // 按钮通用样式
    const btnStyle =
      "background:none;border:none;color:#fff;cursor:pointer;font-size:16px;padding:2px 4px;line-height:1;";

    // 播放/暂停按钮
    this.playBtn = document.createElement("button");
    this.playBtn.innerHTML = "⏸";
    this.playBtn.style.cssText = btnStyle;
    this.playBtn.onclick = () => {
      if (!this.videoEl) return;
      if (this.videoEl.paused) {
        this.videoEl.play().catch((err) => {
          console.warn("[VideoNode] Play button action failed:", err);
        });
        this.playBtn!.innerHTML = "⏸";
      } else {
        this.videoEl.pause();
        this.playBtn!.innerHTML = "▶";
      }
    };

    // 进度条容器
    this.progressContainer = document.createElement("div");
    this.progressContainer.style.cssText =
      "flex:1;background:rgba(255,255,255,0.3);border-radius:3px;cursor:pointer;min-width:60px;";
    this.progressBar = document.createElement("div");
    this.progressBar.style.cssText =
      "width:0%;height:100%;background:#409eff;border-radius:3px;";
    this.progressContainer.appendChild(this.progressBar);

    // 鼠标悬停时进度条加粗，方便点击
    this.progressContainer.addEventListener("mouseenter", () => {
      if (this.progressContainer) {
        const currentHeight = parseFloat(this.progressContainer.style.height || '6');
        this.progressContainer.style.height = `${currentHeight + 4}px`;
      }
    });
    this.progressContainer.addEventListener("mouseleave", () => {
      if (this.progressContainer && !this._isProgressDragging) {
        // 控件容器已用矩阵变换，子元素用基础像素值即可
        this.progressContainer.style.height = `6px`;
      }
    });

    // 进度条拖动功能 — 使用 rAF 节流 + 批量 seek
    this._isProgressDragging = false;
    this._progressDragRafId = null;
    this._pendingSeekTime = null;

    const updateProgressUI = (clientX: number) => {
      if (!this.videoEl || !this.progressContainer || !this.progressBar) return;
      const rect = this.progressContainer.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      // 只更新 UI 显示，不做 seek
      this.progressBar.style.width = `${ratio * 100}%`;
      const dur = this.videoEl.duration || 0;
      const seekTo = ratio * dur;
      this._pendingSeekTime = seekTo;
      if (this.timeDisplay) {
        this.timeDisplay.textContent = `${this.formatTime(seekTo)}/${this.formatTime(dur)}`;
      }
    };

    const flushSeek = () => {
      if (this._pendingSeekTime !== null && this.videoEl) {
        this.videoEl.currentTime = this._pendingSeekTime;
        this._pendingSeekTime = null;
      }
    };

    this._onDocMouseMove = (e: MouseEvent) => {
      if (!this._isProgressDragging) return;
      e.preventDefault();
      e.stopPropagation();
      // 用 rAF 节流：每帧最多更新一次 UI
      if (this._progressDragRafId === null) {
        this._progressDragRafId = requestAnimationFrame(() => {
          this._progressDragRafId = null;
          updateProgressUI(e.clientX);
        });
      }
    };

    this._onDocMouseUp = () => {
      if (!this._isProgressDragging) return;
      this._isProgressDragging = false;
      // 取消未执行的 rAF
      if (this._progressDragRafId !== null) {
        cancelAnimationFrame(this._progressDragRafId);
        this._progressDragRafId = null;
      }
      // 最终一次性 seek 到目标位置
      flushSeek();
    };

    this.progressContainer.onmousedown = (e) => {
      this._isProgressDragging = true;
      e.preventDefault();
      e.stopPropagation();
      updateProgressUI(e.clientX);
    };

    document.addEventListener("mousemove", this._onDocMouseMove);
    document.addEventListener("mouseup", this._onDocMouseUp);

    // 时间显示
    this.timeDisplay = document.createElement("span");
    this.timeDisplay.style.cssText =
      "color:#fff;font-size:13px;white-space:nowrap;min-width:60px;text-align:center;";
    this.timeDisplay.textContent = "00:00/00:00";

    // 音量按钮
    this.volumeBtn = document.createElement("button");
    this.volumeBtn.innerHTML = "🔇";
    this.volumeBtn.style.cssText = btnStyle;
    this.volumeBtn.onclick = () => {
      if (!this.videoEl) return;
      this.videoEl.muted = !this.videoEl.muted;
      this.volumeBtn!.innerHTML = this.videoEl.muted ? "🔇" : "🔊";
    };

    // 全屏按钮
    this.fullscreenBtn = document.createElement("button");
    this.fullscreenBtn.innerHTML = "⛶";
    this.fullscreenBtn.style.cssText = btnStyle;
    this.fullscreenBtn.onclick = () => {
      if (!this.videoEl) return;
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        this.videoEl.requestFullscreen().catch(err => {
          console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
        });
      }
    };

    // 组装控件
    this.controlsContainer.appendChild(this.playBtn);
    this.controlsContainer.appendChild(this.progressContainer);
    this.controlsContainer.appendChild(this.timeDisplay);
    this.controlsContainer.appendChild(this.volumeBtn);
    this.controlsContainer.appendChild(this.fullscreenBtn);

    parent.appendChild(this.controlsContainer);

    // 阻止控件上的所有指针事件冒泡到画布
    this.controlsContainer.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
    });
    this.controlsContainer.addEventListener("pointermove", (e) => {
      e.stopPropagation();
    });
    this.controlsContainer.addEventListener("pointerup", (e) => {
      e.stopPropagation();
    });

    // 控制器显示/隐藏逻辑
    this.controlsContainer.addEventListener("mouseenter", () => {
      if (this.controlsContainer) this.controlsContainer.style.opacity = "1";
      // 清除隐藏定时器
      const hideTimeout = (this as any)._controlsHideTimeout;
      if (hideTimeout) {
        clearTimeout(hideTimeout);
        (this as any)._controlsHideTimeout = null;
      }
    });

    this.controlsContainer.addEventListener("mouseleave", () => {
      this.scheduleHideControls();
    });

    // 鼠标移入时保持常驻显示
    let hideTimeout: number | null = null;
    let isMouseOverControls = false;
    
    const showControls = () => {
      isMouseOverControls = true;
      if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
      }
      if (this.controlsContainer) {
        this.controlsContainer.style.opacity = "1";
      }
    };

    const scheduleHide = () => {
      isMouseOverControls = false;
      if (hideTimeout) clearTimeout(hideTimeout);
      hideTimeout = window.setTimeout(() => {
        if (!isMouseOverControls && this.controlsContainer) {
          this.controlsContainer.style.opacity = "0";
        }
      }, 800);
    };

    // 监听视频元素和控件的鼠标事件
    this.controlsContainer.addEventListener("mouseenter", showControls);
    this.controlsContainer.addEventListener("mouseleave", scheduleHide);

    // 同时监听整个容器的 mouseleave
    this.on(PointerEvent.LEAVE, () => {
      // 如果鼠标离开了整个视频节点，立即隐藏控制器
      if (hideTimeout) clearTimeout(hideTimeout);
      if (this.controlsContainer) {
        this.controlsContainer.style.opacity = "0";
      }
    });

    // 视频事件监听 - 拖动过程中跳过自动更新
    const updateTime = () => {
      if (!this.videoEl) return;
      if (this._isProgressDragging) return;
      
      const cur = this.formatTime(this.videoEl.currentTime);
      const dur = this.formatTime(this.videoEl.duration);
      this.timeDisplay!.textContent = `${cur}/${dur}`;
      const pct = (this.videoEl.currentTime / this.videoEl.duration) * 100;
      this.progressBar!.style.width = `${pct}%`;
    };

    this.videoEl.addEventListener("timeupdate", updateTime);
    this.videoEl.addEventListener("loadedmetadata", updateTime);
    
    // 监听播放状态改变图标
    this.videoEl.addEventListener("play", () => {
        if(this.playBtn) this.playBtn.innerHTML = "⏸";
    });
    this.videoEl.addEventListener("pause", () => {
        if(this.playBtn) this.playBtn.innerHTML = "▶";
    });

    // 定位控件 - 根据画布缩放、元素尺寸和旋转动态调整
    const updateControlsPosition = () => {
      if (!this.controlsContainer || !this.videoEl) return;
      
      const wt = this.worldTransform;
      const worldScale = Math.abs(wt.scaleX || 1);
      const elemW = this.width || 1;
      const elemH = this.height || 1;
      
      // 屏幕空间中的元素尺寸（用于可见性判断）
      const screenW = elemW * worldScale;
      const screenH = elemH * worldScale;
      
      // 最小可用尺寸阈值
      if (screenW < 60 || screenH < 80 || worldScale < 0.25) {
        this.controlsContainer.style.display = 'none';
        return;
      }
      
      // 显示控件
      this.controlsContainer.style.display = 'flex';
      
      // 基础控件尺寸（未缩放，矩阵变换会自动缩放）
      const baseHeight = 36;
      const baseMargin = 6;
      const basePadding = 6;
      const baseGap = 8;
      const baseFontSize = 16;
      const baseProgressHeight = 6;
      const baseProgressMinWidth = 60;
      
      // 将控件本地偏移编码进世界变换矩阵（支持旋转）
      const localOffsetX = baseMargin;
      const localOffsetY = elemH - baseHeight - baseMargin;
      
      // 计算偏移经过旋转/缩放后的世界坐标
      const tx = wt.a * localOffsetX + wt.c * localOffsetY + wt.e;
      const ty = wt.b * localOffsetX + wt.d * localOffsetY + wt.f;
      
      this.controlsContainer.style.left = '0px';
      this.controlsContainer.style.top = '0px';
      this.controlsContainer.style.transformOrigin = '0 0';
      this.controlsContainer.style.transform = `matrix(${wt.a}, ${wt.b}, ${wt.c}, ${wt.d}, ${tx}, ${ty})`;
      this.controlsContainer.style.width = `${Math.max(60, elemW - baseMargin * 2)}px`;
      this.controlsContainer.style.padding = `${basePadding}px ${basePadding * 2}px`;
      this.controlsContainer.style.gap = `${baseGap}px`;
      
      // 当视频元素较小时，隐藏非核心控件
      const shouldShowMinimalControls = screenW < 100 || worldScale < 0.4;
      
      if (this.timeDisplay) {
        this.timeDisplay.style.display = shouldShowMinimalControls ? 'none' : 'inline-block';
        this.timeDisplay.style.fontSize = `${baseFontSize * 0.85}px`;
      }
      if (this.volumeBtn) {
        this.volumeBtn.style.display = shouldShowMinimalControls ? 'none' : 'inline-block';
        this.volumeBtn.style.fontSize = `${baseFontSize}px`;
      }
      if (this.fullscreenBtn) {
        this.fullscreenBtn.style.display = shouldShowMinimalControls ? 'none' : 'inline-block';
        this.fullscreenBtn.style.fontSize = `${baseFontSize}px`;
      }
      if (this.playBtn) this.playBtn.style.fontSize = `${baseFontSize}px`;
      
      if (this.progressContainer) {
        this.progressContainer.style.height = `${baseProgressHeight}px`;
        this.progressContainer.style.minWidth = `${baseProgressMinWidth}px`;
      }
    };

    updateControlsPosition();
    
    // 监听属性变化以更新位置
    this.on(PropertyEvent.CHANGE, updateControlsPosition);
    
    // 监听画布变换
    if (appInstance?.tree) {
      appInstance.tree.on(MoveEvent.MOVE, updateControlsPosition);
      appInstance.tree.on(ZoomEvent.ZOOM, updateControlsPosition);
    }

    // 保存清理函数引用，以便在 removeVideoLayer 中正确移除
    (this as any)._updateControlsPosition = updateControlsPosition;
    (this as any)._updateTime = updateTime;

    // 显示控件
    setTimeout(() => {
      if (this.controlsContainer) this.controlsContainer.style.opacity = "1";
    }, 50);
  }

  /**
   * 计划隐藏控制器
   */
  private scheduleHideControls() {
    // 清除现有的定时器
    const existingTimeout = (this as any)._controlsHideTimeout;
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // 设置新的隐藏定时器
    (this as any)._controlsHideTimeout = window.setTimeout(() => {
      if (this.controlsContainer) {
        this.controlsContainer.style.opacity = "0";
      }
    }, 800);
  }

  private formatTime(seconds: number): string {
    if (!seconds || !isFinite(seconds)) return "00:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
}

registerUI()(VideoNode);
