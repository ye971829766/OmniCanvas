import { Line, PointerEvent, LayoutEvent, Group } from "leafer-ui";
import { EditorEvent, EditorMoveEvent } from "@leafer-in/editor";
import type { IApp, IUI } from "@leafer-ui/interface";
import type { ISimulateElement } from "@leafer-in/interface";

declare module "@leafer-ui/interface" {
  interface IUI {
    isSnap?: boolean;
  }
}

const isArray = Array.isArray;

type Point = {
  x: number;
  y: number;
};

type BoundPoints = {
  tl: Point;
  tr: Point;
  bl: Point;
  br: Point;
  c: Point;
};

export type SnapConfig = {
  snapSize?: number;
  lineColor?: string;
  showLine?: boolean;
  strokeWidth?: number;
  dashPattern?: number[];
  isDash?: boolean;
  showLinePoints?: boolean;
  filter?: (element: IUI) => boolean;
};

const DEFAULT_SNAP_SIZE = 10;
const DEFAULT_LINE_COLOR = "#18181b";

export class CustomSnap {
  private app: IApp;
  // 吸附点
  private snapPoints: BoundPoints[] = [];
  private verticalLines: Line[] = [];
  private horizontalLines: Line[] = [];
  private verticalLinePoints: Group[] = [];
  private horizontalLinePoints: Group[] = [];

  // 吸附距离
  public snapSize: number = DEFAULT_SNAP_SIZE;
  // 吸附线颜色
  public lineColor: string = DEFAULT_LINE_COLOR;
  // 是否显示吸附线
  public showLine = true;
  // 吸附线宽度
  public strokeWidth = 1;
  // 是否虚线
  public isDash = true;
  // 虚线样式
  public dashPattern: number[] = [5];
  // 是否显示吸附点
  public showLinePoints = true;
  // 自定义筛选吸附元素规则
  public filter?: (element: IUI) => boolean;

  constructor(app: IApp, config?: SnapConfig) {
    if (!app.isApp) {
      throw new Error("target must be an App");
    }

    if (!app.tree) {
      throw new Error("tree layer is required");
    }

    if (!app.editor) {
      throw new Error("editor is required");
    }
    console.log("snap init");

    this.app = app;

    this.snapSize = config?.snapSize ?? this.snapSize;
    this.lineColor = config?.lineColor ?? this.lineColor;
    this.showLine = config?.showLine ?? this.showLine;
    this.strokeWidth = config?.strokeWidth ?? this.strokeWidth;
    this.isDash = config?.isDash ?? this.isDash;
    this.dashPattern = config?.dashPattern ?? this.dashPattern;
    this.showLinePoints = config?.showLinePoints ?? this.showLinePoints;
    this.filter = config?.filter ?? this.filter;

    this.handleMove = this.handleMove.bind(this);
    this.handleSelect = this.handleSelect.bind(this);
    this.clear = this.clear.bind(this);
  }

  /**
   * 主动改变筛选吸附元素函数
   */
  public changeFilter(filter: (element: IUI) => boolean) {
    this.filter = filter;
  }

  /**
   * 判断两个值是否在吸附范围内
   */
  private isInRange(value1: number, value2: number) {
    return (
      Math.abs(Math.round(value1) - Math.round(value2)) <=
      this.snapSize / (this.app.zoomLayer.scaleX ?? 1)
    );
  }

