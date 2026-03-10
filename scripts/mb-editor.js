import { MysteryBoxImportDialog } from "./mb-import-dialog.js";
import { MysteryBoxEditorConfig } from "./mb-editor-config.js";

const MODULE_ID = "dh-mystery-box";
const VALID_ITEM_TYPES = new Set(["weapon", "armor", "loot", "consumable", "feature"]);

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
 * Finds or creates the dedicated folder for Mystery Box items.
 * @returns {Promise<Folder|null>} The folder document, or null on failure.
 */
async function getOrCreateMysteryBoxFolder() {
  const FOLDER_NAME = "🎁️ Mystery Box";
  const FOLDER_COLOR = "#480057"; // From module.json packFolders
  const FOLDER_TYPE = "Item";

  let folder = game.folders.find(f => f.name === FOLDER_NAME && f.type === FOLDER_TYPE);
  if (folder) return folder;

  try {
    return await Folder.create({
      name: FOLDER_NAME,
      type: FOLDER_TYPE,
      color: FOLDER_COLOR
    });
  } catch (err) {
    ui.notifications.error(`Failed to create item folder "${FOLDER_NAME}".`);
    console.error(`[${MODULE_ID}]`, err);
    return null;
  }
}

/**
 * Editor for creating or editing a single Mystery Box.
 * Uses per-row drag-and-drop zones with a "+" button to add item slots.
 * Opened from the MysteryBoxManager via create/edit actions.
 */
