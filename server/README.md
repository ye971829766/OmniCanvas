# server

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

## Yunwu image generation

The server keeps Yunwu API keys private. The frontend fetches available models,
lets the user choose a model id, and sends only that model id back to the
server.

Environment variables:

```bash
YUNWU_BASE_URL=https://yunwu.ai/v1

# Backward-compatible fallback key. Used when the dedicated key below is empty.
YUNWU_API_KEY=your-yunwu-api-key

# Dedicated keys by capability.
YUNWU_IMAGE_API_KEY=your-image-api-key
YUNWU_CHAT_API_KEY=your-chat-api-key

YUNWU_IMAGE_MODEL=gpt-image-1
YUNWU_CHAT_MODEL=gpt-4o-mini
```

`YUNWU_BASE_URL` defaults to `https://yunwu.ai/v1`.
`YUNWU_IMAGE_MODEL` and `YUNWU_CHAT_MODEL` are fallback models when the frontend
does not send a selected model.

Fetch models available to each key:

```bash
curl http://localhost:3000/models/image
curl http://localhost:3000/models/chat
```

Fetch size, quality, and aspect-ratio options for a selected image model:

```bash
curl http://localhost:3000/models/image/gpt-image-2/options
```

Example response:

```json
{
  "model": "gpt-image-2",
  "sizes": ["auto", "1024x1024", "1536x1024", "1024x1536"],
  "qualities": ["auto", "low", "medium", "high"],
  "defaults": {
    "size": "auto",
    "quality": "auto"
  },
  "qualityMode": "quality",
  "notes": ["Provider-specific compatibility note"],
  "source": "OpenAI GPT Image 2 image generation guide",
  "sourceUrls": ["https://platform.openai.com/docs/guides/image-generation"]
}
```

`GET /models/image/:model/options` returns best-effort presets for common
Yunwu image model families, including OpenAI GPT Image, Gemini/Nano Banana,
Qwen Image, Seedream, FLUX, Grok Imagine, Midjourney-style, and Kling-style
model ids. The presets are based on public provider docs plus Yunwu model ids.
Yunwu's OpenAI-compatible gateway may translate native provider fields
differently, so the response also includes `notes`, `source`, and `sourceUrls`.

`qualityMode` tells the frontend how to label `qualities`:

| Value | Meaning |
| --- | --- |
| `quality` | OpenAI-style render quality, for example `low`, `medium`, `high`, `auto`. |
| `image_size` | Gemini/Nano Banana-style output tier, for example `512`, `1K`, `2K`, `4K`. |
| `resolution` | Provider resolution tier, for example xAI `1k` / `2k` or Seedream `2K` / `4K`. |
| `preset` | Compatibility preset; usually size/aspect-ratio matters more than quality. |

The frontend flow for image generation should be:

1. Call `GET /models/image`.
2. Let the user choose a model id.
3. Call `GET /models/image/:model/options`.
4. Render `sizes`, `qualities`, and optional `aspectRatios` from the response.
5. Send the selected `model`, `size`, and `quality` to `POST /generate-image`.

Text to image:

```bash
curl -X POST http://localhost:3000/generate-image \
  -H "content-type: application/json" \
  -d "{\"model\":\"gpt-image-1\",\"prompt\":\"A glossy perfume bottle on a marble plinth\",\"size\":\"1024x1024\",\"outputFormat\":\"png\"}"
```

Image to image:

```bash
curl -X POST http://localhost:3000/generate-image \
  -F "model=gpt-image-1" \
  -F "prompt=Turn this into a clean product render" \
  -F "image=@./input.png" \
  -F "outputFormat=png"
```

Chat:

```bash
curl -X POST http://localhost:3000/chat \
  -H "content-type: application/json" \
  -d "{\"model\":\"gpt-4o-mini\",\"messages\":[{\"role\":\"user\",\"content\":\"Hello\"}]}"
```

Frontend request fields:

| Field | Required | Applies to | Type | Notes |
| --- | --- | --- | --- | --- |
| `prompt` | Yes | Both | `string` | Main generation instruction. |
| `model` | No | Both | `string` | Model id selected from `GET /models/image`; falls back to `YUNWU_IMAGE_MODEL`. |
| `style` | No | Both | `string` | Appended to the prompt by the server. |
| `size` | No | Both | `string` | Choose from `GET /models/image/:model/options`; defaults to `1024x1024`. |
| `quality` | No | Both | `string` | Choose from `GET /models/image/:model/options`; forwarded to Yunwu when provided. |
| `outputFormat` | No | Both | `png \| jpeg \| webp` | Defaults to `png`. |
| `images` / `image` | No | Image-to-image | `File[]` / multipart `image` | 1-16 PNG, JPEG, or WebP files. |
| `mask` | No | Image-to-image | `File` / multipart `mask` | PNG only; requires at least one image. |

Use JSON when sending only text-to-image fields. Use `multipart/form-data` when
including reference images or a mask.

Optional multipart fields are `style`, `size`, `quality`, `outputFormat`, and
`mask`. `image` may be repeated up to 16 times. Uploaded reference images must
be PNG, JPEG, or WebP and 50MB or smaller. `mask` must be PNG.

Chat request fields:

| Field | Required | Type | Notes |
| --- | --- | --- | --- |
| `messages` | Yes | `{ role: "system" \| "user" \| "assistant"; content: string }[]` | Conversation sent to `/chat/completions`. |
| `model` | No | `string` | Model id selected from `GET /models/chat`; falls back to `YUNWU_CHAT_MODEL`. |
| `temperature` | No | `number` | Forwarded when provided. |
| `maxTokens` | No | `number` | Forwarded as `max_tokens` when provided. |

This project was created using `bun init` in bun v1.3.11. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
