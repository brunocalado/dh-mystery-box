import { MysteryBoxManager } from "./mb-manager.js";
import { MysteryBoxOpener } from "./mb-opener.js";
import { MysteryBoxSettingsApp } from "./mb-settings.js";
import { debugLog } from "./mb-helpers.js";

const MODULE_ID = "dh-mystery-box";

/**
 * Register module settings and preload Handlebars templates.
 * Triggered by the Foundry `init` hook.
 */
Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "boxes", {
    scope: "world",
    config: false,
    type: Object,
    default: {}
  });

  game.settings.register(MODULE_ID, "soundCommon", {
    scope: "world",
    config: false,
    type: String,
    default: `modules/${MODULE_ID}/assets/audio/box-common.mp3`
  });

  game.settings.register(MODULE_ID, "soundUncommon", {
    scope: "world",
    config: false,
    type: String,
    default: `modules/${MODULE_ID}/assets/audio/box-uncommon.mp3`
  });

  game.settings.register(MODULE_ID, "soundRare", {
    scope: "world",
    config: false,
    type: String,
    default: `modules/${MODULE_ID}/assets/audio/box-rare.mp3`
  });

  game.settings.register(MODULE_ID, "soundLegendary", {
    scope: "world",
    config: false,
    type: String,
    default: `modules/${MODULE_ID}/assets/audio/box-legendary.mp3`
  });

  game.settings.register(MODULE_ID, "emptySound", {
    scope: "world",
    config: false,
    type: String,
    default: `modules/${MODULE_ID}/assets/audio/empty.mp3`
  });

  game.settings.register(MODULE_ID, "chatMessageMode", {
    name: "Chat Message Visibility",
    hint: "Determines who sees the chat message when a Mystery Box is opened.",
    scope: "world",
    config: true,
    type: String,
    choices: {
      "public": "Public (Visible to Everyone)",
      "gm": "GM Only (Whisper)"
    },
    default: "gm"
  });

  game.settings.register(MODULE_ID, "debugLogs", {
    name: "Debug Logs",
    hint: "If enabled, detailed logs about item rolls (Name, Chance, Roll Result) will be printed to the console.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  // --- Default Asset Paths (managed via settings menu) ---
  game.settings.register(MODULE_ID, "iconCommon", {
    scope: "world",
    config: false,
    type: String,
    default: `modules/${MODULE_ID}/assets/icons/box-common.webp`
  });

  game.settings.register(MODULE_ID, "iconUncommon", {
    scope: "world",
    config: false,
    type: String,
    default: `modules/${MODULE_ID}/assets/icons/box-uncommon.webp`
  });

  game.settings.register(MODULE_ID, "iconRare", {
    scope: "world",
    config: false,
    type: String,
    default: `modules/${MODULE_ID}/assets/icons/box-rare.webp`
  });

  game.settings.register(MODULE_ID, "iconLegendary", {
    scope: "world",
    config: false,
    type: String,
    default: `modules/${MODULE_ID}/assets/icons/box-legendary.webp`
  });

  game.settings.register(MODULE_ID, "videoCommon", {
    scope: "world",
    config: false,
    type: String,
    default: `modules/${MODULE_ID}/assets/video/box-common.webm`
  });

  game.settings.register(MODULE_ID, "videoUncommon", {
    scope: "world",
    config: false,
    type: String,
    default: `modules/${MODULE_ID}/assets/video/box-uncommon.webm`
  });

  game.settings.register(MODULE_ID, "videoRare", {
    scope: "world",
    config: false,
    type: String,
    default: `modules/${MODULE_ID}/assets/video/box-rare.webm`
  });

  game.settings.register(MODULE_ID, "videoLegendary", {
    scope: "world",
    config: false,
    type: String,
    default: `modules/${MODULE_ID}/assets/video/box-legendary.webm`
  });

  game.settings.registerMenu(MODULE_ID, "defaultAssetsMenu", {
    name: "Default Assets",
    label: "Configure Default Assets",
    hint: "Configure default icons and opening videos used for each rarity tier.",
    icon: "fas fa-images",
    type: MysteryBoxSettingsApp,
    restricted: true
  });

  foundry.applications.handlebars.loadTemplates([
    `modules/${MODULE_ID}/templates/mb-manager.hbs`,
    `modules/${MODULE_ID}/templates/mb-editor.hbs`,
    `modules/${MODULE_ID}/templates/mb-opener.hbs`,
    `modules/${MODULE_ID}/templates/mb-reveal.hbs`,
    `modules/${MODULE_ID}/templates/mb-settings-menu.hbs`,
    `modules/${MODULE_ID}/templates/mb-import-dialog.hbs`,
    `modules/${MODULE_ID}/templates/mb-editor-config.hbs`
  ]);
});

/**
 * Expose the global MysteryBox API once the game is ready.
 * Triggered by the Foundry `ready` hook.
 */
Hooks.once("ready", () => {
  globalThis.MysteryBox = {
    /**
     * Opens the Mystery Box Manager window. GM only.
     */
    Manager() {
      if (!game.user.isGM) {
        ui.notifications.warn("Only the GM can manage Mystery Boxes.");
        return;
      }
      new MysteryBoxManager().render(true);
    },

    /**
     * Opens the Mystery Box Opener for the current player.
     */
    Open() {
      new MysteryBoxOpener().render(true);
    }
  };
});

/**
 * Inject a "Mystery Box" button into the Daggerheart Menu.
 * Triggered by the Foundry `renderDaggerheartMenu` hook.
 * @param {ApplicationV2} app - The DaggerheartMenu application instance.
 * @param {HTMLElement} html - The rendered HTML element.
 */
Hooks.on("renderDaggerheartMenu", (app, html) => {
  const element = (html instanceof HTMLElement) ? html : html[0];

  const myButton = document.createElement("button");
  myButton.type = "button";
  myButton.innerHTML = `<i class="fas fa-box-open"></i> Manage Mystery Boxes`;
  myButton.classList.add("dh-custom-btn");
  myButton.style.marginTop = "0px";
  myButton.style.width = "100%";

  myButton.addEventListener("click", (event) => {
    event.preventDefault();
    if (globalThis.MysteryBox) globalThis.MysteryBox.Manager();
    else ui.notifications.warn("Mystery Box module is not ready yet.");
  });

  const fieldset = element.querySelector("fieldset");
  if (fieldset) {
    const newFieldset = document.createElement("fieldset");
    const legend = document.createElement("legend");
    legend.textContent = "Mystery Box";
    newFieldset.appendChild(legend);
    newFieldset.appendChild(myButton);
    fieldset.after(newFieldset);
  } else {
    element.appendChild(myButton);
  }
});
