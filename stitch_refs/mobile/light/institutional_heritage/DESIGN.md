# Design System Strategy: The Institutional Heritage

## 1. Overview & Creative North Star
**Creative North Star: "The Digital Curator"**

This design system is built to bridge the gap between centuries-old institutional trust and the precision of modern financial technology. We are moving away from the "generic SaaS" look—characterized by stark white voids and harsh lines—and moving toward a high-end, editorial experience that feels curated, quiet, and intentional.

To achieve this, we employ **Tonal Zoning**. Instead of using white space to separate ideas, we use a sophisticated palette of tinted neutrals to create a sense of place. The layout should feel like a well-organized physical dossier: layered, substantial, and textured. We break the grid with intentional asymmetry, using oversized typography to anchor sections while allowing "breathable" margins to suggest luxury through restraint.

---

## 2. Colors: Tonal Zoning & Atmosphere
Our palette moves away from pure `#FFFFFF`. We use the `surface` and `surface-container` tiers to build a world of soft pastels that define functional areas without the need for visual noise.

### The "No-Line" Rule
Prohibit the use of 1px solid borders for sectioning. Structural boundaries must be defined solely through background color shifts. 
- Use `surface_container_low` (#f3f3f8) for secondary sidebars.
- Use `surface_container` (#ededf2) for main content areas.
- Use `surface_container_high` (#e8e8ed) to highlight active interactive zones.

### Surface Hierarchy & Nesting
Treat the UI as physical layers. An inner card should not just be "placed" on a background; it should feel "nested."
- **Level 1 (Base):** `background` (#f9f9fe)
- **Level 2 (Section):** `surface_container_low` (#f3f3f8)
- **Level 3 (Information Card):** `surface_container_lowest` (#ffffff) — *Note: This is our only use of pure white, reserved for the highest level of "paper" prominence.*

### The "Glass & Gradient" Rule
To add soul to technical data, use **Glassmorphism** for floating navigation or modal overlays.
- **Tokens:** Apply `surface` at 80% opacity with a `24px` backdrop blur.
- **Signature Textures:** Use subtle linear gradients for primary actions (e.g., `primary` #0058bc to `primary_container` #0070eb) at a 135° angle to create a "gem-like" depth.

---

## 3. Typography: Technical Authority
We use **Inter** exclusively. Its neo-grotesque structure provides a "technical" counter-balance to our soft, pastel surfaces, ensuring the platform feels like a high-performance tool.

- **Display (display-lg, display-md):** Used for total portfolio values or high-level section headers. Tracking should be set to `-0.02em` to create a tight, editorial "locked-in" look.
- **Headline (headline-sm):** Used for card titles. These should always use the `on_surface` (#1a1c1f) color to ensure maximum legibility against pastel backgrounds.
- **Labels (label-md, label-sm):** Used for metadata and overlines. Use `on_surface_variant` (#414755) with `all-caps` and `+0.05em` letter spacing to evoke the feeling of a printed institutional report.

---

## 4. Elevation & Depth: The Stacking Principle
In this system, depth is a result of color contrast, not shadow. We avoid traditional drop shadows in favor of **Tonal Layering**.

- **The Layering Principle:** To lift a card, change its token from `surface_container` to `surface_container_lowest`. The shift from a light lavender-grey to a pure white provides a "natural" lift.
- **Ambient Shadows:** Shadows are only permitted for "flying" elements (Modals, Popovers). Use a multi-layered shadow:
  - `0px 4px 20px rgba(26, 28, 31, 0.04)`
  - `0px 8px 40px rgba(26, 28, 31, 0.08)`
- **The "Ghost Border" Fallback:** For accessibility in high-density data tables, use a "Ghost Border": `outline_variant` (#c1c6d7) at **15% opacity**. This provides a guide without interrupting the visual flow of the pastel containers.

---

## 5. Components

### Buttons
- **Primary:** Gradient from `primary` to `primary_container`. **ROUND_EIGHT** (8px) radius. No border. Text color: `on_primary`.
- **Secondary:** Surface-tinted. Background: `primary_fixed_dim`. Text: `on_primary_fixed`.
- **Tertiary:** Transparent background. Text: `primary`. Use for low-emphasis actions like "Cancel" or "View All."

### Cards & Lists
- **The No-Divider Rule:** Forbid the use of horizontal rules (`<hr>`). Use `spacing-5` (1.7rem) or a shift in `surface` color to separate list items.
- **Padding:** Always use `spacing-4` (1.4rem) for internal card padding to maintain a premium, spacious feel.

### Input Fields
- **Background:** `surface_container_lowest` (#ffffff).
- **Border:** `outline_variant` at 40% opacity.
- **Active State:** Border transitions to `primary` (#0058bc) at 100% opacity with a 2px thickness.
- **Corner Radius:** Fixed at `DEFAULT` (0.5rem / 8px).

### Data Visualization Chips
- **Growth:** `secondary_container` background with `on_secondary_container` text.
- **Warning:** Alert Orange background (15% opacity) with `on_surface` text.
- **Risk:** `error_container` background with `on_error_container` text.

---

## 6. Do's and Don'ts

### Do
- **Do** use `surface_container` variants to create "nests" for different data types.
- **Do** use `inter` bold for `title-sm` to create clear hierarchy in dense financial tables.
- **Do** allow for generous margins (`spacing-12` and above) between major sections to signal luxury.

### Don't
- **Don't** use pure black (#000000) for text; always use `on_surface` (#1a1c1f) to maintain the soft institutional tone.
- **Don't** use 1px solid borders to separate sections; it breaks the "editorial paper" illusion.
- **Don't** use "Default" shadows; if it looks like a standard web app, increase the blur and decrease the opacity until it disappears into the background.