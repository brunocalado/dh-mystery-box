import { MysteryBoxManager } from "./mb-manager.js";
import { MysteryBoxOpener } from "./mb-opener.js";
import { MysteryBoxEditor } from "./mb-editor.js";
import { MysteryBoxSettingsApp } from "./mb-settings.js";
import { MysteryBoxPartyActorMenu } from "./mb-party-actor-menu.js";
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

  game.settings.register(MODULE_ID, "defaultOpeningStyle", {
    scope: "world",
    config: false,
    type: String,
    default: "sound"
  });

  game.settings.register(MODULE_ID, "defaultMode", {
    scope: "world",
    config: false,
    type: String,
    default: "percentage"
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

  game.settings.register(MODULE_ID, "partyActorId", {
    name: "Party Actor",
    hint: "Select the shared party actor that receives loot when the party toggle is active in the opener. " +
          "IMPORTANT: The chosen actor must have 'Owner' permission set for all non-GM players (Configure \u2192 " +
          "Permissions \u2192 set every player to 'Owner'). Without this, players cannot receive items on it. " +
          "The party toggle in the opener will only appear when this setting has a valid actor ID.",
    scope: "world",
    config: false,
    type: String,
    default: ""
  });

  game.settings.registerMenu(MODULE_ID, "partyActorMenu", {
    name: "Party Actor",
    label: "Select Party Actor",
    hint: "Choose the actor that will receive items when the party loot toggle is active.",
    icon: "fas fa-users",
    type: MysteryBoxPartyActorMenu,
    restricted: true
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
    `modules/${MODULE_ID}/templates/mb-editor-config.hbs`,
    `modules/${MODULE_ID}/templates/mb-party-actor-menu.hbs`
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

  // Broadcast listener for party-mode effects (confetti, video, sound) from other clients
  game.socket.on("module.dh-mystery-box", async (payload) => {
    if (payload.type === "playEffect") {
      const { openingStyle, rarity, senderId } = payload;
      // The sender already played the effect locally; skip re-play on their client
      if (game.user.id === senderId) return;
      if (openingStyle === "confetti") {
        const { MysteryBoxConfetti } = await import("./mb-confetti.js");
        MysteryBoxOpener._playOpeningSound(rarity);
        new MysteryBoxConfetti().play({ intensity: 4, duration: 5000 });
      } else if (openingStyle === "sound") {
        MysteryBoxOpener._playOpeningSound(rarity);
      } else if (openingStyle === "video") {
        await MysteryBoxOpener._playOpeningVideo(rarity);
      }
    }
  });

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
    },

    /**
     * Programmatically create a Mystery Box and its world item without opening any UI.
     * GM only. Intended for macro usage.
     * Triggered by user macro execution via the global MysteryBox API.
     * @param {object} options - The creation options.
     * @param {object} options.config - Box configuration.
     * @param {string} options.config.name - Display name for the box (required).
     * @param {"common"|"uncommon"|"rare"|"legendary"} [options.config.rarity="common"] - Rarity tier.
     * @param {"video"|"confetti"|"sound"|"none"} [options.config.openingStyle="video"] - Opening animation style.
     * @param {"percentage"|"raffle"} [options.config.mode="percentage"] - Item resolution mode.
     * @param {number} [options.config.raffleCount=1] - Number of raffle draws.
     * @param {number} [options.config.raffleMaximum=1] - Maximum raffle winners.
     * @param {string} [options.config.description=""] - HTML description for the created world item.
     * @param {Array<{uuid: string, chance: number}>} options.items - Items to include in the box.
     * @returns {Promise<void>}
     */
    async CreateBox({ config = {}, items = [] } = {}) {
      if (!game.user.isGM) {
        ui.notifications.warn("Only the GM can create Mystery Boxes.");
        return;
      }

      const {
        name,
        rarity = "common",
        openingStyle = "video",
        mode = "percentage",
        raffleCount = 1,
        raffleMaximum = 1,
        description = ""
      } = config;

      if (!name?.trim()) {
        ui.notifications.error("MysteryBox.CreateBox: 'config.name' is required.");
        return;
      }

      if (!Array.isArray(items) || items.length === 0) {
        ui.notifications.error("MysteryBox.CreateBox: 'items' must be a non-empty array.");
        return;
      }

      const resolvedItems = [];
      for (const entry of items) {
        const doc = await fromUuid(entry.uuid);
        if (!doc) {
          ui.notifications.warn(`MysteryBox.CreateBox: Item with UUID "${entry.uuid}" not found — skipping.`);
          continue;
        }
        resolvedItems.push({ uuid: entry.uuid, chance: entry.chance ?? 100 });
      }

      if (resolvedItems.length === 0) {
        ui.notifications.error("MysteryBox.CreateBox: No valid items after UUID resolution.");
        return;
      }

      const boxId = foundry.utils.randomID();
      const boxConfig = { name, rarity, openingStyle, mode, raffleCount, raffleMaximum, description, items: resolvedItems };
      const boxes = foundry.utils.deepClone(game.settings.get(MODULE_ID, "boxes"));
      boxes[boxId] = boxConfig;
      await game.settings.set(MODULE_ID, "boxes", boxes);

      await MysteryBoxEditor.createWorldItem(name, boxId, rarity, boxConfig, description);
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

/**
 * Apply shimmer + shake visual effect to Mystery Box item icons on the character sheet.
 * Triggered by the Foundry `renderCharacterSheet` hook (ApplicationV2 / Foundry v13).
 * @param {ApplicationV2} app  - The CharacterSheet application instance.
 * @param {HTMLElement}   html - The rendered root HTML element (native DOM, not jQuery).
 */
Hooks.on("renderCharacterSheet", (app, html) => {
    const actor = app.document;
    if (!actor || actor.type !== "character") return;

    const form = (html instanceof HTMLElement) ? html : html[0];
    if (!form) return;

    // Defer until the browser has painted the frame to ensure the DOM is fully settled
    requestAnimationFrame(() => _applyMysteryBoxIconEffects(form, actor));
});

/**
 * Locate every item row whose item carries the dh-mystery-box `boxId` flag,
 * then wrap its icon element with the shimmer/shake container class.
 * Triggered indirectly by the `renderCharacterSheet` hook via requestAnimationFrame.
 * @param {HTMLElement} form  - The root DOM element of the rendered sheet.
 * @param {Actor}       actor - The actor document.
 */
function _applyMysteryBoxIconEffects(form, actor) {
    const itemRows = form.querySelectorAll("[data-item-id]");

    for (const row of itemRows) {
        const itemId = row.dataset.itemId;
        const item = actor.items.get(itemId);
        if (!item) continue;

        const boxId = item.getFlag(MODULE_ID, "boxId");
        if (!boxId) continue;

        const iconImg = row.querySelector("img.item-image, .item-icon img, img[src]");
        if (!iconImg) continue;

        const iconContainer = iconImg.parentElement;
        if (!iconContainer) continue;

        // Skip if already applied to avoid animation restart on re-renders
        if (iconContainer.classList.contains("dh-mb-icon-container")) continue;

        iconContainer.classList.add("dh-mb-icon-container");
    }
}
