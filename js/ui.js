const UI = (() => {
  const elements = {};

  function init() {
    ["startSeite", "modusSeite", "trainerSeite", "spielerName", "fortschrittProzent", "fortschritt", "gemeistert", "tagesziel", "modusTitel", "wortZaehler", "frage", "satzHinweis", "antwort", "feedback", "statusDEEN", "statusENDE", "statusSATZ", "loader", "popup", "popupIcon", "popupTitel", "popupText"].forEach((id) => {
      elements[id] = document.getElementById(id);
    });
  }

  function showPage(id) {
    document.querySelectorAll(".seite").forEach((page) => page.classList.remove("aktiv"));
    elements[id].classList.add("aktiv");
  }

  function setLoader(visible) { elements.loader.classList.toggle("hidden", !visible); }
  function setPlayerName(name) { elements.spielerName.value = name; }

  function updateDashboard(stats) {
    elements.fortschrittProzent.textContent = stats.percent + " %";
    elements.fortschritt.style.width = stats.percent + "%";
    elements.gemeistert.textContent = stats.mastered + " Wörter";
    elements.tagesziel.textContent = stats.today + " / 20";
  }

  function setModeTitle(mode) {
    const labels = { de_en: "Deutsch -> Englisch", en_de: "Englisch -> Deutsch", sentence: "Satztraining" };
    elements.modusTitel.textContent = labels[mode] || "Training";
  }

  function showTask(task) {
    elements.frage.textContent = task.question;
    elements.satzHinweis.textContent = task.hint || "";
    elements.satzHinweis.classList.toggle("hidden", !task.hint);
    elements.wortZaehler.textContent = "Noch " + task.openCount + " von " + task.totalCount + " Wörtern";
    elements.antwort.value = "";
    elements.antwort.disabled = false;
    document.getElementById("pruefenButton").disabled = false;
    elements.feedback.textContent = "";
    elements.feedback.className = "feedback";
    updateWordStatus(task.word.progress);
    elements.antwort.focus();
  }

  function updateWordStatus(progress) {
    drawStatus(elements.statusDEEN, progress.de_en);
    drawStatus(elements.statusENDE, progress.en_de);
    drawStatus(elements.statusSATZ, progress.sentence);
  }

  function drawStatus(element, value) { element.textContent = "1".repeat(value) + "0".repeat(Math.max(0, 5 - value)); }
  function getAnswer() { return elements.antwort.value; }

  function setAnswerLocked(locked) {
    elements.antwort.disabled = locked;
    document.getElementById("pruefenButton").disabled = locked;
  }

  function feedback(type, message) {
    elements.feedback.textContent = message;
    elements.feedback.className = "feedback is-" + type;
  }

  function popup(icon, title, text) {
    elements.popupIcon.textContent = icon;
    elements.popupTitel.textContent = title;
    elements.popupText.textContent = text;
    elements.popup.classList.remove("hidden");
  }

  function closePopup() { elements.popup.classList.add("hidden"); }

  return { init, showPage, setLoader, setPlayerName, updateDashboard, setModeTitle, showTask, getAnswer, setAnswerLocked, feedback, popup, closePopup };
})();

