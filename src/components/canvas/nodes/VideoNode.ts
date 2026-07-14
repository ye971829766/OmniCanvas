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
  private volumeSlider?: HTMLInputElement;
  private volumeWrap?: HTMLElement;
  private fullscreenBtn?: HTMLButtonElement;

  // 进度条拖动相关
  private _isProgressDragging = false;
  private _progressDragRafId: number | null = null;
  private _pendingSeekTime: number | null = null;
  private _latestPointerX = 0;
  private _onDocMouseMove?: (e: MouseEvent) => void;
  private _onDocMouseUp?: () => void;
  private _onDocPointerDown?: (e: globalThis.PointerEvent) => void;
  /** Prefer unmuted after user gesture; still start muted for autoplay policy */
  private _userWantsSound = false;
  private _volumeLevel = 1;
  private _removeLayerTimer: number | null = null;
  private _pointerOverControls = false;
  /** Click-to-play session: stays until outside click or deactivate */
  private _playerActive = false;
  private _pressPoint: { x: number; y: number } | null = null;
  private _ignoreOutsideUntil = 0;
  /** Only one VideoNode player active on the canvas */
  private static _activePlayer: VideoNode | null = null;

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

    // Click (not drag) enters play mode — more reliable than hover
    this.on(PointerEvent.DOWN, (e: any) => {
      const appInstance = (this as any).app;
      if (appInstance?.editor?.dragging) {
        this._pressPoint = null;
        return;
      }
      this._pressPoint = {
        x: Number(e.clientX ?? e.x ?? 0),
        y: Number(e.clientY ?? e.y ?? 0),
      };
    });

    this.on(PointerEvent.UP, (e: any) => {
      if (!this._pressPoint) return;
      const appInstance = (this as any).app;
      if (appInstance?.editor?.dragging) {
        this._pressPoint = null;
        return;
      }
      const x = Number(e.clientX ?? e.x ?? 0);
      const y = Number(e.clientY ?? e.y ?? 0);
      const dist = Math.hypot(x - this._pressPoint.x, y - this._pressPoint.y);
      this._pressPoint = null;
      // Ignore drag-select / move gestures
      if (dist > 8) return;
      void this.activatePlayer();
    });
  }

  private cancelScheduledRemove() {
    if (this._removeLayerTimer !== null) {
      clearTimeout(this._removeLayerTimer);
      this._removeLayerTimer = null;
    }
  }

  /**
   * Only used as a safety net when not in explicit play mode.
   * Active players stay until outside click / deactivatePlayer().
   */
  private scheduleRemoveVideoLayer() {
    if (this._playerActive) return;
    this.cancelScheduledRemove();
    this._removeLayerTimer = window.setTimeout(() => {
      this._removeLayerTimer = null;
      if (this._playerActive) return;
      if (this._pointerOverControls || this._isProgressDragging) return;
      this.removeVideoLayer();
    }, 280);
  }

  /** Enter play mode: create overlay player + controls; close any other active player. */
  async activatePlayer() {
    const appInstance = (this as any).app;
    if (appInstance?.editor?.dragging) return;

    if (VideoNode._activePlayer && VideoNode._activePlayer !== this) {
      VideoNode._activePlayer.deactivatePlayer();
    }
    VideoNode._activePlayer = this;
    this._playerActive = true;
    this._ignoreOutsideUntil = Date.now() + 120;
    this.cancelScheduledRemove();

    await this.createVideoLayer();

    // User gesture: start playback (sound follows preference)
    if (this.videoEl) {
      this.applyVolumeState();
      if (this.videoEl.paused) {
        try {
          await this.videoEl.play();
        } catch {
          this.videoEl.muted = true;
          this._userWantsSound = false;
          this.syncVolumeButton();
          try {
            await this.videoEl.play();
          } catch (err) {
            console.warn("[VideoNode] activate play failed:", err);
          }
        }
      }
      this.syncVolumeButton();
    }

    this.bindOutsideClose();
  }

  /** Exit play mode and tear down HTML video + controls. */
  deactivatePlayer() {
    this._playerActive = false;
    if (VideoNode._activePlayer === this) {
      VideoNode._activePlayer = null;
    }
    this.unbindOutsideClose();
    this.removeVideoLayer();
  }

  private bindOutsideClose() {
    this.unbindOutsideClose();
    this._onDocPointerDown = (e: globalThis.PointerEvent) => {
      if (Date.now() < this._ignoreOutsideUntil) return;
      if (this._isProgressDragging) return;
      // Click started on this VideoNode (Leafer fires DOWN before document bubble)
      if (this._pressPoint) return;
      const target = e.target as Node | null;
      if (target && this.controlsContainer?.contains(target)) return;
      if (target && this.volumeWrap?.contains(target)) return;
      if (
        target &&
        this.videoEl &&
        (target === this.videoEl || this.videoEl.contains(target))
      ) {
        return;
      }
      this.deactivatePlayer();
    };
    // Bubble phase + defer: skip the activating click; allow Leafer DOWN to set _pressPoint first
    setTimeout(() => {
      if (this._onDocPointerDown) {
        document.addEventListener("pointerdown", this._onDocPointerDown, false);
      }
    }, 0);
  }

  private unbindOutsideClose() {
    if (this._onDocPointerDown) {
      document.removeEventListener("pointerdown", this._onDocPointerDown, false);
      this._onDocPointerDown = undefined;
    }
  }

  private applyVolumeState() {
    if (!this.videoEl) return;
    const level = Math.max(0, Math.min(1, this._volumeLevel));
    this.videoEl.volume = level;
    this.videoEl.muted = !this._userWantsSound || level === 0;
    if (this.volumeSlider && this.volumeSlider.value !== String(level)) {
      this.volumeSlider.value = String(level === 0 && this._userWantsSound ? 0 : level);
    }
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
    videoEl.playsInline = true;
    videoEl.preload = "auto";
    videoEl.volume = Math.max(0, Math.min(1, this._volumeLevel));
    // Browsers only allow autoplay when muted; unmute after an explicit user gesture
    videoEl.muted = !this._userWantsSound || this._volumeLevel === 0;
    videoEl.style.position = "absolute";
    videoEl.style.left = "0";
    videoEl.style.top = "0";
    videoEl.style.zIndex = "5";
    videoEl.style.objectFit = "cover";
    videoEl.style.pointerEvents = "none";
    // Allow CORS frames when CDN sends ACAO (needed for some export paths)
    try {
      videoEl.crossOrigin = "anonymous";
    } catch {
      /* ignore */
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
    this._isCreatingVideoLayer = false;
    if (this.videoEl !== videoEl) return;
    this.opacity = 0;

    // Prefer unmuted play if user already opted into sound; fall back to muted autoplay
    const tryPlay = async () => {
      try {
        await videoEl.play();
      } catch (err) {
        if (!videoEl.muted) {
          videoEl.muted = true;
          this._userWantsSound = false;
          this.syncVolumeButton();
          try {
            await videoEl.play();
          } catch (err2) {
            console.warn("[VideoNode] Failed to auto-play video:", err2);
          }
        } else {
          console.warn("[VideoNode] Failed to auto-play video:", err);
        }
      }
    };
    void tryPlay();

    const updatePosition = () => {
      if (!this.videoEl) return;
      const wt = this.worldTransform;
      // Apply full world transform matrix (includes canvas zoom, position, scale, rotation)
      this.videoEl.style.width = `${this.width}px`;
      this.videoEl.style.height = `${this.height}px`;
      this.videoEl.style.transformOrigin = "0 0";
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
    this.cancelScheduledRemove();
    this._isCreatingVideoLayer = false;
    this._pointerOverControls = false;
    this.unbindOutsideClose();

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
      this.volumeSlider = undefined;
      this.volumeWrap = undefined;
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

  // 创建播放器控件：进度条 / 播放 / 全屏 / 时间 / 音量
  createVideoControls() {
    if (!this.videoEl || this.controlsContainer) return;

    const appInstance = (this as any).app;
    const leaferInstance = (this as any).leafer;
    const parent = (appInstance?.view ||
      leaferInstance?.view ||
      document.body) as HTMLElement;

    this.controlsContainer = document.createElement("div");
    this.controlsContainer.style.cssText = [
      "position:absolute",
      "z-index:20",
      "display:flex",
      "align-items:center",
      "gap:8px",
      "padding:8px 10px",
      "background:rgba(0,0,0,0.72)",
      "backdrop-filter:blur(8px)",
      "border-radius:10px",
      "pointer-events:auto",
      "opacity:0",
      "transition:opacity 0.18s ease",
      "box-sizing:border-box",
      "user-select:none",
    ].join(";");

    const btnStyle =
      "background:none;border:none;color:#fff;cursor:pointer;font-size:15px;padding:4px 6px;line-height:1;border-radius:6px;flex-shrink:0;";

    // 播放 / 暂停
    this.playBtn = document.createElement("button");
    this.playBtn.type = "button";
    this.playBtn.innerHTML = "▶";
    this.playBtn.style.cssText = btnStyle;
    this.playBtn.onclick = (e) => {
      e.stopPropagation();
      void this.togglePlay();
    };

    // 进度条：外层加大命中区，内层可视化轨道 + 滑块
    this.progressContainer = document.createElement("div");
    this.progressContainer.style.cssText =
      "flex:1;min-width:72px;height:20px;display:flex;align-items:center;cursor:pointer;position:relative;touch-action:none;";

    const track = document.createElement("div");
    track.style.cssText =
      "position:relative;width:100%;height:6px;background:rgba(255,255,255,0.28);border-radius:99px;overflow:visible;transition:height 0.12s ease;";

    this.progressBar = document.createElement("div");
    this.progressBar.style.cssText =
      "width:0%;height:100%;background:#60a5fa;border-radius:99px;position:relative;";

    const thumb = document.createElement("div");
    thumb.style.cssText =
      "position:absolute;right:-6px;top:50%;width:12px;height:12px;margin-top:-6px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,0.35);opacity:0;transition:opacity 0.12s ease;pointer-events:none;";
    this.progressBar.appendChild(thumb);
    track.appendChild(this.progressBar);
    this.progressContainer.appendChild(track);

    const setTrackActive = (active: boolean) => {
      track.style.height = active ? "8px" : "6px";
      thumb.style.opacity = active ? "1" : "0";
    };
    this.progressContainer.addEventListener("mouseenter", () =>
      setTrackActive(true),
    );
    this.progressContainer.addEventListener("mouseleave", () => {
      if (!this._isProgressDragging) setTrackActive(false);
    });

    this._isProgressDragging = false;
    this._progressDragRafId = null;
    this._pendingSeekTime = null;
    this._latestPointerX = 0;

    const updateProgressUI = (clientX: number) => {
      if (!this.videoEl || !this.progressContainer || !this.progressBar) return;
      const rect = this.progressContainer.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      this.progressBar.style.width = `${ratio * 100}%`;
      const dur = this.videoEl.duration;
      if (!dur || !isFinite(dur)) return;
      const seekTo = ratio * dur;
      this._pendingSeekTime = seekTo;
      // Live scrub: seek during drag for better feedback (browsers handle this fine for short clips)
      try {
        this.videoEl.currentTime = seekTo;
      } catch {
        /* ignore seek errors mid-load */
      }
      if (this.timeDisplay) {
        this.timeDisplay.textContent = `${this.formatTime(seekTo)}/${this.formatTime(dur)}`;
      }
    };

    this._onDocMouseMove = (e: MouseEvent) => {
      if (!this._isProgressDragging) return;
      e.preventDefault();
      e.stopPropagation();
      this._latestPointerX = e.clientX;
      if (this._progressDragRafId === null) {
        this._progressDragRafId = requestAnimationFrame(() => {
          this._progressDragRafId = null;
          updateProgressUI(this._latestPointerX);
        });
      }
    };

    this._onDocMouseUp = () => {
      if (!this._isProgressDragging) return;
      this._isProgressDragging = false;
      setTrackActive(false);
      if (this._progressDragRafId !== null) {
        cancelAnimationFrame(this._progressDragRafId);
        this._progressDragRafId = null;
      }
      updateProgressUI(this._latestPointerX);
      this._pendingSeekTime = null;
    };

    this.progressContainer.addEventListener("pointerdown", (e) => {
      this.cancelScheduledRemove();
      this._isProgressDragging = true;
      this._latestPointerX = e.clientX;
      setTrackActive(true);
      e.preventDefault();
      e.stopPropagation();
      try {
        this.progressContainer!.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      updateProgressUI(e.clientX);
    });
    this.progressContainer.addEventListener("pointermove", (e) => {
      if (!this._isProgressDragging) return;
      e.preventDefault();
      e.stopPropagation();
      this._latestPointerX = e.clientX;
      if (this._progressDragRafId === null) {
        this._progressDragRafId = requestAnimationFrame(() => {
          this._progressDragRafId = null;
          updateProgressUI(this._latestPointerX);
        });
      }
    });
    this.progressContainer.addEventListener("pointerup", (e) => {
      if (!this._isProgressDragging) return;
      e.preventDefault();
      e.stopPropagation();
      this._latestPointerX = e.clientX;
      this._onDocMouseUp?.();
    });
    this.progressContainer.addEventListener("pointercancel", () => {
      this._onDocMouseUp?.();
    });

    document.addEventListener("mousemove", this._onDocMouseMove);
    document.addEventListener("mouseup", this._onDocMouseUp);

    // 时间
    this.timeDisplay = document.createElement("span");
    this.timeDisplay.style.cssText =
      "color:#fff;font-size:12px;white-space:nowrap;min-width:72px;text-align:center;font-variant-numeric:tabular-nums;flex-shrink:0;";
    this.timeDisplay.textContent = "00:00/00:00";

    // 音量：静音按钮 + 滑块
    this.volumeWrap = document.createElement("div");
    this.volumeWrap.style.cssText =
      "display:flex;align-items:center;gap:4px;flex-shrink:0;max-width:120px;";

    this.volumeBtn = document.createElement("button");
    this.volumeBtn.type = "button";
    this.volumeBtn.style.cssText = btnStyle;
    this.volumeBtn.title = "静音 / 开声";
    this.syncVolumeButton();
    this.volumeBtn.onclick = (e) => {
      e.stopPropagation();
      void this.toggleMute();
    };

    this.volumeSlider = document.createElement("input");
    this.volumeSlider.type = "range";
    this.volumeSlider.min = "0";
    this.volumeSlider.max = "1";
    this.volumeSlider.step = "0.01";
    this.volumeSlider.value = String(this._volumeLevel);
    this.volumeSlider.title = "音量";
    this.volumeSlider.style.cssText = [
      "width:64px",
      "height:4px",
      "accent-color:#60a5fa",
      "cursor:pointer",
      "margin:0",
      "padding:0",
      "vertical-align:middle",
    ].join(";");
    this.volumeSlider.addEventListener("pointerdown", (e) => e.stopPropagation());
    this.volumeSlider.addEventListener("input", () => {
      if (!this.videoEl || !this.volumeSlider) return;
      const v = Math.max(0, Math.min(1, Number(this.volumeSlider.value) || 0));
      this._volumeLevel = v;
      this._userWantsSound = v > 0;
      this.videoEl.volume = v;
      this.videoEl.muted = v === 0;
      this.syncVolumeButton();
    });
    this.volumeSlider.addEventListener("change", () => {
      // Unlock audio under user gesture when dragging off mute
      if (this._userWantsSound && this.videoEl && !this.videoEl.paused) {
        void this.videoEl.play().catch(() => undefined);
      }
    });

    this.volumeWrap.appendChild(this.volumeBtn);
    this.volumeWrap.appendChild(this.volumeSlider);

    // 全屏
    this.fullscreenBtn = document.createElement("button");
    this.fullscreenBtn.type = "button";
    this.fullscreenBtn.innerHTML = "⛶";
    this.fullscreenBtn.style.cssText = btnStyle;
    this.fullscreenBtn.onclick = (e) => {
      e.stopPropagation();
      if (!this.videoEl) return;
      if (document.fullscreenElement) {
        void document.exitFullscreen();
      } else {
        this.videoEl.requestFullscreen().catch((err) => {
          console.error(
            `Error attempting to enable full-screen mode: ${err.message} (${err.name})`,
          );
        });
      }
    };

    this.controlsContainer.appendChild(this.playBtn);
    this.controlsContainer.appendChild(this.progressContainer);
    this.controlsContainer.appendChild(this.timeDisplay);
    this.controlsContainer.appendChild(this.volumeWrap);
    this.controlsContainer.appendChild(this.fullscreenBtn);
    parent.appendChild(this.controlsContainer);

    // 控件区域保持活跃；播放模式下不因移出而销毁
    this.controlsContainer.addEventListener("pointerenter", () => {
      this._pointerOverControls = true;
      this.cancelScheduledRemove();
      if (this.controlsContainer) this.controlsContainer.style.opacity = "1";
    });
    this.controlsContainer.addEventListener("pointerleave", () => {
      this._pointerOverControls = false;
      if (!this._playerActive) this.scheduleRemoveVideoLayer();
    });
    this.controlsContainer.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      this.cancelScheduledRemove();
    });
    this.controlsContainer.addEventListener("wheel", (e) => e.stopPropagation(), {
      passive: false,
    });

    const updateTime = () => {
      if (!this.videoEl || !this.progressBar || !this.timeDisplay) return;
      if (this._isProgressDragging) return;
      const dur = this.videoEl.duration;
      const cur = this.videoEl.currentTime;
      this.timeDisplay.textContent = `${this.formatTime(cur)}/${this.formatTime(dur)}`;
      if (dur > 0 && isFinite(dur)) {
        this.progressBar.style.width = `${(cur / dur) * 100}%`;
      }
    };

    this.videoEl.addEventListener("timeupdate", updateTime);
    this.videoEl.addEventListener("loadedmetadata", updateTime);
    this.videoEl.addEventListener("play", () => {
      if (this.playBtn) this.playBtn.innerHTML = "⏸";
    });
    this.videoEl.addEventListener("pause", () => {
      if (this.playBtn) this.playBtn.innerHTML = "▶";
    });

    const updateControlsPosition = () => {
      if (!this.controlsContainer || !this.videoEl) return;

      const wt = this.worldTransform;
      const worldScale = Math.abs(wt.scaleX || 1);
      const elemW = this.width || 1;
      const elemH = this.height || 1;
      const screenW = elemW * worldScale;
      const screenH = elemH * worldScale;

      if (screenW < 60 || screenH < 80 || worldScale < 0.25) {
        this.controlsContainer.style.display = "none";
        return;
      }

      this.controlsContainer.style.display = "flex";

      const baseHeight = 40;
      const baseMargin = 8;
      const basePadding = 6;
      const baseGap = 6;
      const baseFontSize = 15;

      const localOffsetX = baseMargin;
      const localOffsetY = elemH - baseHeight - baseMargin;
      const tx = wt.a * localOffsetX + wt.c * localOffsetY + wt.e;
      const ty = wt.b * localOffsetX + wt.d * localOffsetY + wt.f;

      this.controlsContainer.style.left = "0px";
      this.controlsContainer.style.top = "0px";
      this.controlsContainer.style.transformOrigin = "0 0";
      this.controlsContainer.style.transform = `matrix(${wt.a}, ${wt.b}, ${wt.c}, ${wt.d}, ${tx}, ${ty})`;
      this.controlsContainer.style.width = `${Math.max(80, elemW - baseMargin * 2)}px`;
      this.controlsContainer.style.padding = `${basePadding}px ${basePadding * 1.5}px`;
      this.controlsContainer.style.gap = `${baseGap}px`;

      const minimal = screenW < 140 || worldScale < 0.4;
      if (this.timeDisplay) {
        this.timeDisplay.style.display = minimal ? "none" : "inline-block";
        this.timeDisplay.style.fontSize = `${baseFontSize * 0.8}px`;
      }
      if (this.volumeWrap) {
        this.volumeWrap.style.display = minimal ? "none" : "flex";
      }
      if (this.volumeBtn) {
        this.volumeBtn.style.fontSize = `${baseFontSize}px`;
      }
      if (this.volumeSlider) {
        // Hide slider when very narrow; keep mute button only
        this.volumeSlider.style.display = screenW < 220 ? "none" : "inline-block";
      }
      if (this.fullscreenBtn) {
        this.fullscreenBtn.style.display = minimal ? "none" : "inline-block";
        this.fullscreenBtn.style.fontSize = `${baseFontSize}px`;
      }
      if (this.playBtn) this.playBtn.style.fontSize = `${baseFontSize}px`;
    };

    updateControlsPosition();
    this.on(PropertyEvent.CHANGE, updateControlsPosition);
    if (appInstance?.tree) {
      appInstance.tree.on(MoveEvent.MOVE, updateControlsPosition);
      appInstance.tree.on(ZoomEvent.ZOOM, updateControlsPosition);
    }

    (this as any)._updateControlsPosition = updateControlsPosition;
    (this as any)._updateTime = updateTime;

    setTimeout(() => {
      if (this.controlsContainer) this.controlsContainer.style.opacity = "1";
    }, 40);
  }

  private syncVolumeButton() {
    if (!this.volumeBtn) return;
    const muted = this.videoEl
      ? this.videoEl.muted || this.videoEl.volume === 0 || this._volumeLevel === 0
      : !this._userWantsSound || this._volumeLevel === 0;
    this.volumeBtn.innerHTML = muted ? "🔇" : "🔊";
    if (this.volumeSlider) {
      const shown =
        muted && this._volumeLevel > 0 ? 0 : this._volumeLevel;
      // When muted via button, keep slider at last level but show 0 if fully muted preference
      this.volumeSlider.value = String(
        this.videoEl?.muted ? 0 : this._volumeLevel,
      );
      void shown;
    }
  }

  private async toggleMute() {
    if (!this.videoEl) return;
    if (this.videoEl.muted || this.videoEl.volume === 0 || this._volumeLevel === 0) {
      // Unmute
      if (this._volumeLevel <= 0) this._volumeLevel = 1;
      this._userWantsSound = true;
      this.videoEl.muted = false;
      this.videoEl.volume = this._volumeLevel;
      this.syncVolumeButton();
      try {
        await this.videoEl.play();
      } catch (err) {
        console.warn("[VideoNode] unmute play failed:", err);
      }
    } else {
      // Mute
      this._userWantsSound = false;
      this.videoEl.muted = true;
      this.syncVolumeButton();
    }
  }

  private async togglePlay() {
    if (!this.videoEl) return;
    if (this.videoEl.paused) {
      this.applyVolumeState();
      try {
        await this.videoEl.play();
      } catch (err) {
        // Fall back to muted play if browser still blocks audio
        this.videoEl.muted = true;
        this._userWantsSound = false;
        this.syncVolumeButton();
        try {
          await this.videoEl.play();
        } catch (err2) {
          console.warn("[VideoNode] Play button action failed:", err2);
        }
      }
      this.syncVolumeButton();
    } else {
      this.videoEl.pause();
    }
  }

  /** Whether the HTML video layer is currently playing. */
  public isPlaying(): boolean {
    return Boolean(this.videoEl && !this.videoEl.paused && !this.videoEl.ended);
  }

  /** Context-menu / external: toggle play while keeping the player open. */
  public async playOrPauseFromMenu() {
    if (!this._playerActive || !this.videoEl) {
      await this.activatePlayer();
      return;
    }
    await this.togglePlay();
  }

  private formatTime(seconds: number): string {
    if (!seconds || !isFinite(seconds)) return "00:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
}

registerUI()(VideoNode);
