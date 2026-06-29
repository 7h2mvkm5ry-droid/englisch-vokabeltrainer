const UI = (() => {
  const STATUS_STEPS = 3;
  const elements = {};
  const modeStatusIds = {
    de_en: "statusDEEN",
    en_de: "statusENDE",
    sentence: "statusSATZ"
  };

  function init() {
    ["startSeite", "modusSeite", "trainerSeite", "spielerName", "fortschrittProzent", "fortschritt", "gemeistert", "tagesziel", "modusTitel", "wortZaehler", "frage", "satzHinweis", "schreibAnsicht", "lernAnsicht", "lernDeutsch", "lernEnglisch", "lernSatzDeutsch", "lernSatzEnglisch", "multipleChoiceAnsicht", "choiceFrage", "choiceOptionen", "antwortZeile", "weiterButton", "antwort", "feedback", "statusDEEN", "statusENDE", "statusSATZ", "vokabeltestButton", "trainerFortschrittText", "trainerFortschrittProzent", "trainerFortschritt", "loader", "popup", "popupIcon", "popupTitel", "popupText"].forEach((id) => {
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
    const labels = { learn: "Lerndurchgang", de_en: "Deutsch -> Englisch", en_de: "Englisch -> Deutsch", sentence: "Satztraining" };
    elements.modusTitel.textContent = labels[mode] || "Training";
  }

  function showTask(task) {
    setTrainerView("write");
    elements.frage.textContent = task.question;
    elements.satzHinweis.textContent = task.hint || "";
    elements.satzHinweis.classList.toggle("hidden", !task.hint);
    elements.wortZaehler.textContent = task.phase === "final" ? "Abschlusstest" : "Training";
    updateTrainerProgress(task.progress, task.phase);
    elements.antwort.value = "";
    elements.antwort.disabled = false;
    document.getElementById("pruefenButton").disabled = false;
    elements.feedback.textContent = "";
    elements.feedback.className = "feedback";
    updateWordStatus(task.word.progress);
    elements.antwort.focus();
  }

  function showLearningTask(task) {
    elements.feedback.textContent = "";
    elements.feedback.className = "feedback";
    updateTrainerProgress(task.progress, "learning");
    elements.wortZaehler.textContent = task.type === "study" ? "Lerndurchgang" : "Multiple Choice";
    updateWordStatus(task.word.progress);

    if (task.type === "study") {
      setTrainerView("study");
      elements.lernDeutsch.textContent = task.german;
      elements.lernEnglisch.textContent = task.english;
      elements.lernSatzDeutsch.textContent = task.sentenceGerman || "";
      elements.lernSatzEnglisch.textContent = task.sentenceEnglish || "";
      return;
    }

    setTrainerView("choice");
    elements.choiceFrage.textContent = task.question;
    elements.choiceOptionen.replaceChildren();
    task.options.forEach((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "choice-option";
      button.textContent = option;
      button.dataset.choice = option;
      elements.choiceOptionen.appendChild(button);
    });
    setChoiceLocked(false);
  }

  function setTrainerView(view) {
    elements.schreibAnsicht.classList.toggle("hidden", view !== "write");
    elements.antwortZeile.classList.toggle("hidden", view !== "write");
    elements.lernAnsicht.classList.toggle("hidden", view !== "study");
    elements.weiterButton.classList.toggle("hidden", view !== "study");
    elements.multipleChoiceAnsicht.classList.toggle("hidden", view !== "choice");
  }

  function updateWordStatus(progress) {
    drawStatus(elements.statusDEEN, progress.de_en);
    drawStatus(elements.statusENDE, progress.en_de);
    drawStatus(elements.statusSATZ, progress.sentence);
  }

  function updateTrainerProgress(progress, phase) {
    const percent = progress ? progress.percent : 0;
    elements.trainerFortschrittText.textContent = phase === "final" ? "Abschlusstest" : "Lernfortschritt";
    elements.trainerFortschrittProzent.textContent = percent + " %";
    elements.trainerFortschritt.style.width = percent + "%";
  }

  function celebrateModeProgress(mode, progress) {
    const element = elements[modeStatusIds[mode]];
    if (!element || !progress) return;
    const value = progress[mode] || 0;
    drawStatus(element, value, value - 1);
  }

  function drawStatus(element, value, pulseIndex = -1) {
    element.replaceChildren();
    for (let index = 0; index < STATUS_STEPS; index += 1) {
      const digit = document.createElement("span");
      const filled = index < value;
      digit.textContent = filled ? "1" : "0";
      digit.className = "status-digit" + (filled ? " status-digit--on" : "") + (index === pulseIndex ? " status-digit--pulse" : "");
      element.appendChild(digit);
    }
  }

  function getAnswer() { return elements.antwort.value; }

  function setAnswerLocked(locked) {
    elements.antwort.disabled = locked;
    document.getElementById("pruefenButton").disabled = locked;
  }

  function setTestButton(enabled) {
    elements.vokabeltestButton.disabled = !enabled;
  }

  function setChoiceLocked(locked) {
    elements.choiceOptionen.querySelectorAll("button").forEach((button) => { button.disabled = locked; });
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

  return { init, showPage, setLoader, setPlayerName, updateDashboard, setModeTitle, showTask, showLearningTask, getAnswer, setAnswerLocked, setChoiceLocked, setTestButton, feedback, popup, closePopup, celebrateModeProgress };
})();