  /**
   * 获取元素相对于 tree 的边界，多种方式兜底
   */
  private getElementBounds(element: any): { x: number; y: number; width: number; height: number } | null {
    // 方式 1: getLayoutBounds
    try {
      const bounds = element.getLayoutBounds("box", this.app.tree);
      if (bounds && isFinite(bounds.x) && isFinite(bounds.y) && isFinite(bounds.width) && isFinite(bounds.height)) {
        return bounds;
      }
    } catch (e) {}

    // 方式 2: 利用 worldTransform 与 tree 的 worldTransform 反算出 tree 坐标
    try {
      const wt = element.worldTransform;
      const treeWt = this.app.tree?.worldTransform;
      if (wt && treeWt) {
        const w = element.width ?? 0;
        const h = element.height ?? 0;
        // 元素四角在世界坐标中的位置
        const corners = [
          { x: wt.e, y: wt.f },                                          // top-left
          { x: wt.a * w + wt.e, y: wt.b * w + wt.f },                   // top-right
          { x: wt.c * h + wt.e, y: wt.d * h + wt.f },                   // bottom-left
          { x: wt.a * w + wt.c * h + wt.e, y: wt.b * w + wt.d * h + wt.f }, // bottom-right
        ];
        // 从世界坐标转换到 tree 坐标: tree 的逆矩阵
        const det = treeWt.a * treeWt.d - treeWt.b * treeWt.c;
        if (Math.abs(det) > 1e-10) {
          const invA = treeWt.d / det;
          const invB = -treeWt.b / det;
          const invC = -treeWt.c / det;
          const invD = treeWt.a / det;
          const invE = (treeWt.c * treeWt.f - treeWt.d * treeWt.e) / det;
          const invF = (treeWt.b * treeWt.e - treeWt.a * treeWt.f) / det;

          const treeCorners = corners.map((p) => ({
            x: invA * p.x + invC * p.y + invE,
            y: invB * p.x + invD * p.y + invF,
          }));

          const xs = treeCorners.map((p) => p.x);
          const ys = treeCorners.map((p) => p.y);
          const minX = Math.min(...xs);
          const minY = Math.min(...ys);
          const maxX = Math.max(...xs);
          const maxY = Math.max(...ys);

          if (isFinite(minX) && isFinite(minY)) {
            return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
          }
        }
      }
    } catch (e) {}

    // 方式 3: getLayoutPoints
    try {
      if (typeof element.getLayoutPoints === "function") {
        const pts = element.getLayoutPoints("box", this.app.tree);
        if (pts && pts.length >= 4) {
          const xs = pts.map((p: Point) => p.x);
          const ys = pts.map((p: Point) => p.y);
          const minX = Math.min(...xs);
          const minY = Math.min(...ys);
          const maxX = Math.max(...xs);
          const maxY = Math.max(...ys);
          if (isFinite(minX) && isFinite(minY)) {
            return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
          }
        }
      }
    } catch (e) {}

    // 方式 4: 直接使用元素的 x/y/width/height (假设直接挂在 tree 下)
    const ex = element.x ?? 0;
    const ey = element.y ?? 0;
    const ew = element.width ?? 0;
    const eh = element.height ?? 0;
    if (ew > 0 && eh > 0) {
      return { x: ex, y: ey, width: ew, height: eh };
    }

    return null;
  }
  /**
   * 处理移动事件
   */
  private handleMove(event: EditorMoveEvent) {
    this.clearLines();
    if (this.showLinePoints) {
      this.clearPoints();
    }

    const { target } = event;

    // 获取实际选中的元素（而非 editor 的 SimulateElement 包装器）
    const editorList = this.app.editor?.list;
    if (!editorList || editorList.length === 0) return;

    // 重新计算吸附点，确保使用最新的元素位置
    const selectValue = editorList.length === 1 ? editorList[0] : editorList;
    this.handleSelect({
      value: selectValue,
    } as unknown as EditorEvent);

    // 使用实际选中元素的直接属性计算 target 定位点
    // 不走 getLayoutBounds，因为拖拽过程中 Box 容器的布局缓存可能未刷新
    let targetPoints: BoundPoints;
    if (editorList.length === 1) {
      const elem = editorList[0] as any;
      const ex = elem.x ?? 0;
      const ey = elem.y ?? 0;
      const ew = elem.width ?? 0;
      const eh = elem.height ?? 0;
      targetPoints = {
        tl: { x: ex, y: ey },
        tr: { x: ex + ew, y: ey },
        bl: { x: ex, y: ey + eh },
        br: { x: ex + ew, y: ey + eh },
        c: { x: ex + ew / 2, y: ey + eh / 2 },
      };
    } else {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      editorList.forEach((elem: any) => {
        const ex = elem.x ?? 0;
        const ey = elem.y ?? 0;
        const ew = elem.width ?? 0;
        const eh = elem.height ?? 0;
        minX = Math.min(minX, ex);
        minY = Math.min(minY, ey);
        maxX = Math.max(maxX, ex + ew);
        maxY = Math.max(maxY, ey + eh);
      });
      targetPoints = {
        tl: { x: minX === Infinity ? 0 : minX, y: minY === Infinity ? 0 : minY },
        tr: { x: maxX === -Infinity ? 0 : maxX, y: minY === Infinity ? 0 : minY },
        bl: { x: minX === Infinity ? 0 : minX, y: maxY === -Infinity ? 0 : maxY },
        br: { x: maxX === -Infinity ? 0 : maxX, y: maxY === -Infinity ? 0 : maxY },
        c: {
          x: ((minX === Infinity ? 0 : minX) + (maxX === -Infinity ? 0 : maxX)) / 2,
          y: ((minY === Infinity ? 0 : minY) + (maxY === -Infinity ? 0 : maxY)) / 2,
        },
      };
    }

    // 获取 target 的定位点
    const snapX: { offset: number; targetPoint: Point; snapPoint: Point }[] =
      [];
    const snapY: { offset: number; targetPoint: Point; snapPoint: Point }[] =
      [];

    // 遍历 target 的定位点与需要吸附的元素的定位点 将两者位置做比较
    Object.keys(targetPoints).forEach((key) => {
      const targetPoint: Point = targetPoints[key as keyof typeof targetPoints];

      this.snapPoints.forEach((snapPoints) => {
        Object.keys(snapPoints).forEach((snapPointKey) => {
          const snapPoint: Point =
            snapPoints[snapPointKey as keyof typeof snapPoints];

          if (this.isInRange(targetPoint.x, snapPoint.x)) {
            const offset = targetPoint.x - snapPoint.x;
            snapX.push({
              offset,
              targetPoint,
              snapPoint,
            });
          }

          if (this.isInRange(targetPoint.y, snapPoint.y)) {
            const offset = targetPoint.y - snapPoint.y;
            snapY.push({
              offset,
              targetPoint,
              snapPoint,
            });
          }
        });
      });
    });

    /**
     * 获取吸附信息
     */
    const getSnapInfo = (
      snap: { offset: number; targetPoint: Point; snapPoint: Point }[],
    ) => {
      if (snap.length === 0) {
        return null;
      }

      snap.sort((a, b) => Math.abs(a.offset) - Math.abs(b.offset));

      return snap[0];
    };

    const snapXInfo = getSnapInfo(snapX);
    const snapYInfo = getSnapInfo(snapY);

    // x 方向可吸附
    if (snapXInfo) {
      // 修改所有选中元素的实际位置
      editorList.forEach((item: any) => {
        item.x = (item.x ?? 0) - snapXInfo.offset;
      });
      // 同步 SimulateElement（editor 的拖动代理）
      if (this.app.editor.multiple) {
        (target as ISimulateElement).safeChange(() => {
          target.x = (target.x ?? 0) - snapXInfo.offset;
        });
      } else if (target !== editorList[0]) {
        // 单选时 target 可能是 SimulateElement，也需要同步
        try {
          target.x = (target.x ?? 0) - snapXInfo.offset;
        } catch (e) {}
      }
    }

    if (snapYInfo) {
      editorList.forEach((item: any) => {
        item.y = (item.y ?? 0) - snapYInfo.offset;
      });
      if (this.app.editor.multiple) {
        (target as ISimulateElement).safeChange(() => {
          target.y = (target.y ?? 0) - snapYInfo.offset;
        });
      } else if (target !== editorList[0]) {
        try {
          target.y = (target.y ?? 0) - snapYInfo.offset;
        } catch (e) {}
      }
    }

    if (!this.showLine) {
      return;
    }

    // 缩放有精度问题，所以需要使用 toFixed 来判断
    const verticalLines = snapX
      .filter((item) => item.offset.toFixed(2) === snapXInfo?.offset.toFixed(2))
      .map((item) => [
        item.snapPoint.x,
        item.snapPoint.y,
        item.snapPoint.x,
        item.targetPoint.y - (snapYInfo?.offset ?? 0),
      ]);
    const horizontalLines = snapY
      .filter((item) => item.offset.toFixed(2) === snapYInfo?.offset.toFixed(2))
      .map((item) => [
        item.snapPoint.x,
        item.snapPoint.y,
        item.targetPoint.x - (snapXInfo?.offset ?? 0),
        item.snapPoint.y,
      ]);

    this.drawLines(verticalLines, "y", this.lineColor);
    this.drawLines(horizontalLines, "x", this.lineColor);
  }

