# Components map

> One line per component: name → package → purpose → story. Update in the same task that adds a component.

| Component | Package | Purpose | Story |
|---|---|---|---|
| `Button` | `@nexus/ui-core` | Primary, secondary, ghost and danger actions with loading and `asChild` support | `Components/Button` |
| `IconButton` | `@nexus/ui-core` | Square icon-only button requiring an accessible `aria-label` | `Components/IconButton` |
| `Badge` | `@nexus/ui-core` | Compact pill status label (`neutral`, `brand`, `info`, `success`, `warning`, `danger`) | `Components/Badge` |
| `Card` | `@nexus/ui-core` | Surface container with optional header title, actions and footer | `Components/Card` |
| `StatCard` | `@nexus/ui-core` | KPI card with label, tabular figure, semantic caption and skeleton loading state | `Components/StatCard` |
| `Skeleton` | `@nexus/ui-core` | Reduced-motion-safe decorative loading placeholder | `Components/Skeleton` |
| `Field` | `@nexus/ui-core` | Form wrapper pairing label, required indicator, description and `role="alert"` error | `Components/Field` |
| `Input` | `@nexus/ui-core` | Single-line text/numeric input with logical leading/trailing slots and ARIA wiring | `Components/Input` |
| `Textarea` | `@nexus/ui-core` | Multi-line text input sharing `Field` labels, error states and ref forwarding | `Components/Textarea` |
| `Select` | `@nexus/ui-core` | Native select with `<optgroup>` runs, placeholder and RTL-safe indicator | `Components/Select` |
| `Checkbox` | `@nexus/ui-core` | Radix checkbox supporting checked, unchecked and indeterminate states | `Components/Checkbox` |
| `Switch` | `@nexus/ui-core` | Radix toggle switch with RTL-mirrored thumb transition | `Components/Switch` |
| `AppShell` | `@nexus/ui-core` | Responsive app layout with desktop sidebar, mobile Radix drawer, skip link and `useAppShell` | `Components/AppShell` |
| `NavItem` | `@nexus/ui-core` | Sidebar navigation item with icon, active state, `asChild` support and auto-close in mobile drawer | `Components/NavItem` |
| `Modal` | `@nexus/ui-core` | Accessible Radix dialog (`md`, `lg`, `xl`) with localized close chrome and focus trap | `Components/Modal` |
| `Tabs` | `@nexus/ui-core` | Accessible Radix tabs with scrollable tab list and active logical underline | `Components/Tabs` |
| `ToastProvider` | `@nexus/ui-core` | Radix toast notifications (`info`, `success`, `warning`, `danger`) with `useToast` hook | `Components/Toast` |
| `EmptyState` | `@nexus/ui-core` | Centered empty or error state with localized fallback headings and optional action | `Components/EmptyState` |
| `DemoBanner` | `@nexus/ui-core` | Prototype mock-data notice banner (`role="note"`) with localized default text | `Components/DemoBanner` |
| `SyncStatus` | `@nexus/ui-core` | Props-driven offline sync indicator (`synced`, `pending`, `syncing`, `conflict`, `offline`, `error`) | `Components/SyncStatus` |
| `DataTable` | `@nexus/ui-core` | TanStack Table with sortable columns, D15 offset pagination, mobile 360px cards, loading/empty/error states | `Components/DataTable` |
