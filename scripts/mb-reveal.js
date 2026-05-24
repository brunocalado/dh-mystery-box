import { MODULE_ID } from "./constants.js";

/**
 * Display-only UI that shows the player which items they received from a Mystery Box.
 * Rendered after a successful box opening in MysteryBoxOpener.
 */
export class MysteryBoxReveal extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  /**
   * @param {object[]} items - Plain item data objects (from Item#toObject).
   */
  constructor(items) {
    super();
    this._items = items;
  }

  static BASE_APPLICATION = MysteryBoxReveal;

  static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
    id: "dh-mb-reveal",
    classes: ["dh-mystery-box-app", "dh-mystery-box-reveal"],
    window: {
      title: "You received:",
      icon: "fas fa-gift",
      resizable: true
    },
    position: {
      width: 420,
      height: "auto"
    },
    actions: {
      viewItem: MysteryBoxReveal.#onViewItem
    }
  }, { inplace: false });

  static PARTS = {
    list: {
      template: `modules/${MODULE_ID}/templates/mb-reveal.hbs`
    }
  };

  /**
   * Build context for the reveal template.
   * Extracts displayable fields from plain item objects.
   * @param {object} options - Render options from AppV2 lifecycle.
   * @returns {Promise<object>} Template context with items array.
   */
  async _prepareContext(options) {
    const items = this._items.map((item, index) => ({
      img: item.img,
      name: item.name,
      index
    }));
    return { items };
  }

  /**
   * Open the item sheet for inspection when the magnifier button is clicked.
   * Uses the actor's copy of the item (matched by name) so the sheet renders correctly.
   * @param {PointerEvent} event - The triggering click event.
   * @param {HTMLElement} target - The action button with data-index.
   */
  static async #onViewItem(event, target) {
    const index = Number(target.dataset.index);
    const itemData = this._items[index];
    if (!itemData) return;

    // Find the actual item on the actor so we get a proper sheet
    const actor = game.user.character;
    if (actor) {
      const actorItem = actor.items.find(i => i.name === itemData.name && i.img === itemData.img);
      if (actorItem) {
        actorItem.sheet.render(true);
        return;
      }
    }

    // Fallback: create a temporary item to display
    const tempItem = await Item.implementation.create(itemData, { temporary: true });
    tempItem.sheet.render(true);
  }
}
