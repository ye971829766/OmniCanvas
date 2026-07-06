import {
  Box,
  registerUI,
  type IBoxInputData,
  Rect,
  Text,
  Ellipse,
  Polygon,
  PropertyEvent,
} from "leafer-ui";

export class ImageGen extends Box {
  public get __tag() {
    return "ImageGen";
  }
  public isSnap = true;

  // Custom properties backing fields
  private _prompt!: string;
  private _model!: string;
  private _size!: string;
  private _quality!: string;
  private _aspectRatio!: string;
  private _generationStatus!: "idle" | "generating" | "success" | "error";
  private _errorMessage!: string;
  private _taskId!: string;
  private _images!: string[];

  public get images() { return this._images; }
  public set images(val: string[]) {
    if (this._images !== val) {
      this._images = val;
      this.updateVisuals();
    }
  }

  public get prompt() { return this._prompt; }
  public set prompt(val: string) {
    if (this._prompt !== val) {
      this._prompt = val;
      this.updateVisuals();
    }
  }

  public get model() { return this._model; }
  public set model(val: string) {
    if (this._model !== val) {
      this._model = val;
      this.updateVisuals();
    }
  }

  public get size() { return this._size; }
  public set size(val: string) {
    if (this._size !== val) {
      this._size = val;
      this.updateVisuals();
    }
  }

  public get quality() { return this._quality; }
  public set quality(val: string) {
    if (this._quality !== val) {
      this._quality = val;
      this.updateVisuals();
    }
  }

  public get aspectRatio() { return this._aspectRatio; }
  public set aspectRatio(val: string) {
    if (this._aspectRatio !== val) {
      this._aspectRatio = val;
      this.updateVisuals();
    }
  }

  public get generationStatus() { return this._generationStatus; }
  public set generationStatus(val: "idle" | "generating" | "success" | "error") {
    if (this._generationStatus !== val) {
      this._generationStatus = val;
      this.updateVisuals();
    }
  }

  public get errorMessage() { return this._errorMessage; }
  public set errorMessage(val: string) {
    if (this._errorMessage !== val) {
      this._errorMessage = val;
      this.updateVisuals();
    }
  }

  public get taskId() { return this._taskId; }
  public set taskId(val: string) {
    if (this._taskId !== val) {
      this._taskId = val;
      this.updateVisuals();
    }
  }


  constructor(
    data: IBoxInputData & {
      prompt?: string;
      model?: string;
      size?: string;
      quality?: string;
      aspectRatio?: string;
      generationStatus?: "idle" | "generating" | "success" | "error";
      errorMessage?: string;
      taskId?: string;
      images?: string[];
    },
  ) {
    super(data);
    this._prompt = data.prompt || "";
    this._model = data.model || "gpt-image-2";
    this._size = data.size || "1024x1024";
    this._quality = data.quality || "standard";
    this._aspectRatio = data.aspectRatio || "1:1";
    this._generationStatus = data.generationStatus || "idle";
    this._errorMessage = data.errorMessage || "";
    this._taskId = data.taskId || "";
    this._images = data.images || [];
    
    this.editable = true;
    this.widthRange = {
      min: 160,
    };
    this.heightRange = {
      min: 160,
    };

    // Listen to built-in dimension changes to update placeholder sizes
    this.on(PropertyEvent.CHANGE, (e: PropertyEvent) => {
      const triggerAttrs = ["width", "height"];
      if (triggerAttrs.includes(e.attrName || "")) {
        this.updateVisuals();
      }
    });

    this.updateVisuals();
  }

  private _isUpdatingVisuals = false;

