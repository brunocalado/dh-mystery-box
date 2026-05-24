# 0.2.0

- v14 only
[Changed]
- Extracted `MODULE_ID` to `scripts/constants.js` and imported throughout all JS files to prevent silent typos and ensure a single source of truth for module identification.
- Added `static BASE_APPLICATION` property to all 8 ApplicationV2 subclasses to comply with v14 architecture and prevent hook dispatch issues.
- Consolidated CSS variables: moved shared `--mbs-*` (settings/editor theme), font family, and border-hover variables to `.dh-mystery-box-app` scope in `mystery-box.css` to eliminate duplication across `mb-settings.css` and `mb-editor-config.css`.
- Replaced hardcoded colors and font families with CSS variables throughout stylesheets to prevent theme inconsistencies and CSS leaks, and improve maintainability.

# 0.1.6

- Party actor setting and picker menu allowing the GM to designate a shared party actor for loot.
- Party toggle button in the Mystery Box Opener that redirects items to the party actor, forces public chat messages, and broadcasts opening effects (sound, confetti, video) to all connected clients via socket.
