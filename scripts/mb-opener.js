import { MysteryBoxReveal } from "./mb-reveal.js";
import { MysteryBoxConfetti } from "./mb-confetti.js";
import { debugLog, getDisplayIdentity } from "./mb-helpers.js";
import { MODULE_ID } from "./constants.js";

/**
 * Selects N unique items from a weighted pool using a seeded RNG.
 * Each selected item is removed from the pool so no duplicates occur within one draw.
 * @param {Array<{uuid: string, name: string, weight: number, img: string}>} items - Pool of candidates.
 * @param {number} count - How many items to draw.
 * @param {MersenneTwister} rng - Seeded MersenneTwister instance for deterministic randomness.
 * @returns {Array<{uuid: string, name: string, img: string}>} The selected items.
 */
function weightedRandomSelection(items, count, rng) {
  const pool = items.map(i => ({ ...i }));
  const selected = [];
  const draws = Math.min(count, pool.length);

  for (let i = 0; i < draws; i++) {
    const totalWeight = pool.reduce((sum, item) => sum + item.weight, 0);
    if (totalWeight <= 0) break;

    const randomValue = rng.random() * totalWeight;
    let cumulative = 0;
    let chosenIndex = 0;

    for (let j = 0; j < pool.length; j++) {
      cumulative += pool[j].weight;
      if (randomValue < cumulative) {
        chosenIndex = j;
        break;
      }
    }

    selected.push(pool[chosenIndex]);
    pool.splice(chosenIndex, 1);
  }

  return selected;
}

/**
 * Player-facing UI for selecting and opening Mystery Boxes.
 * Finds consumable items on the linked actor whose names match registered boxes.
 * Opened via `MysteryBox.Open()` or the compendium macro.
 */
