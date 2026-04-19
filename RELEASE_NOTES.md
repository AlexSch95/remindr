# Remindr v1.0 Release Notes

**Initial Release** — April 2026

## Overview

Remindr is a lightweight desktop reminder app for Windows. It runs quietly in the system tray and lets you create reminders quickly via a global hotkey.

## Features

### System Tray
- Runs in the background without taking up taskbar space
- Right-click menu to open or quit
- Click the tray icon to open the main window

### Quick-Add Overlay
- Global hotkey `Ctrl+Shift+R` opens a floating input field
- Quick time selection: 15m, 30m, 1h, 3h, 24h
- `Enter` to save, `Esc` to close

### Reminder Management
- Quick presets or custom date/time input
- Repeating notifications every 60 seconds until acknowledged
- Snooze function (+15m, +30m)
- Mark reminders as complete or delete them

### Settings
- Launch at Windows startup
- Configurable hotkey

## Technical Details

- Electron 28
- Persistent data storage in `%AppData%/remindr`
- Frameless window with custom title bar
- Programmatically generated notification sounds via Web Audio API
