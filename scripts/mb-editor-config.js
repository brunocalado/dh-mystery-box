const MODULE_ID = "dh-mystery-box";

/**
 * Configuration dialog for Mystery Box editor settings.
 * Presents openingStyle, rarity, and mode selects in a dedicated modal
 * so the editor header stays clean. Communicates back to the parent editor
 * via a callback on save.
 */
export class MysteryBoxEditorConfig extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  /**
   * @param {MysteryBoxEditor} parentEditor - The editor instance that spawned this dialog.
   */
  constructor(parentEditor) {
    super();
    this.parentEditor = parentEditor;
  }

  static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
    id: "dh-mb-editor-config",
    tag: "div",
    classes: ["dh-mystery-box-app", "mb-editor-config"],
    window: {
      title: "Box Configuration",
      icon: "fas fa-sliders",
      resizable: false
    },
    position: {
      width: 380,
      height: "auto"
    },
    actions: {
      save: MysteryBoxEditorConfig.#onSave,
      cancel: MysteryBoxEditorConfig.#onCancel
    }
  }, { inplace: false });

  static PARTS = {
    form: {
      template: `modules/${MODULE_ID}/templates/mb-editor-config.hbs`
    }
  };

  /**
   * Provide current config values and option lists to the template.
   * Reads live state from the parent editor instance.
   * @param {object} options - Render options from AppV2 lifecycle.
   * @returns {Promise<object>} Template context.
   */
  async _prepareContext(options) {
    return {
      openingStyle: this.parentEditor._boxOpeningStyle,
      openingStyleOptions: { confetti: "Confetti", video: "Video" },
      rarity: this.parentEditor._boxRarity,
      rarityOptions: { common: "Common", uncommon: "Uncommon", rare: "Rare", legendary: "Legendary" },
      mode: this.parentEditor._boxMode,
      modeOptions: { percentage: "Percentage", raffle: "Raffle" },
      raffleCount: this.parentEditor._raffleCount,
      raffleMaximum: this.parentEditor._raffleMaximum,
      isRaffle: this.parentEditor._boxMode === "raffle"
    };
  }

  /**
   * Toggle raffleCount field visibility when mode changes.
   * AppV2 lifecycle: fires after DOM is built.
   * @param {object} context - The prepared context data.
   * @param {object} options - Render options.
   */
  _onRender(context, options) {
    // --- TAB SWITCHING ---
    const navItems = this.element.querySelectorAll(".mbs-nav-item");
    const tabs = this.element.querySelectorAll(".mbs-tab");

    navItems.forEach(nav => {
      nav.addEventListener("click", e => {
        e.preventDefault();
        const target = nav.dataset.tab;
        navItems.forEach(n => n.classList.toggle("active", n.dataset.tab === target));
        tabs.forEach(t => t.classList.toggle("active", t.dataset.tab === target));
      });
    });

    // --- RAFFLE MODE CONDITIONAL VISIBILITY (scoped to Raffle tab) ---
    const modeSelect = this.element.querySelector("[name='mode']");
    const raffleGroups = this.element.querySelectorAll(".mbs-raffle-group");
    if (modeSelect && raffleGroups.length) {
      modeSelect.addEventListener("change", () => {
        const show = modeSelect.value === "raffle";
        for (const group of raffleGroups) {
          group.style.display = show ? "" : "none";
        }
      });
    }
  }

  /**
   * Collect form values, push them to the parent editor, and close.
   * @param {PointerEvent} event - The triggering click event.
   * @param {HTMLElement} target - The save button element.
   */
  static #onSave(event, target) {
    const form = this.element;
    const openingStyle = form.querySelector("[name='openingStyle']")?.value || "confetti";
    const rarity = form.querySelector("[name='rarity']")?.value || "common";
    const mode = form.querySelector("[name='mode']")?.value || "percentage";
    const raffleCount = Math.clamp(parseInt(form.querySelector("[name='raffleCount']")?.value) || 1, 1, 100);
    const raffleMaximum = Math.clamp(parseInt(form.querySelector("[name='raffleMaximum']")?.value) || 1, 1, 100);

    this.parentEditor._boxOpeningStyle = openingStyle;
    this.parentEditor._boxRarity = rarity;
    this.parentEditor._boxMode = mode;
    this.parentEditor._raffleCount = raffleCount;
    this.parentEditor._raffleMaximum = raffleMaximum;

    // Re-render the parent editor to reflect mode changes (slider labels, raffleCount visibility)
    this.parentEditor.render({ parts: ["form"] });
    this.close();
  }

  /**
   * Close the dialog without applying any changes.
   * @param {PointerEvent} event - The triggering click event.
   * @param {HTMLElement} target - The cancel button element.
   */
  static #onCancel(event, target) {
    this.close();
  }
}
