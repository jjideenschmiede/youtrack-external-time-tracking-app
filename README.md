# External Time Tracking für YouTrack

Dieses Repository enthält eine YouTrack-App der J&J Ideenschmiede GmbH, die YouTrack mit externen Zeiterfassungssystemen verbindet. Aktuell wird **clocko:do** unterstützt; weitere Anbieter lassen sich über die Provider-Registry in `src/providers.js` ergänzen.

## Funktionen

- **Profil → Time Tracking** (`USER_PROFILE_SETTINGS`): Jede Person wählt ihren Anbieter und hinterlegt die eigenen Zugangsdaten (bei clocko:do E-Mail-Adresse und API-Schlüssel). Die Zugangsdaten werden vor dem Speichern gegen die API geprüft und nie an den Browser zurückgegeben.
- **Ticket-Seitenleiste „Time Tracking“** (`ISSUE_FIELD_PANEL_LAST`): Zeigt die über die App erfasste Zeit am Ticket (gesamt und eigene) und erlaubt neue Einträge direkt unter den Feldern.
- **Ticket-Menü → „Log External Time“** (`ISSUE_OPTIONS_MENU_ITEM`): Dasselbe Formular als Dialog.
- **Hauptmenü → „Time Tracking“** (`MAIN_MENU_ITEM`): Wochenübersicht der eigenen Einträge aus dem Anbieter, Ticket-IDs im Beschreibungstext werden als Links aufgelöst.

## Sprachen

Die Oberfläche und alle Fehlermeldungen sind auf Deutsch und Englisch verfügbar. Die Sprache folgt der YouTrack-Spracheinstellung des Benutzers (`src/widgets/common/i18n.ts` und `src/i18n.js`).

## Feldzuordnung

Unter `Administration > Apps > External Time Tracking > Settings` (global oder pro Projekt) kann für Kunde, Projekt und Leistung jeweils der Name eines YouTrack-Feldes hinterlegt werden, z. B. `Kunde`. Steht im Ticket dort ein Wert, sucht die App den gleichnamigen Eintrag beim Anbieter und wählt ihn im Formular vor. Wird kein passender Eintrag gefunden, erscheint ein Hinweis im Formular.

## Architektur

| Datei | Zweck |
| --- | --- |
| `src/providers.js` | Provider-Registry und clocko:do-Implementierung (`verify`, `listOptions`, `listEntries`, `createEntry`). |
| `src/i18n.js` | Übersetzungen der Backend-Meldungen (Deutsch/Englisch). |
| `src/settings.json` | App-Einstellungen für die Feldzuordnung. |
| `src/common.js` | Gemeinsame Logik: Kontoverwaltung, Formular-Schema, Validierung, Ticket-Referenzen. |
| `src/account.js` | Globaler HTTP-Handler für Verbinden/Trennen des eigenen Kontos. |
| `src/timesheet.js` | Globaler HTTP-Handler für Formular, Auswahllisten und Wochenübersicht. |
| `src/issue.js` | Ticket-bezogener HTTP-Handler (`scope: issue`) für Zusammenfassung und neue Einträge. |
| `entity-extensions.json` | Speichert Konto, Zugangsdaten und zuletzt gewählte Werte am Benutzer sowie die erfassten Einträge am Ticket. |

Ein neuer Anbieter definiert seine Zugangsfelder (`credentialFields`) und Buchungsfelder (`entryFields`, inkl. Abhängigkeiten wie Projekt → Kunde). Die Oberfläche rendert beide Formulare generisch.

## Development

1. Repository klonen
2. Abhängigkeiten installieren: `npm install`
3. App bauen und validieren: `npm run build`
4. Code prüfen: `npm run lint`

## Installation

**Per CLI:**

```bash
npm run build
npm run upload -- --host https://project.ideasfactory.dev --token <token>
```

**Per ZIP-Datei:**

```bash
npm run build && npm run pack
```

Anschließend in YouTrack unter `Administration > Apps > App hochladen` die generierte `.zip`-Datei auswählen.

Nach der Installation muss die App an die gewünschten Projekte angehängt werden, damit die Ticket-Widgets erscheinen.

## Hilfe & Fragen

Bei Fragen kannst du dich jederzeit per [Slack](https://jj-ideenschmiede.slack.com/archives/D037CE6GBFW) oder per E-Mail an Jonas Kwiedor ([jonas.kwiedor@jj-ideenschmiede.de](mailto:jonas.kwiedor@jj-ideenschmiede.de)) wenden.
