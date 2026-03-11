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
  Handlebars.registerHelper("eq", (a, b) => a === b);

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
 * Serializes async tasks by chaining each onto the last promise.
 * Prevents race conditions when multiple concurrent hooks write to the same resource.
 */
class TaskQueue {
  constructor() {
    this.last = Promise.resolve();
  }

  /**
   * Push a new async task onto the queue.
   * The task runs only after all previously queued tasks have resolved.
   * @param {Function} fn - Async function to execute.
   * @returns {Promise<void>}
   */
  push(fn) {
    this.last = this.last.then(async () => {
      try {
        await fn();
      } catch (err) {
        console.error(`[${MODULE_ID}] TaskQueue error:`, err);
      }
    });
    return this.last;
  }
}

// Module-level queue — serializes all createItem settings writes
const _boxInstallQueue = new TaskQueue();

/**
 * Auto-install box config when a GM imports a Mystery Box item into World Items.
 * Synchronous hook callback; the async write is serialized via TaskQueue to prevent
 * race conditions during batch imports.
 * Triggered by the Foundry `createItem` hook.
 * @param {Item} item - The newly created world item.
 * @param {object} options - Creation options.
 * @param {string} userId - The ID of the user who created the item.
 */
Hooks.on("createItem", (item, options, userId) => {
  if (!game.user.isGM) return;
  const boxId = item.getFlag(MODULE_ID, "boxId");
  if (!boxId) return;
  const embeddedConfig = item.getFlag(MODULE_ID, "config");
  if (!embeddedConfig) return;

  _boxInstallQueue.push(async () => {
    const boxes = foundry.utils.deepClone(game.settings.get(MODULE_ID, "boxes"));
    if (boxes[boxId]) return;

    boxes[boxId] = embeddedConfig;
    await game.settings.set(MODULE_ID, "boxes", boxes);
    ui.notifications.info(`Mystery Box "${embeddedConfig.name}" auto-installed from imported item.`);
  });
});

/**
 * Auto-install box config when a GM drags a Mystery Box item from a compendium onto an actor sheet.
 * Triggered by the Foundry `createEmbeddedDocuments` hook.
 * @param {Actor} parent - The parent document (actor) receiving the embedded items.
 * @param {Document[]} documents - The array of newly created embedded documents.
 * @param {object} options - Creation options.
 * @param {string} userId - The ID of the user who created the documents.
 */
Hooks.on("createEmbeddedDocuments", async (parent, documents, options, userId) => {
  if (!game.user.isGM) return;
  if (parent.documentName !== "Actor") return;

  for (const doc of documents) {
    if (doc.documentName !== "Item") continue;
    const boxId = doc.getFlag(MODULE_ID, "boxId");
    if (!boxId) continue;
    const embeddedConfig = doc.getFlag(MODULE_ID, "config");
    if (!embeddedConfig) continue;

    const boxes = foundry.utils.deepClone(game.settings.get(MODULE_ID, "boxes"));
    if (boxes[boxId]) continue;

    boxes[boxId] = embeddedConfig;
    await game.settings.set(MODULE_ID, "boxes", boxes);
    ui.notifications.info(`Mystery Box "${embeddedConfig.name}" auto-installed from actor item.`);
  }
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