  /**
   * 绘制吸附线
   */
  private drawLines(
    linesPoint: number[][],
    direction: "x" | "y",
    color = this.lineColor,
  ) {
    // 根据绘制方向的坐标分类
    const pointSet = new Set<number>();
    linesPoint.forEach((line) => {
      pointSet.add(direction === "x" ? line[1] : line[0]);
    });
    const linesSet = Array.from(pointSet).map((point) =>
      linesPoint.filter((line) =>
        direction === "x" ? line[1] === point : line[0] === point,
      ),
    );
    const points: number[][] = [];
    const shouldDrawLines = linesSet.map((lines) => {
      // 找出最两段的顶点
      let minPoint = Infinity;
      let maxPoint = -Infinity;

      lines.forEach((line) => {
        points.push([line[0], line[1]], [line[2], line[3]]);
        if (direction === "x") {
          minPoint = Math.min(minPoint, line[0], line[2]);
          maxPoint = Math.max(maxPoint, line[0], line[2]);
        } else {
          minPoint = Math.min(minPoint, line[1], line[3]);
          maxPoint = Math.max(maxPoint, line[1], line[3]);
        }
      });

      const constantNum = direction === "x" ? lines[0][1] : lines[0][0];

      if (direction === "x") {
        return [minPoint, constantNum, maxPoint, constantNum];
      }
      return [constantNum, minPoint, constantNum, maxPoint];
    });

    if (this.showLinePoints) {
      this.drawPoints(points, direction);
    }

    const lines = this.getLines(shouldDrawLines.length, direction);
    shouldDrawLines.forEach((line, index) => {
      this.drawLine(lines[index], line, color);
    });
  }

