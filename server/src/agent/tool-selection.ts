export interface AgentToolSelectionInput {
  userInput: string;
  canvasNodeCount: number;
  hasAssets: boolean;
  hasCanvasImages?: boolean;
}

export interface EcommerceRequestIntent {
  isEcommerce: boolean;
  isEditable: boolean;
  isImageEdit: boolean;
  isDirectFinalImage: boolean;
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
  "query_canvas",
];

const EXISTING_CANVAS_TOOLS = ["focus_node", "remove_node"];
const IMAGE_PROCESSING_TOOLS = [
  "edit_image",
  "remove_background",
  "inpaint_image",
  "upscale_image",
];
const ECOMMERCE_EDITABLE_COMPOSITION_TOOLS = [
  "add_group",
  "add_text",
  "add_rect",
  "add_image",
  "auto_layout",
  "align_nodes",
  "distribute_nodes",
  "review_and_adjust",
];

function matches(input: string, pattern: RegExp): boolean {
  return pattern.test(input);
}

export function classifyEcommerceRequest(userInput: string): EcommerceRequestIntent {
  const input = userInput.toLowerCase();
  const isEcommerce = matches(
    input,
    /\b(?:amazon|taobao|tmall|jd|listing|ecommerce|a\+)\b|\u7535\u5546|\u6dd8\u5b9d|\u5929\u732b|\u4eac\u4e1c|\u4e3b\u56fe|\u8be6\u60c5\u9875|\u5957\u56fe/,
  );
  const isEditable = matches(
    input,
    /\b(?:editable|layered|separate text layers?|source layout|source file)\b|\u53ef\u7f16\u8f91|\u5206\u5c42|\u6587\u5b57\u56fe\u5c42|\u6e90\u6587\u4ef6/,
  );
  const isImageEdit = matches(
    input,
    /\b(?:edit|modify|retouch|replace|remove|change)\b|\u4fee\u6539|\u7f16\u8f91|\u4fee\u56fe|\u66ff\u6362|\u5220\u9664|\u53bb\u6389|\u6539\u6210/,
  );
  return {
    isEcommerce,
    isEditable,
    isImageEdit,
    isDirectFinalImage:
      isEcommerce && !isEditable && !isImageEdit,
  };
}

export function isDirectImageRequest(userInput: string): boolean {
  const input = userInput.toLowerCase();
  const ecommerceIntent = classifyEcommerceRequest(userInput);
  if (ecommerceIntent.isDirectFinalImage) return true;
  if (ecommerceIntent.isEditable || ecommerceIntent.isImageEdit) return false;
  return matches(
    input,
    /\b(?:generate|render)\b[^\r\n.!?]{0,100}\b(?:image|picture|photo|illustration|poster|banner|cover|artwork|wallpaper|logo)\b|(?:\u751f\u6210|\u751f\u56fe|\u7ed8\u5236|\u753b\u4e00\u5f20|\u5236\u4f5c\u4e00\u5f20)[^\r\n\u3002\uff01\uff1f]{0,100}(?:\u56fe\u7247|\u56fe\u50cf|\u7167\u7247|\u63d2\u753b|\u6d77\u62a5|\u5c01\u9762|\u5e7f\u544a\u56fe|\u5546\u54c1\u56fe|\u6548\u679c\u56fe|\u58c1\u7eb8|logo)/i,
  );
}

export function selectAgentToolNames({
  userInput,
  canvasNodeCount,
  hasAssets,
  hasCanvasImages = false,
}: AgentToolSelectionInput): Set<string> {
  const input = userInput.toLowerCase();
  const selected = new Set(CORE_CREATION_TOOLS);
  const ecommerceIntent = classifyEcommerceRequest(userInput);
  const directImageRequest = isDirectImageRequest(userInput);

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

  const ecommerce = ecommerceIntent.isEcommerce;
  if (directImageRequest) {
    ECOMMERCE_EDITABLE_COMPOSITION_TOOLS.forEach((name) => selected.delete(name));
    selected.delete("update_node");
    selected.delete("verify_design");
  }

  if (!directImageRequest && ((multiDeliverable && !ecommerce) || explicitAdditionalArtboard)) {
    selected.add("add_frame");
  } else if ((explicitSize || boundedDeliverable) && !directImageRequest) {
    selected.add("set_frame");
  }

  const imageProcessing = matches(
    input,
    /\b(?:remove background|background removal|upscale|inpaint|retouch|edit image|image edit)\b|\u62a0\u56fe|\u53bb\u80cc\u666f|\u653e\u5927|\u8d85\u5206|\u4fee\u56fe|\u5c40\u90e8\u91cd\u7ed8|\u5904\u7406\u56fe\u7247/,
  );
  if (imageProcessing || (hasAssets && matches(input, /\bedit\b|\u4fee\u6539|\u5904\u7406/))) {
    IMAGE_PROCESSING_TOOLS.forEach((name) => selected.add(name));
  }
  if (hasCanvasImages && !directImageRequest) {
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
  if (complex && !ecommerce && !directImageRequest) selected.add("plan_design");

  if (matches(input, /\b(?:manual vision|analyze screenshot|visual analysis|score this design)\b|\u622a\u56fe\u5206\u6790|\u89c6\u89c9\u5206\u6790|\u8bbe\u8ba1\u8bc4\u5206/)) {
    selected.add("export_node_image");
    selected.add("analyze_design");
  }

  if (matches(
    input,
    /\b(?:verify|review|quality check|inspect the design|score the design)\b|\u8d28\u68c0|\u68c0\u67e5\u8bbe\u8ba1|\u8bc4\u5ba1|\u8bbe\u8ba1\u8bc4\u5206/,
  )) {
    selected.add("review_and_adjust");
    selected.add("verify_design");
  }

  if (directImageRequest) {
    const directTools = new Set(["generate_image"]);
    for (const reviewTool of [
      "review_and_adjust",
      "verify_design",
      "export_node_image",
      "analyze_design",
    ]) {
      if (selected.has(reviewTool)) directTools.add(reviewTool);
    }
    return directTools;
  }

  return selected;
}
