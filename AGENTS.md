# Groubot coding guidance

Groubot is a pnpm workspace. Shared UI belongs in `packages/ui` and must be consumed through `@groubot/ui`.

- Use the design tokens and shared primitives before adding feature-specific styling.
- Do not create duplicate buttons, inputs, dialogs, menus, or icon systems inside an app.
- Keep components in focused files and separate browser/business logic from presentation.
- Use Lucide React icons consistently.
- Preserve accessible labels, keyboard navigation, focus states, and compact desktop spacing.
- Prefer semantic Tailwind tokens such as `bg-card`, `text-muted-foreground`, and `border-border`.
- Run `pnpm typecheck` after TypeScript changes and the relevant package build before handoff.
