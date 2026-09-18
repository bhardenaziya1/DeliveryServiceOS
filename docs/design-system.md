# VendorOS design system

VendorOS follows one visual language across every screen: a dark navy sidebar,
a bright blue accent, light neutral backgrounds, and flat white cards with
soft pill status badges. Screens ship faster and stay consistent when they
reuse these tokens and components instead of inventing new colors or card
styles.

## Tokens (`apps/web/src/theme/theme.ts`)

- `colors.navy` (`#0f1c34`) — sidebar background and any dark panel (e.g. the
  login screen's left panel).
- `colors.brand` (`#2f6feb`) via `theme.palette.primary` — primary buttons,
  active nav items, links, focused inputs, the logo mark.
- `colors.background` (`#f4f6fb`) via `theme.palette.background.default` —
  page background outside of cards.
- `colors.border` (`#e6e9f2`) via `theme.palette.divider` — card/table
  borders. Cards use a 1px outlined border, not a drop shadow.
- Status colors map to MUI's `success` / `warning` / `error` / `info` /
  `default` palette entries. Any `<Chip variant="filled" color="...">` (the
  MUI default) automatically renders as a soft pill — light tinted
  background, darker text of the same hue — via the `MuiChip` theme
  override. Don't hand-roll chip colors; add a new palette entry instead if
  you need one that doesn't exist yet.

Global shape: 10px default border radius, 14px on `Card`, pill (999px) on
`Chip`. Buttons: no elevation, no uppercase transform, 8px radius, 600
weight. Typeface: Inter (loaded in `index.html`).

## Shared components (`apps/web/src/components`)

- **`PageHeader`** — title + subtitle + a right-aligned primary action.
  Every list/detail page opens with one instead of a hand-rolled `Stack`.
- **`StatCard`** — the KPI tile used on the dashboard (icon in a tinted
  square, big bold value, label, optional hint). Reuse it for any new
  overview metric rather than building a bespoke card.
- **`EntityAvatar`** — a colored initial-circle keyed off an entity's name
  (deterministic color per name, not per status). Use it wherever a list
  row identifies a client, project, worker, or vehicle by name — it's what
  gives list rows their identity at a glance, matching the mockup.

## Patterns

- **List pages** (see `ClientsListPage`, `ProjectsListPage`): `PageHeader`
  with a "New X" primary button → filter row (`TextField`s, size `small`) →
  the table wrapped in a `Card` (not a bare `Box`) with `overflow: 'hidden'`
  so `DataGrid`'s corners match the card's radius. The first column pairs an
  `EntityAvatar` with the bold primary name.
- **Dashboard-style overview pages**: a `Grid` of `StatCard`s for the
  headline numbers, then supporting cards/panels below. Don't fabricate
  numbers for data that doesn't exist yet — show a real `0`/count from the
  API, or an explicit "Coming soon" hint (see `StatCard`'s `hint` prop) for
  modules that haven't shipped.
- **Layout** (`AppLayout`, `Sidebar`, `Topbar`): the sidebar is fixed navy
  with the "V" logo mark and pill-highlighted active nav item; the topbar is
  white with a search field, a notification icon, and the user menu. New
  top-level sections get an entry in `navConfig.ts`, not a new layout.
- **Auth screens** (`LoginPage`): split screen — a navy brand panel on the
  left (logo, tagline, feature highlights) and the form on white on the
  right. Any future auth screen (reset password, invite accept, etc.)
  should reuse this split layout rather than a plain centered card.

When a new screen needs something these tokens/components don't cover yet,
extend the theme or add a new shared component rather than styling one-off —
that keeps every future screen, not just this one, in the same visual
language.
