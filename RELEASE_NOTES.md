# Remindr v1.0 Release Notes

**Erstes Release** — April 2026

## Übersicht

Remindr ist eine schlanke Desktop-Reminder-App für Windows. Sie läuft unauffällig im System Tray und ermöglicht schnelles Erstellen von Erinnerungen per Hotkey.

## Features

### System Tray
- Läuft im Hintergrund ohne Taskleistenplatz zu belegen
- Rechtsklick-Menü zum Öffnen oder Beenden
- Klick auf das Tray-Icon öffnet das Hauptfenster

### Quick-Add Overlay
- Globaler Hotkey `Ctrl+Shift+R` öffnet ein schwebendes Eingabefeld
- Schnelle Zeitauswahl: 15m, 30m, 1h, 3h, 24h
- `Enter` speichert, `Esc` schließt

### Reminder-Verwaltung
- Schnellauswahl oder benutzerdefinierte Datum/Uhrzeit-Eingabe
- Wiederholte Benachrichtigungen alle 60 Sekunden bis zur Bestätigung
- Snooze-Funktion (+15m, +30m)
- Erledigte Reminders abhaken oder löschen

### Einstellungen
- Autostart mit Windows
- Konfigurierbarer Hotkey

## Technische Details

- Electron 28
- Persistente Datenspeicherung in `%AppData%/remindr`
- Frameless Window mit Custom Title Bar
- Programmatisch generierte Notification-Sounds via Web Audio API
