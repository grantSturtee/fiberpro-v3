# GrantEd Design System

## Brand
- **Product name:** GrantEd
- **Font family:** Inter (all weights)
- **Logo treatment:** "GRANTED" in bold uppercase, color `#1565C0` (brand blue)
- **Personality:** Information-dense, professional, utilitarian. Clean but not minimal. Every pixel earns its place.

---

## Color Tokens

### Base Surfaces
| Token | Hex | Usage |
|---|---|---|
| `--color-bg` | `#F4F5F7` | Page background, sidebar background |
| `--color-surface` | `#FFFFFF` | Main content area, cards, table background |
| `--color-surface-subtle` | `#F8F9FB` | Right rail background, alternate rows |
| `--color-border` | `#E5E7EB` | Table row dividers, card borders, input borders |
| `--color-border-strong` | `#D1D5DB` | Section dividers, stronger separators |

### Text
| Token | Hex | Usage |
|---|---|---|
| `--color-text-primary` | `#111827` | Page titles, row primary text, bold values |
| `--color-text-secondary` | `#374151` | Column headers, section titles, form labels |
| `--color-text-muted` | `#6B7280` | Metadata, timestamps, breadcrumbs, helper text |
| `--color-text-faint` | `#9CA3AF` | Placeholder text, empty states |
| `--color-text-link` | `#1565C0` | Inline links, Reassign, Edit, Open PDF |

### Brand & Interactive
| Token | Hex | Usage |
|---|---|---|
| `--color-brand` | `#1565C0` | GRANTED logo, active tab underline, primary buttons, active nav item background |
| `--color-brand-hover` | `#1251A3` | Button hover state |
| `--color-nav-active-bg` | `#E8F0FE` | Active sidebar nav item background pill |
| `--color-nav-active-text` | `#1565C0` | Active sidebar nav item text and icon |
| `--color-nav-inactive-text` | `#6B7280` | Inactive sidebar nav item text and icon |
| `--color-nav-hover-bg` | `#F3F4F6` | Sidebar nav item hover background |

### Status Badge Colors (exact values)
| Status | Background | Text | Label |
|---|---|---|---|
| `new_project` | `#C4A882` | `#FFFFFF` | New Project |
| `in_production` | `#E8A87C` | `#FFFFFF` | In Production |
| `pending_review` | `#E8829A` | `#FFFFFF` | Pending Review |
| `billing_ready` | `#9B8EC4` | `#FFFFFF` | Billing Ready |
| `invoice_sent` | `#E8A0B4` | `#FFFFFF` | Invoice Sent |
| `sub_bill_now` | `#E8D44D` | `#5A4E00` | Sub · Bill Now |
| `permit_billed` | `#82C4A0` | `#FFFFFF` | Permit Billed |
| `paid_complete` | `#6B8CBA` | `#FFFFFF` | Paid · Complete |
| `cancelled` | `#C4C4C4` | `#FFFFFF` | Cancelled |

### Semantic Colors
| Token | Hex | Usage |
|---|---|---|
| `--color-success` | `#16A34A` | Green checkmarks, success states |
| `--color-success-bg` | `#F0FDF4` | Success alert backgrounds |
| `--color-warning` | `#D97706` | Warning icons, stale update alerts |
| `--color-warning-bg` | `#FFFBEB` | Warning alert backgrounds |
| `--color-danger` | `#DC2626` | Remove links, error states, delete buttons |
| `--color-danger-bg` | `#FEF2F2` | Error alert backgrounds |

---

## Typography

**Font:** Inter, loaded via Google Fonts or next/font

