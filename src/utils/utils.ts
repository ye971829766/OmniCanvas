// 判断文件是否是图片
export function isImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;

  const imageExtensions = ["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg"];
  const fileExtension = file.name.split(".").pop()?.toLowerCase();
  return imageExtensions.includes(fileExtension || "");
}
export function isVideoFile(file: File): boolean {
  if (file.type.startsWith("video/")) return true;

  const videoExtensions = ["mp4", "mov", "avi", "mkv", "webm"];
  const fileExtension = file.name.split(".").pop()?.toLowerCase();
  return videoExtensions.includes(fileExtension || "");
}

// 根据传入的范围。获得随机坐标
export function getRandomCoordinates({ range = 100 }: { range?: number }): {
  x: number;
  y: number;
} {
  const x = Math.random() * range;
  const y = Math.random() * range;
  return { x, y };
}
