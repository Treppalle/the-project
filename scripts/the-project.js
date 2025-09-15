// ===============================
// Funzione per calcolare la Salute
// ===============================
async function calcolaSalute(actor) {
  let eta = actor.system.eta || 0;
  let costituzioneLevel = actor.system.constitutionLevel || 1;

  let rollDiv = await new Roll("1d6").roll({async: true});
  let x = Math.ceil(eta / rollDiv.total);

  let dadiExtra = 1 + costituzioneLevel;
  let rollExtra = await new Roll(`${dadiExtra}d6`).roll({async: true});
  let saluteFinale = x + rollExtra.total;

  await actor.update({"system.salute": saluteFinale});

  ChatMessage.create({
    speaker: ChatMessage.getSpeaker({actor}),
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
Hooks.on("renderActorSheet", (app, html) => {
  html.find(".aggiungi-arma").click(async () => {
    let
