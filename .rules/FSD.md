# Project Rules — Feature-Sliced Design

## Directory Schema (top→down import order)

- app/ : App shell (providers, routing, init, styles). No slices.
- processes/ : (Optional) Long-lived flows across pages. Imports: widgets↓
- pages/ : Route-level compositions. One slice per page.
- widgets/ : Page fragments composed from features/entities.
- features/ : User-visible interactions (use cases).
- entities/ : Business entities (User, Todo, Product).
- shared/ : UI kit, libs, utils, config; business-agnostic. No slices.

## Slice & Segment Rules

- Slices exist ONLY under: pages/, widgets/, features/, entities/.
- Slice names are business terms (e.g., todos, auth, profile, filter).
- Allowed segments inside a slice:
    - ui/ : React components of this slice
    - model/ : state, domain logic, query keys, stores
    - lib/ : pure helpers for this slice
    - api/ : slice-scoped client(s) & DTO mapping (optional)
    - config/ : slice-scoped constants (optional)
    - types/ : local TS types (optional)
- shared/ and app/ are segmented directly (no slices). Typical folders:
    - shared/ui, shared/lib, shared/api, shared/config, shared/styles, shared/types
    - app/providers, app/routes, app/styles, app/index.tsx

## Import Boundaries

- Direction: app → pages → widgets → features → entities → shared
- A module may only import from its layer or LOWER layers.
- Cross-slice imports inside the SAME layer must go through the slice **public API**:
    - Import only from `../<layer>/<slice>` root (barrel), never deep files.
- Forbidden:
    - Importing from higher layers.
    - Reaching into another slice’s internal files (e.g., `features/a/model/…`).
    - UI importing model from a HIGHER layer.

## Public API (Barrels)

- Every slice exports from `<layer>/<slice>/index.ts` only the items meant for reuse:
    - UI entry points (components)
    - Hooks from model/ (e.g., useToggleTodo)
    - Contracts/types needed by consumers
- Consumers import: `import { TodoList } from '@/widgets/todos'`
- No deep imports like: `@/widgets/todos/ui/TodoList`

## Naming Conventions

- React components: PascalCase files (`TodoList.tsx`), default export discouraged.
- Hooks: `useXxx.ts` in `model/` if stateful, in `lib/` if pure UI-agnostic.
- Tests/Stories colocated: `*.test.ts(x)` and `*.stories.tsx` beside the file.
- Feature actions/events: verb-first (`toggleTodo`, `createTodo`).

## State & Data-Fetching

- Place domain state/query logic in `model/` of the owning slice.
- shared/api may host base clients; slice `api/` adapts to domain DTOs.
- UI components receive data via props/hooks from their slice model.

## UI Composition Rules

- pages compose widgets and features; avoid direct entity/shared use unless trivial.
- widgets compose features/entities for reuse across multiple pages.
- features encapsulate a single user interaction; can render entities and shared UI.

## Styling & Assets

- Keep slice-specific styles inside the slice.
- shared/styles contains global tokens/themes only.
- No global CSS leakage from slice folders.

## Path Aliases (tsconfig)

- Use aliases to reflect layers: @app/_, @pages/_, @widgets/_, @features/_, @entities/_, @shared/_
- Cursor: Prefer alias imports over relative deep paths.

## PR Review Checklist (Cursor & humans)

- Does the change respect layer direction?
- Are new modules placed in the correct slice and segment?
- Is the slice’s public API minimal and sufficient?
- No deep imports across slices/layers.
- Tests/stories colocated and passing.
- Added/updated barrel exports as needed.

## Tooling (Recommended)

- Enforce structure with:
    - feature-sliced/eslint-config (layer/slice rules via existing plugins)
    - feature-sliced/steiger (structure linter & VSCode extension)
- If new to FSD, run Steiger on CI and add a pre-commit hook.
