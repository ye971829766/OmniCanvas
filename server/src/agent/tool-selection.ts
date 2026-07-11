export interface AgentToolSelectionInput {
  userInput: string;
  canvasNodeCount: number;
  hasAssets: boolean;
  hasCanvasImages?: boolean;
}

const CORE_CREATION_TOOLS = [
  "add_group",
  "add_text",
  "add_rect",
  "add_image",
  "generate_image",
  "update_node",
  "auto_layout",
  "align_nodes",
  "distribute_nodes",
  "review_and_adjust",
  "verify_design",
  "query_canvas",
];

const EXISTING_CANVAS_TOOLS = ["focus_node", "remove_node"];
const IMAGE_PROCESSING_TOOLS = [
  "edit_image",
  "remove_background",
  "inpaint_image",
  "upscale_image",
];

function matches(input: string, pattern: RegExp): boolean {
  return pattern.test(input);
}

export function selectAgentToolNames({
  userInput,
  canvasNodeCount,
  hasAssets,
  hasCanvasImages = false,
}: AgentToolSelectionInput): Set<string> {
  const input = userInput.toLowerCase();
  const selected = new Set(CORE_CREATION_TOOLS);

  const explicitSize = matches(
    input,
    /\b\d{2,5}\s*(?:x|\u00d7)\s*\d{2,5}\b|\b(?:1:1|16:9|9:16|4:3|3:4|21:9)\b|\u5c3a\u5bf8|\u5206\u8fa8\u7387/,
  );
  const boundedDeliverable = matches(
    input,
    /\b(?:artboard|poster|banner|flyer|brochure|cover|thumbnail|social (?:media )?post|instagram post|story|ad creative|advertisement|presentation|slide|landing page|web page|ui screen|mobile screen|print layout|business card|menu design)\b|\u753b\u677f|\u6d77\u62a5|\u6a2a\u5e45|\u5c01\u9762|\u7f29\u7565\u56fe|\u5ba3\u4f20\u5355|\u5e7f\u544a\u56fe|\u793e\u4ea4\u5a92\u4f53|\u5c0f\u7ea2\u4e66|\u9875\u9762|\u754c\u9762|\u5c4f\u5e55|\u5e7b\u706f\u7247|\u540d\u7247|\u83dc\u5355|\u5370\u5237/,
  );
  const multiDeliverable = matches(
    input,
    /\b(?:campaign|series|multiple|several|suite|variants|brand kit|multi[- ]?(?:page|artboard)|slides)\b|\u591a\u5f20|\u591a\u4e2a|\u591a\u5c3a\u5bf8|\u591a\u9875|\u7cfb\u5217|\u5957\u56fe|\u6d3b\u52a8\u7269\u6599|\u54c1\u724c\u5957\u4ef6/,
  );
  const explicitAdditionalArtboard = matches(
    input,
    /\b(?:add|create|new|another|separate)\s+(?:an?\s+)?artboard\b|\u65b0\u5efa\u753b\u677f|\u6dfb\u52a0\u753b\u677f|\u53e6\u4e00\u4e2a\u753b\u677f|\u72ec\u7acb\u753b\u677f/,
  );

  if (canvasNodeCount > 0 || matches(input, /\b(?:edit|modify|move|resize|delete|remove)\b|\u4fee\u6539|\u7f16\u8f91|\u79fb\u52a8|\u5220\u9664|\u8c03\u6574/)) {
    EXISTING_CANVAS_TOOLS.forEach((name) => selected.add(name));
  }

  if (matches(input, /\b(?:video|animation|motion|clip)\b|\u89c6\u9891|\u52a8\u753b|\u52a8\u6548|\u77ed\u7247/)) {
    selected.add("generate_video");
  }

  const ecommerce = matches(
    input,
    /\b(?:amazon|taobao|tmall|jd|listing|ecommerce|a\+)\b|\u7535\u5546|\u6dd8\u5b9d|\u5929\u732b|\u4eac\u4e1c|\u4e3b\u56fe|\u8be6\u60c5\u9875|\u5957\u56fe/,
  );
  if (ecommerce) {
    selected.add("plan_ecommerce_suite");
    IMAGE_PROCESSING_TOOLS.forEach((name) => selected.add(name));
  }

  if ((multiDeliverable && !ecommerce) || explicitAdditionalArtboard) {
    selected.add("add_frame");
  } else if (explicitSize || boundedDeliverable) {
    selected.add("set_frame");
  }

  const imageProcessing = matches(
    input,
    /\b(?:remove background|background removal|upscale|inpaint|retouch|edit image|image edit)\b|\u62a0\u56fe|\u53bb\u80cc\u666f|\u653e\u5927|\u8d85\u5206|\u4fee\u56fe|\u5c40\u90e8\u91cd\u7ed8|\u5904\u7406\u56fe\u7247/,
  );
  if (imageProcessing || (hasAssets && matches(input, /\bedit\b|\u4fee\u6539|\u5904\u7406/))) {
    IMAGE_PROCESSING_TOOLS.forEach((name) => selected.add(name));
  }
  if (hasCanvasImages) {
    selected.add("edit_image");
  }

  if (matches(input, /\b(?:brand|branding|palette|typography|font|color scheme|style system)\b|\u54c1\u724c|\u914d\u8272|\u8272\u677f|\u5b57\u4f53|\u98ce\u683c/)) {
    selected.add("set_brand");
    selected.add("apply_palette");
  }

  if (matches(input, /\b(?:inspiration|moodboard|reference board|competitor)\b|\u7075\u611f|\u53c2\u8003|\u7ade\u54c1/)) {
    selected.add("collect_inspiration");
  }

  if (matches(input, /\b(?:search|research|latest|news|trend|website|web page|url)\b|https?:\/\/|\u641c\u7d22|\u67e5\u627e|\u6700\u65b0|\u65b0\u95fb|\u8d8b\u52bf|\u7f51\u9875|\u7f51\u7ad9/)) {
    selected.add("web_search");
    selected.add("web_extract");
  }

  const complex = ecommerce || multiDeliverable;
  if (complex && !ecommerce) selected.add("plan_design");

  if (matches(input, /\b(?:manual vision|analyze screenshot|visual analysis|score this design)\b|\u622a\u56fe\u5206\u6790|\u89c6\u89c9\u5206\u6790|\u8bbe\u8ba1\u8bc4\u5206/)) {
    selected.add("export_node_image");
    selected.add("analyze_design");
  }

  return selected;
}
