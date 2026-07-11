import { createApp, nextTick } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import GeneratedMediaGallery from "./GeneratedMediaGallery.vue";

let app: ReturnType<typeof createApp> | null = null;
let host: HTMLDivElement | null = null;

function mountGallery(
  tools: Array<{
    id: string;
    name: string;
    done: boolean;
    input?: { prompt?: string };
    output?: {
      refId?: string;
      status?: string;
      url?: string;
      imageUrl?: string;
    };
  }>,
  nodeStates: Record<string, any>,
  onZoom = vi.fn(),
) {
  host = document.createElement("div");
  document.body.appendChild(host);
  app = createApp(GeneratedMediaGallery, {
    tools,
    nodeStates,
    onZoom,
  });
  app.mount(host);
  return { host, onZoom };
}

afterEach(() => {
  app?.unmount();
  host?.remove();
  app = null;
  host = null;
});

describe("GeneratedMediaGallery", () => {
  it("keeps a single generated image in the bounded preview layout", async () => {
    const { host } = mountGallery(
      [
        {
          id: "tool-1",
          name: "generate_image",
          done: true,
          output: { refId: "image-1" },
        },
      ],
      {
        "image-1": {
          refId: "image-1",
          type: "image",
          status: "done",
          url: "https://example.com/image-1.png",
        },
      },
    );
    await nextTick();

    const gallery = host.querySelector(".generated-media-gallery");
    const card = host.querySelector(".preview-card");
    expect(gallery?.classList.contains("is-multiple")).toBe(false);
    expect(card?.classList.contains("compact")).toBe(false);
    expect(host.querySelectorAll(".action-download-btn")).toHaveLength(1);
  });

  it("deduplicates results and uses a dense thumbnail grid for three or more", async () => {
    const tools = ["image-1", "image-2", "image-3"].map((refId, index) => ({
      id: `tool-${index}`,
      name: "generate_image",
      done: true,
      output: { refId },
    }));
    tools.push({
      id: "duplicate",
      name: "edit_image",
      done: true,
      output: { refId: "image-1" },
    });

    const { host, onZoom } = mountGallery(tools, {
      "image-1": {
        refId: "image-1",
        type: "image",
        status: "done",
        url: "https://example.com/image-1.png",
      },
      "image-2": {
        refId: "image-2",
        type: "image",
        status: "done",
        url: "https://example.com/image-2.png",
      },
      "image-3": {
        refId: "image-3",
        type: "image",
        status: "done",
        url: "https://example.com/image-3.png",
      },
    });
    await nextTick();

    const gallery = host.querySelector(".generated-media-gallery");
    expect(gallery?.classList.contains("is-multiple")).toBe(true);
    expect(gallery?.classList.contains("is-dense")).toBe(true);
    expect(host.querySelectorAll(".generated-media-item")).toHaveLength(3);
    expect(host.querySelectorAll(".preview-card.compact")).toHaveLength(3);
    expect(host.querySelectorAll(".action-download-btn")).toHaveLength(3);

    (host.querySelector(".preview-card") as HTMLElement).click();
    expect(onZoom).toHaveBeenCalledWith("image-1");
  });

  it("restores a generated image from persisted tool output without live canvas state", async () => {
    const { host } = mountGallery(
      [
        {
          id: "tool-history",
          name: "generate_image",
          done: true,
          input: { prompt: "product front view" },
          output: {
            refId: "history-image",
            status: "success",
            url: "https://example.com/history-image.png",
          },
        },
      ],
      {},
    );
    await nextTick();

    const image = host.querySelector(".preview-img") as HTMLImageElement | null;
    expect(image?.src).toBe("https://example.com/history-image.png");
    expect(host.querySelectorAll(".action-download-btn")).toHaveLength(1);
  });

  it("keeps failed generation attempts in the tool timeline instead of the media gallery", async () => {
    const { host } = mountGallery(
      [
        {
          id: "tool-failed",
          name: "generate_image",
          done: true,
          output: {
            refId: "failed-image",
            status: "error",
          },
        },
      ],
      {
        "failed-image": {
          refId: "failed-image",
          type: "image",
          status: "error",
          error: "Unsupported image size",
        },
      },
    );
    await nextTick();

    expect(host.querySelector(".generated-media-gallery")).toBeNull();
    expect(host.querySelector(".preview-error")).toBeNull();
  });
});
