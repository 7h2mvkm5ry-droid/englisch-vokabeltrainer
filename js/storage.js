const Storage = (() => {
  const KEYS = { name: "ev_name", progress: "ev_progress", stats: "ev_stats", date: "ev_date" };

  function todayKey() { return new Date().toISOString().slice(0, 10); }

  function readJson(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      console.warn("Gespeicherte Daten konnten nicht gelesen werden.", error);
      return fallback;
    }
  }

  function writeJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function loadName() { return localStorage.getItem(KEYS.name) || ""; }
  function saveName(name) { localStorage.setItem(KEYS.name, name); }
  function loadProgress() { return readJson(KEYS.progress, {}); }
  function saveProgress(progress) { writeJson(KEYS.progress, progress); }

  function loadStats() {
    const stats = readJson(KEYS.stats, { today: 0 });
    const storedDate = localStorage.getItem(KEYS.date);
    if (storedDate !== todayKey()) {
      stats.today = 0;
      writeJson(KEYS.stats, stats);
      localStorage.setItem(KEYS.date, todayKey());
    }
    return stats;
  }

  function saveStats(stats) {
    const current = readJson(KEYS.stats, {});
    writeJson(KEYS.stats, { ...current, ...stats });
    localStorage.setItem(KEYS.date, todayKey());
  }

  function reset() { Object.values(KEYS).forEach((key) => localStorage.removeItem(key)); }

  return { loadName, saveName, loadProgress, saveProgress, loadStats, saveStats, reset };
})();
