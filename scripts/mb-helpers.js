const MODULE_ID = "dh-mystery-box";

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