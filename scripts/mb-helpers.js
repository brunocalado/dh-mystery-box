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