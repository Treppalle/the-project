// ===============================
// Funzione per calcolare la Salute
// ===============================
async function calcolaSalute(actor) {
  const eta = actor.system.eta || 0;
  const costituzioneLevel = actor.system.constitutionLevel || 1;

  const rollDiv = await (await new Roll("1d6")).evaluate({ async: true });
  const x = Math.ceil(eta / rollDiv.total);

  const dadiExtra = 1 + costituzioneLevel;
  const rollExtra = await (await new Roll(`${dadiExtra}d6`)).evaluate({ async: true });
  const saluteFinale = x + rollExtra.total;

  await actor.update({ "system.salute": saluteFinale });

  ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `
      <strong>Calcolo Salute</strong><br>
      Età: ${eta} <br>
      Primo tiro (1d6): ${rollDiv.total} → X = ${x} <br>
      Secondo tiro (${dadiExtra}d6): ${rollExtra.total} <br>
      <strong>Salute finale:</strong> ${saluteFinale}
    `
  });
}

// ===============================
// Hook: gestione scheda attore
// ===============================
Hooks.on("renderActorSheetV2", (app, html) => {
  const actor = app.actor;

  // Aggiungi arma
  html.find(".aggiungi-arma").click(async () => {
    const armi = foundry.utils.duplicate(actor.system.armi || []);
    armi.push({ nome: "", danno: 1, livello: 1 });
    await actor.update({ "system.armi": armi });
  });

  // Rimuovi arma
  html.find(".rimuovi-arma").click(async (ev) => {
    const index = Number(ev.currentTarget.closest(".arma").dataset.index);
    const armi = foundry.utils.duplicate(actor.system.armi || []);
    armi.splice(index, 1);
    await actor.update({ "system.armi": armi });
  });

  // Attacco con Sangue Freddo
  html.find(".attacco-sanguefreddo").click(async () => {
    const armaIndex = parseInt(html.find(".arma-selezionata").val());
    const level = actor.system.coolLevel || 1;
    const favori = actor.system.favori || 0;
    const arma = actor.system.armi[armaIndex];

    if (!arma) {
      ui.notifications.error("Nessuna arma selezionata!");
      return;
    }

    if (arma.livello > level) {
      ui.notifications.error(`Non puoi usare ${arma.nome}: richiede Sangue Freddo livello ${arma.livello}`);
      return;
    }

    let diceCount = level;

    if (favori > 0) {
      const useFavore = await Dialog.confirm({
        title: "Usare un Favore?",
        content: `<p>Vuoi usare un Favore per aggiungere 1 dado al tiro?</p>`,
        yes: () => true,
        no: () => false
      });

      if (useFavore) {
        diceCount += 1;
        await actor.update({ "system.favori": favori - 1 });
      }
    }

    const playerRoll = await (await new Roll(`${diceCount}d6`)).evaluate({ async: true });
    const masterRoll = await (await new Roll("1d6")).evaluate({ async: true });
    const hit = playerRoll.total >= masterRoll.total;

    let message = `
      <strong>Attacco con ${arma.nome}</strong><br>
      Tiro Giocatore (${diceCount}d6): ${playerRoll.total} <br>
      Tiro Master (1d6): ${masterRoll.total} <br>
    `;

    if (hit) {
      const totalDamage = arma.danno * level;
      message += `✅ Colpito!<br><strong>Danno:</strong> ${totalDamage}`;
    } else {
      message += `❌ Mancato!`;
    }

    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: message
    });
  });

  // Calcolo manuale Salute
  html.find(".calcola-salute").click(async () => {
    if (!actor.system.salute || actor.system.salute === 0) {
      await calcolaSalute(actor);
    } else {
      ui.notifications.info("La Salute è già stata calcolata. Ora si aggiorna automaticamente.");
    }
  });
});

// ===============================
// Hook: ricalcolo automatico Salute
// ===============================
Hooks.on("updateActor", (actor, updateData, options, userId) => {
  const changedEta = foundry.utils.getProperty(updateData, "system.eta") !== undefined;
  const changedCost = foundry.utils.getProperty(updateData, "system.constitutionLevel") !== undefined;
  const saluteEsistente = actor.system.salute && actor.system.salute > 0;

  if (saluteEsistente && (changedEta || changedCost)) {
    calcolaSalute(actor);
  }
});

// ===============================
// Controlli creazione PG
// ===============================
Hooks.on("updateActor", (actor, updateData, options, userId) => {
  const keys = ["moneyLevel", "coolLevel", "driveLevel", "constitutionLevel"];
  const creationPhase = actor.getFlag("the-project", "creationPhase") === true;

  let current = {};
  keys.forEach(k => {
    current[k] = foundry.utils.getProperty(updateData, `system.${k}`) ?? actor.system[k] ?? 0;
  });

  if (creationPhase) {
    keys.forEach(k => {
      if (current[k] > 2) {
        ui.notifications.warn(`In creazione non puoi assegnare il livello 3 a ${k}.`);
        current[k] = 2;
      }
    });

    const total = keys.reduce((sum, k) => sum + (current[k] || 0), 0);
    if (total > 4) {
      ui.notifications.error("Hai superato i 4 punti disponibili in creazione!");
      throw new Error("Distribuzione punti non valida");
    }
  }
});