  /**
   * 获取吸附线上的点实例，用于复用实例
   */
  private getLinePoints(points: number[][], direction: "x" | "y") {
    const linePoints =
      direction === "x" ? this.horizontalLinePoints : this.verticalLinePoints;
    const originLinePointsNum = linePoints.length;
    if (points.length <= originLinePointsNum) {
      return linePoints.slice(0, points.length);
    }

    const newLinePoints = new Array(points.length - originLinePointsNum)
      .fill(null)
      .map(() => {
        const line1 = new Line({
          stroke: this.lineColor,
          strokeWidth: this.strokeWidth,
          points: [0, 0, 6, 6],
          className: "point-line",
        });
        const line2 = new Line({
          stroke: this.lineColor,
          strokeWidth: this.strokeWidth,
          points: [0, 6, 6, 0],
          className: "point-line",
        });
        const pts = new Group({
          className: "linePoint",
          children: [line1, line2],
          around: "center",
          visible: false,
        });
        return pts;
      });

    linePoints.push(...newLinePoints);
    this.app.sky?.add(newLinePoints);
    return linePoints.slice(0, points.length);
  }

  /**
   * 绘制吸附线上的点
   */
  private drawPoints(points: number[][], direction: "x" | "y") {
    const linePoints = this.getLinePoints(points, direction);

    points.forEach((point, index) => {
      const worldPoint = this.app.tree!.getWorldPoint({
        x: point[0],
        y: point[1],
      });

      const pts = linePoints[index];
      if (pts && worldPoint) {
        pts.set({
          visible: true,
          x: worldPoint.x,
          y: worldPoint.y,
        });
        pts.children.forEach((item) => {
          (item as Line).stroke = this.lineColor;
        });
        this.app.sky?.add(pts);
      }
    });
  }

  /**
   * 获取吸附线实例，用于复用吸附线的实例
   */
  private getLines(number: number, direction: "x" | "y") {
    const lines = direction === "x" ? this.horizontalLines : this.verticalLines;
    const originLineNum = lines.length;
    if (number <= originLineNum) {
      return lines.slice(0, number);
    } else {
      const newLines = new Array(number - originLineNum).fill(null).map(
        () =>
          new Line({
            stroke: this.lineColor,
            strokeWidth: this.strokeWidth,
            className: `snap-line-${direction}`,
            visible: false,
            dashPattern: this.isDash ? this.dashPattern : undefined,
          }),
      );
      lines.push(...newLines);
      this.app.sky?.add(newLines);
      return lines.slice(0, number);
    }
  }

  /**
   * 绘制单条吸附线
   */
  private drawLine(line: Line, linePoint: number[], color = this.lineColor) {
    const firstPoint = this.app.tree!.getWorldPoint({
      x: linePoint[0],
      y: linePoint[1],
    });
    const secondPoint = this.app.tree!.getWorldPoint({
      x: linePoint[2],
      y: linePoint[3],
    });
    if (firstPoint && secondPoint) {
      line.set({
        points: [firstPoint.x, firstPoint.y, secondPoint.x, secondPoint.y],
        visible: true,
        stroke: color,
        strokeWidth: this.strokeWidth,
        dashPattern: this.isDash ? this.dashPattern : undefined,
      });
    }
  }