export class MysteryBoxOpener extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static BASE_APPLICATION = MysteryBoxOpener;

  static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
    id: "dh-mb-opener",
    classes: ["dh-mystery-box-app", "dh-mystery-box-opener"],
    window: {
      title: "Open Mystery Box",
      icon: "fas fa-box-open",
      resizable: true
    },
    position: {
      width: 700,
      height: "auto"
    },
    actions: {
      openBox: MysteryBoxOpener.#onOpenBox
    }
  }, { inplace: false });

  static PARTS = {
    list: {
      template: `modules/${MODULE_ID}/templates/mb-opener.hbs`
    }
  };

  /**
   * Build context data for the opener template.
   * Matches actor loot items against registered Mystery Boxes via module flag ID.
   * @param {object} options - Render options from AppV2 lifecycle.
   * @returns {Promise<object>} Template context with available boxes array.
   */
  async _prepareContext(options) {
    const actor = game.user.character;
    if (!actor) {
      return { boxes: [], noActor: true };
    }

    const boxes = game.settings.get(MODULE_ID, "boxes");

    const available = [];
    for (const item of actor.items) {
      if (item.type !== "loot") continue;
      const flagBoxId = item.getFlag(MODULE_ID, "boxId");
      if (!flagBoxId || !boxes[flagBoxId]) continue;
      // Skip items with no remaining quantity — they should have been deleted on last use.
      if ((item.system.quantity ?? 1) <= 0) continue;
      const boxConfig = boxes[flagBoxId];
      const maxCharacters = 30;
      available.push({
        actorItemId: item.id,
        boxId: flagBoxId,
        boxName: item.name.length > maxCharacters ? item.name.slice(0, maxCharacters) + "..." : item.name,
        img: item.img,
        itemCount: boxConfig.items.length,
        quantity: item.system.quantity ?? 1
      });
    }

    const partyActorId = game.settings.get(MODULE_ID, "partyActorId");
    const partyActor = partyActorId ? game.actors.get(partyActorId) : null;
    const partyActorEnabled = !!partyActor;

    return {
      boxes: available,
      noActor: false,
      partyActorEnabled,
      partyActorName: partyActor?.name ?? ""
    };
  }

  /**
   * Wire the party toggle button click handler after the template renders.
   * Triggered by the AppV2 _onRender lifecycle stage.
   * @param {object} context - Prepared template context.
   * @param {object} options - Render options.
   */
  _onRender(context, options) {
    const toggleBtn = this.element.querySelector("#mb-party-toggle");
    if (!toggleBtn) return;

    toggleBtn.addEventListener("click", () => {
      const isActive = toggleBtn.dataset.active === "true";
      const next = !isActive;
      toggleBtn.dataset.active = String(next);
      toggleBtn.setAttribute("aria-pressed", String(next));
    });
  }

  /**
   * Handle the "Open" action: consume the box item, roll chances, and grant items to the actor.
   * Quantity is decremented explicitly here; if it reaches zero the item is deleted from the actor.
   * @param {PointerEvent} event - The triggering click event.
   * @param {HTMLElement} target - The action button with data-box-id and data-actor-item-id.
   */
  static async #onOpenBox(event, target) {
    const actorItemId = target.dataset.actorItemId;
    const actor = game.user.character;

    if (!actor) {
      ui.notifications.warn("No linked actor found.");
      return;
    }

    const actorItem = actor.items.get(actorItemId);
    if (!actorItem) {
      ui.notifications.warn("Mystery Box item not found on your character.");
      return;
    }

    const boxId = target.dataset.boxId;
    const boxes = game.settings.get(MODULE_ID, "boxes");
    const boxConfig = boxes[boxId];

    if (!boxConfig) {
      ui.notifications.warn(
        "This Mystery Box is not configured in this world. Ask your GM to import the item into the world first."
      );
      return;
    }

    // Read party toggle state from the opener's own DOM
    const toggleBtn = this.element?.querySelector("#mb-party-toggle");
    const sendToParty = toggleBtn?.dataset.active === "true";
    const partyActorId = sendToParty ? game.settings.get(MODULE_ID, "partyActorId") : null;
    const partyActor = partyActorId ? game.actors.get(partyActorId) : null;

    if (sendToParty && !partyActor) {
      ui.notifications.warn("Party actor not found. Opening normally.");
    }

    const currentQty = actorItem.system.quantity ?? 1;
    try {
      if (currentQty <= 1) {
        await actorItem.delete();
      } else {
        await actorItem.update({ "system.quantity": currentQty - 1 });
      }
    } catch (err) {
      ui.notifications.error("Failed to consume the Mystery Box.");
      console.error(err);
      return;
    }

    const boxMode = boxConfig.mode ?? "percentage";
    const resolvedItems = [];

    if (boxMode === "raffle") {
      // Raffle mode: roll 1d100 as a visible seed, then use weighted random selection
      const roll = new Roll("1d100");
      await roll.evaluate();

      if (game.modules.get("dice-so-nice")?.active && game.dice3d) {
        await game.dice3d.showForRoll(roll, game.user, true);
      }

      // Seed MersenneTwister with the roll result and current timestamp for maximum entropy
      const now = Date.now();
      const rng = new foundry.dice.MersenneTwister();
      rng.seedArray([
        roll.total,
        now & 0xFFFFFFFF,
        Math.floor(now / 0x100000000)
      ]);

      // Build weighted pool from valid items only
      const pool = [];
      for (const entry of boxConfig.items) {
        const item = await fromUuid(entry.uuid);
        if (!item) {
          console.warn(`[${MODULE_ID}] Item UUID "${entry.uuid}" no longer exists. Skipping.`);
          continue;
        }
        pool.push({ uuid: entry.uuid, name: item.name, img: item.img, weight: entry.chance, itemObj: item.toObject() });
      }

      const minDraw = boxConfig.raffleCount ?? 1;
      const maxDraw = boxConfig.raffleMaximum ?? minDraw;
      const randomDraw = Math.floor(rng.random() * (maxDraw - minDraw + 1)) + minDraw;
      const drawCount = Math.min(randomDraw, pool.length);

      debugLog("group", `[Mystery Box] 🎲 Raffle Draw: "${boxConfig.name}"`);
      debugLog("log", `Seed (1d100): ${roll.total}`);
      debugLog("log", `Pool Size: ${pool.length}`);
      debugLog("log", `Draw Target: ${randomDraw} (Min: ${minDraw}, Max: ${maxDraw}) -> Actual: ${drawCount}`);
      debugLog("table", pool.map(p => ({ Name: p.name, Weight: p.weight })));
      if (drawCount < randomDraw) {
        debugLog("warn", `Draw count clamped from ${randomDraw} to ${pool.length} (pool size)`);
      }

      const selected = weightedRandomSelection(pool, drawCount, rng);
      for (const pick of selected) {
        const matched = pool.find(p => p.uuid === pick.uuid);
        if (matched) resolvedItems.push(matched.itemObj);
      }

      debugLog("log", `Results (${resolvedItems.length}):`);
      resolvedItems.forEach(i => debugLog("log", `  🎉 ${i.name}`));
      debugLog("groupEnd");
    } else {
      // Percentage mode: each item rolls independently against its chance percentage
      for (const entry of boxConfig.items) {
        const item = await fromUuid(entry.uuid);
        if (!item) {
          console.warn(`[${MODULE_ID}] Item UUID "${entry.uuid}" no longer exists. Skipping.`);
          continue;
        }

        // Skip the roll entirely for guaranteed items — a 100% chance needs no RNG.
        if (entry.chance >= 100) {
          debugLog("log", `[Mystery Box] MODE: PERCENTAGE | Item: "${item.name}" | Chance: 100% | Result: ADDED (guaranteed)`);
          resolvedItems.push(item.toObject());
          continue;
        }

        const r = new Roll("1d100");
        await r.evaluate();

        if (game.modules.get("dice-so-nice")?.active && game.dice3d) {
          await game.dice3d.showForRoll(r, game.user, true);
        }

        const success = r.total <= entry.chance;

        debugLog("log", `[Mystery Box] MODE: PERCENTAGE | Item: "${item.name}" | Chance: ${entry.chance}% | Rolled: ${r.total} | Result: ${success ? "ADDED" : "SKIPPED"}`);

        if (success) {
          resolvedItems.push(item.toObject());
        }
      }
    }

    if (resolvedItems.length === 0) {
      const emptySoundPath = game.settings.get(MODULE_ID, "emptySound");
      if (emptySoundPath) {
        foundry.audio.AudioHelper.play({ src: emptySoundPath, volume: 0.8, loop: false }, false);
      }

      const titleColor = "#C9A060";

      const content = `
      <div class="chat-card" style="border: 2px solid ${titleColor}; border-radius: 8px; overflow: hidden;">
          <header class="card-header flexrow" style="background: #191919 !important; padding: 8px; border-bottom: 2px solid ${titleColor};">
              <h3 class="noborder" style="margin: 0; font-weight: bold; color: ${titleColor} !important; font-family: 'Aleo', serif; text-align: center; text-transform: uppercase; letter-spacing: 1px; width: 100%;">
                  ${boxConfig.name} Opened!
              </h3>
          </header>
          <div class="card-content" style="background: #222; padding: 20px; min-height: 80px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;">
              <div style="color: #b0b0b0; font-style: italic; font-family: 'Aleo', serif; font-size: 1.1em;">The box was empty...</div>
          </div>
      </div>`;

      const chatData = {
        user: game.user.id,
        speaker: ChatMessage.getSpeaker({ actor }),
        content: content,
        style: CONST.CHAT_MESSAGE_STYLES.OTHER
      };

      if (sendToParty && partyActor) {
        // Party mode: always public
      } else {
        const chatMode = game.settings.get(MODULE_ID, "chatMessageMode");
        if (chatMode === "gm") chatData.whisper = ChatMessage.getWhisperRecipients("GM");
      }
      await ChatMessage.create(chatData);

      this.close();
      return;
    }

    const openingStyle = boxConfig.openingStyle ?? "video";

    if (sendToParty && partyActor) {
      // Party mode: play effect locally, then broadcast to all other clients via socket
      if (openingStyle === "video") {
        await MysteryBoxOpener._playOpeningVideo(boxConfig.rarity);
      } else if (openingStyle === "confetti") {
        MysteryBoxOpener._playOpeningSound(boxConfig.rarity);
        new MysteryBoxConfetti().play({ intensity: 4, duration: 5000 });
      } else if (openingStyle === "sound") {
        MysteryBoxOpener._playOpeningSound(boxConfig.rarity);
      }

      game.socket.emit("module.dh-mystery-box", {
        type: "playEffect",
        openingStyle: boxConfig.openingStyle ?? "video",
        rarity: boxConfig.rarity ?? "common",
        senderId: game.user.id
      });
    } else {
      // Original single-user behavior
      if (openingStyle === "video") {
        await MysteryBoxOpener._playOpeningVideo(boxConfig.rarity);
      } else if (openingStyle === "confetti") {
        MysteryBoxOpener._playOpeningSound(boxConfig.rarity);
        new MysteryBoxConfetti().play({ intensity: 4, duration: 5000 });
      } else if (openingStyle === "sound") {
        MysteryBoxOpener._playOpeningSound(boxConfig.rarity);
      }
    }

    // Route items to party actor when party mode is active, otherwise to the player's own actor
    const targetActor = (sendToParty && partyActor) ? partyActor : actor;

    try {
      await targetActor.createEmbeddedDocuments("Item", resolvedItems);
    } catch (err) {
      ui.notifications.error("Failed to add items to the target actor.");
      console.error(err);
      return;
    }

    // Construct and send chat message
    const titleColor = "#C9A060";
    const partyFooter = (sendToParty && partyActor)
      ? `<div style="margin-top: 8px; padding: 4px 8px; background: rgba(42, 106, 58, 0.3); border-radius: 4px; border-left: 3px solid #4caf50; color: #88cc88; font-size: 0.85em; font-family: 'Aleo', serif;">
           <i class="fas fa-users"></i> Items sent to <strong>${partyActor.name}</strong>
         </div>`
      : "";

    // Party mode is always public regardless of the chatMessageMode setting.
    const chatMode = (sendToParty && partyActor) ? "public" : game.settings.get(MODULE_ID, "chatMessageMode");

    // dh-unidentified integration: never leak a mystified item's true name/img,
    // in the chat card or the reveal popup. Both follow the opener's own role —
    // real identity only if the person opening the box is themselves a GM.
    // Whisper target does NOT affect this: even a GM-only whisper must stay
    // masked when a player opened the box, so the item is a surprise for the
    // GM's log too, consistent with what the opener sees in the reveal popup.
    const displayItems = resolvedItems.map(item =>
      getDisplayIdentity(item, { revealReal: game.user.isGM })
    );

    const content = `
    <div class="chat-card" style="border: 2px solid ${titleColor}; border-radius: 8px; overflow: hidden;">
        <header class="card-header flexrow" style="background: #191919 !important; padding: 8px; border-bottom: 2px solid ${titleColor};">
            <h3 class="noborder" style="margin: 0; font-weight: bold; color: ${titleColor} !important; font-family: 'Aleo', serif; text-align: center; text-transform: uppercase; letter-spacing: 1px; width: 100%;">
                ${boxConfig.name} Opened!
            </h3>
        </header>
        <div class="card-content" style="background: #222; padding: 20px; min-height: 80px; display: flex; flex-direction: column; align-items: stretch; justify-content: center; gap: 10px;">
            ${displayItems.map(display => `
            <div style="display: flex; align-items: center; gap: 10px; background: rgba(0, 0, 0, 0.3); padding: 6px; border-radius: 4px;">
                <img src="${display.img}" style="width: 32px; height: 32px; border: 1px solid #555; border-radius: 4px; object-fit: cover; flex-shrink: 0;">
                <div style="color: #ffffff; font-size: 1.1em; font-family: 'Aleo', serif; text-shadow: 1px 1px 2px #000;">${display.name}</div>
            </div>`).join("")}
            ${partyFooter}
        </div>
    </div>`;

    const chatData = {
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor }),
      content: content,
      style: CONST.CHAT_MESSAGE_STYLES.OTHER
    };

    if (chatMode === "gm") chatData.whisper = ChatMessage.getWhisperRecipients("GM");

    await ChatMessage.create(chatData);

    this.close();
    new MysteryBoxReveal(resolvedItems, displayItems, targetActor).render(true);
  }

  /**
   * Plays the rarity-specific opening sound effect.
   * Reads the configured path from settings so GMs can override without touching module code.
   * @param {string} [rarity="common"] - The rarity of the box being opened.
   */
  static _playOpeningSound(rarity = "common") {
    const key = `sound${rarity.charAt(0).toUpperCase()}${rarity.slice(1)}`;
    const src = game.settings.get(MODULE_ID, key);
    if (src) {
      foundry.audio.AudioHelper.play({ src, volume: 0.8, loop: false }, false);
    }
  }

  /**
   * Plays the box opening video overlay.
   * @param {string} [rarity="common"] - The rarity of the box to determine which video to play.
   * @returns {Promise<void>} Resolves when the video ends.
   */
  static async _playOpeningVideo(rarity = "common") {
    // Resolve the video path from settings so GMs can override without touching module code.
    const key = `video${rarity.charAt(0).toUpperCase()}${rarity.slice(1)}`;
    const src = game.settings.get(MODULE_ID, key) || `modules/${MODULE_ID}/assets/video/box-${rarity}.webm`;

    return new Promise((resolve) => {
      const video = document.createElement("video");
      video.src = src;
      video.style.position = "fixed";
      video.style.top = "0";
      video.style.left = "0";
      video.style.width = "100vw";
      video.style.height = "100vh";
      video.style.zIndex = "100000";
      video.style.objectFit = "cover";
      video.style.pointerEvents = "none";
      video.autoplay = true;

      const cleanup = () => {
        video.remove();
        resolve();
      };

      video.onended = cleanup;
      video.onerror = cleanup;

      document.body.appendChild(video);
    });
  }
}
