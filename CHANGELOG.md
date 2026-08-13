# 0.2.2

[Removed]
- All AI-generated art. Default rarity icons now use Foundry's own core icon library instead of bundled artwork; `banner.webp` and `thumbnail.webp` are now plain black placeholders; the box-opening video style has no bundled default video (GMs can still supply their own via **Configure Default Assets**).
- The `icons/` (detailed variants and unused `avatar.webp`) and `video/` asset folders, and the unused rarity images under `images/`.

[Changed]
- The Mystery Boxes Demo compendium items now use Foundry core chest icons instead of the removed bundled icons.

See `docs/updating-assets-after-ai-removal.md` for how to refresh icons on world items created before this change — this is a manual, opt-in macro, not an automatic migration.

# 0.2.1

[Added]
- Compatibility with the **Unidentified** module: items it has mystified now stay masked (alias name/icon) when drawn from a Mystery Box, both in the "You received" reveal popup and in the opening chat message. Applies whenever the box-opener is not a GM; GMs continue to see real item identity, matching Unidentified's own behavior.
- Declared **Unidentified** as an optional (`recommends`) relationship in `module.json`, mirroring the existing Dice So Nice! entry. No hard dependency — behavior is unchanged when it isn't installed.

[Fixed]
- The reveal popup's magnifier (view item) button looked up the drawn item on `game.user.character` even when "send to party" routed it to the party actor instead, so it usually fell back to a detached temporary copy rather than the real actor-owned item. It now looks up the item on whichever actor actually received it.


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
