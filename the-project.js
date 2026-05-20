console.log(">>> the-project.js caricato!");

class TheProjectActorSheet extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.sheets.ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    window: { title: "{name}" },
    classes: ["the-project", "sheet", "actor"],
    position: { width: 600, height: 500 },
    form: { submitOnChange: false, closeOnSubmit: false }
  };

  static PARTS = {
    body: {
      template: "systems/the-project/templates/sheets/actor-sheet.hbs"
    }
  };

  get title() {
    return this.actor.name;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.system = this.actor.system;
    context.actor = this.actor;
    context.items = this.actor.items.map(i => i);

    const cost = this.actor.system.constitutionLevel || 0;
    const dadi = ["d6", "d8", "d10", "d12"];
    context.dadoFortuna = dadi[cost];

    const salute = context.system.salute || 0;
    context.salutePallini = Array.from({ length: 10 }, (_, i) => i < salute);

    return context;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const actor = this.actor;
    const html = this.element;

// === TAB ===
const activeTab = this._activeTab || "scheda";
const activeContent = html.querySelector(`.tab-content[data-tab="${activeTab}"]`);
const activeBtn = html.querySelector(`.tab-btn[data-tab="${activeTab}"]`);
if (activeContent) activeContent.classList.add("active");
if (activeBtn) activeBtn.classList.add("active");
html.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    this._activeTab = btn.dataset.tab;
    html.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    html.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    btn.classList.add("active");
    html.querySelector(`.tab-content[data-tab="${btn.dataset.tab}"]`).classList.add("active");
  });
});
    // === FOTO CLICCABILE ===
    const img = html.querySelector(".actor-image");
    if (img) {
      img.style.cursor = "pointer";
      img.addEventListener("click", () => {
        const fp = new FilePicker({
          type: "image",
          current: actor.img,
          callback: path => actor.update({ img: path })
        });
        fp.browse();
      });
    }

    // === DADO FORTUNA CLICCABILE ===
    const dadoEl = html.querySelector(".dado-fortuna");
    if (dadoEl) {
      dadoEl.style.cursor = "pointer";
      dadoEl.addEventListener("click", async () => {
        const cost = actor.system.constitutionLevel || 0;
        const dadi = ["d6", "d8", "d10", "d12"];
        const dado = dadi[cost];
        const favori = actor.system.favori || 0;

        let usaFavore = false;
        if (favori > 0) {
          usaFavore = await foundry.applications.api.DialogV2.confirm({
            window: { title: "Usare un Favore?" },
            content: `<p>Hai ${favori} favori disponibili. Vuoi usarne uno per aggiungere 1d6 al tiro?</p>`
          });
        }

        const armaId = actor.system.armaEquipaggiata;
        const armaEquip = armaId ? actor.items.get(armaId) : null;
        const tierBonus = armaEquip ? (armaEquip.system.tier || 0) : 0;

        let formula = `1${dado}`;
        if (tierBonus > 0) formula += ` + ${tierBonus}`;
        if (usaFavore) {
          formula += " + 1d6";
          await actor.update({ "system.favori": favori - 1 });
        }

        const roll = await new Roll(formula).roll();
        ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `🎲 <strong>Dado Fortuna (${dado}${usaFavore ? " + 1d6 Favore" : ""}${tierBonus > 0 ? ` + ${tierBonus} [${armaEquip.name}]` : ""}):</strong> ${roll.total}`
        });
      });
    }

    // === PALLINI ABILITÀ ===
    html.querySelectorAll(".pallini").forEach(gruppo => {
      gruppo.querySelectorAll(".pallino").forEach(pallino => {
        pallino.addEventListener("click", async () => {
          const field = gruppo.dataset.field;
          const value = parseInt(pallino.dataset.value);
          const current = foundry.utils.getProperty(actor, field) || 0;
          const newValue = current === value ? value - 1 : value;
          await actor.update({ [field]: newValue });
        });
      });
    });

    // === PALLINI SALUTE ===
    html.querySelectorAll(".pallino-salute").forEach(pallino => {
      pallino.addEventListener("click", async () => {
        const index = parseInt(pallino.dataset.index);
        const current = actor.system.salute || 0;
        const newValue = current === index + 1 ? index : index + 1;
        await actor.update({ "system.salute": newValue });
      });
    });

    // === RIMUOVI ARMA ===
    html.querySelectorAll(".rimuovi-arma").forEach(btn => {
      btn.addEventListener("click", async () => {
        const itemId = btn.dataset.itemId;
        await actor.deleteEmbeddedDocuments("Item", [itemId]);
      });
    });

    // === EQUIPAGGIA ARMA ===
    html.querySelectorAll(".equipaggia-arma").forEach(btn => {
      btn.addEventListener("click", async () => {
        const itemId = btn.dataset.itemId;
        const tier = parseInt(btn.dataset.tier);
        const coolLevel = actor.system.coolLevel || 0;

        if (tier > coolLevel) {
          ui.notifications.error("Non sei in grado di usare quest'arma!");
          return;
        }

        await actor.update({ "system.armaEquipaggiata": itemId });
      });
    });
  }
}

foundry.documents.collections.Actors.registerSheet("the-project", TheProjectActorSheet, { makeDefault: true });

class TheProjectItemSheet extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.sheets.ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["the-project", "sheet", "item"],
    position: { width: 400, height: 300 },
    form: { submitOnChange: false, closeOnSubmit: false }
  };

  static PARTS = {
    body: {
      template: "systems/the-project/templates/sheets/item-sheet.hbs"
    }
  };

  get title() {
    return this.item.name;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.system = this.item.system;
    context.item = this.item;
    return context;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const item = this.item;
    const html = this.element;

    // === FOTO CLICCABILE ===
    const img = html.querySelector(".item-image");
    if (img) {
      img.style.cursor = "pointer";
      img.addEventListener("click", () => {
        const fp = new FilePicker({
          type: "image",
          current: item.img,
          callback: path => item.update({ img: path })
        });
        fp.browse();
      });
    }

    // === SELECT TIER ===
    const tierSelect = html.querySelector("select[name='system.tier']");
    if (tierSelect) {
      tierSelect.addEventListener("change", async () => {
        await item.update({ "system.tier": parseInt(tierSelect.value) });
      });
    }
  }
}
foundry.documents.collections.Items.registerSheet("the-project", TheProjectItemSheet, { makeDefault: true });

Hooks.on("updateActor", async (actor, updateData) => {
  const keys = ["coolLevel", "driveLevel", "constitutionLevel"];

  let current = {};
  keys.forEach(k => {
    current[k] = foundry.utils.getProperty(updateData, `system.${k}`) ?? actor.system[k] ?? 0;
  });

  const total = keys.reduce((sum, k) => sum + (current[k] || 0), 0);

  if (total > 3) {
    ui.notifications.error("Non puoi assegnare più di 3 punti in totale tra le abilità!");
    const revert = {};
    keys.forEach(k => {
      if (foundry.utils.getProperty(updateData, `system.${k}`) !== undefined) {
        revert[`system.${k}`] = actor.system[k];
      }
    });
    await actor.update(revert);
  }
});