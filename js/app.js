const App = (() => {
  const query = new URLSearchParams(window.location.search);
  const activeSet = normalizeSetId(query.get("set"));
  let selectedArea = activeSet || "aktuell";
  let selectedMode = "de_en";

  function init() {
    UI.init();
    bindButtons();
    UI.setPlayerName(Storage.loadName());
    updateDashboard();
    applySetInfo();
    UI.showPage("startSeite");
  }

  function bindButtons() {
    document.getElementById("nameSpeichern").addEventListener("click", saveName);
    document.getElementById("btnNeue").addEventListener("click", () => chooseArea(activeSet || "aktuell"));
    document.getElementById("btnAlte").addEventListener("click", () => chooseArea("gesamt"));
    document.getElementById("modusDEEN").addEventListener("click", () => chooseMode("de_en"));
    document.getElementById("modusENDE").addEventListener("click", () => chooseMode("en_de"));
    document.getElementById("modusSATZ").addEventListener("click", () => chooseMode("sentence"));
    document.getElementById("zurueckStart").addEventListener("click", () => UI.showPage("startSeite"));
    document.getElementById("zurueckModus").addEventListener("click", () => UI.showPage("modusSeite"));
    document.getElementById("trainingBeenden").addEventListener("click", endTraining);
    document.getElementById("pruefenButton").addEventListener("click", checkAnswer);
    document.getElementById("vokabeltestButton").addEventListener("click", startFinalTest);
    document.getElementById("popupButton").addEventListener("click", UI.closePopup);
    document.getElementById("resetButton").addEventListener("click", resetAll);
    document.getElementById("antwort").addEventListener("keydown", (event) => { if (event.key === "Enter") checkAnswer(); });
    document.querySelectorAll("[data-switch-mode]").forEach((button) => {
      button.addEventListener("click", () => switchTrainingMode(button.dataset.switchMode));
    });
  }

  function applySetInfo() {
    if (!activeSet) return;
    const currentButton = document.getElementById("btnNeue");
    currentButton.querySelector("span").textContent = "Aktuelles Set";
    currentButton.querySelector("small").textContent = activeSet + " aus dem QR-Code";
  }

  function saveName() {
    const name = document.getElementById("spielerName").value.trim();
    if (!name) { UI.popup("!", "Name fehlt", "Bitte gib zuerst deinen Namen ein."); return; }
    Storage.saveName(name);
    UI.popup("OK", "Gespeichert", "Dein Name wurde gespeichert.");
  }

  function chooseArea(area) { selectedArea = area; UI.showPage("modusSeite"); }

  async function chooseMode(mode) {
    selectedMode = mode;
    UI.setLoader(true);
    try {
      await Trainer.load(selectedArea);
      UI.setModeTitle(selectedMode);
      markActiveMode(selectedMode);
      UI.showPage("trainerSeite");
      showTask(Trainer.start(selectedMode));
    } catch (error) {
      console.error(error);
      UI.popup("!", "Vokabeln fehlen", "Die Vokabeldatei konnte nicht geladen werden. Prüfe, ob die passende Datei im data/sets-Ordner liegt.");
      UI.showPage("startSeite");
    } finally {
      UI.setLoader(false);
    }
  }

  function showTask(task) {
    if (task && task.complete) {
      updateDashboard();
      if (task.result.wrong > 0) {
        UI.popup("OK", "Testergebnis: " + task.result.percent + " %", task.result.correct + " von " + task.result.total + " richtig. Die falschen Wörter kommen jetzt wieder ins Training.");
        showTask(Trainer.nextTask());
        return;
      }
      UI.popup("OK", "Testergebnis: 100 %", "Alle " + task.result.total + " Vokabeln wurden im Abschlusstest richtig beantwortet.");
      UI.showPage("startSeite");
      return;
    }
    if (!task) {
      UI.popup("OK", "Geschafft", "Alle Vokabeln dieses Trainings wurden gelernt und im Abschlusstest bestätigt.");
      updateDashboard();
      UI.showPage("startSeite");
      return;
    }
    UI.showTask(task);
    UI.setTestButton(task.phase !== "final" && Trainer.getTrainingState().canStartFinalTest);
  }

  function checkAnswer() {
    const result = Trainer.checkAnswer(UI.getAnswer());
    if (result.type === "empty") return;
    if (result.type === "correct" || result.type === "correct_with_hint") {
      UI.feedback("success", result.hint || "Richtig!");
      UI.setAnswerLocked(true);
      UI.celebrateModeProgress(result.mode, result.progress);
      updateDashboard();
      UI.setTestButton(false);
      if (Trainer.getDashboardStats().today === 20) UI.popup("OK", "Tagesziel erreicht", "Du hast heute 20 Vokabeln erfolgreich geübt.");
      window.setTimeout(() => showTask(Trainer.nextTask()), result.type === "correct_with_hint" ? 5000 : 1400);
      return;
    }
    if (result.type === "almost") {
      UI.feedback("warning", "Fast richtig. Achte noch einmal auf die Schreibweise.");
      return;
    }
    UI.feedback("danger", (result.finalFailed ? "Im Abschlusstest falsch. Dieses Wort kommt nach dem Test wieder ins Training. Richtig wäre: " : "Falsch. Richtig wäre: ") + result.solution);
    UI.setAnswerLocked(true);
    UI.setTestButton(false);
    window.setTimeout(() => showTask(Trainer.nextTask()), 5000);
  }

  function switchTrainingMode(mode) {
    if (!mode) return;
    chooseMode(mode);
  }

  function startFinalTest() {
    const task = Trainer.startFinalTest();
    if (!task) {
      UI.popup("!", "Noch nicht bereit", "Der Vokabeltest wird freigeschaltet, wenn alle Wörter in diesem Modus mindestens 2 von 3 erreicht haben.");
      return;
    }
    UI.setTestButton(false);
    showTask(task);
  }

  function markActiveMode(mode) {
    document.querySelectorAll("[data-switch-mode]").forEach((button) => {
      button.classList.toggle("aktiv", button.dataset.switchMode === mode);
    });
  }

  function updateDashboard() { UI.updateDashboard(Trainer.getDashboardStats()); }
  function endTraining() { UI.showPage("startSeite"); updateDashboard(); }

  function resetAll() {
    if (!window.confirm("Möchtest du Name, Statistik und Lernstand wirklich löschen?")) return;
    Storage.reset();
    UI.setPlayerName("");
    updateDashboard();
    UI.popup("OK", "Zurückgesetzt", "Der Lernstand wurde gelöscht.");
  }

  function normalizeSetId(value) {
    if (!value) return "";
    const cleaned = value.trim();
    return /^[a-z0-9][a-z0-9_-]*$/i.test(cleaned) ? cleaned : "";
  }

  return { init };
})();

document.addEventListener("DOMContentLoaded", App.init);