| Style | Size | Weight | Line Height | Letter Spacing | Usage |
|---|---|---|---|---|---|
| `page-title` | 28px | 800 | 1.1 | -0.02em | Page titles (PROJECTS, DASHBOARD) — uppercase |
| `section-title` | 16px | 600 | 24px | 0 | Tab content section headers (Project Request, Cover Map) |
| `column-header` | 11px | 600 | 16px | 0.06em | Table column headers, rail section labels — uppercase |
| `body` | 14px | 400 | 20px | 0 | Table row text, form values, general content |
| `body-medium` | 14px | 500 | 20px | 0 | Emphasized body text, file names |
| `body-small` | 12px | 400 | 16px | 0 | Metadata, timestamps, helper text |
| `label` | 11px | 500 | 14px | 0.02em | Form field labels (uppercase muted) |
| `monospace` | 12px | 400 | 16px | 0 | Job numbers (FP-2026-0007, JB000xxxxx) — font: `font-mono` |
| `badge` | 11px | 600 | 14px | 0 | Status badge text |
| `tab-label` | 13px | 500 | 18px | 0 | Tab bar labels |
| `nav-label` | 13px | 500 | 18px | 0 | Sidebar navigation labels |

---

## Layout

### Overall Page Structure
[Sidebar 200px fixed] [Main content area fluid]
- No floating canvas, no rounded outer container
- Full height, full width layout
- Main content area has `padding: 32px` on all sides
- Background color of the entire page: `--color-bg` (`#F4F5F7`)
- Main content area background: `--color-surface` (`#FFFFFF`)

### Sidebar
| Property | Value |
|---|---|
| Width | 200px |
| Background | `#F4F5F7` |
| Right border | `1px solid #E5E7EB` |
| Padding top | 20px |
| Padding left/right | 12px |
| Logo area height | 48px |
| Logo font | Inter 700, 18px, `#1565C0`, uppercase |
| Collapse button | 16px icon, top-right of sidebar, color `--color-text-muted` |

**Nav items:**
| Property | Value |
|---|---|
| Height | 36px |
| Padding | 0 12px |
| Border radius (active bg) | 8px |
| Icon size | 18px |
| Gap between icon and label | 10px |
| Active background | `#E8F0FE` |
| Active text/icon color | `#1565C0` |
| Inactive text/icon color | `#6B7280` |
| Hover background | `#F3F4F6` |
| Spacing between nav items | 2px |

**Bottom of sidebar:**
- Settings nav item pinned above user section
- User section at very bottom: avatar circle 32px, initials in white on `#1565C0` bg, display name 13px 500 weight, role label 11px muted
- Sign out icon button right-aligned

### Main Content Area
| Property | Value |
|---|---|
| Padding | 32px |
| Max width | none — fluid |
| Background | `#FFFFFF` |

### Page Title Area
| Property | Value |
|---|---|
| Title font | `page-title` style, uppercase |
| Margin bottom | 24px |
| No card or container around title | plain on white background |

---

## Components

### Table / Data Grid
| Property | Value |
|---|---|
| Container background | `#FFFFFF` |
| Container border | `1px solid #E5E7EB` |
| Container border radius | 8px |
| Header row height | 40px |
| Header background | `#F9FAFB` |
| Header text style | `column-header` (11px, 600, uppercase, `--color-text-secondary`) |
| Header border bottom | `1px solid #E5E7EB` |
| Data row height | 44px |
| Data row border bottom | `1px solid #F3F4F6` |
| Data row hover background | `#F9FAFB` |
| Data row selected background | `#EFF6FF` |
| Checkbox column width | 40px |
| Checkbox size | 16px × 16px |
| Checkbox border radius | 3px |
| Checkbox border | `1.5px solid #D1D5DB` |
| Checkbox checked bg | `#1565C0` |
| Sort icon | 10px dual-arrow, `#9CA3AF`, positioned right of header label |
| Cell padding | 0 16px |
| Job number style | `monospace`, `--color-text-muted` |
| Job name style | `body`, `--color-text-primary` |
| Status badge cell | centered vertically, badge floats left |
| Date cell | `body-small`, `--color-text-muted`, right-aligned |

### Status Badge
```css
display: inline-flex;
align-items: center;
padding: 2px 10px;
border-radius: 9999px;
font-size: 11px;
font-weight: 600;
white-space: nowrap;
line-height: 18px;
```
Colors: see Status Badge Colors table above.

### Primary Button
```css
background: #1565C0;
color: #FFFFFF;
padding: 8px 16px;
border-radius: 8px;
font-size: 13px;
font-weight: 600;
border: none;
cursor: pointer;
```
Hover: `background: #1251A3`

