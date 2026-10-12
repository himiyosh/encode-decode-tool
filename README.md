# Encode / Decode Tool

This is a web-based tool for encoding and decoding text in various formats such as URL, Base64, JWT, Unicode and QRcode. The application is built using React, Tailwind CSS, and Vite.

## Features

- Encode and decode text in the following formats:
  - URL
  - Base64
  - JWT
  - Unicode
  - QRcode
- Copy the output to the clipboard with a single click.
- Download generated QR codes and decode QR images without uploading them.
- Use the format tabs, transform controls, and file picker with a keyboard.
- Round-trip empty and non-ASCII UTF-8 Base64 and Unicode input, including leading
  U+FEFF characters in Base64 text, while rejecting
  malformed alphabets, non-scalar Unicode, and JWT numbers that would be rewritten
  during JSON decoding.
- Limit JWT assembly to explicit unsecured (`alg: "none"`) tokens; decoding validates
  compact structure but never verifies a signature or authenticity.
- Inspect PNG, JPEG, GIF, and WebP headers before QR decoding to reject malformed or
  oversized images before allocating the processing canvas.
- Keep previous results visible for comparison while preventing stale one-click
  copy or QR download after the source changes.
- Keep copy confirmations attached to the current result and ignore outdated
  clipboard completions or QR generation errors after input changes.
- Use a playful multi-accent workbench with state-reactive motion. Reduced motion
  displays decorative elements in their final positions immediately, including
  generated QR images.
- Prioritize the transformation controls on narrow screens while keeping the decorative signal stage on larger viewports.
- Load a safe example for every format and see Unicode-aware character counts
  without leaving the current workflow.
- Move transformed output back into the input, or decoded QR text into the
  generator, for quick local round-trip checks.
- Responsive design with a modern UI.

All text transformations and QR image processing run locally in the browser. The
tool does not upload entered text, generated QR codes, or selected images. A
restrictive Content Security Policy also blocks unexpected remote connections.

## Security

Report suspected vulnerabilities privately by following the [security policy](.github/SECURITY.md). Do not disclose vulnerabilities in public issues.

## Development

- Use Node.js 22 and restore dependencies with `npm ci`; generated
  `node_modules/` and `dist/` directories are not versioned.
- `npm run verify` runs tests, validates lockfile provenance and Copilot
  customizations, and creates the GitHub Pages site in `docs/`.
- Install the Playwright Chromium binary once with `npx playwright install chromium`, then run `npm run test:e2e` for the focused real-browser regression suite. The suite builds and serves the production GitHub Pages output at `/encode-decode-tool/`.
- Set `PLAYWRIGHT_CLIPBOARD_STUB=1` when running `npm run test:e2e` to check
  clipboard state with an in-memory API without reading or overwriting the OS
  clipboard. This mode does not verify real clipboard permissions or integration.
- Every pull request and `main` push runs tests, lockfile provenance and customization checks, a production build, the Chromium E2E suite, a tracked `docs/` diff check, and a high-severity dependency audit in CI.
- Dependabot groups compatible minor and patch updates for React, React DOM, and Lucide, keeps development tooling updates together, and leaves major migrations in separate pull requests for review.

## Live Demo

You can access the live version of this tool on GitHub Pages: [https://himiyosh.github.io/encode-decode-tool/](https://himiyosh.github.io/encode-decode-tool/)

## GitHub Copilot customization

- Select `EncodeDecodeAgent` ([profile](.github/agents/EncodeDecodeAgent.agent.md)) for end-to-end project work.
- Select `PlayfulWorkbenchAgent` ([profile](.github/agents/PlayfulWorkbenchAgent.agent.md)) when the workbench needs expressive color, purposeful motion, playful interaction, or visual polish without weakening correctness, privacy, security, or accessibility.
- For long-running work, use one compact parent coordinator and fresh task-specific child sessions. Each child owns one task/branch, keep at most three active, return a compact completion report, and clean up only after a durable Git checkpoint or handoff.
- UI creation, improvement, read-only audit, explicit redesign, and design study are routed through [Hallmark](.github/skills/hallmark/SKILL.md) while repository correctness, security, privacy, accessibility, responsive behavior, and QA remain authoritative.
- Hallmark 1.1.0 is vendored from `nutlope/hallmark` commit `aeb42fb354ff4efa36ab475773a082315a3af2ce`; see [UPSTREAM.md](.github/skills/hallmark/UPSTREAM.md) and the included MIT [LICENSE](.github/skills/hallmark/LICENSE).
- Run `npm run check:customizations` to validate discovery, frontmatter, profile size, references, attribution, and vendored scope.
