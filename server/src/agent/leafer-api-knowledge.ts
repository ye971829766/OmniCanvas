/**
 * LeaferJS API knowledge section — to be inserted into system-prompt.ts
 * This teaches the agent how LeaferJS actually works at the API level.
 */

export const LEAFER_API_KNOWLEDGE = `
<leafer_api>
## LeaferJS Canvas API — Complete Reference

You are controlling a LeaferJS (leafer-ui v2.x) infinite canvas. Understanding the Leafer API is CRITICAL for creating precise, professional designs.

### 1. Coordinate System & Transforms

**Coordinate Space:**
- Origin (0, 0) is top-left of the canvas viewport
- Positive X extends right, positive Y extends down
- All coordinates and sizes are in pixels (CSS pixels)
- The canvas is infinite — elements can be placed at any coordinate

**Position & Size Properties:**
- \`x\`: number — X coordinate (default: 0)
- \`y\`: number — Y coordinate (default: 0)
- \`width\`: number — Width in pixels
- \`height\`: number — Height in pixels

**Transform Properties (applied AFTER position):**
- \`scaleX\`: number — Horizontal scale (1 = 100%, 0.5 = 50%, 2 = 200%)
- \`scaleY\`: number — Vertical scale
- \`rotation\`: number — Rotation in DEGREES (0-360, clockwise)
- \`skewX\`: number — Horizontal skew in degrees
- \`skewY\`: number — Vertical skew in degrees

**Transform Origin:**
- By default, transforms apply from the element's center
- Use \`origin\` property to change: \`{ x: 0.5, y: 0.5 }\` (center), \`{ x: 0, y: 0 }\` (top-left)

### 2. Leafer Node Types & Properties

**Text:**
\`\`\`typescript
{
  type: 'text',
  text: string,              // The text content
  x: number, y: number,
  fontSize: number,          // Font size in pixels
  fontFamily: string,        // Font family name
  fontWeight: 'normal' | 'bold' | 'light',
  fill: string,              // Text color (CSS color)
  textAlign: 'left' | 'center' | 'right',
  lineHeight: number,        // Line height multiplier (e.g., 1.5)
  letterSpacing: number,     // Letter spacing in pixels
  opacity: number,           // 0-1
  width?: number,            // Wrap width (optional)
  stroke?: string,           // Text outline color
  strokeWidth?: number,      // Text outline width
}
\`\`\`

**Rect (Rectangle/Box):**
\`\`\`typescript
{
  type: 'rect',
  x: number, y: number,
  width: number, height: number,
  fill: string,              // Fill color
  cornerRadius: number,      // Border radius (all corners, or [tl,tr,br,bl])
  stroke: string,            // Border color
  strokeWidth: number,       // Border width
  opacity: number,           // 0-1
  gradient?: {               // Linear gradient
    from: string,            // Start color
    to: string,              // End color
    direction: number,       // Angle in degrees (0=left-to-right, 90=top-to-bottom)
  },
  shadow?: {                 // Drop shadow
    x: number, y: number,    // Shadow offset
    blur: number,            // Blur radius
    color: string,           // Shadow color
  },
}
\`\`\`

**Image:**
\`\`\`typescript
{
  type: 'image',
  x: number, y: number,
  width: number, height: number,
  url: string,               // Image URL (http/https or data URI)
  opacity: number,
  cornerRadius: number,
}
\`\`\`

**Frame (Container/Artboard):**
\`\`\`typescript
{
  type: 'frame',
  x: number, y: number,
  width: number, height: number,
  fill: string,              // Background color
  overflow: 'hide' | 'show', // Clip children to bounds

  // Flow Layout (auto-layout children):
  flow: 'x' | 'y',           // 'x' = horizontal, 'y' = vertical
  flowAlign: 'top-left' | 'top' | 'top-right' |
             'left' | 'center' | 'right' |
             'bottom-left' | 'bottom' | 'bottom-right',
  flowWrap: boolean,         // Wrap to next line/column
  gap: number,               // Space between items
  padding: number,           // Inner padding (all sides)
}
\`\`\`

**Group (Grouping Container):**
\`\`\`typescript
{
  type: 'group',
  x: number, y: number,
  // Children are positioned relative to the group's (x, y)
  // Groups don't have width/height — they auto-size to children
}
\`\`\`

**Other Shapes:**
- \`Ellipse\`: \`{ type: 'ellipse', x, y, width, height, fill, stroke, strokeWidth }\`
- \`Polygon\`: \`{ type: 'polygon', points: number[], fill, stroke }\`
- \`Star\`: \`{ type: 'star', x, y, width, height, points: number, innerRadius: number }\`
- \`Line\`: \`{ type: 'line', x, y, toX: number, toY: number, stroke, strokeWidth }\`

### 3. Hierarchy & Nesting

**Parent-Child Relationships:**
- Use \`parentId\` to nest elements inside containers (Frame or Group)
- When \`parentId\` is set, the child's \`x\` and \`y\` are RELATIVE to the parent's top-left corner
- When \`parentId\` is omitted, the element is on the ROOT canvas (absolute coordinates)

**Z-Index / Stacking Order:**
- Use \`zIndex\` property to control layering (higher = on top)
- Default \`zIndex\` is 0
- Negative values push elements behind
- Elements are drawn in the order they're added if \`zIndex\` is equal

**Example: Card with nested elements**
\`\`\`
Frame (parentId: none, x: 100, y: 100, width: 400, height: 300)
  ├─ Rect (parentId: frameId, x: 0, y: 0, width: 400, height: 300) — background
  ├─ Image (parentId: frameId, x: 20, y: 20, width: 360, height: 180) — hero
  └─ Text (parentId: frameId, x: 20, y: 220, fontSize: 32) — title
\`\`\`

### 4. Flow Layout (Auto-Layout)

Frames can act as **flex containers** using the \`flow\` property:

**Horizontal Flow (\`flow: 'x'\`):**
- Children stack left-to-right
- \`gap\` controls horizontal spacing
- \`flowAlign\`: 'top-left', 'left', 'bottom-left' (vertical alignment within row)

**Vertical Flow (\`flow: 'y'\`):**
- Children stack top-to-bottom
- \`gap\` controls vertical spacing
- \`flowAlign\`: 'top-left', 'top', 'top-right' (horizontal alignment within column)

**Padding:**
- \`padding\` adds inner space on all sides of the frame before laying out children

**When to use:**
- Card layouts (vertical flow with gap)
- Button groups (horizontal flow with gap)
- Menus, lists, grids
- DON'T use flow if you need precise pixel positioning — use manual x/y instead

### 5. Visual Effects

**Opacity:**
- \`opacity: 0-1\` — 0 = invisible, 1 = opaque
- Applies to the entire element and its children

**Shadows:**
\`\`\`typescript
shadow: {
  x: number,        // Horizontal offset
  y: number,        // Vertical offset
  blur: number,     // Blur radius
  color: string,    // Shadow color (with alpha for softness)
}
\`\`\`

**Blur (not yet fully supported in all tools — use with caution)**

**Blend Modes (advanced):**
- \`blendMode\`: 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten'

### 6. Common Patterns

**Creating a Card:**
\`\`\`
1. add_frame({ width: 400, height: 300, fill: '#fff', cornerRadius: 16 })
2. add_rect({ parentId: frameId, x: 0, y: 0, width: 400, height: 200, fill: '#f4f4f5' }) — bg
3. add_text({ parentId: frameId, x: 20, y: 220, text: 'Title', fontSize: 28 })
\`\`\`

**Creating a Rotated Element:**
\`\`\`
1. add_rect({ x: 200, y: 200, width: 100, height: 100, fill: '#f00' })
2. update_node({ refId: rectId, rotation: 45 }) — rotate 45° clockwise
\`\`\`

**Creating a Button:**
\`\`\`
1. add_rect({ x: 100, y: 100, width: 120, height: 50, fill: '#6d28d9', cornerRadius: 8 })
2. add_text({ parentId: rectId, text: 'Click Me', fontSize: 16, fill: '#fff', textAlign: 'center' })
   — center the text by setting x: (width - textWidth) / 2, or use flow layout on the rect
\`\`\`

**Creating a Group for Batch Transform:**
\`\`\`
1. add_group({ x: 0, y: 0 }) — create group at origin
2. add_rect({ parentId: groupId, x: 0, y: 0, width: 50, height: 50 })
3. add_rect({ parentId: groupId, x: 60, y: 0, width: 50, height: 50 })
4. update_node({ refId: groupId, rotation: 30 }) — rotate entire group
\`\`\`

### 7. Leafer-Specific Constraints & Gotchas

**Properties MUST be plain numbers:**
- ❌ WRONG: \`fontSize: { value: 32 }\`
- ✅ CORRECT: \`fontSize: 32\`

**Coordinates are absolute on root canvas:**
- If \`parentId\` is omitted, the element's \`x\` and \`y\` are in canvas space
- If you place at \`x: 2000\`, it will be 2000px right of the viewport origin

**Frames clip children by default:**
- Children positioned outside the frame's \`width\` × \`height\` bounds will be clipped
- To allow overflow, set \`overflow: 'show'\` (if supported by your Leafer version)

**Text doesn't auto-wrap unless \`width\` is set:**
- If you want multi-line text, set \`width\` property
- Text will wrap at word boundaries

**Images load asynchronously:**
- The canvas will show a placeholder until the image loads
- Generation tools (\`generate_image\`, \`generate_video\`) return a \`refId\` immediately but the actual media URL arrives later

**Transform order:**
- Leafer applies transforms in this order: translate (x, y) → rotate → scale → skew
- The visual result is: element moves to (x, y), then rotates around its center, then scales

### 8. Tool Mapping to Leafer Properties

When calling tools, you are directly setting Leafer properties:

- \`add_text\` → creates a Leafer \`Text\` node
- \`add_rect\` → creates a Leafer \`Rect\` node
- \`add_frame\` → creates a Leafer \`Frame\` node
- \`update_node\` → modifies properties of an existing node
- \`remove_node\` → removes a node from the canvas

**All properties are pass-through:** When you pass \`{ rotation: 45 }\` to \`update_node\`, it directly sets the Leafer node's \`rotation\` property.

### 9. Best Practices for Canvas Control

1. **Use groups for complex compositions:** If you need to rotate/scale multiple elements together, wrap them in a group first.

2. **Use flow layout for dynamic content:** For card stacks, button groups, or lists, use \`flow\` instead of manual positioning.

3. **Set explicit z-index when layering matters:** Don't rely on creation order — set \`zIndex\` explicitly.

4. **Use meaningful dimensions:** Don't create tiny elements (< 10px) or huge elements (> 10,000px) unless necessary.

5. **Leverage hierarchy:** Use frames and groups to create semantic structure. A "card" should be a frame with children, not flat elements.

6. **Mind the coordinate space:** Always know whether you're working in root canvas space or relative to a parent.

7. **Transform from center by default:** Rotations and scales look more natural from the center. If you need corner-based, set \`origin\`.

8. **Use cornerRadius generously:** Rounded corners (8-16px) make designs feel modern and polished.

</leafer_api>
`;
