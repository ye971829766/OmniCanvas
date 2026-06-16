(globalThis as any).window = {
  navigator: { userAgent: "node" }
} as any;
(globalThis as any).document = {
  createElement: (tag: string) => {
    return {
      style: {},
      getContext: () => ({}),
    };
  },
} as any;
(globalThis as any).CanvasRenderingContext2D = class {} as any;
(globalThis as any).Path2D = class {} as any;
(globalThis as any).HTMLElement = class {} as any;
(globalThis as any).HTMLVideoElement = class {} as any;
(globalThis as any).navigator = { userAgent: "node" } as any;
(globalThis as any).location = { href: "" } as any;
(globalThis as any).Image = class {} as any;
(globalThis as any).PointerEvent = class {} as any;
(globalThis as any).DragEvent = class {} as any;
(globalThis as any).MouseEvent = class {} as any;
(globalThis as any).KeyboardEvent = class {} as any;
(globalThis as any).FocusEvent = class {} as any;
(globalThis as any).WheelEvent = class {} as any;

async function run() {
  const { VideoNode } = await import("d:/ui/test/src/components/canvas/nodes/VideoNode");
  
  const serializeNode = (node: any): any => {
    const data = node.toJSON ? node.toJSON() : {};
    data.tag = node.__tag || node.tag;

    if (data.tag === "ImageGen") {
      data.prompt = node.prompt;
      data.model = node.model;
      data.size = node.size;
      data.quality = node.quality;
      data.aspectRatio = node.aspectRatio;
      data.generationStatus = node.generationStatus;
      data.errorMessage = node.errorMessage;
      data.taskId = node.taskId;
      delete data.children;
    } else if (data.tag === "VideoNode") {
      data.videoUrl = node.videoUrl;
      data.thumbnailUrl = node.thumbnailUrl;
      delete data.children;
    } else if (node.children && node.children.length > 0) {
      data.children = node.children.map((c: any) => serializeNode(c));
    }
    return data;
  };

  const deserializeNode = (data: any): any => {
    let child: any = null;
    if (data.tag === "ImageGen") {
      const { ImageGen } = require("d:/ui/test/src/components/canvas/nodes/ImageGen");
      child = new ImageGen(data);
    } else if (data.tag === "VideoNode") {
      child = new VideoNode(data);
    }
    return child;
  };

  try {
    const node = new VideoNode({
      x: 100,
      y: 200,
      width: 300,
      height: 400,
      videoUrl: "http://example.com/video.mp4",
      thumbnailUrl: "http://example.com/thumb.png",
    });

    console.log("Original Node:");
    console.log("- tag:", node.__tag);
    console.log("- videoUrl:", node.videoUrl);
    console.log("- thumbnailUrl:", node.thumbnailUrl);

    const serialized = serializeNode(node);
    console.log("\nSerialized Data:", JSON.stringify(serialized, null, 2));

    const restoredNode = deserializeNode(serialized);
    console.log("\nRestored Node:");
    console.log("- tag:", restoredNode.__tag);
    console.log("- videoUrl:", restoredNode.videoUrl);
    console.log("- thumbnailUrl:", restoredNode.thumbnailUrl);
    console.log("- width:", restoredNode.width);
    console.log("- height:", restoredNode.height);
    console.log("- x:", restoredNode.x);
    console.log("- y:", restoredNode.y);

  } catch (err) {
    console.error("Error:", err);
  }
}

run();
