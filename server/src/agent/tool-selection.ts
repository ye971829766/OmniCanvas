import {
  getFinalImagePromptMode,
  isAmazonAPlusRequest,
  shouldAutoReviewFinalImageRequest,
  shouldResearchFinalImageRequest,
} from "./image-request-policy";
import { isImageSuiteRequest } from "./image-suite-plan";

export interface AgentToolSelectionInput {
  userInput: string;
  canvasNodeCount: number;
  /** Assets attached in the current user turn. */
  hasAssets: boolean;
  /** Persisted assets from older turns; usable only when the user refers to them. */
  hasHistoricalAssets?: boolean;
  hasCanvasImages?: boolean;
}

export interface EcommerceRequestIntent {
  isEcommerce: boolean;
  isEditable: boolean;
  isImageEdit: boolean;
  /** Multi-deliverable listing suite (主图+详情页 / 套图 / multi listing images). */
  isSuite: boolean;
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

function rejectsEditableCanvas(input: string): boolean {
  return matches(
    input,
    /\b(?:do not|don't|dont|without|avoid|no)\s+(?:an?\s+)?(?:editable|layered|canvas|source[- ]?file|text[- ]?layer)|(?:不要|不用|不使用|禁止|别用|无需|无须|避免).{0,12}(?:可编辑|分层|画布|图层|文字层|源文件|源工程)/i,
  );
}

function requestsEditableCanvas(input: string): boolean {
  if (rejectsEditableCanvas(input)) return false;
  return matches(
    input,
    /\b(?:editable|layered|separate text layers?|source layout|source file|source project|canvas(?:\s+(?:layout|composition|design|project))?)\b|可编辑|分层|文字图层|独立文字层|源文件|源工程|画布(?:排版|布局|设计|工程)?/i,
  );
}

/** Multi-shot marketplace suite, not a single one-off listing image. */
export function isEcommerceSuiteRequest(userInput: string): boolean {
  return isImageSuiteRequest(userInput);
}

export function classifyEcommerceRequest(userInput: string): EcommerceRequestIntent {
  const input = userInput.toLowerCase();
  const isSuite = isEcommerceSuiteRequest(userInput);
  const isEcommerce = matches(
    input,
    /\b(?:amazon|taobao|tmall|jd|listing|ecommerce)\b|a\+|\u7535\u5546|\u6dd8\u5b9d|\u5929\u732b|\u4eac\u4e1c|\u4e3b\u56fe|\u8be6\u60c5\u9875|\u5957\u56fe/,
  ) || isSuite;
  const isEditable = requestsEditableCanvas(input);
  const isImageEdit = matches(
    input,
    /\b(?:edit|modify|retouch|replace|remove|change)\b|\u4fee\u6539|(?<!\u53ef)\u7f16\u8f91|\u4fee\u56fe|\u66ff\u6362|\u5220\u9664|\u53bb\u6389|\u6539\u6210/,
  );
  return {
    isEcommerce,
    isEditable,
    isImageEdit,
    isSuite,
    // All non-editable ecommerce bitmap work uses the direct image path.
    isDirectFinalImage:
      isEcommerce && !isEditable && !isImageEdit,
  };
}

export function isDirectImageRequest(userInput: string): boolean {
  const input = userInput.toLowerCase();
  const refersToExistingImage = matches(
    input,
    /\b(?:this|that|selected|uploaded|previous|last)\s+(?:image|photo|picture|product|shot)\b|\b(?:uploaded|selected)\s+product\b|这张(?:图|图片|照片)|那张(?:图|图片|照片)|上传的(?:图|图片|照片|产品图)|选中的(?:图|图片|照片)|原图|上一张图|刚才的图/,
  );
  const changesExistingImage = matches(
    input,
    /\b(?:use|add|insert|place|put|edit|modify|retouch|replace|remove|change|restyle|composite)\b|(?:用|做|制作|添加|加入|加上|画上|放入|放到|修改|编辑|修图|替换|删除|去掉|换成|换掉|改成|合成|换背景|改背景|做成).{0,24}/,
  );
  if (refersToExistingImage && changesExistingImage) return false;
  const ecommerceIntent = classifyEcommerceRequest(userInput);
  if (ecommerceIntent.isDirectFinalImage) return true;
  // Only block direct generation for ecommerce editable/edit intents.
  // Non-ecommerce "修图/改背景" is handled by isImageModelBitmapRequest.
  if (
    ecommerceIntent.isEcommerce &&
    (ecommerceIntent.isEditable || ecommerceIntent.isImageEdit)
  ) {
    return false;
  }
  const brief = userInput.trim();
  if (!brief) return false;
  if (/[?？]$|^(?:如何|怎么|为什么|请解释|分析一下|评价一下|what|why|how|explain|analy[sz]e|review)\b/i.test(brief)) {
    return false;
  }
  if (
    requestsEditableCanvas(brief) ||
    (!rejectsEditableCanvas(brief) && /(?:节点|图层|按钮|组件|文本框|移动|对齐|删除|调整大小)|\b(?:node|layer|button|component|move|align|delete|resize)\b/i.test(brief))
  ) {
    return false;
  }
  if (matches(
    input,
    /\b(?:generate|render|create|make|design)\b[^\r\n.!?]{0,100}\b(?:image|picture|photo|illustration|poster|banner|cover|artwork|wallpaper|logo|visual|ad creative|mockup|social (?:media )?post|flyer|brochure|thumbnail|presentation|slide|landing page|web page|ui screen|mobile screen|business card|menu design|infographic|diagram|flowchart|mind map|chart)\b|(?:生成|生图|绘制|画|制作|做|设计)[^\r\n。！？]{0,100}(?:图片|图像|照片|插画|海报|横幅|封面|广告图|商品图|主图|详情页|套图|效果图|壁纸|宣传图|视觉图|缩略图|社交媒体图|小红书图|宣传单|演示页|幻灯片|落地页|网页|页面|界面|移动端页面|名片|菜单|信息图|流程图|思维导图|图表|示意图|标志|logo)/i,
  )) return true;

  // A design-canvas user often supplies only the visual brief. Route concise
  // scene descriptions such as "宇航员猫，月球，电影感" without requiring the
  // ceremonial phrase "生成一张图片".
  if (brief.length > 180) return false;
  const namedRasterArtifact =
    /(?:一张|一幅|一组|一个).{0,100}(?:图片|图像|插画|照片|壁纸|商品图|效果图|海报|横幅|封面|广告图|宣传图|主图|详情页|套图|缩略图|视觉图|社交媒体图|小红书图|宣传单|演示页|幻灯片|落地页|网页|页面|界面|名片|菜单|信息图|流程图|思维导图|图表|示意图|标志)|\b(?:an?|one)\s+.{0,100}\b(?:image|illustration|photo|picture|wallpaper|artwork|poster|banner|cover|visual|mockup|social (?:media )?post|flyer|brochure|thumbnail|slide|landing page|ui screen|business card|infographic|diagram|flowchart|mind map|chart)\b/i.test(brief);
  const visualDirection =
    /(?:电影感|摄影感|摄影|写实|插画|水彩|油画|三维|3d|赛博朋克|极简|复古|未来感|霓虹|特写|广角|景深|光影|构图|月球|太空|森林|城市夜景)|\b(?:cinematic|photoreal|photographic|photography|illustration|watercolor|oil paint|3d|cyberpunk|minimal|retro|futuristic|neon|close-up|wide-angle|depth of field|moon|space|forest|city at night)\b/i.test(brief);
  const subjectInScene =
    /^(?:一[只位个艘辆座]|这[只位个艘辆座]|an?\s+).{2,120}(?:在|站在|位于|穿着|拿着|飞过|on\s+the|in\s+the|under\s+the|beside\s+the|wearing|holding).+/i.test(brief);
  return namedRasterArtifact || visualDirection || subjectInScene;
}

/**
 * User has a source photo (upload / canvas image) and wants a finished bitmap
 * from the image model (edit / re-background / promo shot), NOT a layered
 * canvas composition with add_text / add_rect.
 */
export function isImageModelBitmapRequest(
  userInput: string,
  options: {
    hasAssets?: boolean;
    hasHistoricalAssets?: boolean;
    hasCanvasImages?: boolean;
  } = {},
): boolean {
  const input = userInput.toLowerCase();
  const refersToSourcePhoto = matches(
    input,
    /\b(?:this|that|previous|last)\s+(?:image|photo|picture|product|shot)\b|\bthe\s+product\b|\u8fd9\u5f20\u56fe|\u8fd9\u5f20\u56fe\u7247|\u8fd9\u5f20|\u90a3\u5f20\u56fe|\u8fd9\u53cc|\u8fd9\u4e2a\u4ea7\u54c1|\u8fd9\u4e2a\u5546\u54c1|\u4e0a\u4f20\u7684|\u4e4b\u524d\u4e0a\u4f20\u7684|\u521a\u624d\u7684\u56fe|\u4e0a\u4e00\u5f20\u56fe|\u524d\u4e00\u5f20\u56fe|\u539f\u56fe|\u53c2\u8003\u56fe/,
  );
  const hasSource = Boolean(
    options.hasAssets ||
    options.hasCanvasImages ||
    (options.hasHistoricalAssets && refersToSourcePhoto),
  );
  if (!hasSource) return false;

  const ecommerceIntent = classifyEcommerceRequest(userInput);
  // Explicit layered / editable source-file requests stay on canvas tools.
  if (ecommerceIntent.isEditable) return false;
  // Ecommerce suites are finished bitmaps via generate_image (no canvas assembly).
  if (ecommerceIntent.isSuite) return true;
  if (
    matches(
      userInput,
      /\b(?:editable|layered|separate text layers?|source layout|source file)\b|\u53ef\u7f16\u8f91|\u5206\u5c42|\u6587\u5b57\u56fe\u5c42|\u6e90\u6587\u4ef6|\u6392\u7248|\u52a0\u4e2a\u6807\u9898|\u52a0\u6587\u5b57|\u628a\u6587\u5b57/,
    )
  ) {
    return false;
  }

  const wantsBitmapTransform = matches(
    input,
    /\b(?:change|replace|new|cool|dramatic)\s+(?:the\s+)?background\b|\b(?:add|insert|place|put|retouch|composite)\b|\bbackground\b|\bproduct\s+(?:shot|poster|banner|promo)\b|\bpromo(?:tional)?\s+(?:image|poster|shot|visual)\b|\u80cc\u666f|\u573a\u666f|\u6362\u666f|\u4fee\u56fe|\u6539\u56fe|\u5408\u6210|\u6dfb\u52a0|\u52a0\u4e0a|\u753b\u4e0a|\u653e\u5165|\u5ba3\u4f20\u56fe|\u5e7f\u544a\u56fe|\u6d77\u62a5|\u4e3b\u56fe|\u6548\u679c\u56fe|\u5546\u54c1\u5c55\u793a|\u70ab\u9177|\u9177\u70ab|\u653e\u5728.{0,12}\u80cc\u666f|\u6362.{0,8}\u80cc\u666f|\u6539.{0,8}\u80cc\u666f|\u753b.{0,12}\u80cc\u666f|\u52a0.{0,12}\u80cc\u666f|\u505a\u6210.{0,10}(?:\u56fe|\u6d77\u62a5)|(?:\u5f53|\u7528\u6765\u5f53).{0,8}(?:\u5ba3\u4f20|\u5e7f\u544a|\u6d77\u62a5)/,
  );

  // With an attached/selected photo, either deictic "this image" + transform,
  // or a clear promo/background transform on the only source is enough.
  if (wantsBitmapTransform && (refersToSourcePhoto || options.hasAssets)) {
    return true;
  }

  // "edit/retouch this photo" without layered layout words
  if (
    refersToSourcePhoto &&
    matches(
      input,
      /\b(?:edit|retouch|modify|enhance|restyle)\b|\u4fee\u6539|\u7f16\u8f91|\u4fee\u56fe|\u6539\u56fe|\u4f18\u5316|\u5904\u7406/,
    )
  ) {
    return true;
  }

  return false;
}

/** True when the agent should focus on image-model tools (no canvas poster assembly). */
export function isFocusedImageModelRequest(
  userInput: string,
  options: {
    hasAssets?: boolean;
    hasHistoricalAssets?: boolean;
    hasCanvasImages?: boolean;
  } = {},
): boolean {
  return (
    isDirectImageRequest(userInput) ||
    isImageModelBitmapRequest(userInput, options)
  );
}

export function selectAgentToolNames({
  userInput,
  canvasNodeCount,
  hasAssets,
  hasHistoricalAssets = false,
  hasCanvasImages = false,
}: AgentToolSelectionInput): Set<string> {
  const input = userInput.toLowerCase();
  const selected = new Set(CORE_CREATION_TOOLS);
  const ecommerceIntent = classifyEcommerceRequest(userInput);
  const amazonAPlus = isAmazonAPlusRequest(userInput);
  const directImageRequest = isDirectImageRequest(userInput);
  const imageModelBitmap = isImageModelBitmapRequest(userInput, {
    hasAssets,
    hasHistoricalAssets,
    hasCanvasImages,
  });
  const focusedImageModel = directImageRequest || imageModelBitmap;
  const webResearchAvailable = Boolean(process.env.TAVILY_API_KEY);
  const imageResearchRequired =
    webResearchAvailable && shouldResearchFinalImageRequest(userInput);
  const autoQualityReview = shouldAutoReviewFinalImageRequest(userInput);

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

  if (focusedImageModel) {
    ECOMMERCE_EDITABLE_COMPOSITION_TOOLS.forEach((name) => selected.delete(name));
    selected.delete("update_node");
  }

  if (!focusedImageModel && ((multiDeliverable && !ecommerce) || explicitAdditionalArtboard)) {
    selected.add("add_frame");
  } else if ((explicitSize || boundedDeliverable) && !focusedImageModel) {
    selected.add("set_frame");
  }

  const imageProcessing = matches(
    input,
    /\b(?:remove background|background removal|upscale|inpaint|retouch|edit image|image edit)\b|\u62a0\u56fe|\u53bb\u80cc\u666f|\u653e\u5927|\u8d85\u5206|\u4fee\u56fe|\u5c40\u90e8\u91cd\u7ed8|\u5904\u7406\u56fe\u7247/,
  );
  if (imageProcessing || (hasAssets && matches(input, /\bedit\b|\u4fee\u6539|\u5904\u7406/))) {
    IMAGE_PROCESSING_TOOLS.forEach((name) => selected.add(name));
  }
  if (hasCanvasImages && !focusedImageModel) {
    selected.add("edit_image");
  }
  if (imageModelBitmap) {
    selected.add("edit_image");
    selected.add("generate_image");
  }

  if (matches(input, /\b(?:brand|branding|palette|typography|font|color scheme|style system)\b|\u54c1\u724c|\u914d\u8272|\u8272\u677f|\u5b57\u4f53|\u98ce\u683c/)) {
    selected.add("set_brand");
    selected.add("apply_palette");
  }

  if (matches(input, /\b(?:inspiration|moodboard|reference board|competitor)\b|\u7075\u611f|\u53c2\u8003|\u7ade\u54c1/)) {
    selected.add("collect_inspiration");
  }

  if (
    webResearchAvailable &&
    matches(input, /\b(?:search|research|latest|news|trend|website|web page|url)\b|https?:\/\/|\u641c\u7d22|\u67e5\u627e|\u6700\u65b0|\u65b0\u95fb|\u8d8b\u52bf|\u7f51\u9875|\u7f51\u7ad9/)
  ) {
    selected.add("web_search");
    selected.add("web_extract");
  }

  const complex = ecommerce || multiDeliverable;
  if (complex && !ecommerce && !focusedImageModel) selected.add("plan_design");
  if (autoQualityReview && !focusedImageModel && (boundedDeliverable || complex)) {
    selected.add("verify_design");
  }

  if (matches(input, /\b(?:manual vision|analyze screenshot|visual analysis|score this design)\b|\u622a\u56fe\u5206\u6790|\u89c6\u89c9\u5206\u6790|\u8bbe\u8ba1\u8bc4\u5206/)) {
    selected.add("export_node_image");
    selected.add("analyze_design");
  }

  if (autoQualityReview && matches(
    input,
    /\b(?:verify|review|quality check|inspect the design|score the design)\b|\u8d28\u68c0|\u68c0\u67e5\u8bbe\u8ba1|\u8bc4\u5ba1|\u8bbe\u8ba1\u8bc4\u5206/,
  )) {
    selected.add("review_and_adjust");
    selected.add("verify_design");
  }

  // A+ is a flattened image-model deliverable by default. Canvas authoring and
  // deterministic exports are available only when the user explicitly asks
  // for an editable/layered source project.
  if (amazonAPlus && ecommerceIntent.isEditable) {
    selected.add("add_frame");
    selected.add("export_node_image");
  }

  // A request to generate a final image always needs one tool. References are
  // passed to generate_image; exposing edit/canvas tools only adds ambiguity.
  if (directImageRequest) {
    const directTools = new Set(["generate_image"]);
    if (imageResearchRequired) {
      directTools.add("web_search");
      directTools.add("web_extract");
    }
    if (autoQualityReview || selected.has("verify_design")) {
      if (getFinalImagePromptMode(userInput) !== "verbatim") {
        directTools.add("edit_image");
      }
      directTools.add("verify_design");
    }
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

  // Source photo + promo/background/edit intent: image-model tools only.
  // Do not expose canvas poster assembly (add_text / add_rect / frames).
  if (imageModelBitmap) {
    const bitmapTools = new Set(["generate_image", "edit_image"]);
    if (imageResearchRequired) {
      bitmapTools.add("web_search");
      bitmapTools.add("web_extract");
    }
    if (autoQualityReview || selected.has("verify_design")) {
      bitmapTools.add("verify_design");
    }
    if (matches(input, /\b(?:remove background|background removal)\b|\u62a0\u56fe|\u53bb\u80cc\u666f/)) {
      bitmapTools.add("remove_background");
    }
    if (matches(input, /\b(?:upscale|super[- ]?resolution)\b|\u653e\u5927|\u8d85\u5206/)) {
      bitmapTools.add("upscale_image");
    }
    if (matches(input, /\b(?:inpaint|local redraw)\b|\u5c40\u90e8\u91cd\u7ed8/)) {
      bitmapTools.add("inpaint_image");
    }
    for (const reviewTool of [
      "review_and_adjust",
      "verify_design",
      "export_node_image",
      "analyze_design",
    ]) {
      if (selected.has(reviewTool)) bitmapTools.add(reviewTool);
    }
    return bitmapTools;
  }

  return selected;
}