export class MysteryBoxEditor extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  /**
   * @param {object} [options] - Configuration options.
   * @param {string|null} [options.boxId=null] - Existing box ID for edit mode, null for create.
   * @param {MysteryBoxManager|null} [options.managerApp=null] - Reference to parent manager for re-render.
   */
  constructor({ boxId = null, managerApp = null } = {}) {
    super({ window: { title: boxId ? "Edit Mystery Box" : "Create Mystery Box" } });
    this._boxId = boxId;
    this._managerApp = managerApp;
    this._items = [];
    this._boxName = "";
    this._boxRarity = "common";
    this._boxOpeningStyle = "video";
    this._boxMode = "percentage";
    this._raffleCount = 1;
    this._raffleMaximum = 1;
    this._initialized = false;
  }

  static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
    id: "dh-mb-editor",
    classes: ["dh-mystery-box-app", "dh-mystery-box-editor"],
    tag: "form",
    window: {
      title: "Mystery Box Editor",
      icon: "fas fa-box-open",
      resizable: true
    },
    position: {
      width: 700,
      height: "auto"
    },
    form: {
      handler: MysteryBoxEditor.#onFormSubmit,
      closeOnSubmit: false
    },
    actions: {
      removeItem: MysteryBoxEditor.#onRemoveItem,
      addItem: MysteryBoxEditor.#onAddItem,
      openImportDialog: MysteryBoxEditor.#onOpenImportDialog,
      openEditorConfig: MysteryBoxEditor.#onOpenEditorConfig
    }
  }, { inplace: false });

  static PARTS = {
    form: {
      template: `modules/${MODULE_ID}/templates/mb-editor.hbs`
    }
  };

  /**
   * Load existing box data from settings on first render.
   * Resolves each stored UUID to get display info; skips deleted items.
   * @param {object} options - Render options from AppV2 lifecycle.
   * @returns {Promise<object>} Template context with name and items array.
   */
  async _prepareContext(options) {
    if (!this._initialized && this._boxId) {
      const boxes = game.settings.get(MODULE_ID, "boxes");
      const box = boxes[this._boxId];
      if (box) {
        this._boxName = box.name;
        this._boxRarity = box.rarity ?? "common";
        this._boxOpeningStyle = box.openingStyle ?? "video";
        if (this._boxOpeningStyle === "none") this._boxOpeningStyle = "confetti";
        this._boxMode = box.mode ?? "percentage";
        this._raffleCount = box.raffleCount ?? 1;
        this._raffleMaximum = box.raffleMaximum ?? 1;
        this._items = [];
        for (const entry of box.items) {
          const item = await fromUuid(entry.uuid);
          if (!item) {
            console.warn(`[${MODULE_ID}] Item with UUID "${entry.uuid}" no longer exists. Skipping.`);
            continue;
          }
          this._items.push({
            uuid: entry.uuid,
            name: item.name,
            img: item.img,
            type: item.type,
            chance: entry.chance
          });
        }
      }
      this._initialized = true;
    } else if (!this._initialized) {
      this._initialized = true;
    }

    return {
      name: this._boxName,
      rarity: this._boxRarity,
      openingStyle: this._boxOpeningStyle,
      mode: this._boxMode,
      raffleCount: this._raffleCount,
      raffleMaximum: this._raffleMaximum,
      isRaffle: this._boxMode === "raffle",
      openingStyleOptions: {
        confetti: "Confetti",
        video: "Video"
      },
      rarityOptions: {
        common: "Common",
        uncommon: "Uncommon",
        rare: "Rare",
        legendary: "Legendary"
      },
      modeOptions: {
        percentage: "Percentage",
        raffle: "Raffle"
      },
      items: this._items,
      isEdit: !!this._boxId
    };
  }

  /**
   * Attach per-row drag-and-drop listeners and slider sync after each render.
   * AppV2 lifecycle: `_onRender` fires after the DOM is built.
   * @param {object} context - The prepared context data.
   * @param {object} options - Render options.
   */
  _onRender(context, options) {
    const itemList = this.element.querySelector("#mb-item-list");
    if (!itemList) return;

    // Per-row drag-and-drop: delegated on the item list container
    itemList.addEventListener("dragover", (event) => {
      const dropZone = event.target.closest(".mb-item-drop");
      if (!dropZone) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      dropZone.classList.add("drag-over");
    });

    itemList.addEventListener("dragleave", (event) => {
      const dropZone = event.target.closest(".mb-item-drop");
      if (dropZone) dropZone.classList.remove("drag-over");
    });

    itemList.addEventListener("drop", (event) => {
      const dropZone = event.target.closest(".mb-item-drop");
      if (!dropZone) return;
      event.preventDefault();
      dropZone.classList.remove("drag-over");
      const index = parseInt(dropZone.dataset.index);
      this.#onDrop(event, index);
    });

    // Sync range slider display values with mode-aware labels
    const sliders = this.element.querySelectorAll(".chance-slider");
    for (const slider of sliders) {
      slider.setAttribute("min", "5");
      slider.setAttribute("step", "5");

      const display = slider.closest(".mb-item-controls")?.querySelector(".chance-value");
      if (display) {
        slider.addEventListener("input", () => {
          display.textContent = this._boxMode === "raffle" ? `Weight: ${slider.value}` : `${slider.value}%`;
        });
      }
    }

  }

  /**
   * Add an empty item slot to the list.
   * Creates a new row with a dashed drop zone where the user can drag an item.
   * @param {PointerEvent} event - The triggering click event.
   * @param {HTMLElement} target - The action button element.
   */
  static #onAddItem(event, target) {
    const itemList = this.element.querySelector("#mb-item-list");
    const nextIndex = itemList.querySelectorAll(".mb-item-row").length;

    const newRow = document.createElement("div");
    newRow.className = "mb-item-row";
    newRow.dataset.index = String(nextIndex);
    const isRaffle = this._boxMode === "raffle";
    const labelText = isRaffle ? "Weight: 100" : "100%";
    newRow.innerHTML = `
      <div class="mb-item-drop empty" data-index="${nextIndex}">
          <i class="fas fa-hand-pointer"></i>
          <span class="mb-item-name">Drag Item Here</span>
      </div>
      <div class="mb-item-controls">
          <input type="range" class="chance-slider" name="chance_${nextIndex}" value="100" min="5" max="100" step="5">
          <span class="chance-value">${labelText}</span>
          <button type="button" class="mb-item-remove" data-action="removeItem" data-index="${nextIndex}" title="Remove">
              <i class="fas fa-times"></i>
          </button>
      </div>`;
    itemList.appendChild(newRow);

    // Sync slider for the new row with mode-aware label
    const slider = newRow.querySelector(".chance-slider");
    const display = newRow.querySelector(".chance-value");
    slider.addEventListener("input", () => {
      display.textContent = this._boxMode === "raffle" ? `Weight: ${slider.value}` : `${slider.value}%`;
    });
  }

  /**
   * Handle an item being dropped into a specific row's drop zone.
   * Validates item type and prevents duplicates.
   * @param {DragEvent} event - The native drop event.
   * @param {number} rowIndex - The row index where the item was dropped.
   */
  async #onDrop(event, rowIndex) {
    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData("text/plain"));
    } catch {
      return;
    }

    if (data.type !== "Item") return;

    const item = await fromUuid(data.uuid);
    if (!item) {
      ui.notifications.warn("Could not resolve the dropped item.");
      return;
    }

    if (!VALID_ITEM_TYPES.has(item.type)) {
      ui.notifications.warn("Only weapon, armor, loot, consumable, and feature items are allowed.");
      return;
    }

    // Read the current slider value before re-render
    const row = this.element.querySelector(`.mb-item-row[data-index="${rowIndex}"]`);
    const currentChance = row ? parseInt(row.querySelector(".chance-slider")?.value) || 100 : 100;

    // Ensure the _items array is long enough, filling empty slots
    while (this._items.length <= rowIndex) {
      this._items.push(null);
    }

    this._items[rowIndex] = {
      uuid: data.uuid,
      name: item.name,
      img: item.img,
      type: item.type,
      chance: currentChance
    };

    // Collect all slider values before re-render to preserve them
    this.#syncSlidersToItems();

    this.render({ parts: ["form"] });
  }

  /**
   * Read current slider values from the DOM and sync them to the _items array.
   * Prevents data loss during re-renders.
   */
  #syncSlidersToItems() {
    const rows = this.element.querySelectorAll(".mb-item-row");
    for (const row of rows) {
      const idx = parseInt(row.dataset.index);
      if (idx < this._items.length && this._items[idx]) {
        const slider = row.querySelector(".chance-slider");
        if (slider) this._items[idx].chance = parseInt(slider.value) || 100;
      }
    }
  }

  /**
   * Remove an item from the box by its index in the items array.
   * @param {PointerEvent} event - The triggering click event.
   * @param {HTMLElement} target - The action button with data-index.
   */
  static #onRemoveItem(event, target) {
    const index = Number(target.dataset.index);

    // Sync sliders before modifying the array
    this.#syncSlidersToItems();

    if (Number.isFinite(index) && index >= 0 && index < this._items.length) {
      this._items.splice(index, 1);
    } else {
      // Row was an empty slot (not yet in _items), just remove the DOM element
      target.closest(".mb-item-row")?.remove();
      return;
    }

    // Remove null entries that may have accumulated
    this._items = this._items.filter((i) => i !== null);

    this.render({ parts: ["form"] });
  }

  /**
   * Open the bulk import dialog to add items from compendiums.
   * Passes a callback that appends imported items to the editor's item list.
   * @param {PointerEvent} event - The triggering click event.
   * @param {HTMLElement} target - The action button element.
   */
  static #onOpenImportDialog(event, target) {
    // Sync sliders before opening to preserve current chance values
    this.#syncSlidersToItems();

    const editor = this;
    const dialog = new MysteryBoxImportDialog({
      onImport(importedItems) {
        // Remove null slots before appending
        editor._items = editor._items.filter(i => i !== null);

        const existingUuids = new Set(editor._items.map(i => i.uuid));
        let added = 0;

        for (const item of importedItems) {
          if (existingUuids.has(item.uuid)) continue;
          editor._items.push({
            uuid: item.uuid,
            name: item.name,
            img: item.img,
            type: item.type,
            chance: item.chance
          });
          existingUuids.add(item.uuid);
          added++;
        }

        if (added > 0) editor.render({ parts: ["form"] });
      }
    });
    dialog.render(true);
  }

  /**
   * Open the editor configuration dialog for openingStyle, rarity, and mode.
   * @param {PointerEvent} event - The triggering click event.
   * @param {HTMLElement} target - The action button element.
   */
  static #onOpenEditorConfig(event, target) {
    // Sync sliders before opening to preserve current chance values
    this.#syncSlidersToItems();

    const config = new MysteryBoxEditorConfig(this);
    config.render(true);
  }

  /**
   * Handle form submission: read form values, persist to settings, create/update world item.
   * @param {SubmitEvent} event - The form submission event.
   * @param {HTMLFormElement} form - The submitted form element.
   * @param {FormDataExtended} formData - The processed form data.
   */
  static async #onFormSubmit(event, form, formData) {
    const data = formData.object;
    const name = data.name?.trim();
    const rarity = this._boxRarity;
    const openingStyle = this._boxOpeningStyle;
    const mode = this._boxMode;
    const raffleCount = this._raffleCount;
    const raffleMaximum = this._raffleMaximum;

    if (!name) {
      ui.notifications.warn("Please provide a name for the Mystery Box.");
      return;
    }

    // Sync sliders before saving
    this.#syncSlidersToItems();

    // Filter out null/empty slots
    const validItems = this._items.filter((i) => i !== null);

    if (validItems.length === 0) {
      ui.notifications.warn("Add at least one item to the Mystery Box.");
      return;
    }

    // Read per-item chance values from the form
    for (let i = 0; i < validItems.length; i++) {
      const chanceKey = `chance_${i}`;
      if (chanceKey in data) {
        validItems[i].chance = Math.clamp(Number(data[chanceKey]) || 100, 5, 100);
      }
    }

    const boxes = foundry.utils.deepClone(game.settings.get(MODULE_ID, "boxes"));
    const isCreate = !this._boxId;
    const boxId = isCreate ? foundry.utils.randomID() : this._boxId;

    boxes[boxId] = {
      name,
      rarity,
      openingStyle,
      mode,
      raffleCount,
      raffleMaximum,
      items: validItems.map((i) => ({ uuid: i.uuid, chance: i.chance }))
    };

    try {
      await game.settings.set(MODULE_ID, "boxes", boxes);
    } catch (err) {
      ui.notifications.error("Failed to save Mystery Box configuration.");
      console.error(err);
      return;
    }

    if (isCreate) {
      await MysteryBoxEditor.createWorldItem(name, boxId, rarity);
    } else {
      await MysteryBoxEditor.#updateWorldItem(boxId, name, rarity);
    }

    // Refresh the manager window if it is currently open
    const manager = foundry.applications.instances.get("dh-mb-manager");
    if (manager?.rendered) {
      try {
        await manager.render({ parts: ["list"] });
      } catch { /* Ignore render errors during close */ }
    }
    this.close();
  }

  /**
   * Create a new world loot item for the Mystery Box.
   * The item includes a macro action that triggers the Open flow.
   * Stores the boxId as a module flag so the opener can match by ID instead of name.
   * Quantity management is handled explicitly by the opener, not the system action cost.
   * @param {string} name - The box name to use for the item.
   * @param {string} boxId - The unique box ID from settings, stored as a flag for detection.
   * @param {string} [rarity="common"] - The rarity of the box to determine the icon.
   */
  static async createWorldItem(name, boxId, rarity = "common") {
    const folder = await getOrCreateMysteryBoxFolder();

    const actionId = foundry.utils.randomID();
    const img = getRarityIcon(rarity);
    const itemData = {
      name,
      type: "loot",
      img: img,
      system: {
        attribution: {},
        description: "",
        quantity: 1,
        actions: {
          [actionId]: {
            type: "macro",
            _id: actionId,
            systemPath: "actions",
            baseAction: false,
            description: "",
            chatDisplay: true,
            originItem: { type: "itemCollection" },
            actionType: "action",
            triggers: [],
            cost: [],
            uses: {
              value: null,
              max: "",
              recovery: null,
              consumeOnSuccess: false
            },
            macro: `Compendium.${MODULE_ID}.macros.Macro.Qzq3E2LUPQEb4SVy`,
            name: "Open",
            range: ""
          }
        }
      },
      effects: [],
      folder: folder?.id ?? null,
      flags: { [MODULE_ID]: { boxId } },
      ownership: { default: 0 }
    };

    try {
      await Item.create(itemData);
      ui.notifications.info(`Created Mystery Box item "${name}".`);
    } catch (err) {
      ui.notifications.error("Failed to create the world item for this Mystery Box.");
      console.error(err);
    }
  }

  /**
   * Update the world consumable item when a box is edited.
   * Uses the module flag to find the correct item regardless of current name.
   * @param {string} boxId - The box ID stored as a flag on the world item.
   * @param {string} newName - The new name to apply.
   * @param {string} newRarity - The new rarity to apply.
   */
  static async #updateWorldItem(boxId, newName, newRarity) {
    const worldItem = game.items.find(
      (i) => i.type === "loot" && i.getFlag(MODULE_ID, "boxId") === boxId
    );
    if (!worldItem) return;

    const img = getRarityIcon(newRarity);

    try {
      await worldItem.update({ name: newName, img });
    } catch (err) {
      ui.notifications.error("Failed to update the world item.");
      console.error(err);
    }
  }
}
