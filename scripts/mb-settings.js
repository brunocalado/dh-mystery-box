const MODULE_ID = "dh-mystery-box";

/**
 * Settings menu for configuring default asset paths per rarity tier.
 * Provides two tabs: Icons (images used for world items) and Videos (opening animations).
 * Triggered via game.settings.registerMenu.
 */
export class MysteryBoxSettingsApp extends foundry.applications.api.HandlebarsApplicationMixin(
    foundry.applications.api.ApplicationV2
) {
    static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
        id: "dh-mystery-box-settings-app",
        tag: "form",
        classes: ["dh-mystery-box-app", "dh-mystery-box-settings"],
        window: { title: "Mystery Box: Default Assets", resizable: true },
        position: { width: 700, height: 520 }
    }, { inplace: false });

    static PARTS = {
        content: { template: `modules/${MODULE_ID}/templates/mb-settings-menu.hbs` }
    };

    /**
     * Loads all configurable asset paths from settings into the template context.
     * Called by the AppV2 render lifecycle before the template is rendered.
     * @param {object} _options - Render options (unused).
     * @returns {Promise<object>} Template context with icon and video paths per rarity.
     */
    async _prepareContext(_options) {
        return {
            iconCommon:     game.settings.get(MODULE_ID, "iconCommon"),
            iconUncommon:   game.settings.get(MODULE_ID, "iconUncommon"),
            iconRare:       game.settings.get(MODULE_ID, "iconRare"),
            iconLegendary:  game.settings.get(MODULE_ID, "iconLegendary"),
            videoCommon:    game.settings.get(MODULE_ID, "videoCommon"),
            videoUncommon:  game.settings.get(MODULE_ID, "videoUncommon"),
            videoRare:      game.settings.get(MODULE_ID, "videoRare"),
            videoLegendary: game.settings.get(MODULE_ID, "videoLegendary"),
            soundCommon:    game.settings.get(MODULE_ID, "soundCommon"),
            soundUncommon:  game.settings.get(MODULE_ID, "soundUncommon"),
            soundRare:      game.settings.get(MODULE_ID, "soundRare"),
            soundLegendary: game.settings.get(MODULE_ID, "soundLegendary"),
            emptySound:     game.settings.get(MODULE_ID, "emptySound")
        };
    }

    /**
     * Wires tab switching, file picker buttons, and form submission.
     * Triggered by the AppV2 render lifecycle after the template is inserted into the DOM.
     * @param {object} context - The prepared template context.
     * @param {object} options - Render options.
     */
    _onRender(context, options) {
        // --- TAB SWITCHING ---
        const navItems = this.element.querySelectorAll(".mbs-nav-item");
        const tabs     = this.element.querySelectorAll(".mbs-tab");

        navItems.forEach(nav => {
            nav.addEventListener("click", e => {
                e.preventDefault();
                const target = nav.dataset.tab;
                navItems.forEach(n => n.classList.toggle("active", n.dataset.tab === target));
                tabs.forEach(t => t.classList.toggle("active", t.dataset.tab === target));
            });
        });

        // --- FILE PICKER BUTTONS ---
        // Each button carries data-target (input name) and data-picker-type (FilePicker type).
        this.element.querySelectorAll(".mbs-file-picker-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const inputName = btn.dataset.target;
                const input     = this.element.querySelector(`input[name="${inputName}"]`);
                const type      = btn.dataset.pickerType ?? "image";

                new foundry.applications.apps.FilePicker.implementation({
                    type,
                    current:  input?.value ?? "",
                    callback: path => { if (input) input.value = path; }
                }).render(true);
            });
        });

        // --- FORM SUBMISSION ---
        this.element.addEventListener("submit", async e => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const keys = [
                "iconCommon", "iconUncommon", "iconRare", "iconLegendary",
                "videoCommon", "videoUncommon", "videoRare", "videoLegendary",
                "soundCommon", "soundUncommon", "soundRare", "soundLegendary",
                "emptySound"
            ];

            try {
                for (const key of keys) {
                    const value = fd.get(key)?.trim();
                    if (value !== null) await game.settings.set(MODULE_ID, key, value);
                }
                this.close();
            } catch (err) {
                ui.notifications.error(`Mystery Box: Failed to save default assets. ${err.message}`);
            }
        });
    }
}
