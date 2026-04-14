# Design System Specification: Workplace Pattern Management

## 1. Overview & Creative North Star
**Creative North Star: "The Architectural Curator"**
This design system moves beyond the utility of a standard dashboard to create an environment of "Architectural Clarity." By treating workplace patterns not just as data, but as a rhythmic composition, we use intentional white space, tonal layering, and sophisticated typography to reduce cognitive load.

The system rejects the "boxed-in" aesthetic of traditional enterprise software. Instead, it utilizes **Organic Asymmetry** and **Soft Depth** to guide the eye. We prioritize the "Editorial Feel"—where the hierarchy is so clear that structural lines become unnecessary. The interface should feel like a premium, well-organized physical workspace: tactile, airy, and professional.

---

## 2. Colors & Surface Logic
The palette is rooted in a "Cool Slate" foundation, punctuated by a "Deep Ultramarine" that commands authority.

### Core Palette (Material Design Tokens)
- **Primary (`#233d9d`):** The anchor. Used for high-intent actions.
- **Primary Container (`#3e56b6`):** The functional blue. Used for active states and primary buttons.
- **Surface/Background (`#f8f9fb`):** The canvas. A cool-toned neutral that prevents eye strain.
- **Secondary (`#9a25ae`):** The "Shift A" / "Management" accent.
- **Tertiary (`#920005`):** The "Urgency" / "Off-Duty" accent.

### The "No-Line" Rule
To maintain the "Architectural" feel, **1px solid borders are prohibited** for defining major sections or cards. We define boundaries through tonal shifts:
- **Surface-Container-Lowest (`#ffffff`):** Use for primary interactive cards.
- **Surface-Container-Low (`#f2f4f6`):** Use for sidebar or secondary navigation backgrounds.
- **Surface-Container (`#edeef0`):** Use for "wells" or nested data areas within cards.

### The "Glass & Gradient" Rule
Standard flat colors lack "soul."
- **CTAs:** Use a subtle vertical gradient from `primary_container` to `primary` to give buttons a slight convex, tactile feel.
- **Floating Overlays:** Use `surface_container_lowest` with an 80% opacity and a `20px` backdrop-blur to create a "Glassmorphism" effect for modals and datepicker popovers.

---

## 3. Typography
We utilize a dual-typeface system to balance "Editorial Authority" with "Functional Precision."

- **Display & Headlines (Manrope):** A geometric sans-serif that brings a modern, architectural character.
    - *Usage:* `headline-lg` (2rem) for page titles; `headline-sm` (1.5rem) for section headers.
- **Body & Labels (Inter):** A highly legible workhorse for data-heavy views.
    - *Usage:* `body-md` (0.875rem) for table data; `label-md` (0.75rem) for shift badges and field labels.
- **Hierarchy through Weight:** Use *Semi-Bold (600)* for headers to create a stark contrast against *Regular (400)* body text, ensuring the user can scan workplace patterns at a glance.

---

## 4. Elevation & Depth
Depth is a functional tool, not a decoration.

- **The Layering Principle:**
    - Level 0: `surface` (The base).
    - Level 1: `surface_container_lowest` (Cards).
    - Level 2: `surface_bright` (Active elements within cards).
- **Ambient Shadows:** For floating elements (Modals/Datepickers), use an extra-diffused shadow: `0px 12px 32px rgba(25, 28, 30, 0.06)`. This mimics soft, natural office lighting.
- **The Ghost Border:** If a boundary is required for accessibility (e.g., input fields), use `outline_variant` at **15% opacity**. Never use 100% black or grey borders.

---

## 5. Components

### Primary & Secondary Buttons
- **Shape:** `DEFAULT` (0.5rem/8px) rounding.
- **Primary:** `primary_container` background with `on_primary` text. On hover, transition to `primary` with a slight `elevation-sm` lift.
- **Secondary:** Transparent background with `primary` text and a `Ghost Border`.

### Input Fields
- **Styling:** No bottom line. Use a solid `surface_container_low` background with 8px rounding.
- **Interaction:** On focus, the background shifts to `surface_container_lowest` with a 1px `primary` "Ghost Border" (20% opacity).

### Status Badges & Chips
- **Shifts:** Use low-saturation backgrounds with high-saturation text (e.g., Shift A: `secondary_fixed` background with `on_secondary_fixed_variant` text).
- **Shape:** `full` (9999px) rounding for a distinct "pill" look that contrasts against the rectangular data grid.

### Data Tables & Calendar Views
- **No Dividers:** Forbid horizontal and vertical lines. Use `8px` of vertical whitespace (`spacing-2`) between rows.
- **The "Zebra" Alternative:** Use `surface_container_low` on every second row or as a hover state to highlight data without using lines.
- **Calendar Cells:** Active days should use `primary_fixed` with `on_primary_fixed` text, creating a soft but clear focal point.

### Datepicker (High-End Editorial Implementation)
Instead of a cramped pop-up, the datepicker should feel like a "floating sheet." Use `Glassmorphism` for the container. The current date should be marked not with a box, but with a `primary` dot underneath the number, maintaining a clean, minimal aesthetic.

---

## 6. Do's and Don'ts

### Do:
- **Use "Breathing Room":** Use `spacing-6` (1.5rem) as your default margin between unrelated components.
- **Tonal Transitions:** Define the edge of a sidebar by changing the background color from `#f8f9fb` to `#f2f4f6`, not by drawing a line.
- **Optical Alignment:** Align labels to the baseline of the text they describe, not the top of the input box.

### Don't:
- **No Pure Black:** Never use `#000000`. Use `on_surface` (`#191c1e`) for text to maintain a premium, softer look.
- **No Heavy Shadows:** If a shadow is clearly visible, it is too dark. It should be felt, not seen.
- **No Rigid Grids:** Allow for intentional asymmetry—e.g., a left-aligned header with a right-aligned "Action Group" that sits slightly higher than the content below it.
