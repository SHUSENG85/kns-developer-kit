# KNS External UI Kit v1

A deliberately small presentation surface for third-party KNS staff modules.

Use `tokens.css` + `styles.css` and the React components in `components.tsx`. This keeps module
pages visually compatible with KNS without exposing platform-owned navigation, administrator routes,
authentication controls or the complete internal UI implementation.

Rules:

- one page h1;
- essential controls are at least 44 px;
- use semantic tones only for meaning;
- module-specific CSS uses KNS tokens instead of hard-coded colours;
- server permissions remain authoritative; UI visibility is not authorization;
- do not reproduce the KNS staff navigation yourself—the platform/host owns global navigation;
- preserve keyboard focus, visible focus and loading/empty/error states;
- design at 375 px, 768 px and desktop widths.

This v1 surface intentionally contains only generic module primitives: ModulePage, Card, Alert,
Badge, Loading, Empty, ErrorState and SectionHeader. More components become public only after a
third-party need and compatibility review.
