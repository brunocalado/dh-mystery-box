import { MODULE_ID } from "./constants.js";

/**
 * Display-only UI that shows the player which items they received from a Mystery Box.
 * Rendered after a successful box opening in MysteryBoxOpener.
 */
export class MysteryBoxReveal extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  /**
   * @param {object[]} items - Plain item data objects (from Item#toObject). Real,
   *   unmasked data — used to locate/recreate the actual item for the magnifier
   *   button, which relies on dh-unidentified's own sheet masking when present.
   * @param {{name: string, img: string}[]} [displayItems] - Audience-appropriate
   *   name/img to render in the list, one per entry in `items`. Defaults to the
   *   real name/img when omitted (no dh-unidentified integration in play).
   * @param {Actor} [actor] - The actor that actually received the items (may
   *   differ from `game.user.character` in party mode). Falls back to the
   *   current user's character.
   */
  constructor(items, displayItems, actor) {
    super();
    this._items = items;
    this._display = displayItems ?? items.map(i => ({ name: i.name, img: i.img }));
    this._actor = actor ?? game.user.character;
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
      img: this._display[index]?.img ?? item.img,
      name: this._display[index]?.name ?? item.name,
      index
    }));
    return { items };
  }

  /**
   * Open the item sheet for inspection when the magnifier button is clicked.
   * Uses the actor's copy of the item (matched by name) so the sheet renders correctly.
   * Real (unmasked) name/img are used for the match since dh-unidentified never
   * touches those document fields — masking, if any, is applied by that module's
   * own sheet-render hook once the real item's sheet opens.
   * @param {PointerEvent} event - The triggering click event.
   * @param {HTMLElement} target - The action button with data-index.
   */
  static async #onViewItem(event, target) {
    const index = Number(target.dataset.index);
    const itemData = this._items[index];
    if (!itemData) return;

    // Find the actual item on the actor that received it so we get a proper sheet
    const actor = this._actor;
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
