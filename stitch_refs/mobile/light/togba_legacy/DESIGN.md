# Design System Specification: The Institutional Heritage

## 1. Overview & Creative North Star: "The Digital Curator"
This design system is not a utility; it is an inheritance. To support a high-end Family ERP, the interface must move away from the "busy-ness" of traditional enterprise software and toward the quiet confidence of a private wealth gallery. 

The **Creative North Star** is **The Digital Curator**. Like a well-organized physical archive, the system uses expansive whitespace, intentional asymmetry, and "tonal layering" to manage complex data. We reject the "template" look. Instead of rigid grids, we use breathing room as a structural element, ensuring that "Institutional-Grade" feels like "Sophisticated Simplicity."

---

## 2. Colors: Tonal Architecture
We move beyond flat hex codes to a system of functional layers. The palette is designed to feel "breathable," using high-reflectance whites and deep, meaningful accents.

### The Palette (Core Tokens)
*   **System Primary:** `primary` (#0058bc) — Authority and continuity.
*   **Financial Growth:** `secondary` (#006e28) — Prosperity and stability.
*   **The Alert Tier:** `tertiary` (#894d00) for warnings; `error` (#ba1a1a) for critical SOS actions.

### The "No-Line" Rule
Standard 1px solid borders are strictly prohibited for sectioning. This is a signature rule to ensure a premium feel. Boundaries must be defined through:
1.  **Background Shifts:** Placing a `surface-container-low` section against a `surface` background.
2.  **Tonal Transitions:** Using the `surface-variant` to imply a change in context without a "harsh" stroke.

### The "Glass & Gradient" Rule
To add "soul" to the institutional frame, use Glassmorphism for floating navigation or utility panels. Use `surface-container-lowest` with a 80% opacity and a 20px backdrop-blur. 
*   **Signature Textures:** For primary CTAs, apply a subtle linear gradient from `primary` (#0058bc) to `primary_container` (#0070eb) at a 135° angle to create a sense of tactile depth.

---

## 3. Typography: Editorial Authority
We utilize **Inter** (or SF Pro) to bridge the gap between technical precision and editorial grace.

*   **Display (lg/md/sm):** Used for "Hero" moments like net worth overviews. Tracking should be set to -0.02em to feel tight and custom.
*   **Headline (lg/md/sm):** Reserved for section headers. These should have generous `top-margin` (using scale `12` or `16`) to let the content breathe.
*   **Title (lg/md/sm):** Used for card titles and prominent labels.
*   **Body (lg/md/sm):** Our workhorse. `body-md` (0.875rem) is the standard for data entry to maintain a high information density without clutter.
*   **Label (md/sm):** Small-caps or high-contrast weight (Medium/Semi-Bold) to indicate metadata or micro-copy.

---

## 4. Elevation & Depth: Tonal Layering
In this system, depth is not "added"—it is "revealed."

### The Layering Principle
We stack `surface-container` tiers to create a natural hierarchy. 
*   **Level 0 (Base):** `surface` (#f9f9fe).
*   **Level 1 (Sections):** `surface-container-low` (#f3f3f8).
*   **Level 2 (Interactive Cards):** `surface-container-lowest` (#ffffff).

### Ambient Shadows
Avoid the "drop shadow" look. If an element must float (e.g., a modal or a floating action button), use an **Ambient Shadow**:
*   **Blur:** 32px to 64px.
*   **Opacity:** 4% to 6%.
*   **Color:** Use a tinted version of `on-surface` (#1a1c1f) rather than pure black to keep the shadows "soft" and integrated.

### The "Ghost Border" Fallback
If accessibility requires a border (e.g., in a high-density table), use the **Ghost Border**: `outline-variant` (#c1c6d7) at 20% opacity. Never use 100% opaque lines.

---

## 5. Components: Tactile Minimalism

### Buttons
*   **Primary:** High-contrast gradient (`primary` to `primary_container`). `xl` (1.5rem) rounded corners.
*   **Secondary:** `surface-container-high` background with `on-surface` text. No border.
*   **Tertiary:** Ghost style. Transparent background, `primary` text, subtle underline on hover.

### Cards & Lists (The "Anti-Divider" Pattern)
*   **Cards:** Use `lg` (1rem) or `xl` (1.5rem) corner radius. 
*   **Lists:** Forbid the use of divider lines between list items. Use the Spacing Scale (specifically `spacing-3` or `spacing-4`) to create "gutter" space that naturally separates items.

### Input Fields
*   **Style:** `surface-container-lowest` background with a `Ghost Border`. 
*   **State:** On focus, the border transitions to `primary` with a 4px "soft-glow" outer shadow of the same color at 10% opacity.

### Legacy Ledger (Custom Component)
For financial tracking, use an asymmetrical layout: a large `display-md` balance on the left, with a staggered `surface-container-low` list of transactions on the right. This breaks the "Excel-grid" feel and moves into "Family Office" territory.

---

## 6. Do’s and Don’ts

### Do:
*   **Do** use asymmetrical margins. If the left margin is `spacing-8`, consider a right margin of `spacing-12` for editorial flair.
*   **Do** use `surface-bright` for highlights within a nested container to guide the eye.
*   **Do** ensure all interactive elements have a minimum touch target of 44px, despite the "refined" look.

### Don't:
*   **Don't** use pure black (#000000) for text. Always use `on-surface` (#1a1c1f) to maintain the premium, soft-contrast feel.
*   **Don't** use "Alert Orange" or "SOS Red" for decorative elements. These are reserved strictly for high-priority system states.
*   **Don't** cram content. If a screen feels full, it is a sign to introduce a "Surface Nesting" layer or increase whitespace.