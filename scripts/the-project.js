/* global game, Hooks, ActorSheet, ChatMessage, Roll, Dialog, ui, foundry, Actors */

// Helper handlebars
Hooks.once("init", () => {
  if (typeof Handlebars !== "undefined") {
    Handlebars.registerHelper("lte", (a, b) => (a ?? 0) <= (b ?? 0));
  }
});

async function calcolaSalute(actor) {
  const eta = Number(actor.system.eta ?? 0);
  const costituzioneLevel = Number(actor.system.constitutionLevel ?? 1);

  const rollDiv = await (new Roll("1d6")).roll({ async: true });
  const x = Math.ceil(eta / Math.max(rollDiv.total, 1));

  const dadiExtra = 1 + costituzioneLevel;
  const rollExtra = await (new Roll(`${dadiExtra}d6`)).roll({ async: true });
  const saluteFinale = x + rollExtra.total;

  await actor.update({ "system.salute": saluteFinale });
}

// ---- Actor Sheet ----
class TheProjectActorSheet extends ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["the-project", "sheet", "actor"],
      template: "systems/the-project/templates/sheets/actor-sheet.html",
      width: 900,
      height: "auto",
      scrollY: [".theproject-sheet"]
    });
  }

  activateListeners(html) {
    super.activateListeners(html);
    const actor = this.actor;

    // Event delegation is more robust across re-renders
    html.on("click", ".aggiungi-arma", async () => {
      const armi = foundry.utils.duplicate(actor.system.armi ?? []);
      armi.push({ nome: "", danno: 1, livello: 1 });
      await actor.update({ "system.armi": armi });
    });

    html.on("click", ".rimuovi-arma", async (ev) => {
      const wrapper = ev.currentTarget.closest(".arma");
      if (!wrapper) return;
      const index = Number(wrapper.dataset.index ?? -1);
      if (index < 0) return;
      const armi = foundry.utils.duplicate(actor.system.armi ?? []);
      armi.splice(index, 1);
      await actor.update({ "system.armi": armi });
    });

    html.on("click", ".calcola-salute", async () => {
      await calcolaSalute(actor);
    });

    html.on("click", ".attacco-sanguefreddo", async () => {
      const select = html.find(".arma-selezionata");
      const idx = Number(select.val() ?? -1);
      const level = Number(actor.system.coolLevel ?? 1);
      let favori = Number(actor.system.favori ?? 0);
      const arma = (actor.system.armi ?? [])[idx];

      if (!arma) { ui.notifications.error("Nessuna arma selezionata!"); return; }
      if ((Number(arma.livello ?? 1)) > level) {
        ui.notifications.error(`Non puoi usare ${arma.nome}: richiede Sangue Freddo livello ${arma.livello}`);
        return;
      }

      let diceCount = Math.max(1, level);
      if (favori > 0) {
        const useFavore = await Dialog.confirm({
          title: "Usare un Favore?",
          content: "<p>Vuoi usare un Favore per aggiungere 1 dado al tiro?</p>"
        });
        if (useFavore) {
          diceCount += 1;
          favori -= 1;
          await actor.update({ "system.favori": favori });
        }
      }

      const playerRoll = await (new Roll(`${diceCount}d6`)).roll({ async: true });
      const masterRoll = await (new Roll("1d6")).roll({ async: true });
      const hit = playerRoll.total >= masterRoll.total;
      const totalDamage = hit ? (Number(arma.danno ?? 1) * level) : 0;

      const message = `
        <strong>Attacco con ${arma.nome}</strong><br>
        Tiro Giocatore (${diceCount}d6): ${playerRoll.total} <br>
        Tiro Master (1d6): ${masterRoll.total} <br>
        ${hit ? `✅ Colpito!<br><strong>Danno:</strong> ${totalDamage}` : "❌ Mancato!"}
      `;

      ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: message });
    });

    // Mostra il suggerimento solo una volta per attore
    const salute = Number(actor.system.salute ?? 0);
    const hintShown = actor.getFlag("the-project", "calcolaHintShown");
    if (!hintShown && (!salute || salute === 0)) {
      ui.notifications.info("Puoi calcolare la Salute del PG con il pulsante 'Calcola'.");
      actor.setFlag("the-project", "calcolaHintShown", true);
    }
  }
}

// Sheet registration (compatible with v10+)
Hooks.once("init", () => {
  try { Actors.unregisterSheet("core", ActorSheet); } catch (e) {}
  Actors.registerSheet("the-project", TheProjectActorSheet, {
    types: ["character"],
    makeDefault: true,
    label: "Scheda Personaggio (The Project)"
  });
});

// Auto-ricalcolo se cambia Eta/Costituzione (solo se salute già presente)
Hooks.on("updateActor", (actor, updateData) => {
  const changedEta  = foundry.utils.getProperty(updateData, "system.eta") !== undefined;
  const changedCost = foundry.utils.getProperty(updateData, "system.constitutionLevel") !== undefined;
  const saluteEsistente = (Number(actor.system.salute ?? 0)) > 0;
  if (saluteEsistente && (changedEta || changedCost)) {
    calcolaSalute(actor);
  }
});

// Vincoli in creazione
Hooks.on("preUpdateActor", (actor, updateData) => {
  const inCreation = actor.getFlag("the-project", "creationPhase") === true;
  if (!inCreation) return;

  const keys = ["moneyLevel", "coolLevel", "driveLevel", "constitutionLevel"];
  const current = {}; for (const k of keys) current[k] = Number(actor.system[k] ?? 0);

  for (const k of keys) {
    const v = foundry.utils.getProperty(updateData, `system.${k}`);
    if (v !== undefined) current[k] = Number(v);
  }

  for (const k of keys) {
    if (current[k] > 2) {
      ui.notifications.warn(`In creazione non puoi assegnare il livello 3 a ${k}.`);
      foundry.utils.setProperty(updateData, `system.${k}`, 2);
      current[k] = 2;
    }
  }

  const total = keys.reduce((s, k) => s + (current[k] ?? 0), 0);
  if (total > 4) {
    ui.notifications.error("Hai superato i 4 punti disponibili in creazione!");
    return false;
  }
});
