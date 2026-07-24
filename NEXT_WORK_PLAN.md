# Next Work Recovery Record

Status: Phase 3 completed on 2026-07-25; this maintenance pull request remains subject to review and must not be merged automatically.

## Completed migrations

- React ecosystem PR #14 merged as `2699e0c7d35e7cb8cf1e3fc8fb732906c6a1fb20`.
- Transform and QR hardening PR #15 merged as `85d8001153c2bcec37a818f4ba9c54f9f01542db`.
- Tailwind 4 PR #16 merged as `33f9f9c8aa3f38d92877584f602f31abccda0c1d`.
- The latest `main` CI run `30113339372` and GitHub Pages deployment run `30113338537` completed successfully for `33f9f9c`.
- No superseded Dependabot pull requests remained open when Phase 3 began.

## Phase 3 controls

Dependabot now groups minor and patch releases of React, React DOM, and Lucide so compatible versions are tested in one pull request. Development tooling minor and patch updates remain grouped separately. Major updates are intentionally excluded from groups and continue to arrive as individual reviewable migrations.

Every pull request runs the repository verification workflow. Static regression coverage now protects the pull request trigger, clean dependency installation, tests, lockfile provenance, customization checks, production build into tracked `docs/`, generated Pages diff check, and high-severity dependency audit.

## Validation evidence

Phase 3 was validated with Node.js 22 using `npm run verify`, `npm audit --audit-level=high`, `git diff --check`, a semantic inspection of `.github/dependabot.yml` against GitHub's supported group keys and update types, and inspection of the current CI and Pages runs.

## Remaining external risk

The successful platform-managed Pages run still warns that its generated build job invokes `actions/checkout@v4` and `actions/upload-artifact@v4`, which target Node.js 20 and are forced onto Node.js 24. Current immutable upstream releases support Node.js 24, but this repository does not own the generated `pages-build-deployment` workflow and cannot update those references. The repository-owned CI action pins already target Node.js 24, so no substitute deployment workflow or misleading repository-side fix was added.

## Next actions

Review and merge the focused Phase 3 pull request after CI passes, then confirm the first grouped React ecosystem update contains only compatible minor or patch releases and monitor GitHub's platform-managed Pages workflow until it adopts Node.js 24-native action versions.
