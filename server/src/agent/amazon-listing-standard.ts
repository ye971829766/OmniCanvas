/**
 * Gold-standard quality bar for Amazon listing / A+ imagery.
 *
 * Distilled from production-qualified listing systems, including the apparel
 * demo in `amazon-demo/`. It is a category-neutral quality floor whenever the
 * agent generates Amazon 主图 / 套图 / listing / A+ images.
 *
 * This is a *quality and composition* standard, not a product-identity template:
 * never copy the demo brand, model, claims, or exact layouts onto unrelated products.
 */

export const AMAZON_LISTING_STANDARD_VERSION = 'amazon-listing-v1';

/** Shared visual system every image in an Amazon suite must obey. */
export const AMAZON_SUITE_VISUAL_SYSTEM = {
  background: {
    productAndModel: 'pure white RGB (#FFFFFF) or soft cool light-gray seamless studio',
    outdoorBenefit: 'clean outdoor / sky backdrop only when the claim needs environment proof',
    macroFill: 'full-bleed product material crop filling the frame',
    forbidden: 'busy clutter, gradient rainbow backgrounds, fake storefront UI, lifestyle rooms packed with props',
  },
  photography: {
    lighting: 'soft even commercial studio light, controlled speculars, natural skin and true fabric color',
    productScale: 'product (or worn product) occupies ~75–85% of the frame; complete silhouette, safe margins from edges',
    identity: 'lock colorway, silhouette, seams, logos, labels, and proportions to refImages; never invent construction',
    model: 'when a person is category-appropriate, keep identity and styling coherent; use natural interaction rather than stock-photo stiffness',
    polish: 'razor-sharp focus on product, clean edge separation, subtle realistic shadow only when physically plausible',
  },
  typography: {
    language: 'English editorial ecommerce typography unless the user requires another language',
    hierarchy: 'one dominant category-appropriate title + one short subtitle when copy adds value; avoid paragraph body copy',
    placement: 'titles live in deliberate zones: dark bottom banner, side text column, or over macro with safe padding',
    size: 'mobile-thumbnail readable; never tiny multi-line paragraphs or dense tables of invented specs',
    ambient: 'optional large low-opacity watermark words (e.g. activity names) for atmosphere only — never covering the product',
  },
  graphics: {
    icons: 'thin white line icons in a single row (max 4), equal size, short label under each',
    panels: 'white or light gutters between multi-panel collages; 2–3 panels max per image',
    banners: 'semi-transparent dark bottom bar for one bold claim + one supporting line',
    accents: 'restrained gold/light ray or simple measurement lines only when they explain a real feature',
    forbidden: 'random emoji, neon badges, "BEST SELLER" stickers, star ratings, prices, cart buttons, competitor logos',
  },
  copyRules: {
    noneOnMain: 'Amazon main image: ZERO promotional text, badges, borders, or watermarks (product-printed marks OK)',
    verifiedOnly: 'any claim, %, material, size, or certification must come from user-supplied facts — never invent',
    oneClaimPerInfographic: 'each infographic sells ONE core benefit with visual proof',
  },
} as const;

/**
 * Canonical 11-slot purchase narrative mirrored from the qualified demo suite.
 * Default suites take the first 6; full suites may use up to 8.
 */
export const AMAZON_GOLD_STANDARD_ROLES = [
  {
    slot: 1,
    role: 'main',
    demoRef: 'HL-1 / HL-10 style',
    title: 'Amazon 主图（合规英雄图）',
    summary:
      'Pure white studio, product-dominant hero. Model front or product-only. No text, no props clutter. Thumbnail-readable silhouette.',
  },
  {
    slot: 2,
    role: 'lifestyle',
    demoRef: 'HL-2 / HL-9 style',
    title: 'Amazon 使用/质感动作图',
    summary:
      'Same studio family; model interacts with product (pull hem, open, hold, wear-in-motion) to prove drape, stretch, or scale. Still no promotional chrome.',
  },
  {
    slot: 3,
    role: 'secondary_angle',
    demoRef: 'HL-3 / HL-11 style',
    title: 'Amazon 补充视角图',
    summary:
      'Alternate reliable angle: back view, three-quarter, or ghost-mannequin / flat product on pure white. Identity-locked, no invented hidden sides.',
  },
  {
    slot: 4,
    role: 'infographic',
    demoRef: 'HL-4 style',
    title: 'Amazon 单卖点信息图',
    summary:
      'Product in a clean scene that proves ONE benefit. Dark bottom banner: bold English headline + short subline + optional large verified number. One claim only.',
  },
  {
    slot: 5,
    role: 'material',
    demoRef: 'HL-6 style',
    title: 'Amazon 材质微距信息图',
    summary:
      'Full-bleed macro of real material texture. Center title + small fact chip. Bottom icon row (≤4) with short benefit labels grounded in user facts or visible traits.',
  },
  {
    slot: 6,
    role: 'detail',
    demoRef: 'HL-7 style',
    title: 'Amazon 做工细节拼图',
    summary:
      '2–3 equal panels of real close-ups (tag, seam, hardware, stretch action). Each panel: TITLE + one short subtitle. White gutters, calm hierarchy.',
  },
  {
    slot: 7,
    role: 'multi_scenario',
    demoRef: 'HL-5 style',
    title: 'Amazon 多场景对比图',
    summary:
      'Split or dual lifestyle occasions matching category. Large ambient typography optional. Model size notes only if user supplied measurements.',
  },
  {
    slot: 8,
    role: 'specification',
    demoRef: 'HL-8 style',
    title: 'Amazon 尺码/规格图',
    summary:
      'Flat or worn product with clear measurement guides + attribute sliders (only verified) + size table only from user data. Care icons optional. No invented numbers.',
  },
] as const;

