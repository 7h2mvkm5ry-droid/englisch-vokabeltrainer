const Trainer = (() => {
  const MAX_PROGRESS = 5;
  const COOLDOWN_AFTER_ERROR = 4;
  const DATA_FILES = {
    aktuell: "data/aktuell.csv",
    gesamt: "data/gesamt.csv"
  };

  let words = [];
  let currentWord = null;
  let mode = "de_en";
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

  function start(selectedMode) { mode = selectedMode; return nextTask(); }

  function nextTask() {
    words.forEach((word) => { if (word.cooldown > 0) word.cooldown -= 1; });
    let available = words.filter((word) => !isMastered(word) && word.cooldown === 0);
    if (available.length === 0) {
      words.forEach((word) => { if (!isMastered(word)) word.cooldown = 0; });
      available = words.filter((word) => !isMastered(word));
    }
    if (available.length === 0) { currentWord = null; return null; }
    currentWord = weightedPick(available);
    return buildTask(currentWord);
  }

  function buildTask(word) {
    return { word, question: questionFor(word), hint: hintFor(word), openCount: words.filter((item) => !isMastered(item)).length, totalCount: words.length };
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
    const normalizedAnswer = normalize(cleanAnswer);
    const options = solutionOptionsFor(currentWord);
    const normalizedOptions = options.map(normalize);
    const matchingIndex = normalizedOptions.findIndex((option) => option === normalizedAnswer);

    if (matchingIndex >= 0) {
      saveCorrectAnswer();
      const matchingOption = options[matchingIndex];
      if (needsEnglishCapitalHint(matchingOption) && cleanAnswer !== matchingOption) {
        return correctWithHint("Richtig. Achte auf die Großschreibung: " + matchingOption);
      }
      return { type: "correct", solution: displayPrimarySolution(currentWord), progress: { ...currentWord.progress }, mode, finished: allMastered() };
    }

    const toIndex = normalizedOptions.findIndex((option) => option.startsWith("to ") && option.slice(3) === normalizedAnswer);
    if ((mode === "de_en" || mode === "sentence") && toIndex >= 0) {
      saveCorrectAnswer();
      return correctWithHint("Richtig. Denk an das to beim Verb: " + options[toIndex]);
    }

    const typoIndex = normalizedOptions.findIndex((option) => option.length >= 5 && normalizedAnswer.length >= 5 && levenshtein(normalizedAnswer, option) <= 1);
    if (typoIndex >= 0) {
      saveCorrectAnswer();
      return correctWithHint("Richtig. Achte auf die Schreibweise: " + options[typoIndex]);
    }

    if (normalizedOptions.some((option) => levenshtein(normalizedAnswer, option) <= 1)) {
      return { type: "almost", solution: displayPrimarySolution(currentWord) };
    }

    currentWord.cooldown = COOLDOWN_AFTER_ERROR;
    persist();
    return { type: "wrong", solution: displayPrimarySolution(currentWord) };
  }

  function correctWithHint(hint) {
    return { type: "correct_with_hint", solution: displayPrimarySolution(currentWord), hint, progress: { ...currentWord.progress }, mode, finished: allMastered() };
  }

  function needsEnglishCapitalHint(solution) {
    return (mode === "de_en" || mode === "sentence") && /[A-Z]/.test(solution);
  }

  function saveCorrectAnswer() {
    currentWord.progress[mode] = Math.min(MAX_PROGRESS, currentWord.progress[mode] + 1);
    stats.today += 1;
    persist();
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
      progressStore[word.id] = { de_en: word.progress.de_en, en_de: word.progress.en_de, sentence: word.progress.sentence, mastered: isMastered(word) };
    });
    Storage.saveProgress(progressStore);
    Storage.saveStats(stats);
  }

  function getDashboardStats() {
    const progress = Storage.loadProgress();
    const entries = Object.values(progress);
    const mastered = entries.filter((entry) => entry.mastered).length;
    const totalSlots = entries.length * MAX_PROGRESS * 3;
    const learnedSlots = entries.reduce((sum, entry) => sum + (entry.de_en || 0) + (entry.en_de || 0) + (entry.sentence || 0), 0);
    return { today: Storage.loadStats().today || 0, mastered, percent: totalSlots ? Math.round((learnedSlots / totalSlots) * 100) : 0 };
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

  return { load, start, nextTask, checkAnswer, getDashboardStats };
})();









