# WLAN-Abdeckungskarte

Web-App (PWA) fürs Handy: WLAN-Abdeckung im Grundriss messen, als Heatmap anzeigen und
Repeater-Standorte planen. Entstanden aus dem Claude-Artifact-Prototyp, Funktionen 1:1 übernommen.

## Funktionen

- Etagen mit Grundriss-Foto, Messpunkte per Tippen in den Plan
- Messpunkt aus dem WLAN-Scan-Protokoll der App „AirPort-Dienstprogramm“ (Median pro Sender,
  stärkster Sender = verbunden, mehrere Netze wählbar, Warnung bei kurzen oder geteilten Messungen)
- Router, Repeater und Mesh-Knoten werden über ihre BSSIDs automatisch erkannt und angelegt
- Download, Upload und Ping aus dem RTR-Netztest (Text einfügen)
- Heatmap für Signal, Down, Up und Ping; Signal wahlweise je Gerät
- Raumtabelle und Report mit Empfehlungen (Repeater-Standort, Sticky Client, 5-GHz-Rückfall,
  langsamer Kanal), Heatmap-Bild, Geräte- und Raumstatistik
- Export: Report als Text, Report-Daten als JSON, Heatmap als JPG
- Alle Daten bleiben lokal im Browser (IndexedDB); Sicherung und Umzug per Datei-Export/-Import
- Offline nutzbar und zum Home-Bildschirm hinzufügbar

## Entwicklung

```bash
npm install
npm run dev        # Entwicklungsserver
npm test           # Unit-Tests (Vitest)
npm run build      # Typprüfung + Produktions-Build nach dist/
npm run preview    # Build lokal ansehen
```

## Hosting

Jeder Push auf `main` testet, baut und veröffentlicht die App per GitHub Actions auf GitHub Pages:
https://floeinboeck-ux.github.io/Wifi-Coverage-/

Einmalig nötig: Repo auf „Public“ stellen und unter Settings → Pages als Source „GitHub Actions“ wählen.

Der Build in `dist/` ist statisch und läuft auf jedem Webserver, auch unter einem Unterpfad
(z. B. GitHub Pages). Für Service Worker und „Zum Home-Bildschirm“ braucht es HTTPS.

## Aufbau

```
src/core/      Reine Logik, ohne DOM, mit Tests
  scan.ts      Parser für das AirPort-Scan-Protokoll
  rtr.ts       Parser für RTR-Netztest-Ergebnisse
  pending.ts   Erkennung neuer Geräte aus BSSIDs
  analysis.ts  Raumstatistik, Empfehlungen, Report-Text und -Daten
  heatmap.ts   Interpolation (inverse Distanzgewichtung)
  state.ts     Datenmodell prüfen/migrieren, Export-Format
src/ui/        Oberfläche (Plan, Dialoge, Report)
src/storage.ts IndexedDB-Speicher
public/        Manifest, Icons, Service Worker
tests/         Vitest-Tests
```

## Hinweis zum iPhone

iOS erlaubt weder Web-Apps noch nativen Apps, WLAN-Signalstärken selbst zu scannen.
Deshalb wird das Protokoll aus dem AirPort-Dienstprogramm eingefügt.
