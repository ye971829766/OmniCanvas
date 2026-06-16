/**
 * useAgent — reference composable for consuming the agent's SSE stream and
 * driving your EXISTING leafer canvas (ImageGen / VideoGen / Image / Text).
 *
 * This is a starting point you adapt to your app — wire `canvasApp` to the App
 * instance from useCanvas(), and the chat callbacks to your chat UI.
 *
 * Flow per CanvasOp:
 *  - set_frame          -> (optional) create/resize a Frame
 *  - add_node image_gen -> new ImageGen({ prompt, generationStatus:'generating' })
 *  - add_node video_gen -> new VideoGen({ prompt, generationStatus:'generating' })
 *  - add_node text/rect -> new Text / Rect
 *  - generation_started -> set node.taskId + emit('task-start') so useCanvas's
 *                          resumeNodePolling()/resumeVideoNodePolling() takes over
 *                          and swaps the placeholder for the real result.
 *  - update_node        -> node.set(patch)
 *  - remove_node        -> node.remove()
 *
 * Because we reuse the EXISTING task polling in useCanvas.ts, the agent does
 * NOT need to stream the final image — your canvas already knows how to finish
 * a generation from a taskId.
 */
import { ref, type Ref } from 'vue';
import { Text, Rect } from 'leafer-ui';
import { ImageGen } from '@/components/canvas/nodes/ImageGen';
import { VideoGen } from '@/components/canvas/nodes/VideoGen';

const AGENT_BASE = 'http://localhost:3000'; // your board/server

type CanvasOp = any; // import the type from server/src/agent/agent.protocol if you share types

export function useAgent(canvasApp: Ref<any>) {
  const thinking = ref('');
  const finalText = ref('');
  const running = ref(false);
  // map agent refId -> leafer node, so update_node / generation_started resolve
  const refNodes = new Map<string, any>();

  function applyCanvasOp(op: CanvasOp) {
    const app = canvasApp.value;
    if (!app?.tree) return;

    switch (op.op) {
      case 'set_frame': {
        // optional: create a Frame of this size, or just remember it for layout.
        // Left to your app — many designs just use absolute coords on the tree.
        break;
      }
      case 'add_node': {
        const n = op.node;
        let node: any = null;
        if (n.type === 'image_gen') {
          node = new ImageGen({
            x: n.x ?? 0,
            y: n.y ?? 0,
            width: n.width ?? 400,
            height: n.height ?? 300,
            prompt: n.prompt,
            model: n.model,
            size: n.size,
            aspectRatio: n.aspectRatio,
            generationStatus: 'idle',
            editable: true,
          } as any);
        } else if (n.type === 'video_gen') {
          node = new VideoGen({
            x: n.x ?? 0,
            y: n.y ?? 0,
            width: n.width ?? 480,
            height: n.height ?? 270,
            prompt: n.prompt,
            aspectRatio: n.aspectRatio,
            generationStatus: 'idle',
            editable: true,
          } as any);
        } else if (n.type === 'text') {
          node = new Text({
            x: n.x ?? 0,
            y: n.y ?? 0,
            width: n.width,
            text: n.text,
            fontSize: n.fontSize ?? 32,
            fontFamily: n.fontFamily,
            fill: n.fill ?? '#111',
            editable: true,
          });
        } else if (n.type === 'rect') {
          node = new Rect({
            x: n.x ?? 0,
            y: n.y ?? 0,
            width: n.width ?? 100,
            height: n.height ?? 100,
            fill: n.fill ?? '#eee',
            cornerRadius: n.cornerRadius,
            stroke: n.stroke,
            strokeWidth: n.strokeWidth,
            editable: true,
          });
        }
        if (node) {
          refNodes.set(n.refId, node);
          app.tree.add(node);
        }
        break;
      }
      case 'generation_started': {
        // hand the taskId to the existing node + trigger useCanvas polling
        const node = refNodes.get(op.refId);
        if (node) {
          node.set({ taskId: op.taskId, generationStatus: 'generating' });
          node.emit('task-start', { bubbles: true });
        }
        break;
      }
      case 'update_node': {
        const node = refNodes.get(op.refId);
        if (node) node.set(op.patch);
        break;
      }
      case 'remove_node': {
        const node = refNodes.get(op.refId);
        if (node) {
          node.remove();
          refNodes.delete(op.refId);
        }
        break;
      }
    }
  }

  /** send a message; the canvas updates live as events arrive */
  function send(sessionId: string, message: string) {
    thinking.value = '';
    finalText.value = '';
    running.value = true;
    refNodes.clear();

    const url = `${AGENT_BASE}/agent/${sessionId}/stream?message=${encodeURIComponent(message)}`;
    const es = new EventSource(url);

    es.onmessage = (e) => {
      const ev = JSON.parse(e.data);
      switch (ev.type) {
        case 'thinking':
          thinking.value += ev.text;
          break;
        case 'canvas_op':
          applyCanvasOp(ev.op);
          break;
        case 'final':
          finalText.value = ev.text;
          break;
        case 'error':
          console.error('[agent]', ev.message);
          break;
        case 'done':
          running.value = false;
          es.close();
          break;
      }
    };
    es.onerror = () => {
      running.value = false;
      es.close();
    };

    return () => es.close(); // cancel fn
  }

  return { thinking, finalText, running, send };
}