  /**
   * 处理选中事件
   */
  private handleSelect(event: EditorEvent) {
    const { value: selectElements } = event;

    // 构建选中元素的 ID 集合，用于可靠地排除选中元素
    // editor.list 返回的对象可能与 tree.children 中的对象不是同一引用（Box 子类的代理问题）
    const selectedIds = new Set<number>();
    if (isArray(selectElements)) {
      selectElements.forEach((el: any) => {
        if (el.innerId !== undefined) selectedIds.add(el.innerId);
      });
    } else if ((selectElements as any)?.innerId !== undefined) {
      selectedIds.add((selectElements as any).innerId);
    }

    const isSelected = (item: any): boolean => {
      // 引用比较
      if (item === selectElements) return true;
      if (isArray(selectElements) && selectElements.includes(item)) return true;
      // innerId 比较（处理 editor 代理对象与 tree 元素不同引用的情况）
      if (item.innerId !== undefined && selectedIds.has(item.innerId)) return true;
      return false;
    };

    // 获取视口内所有的元素
    const elements = this.getElementsInViewport().filter((item) => {
      // 筛出选中的元素本身
      if (isSelected(item)) {
        return false;
      }
      // 筛出选中元素的子孙元素（如 VideoGen 的内部 Rect/Text 等）
      let parent = item.parent;
      while (parent) {
        if (isSelected(parent)) return false;
        parent = parent.parent;
      }
      // 筛出不开启吸附的元素 (默认开启吸附，只有当 isSnap === false 时不吸附)
      if (item.isSnap === false) {
        return false;
      }
      // 筛出自定义规则的元素
      if (this.filter) {
        return this.filter(item);
      }
      return true;
    });

    this.snapPoints = elements.map((item) => this.getSnapPoints(item));
  }

