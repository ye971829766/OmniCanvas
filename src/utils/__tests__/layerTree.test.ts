import { describe, expect, it, vi } from "vitest";
import {
  buildLayerTree,
  findFrameDropTarget,
  getLayerDropIndex,
  getLayerSelectionRange,
  isFlowLayoutContainer,
  isLayerDescendant,
  isSameLayerNode,
  moveLayerNodesWithRollback,
} from "@/utils/layerTree";

function node(tag: string, id: string, children: any[] = [], data = {}) {
  const result: any = { tag, innerId: id, children, ...data };
  children.forEach((child) => (child.parent = result));
  return result;
}

describe("layer tree", () => {
  it("flattens render order from top to bottom and respects collapsed groups", () => {
    const childA = node("Rect", "a");
    const childB = node("Text", "b");
    const group = node("Group", "group", [childA, childB]);
    const root = node("Leafer", "root", [node("Ellipse", "back"), group]);

    const expanded = buildLayerTree(root, new Set());
    const collapsed = buildLayerTree(root, new Set(["group"]));

    expect(expanded.items.map((item) => item.id)).toEqual([
      "group",
      "b",
      "a",
      "back",
    ]);
    expect(collapsed.items.map((item) => item.id)).toEqual([
      "group",
      "back",
    ]);
  });

  it("reveals matching descendants and their ancestors during search", () => {
    const group = node("Group", "group", [
      node("Rect", "rect", [], { name: "封面背景" }),
      node("Text", "text", [], { name: "标题" }),
    ]);
    const root = node("Leafer", "root", [group]);

    const result = buildLayerTree(root, new Set(["group"]), "标题");

    expect(result.items.map((item) => item.id)).toEqual(["group", "text"]);
  });

  it("creates a contiguous visible selection range", () => {
    const root = node("Leafer", "root", [
      node("Rect", "a"),
      node("Rect", "b"),
      node("Rect", "c"),
      node("Rect", "d"),
    ]);
    const result = buildLayerTree(root, new Set());

    expect(getLayerSelectionRange(result.items, "d", "b")).toEqual([
      "d",
      "c",
      "b",
    ]);
  });

  it("maps visual above and below drops to Leafer child indexes", () => {
    const back = { id: "back" };
    const moving = { id: "moving" };
    const target = { id: "target" };
    const front = { id: "front" };
    const children = [back, moving, target, front];
    const movingNodes = new Set([moving]);

    expect(getLayerDropIndex(children, target, "above", movingNodes)).toBe(2);
    expect(getLayerDropIndex(children, target, "below", movingNodes)).toBe(1);
  });

  it("recognizes horizontal and vertical smart-frame flow modes", () => {
    expect(isFlowLayoutContainer({ flow: "x" })).toBe(true);
    expect(isFlowLayoutContainer({ flow: "y" })).toBe(true);
    expect(isFlowLayoutContainer({ flow: false })).toBe(false);
  });

  it("recognizes wrapped references to the same Leafer node", () => {
    expect(isSameLayerNode({ innerId: 42 }, { innerId: 42 })).toBe(true);
    expect(isSameLayerNode({ innerId: 42 }, { innerId: 43 })).toBe(false);
  });

  it("stops safely when a corrupted parent chain contains a cycle", () => {
    const a: any = {};
    const b: any = {};
    a.parent = b;
    b.parent = a;

    expect(isLayerDescendant(a, {})).toBe(true);
  });

  it("chooses the deepest frame at the drag end point", () => {
    const group = node("Group", "group", [], {
      worldBoxBounds: { x: 120, y: 120, width: 80, height: 60 },
    });
    const inner = node("Frame", "inner", [], {
      flow: "x",
      worldBoxBounds: { x: 400, y: 200, width: 300, height: 220 },
    });
    const outer = node("Frame", "outer", [inner], {
      flow: "y",
      worldBoxBounds: { x: 350, y: 150, width: 450, height: 350 },
    });
    const root = node("Leafer", "root", [outer, group]);

    expect(findFrameDropTarget(root, [group], { x: 520, y: 280 })).toBe(
      inner,
    );
  });

  it("accepts a free-layout frame as a manual drop target", () => {
    const group = node("Group", "group", [], {
      worldBoxBounds: { x: 300, y: 240, width: 120, height: 90 },
    });
    const frame = node("Frame", "frame", [], {
      flow: false,
      worldBoxBounds: { x: 200, y: 150, width: 400, height: 350 },
    });
    const root = node("Leafer", "root", [frame, group]);

    expect(findFrameDropTarget(root, [group], { x: 360, y: 285 })).toBe(frame);
  });

  it("does not choose a smart frame inside the moving group", () => {
    const nestedFrame = node("Frame", "nested", [], {
      flow: "x",
      worldBoxBounds: { x: 100, y: 100, width: 200, height: 160 },
    });
    const group = node("Group", "group", [nestedFrame], {
      worldBoxBounds: { x: 80, y: 80, width: 240, height: 200 },
    });
    const root = node("Leafer", "root", [group]);

    expect(findFrameDropTarget(root, [group], { x: 150, y: 150 })).toBeNull();
  });

  it.each(["x", "y"])(
    "moves a group into a %s flow frame before the frame lays it out",
    (flow) => {
      const events: string[] = [];
      const sourceParent: any = { children: [] };
      const frame: any = {
        children: [],
        flow,
        addAt(child: any, index: number) {
          events.push("add");
          this.children.splice(index, 0, child);
          child.parent = this;
        },
      };
      const group: any = {
        parent: sourceParent,
        getTransform(relative?: any) {
          return relative
            ? { a: 1, b: 0, c: 0, d: 1, e: 120, f: 80 }
            : { a: 1, b: 0, c: 0, d: 1, e: 20, f: 30 };
        },
        setTransform() {
          events.push("transform");
        },
        remove() {
          this.parent.children = this.parent.children.filter(
            (child: any) => child !== this,
          );
          this.parent = null;
        },
      };
      sourceParent.children.push(group);
      const app = {
        lockLayout: () => events.push("lock"),
        unlockLayout: () => events.push("unlock"),
      };

      expect(moveLayerNodesWithRollback(app, [group], frame, 0)).toBe(true);
      expect(group.parent).toBe(frame);
      expect(events).toEqual(["lock", "transform", "add", "unlock"]);
    },
  );

  it("restores the original parent and transform when insertion fails", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const sourceParent: any = {
      children: [],
      addAt(child: any, index: number) {
        this.children.splice(index, 0, child);
        child.parent = this;
      },
    };
    const target: any = {
      children: [],
      addAt() {
        throw new Error("layout failed");
      },
    };
    const transforms: any[] = [];
    const group: any = {
      parent: sourceParent,
      getTransform(relative?: any) {
        return relative
          ? { a: 1, b: 0, c: 0, d: 1, e: 100, f: 100 }
          : { a: 1, b: 0, c: 0, d: 1, e: 10, f: 15 };
      },
      setTransform(transform: any) {
        transforms.push(transform);
      },
      remove() {
        this.parent.children = this.parent.children.filter(
          (child: any) => child !== this,
        );
        this.parent = null;
      },
    };
    sourceParent.children.push(group);
    const app = { lockLayout() {}, unlockLayout() {} };

    expect(moveLayerNodesWithRollback(app, [group], target, 0)).toBe(false);
    expect(group.parent).toBe(sourceParent);
    expect(sourceParent.children).toEqual([group]);
    expect(transforms[transforms.length - 1]).toEqual({
      a: 1,
      b: 0,
      c: 0,
      d: 1,
      e: 10,
      f: 15,
    });
    errorSpy.mockRestore();
  });
});
