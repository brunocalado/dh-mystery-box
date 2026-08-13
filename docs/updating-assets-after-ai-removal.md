# Updating Mystery Box Icons After the AI-Art Removal

Starting with this update, **Mystery Box** no longer ships any AI-generated art. Default rarity
icons now point to Foundry VTT's own core icon library instead, and the bundled opening videos
were removed (the "Video" opening style still exists — you can supply your own video in
**Configure Default Assets**).

This is **not** an automatic migration. If you already had Mystery Box items in your world before
updating, they keep whatever icon they were created with, baked into that item's own `img` field.
Since the old bundled icon files no longer exist, those items will show a broken/missing image
until you run the macro below — once, manually, whenever you're ready.

**You don't need to do anything if:**
- This is a fresh install, or
- You haven't created any Mystery Box items in this world yet.

## What the macro does

- Scans every world Item and every Actor-owned Item for the module's `boxId` flag (i.e. anything
  that is a Mystery Box).
- For each one, checks whether its current icon is still the *old bundled* path
  (`modules/dh-mystery-box/assets/icons/box-*.webp`). If you already changed an item's icon
  yourself, the macro leaves it alone — it only touches items still on the removed default.
- Replaces the icon with the item's rarity's *new* default (read live from the module's own
  **Configure Default Assets** settings, so if you've already customized those defaults, the
  macro uses your custom icons, not the module's hardcoded ones).

It does not touch sounds (unaffected) or opening videos (not stored per-item — video paths are
read from the world setting at open time, so they update automatically unless you'd previously
set a custom video path pointing at the module's own removed `assets/video/` files; if so,
reconfigure it from **Configure Default Assets**).

If you had duplicated the "Mystery Boxes Demo" compendium into your own compendium, or otherwise
have Mystery Box items living inside a custom compendium pack, this macro does not reach into
compendiums — unlock the pack and drag those items into World Items temporarily, or fix their
icons by hand.

## How to run it

1. In your world, create a new **Script** macro (Macro Directory → Create Macro → type: Script).
2. Paste the code below.
3. Run it as GM. It reports how many items it updated in a notification and in the console.
4. You can delete the macro afterward — it's safe to keep and re-run too, it just won't find
   anything left to update the second time.

```js
// Mystery Box: refresh rarity icons on existing items after the AI-art removal. GM only, safe to re-run.
(async () => {
  if (!game.user.isGM) {
    ui.notifications.warn("Only the GM can run this macro.");
    return;
  }

  const MODULE_ID = "dh-mystery-box";
  const OLD_ICON_PREFIX = `modules/${MODULE_ID}/assets/icons/box-`;
  const NEW_ICONS = {
    common: game.settings.get(MODULE_ID, "iconCommon"),
    uncommon: game.settings.get(MODULE_ID, "iconUncommon"),
    rare: game.settings.get(MODULE_ID, "iconRare"),
    legendary: game.settings.get(MODULE_ID, "iconLegendary")
  };

  function resolveNewIcon(item) {
    if (!item.img?.startsWith(OLD_ICON_PREFIX)) return null; // already customized, or already migrated
    const rarity = item.getFlag(MODULE_ID, "config")?.rarity ?? "common";
    return NEW_ICONS[rarity] ?? NEW_ICONS.common;
  }

  let updated = 0;

  // World items
  for (const item of game.items) {
    if (item.type !== "loot" || !item.getFlag(MODULE_ID, "boxId")) continue;
    const newImg = resolveNewIcon(item);
    if (!newImg) continue;
    await item.update({ img: newImg });
    updated++;
  }

  // Items embedded on actors (e.g. dragged onto a character sheet)
  for (const actor of game.actors) {
    const updates = [];
    for (const item of actor.items) {
      if (item.type !== "loot" || !item.getFlag(MODULE_ID, "boxId")) continue;
      const newImg = resolveNewIcon(item);
      if (!newImg) continue;
      updates.push({ _id: item.id, img: newImg });
    }
    if (updates.length) {
      await actor.updateEmbeddedDocuments("Item", updates);
      updated += updates.length;
    }
  }

  ui.notifications.info(`Mystery Box: updated ${updated} item icon(s).`);
  console.log(`[dh-mystery-box] Icon refresh complete — ${updated} item(s) updated.`);
})();
```
