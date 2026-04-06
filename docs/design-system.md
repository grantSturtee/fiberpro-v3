# FiberPro V3 Design System

A tonal, editorial design system for an internal operations tool. The goal is clarity at density — this is working software used by people who need to get things done fast, not a marketing site.

---

## Guiding Principles

**Tonal over bordered.** Structure comes from surface color shifts, not 1px lines between regions. Lines should only appear where they carry semantic meaning (a divider inside a card, a rule between sections within a form).

**Editorial density.** Information-dense layouts are correct. White space is used to group, not to pad. A table with 12 rows and a sidebar is appropriate for a project detail page.

**Restrained blue.** Primary blue (`#005bc1`) is used for interactive affordances only — links, primary actions, active nav states. It does not appear as decoration.

**Cool-neutral surfaces.** All grays lean cool (blue-gray), not warm. This creates visual coherence and prevents the UI from feeling like a generic admin template.

---

## Color Tokens

Defined in `src/app/globals.css` under `@theme {}`.

| Token | Hex | Usage |
|---|---|---|
| `--color-primary` | `#005bc1` | Links, active states, primary buttons |
| `--color-primary-dim` | `#004faa` | Button hover, gradient endpoint |
| `--color-primary-soft` | `#e8f0fb` | Avatar backgrounds, tag fills, hover tints |
| `--color-surface` | `#f8f9fa` | Page background, input backgrounds |
| `--color-canvas` | `#f1f4f6` | Sidebar backgrounds, table header rows, secondary zones |
| `--color-card` | `#ffffff` | Card backgrounds, floating elements |
| `--color-wash` | `#e3e9ec` | Active nav item fill, dividers between major zones |
| `--color-rule` | `#d4dde4` | Input borders, inline dividers within cards |
| `--color-ink` | `#1a2228` | Primary text — headings, data values |
| `--color-dim` | `#4a5a68` | Secondary text — descriptions, supporting copy |
| `--color-muted` | `#8a9ab0` | Tertiary text — labels, timestamps, placeholder text |
| `--color-faint` | `#b8c6d0` | Decorative separators (dot · slash /), truly secondary |

### Surface Hierarchy

```
--color-canvas   #f1f4f6  ← sidebar, nav zone, table header
--color-surface  #f8f9fa  ← page background, input fill
--color-card     #ffffff  ← card/panel background
--color-wash     #e3e9ec  ← active states, pressed fill
```

A section that sits on `canvas` does not need a border. A card on `surface` does not need a border. Only use `--color-rule` borders inside a card to separate sub-sections, or on inputs.

---

## Typography

Font: **Inter** via `next/font/google`, loaded as a CSS variable (`--font-inter`).

| Scale | Class | Usage |
|---|---|---|
| 20px / semibold | `text-xl font-semibold text-ink` | Page titles (`<h1>`) |
| 16px / semibold | `text-base font-semibold text-ink` | Compact page titles (project detail header) |
| 14px / medium | `text-sm font-medium text-ink` | Table row primary text, card titles |
| 14px / regular | `text-sm text-dim` | Descriptions, body copy |
| 12px / regular | `text-xs text-muted` | Timestamps, secondary meta, form hints |
| 11px / semibold / uppercase | `text-[11px] font-semibold text-muted uppercase tracking-wider` | Section labels, column headers, sidebar group labels |
| 10px / semibold | `text-[10px] font-semibold text-primary` | Avatar initials, micro-badges |

---

## Spacing

- **Page padding:** `p-8` (32px all sides)
- **Section gap:** `space-y-6` between major `<SectionCard>` blocks
- **Card internal padding:** `p-5` default (SectionCard)
- **Grid gap:** `gap-4` for form field grids; `gap-x-8 gap-y-3` for display field grids
- **Sidebar width:** 220px (admin/designer), fixed

---

## Component Patterns

### SectionCard

Defined in `src/components/ui/SectionCard.tsx`.

- `bg-card`, `rounded-xl`, subtle box shadow (`0 1px 16px rgba(43,52,55,0.06)`)
- Optional `title`, `description`, `action` (right-aligned in header)
- `noPad` escape hatch for table-style content flush to edges
- Never add extra borders around a SectionCard — the shadow provides sufficient elevation

### Status Badges