/** Compact block injected into agent system prompts for Amazon work. */
export const AMAZON_LISTING_GOLD_STANDARD = `<amazon_listing_gold_standard>
<policy_version>${AMAZON_LISTING_STANDARD_VERSION}</policy_version>
Whenever the user asks for Amazon listing images, use a category-neutral catalog quality bar rather than copying the apparel demo or falling back to generic AI packshots.

Shared suite system:
- Lock product identity to the supplied reference roles: silhouette, proportions, colorway, labels, logos, packaging, and visible construction.
- Keep a coherent lighting/color family across the gallery while varying purpose, scale, camera, and setting enough that every image adds new purchase information.
- Main image: pure white, complete product silhouette, roughly 80–85% of the square, zero promotional text/badges/props.
- Supporting images: choose category-appropriate roles from reference-supported view/crop, authentic use, visible detail, material/surface, scale/context, compatibility, packaging, use steps, or verified visual evidence.
- A single reference image does not authorize invented back/inside/sole views, materials, seams, components, model numbers, or performance behavior.
- If no factual selling points were supplied, use text-free visual storytelling. Do not manufacture claims merely to fill an infographic template.
- Typography and graphic devices are optional, not mandatory. When copy adds value, keep it short, readable, category-appropriate, and grounded in user-provided facts.
- Never add cart UI, ratings, prices, BEST SELLER stickers, competitor marks, or Chinese marketplace PDP chrome.
- A+ Content is a multi-module catalog/brand content layout, never a shopping-cart PDP.

Preflight each bitmap:
□ Product identity and visible facts match references
□ Chosen role is supported and useful for this category
□ No fabricated hidden view, material, construction, claim, size, certification, or technology
□ Main image has no promotional text/chrome
□ size and aspectRatio agree; listing images are square 2000×2000 unless user/A+ specifies otherwise
□ quality "high" for final output
</amazon_listing_gold_standard>`;

/** Role-specific production prompt seeds aligned with the gold-standard demo. */
export const AMAZON_ROLE_PROMPT_SEEDS = {
  main:
    'Amazon-compliant main listing image, pure white seamless studio, product or worn product fills 80-85% of frame, complete silhouette, soft even commercial lighting, true material color, no text no badges no props clutter, thumbnail-readable, catalog photography finish',
  lifestyle:
    'premium Amazon category-appropriate lifestyle or real-use scene, natural interaction without implying unverified performance, product remains clearly identifiable, coherent commercial lighting, no promotional text unless requested',
  secondary_angle:
    'premium Amazon supporting product view on pure white, using only an angle, crop, grouping, packaging, or scale view supported by references; never invent a hidden side; exact product identity, crisp catalog lighting, no text',
  infographic:
    'premium Amazon visual-evidence image for one user-supplied fact, category-appropriate composition and optional short readable title; if no verified fact exists, make the image text-free instead of inventing a claim; no cart UI',
  material:
    'premium Amazon macro of a real visible product material or surface, grounded in the reference image; optional short verified label only when supplied, no invented composition, benefits, icons, or specs',
  detail:
    'premium Amazon visible-detail image or two-to-three-panel collage, using only reference-supported details; calm commercial lighting and optional verified labels, never invented internal construction',
  multi_scenario:
    'premium Amazon dual-occasion lifestyle split, two clean real-use scenes for the product category, large low-opacity ambient typography optional, model size notes only if user-supplied, product clearly visible in both panels',
  specification:
    'premium Amazon size or specification chart, flat or worn product with clear measurement guides, attribute sliders only for user-supplied traits, size table only from user data, care icons optional, clean white catalog layout, no invented numbers',
  comparison:
    'refined Amazon comparison module, simple two-column layout, large product views, few large verified labels, no competitor branding or prices',
  a_plus:
    'premium Amazon A+ Content multi-module catalog page, desktop educational layout, English editorial typography, white commercial background, stacked brand hero feature grid material close-ups lifestyle strip optional size block, no shopping cart UI',
  scale:
    'clean Amazon scale-reference product photography, believable human or environmental scale, product proportions exact, premium catalog styling, no guessed dimensions',
} as const;
