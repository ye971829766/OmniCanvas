// 判断文件是否是图片
export function isImageFile(file: File): boolean {
  if (file.type === "image/gif") return false;
  if (file.type.startsWith("image/")) return true;

  const imageExtensions = ["jpg", "jpeg", "png", "bmp", "webp", "svg"];
  const fileExtension = file.name.split(".").pop()?.toLowerCase();
  return imageExtensions.includes(fileExtension || "");
}
export function isVideoFile(file: File): boolean {
  if (file.type === "image/gif") return true;
  if (file.type.startsWith("video/")) return true;

  const videoExtensions = ["mp4", "mov", "avi", "mkv", "webm", "gif"];
  const fileExtension = file.name.split(".").pop()?.toLowerCase();
  return videoExtensions.includes(fileExtension || "");
}

// 根据传入的范围，获得随机坐标
export function getRandomCoordinates({ range = 100 }: { range?: number }): {
  x: number;
  y: number;
} {
  const x = Math.random() * range;
  const y = Math.random() * range;
  return { x, y };
}

/**
 * 获取一个不与其他元素重叠的随机坐标。
 * 画布是无限的，所以此函数保证总能找到不重叠的位置。
 *
 * 策略分三层：
 * 1. 随机撒点法：在现有元素包围盒的扩展区域内随机尝试（适合元素稀疏时）
 * 2. 候选位置扫描：在每个现有元素的右侧和下方生成候选位置并验证
 * 3. 螺旋扩展法：沿螺旋方向向外扩展，逐格检测，保证一定能找到位置
 *
 * @param options - 配置选项
 * @param options.range - 初始随机范围（默认 2000），仅用于无元素时的初始区域
 * @param options.existingBounds - 已存在元素的边界框数组 [{x, y, width, height}]
 * @param options.newWidth - 新元素的宽度（默认 400）
 * @param options.newHeight - 新元素的高度（默认 300）
 * @param options.margin - 最小间距（默认 50）
 * @param options.maxAttempts - 随机撒点最大尝试次数（默认 100）
 */
export function getNonOverlappingCoordinates(options: {
  range?: number;
  existingBounds?: Array<{ x: number; y: number; width: number; height: number }>;
  newWidth?: number;
  newHeight?: number;
  margin?: number;
  maxAttempts?: number;
}): { x: number; y: number } {
  const {
    range = 2000,
    existingBounds = [],
    newWidth = 400,
    newHeight = 300,
    margin = 50,
    maxAttempts = 100,
  } = options;

  // 如果没有现有元素，直接返回随机坐标
  if (existingBounds.length === 0) {
    return getRandomCoordinates({ range });
  }

  // 碰撞检测函数
  const isOverlapping = (x: number, y: number): boolean => {
    return existingBounds.some((bound) => {
      return !(
        x + newWidth + margin <= bound.x ||
        x >= bound.x + bound.width + margin ||
        y + newHeight + margin <= bound.y ||
        y >= bound.y + bound.height + margin
      );
    });
  };

  // ─── 第一层：计算现有元素的包围盒，在扩展区域内随机撒点 ───
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of existingBounds) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }

  // 扩展区域：在包围盒周围额外增加一圈空间，保证有足够空间放置新元素
  const padding = Math.max(newWidth, newHeight) + margin * 2;
  const areaX = minX - padding;
  const areaY = minY - padding;
  const areaW = (maxX - minX) + padding * 2;
  const areaH = (maxY - minY) + padding * 2;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const x = areaX + Math.random() * (areaW - newWidth);
    const y = areaY + Math.random() * (areaH - newHeight);
    if (!isOverlapping(x, y)) {
      return { x, y };
    }
  }

  // ─── 第二层：候选位置扫描（在现有元素的右侧和下方的相邻位置） ───
  const candidates: Array<{ x: number; y: number }> = [];

  for (const bound of existingBounds) {
    // 右侧
    candidates.push({ x: bound.x + bound.width + margin, y: bound.y });
    // 下方
    candidates.push({ x: bound.x, y: bound.y + bound.height + margin });
    // 左侧
    candidates.push({ x: bound.x - newWidth - margin, y: bound.y });
    // 上方
    candidates.push({ x: bound.x, y: bound.y - newHeight - margin });
  }

  // 打乱候选位置顺序，增加随机性
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  for (const candidate of candidates) {
    if (!isOverlapping(candidate.x, candidate.y)) {
      return candidate;
    }
  }

  // ─── 第三层：螺旋扩展法（保证一定能找到位置） ───
  // 从现有元素的中心向外螺旋扫描，步长为 newWidth + margin
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const stepX = newWidth + margin;
  const stepY = newHeight + margin;

  // 螺旋方向: 右 → 下 → 左 → 上
  const directions = [
    { dx: stepX, dy: 0 },     // 右
    { dx: 0, dy: stepY },     // 下
    { dx: -stepX, dy: 0 },    // 左
    { dx: 0, dy: -stepY },    // 上
  ];

  let x = centerX;
  let y = centerY;
  let stepsInDirection = 1;
  let dirIndex = 0;
  let stepsTaken = 0;
  let turnsAtCurrentLength = 0;

  // 最大搜索 500 格，对于极端密集的情况也足够了
  for (let i = 0; i < 500; i++) {
    if (!isOverlapping(x, y)) {
      return { x, y };
    }

    // 沿当前方向前进一步
    const dir = directions[dirIndex];
    x += dir.dx;
    y += dir.dy;
    stepsTaken++;

    // 到达当前方向的步数上限后转向
    if (stepsTaken >= stepsInDirection) {
      stepsTaken = 0;
      dirIndex = (dirIndex + 1) % 4;
      turnsAtCurrentLength++;
      // 每转两次，增加一步的步长（螺旋扩大）
      if (turnsAtCurrentLength >= 2) {
        turnsAtCurrentLength = 0;
        stepsInDirection++;
      }
    }
  }

  // 理论上不应到达这里，但作为终极后备：在包围盒下方放置
  return { x: minX, y: maxY + margin };
}