### Secondary / Outline Button
```css
background: transparent;
color: #1565C0;
padding: 7px 15px;
border-radius: 8px;
border: 1px solid #1565C0;
font-size: 13px;
font-weight: 600;
cursor: pointer;
```

### Danger Button
```css
background: transparent;
color: #DC2626;
padding: 7px 15px;
border-radius: 8px;
border: 1px solid #DC2626;
font-size: 13px;
font-weight: 600;
```

### Form Input
```css
height: 36px;
border: 1px solid #D1D5DB;
border-radius: 6px;
padding: 0 12px;
font-size: 14px;
background: #FFFFFF;
color: #111827;
```
Focus: `border-color: #1565C0; outline: 2px solid #EFF6FF`
Placeholder: `#9CA3AF`

### Textarea
Same as input but `min-height: 80px; padding: 10px 12px; resize: vertical`

### Select / Dropdown
Same as input with chevron icon right-aligned.

### Alert / Banner
```css
/* Warning */
background: #FFFBEB;
border: 1px solid #FCD34D;
border-radius: 6px;
padding: 10px 14px;
font-size: 13px;
color: #92400E;

/* Error */
background: #FEF2F2;
border: 1px solid #FECACA;
color: #991B1B;

/* Success */
background: #F0FDF4;
border: 1px solid #BBF7D0;
color: #166534;
```

### File Row
[PDF icon 28px] [filename body-medium] [uploader · date body-small muted] [eye icon] [trash icon]
- Full row height: 40px
- Background on hover: `#F9FAFB`
- Icons (eye, trash) only visible on row hover
- PDF icon: red `#DC2626` background, white "PDF" text, 6px border radius, 28×20px

---

## Project Detail Page

### Header
| Property | Value |
|---|---|
| Breadcrumb | `body-small` muted, "Projects / FP-2026-XXXX" |
| Project name | `section-title` 20px 700, `--color-text-primary`, uppercase |
| Status badge | inline after project name, pill style |
| Secondary link (Draft Invoice etc) | `body-small` `--color-text-link`, plain text link |
| Company · Authority line | `body-small` `--color-text-muted` |
| Header padding bottom | 16px |
| Border bottom | `1px solid #E5E7EB` |

### Tab Bar
| Property | Value |
|---|---|
| Height | 40px |
| Border bottom | `1px solid #E5E7EB` |
| Active tab | `--color-brand` underline 2px, text `--color-brand` 500 weight |
| Inactive tab | `--color-text-muted` 400 weight |
| Tab padding | 0 16px |
| Tab font | `tab-label` (13px 500) |
| Gap between header and tabs | 0 |

### Right Rail
| Property | Value |
|---|---|
| Width | 240px |
| Background | `#F8F9FB` |
| Left border | `1px solid #E5E7EB` |
| Padding | 20px 16px |
| Section label style | `column-header` style — 10px, 600, uppercase, letter-spacing 0.08em, `--color-text-muted` |
| Section gap | 24px |
| Designer avatar | 32px circle, `#1565C0` bg, white initials, 12px 600 |
| File count rows | label left `body-small`, count right `body-small` 600 |
| Conversation input | pinned bottom, full width, 36px height |
| Send button | full width, primary button style |

---

## Spacing Scale
| Name | Value | Usage |
|---|---|---|
| `space-1` | 4px | Tight gaps, icon margins |
| `space-2` | 8px | Small internal padding |
| `space-3` | 12px | Nav item padding |
| `space-4` | 16px | Standard gaps, cell padding |
| `space-5` | 20px | Section internal padding |
| `space-6` | 24px | Between sections |
| `space-8` | 32px | Page padding |
| `space-10` | 40px | Large section gaps |

---

## Elevation
No drop shadows on standard surfaces. Use border and background color contrast only.
- Cards: `border: 1px solid #E5E7EB`
- Modals only: `box-shadow: 0 8px 32px rgba(0,0,0,0.12)`

---

## Iconography
- Library: Lucide React
- Size: 16px standard, 18px nav icons, 14px inline
- Stroke width: 1.5px
- Color: inherits from parent text color unless specified
