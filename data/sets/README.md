# Vokabelsets

Die App kann jetzt einzelne Vokabelsets per Link laden:

```text
index.html?set=klasse7-unit3
```

Dazu muss eine passende CSV-Datei hier liegen:

```text
data/sets/klasse7-unit3.csv
```

CSV-Format:

```text
id;english;german;sentence;sentenceGerman
k7-u3-001;journey;Reise;Our journey starts at the station.;Unsere Reise beginnt am Bahnhof.
```

`data/aktuell.csv` bleibt der Standard, wenn kein `set` im Link steht. `data/gesamt.csv` bleibt die Sammlung alter bzw. aller Vokabeln.