Defined in `src/components/ui/StatusBadge.tsx`.

- `ProjectStatusBadge`: `variant="internal"` (full status language for admin) or `variant="external"` (simplified language for company portal)
- `BillingStatusBadge`: internal only
- Pill shape (`rounded-full`), small (`text-[11px]`), light fill with darker text
- Colors: amber = waiting/review, indigo = in progress, emerald = positive, red = action required, gray = neutral/closed

### PageHeader

Defined in `src/components/ui/PageHeader.tsx`.

`title` + `subtitle` (left) + `action` (right). Used at the top of list/index pages. Do not use on detail pages (those use a sticky header instead).

### EmptyState

Defined in `src/components/ui/EmptyState.tsx`.

- `py-16`, centered, icon (optional), title + description
- Used inside SectionCard when a section has no data yet
- Not a full-page empty state — scoped to its containing card

---

## Layout Patterns

### Admin/Designer: Sidebar + Content

```
┌─────────────────────────────────────────┐
│ AdminSidebar (220px, bg-canvas)         │
│                    │ Main content area   │
│                    │ (flex-1, overflow-  │
│                    │  y-auto, bg-surface)│
└─────────────────────────────────────────┘
```

Use `h-screen overflow-hidden flex` on the layout root. Only the main content area scrolls — the sidebar is fixed height.

### Admin Project Detail: Two-Column

```
┌──────────────────────────────────────────────────────┐
│ Sticky project header (bg-card, bottom border)       │
├────────────────────────────┬─────────────────────────┤
│ Main column (flex-1)       │ Sidebar (300px, bg-     │
│ Sequential workflow steps  │ canvas, sticky top)     │
│ in vertical order:         │                         │
│   Intake & Core Data       │  Designer (summary)     │
│   SLD Sheets               │  Billing status         │
│   TCD Selection            │  File counts            │
│   Designer Assignment      │  Activity feed          │
│   TCP Design Files         │  Comment input          │
│   Permit Package           │                         │
└────────────────────────────┴─────────────────────────┘
```

The main column is the workflow. Items appear in the order an admin would act on them. The sidebar is supplementary information and status — it should never contain the primary action for a workflow step.

### Company Portal: Top Nav + Content

No sidebar. `CompanyHeader` is a top bar (bg-card, bottom shadow). Content fills below.

---

## Button Styles

**Primary:** gradient `linear-gradient(135deg, #005bc1 0%, #004faa 100%)`, `text-white`, `rounded-lg`

**Secondary / Ghost:** `bg-canvas text-dim hover:bg-wash hover:text-ink`

**Destructive (text):** `text-danger hover:underline` — used inline in tables/lists only

**Disabled:** `bg-canvas text-muted cursor-not-allowed` — no pointer events

**Sizing:**
- Default action button: `px-4 py-2 text-sm font-medium`
- Primary CTA (form submit, page-level): `px-6 py-2.5 text-sm font-semibold`
- Compact (card header, sidebar): `px-3.5 py-1.5 text-xs font-medium`

---

## Form Inputs

All inputs use:
- `bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink`
- `border: 1px solid #d4dde4` (inline style — `--color-rule`)
- `outline-none focus:ring-2 focus:ring-primary/20`
- `placeholder:text-faint`

Textareas add `resize-none`.

Selects add `cursor-pointer`.

Labels: `text-xs font-medium text-dim mb-1.5`, required marker: `<span className="text-danger ml-0.5">*</span>`

---

## Anti-Patterns

- **Do not** wrap major layout zones in bordered boxes. Use surface color shifts.
- **Do not** use Tailwind `border` utilities on SectionCards or layout regions.
- **Do not** use warm grays. All neutrals must be cool (blue-gray).
- **Do not** use primary blue as a background fill or decoration — only on interactive elements.
- **Do not** use `font-bold` in UI copy. `font-semibold` is the heaviest weight used.
- **Do not** use emoji in UI copy or status labels.
- **Do not** put the primary action of a workflow step in the sidebar. Actions that advance the workflow belong in the main column.
- **Do not** create new color tokens outside `globals.css @theme {}`.
- **Do not** use hard-coded hex values in JSX except for `border` and `boxShadow` inline styles that reference the documented values above. (Tailwind v4 utilities cover everything else.)