  public updateVisuals() {
    if (this._isUpdatingVisuals) return;
    this._isUpdatingVisuals = true;

    try {
      // Clear all children first to prevent stale placeholder groups or duplicate elements
      this.clear();

      if (this.generationStatus === "success") {
        // If image has generated, no placeholder is drawn
        return;
      }

      // Create overlay placeholder group
      const group = new Box({
        width: this.width,
        height: this.height,
        hittable: true,
        overflow: "hide",
      });

    const w = this.width ?? 400;
    const h = this.height ?? 300;

    // Background card shape (soft blue background, matching reference)
    const bg = new Rect({
      width: w,
      height: h,
      fill: "#e2e8f0", // sky-100 / soft blue
      cornerRadius: 12,
      
    });
    group.add(bg);

    // Vector Picture Icon Group in the center (without any border frame, matching reference)
    const iconWidth = 140;
    const iconHeight = 100;

    // Shift up slightly if there is text below (generating / error states)
    const hasText =
      this.generationStatus === "generating" ||
      this.generationStatus === "error";
    const iconY = hasText
      ? h / 2 - iconHeight / 2 - 20
      : h / 2 - iconHeight / 2;

    const iconGroup = new Box({
      x: w / 2 - iconWidth / 2,
      y: iconY,
      width: iconWidth,
      height: iconHeight,
      hittable: false,
    });

    // 1. Sun (Circle/Ellipse)
    const iconSun = new Ellipse({
      x: 95,
      y: 20,
      width: 24,
      height: 24,
      fill: "#ffffff", // sky-200 / light blue
    });
    iconGroup.add(iconSun);

    // 2. Mountain 1 (Large)
    const mountain1 = new Polygon({
      points: [15, 85, 65, 35, 100, 85],
      fill: "#ffffff",
    });
    iconGroup.add(mountain1);

    // 3. Mountain 2 (Small)
    const mountain2 = new Polygon({
      points: [60, 85, 95, 55, 125, 85],
      fill: "#ffffff",
    });
    iconGroup.add(mountain2);

    group.add(iconGroup);

    // Loading state
    if (this.generationStatus === "generating") {
      const loadingText = new Text({
        x: w / 2,
        y: h / 2 + 45,
        text: this.prompt,
        fontSize: 14,
        fontWeight: "bold",
        fill: "#00000050", // sky-500
        textAlign: "center",
        verticalAlign: 'middle',
      });

      const loadingRect = new Rect({
        x:-w,
        width: w,
        height: h,
        // fill:'red',
        fill: {
        type: 'linear', // 水平线性渐变（从左到右）
        from: { type: 'percent', x: 0, y: 0.5 }, // 起点：左侧中间
        to: { type: 'percent', x: 1, y: 0.5 },   // 终点：右侧中间
        stops: ['rgba(255,255,255,0)', 'rgba(255,255,255,0.6)', 'rgba(255,255,255,0)']
      },
      });
      group.add(loadingRect);
      group.add(loadingText);
      group.remove(iconGroup);
      loadingRect.animate({
        x:w
      }, {
        duration: 1.2,
        loop:true
      });
    }
    // Error state
    else if (this.generationStatus === "error") {
      const errorTitle = new Text({
        x: w / 2,
        y: h / 2 + 40,
        text: "生成失败",
        fontSize: 14,
        fontWeight: "bold",
        fill: "#ef4444",
        textAlign: "center",
        verticalAlign: "middle",
      });
      group.add(errorTitle);
    }

    this.add(group);
    } finally {
      this._isUpdatingVisuals = false;
    }
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
          { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
        ];
      }
    } catch (e) {
      // Ignore and fallback
    }

    const x = this.x ?? 0;
    const y = this.y ?? 0;
    const w = this.width ?? 100;
    const h = this.height ?? 100;
    return [
      { x, y },
      { x: x + w, y },
      { x, y: y + h },
      { x: x + w, y: y + h },
    ];
  }

  public clone(data?: any): this {
    const cloned = super.clone(data) as any;
    cloned.prompt = this.prompt;
    cloned.model = this.model;
    cloned.size = this.size;
    cloned.quality = this.quality;
    cloned.aspectRatio = this.aspectRatio;
    cloned.generationStatus = this.generationStatus;
    cloned.errorMessage = this.errorMessage;
    cloned.taskId = this.taskId;
    cloned.images = this.images ? [...this.images] : [];
    cloned.updateVisuals();
    return cloned as this;
  }
}

registerUI()(ImageGen);
