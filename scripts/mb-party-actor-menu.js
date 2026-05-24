import { MODULE_ID } from "./constants.js";

/**
 * Settings menu for selecting the shared party actor that receives loot
 * when the party toggle is active in the Mystery Box Opener.
 * Validates that all non-GM users have Owner permission on the chosen actor.
 * Triggered via game.settings.registerMenu in the init hook.
 */
export class MysteryBoxPartyActorMenu extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static BASE_APPLICATION = MysteryBoxPartyActorMenu;

  static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
    id: "dh-mb-party-actor-menu",
    tag: "form",
    classes: ["dh-mystery-box-app"],
    window: { title: "Mystery Box: Select Party Actor", resizable: false },
    position: { width: 480, height: "auto" }
  }, { inplace: false });

  static PARTS = {
    content: { template: `modules/${MODULE_ID}/templates/mb-party-actor-menu.hbs` }
  };

  /**
   * Build context for the party actor picker template.
   * Lists only actors of type "party" and marks whether each has Owner permission for all non-GM users.
   * @param {object} _options - Render options from AppV2 lifecycle.
   * @returns {Promise<{actors: Array, currentId: string}>} Template context.
   */
  async _prepareContext(_options) {
    const currentId = game.settings.get(MODULE_ID, "partyActorId");
    const actors = game.actors.contents
      .filter(a => a.type === "party")
      .map(a => {
        const allNonGmOwner = game.users
          .filter(u => !u.isGM)
          .every(u => a.getUserLevel(u) >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);
        return {
          id: a.id,
          name: a.name,
          isValid: allNonGmOwner,
          selected: a.id === currentId
        };
      });
    return { actors, currentId };
  }

  /**
   * Attach the form submit handler after render.
   * Validates actor ownership before saving to ensure all non-GM players can receive items.
   * @param {object} context - Prepared template context.
   * @param {object} options - Render options.
   */
  _onRender(context, options) {
    this.element.addEventListener("submit", async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const actorId = fd.get("partyActorId") ?? "";

      if (actorId) {
        const actor = game.actors.get(actorId);
        if (!actor) {
          ui.notifications.error("Selected actor does not exist.");
          return;
        }
        const badUsers = game.users.filter(
          u => !u.isGM && actor.getUserLevel(u) < CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
        );
        if (badUsers.length > 0) {
          const names = badUsers.map(u => u.name).join(", ");
          ui.notifications.error(
            `Cannot select this actor. The following non-GM users do not have Owner permission: ${names}. ` +
            `Go to the actor sheet \u2192 Configure \u2192 Permissions and set all players to Owner.`
          );
          return;
        }
      }

      await game.settings.set(MODULE_ID, "partyActorId", actorId);
      ui.notifications.info(actorId ? "Party actor saved." : "Party actor cleared.");
      this.close();
    });
  }
}
