const MODULE_ID = "dh-mystery-box";
const VALID_ITEM_TYPES = new Set(["weapon", "armor", "loot", "consumable", "feature"]);

/**
 * Dialog for bulk-importing items from compendiums into the Mystery Box Editor.
 * Presents a filtered list of compendiums (type=Item with valid entries),
 * allows multi-select via checkboxes, and applies a global chance slider.
 * Opened from MysteryBoxEditor via the "Import" action.
 */
export class MysteryBoxImportDialog extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  /**
   * @param {object} [options] - Configuration options.
   * @param {Function} [options.onImport] - Callback receiving an array of { uuid, name, img, type, chance }.
   */
  constructor({ onImport } = {}) {
    super();
    this._onImport = onImport;
    this._compendiums = [];
    this._selectedCompendiumId = null;
    this._items = [];
    this._selectedIndexes = new Set();
    this._defaultChance = 75;
    this._initialized = false;
  }

  static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
    id: "dh-mb-import-dialog",
    classes: ["dh-mystery-box-app", "dh-mystery-box-import"],
    window: {
      title: "Import Items from Compendium",
      icon: "fas fa-file-import",
      resizable: true
    },
    position: {
      width: 680,
      height: 550
    },
    actions: {
      selectCompendium: MysteryBoxImportDialog.#onSelectCompendium,
      toggleItem: MysteryBoxImportDialog.#onToggleItem,
      selectAll: MysteryBoxImportDialog.#onSelectAll,
      deselectAll: MysteryBoxImportDialog.#onDeselectAll,
      randomSelect: MysteryBoxImportDialog.#onRandomSelect,
      viewItem: MysteryBoxImportDialog.#onViewItem,
      importItems: MysteryBoxImportDialog.#onImportItems
    }
  }, { inplace: false });

  static PARTS = {
    form: {
      template: `modules/${MODULE_ID}/templates/mb-import-dialog.hbs`
    }
  };

  /**
   * Fetch all Item-type compendiums that contain at least one valid item type.
   * Caches the result on the instance to avoid repeated async pack index loads.
   * @returns {Promise<Array<{id: string, name: string}>>} Filtered compendium list.
   */
  async _fetchValidCompendiums() {
    const results = [];
    for (const pack of game.packs) {
      if (pack.metadata.type !== "Item") continue;
      const index = await pack.getIndex({ fields: ["type"] });
      const hasValid = index.some(entry => VALID_ITEM_TYPES.has(entry.type));
      if (hasValid) {
        results.push({ id: pack.metadata.id, name: pack.metadata.label });
      }
    }
    return results;
  }

  /**
   * Load all valid items from a specific compendium pack.
   * @param {string} compendiumId - The full pack ID (e.g. "daggerheart.weapons").
   * @returns {Promise<Array<{uuid: string, name: string, img: string, type: string}>>} Valid items.
   */
  async _loadCompendiumItems(compendiumId) {
    const pack = game.packs.get(compendiumId);
    if (!pack) return [];
    const documents = await pack.getDocuments();
    return documents
      .filter(item => VALID_ITEM_TYPES.has(item.type))
      .map(item => ({
        uuid: item.uuid,
        name: item.name,
        img: item.img,
        type: item.type
      }));
  }

  /**
   * Build template context with compendium list, current items, and selection state.
   * Fetches compendiums on first render only.
   * @param {object} options - Render options from AppV2 lifecycle.
   * @returns {Promise<object>} Template context.
   */
  async _prepareContext(options) {
    if (!this._initialized) {
      this._compendiums = await this._fetchValidCompendiums();
      this._initialized = true;
    }

    return {
      compendiums: this._compendiums,
      selectedCompendiumId: this._selectedCompendiumId,
      items: this._items.map((item, idx) => ({
        ...item,
        index: idx,
        selected: this._selectedIndexes.has(idx)
      })),
      defaultChance: this._defaultChance,
      hasItems: this._items.length > 0,
      hasCompendiums: this._compendiums.length > 0,
      selectedCount: this._selectedIndexes.size
    };
  }

  /**
   * Attach slider sync listener after each render.
   * AppV2 lifecycle: fires after DOM is built.
   * @param {object} context - The prepared context data.
   * @param {object} options - Render options.
   */
  _onRender(context, options) {
    const slider = this.element.querySelector(".mb-import-chance-slider");
    const display = this.element.querySelector(".mb-import-chance-value");
    if (slider && display) {
      slider.addEventListener("input", () => {
        this._defaultChance = parseInt(slider.value);
        display.textContent = `${slider.value}%`;
      });
    }
  }

  /**
   * Handle compendium selection from the dropdown.
   * Loads items from the chosen pack and resets selection state.
   * @param {PointerEvent} event - The triggering event.
   * @param {HTMLElement} target - The action element.
   */
  static async #onSelectCompendium(event, target) {
    const select = this.element.querySelector(".mb-import-compendium-select");
    if (!select) return;
    const compendiumId = select.value;
    if (!compendiumId) return;

    this._selectedCompendiumId = compendiumId;
    this._items = await this._loadCompendiumItems(compendiumId);
    this._selectedIndexes.clear();
    this.render({ parts: ["form"] });
  }

  /**
   * Toggle a single item's selection state via its checkbox.
   * Updates DOM directly to preserve scroll position.
   * @param {PointerEvent} event - The triggering event.
   * @param {HTMLElement} target - The action element with data-index.
   */
  static #onToggleItem(event, target) {
    const row = target.closest(".mb-import-item");
    if (!row) return;
    const index = Number(row.dataset.index);
    if (this._selectedIndexes.has(index)) {
      this._selectedIndexes.delete(index);
    } else {
      this._selectedIndexes.add(index);
    }
    MysteryBoxImportDialog.#syncItemRow(row, this._selectedIndexes.has(index));
    MysteryBoxImportDialog.#updateSelectedCount(this.element, this._selectedIndexes.size);
  }

  /**
   * Select all items in the current compendium list.
   * Updates DOM directly to preserve scroll position.
   * @param {PointerEvent} event - The triggering event.
   * @param {HTMLElement} target - The action element.
   */
  static #onSelectAll(event, target) {
    for (let i = 0; i < this._items.length; i++) {
      this._selectedIndexes.add(i);
    }
    const rows = this.element.querySelectorAll(".mb-import-item");
    for (const row of rows) MysteryBoxImportDialog.#syncItemRow(row, true);
    MysteryBoxImportDialog.#updateSelectedCount(this.element, this._selectedIndexes.size);
  }

  /**
   * Deselect all items.
   * Updates DOM directly to preserve scroll position.
   * @param {PointerEvent} event - The triggering event.
   * @param {HTMLElement} target - The action element.
   */
  static #onDeselectAll(event, target) {
    this._selectedIndexes.clear();
    const rows = this.element.querySelectorAll(".mb-import-item");
    for (const row of rows) MysteryBoxImportDialog.#syncItemRow(row, false);
    MysteryBoxImportDialog.#updateSelectedCount(this.element, 0);
  }

  /**
   * Prompt the user for a count and randomly select that many items.
   * Uses a simple Foundry dialog for input.
   * @param {PointerEvent} event - The triggering event.
   * @param {HTMLElement} target - The action element.
   */
  static async #onRandomSelect(event, target) {
    const totalItems = this._items.length;
    if (totalItems === 0) return;

    const content = `<p>How many items to randomly select? (1–${totalItems})</p>
      <input type="number" id="mb-random-count" value="1" min="1" max="${totalItems}" step="1"
        style="width:100%; text-align:center;">`;

    const count = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Random Selection" },
      content,
      ok: {
        label: "Select",
        callback: (event, button) => {
          const input = button.closest(".window-content")?.querySelector("#mb-random-count");
          return Math.clamp(parseInt(input?.value) || 1, 1, totalItems);
        }
      }
    });

    if (!count) return;

    this._selectedIndexes.clear();
    // Fisher-Yates shuffle on index array, pick first N
    const indices = Array.from({ length: totalItems }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    for (let i = 0; i < count; i++) {
      this._selectedIndexes.add(indices[i]);
    }

    const rows = this.element.querySelectorAll(".mb-import-item");
    for (const row of rows) {
      const idx = Number(row.dataset.index);
      MysteryBoxImportDialog.#syncItemRow(row, this._selectedIndexes.has(idx));
    }
    MysteryBoxImportDialog.#updateSelectedCount(this.element, this._selectedIndexes.size);
  }

  /**
   * Open the item sheet when clicking on the item image.
   * Stops event propagation to prevent the parent toggleItem action.
   * @param {PointerEvent} event - The triggering event.
   * @param {HTMLElement} target - The img element with data-uuid.
   */
  static async #onViewItem(event, target) {
    event.stopPropagation();
    const uuid = target.dataset.uuid;
    if (!uuid) return;
    const item = await fromUuid(uuid);
    if (item?.sheet) item.sheet.render(true);
  }

  /**
   * Update a single item row's visual state without re-rendering.
   * @param {HTMLElement} row - The .mb-import-item element.
   * @param {boolean} selected - Whether the item is selected.
   */
  static #syncItemRow(row, selected) {
    row.classList.toggle("selected", selected);
    const icon = row.querySelector(".mb-import-item-check");
    if (icon) {
      icon.classList.toggle("fa-check-square", selected);
      icon.classList.toggle("fa-square", !selected);
    }
  }

  /**
   * Update the "X selected" counter text in the toolbar.
   * @param {HTMLElement} element - The application root element.
   * @param {number} count - The current selected count.
   */
  static #updateSelectedCount(element, count) {
    const counter = element.querySelector(".mb-import-count");
    if (counter) counter.textContent = `${count} selected`;
  }

  /**
   * Import all selected items by invoking the callback with item data + chance.
   * Closes the dialog after successful import.
   * @param {PointerEvent} event - The triggering event.
   * @param {HTMLElement} target - The action element.
   */
  static #onImportItems(event, target) {
    if (this._selectedIndexes.size === 0) {
      ui.notifications.warn("Select at least one item to import.");
      return;
    }

    const slider = this.element.querySelector(".mb-import-chance-slider");
    if (slider) this._defaultChance = parseInt(slider.value);

    const selectedItems = [];
    for (const idx of this._selectedIndexes) {
      const item = this._items[idx];
      if (item) {
        selectedItems.push({
          uuid: item.uuid,
          name: item.name,
          img: item.img,
          type: item.type,
          chance: this._defaultChance
        });
      }
    }

    if (this._onImport) this._onImport(selectedItems);
    this.close();
  }
}
