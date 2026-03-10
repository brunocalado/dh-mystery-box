import { MysteryBoxReveal } from "./mb-reveal.js";
import { MysteryBoxConfetti } from "./mb-confetti.js";

const MODULE_ID = "dh-mystery-box";

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

    return { boxes: available, noActor: false };
  }

  /**
   * Handle the "Open" action: consume the box item, roll chances, and grant items to the actor.
   * Quantity is decremented explicitly here; if it reaches zero the item is deleted from the actor.
   * @param {PointerEvent} event - The triggering click event.
   * @param {HTMLElement} target - The action button with data-box-id and data-actor-item-id.
   */
  static async #onOpenBox(event, target) {
    const boxId = target.dataset.boxId;
    const actorItemId = target.dataset.actorItemId;
    const actor = game.user.character;

    if (!actor) {
      ui.notifications.warn("No linked actor found.");
      return;
    }

    const boxes = game.settings.get(MODULE_ID, "boxes");
    const boxConfig = boxes[boxId];
    if (!boxConfig) {
      ui.notifications.warn("Mystery Box configuration not found.");
      return;
    }

    // Consume the box before rolling — ensures the correct item is decremented regardless of system behavior.
    const actorItem = actor.items.get(actorItemId);
    if (!actorItem) {
      ui.notifications.warn("Mystery Box item not found on your character.");
      return;
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

    const debugLogs = game.settings.get(MODULE_ID, "debugLogs");
    const boxMode = boxConfig.mode ?? "percentage";
    const resolvedItems = [];

    if (boxMode === "raffle") {
      // Raffle mode: roll 1d100 as a visible seed, then use weighted random selection
      const roll = new Roll("1d100");
      await roll.evaluate();
      await roll.toMessage({ flavor: "Generating seed of fate..." });

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
      const randomDraw = Math.floor(Math.random() * (maxDraw - minDraw + 1)) + minDraw;
      const drawCount = Math.min(randomDraw, pool.length);

      if (debugLogs) {
        console.group(`[Mystery Box] 🎲 Raffle Draw: "${boxConfig.name}"`);
        console.log(`Seed (1d100): ${roll.total}`);
        console.log(`Pool Size: ${pool.length}`);
        console.log(`Draw Target: ${randomDraw} (Min: ${minDraw}, Max: ${maxDraw}) -> Actual: ${drawCount}`);
        console.table(pool.map(p => ({ Name: p.name, Weight: p.weight })));
        if (drawCount < randomDraw) {
          console.warn(`Draw count clamped from ${randomDraw} to ${pool.length} (pool size)`);
        }
      }

      const selected = weightedRandomSelection(pool, drawCount, rng);
      for (const pick of selected) {
        const matched = pool.find(p => p.uuid === pick.uuid);
        if (matched) resolvedItems.push(matched.itemObj);
      }

      if (debugLogs) {
        console.log(`Results (${resolvedItems.length}):`);
        resolvedItems.forEach(i => console.log(`  🎉 ${i.name}`));
        console.groupEnd();
      }
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
          if (debugLogs) {
            console.log(`[Mystery Box] MODE: PERCENTAGE | Item: "${item.name}" | Chance: 100% | Result: ADDED (guaranteed)`);
          }
          resolvedItems.push(item.toObject());
          continue;
        }

        const r = new Roll("1d100");
        await r.evaluate();

        if (game.modules.get("dice-so-nice")?.active && game.dice3d) {
          await game.dice3d.showForRoll(r, game.user, true);
        }

        const success = r.total <= entry.chance;

        if (debugLogs) {
          console.log(`[Mystery Box] MODE: PERCENTAGE | Item: "${item.name}" | Chance: ${entry.chance}% | Rolled: ${r.total} | Result: ${success ? "ADDED" : "SKIPPED"}`);
        }

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

      const chatMode = game.settings.get(MODULE_ID, "chatMessageMode");
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

      if (chatMode === "gm") chatData.whisper = ChatMessage.getWhisperRecipients("GM");
      await ChatMessage.create(chatData);

      this.close();
      return;
    }

    const openingStyle = boxConfig.openingStyle ?? "video";

    if (openingStyle === "video") {
      await MysteryBoxOpener.#playOpeningVideo(boxConfig.rarity);
    } else {
      MysteryBoxOpener.#playOpeningSound(boxConfig.rarity);
      new MysteryBoxConfetti().play({ intensity: 4, duration: 5000 });
    }

    try {
      await actor.createEmbeddedDocuments("Item", resolvedItems);
    } catch (err) {
      ui.notifications.error("Failed to add items to your character sheet.");
      console.error(err);
      return;
    }

    // Construct and send chat message
    const chatMode = game.settings.get(MODULE_ID, "chatMessageMode");
    const titleColor = "#C9A060";
    
    // HTML structure based on scan.js style
    const content = `
    <div class="chat-card" style="border: 2px solid ${titleColor}; border-radius: 8px; overflow: hidden;">
        <header class="card-header flexrow" style="background: #191919 !important; padding: 8px; border-bottom: 2px solid ${titleColor};">
            <h3 class="noborder" style="margin: 0; font-weight: bold; color: ${titleColor} !important; font-family: 'Aleo', serif; text-align: center; text-transform: uppercase; letter-spacing: 1px; width: 100%;">
                ${boxConfig.name} Opened!
            </h3>
        </header>
        <div class="card-content" style="background: #222; padding: 20px; min-height: 80px; display: flex; flex-direction: column; align-items: stretch; justify-content: center; gap: 10px;">
            ${resolvedItems.map(item => `
            <div style="display: flex; align-items: center; gap: 10px; background: rgba(0, 0, 0, 0.3); padding: 6px; border-radius: 4px;">
                <img src="${item.img}" style="width: 32px; height: 32px; border: 1px solid #555; border-radius: 4px; object-fit: cover; flex-shrink: 0;">
                <div style="color: #ffffff; font-size: 1.1em; font-family: 'Aleo', serif; text-shadow: 1px 1px 2px #000;">${item.name}</div>
            </div>`).join("")}
        </div>
    </div>`;

    const chatData = {
        user: game.user.id,
        speaker: ChatMessage.getSpeaker({ actor }),
        content: content,
        style: CONST.CHAT_MESSAGE_STYLES.OTHER
    };

    if (chatMode === "gm") {
        chatData.whisper = ChatMessage.getWhisperRecipients("GM");
    }

    await ChatMessage.create(chatData);

    this.close();
    new MysteryBoxReveal(resolvedItems).render(true);
  }

  /**
   * Plays the rarity-specific opening sound effect.
   * Reads the configured path from settings so GMs can override without touching module code.
   * @param {string} [rarity="common"] - The rarity of the box being opened.
   */
  static #playOpeningSound(rarity = "common") {
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
  static async #playOpeningVideo(rarity = "common") {
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
