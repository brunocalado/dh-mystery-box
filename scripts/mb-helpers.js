import { MODULE_ID } from "./constants.js";

/**
 * Logs a debug message if debugLogs setting is enabled.
 * @param {string} type - Console method type: "log" | "group" | "groupEnd" | "table" | "warn"
 * @param {...*} args - Arguments to pass to the console method
 */
export function debugLog(type, ...args) {
  const debugLogs = game.settings.get(MODULE_ID, "debugLogs");
  if (!debugLogs) return;

  switch (type) {
    case "group":
      console.group(...args);
      break;
    case "groupEnd":
      console.groupEnd();
      break;
    case "table":
      console.table(...args);
      break;
    case "warn":
      console.warn(...args);
      break;
    default:
      console.log(...args);
  }
}

/**
 * Computes the probability (as a formatted percentage string) that an item
 * will be selected in a weighted raffle draw.
 * Formula: min(1, (itemWeight / totalWeight) * draws) * 100
 * @param {number} itemChance - The weight of this item.
 * @param {Array<{chance: number}>} items - All items in the box.
 * @param {number} raffleCount - Number of items to be drawn.
 * @returns {string} Formatted probability, e.g. "12.50%"
 */
export function computeRaffleProbability(itemChance, items, raffleCount) {
  const totalWeight = items.reduce((sum, i) => sum + (i?.chance || 0), 0);
  if (totalWeight === 0) return "0.00%";
  const prob = Math.min(1, (itemChance / totalWeight) * raffleCount) * 100;
  return `${prob.toFixed(2)}%`;
}

Handlebars.registerHelper("raffleProbability", function(itemChance, items, raffleCount) {
  return computeRaffleProbability(itemChance, items, raffleCount);
});

/**
 * Returns the name/img that should be shown for `item`, deferring to the
 * dh-unidentified module's mask when it is active and the item is unidentified.
 * A no-op (returns the real values) when dh-unidentified is absent, the item
 * is identified, or `revealReal` is set — so boxes behave exactly as before
 * wherever the audience is trusted with the truth (e.g. the GM).
 * @param {object} item - Plain item data or an Item document; only `.name`,
 *   `.img` and `.flags` are read.
 * @param {{revealReal?: boolean}} [options] - Pass `revealReal: true` for an
 *   audience that should always see the real identity (mirrors dh-unidentified's
 *   own "GM always sees the truth" rule).
 * @returns {{name: string, img: string}}
 */
export function getDisplayIdentity(item, { revealReal = false } = {}) {
  if (revealReal) return { name: item.name, img: item.img };
  const api = game.modules.get("dh-unidentified")?.active
    ? game.modules.get("dh-unidentified").api
    : null;
  if (!api) return { name: item.name, img: item.img };
  return { name: api.getDisplayName(item), img: api.getDisplayImg(item) };
}