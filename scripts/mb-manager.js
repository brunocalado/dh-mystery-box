import { MysteryBoxEditor } from "./mb-editor.js";

const MODULE_ID = "dh-mystery-box";

/**
 * Resolves the rarity icon path from settings, falling back to the bundled asset.
 * Allows GMs to override icons without touching module code.
 * @param {string} rarity - The rarity tier (common, uncommon, rare, legendary).
 * @returns {string} The configured or default icon path.
 */
function getRarityIcon(rarity) {
  const key = `icon${rarity.charAt(0).toUpperCase()}${rarity.slice(1)}`;
  return game.settings.get(MODULE_ID, key) || `modules/${MODULE_ID}/assets/icons/box-${rarity}.webp`;
}

/**
 * GM-only manager for listing, creating, editing, and deleting Mystery Boxes.
 * Opened via `MysteryBox.Manager()` or the Daggerheart Menu button.
 */
export class MysteryBoxManager extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
    id: "dh-mb-manager",
    classes: ["dh-mystery-box-app", "dh-mystery-box-manager"],
    window: {
      title: "Mystery Box Manager",
      icon: "fas fa-box-open",
      resizable: true
    },
    position: {
      width: 700,
      height: "auto"
    },
    actions: {
      createBox: MysteryBoxManager.#onCreateBox,
      editBox: MysteryBoxManager.#onEditBox,
      deleteBox: MysteryBoxManager.#onDeleteBox,
      regenerateItem: MysteryBoxManager.#onRegenerateItem
    }
  }, { inplace: false });

  static PARTS = {
    list: {
      template: `modules/${MODULE_ID}/templates/mb-manager.hbs`
    }
  };

  /**
   * Build context data for the manager template.
   * Reads the stored boxes from settings and builds a display-friendly array.
   * @param {object} options - Render options from the AppV2 lifecycle.
   * @returns {Promise<object>} Template context with boxes array.
   */
  async _prepareContext(options) {
    const boxes = game.settings.get(MODULE_ID, "boxes");
    const boxList = Object.entries(boxes).map(([id, box]) => ({
      id,
      name: box.name,
      itemCount: box.items.length,
      icon: getRarityIcon(box.rarity || "common")
    }));
    return { boxes: boxList };
  }

  /**
   * Opens the editor in create mode.
   * @param {PointerEvent} event - The triggering click event.
   * @param {HTMLElement} target - The action button element.
   */
  static #onCreateBox(event, target) {
    new MysteryBoxEditor({ managerApp: this }).render({ force: true });
  }

  /**
   * Opens the editor in edit mode for the selected box.
   * @param {PointerEvent} event - The triggering click event.
   * @param {HTMLElement} target - The action button element with data-id.
   */
  static #onEditBox(event, target) {
    const boxId = target.dataset.id;
    new MysteryBoxEditor({ boxId, managerApp: this }).render({ force: true });
  }

  /**
   * Regenerates the world item for a box if it is missing.
   * @param {PointerEvent} event - The triggering click event.
   * @param {HTMLElement} target - The action button element with data-id.
   */
  static async #onRegenerateItem(event, target) {
    const boxId = target.dataset.id;
    const boxes = game.settings.get(MODULE_ID, "boxes");
    const box = boxes[boxId];
    if (!box) return;

    const existingItem = game.items.find(
      (i) => i.type === "loot" && i.getFlag(MODULE_ID, "boxId") === boxId
    );
    if (existingItem) {
      ui.notifications.warn(`Item for "${box.name}" already exists.`);
      return;
    }

    await MysteryBoxEditor.createWorldItem(box.name, boxId, box.rarity);
  }

  /**
   * Deletes a Mystery Box config from settings and removes its world item.
   * @param {PointerEvent} event - The triggering click event.
   * @param {HTMLElement} target - The action button element with data-id.
   */
  static async #onDeleteBox(event, target) {
    const boxId = target.dataset.id;
    const boxes = foundry.utils.deepClone(game.settings.get(MODULE_ID, "boxes"));
    const boxName = boxes[boxId]?.name;
    if (!boxName) return;

    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Delete Mystery Box" },
      content: `<p>Delete <strong>${boxName}</strong>? This cannot be undone.</p>`,
      yes: { default: true }
    });
    if (!confirmed) return;

    try {
      delete boxes[boxId];
      await game.settings.set(MODULE_ID, "boxes", boxes);

      // Also remove matching world item by flag ID
      const worldItem = game.items.find(
        (i) => i.type === "loot" && i.getFlag(MODULE_ID, "boxId") === boxId
      );
      if (worldItem) await worldItem.delete();
    } catch (err) {
      ui.notifications.error("Failed to delete Mystery Box.");
      console.error(err);
    }

    this.render({ parts: ["list"] });
  }
}
