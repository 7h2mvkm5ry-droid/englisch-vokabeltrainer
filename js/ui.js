const UI = (() => {
  const STATUS_STEPS = 3;
  const elements = {};
  const modeStatusIds = {
    de_en: "statusDEEN",
    en_de: "statusENDE",
    sentence: "statusSATZ"
  };

  function init() {
    ["startSeite", "modusSeite", "trainerSeite", "spielerName", "fortschrittProzent", "fortschritt", "gemeistert", "lernstatus", "modusTitel", "wortZaehler", "frage", "satzHinweis", "schreibAnsicht", "lernAnsicht", "lernDeutsch", "lernEnglisch", "lernSatzDeutsch", "lernSatzEnglisch", "multipleChoiceAnsicht", "choiceFrage", "choiceOptionen", "testAnsicht", "testAufgaben", "testPruefenButton", "antwortZeile", "weiterButton", "antwort", "feedback", "statusDEEN", "statusENDE", "statusSATZ", "vokabeltestButton", "trainerFortschrittText", "trainerFortschrittProzent", "trainerFortschritt", "trainerGesamtProzent", "loader", "popup", "popupIcon", "popupTitel", "popupText", "batteryReward", "batteryRewardFill", "batteryRewardTitle", "batteryRewardText"].forEach((id) => {
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
    elements.lernstatus.textContent = statusTextFor(stats.percent);
    elements.trainerGesamtProzent.textContent = stats.percent + " %";
  }

  function statusTextFor(percent) {
    if (percent >= 100) return "Voll geladen";
    if (percent >= 70) return "Fast voll";
    if (percent >= 40) return "Gut geladen";
    if (percent >= 10) return "Lädt";
    return "Noch am Laden";
  }

  function setModeTitle(mode) {
    const labels = { learn: "Lerndurchgang", de_en: "Deutsch -> Englisch", en_de: "Englisch -> Deutsch", sentence: "Satztraining" };
    elements.modusTitel.textContent = labels[mode] || "Training";
  }

  function showTask(task) {
    if (task.type === "final_batch") {
      showFinalBatch(task);
      return;
    }
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

  function showFinalBatch(task) {
    setTrainerView("test");
    elements.wortZaehler.textContent = "Vokabeltest";
    updateTrainerProgress(task.progress, "final");
    elements.feedback.textContent = "";
    elements.feedback.className = "feedback";
    elements.testAufgaben.replaceChildren();
    task.items.forEach((item, index) => {
      const row = document.createElement("div");
      row.className = "test-row";
      row.dataset.id = item.id;

      const label = document.createElement("label");
      label.className = "test-row__question";
      label.htmlFor = "testAntwort" + index;
      label.textContent = item.question;

      const input = document.createElement("input");
      input.id = "testAntwort" + index;
      input.className = "test-row__input";
      input.type = "text";
      input.autocomplete = "off";
      input.spellcheck = false;

      const result = document.createElement("span");
      result.className = "test-row__result";
      result.setAttribute("aria-live", "polite");

      row.append(label, input, result);
      if (item.hint) {
        const hint = document.createElement("div");
        hint.className = "test-row__hint";
        hint.textContent = item.hint;
        row.appendChild(hint);
      }
      elements.testAufgaben.appendChild(row);
    });
    elements.testPruefenButton.disabled = false;
    const firstInput = elements.testAufgaben.querySelector("input");
    if (firstInput) firstInput.focus();
  }

  function getFinalBatchAnswers() {
    return Array.from(elements.testAufgaben.querySelectorAll(".test-row")).map((row) => ({
      id: row.dataset.id,
      answer: row.querySelector("input").value
    }));
  }

  function showFinalBatchResults(rows) {
    rows.forEach((rowResult) => {
      const row = elements.testAufgaben.querySelector('[data-id="' + rowResult.id + '"]');
      if (!row) return;
      row.classList.toggle("is-correct", rowResult.correct);
      row.classList.toggle("is-wrong", !rowResult.correct);
      const result = row.querySelector(".test-row__result");
      result.textContent = rowResult.correct ? "✓" : "✕";
      result.title = rowResult.correct ? "Richtig" : "Richtig wäre: " + rowResult.solution;
    });
    elements.testAufgaben.querySelectorAll("input").forEach((input) => { input.disabled = true; });
    elements.testPruefenButton.disabled = true;
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
    elements.testAnsicht.classList.toggle("hidden", view !== "test");
  }

  function updateWordStatus(progress) {
    drawStatus(elements.statusDEEN, progress.de_en);
    drawStatus(elements.statusENDE, progress.en_de);
    drawStatus(elements.statusSATZ, progress.sentence);
  }

  function updateTrainerProgress(progress, phase) {
    const percent = progress ? progress.percent : 0;
    const absolute = progress && progress.total ? " · " + progress.done + "/" + progress.total : "";
    elements.trainerFortschrittText.textContent = phase === "final" ? "Abschlusstest" : "Lernfortschritt";
    elements.trainerFortschrittProzent.textContent = percent + " %" + absolute;
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
    const wasDisabled = elements.vokabeltestButton.disabled;
    elements.vokabeltestButton.disabled = !enabled;
    if (enabled && wasDisabled) {
      elements.vokabeltestButton.classList.remove("test-button--ready");
      void elements.vokabeltestButton.offsetWidth;
      elements.vokabeltestButton.classList.add("test-button--ready");
    }
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

  function showBatteryReward(percent) {
    elements.batteryRewardFill.style.width = percent + "%";
    elements.batteryRewardTitle.textContent = "Akku " + percent + " % geladen";
    elements.batteryRewardText.textContent = rewardTextFor(percent);
    elements.batteryReward.classList.remove("hidden");
    elements.batteryReward.classList.toggle("battery-reward--high", percent >= 70);
    window.clearTimeout(showBatteryReward.timer);
    showBatteryReward.timer = window.setTimeout(() => elements.batteryReward.classList.add("hidden"), 5000);
  }

  function rewardTextFor(percent) {
    if (percent >= 100) return "Voll geladen. Starke Leistung!";
    if (percent >= 80) return "Fast voll. Weiter so!";
    if (percent >= 50) return "Halbzeit geschafft!";
    if (percent >= 30) return "Der Akku steigt.";
    return "Guter Anfang.";
  }

  return { init, showPage, setLoader, setPlayerName, updateDashboard, setModeTitle, showTask, showLearningTask, getAnswer, getFinalBatchAnswers, showFinalBatchResults, setAnswerLocked, setChoiceLocked, setTestButton, feedback, popup, closePopup, showBatteryReward, celebrateModeProgress };
})();
