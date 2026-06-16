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

export class VideoGen extends Box {
  public get __tag() {
    return "VideoGen";
  }
  public isSnap = true;

  // Custom properties backing fields
  private _prompt!: string;
  private _model!: string;
  private _seconds!: string;
  private _size!: string;
  private _generationStatus!: "idle" | "generating" | "success" | "error";
  private _errorMessage!: string;
  private _taskId!: string;
  private _inputReference!: string; // base64 reference image URL

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

  public get seconds() { return this._seconds; }
  public set seconds(val: string) {
    if (this._seconds !== val) {
      this._seconds = val;
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

  public get inputReference() { return this._inputReference; }
  public set inputReference(val: string) {
    if (this._inputReference !== val) {
      this._inputReference = val;
      this.updateVisuals();
    }
  }

  constructor(
    data: IBoxInputData & {
      prompt?: string;
      model?: string;
      seconds?: string;
      size?: string;
      generationStatus?: "idle" | "generating" | "success" | "error";
      errorMessage?: string;
      taskId?: string;
      inputReference?: string;
    },
  ) {
    super(data);
    this._prompt = data.prompt || "";
    this._model = data.model || "veo_3_1_fast_vip";
    this._seconds = data.seconds || "8";
    this._size = data.size || "16x9";
    this._generationStatus = data.generationStatus || "idle";
    this._errorMessage = data.errorMessage || "";
    this._taskId = data.taskId || "";
    this._inputReference = data.inputReference || "";
    
    this.editable = true;
    this.widthRange = { min: 160 };
    this.heightRange = { min: 160 };

    this.on(PropertyEvent.CHANGE, (e: PropertyEvent) => {
      const triggerAttrs = ["width", "height"];
      if (triggerAttrs.includes(e.attrName || "")) {
        this.updateVisuals();
      }
    });

    this.updateVisuals();
  }

  public updateVisuals() {
    this.clear();

    if (this.generationStatus === "success") {
      return;
    }

    const group = new Box({
      width: this.width,
      height: this.height,
      hittable: true,
    });

    const w = this.width ?? 400;
    const h = this.height ?? 300;

    // Soft violet/blue background (giving it a unique look vs image generator's soft blue)
    const bg = new Rect({
      width: w,
      height: h,
      fill: "#eef2ff", // indigo-50
      cornerRadius: 12,
    });
    group.add(bg);

    // Camera Icon in the center
    const iconWidth = 120;
    const iconHeight = 80;

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

    // 1. Camera Body (Rect)
    const body = new Rect({
      x: 15,
      y: 20,
      width: 55,
      height: 40,
      fill: "#c7d2fe", // indigo-200
      cornerRadius: 6,
    });
    iconGroup.add(body);

    // 2. Camera Lens (Polygon / Triangle on the right side)
    const lens = new Polygon({
      points: [70, 30, 95, 20, 95, 60, 70, 50],
      fill: "#c7d2fe", // indigo-200
    });
    iconGroup.add(lens);

    // 3. Reels (Two small circles on top of the camera body)
    const reel1 = new Ellipse({
      x: 22,
      y: 8,
      width: 16,
      height: 16,
      fill: "#c7d2fe",
    });
    const reel2 = new Ellipse({
      x: 44,
      y: 8,
      width: 16,
      height: 16,
      fill: "#c7d2fe",
    });
    iconGroup.add(reel1);
    iconGroup.add(reel2);

    group.add(iconGroup);

    // Loading state
    if (this.generationStatus === "generating") {
      const loadingText = new Text({
        x: w / 2,
        y: h / 2 + 45,
        text: "正在生成 AI 视频...",
        fontSize: 14,
        fontWeight: "bold",
        fill: "#4f46e5", // indigo-600
        textAlign: "center",
        verticalAlign: "middle",
      });
      group.add(loadingText);
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
  }

  public getLayoutPoints(type?: any, relative?: any): any[] {
    try {
      const points = super.getLayoutPoints(type, relative);
      if (points && points.length > 0) {
        return points;
      }
    } catch (e) {}

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
    } catch (e) {}

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
    cloned.seconds = this.seconds;
    cloned.size = this.size;
    cloned.generationStatus = this.generationStatus;
    cloned.errorMessage = this.errorMessage;
    cloned.taskId = this.taskId;
    cloned.inputReference = this.inputReference;
    cloned.updateVisuals();
    return cloned as this;
  }
}

registerUI()(VideoGen);
