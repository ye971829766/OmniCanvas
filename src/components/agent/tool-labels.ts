export const TOOL_LABELS: Record<string, string> = {
  set_frame: '设置画板',
  add_frame: '创建画板',
  add_group: '创建分组',
  add_text: '添加文字',
  add_rect: '添加图形',
  add_image: '添加图片',
  update_node: '调整元素',
  remove_node: '删除元素',
  query_canvas: '读取画布',
  generate_image: '生成图片',
  generate_video: '生成视频',
  edit_image: '编辑图片',
  remove_background: '移除背景',
  inpaint_image: '局部修复',
  upscale_image: '高清放大',
  auto_layout: '自动布局',
  align_nodes: '对齐元素',
  distribute_nodes: '分布元素',
  set_brand: '设置品牌',
  apply_palette: '应用配色',
  collect_inspiration: '收集设计灵感',
  focus_node: '聚焦元素',
  export_node_image: '截取画面',
  analyze_design: '视觉分析',
  verify_design: '质量检测',
  plan_design: '规划任务',
  plan_ecommerce_suite: '规划电商套图',
  review_and_adjust: '检查并调整',
};

export function getToolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name;
}

export const TOOL_ACTIVE_LABELS: Record<string, string> = {
  set_frame: '正在设置画布',
  add_text: '正在排入文字',
  add_rect: '正在添加图形',
  add_image: '正在添加图片',
  add_frame: '正在添加画板',
  add_group: '正在创建分组',
  update_node: '正在微调元素',
  remove_node: '正在清理元素',
  query_canvas: '正在读取画布',
  collect_inspiration: '正在收集灵感',
  generate_image: '正在生成图片',
  generate_video: '正在生成视频',
  edit_image: '正在编辑图片',
  remove_background: '正在移除背景',
  inpaint_image: '正在修复局部',
  upscale_image: '正在高清放大',
  auto_layout: '正在调整布局',
  align_nodes: '正在对齐元素',
  distribute_nodes: '正在调整间距',
  set_brand: '正在应用品牌',
  apply_palette: '正在调整配色',
  export_node_image: '正在截取画面',
  analyze_design: '正在分析设计',
  verify_design: '正在验证质量',
  plan_design: '正在规划任务',
  plan_ecommerce_suite: '正在规划电商套图',
  review_and_adjust: '正在检查布局',
  focus_node: '正在聚焦元素',
};

export function getToolActiveLabel(name: string): string {
  return TOOL_ACTIVE_LABELS[name] ?? '正在处理画布';
}

export const TOOL_DONE_LABELS: Record<string, string> = {
  collect_inspiration: '灵感收集完成',
  generate_image: '图片生成已启动',
  generate_video: '视频生成已启动',
  edit_image: '图片编辑已启动',
  remove_background: '背景处理已启动',
  inpaint_image: '局部修复已启动',
  upscale_image: '高清放大已启动',
};

export function getToolDoneLabel(name: string): string {
  return TOOL_DONE_LABELS[name] ?? '思考中';
}
