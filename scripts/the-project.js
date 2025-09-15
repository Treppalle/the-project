
// The Project — FoundryVTT system (fixed)
// Registers a custom ActorSheet and wires up the UI listeners used by the template.

/* global game, Hooks, ActorSheet, ChatMessage, Roll, Dialog, ui, foundry */

// --------------------
// Helpers
// --------------------
Hooks.once("init", () => {
  // <= helper used in the template: {{#if (lte a b)}} ... {{/if}}
  if (typeof Handlebars !== "undefined") {
    Handlebars.registerHelper("lte", (a, b) => (a ?? 0) <= (b ?? 0));
  }
});

// --------------------
// Core logic
// --------------------
async function calcolaSalute(actor) {
  const eta = actor.system.eta ?? 0;
  const costituzioneLevel = actor.system.constitutionLevel ?? 1;

  const rollDiv = await (new Roll("1d6")).roll({ async: true });
  const x = Math.ceil(eta / Math.max(rollDiv.total, 1));

  const dadiExtra = 1 + costituzioneLevel;
  const rollExtra = await (new Roll(`${dadiExtra}d6`)).roll({ async: true });
  const saluteFinale = x + rollExtra.total;

  await actor.update({ "system.salute": saluteFinale });
}

// --------------------
// Custom Actor Sheet
// --------------------
class TheProjectActorSheet extends ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["the-project", "sheet", "actor"],
      template: "systems/the-project/templates/sheets/actor-sheet.html",
      width: 900,
      height: "auto",
      tabs: [],
      scrollY: [".theproject-sheet"]
    });
  }

  getData(options={}) {
    const data = super.getData(options);
    return data;
  }

  activateListeners(html) {
    super.activateListeners(html);
    const actor = this.actor;

    // Aggiungi arma
    html.find(".aggiungi-arma").on("click", async () => {
      const armi = foundry.utils.duplicate(actor.system.armi ?? []);
      armi.push({ nome: "", danno: 1, livello: 1 });
      await actor.update({ "system.armi": armi });
    });

    // Rimuovi arma
    html.find(".rimuovi-arma").on("click", async (ev) => {
      const index = Number(ev.currentTarget.closest(".arma")?.dataset.index ?? -1);
      if (index < 0) return;
      const armi = foundry.utils.duplicate(actor.system.armi ?? []);
      armi.splice(index, 1);
      await actor.update({ "system.armi": armi });
    });

    // Calcola Salute
    html.find(".calcola-salute").on("click", async () => {
      await calcolaSalute(actor);
    });

    // Attacco con Sangue Freddo
    html.find(".attacco-sanguefreddo").on("click", async () => {
      const armaIndex = parseInt(html.find(".arma-selezionata").val() ?? "-1", 10);
      const level = actor.system.coolLevel ?? 1;
      let favori = actor.system.favori ?? 0;
      const arma = (actor.system.armi ?? [])[armaIndex];

      if (!arma) {
        ui.notifications.error("Nessuna arma selezionata!");
        return;
      }

      if ((arma.livello ?? 1) > level) {
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

      let message = `
        <strong>Attacco con ${arma.nome}</strong><br>
        Tiro Giocatore (${diceCount}d6): ${playerRoll.total} <br>
        Tiro Master (1d6): ${masterRoll.total} <br>
      `;

      if (hit) {
        const totalDamage = (arma.danno ?? 1) * level;
        message += `✅ Colpito!<br><strong>Danno:</strong> ${totalDamage}`;
      } else {
        message += `❌ Mancato!`;
      }

      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: message
      });
    });

    // Se la salute non è mai stata calcolata, proponi il calcolo
    if (!actor.system.salute || actor.system.salute === 0) {
      // Non forziamo il calcolo per non sorprendere l'utente; basta un'informativa
      ui.notifications.info("Puoi calcolare la Salute del PG con il pulsante 'Calcola'.");
    }
  }
}

// Register the sheet
Hooks.once("init", () => {
  DocumentSheetConfig.registerSheet(Actor, "the-project", TheProjectActorSheet, {
    types: ["character"],
    makeDefault: true,
    label: "Scheda Personaggio (The Project)"
  });
});

// Ricalcolo automatico Salute se cambiano Età o Costituzione (con valore già presente)
Hooks.on("updateActor", (actor, updateData) => {
  const changedEta  = foundry.utils.getProperty(updateData, "system.eta") !== undefined;
  const changedCost = foundry.utils.getProperty(updateData, "system.constitutionLevel") !== undefined;
  const saluteEsistente = (actor.system.salute ?? 0) > 0;
  if (saluteEsistente && (changedEta || changedCost)) {
    calcolaSalute(actor);
  }
});

// Controlli in creazione PG: max 4 punti totali e max livello 2 per singola caratteristica
Hooks.on("preUpdateActor", (actor, updateData) => {
  const inCreation = actor.getFlag("the-project", "creationPhase") === true;
  if (!inCreation) return;

  const keys = ["moneyLevel", "coolLevel", "driveLevel", "constitutionLevel"];
  const current = {};
  for (const k of keys) current[k] = actor.system[k] ?? 0;

  // Apply incoming changes to snapshot
  for (const k of keys) {
    const v = foundry.utils.getProperty(updateData, `system.${k}`);
    if (v !== undefined) current[k] = v;
  }

  // Per-level cap = 2
  for (const k of keys) {
    if (current[k] > 2) {
      ui.notifications.warn(`In creazione non puoi assegnare il livello 3 a ${k}.`);
      foundry.utils.setProperty(updateData, `system.${k}`, 2);
      current[k] = 2;
    }
  }

  // Total cap = 4
  const total = keys.reduce((s, k) => s + (current[k] ?? 0), 0);
  if (total > 4) {
    ui.notifications.error("Hai superato i 4 punti disponibili in creazione!");
    return false; // cancel update
  }
});
