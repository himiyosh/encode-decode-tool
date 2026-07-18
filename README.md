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
- Responsive design with a modern UI.

## Live Demo

You can access the live version of this tool on GitHub Pages: [https://himiyosh.github.io/encode-decode-tool/](https://himiyosh.github.io/encode-decode-tool/)

## GitHub Copilot customization

- Select `EncodeDecodeAgent` ([profile](.github/agents/EncodeDecodeAgent.agent.md)) for end-to-end project work.
- UI creation, improvement, read-only audit, explicit redesign, and design study are routed through [Hallmark](.github/skills/hallmark/SKILL.md) while repository correctness, security, privacy, accessibility, responsive behavior, and QA remain authoritative.
- Hallmark 1.1.0 is vendored from `nutlope/hallmark` commit `aeb42fb354ff4efa36ab475773a082315a3af2ce`; see [UPSTREAM.md](.github/skills/hallmark/UPSTREAM.md) and the included MIT [LICENSE](.github/skills/hallmark/LICENSE).
- Run `npm run check:customizations` to validate discovery, frontmatter, profile size, references, attribution, and vendored scope.
