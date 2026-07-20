# Next Work Plan

Status: Planned; implementation has not started.

## Objective

Complete the remaining major dependency migrations without weakening the tool's
local-only privacy model, transform correctness, accessibility, or published
GitHub Pages output.

## Guardrails

- Use Node.js 22 and `npm ci`.
- Keep React, React DOM, and Lucide on mutually compatible versions.
- Preserve the restrictive Content Security Policy and make no new remote
  runtime requests.
- Keep Tailwind 4 work separate from the React ecosystem migration.
- Regenerate and commit `docs/` whenever a production build changes it.
- Do not merge a migration until `npm run verify`, `git diff --check`, pull
  request CI, and the relevant browser checks pass.

## Phase 1: React ecosystem migration

Create one branch, session, and pull request for the coordinated replacement of
the superseded individual updates from PRs #9, #11, and #12.

1. Update `react`, `react-dom`, and `lucide-react` together.
2. Review the React 19 and Lucide breaking changes that affect the current API
   usage; do not use peer-dependency overrides.
3. Update application code only where required by documented migration changes.
4. Regenerate `package-lock.json` and `docs/`.
5. Exercise URL, Base64, JWT, Unicode, QR generation, QR decoding, copy,
   download, example, reset, and round-trip flows.
6. Check keyboard focus, status announcements, reduced motion, narrow viewport
   layout, console output, and network activity.

Completion requires a green pull request, a successful `main` build, and a
successful GitHub Pages deployment.

## Phase 2: Tailwind 4 migration

Create a separate branch, session, and pull request for the migration represented
by superseded PR #10.

1. Add the supported Tailwind 4 PostCSS integration and migrate configuration and
   stylesheet entry points using the official upgrade guidance.
2. Preserve the current design tokens, responsive behavior, focus treatment,
   state styling, and reduced-motion behavior.
3. Compare the production UI at 320 px, a representative desktop width, and
   browser zoom before accepting generated CSS changes.
4. Regenerate `package-lock.json` and `docs/`.
5. Run the full repository and browser validation used in Phase 1.

Do not combine this migration with feature work or the React ecosystem migration.

## Phase 3: Dependabot maintenance

After both migrations land:

1. Group React, React DOM, and Lucide updates so compatible releases are tested
   together.
2. Confirm major framework updates cannot bypass the generated Pages output
   check.
3. Review the GitHub Pages build warning about platform actions still targeting
   Node.js 20; treat it as upstream infrastructure unless a repository-owned
   workflow can resolve it.

## Definition of done

- Both migration pull requests are merged independently.
- `main` passes CI and dependency audit after each merge.
- GitHub Pages serves the expected application after each merge.
- No superseded dependency pull requests remain open.
- A recovery point records the merged commits, validation evidence, and any
  deferred risk.
