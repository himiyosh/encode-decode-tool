# Product

## Register

product

## Users

Developers, testers, support staff, and privacy-conscious users who need to inspect
or transform encoded text and QR data while debugging, validating, or sharing
technical payloads. They need quick, predictable conversions without sending
potentially sensitive input to a server.

## Product Purpose

Encode and decode URL, UTF-8 Base64, JWT, Unicode, and QR data entirely in the
browser. Success means users can choose a format, understand the expected input,
complete a transformation, and safely copy or download the result with clear
feedback for invalid or unverified data.

## Brand Personality

Precise, calm, and trustworthy. The interface should feel like a dependable
workbench: direct enough for repeated technical use, approachable for occasional
users, and explicit about privacy and security boundaries.

## Anti-references

- A decorative conversion demo that prioritizes visual novelty over readable data
  and predictable controls.
- A security tool that implies decoded JWT content is verified or trustworthy.
- A cloud utility that uploads input, files, or generated QR codes without an
  explicit user request.
- An interface that hides errors, automatically opens decoded links, or loses work
  when users switch formats.

## Design Principles

1. Keep the transformation task primary and remove friction from repeated use.
2. Make privacy, validation limits, and unverified data boundaries visible.
3. Preserve user context across format changes and provide immediate state feedback.
4. Prefer familiar semantic controls over novel interaction patterns.
5. Treat malformed, long, and non-ASCII input as normal product cases.

## Accessibility & Inclusion

Target WCAG AA practices for contrast, labels, keyboard operation, visible focus,
status and error announcements, and touch targets. Support narrow viewports, zoom,
long strings, reduced motion, and users who rely on assistive technology without
making color the only carrier of state.
