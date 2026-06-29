const Trainer = (() => {
  const MAX_PROGRESS = 3;
  const TEST_READY_PROGRESS = 2;
  const COOLDOWN_AFTER_ERROR = 4;
  const DATA_FILES = {
    aktuell: "data/aktuell.csv",
    gesamt: "data/gesamt.csv"
  };

  let words = [];
  let currentWord = null;
  let mode = "de_en";
  let finalMode = false;
  let finalSession = null;
  let learningSession = null;
  let progressStore = {};
  let stats = { today: 0 };
  let currentSource = "aktuell";

  function makeId(word, index) {
    return (word.english + "-" + word.german + "-" + index)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  async function load(source) {
    currentSource = source || "aktuell";
    progressStore = Storage.loadProgress();
    stats = Storage.loadStats();

    const file = getDataFile(currentSource);
    const response = await fetch(file);
    if (!response.ok) throw new Error("CSV konnte nicht geladen werden: " + file);

    const text = await response.text();
    words = parseCsv(text).map((word, index) => {
      const id = currentSource + "::" + (word.id || makeId(word, index));
      const saved = progressStore[id] || {};
      return {
        ...word,
        id,
        progress: { de_en: saved.de_en || 0, en_de: saved.en_de || 0, sentence: saved.sentence || 0 },
        final: {
          de_en: Boolean(saved.final && saved.final.de_en),
          en_de: Boolean(saved.final && saved.final.en_de),
          sentence: Boolean(saved.final && saved.final.sentence)
        },
        cooldown: 0
      };
    });
  }

  function getDataFile(source) {
    if (DATA_FILES[source]) return DATA_FILES[source];
    if (/^[a-z0-9][a-z0-9_-]*$/i.test(source)) return "data/sets/" + source + ".csv";
    throw new Error("Ungueltige Vokabelset-ID: " + source);
  }

  function parseCsv(text) {
    return text
      .trim()
      .split(/\r?\n/)
      .slice(1)
      .map(parseCsvLine)
      .filter((parts) => parts.length >= 5)
      .map((parts) => {
        const english = parts[1].trim();
        const primaryEnglish = primaryAlternative(english);
        const sentence = parts[3].trim();
        return {
          id: parts[0].trim(),
          english,
          german: parts[2].trim(),
          sentence,
          sentenceGerman: parts[4].trim(),
          sentenceGap: sentence.replace(new RegExp(escapeRegExp(primaryEnglish), "i"), "_____")
        };
      });
  }

  function parseCsvLine(line) {
    const fields = [];
    let field = "";
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      const nextChar = line[index + 1];

      if (char === '"' && inQuotes && nextChar === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ";" && !inQuotes) {
        fields.push(field);
        field = "";
      } else {
        field += char;
      }
    }

    fields.push(field);
    return fields;
  }

  function start(selectedMode) {
    mode = selectedMode;
    finalMode = false;
    finalSession = null;
    learningSession = null;
    return nextTask();
  }

  function startLearning() {
    mode = "learn";
    finalMode = false;
    finalSession = null;
    learningSession = {
      queue: shuffle(words),
      block: [],
      choiceBlock: [],
      phase: "study",
      index: 0,
      total: words.length * 2,
      done: 0
    };
    return nextLearningTask();
  }

  function nextLearningTask() {
    if (!learningSession) return null;

    if (learningSession.phase === "study" && learningSession.index >= learningSession.block.length) {
      learningSession.block = learningSession.queue.splice(0, 3);
      learningSession.index = 0;
      if (learningSession.block.length === 0) {
        learningSession = null;
        return null;
      }
    }

    if (learningSession.phase === "study") {
      currentWord = learningSession.block[learningSession.index];
      learningSession.index += 1;
      if (learningSession.index >= learningSession.block.length) {
        learningSession.phase = "choice";
        learningSession.index = 0;
        learningSession.choiceBlock = buildLearningChoiceBlock(learningSession.block);
      }
      return buildLearningStudyTask(currentWord);
    }

    if (learningSession.index >= learningSession.choiceBlock.length) {
      learningSession.phase = "study";
      learningSession.index = 0;
      learningSession.block = [];
      learningSession.choiceBlock = [];
      return nextLearningTask();
    }

    const choiceTask = learningSession.choiceBlock[learningSession.index];
    currentWord = choiceTask.word;
    learningSession.index += 1;
    return buildLearningChoiceTask(currentWord, choiceTask.mode);
  }

  function startFinalTest() {
    if (!canStartFinalTest()) return null;
    finalMode = true;
    finalSession = { queue: shuffle(words), total: words.length, correct: 0, wrong: [] };
    return nextFinalTask();
  }

  function nextTask() {
    if (finalMode && finalSession) return nextFinalTask();
    words.forEach((word) => { if (word.cooldown > 0) word.cooldown -= 1; });
    const targetProgress = practiceTargetProgress();
    let available = words.filter((word) => (word.progress[mode] || 0) < targetProgress && word.cooldown === 0);
    if (available.length === 0) {
      words.forEach((word) => { if ((word.progress[mode] || 0) < targetProgress) word.cooldown = 0; });
      available = words.filter((word) => (word.progress[mode] || 0) < targetProgress);
    }
    if (available.length === 0) return nextFinalTask();
    finalMode = false;
    currentWord = weightedPick(available);
    return buildTask(currentWord);
  }

  function nextFinalTask() {
    if (!finalSession) {
      const finalCandidates = words.filter((word) => isMasteredInCurrentMode(word) && !word.final[mode]);
      if (finalCandidates.length === 0) { currentWord = null; return null; }
      finalSession = { queue: shuffle(finalCandidates), total: finalCandidates.length, correct: 0, wrong: [] };
    }

    if (finalSession.queue.length === 0) return finishFinalSession();

    finalMode = true;
    return buildFinalBatchTask(finalSession.queue.splice(0, 5));
  }

  function buildTask(word) {
    return { word, question: questionFor(word), hint: hintFor(word), phase: finalMode ? "final" : "learn", progress: trainingProgress() };
  }

  function buildFinalBatchTask(batch) {
    return {
      type: "final_batch",
      phase: "final",
      items: batch.map((word) => ({ id: word.id, word, question: questionFor(word), hint: hintFor(word) })),
      progress: trainingProgress()
    };
  }

  function buildLearningStudyTask(word) {
    return {
      type: "study",
      word,
      phase: "learning",
      mode: "de_en",
      german: primaryAlternative(word.german),
      english: primaryAlternative(word.english),
      sentenceGerman: word.sentenceGerman,
      sentenceEnglish: word.sentence,
      progress: learningProgress()
    };
  }

  function buildLearningChoiceTask(word, choiceMode) {
    return {
      type: "choice",
      word,
      phase: "learning",
      mode: choiceMode,
      question: choiceMode === "en_de" ? primaryAlternative(word.english) : primaryAlternative(word.german),
      options: choiceOptionsFor(choiceMode),
      progress: learningProgress()
    };
  }

  function choiceOptionsFor(choiceMode) {
    const options = learningSession && learningSession.block.length
      ? learningSession.block.map((item) => primaryAlternative(choiceMode === "en_de" ? item.german : item.english))
      : [];
    return shuffle(options);
  }

  function buildLearningChoiceBlock(block) {
    const choices = block.flatMap((word) => ([
      { word, mode: "de_en" },
      { word, mode: "en_de" }
    ]));

    for (let attempt = 0; attempt < 25; attempt += 1) {
      const candidate = shuffle(choices);
      if (!hasAdjacentSameWord(candidate)) return candidate;
    }

    return spreadSameWordsApart(shuffle(choices));
  }

  function hasAdjacentSameWord(choices) {
    return choices.some((choice, index) => index > 0 && choice.word.id === choices[index - 1].word.id);
  }

  function spreadSameWordsApart(choices) {
    const arranged = [];
    const remaining = [...choices];

    while (remaining.length > 0) {
      const lastWordId = arranged.length ? arranged[arranged.length - 1].word.id : "";
      let nextIndex = remaining.findIndex((choice) => choice.word.id !== lastWordId);
      if (nextIndex < 0) nextIndex = 0;
      arranged.push(remaining.splice(nextIndex, 1)[0]);
    }

    return arranged;
  }

  function questionFor(word) {
    if (mode === "de_en") return word.german;
    if (mode === "en_de") return primaryAlternative(word.english);
    return word.sentenceGap || word.sentenceGerman;
  }

  function hintFor(word) {
    return mode === "sentence" ? word.sentenceGerman : "";
  }

  function solutionFor(word) {
    if (mode === "de_en") return word.english;
    if (mode === "en_de") return word.german;
    return word.english;
  }

  function solutionOptionsFor(word) {
    return splitAlternatives(solutionFor(word));
  }

  function primaryAlternative(value) {
    return splitAlternatives(value)[0] || value;
  }

  function splitAlternatives(value) {
    return value
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean);
  }

  function checkAnswer(answer) {
    if (!currentWord || !answer.trim()) return { type: "empty" };
    const cleanAnswer = answer.trim().replace(/\s+/g, " ");
    const evaluation = evaluateAnswer(currentWord, cleanAnswer);

    if (evaluation.type === "correct" || evaluation.type === "correct_with_hint") {
      saveCorrectAnswer();
      if (evaluation.type === "correct_with_hint") return correctWithHint(evaluation.hint);
      return { type: "correct", solution: displayPrimarySolution(currentWord), progress: { ...currentWord.progress }, mode, finished: allMastered() };
    }

    if (evaluation.type === "almost") {
      return { type: "almost", solution: displayPrimarySolution(currentWord) };
    }

    const finalFailed = finalMode;
    if (finalMode) {
      recordFinalAnswer(false);
    } else {
      currentWord.cooldown = COOLDOWN_AFTER_ERROR;
    }
    persist();
    return { type: "wrong", solution: displayPrimarySolution(currentWord), finalFailed };
  }

  function checkFinalBatch(answers) {
    if (!finalSession || !Array.isArray(answers)) return { type: "empty" };
    const rows = answers.map((entry) => {
      const word = words.find((item) => item.id === entry.id);
      if (!word) return null;
      const evaluation = evaluateAnswer(word, entry.answer || "");
      const correct = evaluation.type === "correct" || evaluation.type === "correct_with_hint";
      if (correct) {
        word.progress[mode] = MAX_PROGRESS;
        word.final[mode] = true;
        finalSession.correct += 1;
      } else {
        word.progress[mode] = Math.min(word.progress[mode] || 0, MAX_PROGRESS - 1);
        word.final[mode] = false;
        finalSession.wrong.push(word);
      }
      return { id: word.id, correct, solution: displayPrimarySolution(word) };
    }).filter(Boolean);
    stats.today += rows.filter((row) => row.correct).length;
    persist();
    return { type: "final_batch_checked", rows };
  }

  function evaluateAnswer(word, cleanAnswer) {
    if (!cleanAnswer.trim()) return { type: "wrong" };
    const normalizedAnswer = normalize(cleanAnswer);
    const normalizedAnswerVariants = answerVariants(cleanAnswer);
    const options = solutionOptionsFor(word);
    const optionVariants = options.map((option) => answerVariants(option));
    const matchingIndex = optionVariants.findIndex((variants) => normalizedAnswerVariants.some((answerVariant) => variants.includes(answerVariant)));

    if (matchingIndex >= 0) {
      const matchingOption = options[matchingIndex];
      const strictMatch = answerVariants(matchingOption, false).includes(normalizedAnswer);
      if (!strictMatch) return { type: "correct_with_hint", hint: "Richtig. Vollständig wäre: " + matchingOption };
      if (needsEnglishCapitalHint(matchingOption) && cleanAnswer !== matchingOption) return { type: "correct_with_hint", hint: "Richtig. Achte auf die Großschreibung: " + matchingOption };
      return { type: "correct" };
    }

    const normalizedOptions = options.map(normalize);
    const toIndex = normalizedOptions.findIndex((option) => option.startsWith("to ") && option.slice(3) === normalizedAnswer);
    if ((mode === "de_en" || mode === "sentence") && toIndex >= 0) return { type: "correct_with_hint", hint: "Richtig. Denk an das to beim Verb: " + options[toIndex] };

    const typoIndex = normalizedOptions.findIndex((option) => option.length >= 5 && normalizedAnswer.length >= 5 && levenshtein(normalizedAnswer, option) <= 1);
    if (typoIndex >= 0) return { type: "correct_with_hint", hint: "Richtig. Achte auf die Schreibweise: " + options[typoIndex] };

    if (normalizedOptions.some((option) => levenshtein(normalizedAnswer, option) <= 1)) return { type: "almost" };
    return { type: "wrong" };
  }

  function checkChoice(answer) {
    if (!currentWord || !answer) return { type: "empty" };
    const choiceMode = learningSession && learningSession.choiceBlock[learningSession.index - 1]
      ? learningSession.choiceBlock[learningSession.index - 1].mode
      : "de_en";
    const correct = primaryAlternative(choiceMode === "en_de" ? currentWord.german : currentWord.english);
    const isCorrect = normalize(answer) === normalize(correct);
    if (learningSession) learningSession.done += 1;

    if (isCorrect) {
      currentWord.progress[choiceMode] = Math.max(currentWord.progress[choiceMode] || 0, 1);
      stats.today += 1;
      persist();
      return { type: "correct", solution: correct, progress: { ...currentWord.progress }, mode: choiceMode };
    }

    persist();
    return { type: "wrong", solution: correct, mode: choiceMode, progress: { ...currentWord.progress } };
  }

  function correctWithHint(hint) {
    return { type: "correct_with_hint", solution: displayPrimarySolution(currentWord), hint, progress: { ...currentWord.progress }, mode, finished: allMastered() };
  }

  function needsEnglishCapitalHint(solution) {
    return (mode === "de_en" || mode === "sentence") && /[A-Z]/.test(solution);
  }

  function saveCorrectAnswer() {
    if (finalMode) {
      recordFinalAnswer(true);
    } else {
      currentWord.progress[mode] = Math.min(MAX_PROGRESS, currentWord.progress[mode] + 1);
    }
    stats.today += 1;
    persist();
  }

  function recordFinalAnswer(correct) {
    if (!finalSession) return;
    if (correct) {
      currentWord.final[mode] = true;
      finalSession.correct += 1;
    } else {
      currentWord.final[mode] = false;
      finalSession.wrong.push(currentWord);
    }
  }

  function finishFinalSession() {
    const result = {
      total: finalSession.total,
      correct: finalSession.correct,
      wrong: finalSession.wrong.length,
      percent: finalSession.total ? Math.round((finalSession.correct / finalSession.total) * 100) : 0
    };

    finalSession.wrong.forEach((word) => {
      word.progress[mode] = Math.min(word.progress[mode], MAX_PROGRESS - 1);
      word.final[mode] = false;
      word.cooldown = 0;
    });

    finalSession = null;
    finalMode = false;
    currentWord = null;
    persist();
    return { complete: true, result };
  }

  function displayPrimarySolution(word) {
    return solutionOptionsFor(word)[0] || solutionFor(word);
  }

  function isMastered(word) { return word.progress.de_en >= MAX_PROGRESS && word.progress.en_de >= MAX_PROGRESS && word.progress.sentence >= MAX_PROGRESS; }
  function allMastered() { return words.length > 0 && words.every(isMastered); }

  function weightedPick(list) {
    const pool = [];
    list.forEach((word) => {
      const weight = Math.max(1, MAX_PROGRESS - word.progress[mode] + 1);
      for (let i = 0; i < weight; i += 1) pool.push(word);
    });
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function persist() {
    words.forEach((word) => {
      progressStore[word.id] = { de_en: word.progress.de_en, en_de: word.progress.en_de, sentence: word.progress.sentence, final: { ...word.final }, mastered: isFullyComplete(word) };
    });
    Storage.saveProgress(progressStore);
    Storage.saveStats(stats);
  }

  function getDashboardStats() {
    const progress = Storage.loadProgress();
    const entries = Object.values(progress);
    const mastered = entries.filter((entry) => entry.mastered).length;
    const totalSlots = entries.length * (MAX_PROGRESS + 1) * 3;
    const learnedSlots = entries.reduce((sum, entry) => {
      const final = entry.final || {};
      return sum + Math.min(entry.de_en || 0, MAX_PROGRESS) + Math.min(entry.en_de || 0, MAX_PROGRESS) + Math.min(entry.sentence || 0, MAX_PROGRESS) + (final.de_en ? 1 : 0) + (final.en_de ? 1 : 0) + (final.sentence ? 1 : 0);
    }, 0);
    return { today: Storage.loadStats().today || 0, mastered, percent: totalSlots ? Math.round((learnedSlots / totalSlots) * 100) : 0 };
  }

  function trainingProgress() {
    if (finalMode && finalSession) {
      const done = finalSession.total - finalSession.queue.length - 1;
      return { done, total: finalSession.total, percent: finalSession.total ? Math.round((done / finalSession.total) * 100) : 0, finalOpen: finalSession.queue.length + 1 };
    }
    const total = words.length * MAX_PROGRESS;
    const learned = words.reduce((sum, word) => sum + Math.min(word.progress[mode] || 0, MAX_PROGRESS), 0);
    return { done: learned, total, percent: total ? Math.round((learned / total) * 100) : 0, finalOpen: words.filter((word) => !hasPassedFinal(word)).length };
  }

  function learningProgress() {
    if (!learningSession) return { done: 0, total: 0, percent: 0 };
    return { done: learningSession.done, total: learningSession.total, percent: learningSession.total ? Math.round((learningSession.done / learningSession.total) * 100) : 0 };
  }

  function hasPassedFinal(word) { return isMastered(word) && word.final[mode]; }

  function isMasteredInCurrentMode(word) { return (word.progress[mode] || 0) >= MAX_PROGRESS; }

  function isReadyForFinalTest(word) { return (word.progress[mode] || 0) >= TEST_READY_PROGRESS; }

  function canStartFinalTest() { return words.length > 0 && words.every(isReadyForFinalTest); }

  function practiceTargetProgress() { return canStartFinalTest() ? MAX_PROGRESS : TEST_READY_PROGRESS; }

  function getTrainingState() { return { canStartFinalTest: canStartFinalTest(), finalMode }; }

  function isFullyComplete(word) { return isMastered(word) && word.final.de_en && word.final.en_de && word.final.sentence; }

  function shuffle(list) {
    const copy = [...list];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
  }

  function normalize(text) {
    return text
      .toLowerCase()
      .trim()
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/ß/g, "ss")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[’']/g, "")
      .replace(/[^a-z0-9 ]/g, "")
      .replace(/\s+/g, " ");
  }

  function answerVariants(value, includeLoose = true) {
    const base = normalize(value);
    const variants = new Set([base]);
    if (!includeLoose) return Array.from(variants).filter(Boolean);

    const withoutParentheses = normalize(value.replace(/\([^)]*\)/g, ""));
    if (withoutParentheses) variants.add(withoutParentheses);
    addContractionVariants(variants, value);
    addSpellingVariants(variants);
    addJoinVariants(variants);
    Array.from(variants).forEach((variant) => addLooseArticleVariants(variants, variant));
    addSpellingVariants(variants);
    addJoinVariants(variants);

    return Array.from(variants).filter(Boolean);
  }

  function addLooseArticleVariants(variants, value) {
    if (!value) return;

    const withoutEnglishArticle = value.replace(/^(the|a|an) /, "").trim();
    if (withoutEnglishArticle) variants.add(withoutEnglishArticle);

    const withoutGermanArticle = value.replace(/^(der|die|das|den|dem|des|ein|eine|einen|einem|einer|eines) /, "").trim();
    if (withoutGermanArticle) variants.add(withoutGermanArticle);
  }

  function addContractionVariants(variants, value) {
    const expanded = value
      .replace(/\bwhat['’]s\b/gi, "what is")
      .replace(/\bwho['’]s\b/gi, "who is")
      .replace(/\bwhere['’]s\b/gi, "where is")
      .replace(/\bthere['’]s\b/gi, "there is")
      .replace(/\bit['’]s\b/gi, "it is")
      .replace(/\bthat['’]s\b/gi, "that is")
      .replace(/\bi['’]m\b/gi, "i am")
      .replace(/\byou['’]re\b/gi, "you are")
      .replace(/\bwe['’]re\b/gi, "we are")
      .replace(/\bthey['’]re\b/gi, "they are")
      .replace(/\bcan['’]t\b/gi, "cannot")
      .replace(/\bdon['’]t\b/gi, "do not");
    variants.add(normalize(expanded));
  }

  function addSpellingVariants(variants) {
    Array.from(variants).forEach((variant) => {
      variants.add(swapWords(variant, {
        colour: "color",
        favourite: "favorite",
        centre: "center",
        theatre: "theater",
        travelled: "traveled",
        travelling: "traveling",
        traveller: "traveler",
        grey: "gray",
        programme: "program"
      }));
      variants.add(swapWords(variant, {
        color: "colour",
        favorite: "favourite",
        center: "centre",
        theater: "theatre",
        traveled: "travelled",
        traveling: "travelling",
        traveler: "traveller",
        gray: "grey",
        program: "programme"
      }));
    });
  }

  function addJoinVariants(variants) {
    Array.from(variants).forEach((variant) => {
      if (variant.includes(" ")) variants.add(variant.replace(/\s+/g, ""));
    });
  }

  function swapWords(text, replacements) {
    return text
      .split(" ")
      .map((word) => replacements[word] || word)
      .join(" ");
  }

  function levenshtein(a, b) {
    const matrix = Array.from({ length: b.length + 1 }, (_, row) => [row]);
    for (let column = 0; column <= a.length; column += 1) matrix[0][column] = column;
    for (let row = 1; row <= b.length; row += 1) {
      for (let column = 1; column <= a.length; column += 1) {
        matrix[row][column] = b[row - 1] === a[column - 1] ? matrix[row - 1][column - 1] : Math.min(matrix[row - 1][column - 1] + 1, matrix[row][column - 1] + 1, matrix[row - 1][column] + 1);
      }
    }
    return matrix[b.length][a.length];
  }

  function escapeRegExp(text) { return text.replace(/[.*+?^$()|[\]\\]/g, "\\$&"); }

  return { load, start, startLearning, startFinalTest, nextTask, nextLearningTask, checkAnswer, checkChoice, checkFinalBatch, getDashboardStats, getTrainingState };
})();









