# Design System Specification: Institutional Dark Mode

## 1. Overview & Creative North Star

**Creative North Star: The Sovereign Vault**
This design system is not a mere utility; it is a digital representation of a private family office’s heritage and security. We move away from the "SaaS-standard" look of rigid grids and heavy borders, opting instead for **The Sovereign Vault** aesthetic. This approach treats the interface as a series of monolithic, carved surfaces and light-filled voids.

The goal is to convey "quiet luxury" through **Intentional Asymmetry** and **Tonal Depth**. Instead of lining up every card in a predictable grid, we use expansive whitespace and overlapping surface layers to create a bespoke, editorial feel that prioritizes data clarity and institutional prestige.

---

## 2. Colors & Surface Logic

### The "No-Line" Rule
Traditional ERPs rely on 1px borders to separate data. In this system, **1px solid borders are prohibited for sectioning.** Boundaries must be defined through background color shifts. For example, a `surface-container-low` section sits directly on a `surface` background. This creates a cleaner, more sophisticated transition that mimics architectural shadows rather than a technical drawing.

### Surface Hierarchy & Nesting
We treat the UI as a physical stack of semi-translucent materials.
- **Base Layer:** `surface` (#0b1326) — The deep, midnight foundation.
- **The Nested Stack:** To create depth, stack containers using the tier system. A `surface-container-lowest` card should reside within a `surface-container-low` sidebar. This "step-up" logic creates natural focus without visual clutter.
- **The Glass & Gradient Rule:** For floating modals or high-level navigation, use `surface-bright` with a 12px backdrop-blur and 80% opacity. For main CTAs, apply a subtle linear gradient from `primary` (#adc6ff) to `primary-container` (#4d8eff) at a 135-degree angle to provide a "lit-from-within" glow.

---

## 3. Typography: Editorial Authority

We use **Inter** exclusively, but we treat it with the spacing and scale of a high-end financial journal.

*   **Display & Headlines:** Use `display-md` (2.75rem) for portfolio totals and key performance indicators. Use `headline-lg` (2rem) for section titles. These must always use `on-surface` (#dae2fd) at 100% opacity for maximum "high-contrast" authority.
*   **Body & Labels:** Secondary information uses `body-md` (0.875rem) with `on-surface-variant` (#c2c6d6). This silver/slate tone ensures that secondary data recedes, allowing the primary figures to "pop."
*   **The Hierarchy of Trust:** Typography is our primary tool for hierarchy. Use `label-md` in all-caps with 0.05em tracking for metadata to create an institutional, organized feel.

---

## 4. Elevation & Depth

### The Layering Principle
Depth is achieved through **Tonal Layering**, not structural lines. 
- **Interaction Depth:** When a user hovers over a `surface-container`, shift the background color one step higher (e.g., from `surface-container-low` to `surface-container-high`) rather than adding a shadow.

### Ambient Shadows
Shadows are reserved only for "floating" elements like dropdowns or popovers.
- **The Vault Shadow:** Use a large blur (32px to 64px) with a very low opacity (6%). The shadow color should not be black; use a tinted version of `surface-container-lowest` (#060e20) to mimic the natural occlusion of light in a deep blue environment.

### The "Ghost Border" Fallback
If a visual boundary is required for accessibility in complex data tables, use the **Ghost Border**: `outline-variant` (#424754) at 15% opacity. It should be felt, not seen.

---

## 5. Components

### Buttons
- **Primary:** Gradient-filled (`primary` to `primary-container`). 16px (`xl`) corner radius. Text is `on-primary-container` (#00285d).
- **Secondary:** Transparent background with a `Ghost Border`. On hover, fill with `surface-variant` at 20% opacity.
- **Tertiary:** Text-only using `primary-fixed-dim` (#adc6ff).

### Cards & Lists
- **Rule:** Forbid the use of divider lines. 
- **Implementation:** Separate list items using 12px of vertical whitespace (`spacing-3`) or by alternating between `surface-container-low` and `surface-container-lowest` backgrounds. 
- **Radius:** All cards must use `rounded-lg` (16px) to maintain the "sleek, modern" requirement.

### Input Fields
- **Background:** `surface-container-highest` (#2d3449).
- **State:** On focus, the `Ghost Border` transitions to 100% opacity `primary` with a subtle 4px outer glow (using the `primary` color at 10% opacity).
- **Typography:** Input text uses `body-lg`; labels use `label-md` sitting 8px above the field.

### Specialized Component: The Asset Ribbon
A horizontal scrolling container for real-time tickers. Use a `surface-container-lowest` background with no border, and a subtle left-to-right fade mask using a linear gradient of the background color to create a "disappearing" effect.

---

## 6. Do’s and Don'ts

### Do
*   **Do** use `secondary` (#4edea3) for all positive financial growth indicators; it is the "Finance Green" of the system.
*   **Do** use `tertiary` (#ffb95f) for warnings or "Alert Orange" scenarios.
*   **Do** lean into `xl` (1.5rem) spacing for outer page margins to create a prestigious, uncrowded feel.
*   **Do** use asymmetric layouts (e.g., a wide 8-column main content area paired with a slim 3-column contextual sidebar).

### Don't
*   **Don't** use pure white (#FFFFFF) for body text; it causes "haloing" in dark mode. Stick to `on-surface` (#dae2fd).
*   **Don't** ever use a 100% opaque, high-contrast border to separate sections.
*   **Don't** use standard "drop shadows" with 0 blur. This is a high-end system; shadows must be soft, expansive, and atmospheric.
*   **Don't** cram data. If a table feels tight, increase the `surface-container` padding rather than shrinking the font.