  private getSnapPoints(_element: IUI | IUI[]): BoundPoints {
    let element: IUI[] = [];
    if (Array.isArray(_element)) {
      element = [..._element];

      let maxX = -Infinity;
      let maxY = -Infinity;
      let minX = Infinity;
      let minY = Infinity;

      element.forEach((item) => {
        const bounds = this.getElementBounds(item);
        if (bounds) {
          maxX = Math.max(maxX, bounds.x + bounds.width);
          maxY = Math.max(maxY, bounds.y + bounds.height);
          minX = Math.min(minX, bounds.x);
          minY = Math.min(minY, bounds.y);
        }
      });

      return {
        tl: {
          x: minX === Infinity ? 0 : minX,
          y: minY === Infinity ? 0 : minY,
        },
        tr: {
          x: maxX === -Infinity ? 0 : maxX,
          y: minY === Infinity ? 0 : minY,
        },
        bl: {
          x: minX === Infinity ? 0 : minX,
          y: maxY === -Infinity ? 0 : maxY,
        },
        br: {
          x: maxX === -Infinity ? 0 : maxX,
          y: maxY === -Infinity ? 0 : maxY,
        },
        c: {
          x: ((minX === Infinity ? 0 : minX) + (maxX === -Infinity ? 0 : maxX)) / 2,
          y: ((minY === Infinity ? 0 : minY) + (maxY === -Infinity ? 0 : maxY)) / 2,
        },
      };
    } else {
      const bounds = this.getElementBounds(_element);
      if (bounds) {
        return {
          tl: { x: bounds.x, y: bounds.y },
          tr: { x: bounds.x + bounds.width, y: bounds.y },
          bl: { x: bounds.x, y: bounds.y + bounds.height },
          br: { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
          c: {
            x: bounds.x + bounds.width / 2,
            y: bounds.y + bounds.height / 2,
          },
        };
      }

      // 完全无法获取边界，返回零点
      return {
        tl: { x: 0, y: 0 },
        tr: { x: 0, y: 0 },
        bl: { x: 0, y: 0 },
        br: { x: 0, y: 0 },
        c: { x: 0, y: 0 },
      };
    }
  }

  /**
   * 获取视口内的元素
   */
  private getElementsInViewport() {
    // 视口范围对应的内部坐标
    const zoomLayer = this.app.zoomLayer;
    if (!zoomLayer) return [];

    const x = zoomLayer.x ?? 0;
    const y = zoomLayer.y ?? 0;
    // 使用 app 的实际宽高作为视口尺寸，而非 zoomLayer 的内容尺寸
    const width = this.app.width ?? zoomLayer.width ?? 0;
    const height = this.app.height ?? zoomLayer.height ?? 0;
    const scaleX = zoomLayer.scaleX ?? 1;
    const scaleY = zoomLayer.scaleY ?? 1;

    const viewportBounds = [-x / scaleX, -y / scaleY, -x / scaleX + width / scaleX, -y / scaleY + height / scaleY];

    const data: IUI[] = [];

    const collect = (item: any) => {
      if (!item) return;

      // 去除 Leafer 元素 and SimulateElement 元素
      if (item.isLeafer || item.tag === "SimulateElement" || item.__tag === "SimulateElement") {
        return;
      }

      const hasChildren = Array.isArray(item.children) && item.children.length > 0;
      const isCustomNode = item.tag === "VideoNode" || item.__tag === "VideoNode" ||
                           item.tag === "VideoGen" || item.__tag === "VideoGen" ||
                           item.tag === "ImageGen" || item.__tag === "ImageGen";

      // If it's a target we want to snap to (a custom node or a leaf node or has isSnap === true)
      const shouldCollect = isCustomNode || !hasChildren || item.isSnap === true;

      if (shouldCollect) {
        const itemBounds = this.getElementBounds(item);
        if (itemBounds) {
          if (
            itemBounds.x <= viewportBounds[2] &&
            itemBounds.y <= viewportBounds[3] &&
            itemBounds.x + itemBounds.width >= viewportBounds[0] &&
            itemBounds.y + itemBounds.height >= viewportBounds[1]
          ) {
            data.push(item);
          }
        } else if (isCustomNode) {
          // 自定义节点即使无法获取边界也应加入，避免遗漏
          data.push(item);
        }
      }

      // Recursively traverse children, unless it's a custom card/node (we treat them as atomic units)
      if (hasChildren && !isCustomNode) {
        item.children.forEach((child: any) => collect(child));
      }
    };

    const treeChildren = this.app.tree?.children as IUI[] | undefined;
    (treeChildren ?? []).forEach((child) => collect(child));

    return data;
  }

  /**
   * 隐藏吸附线
   */
  private clearLines(direction?: "x" | "y") {
    let lines: Line[] = [];
    if (direction) {
      lines = direction === "x" ? this.horizontalLines : this.verticalLines;
    } else {
      lines = [...this.horizontalLines, ...this.verticalLines];
    }
    lines?.forEach((line) => {
      line.visible = false;
    });
  }

  /**
   * 清除吸附线上的点
   */
  private clearPoints(direction?: "x" | "y") {
    if (!direction) {
      this.horizontalLinePoints.forEach((item) => {
        item.visible = false;
      });
      this.verticalLinePoints.forEach((item) => {
        item.visible = false;
      });
      return;
    }
    const linePoints =
      direction === "x" ? this.horizontalLinePoints : this.verticalLinePoints;
    linePoints.forEach((item) => {
      item.visible = false;
    });
  }

  /**
   * 清除吸附线
   */
  private clear() {
    this.clearLines();
    if (this.showLinePoints) {
      this.clearPoints();
    }
  }

  /**
   * 启用吸附
   */
  public enable(enable: boolean) {
    if (enable) {
      this.app.editor?.on(EditorEvent.SELECT, this.handleSelect);
      this.app.editor?.on(EditorMoveEvent.MOVE, this.handleMove);
      this.app.on(PointerEvent.UP, this.clear);
      this.app.tree?.on(LayoutEvent.AFTER, this.clear);

      const selectElements = this.app.editor?.list;
      if (selectElements && selectElements.length > 0) {
        this.handleSelect({
          value: selectElements,
        } as unknown as EditorEvent);
      }
    } else {
      this.app.editor?.off(EditorEvent.SELECT, this.handleSelect);
      this.app.editor?.off(EditorMoveEvent.MOVE, this.handleMove);
      this.app.off(PointerEvent.UP, this.clear);
      this.app.tree?.off(LayoutEvent.AFTER, this.clear);
    }
  }

  /**
   * 销毁吸附
   */
  public destroy() {
    this.app.editor?.off(EditorEvent.SELECT, this.handleSelect);
    this.app.editor?.off(EditorMoveEvent.MOVE, this.handleMove);
    this.app.off(PointerEvent.UP, this.clear);
    this.app.tree?.off(LayoutEvent.AFTER, this.clear);

    this.clear();
    this.horizontalLines.forEach((line) => {
      line.destroy();
    });
    this.verticalLines.forEach((line) => {
      line.destroy();
    });
    this.verticalLinePoints.forEach((item) => {
      item.destroy();
    });
    this.horizontalLinePoints.forEach((item) => {
      item.destroy();
    });
    this.verticalLinePoints = [];
    this.horizontalLinePoints = [];
    this.horizontalLines = [];
    this.verticalLines = [];
  }
}
