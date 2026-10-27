# Groubot Design System

Groubot's shared UI foundation lives in `packages/ui`. It follows shadcn/ui conventions: components are small Radix-backed wrappers, styled with Tailwind utility classes and shared CSS variables.

## Architecture

- `packages/ui/src/styles.css` — color, surface, radius, typography, and Tailwind theme tokens.
- `packages/ui/src/lib/utils.ts` — `cn`, the standard class composition helper.
- `packages/ui/src/components/` — one focused file per reusable primitive.
- `packages/ui/src/index.ts` — the public package barrel export.
- Feature folders — compose shared primitives; they own feature behavior, not generic controls.

The desktop app imports the shared stylesheet once and consumes components from `@groubot/ui`.

## Conventions

Use the existing primitive before creating a new button, input, dialog, menu, or surface. Use `cn()` for conditional classes and Lucide React for icons. Keep feature components focused and move genuinely reusable patterns into `packages/ui`.

Prefer semantic tokens (`bg-background`, `text-foreground`, `border-border`, `bg-card`, `text-muted-foreground`) over literal colors. Tokens support the dark default theme and the `.light` theme without rewriting components. Keep controls compact, use restrained radii, and reserve animation for feedback and state changes.

## Adding components

1. Add a focused component file under `packages/ui/src/components`.
2. Wrap Radix primitives when accessibility or keyboard behavior is needed.
3. Add the export to `packages/ui/src/index.ts`.
4. Keep variants explicit and small; use `class-variance-authority` where variants are meaningful.
5. Use the component from feature code and run `pnpm typecheck`.

Do not duplicate shared primitives inside `apps/desktop` or future packages.
