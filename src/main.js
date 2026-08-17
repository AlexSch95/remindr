/**
 * Remindr - Main Process
 * Lightweight reminder app for Windows
 */

const { app, BrowserWindow, ipcMain, Notification, Tray, Menu, nativeImage, globalShortcut, screen } = require('electron');
const path = require('path');
const fs = require('fs');

// Windows
let mainWindow;
let quickAddWindow;
let tray;

// Quick Add Window Dimensions
const QUICK_ADD_WIDTH = 420;
const QUICK_ADD_HEIGHT = 290;
const QUICK_ADD_HEIGHT_EXPANDED = 410;

// Data
let reminders = [];
let settings = {
  autostart: false,
  hotkey: 'CommandOrControl+Shift+R',
  discordWebhookUrl: '',
  discordUserId: '',
  soundVolume: 0.3,
  soundType: 'classic'
};

// Paths
const dataPath = path.join(app.getPath('userData'), 'reminders.json');
const settingsPath = path.join(app.getPath('userData'), 'settings.json');
const iconPath = path.join(__dirname, '../assets/reminder-icon.ico');

// ============ Data Management ============

function loadReminders() {
  try {
    if (fs.existsSync(dataPath)) {
      const data = fs.readFileSync(dataPath, 'utf8');
      reminders = JSON.parse(data);
    }
  } catch (e) {
    reminders = [];
  }
}

function saveReminders() {
  fs.writeFileSync(dataPath, JSON.stringify(reminders, null, 2));
}

function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf8');
      settings = { ...settings, ...JSON.parse(data) };
    }
  } catch (e) {
    // Use defaults
  }
}

function saveSettings() {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

function normalizeDiscordUserId(userId) {
  return (userId || '').trim().replace(/\D/g, '');
}

async function sendDiscordWebhook(reminder, options = {}) {
  if (!settings.discordWebhookUrl) {
    return {
      ok: false,
      error: 'Bitte zuerst einen Discord-Webhook hinterlegen.'
    };
  }

  const mentionUserId = normalizeDiscordUserId(settings.discordUserId);
  const mentionPrefix = mentionUserId ? `<@${mentionUserId}> ` : '';

  try {
    const response = await fetch(settings.discordWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content: `${mentionPrefix}${reminder.text}`.trim(),
        embeds: [
          {
            title: options.title || 'Remindr',
            description: reminder.text,
            fields: [
              {
                name: 'Zeitpunkt',
                value: new Date(reminder.datetime).toLocaleString('de-DE')
              }
            ],
            color: 10019066,
            timestamp: new Date().toISOString()
          }
        ],
        allowed_mentions: {
          users: mentionUserId ? [mentionUserId] : [],
          parse: []
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Discord webhook failed with status ${response.status}`);
    }

    return {
      ok: true
    };
  } catch (error) {
    console.error('Failed to send Discord webhook:', error);
    return {
      ok: false,
      error: 'Discord-Test fehlgeschlagen. Bitte Webhook und User-ID prüfen.'
    };
  }
}

// ============ Autostart & Hotkey ============

function setAutostart(enabled) {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: app.getPath('exe'),
    args: []
  });
}

function registerHotkey() {
  globalShortcut.unregisterAll();
  
  if (settings.hotkey) {
    try {
      globalShortcut.register(settings.hotkey, () => {
        toggleQuickAdd();
      });
    } catch (e) {
      console.error('Failed to register hotkey:', e);
    }
  }
}

// ============ Quick Add Window ============

function createQuickAddWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  
  quickAddWindow = new BrowserWindow({
    width: QUICK_ADD_WIDTH,
    height: QUICK_ADD_HEIGHT,
    x: Math.round((width - QUICK_ADD_WIDTH) / 2),
    y: Math.round((height - QUICK_ADD_HEIGHT) / 2),
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  quickAddWindow.loadFile(path.join(__dirname, 'quick-add.html'));
  
  quickAddWindow.on('blur', () => {
    if (quickAddWindow && quickAddWindow.isVisible()) {
      quickAddWindow.hide();
    }
  });
}

function toggleQuickAdd() {
  if (!quickAddWindow) {
    createQuickAddWindow();
  }
  
  if (quickAddWindow.isVisible()) {
    quickAddWindow.hide();
  } else {
    // Re-center on current display
    const point = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(point);
    const { x, y, width, height } = display.workArea;
    
    quickAddWindow.setPosition(
      Math.round(x + (width - QUICK_ADD_WIDTH) / 2),
      Math.round(y + (height - QUICK_ADD_HEIGHT) / 2)
    );
    
    quickAddWindow.show();
    quickAddWindow.focus();
    quickAddWindow.webContents.send('focus-input');
  }
}

// ============ Main Window ============

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 450,
    height: 665,
    minWidth: 450,
    minHeight: 665,
    resizable: false,
    frame: false,
    transparent: false,
    backgroundColor: '#050505',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    icon: iconPath
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
    return false;
  });
}

// ============ System Tray ============

function createTray() {
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon);
  
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: 'Öffnen', 
      click: () => mainWindow.show() 
    },
    { type: 'separator' },
    { 
      label: 'Beenden', 
      click: () => {
        app.isQuitting = true;
        app.quit();
      } 
    }
  ]);
  
  tray.setToolTip('Remindr');
  tray.setContextMenu(contextMenu);
  
  tray.on('click', () => {
    mainWindow.show();
  });
}

// ============ Notifications ============

function checkReminders() {
  const now = new Date();
  
  reminders.forEach((reminder, index) => {
    if (reminder.completed) return;
    
    const reminderTime = new Date(reminder.datetime);
    
    if (now >= reminderTime) {
      // Check if we should show notification (first time or 1 min interval)
      const lastNotified = reminder.lastNotified ? new Date(reminder.lastNotified) : null;
      const oneMinute = 60 * 1000;
      
      if (!lastNotified || (now - lastNotified) >= oneMinute) {
        showNotification(reminder);
        reminders[index].lastNotified = now.toISOString();
        reminders[index].triggered = true;
        saveReminders();

        if (!reminders[index].discordNotified) {
          sendDiscordWebhook(reminder).then((result) => {
            if (!result.ok) {
              return;
            }

            const reminderIndex = reminders.findIndex(r => r.id === reminder.id);
            if (reminderIndex === -1 || reminders[reminderIndex].discordNotified) {
              return;
            }

            reminders[reminderIndex].discordNotified = new Date().toISOString();
            saveReminders();
          });
        }
        
        if (mainWindow) {
          mainWindow.webContents.send('reminders-updated', reminders);
        }
      }
    }
  });
}

function showNotification(reminder) {
  const notification = new Notification({
    title: 'Remindr',
    body: reminder.text,
    silent: false,
    icon: iconPath
  });
  
  notification.on('click', () => {
    mainWindow.show();
  });
  
  notification.show();
  
  // Play notification sound
  if (mainWindow) {
    const volume = typeof settings.soundVolume === 'number' ? settings.soundVolume : 0.3;
    const soundType = settings.soundType || 'classic';
    mainWindow.webContents.executeJavaScript(buildSoundScript(soundType, volume));
  }
}

// Build the Web Audio script for a given sound type and volume
function buildSoundScript(soundType, volume) {
  return `
    (function() {
      try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const masterGain = audioContext.createGain();
        masterGain.gain.setValueAtTime(${volume}, audioContext.currentTime);
        masterGain.connect(audioContext.destination);

        function playTone(type, freq, startDelay, duration, gainValue, freqEnd) {
          const osc = audioContext.createOscillator();
          osc.type = type;
          osc.frequency.setValueAtTime(freq, audioContext.currentTime + startDelay);
          if (freqEnd) {
            osc.frequency.exponentialRampToValueAtTime(freqEnd, audioContext.currentTime + startDelay + duration);
          }
          const g = audioContext.createGain();
          g.gain.setValueAtTime(gainValue, audioContext.currentTime + startDelay);
          g.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + startDelay + duration);
          osc.connect(g);
          g.connect(masterGain);
          osc.start(audioContext.currentTime + startDelay);
          osc.stop(audioContext.currentTime + startDelay + duration);
        }

        switch ('${soundType}') {
          case 'chime':
            // Ascending C-E-G arpeggio (pleasant)
            playTone('sine', 523.25, 0, 0.4, 0.5);
            playTone('sine', 659.25, 0.18, 0.4, 0.5);
            playTone('sine', 783.99, 0.36, 0.5, 0.5);
            break;
          case 'digital':
            // Rapid double beep (alarming)
            playTone('square', 1200, 0, 0.12, 0.4);
            playTone('square', 900, 0.15, 0.12, 0.4);
            playTone('square', 1200, 0.3, 0.18, 0.4);
            break;
          case 'gentle':
            // Soft warm tone with long fade-out
            playTone('sine', 440, 0, 0.7, 0.45, 220);
            playTone('sine', 554.37, 0.25, 0.7, 0.3, 277.18);
            break;
          case 'classic':
          default:
            // Original Remindr beep: 880 -> 660 -> 880
            playTone('sine', 880, 0, 0.3, 0.6);
            playTone('sine', 660, 0.1, 0.2, 0.6);
            playTone('sine', 880, 0.2, 0.15, 0.6);
            break;
        }

        setTimeout(() => { try { audioContext.close(); } catch(e) {} }, 1500);
      } catch(e) {}
    })();
  `;
}

function startReminderChecker() {
  setInterval(checkReminders, 1000);
}

// ============ App Lifecycle ============

app.whenReady().then(() => {
  loadReminders();
  loadSettings();
  createWindow();
  createTray();
  createQuickAddWindow();
  startReminderChecker();
  registerHotkey();
  setAutostart(settings.autostart);
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ============ IPC Handlers - Reminders ============

ipcMain.handle('get-reminders', () => {
  return reminders;
});

ipcMain.handle('add-reminder', (event, reminder) => {
  reminder.id = Date.now();
  reminder.completed = false;
  reminder.triggered = false;
  reminder.lastNotified = null;
  reminder.discordNotified = null;
  reminders.push(reminder);
  saveReminders();
  return reminders;
});

ipcMain.handle('delete-reminder', (event, id) => {
  reminders = reminders.filter(r => r.id !== id);
  saveReminders();
  return reminders;
});

ipcMain.handle('complete-reminder', (event, id) => {
  const index = reminders.findIndex(r => r.id === id);
  if (index !== -1) {
    reminders[index].completed = true;
    saveReminders();
  }
  return reminders;
});

ipcMain.handle('snooze-reminder', (event, { id, minutes }) => {
  const index = reminders.findIndex(r => r.id === id);
  if (index !== -1) {
    const newTime = new Date(Date.now() + minutes * 60 * 1000);
    reminders[index].datetime = newTime.toISOString();
    reminders[index].triggered = false;
    reminders[index].lastNotified = null;
    reminders[index].discordNotified = null;
    saveReminders();
  }
  return reminders;
});

ipcMain.handle('clear-completed', () => {
  reminders = reminders.filter(r => !r.completed);
  saveReminders();
  return reminders;
});

// ============ IPC Handlers - Window ============

ipcMain.on('minimize-window', () => {
  mainWindow.minimize();
});

ipcMain.on('close-window', () => {
  mainWindow.hide();
});

// ============ IPC Handlers - Settings ============

ipcMain.handle('get-settings', () => {
  return settings;
});

ipcMain.handle('set-autostart', (event, enabled) => {
  settings.autostart = enabled;
  setAutostart(enabled);
  saveSettings();
  return settings;
});

ipcMain.handle('set-hotkey', (event, hotkey) => {
  settings.hotkey = hotkey;
  saveSettings();
  registerHotkey();
  return settings;
});

ipcMain.handle('set-discord-settings', (event, discordSettings) => {
  settings.discordWebhookUrl = (discordSettings.discordWebhookUrl || '').trim();
  settings.discordUserId = normalizeDiscordUserId(discordSettings.discordUserId);
  saveSettings();
  return settings;
});

ipcMain.handle('test-discord-webhook', async () => {
  const testReminder = {
    text: 'Das ist eine Testnachricht von Remindr.',
    datetime: new Date().toISOString()
  };

  return sendDiscordWebhook(testReminder, {
    title: 'Remindr Test'
  });
});

ipcMain.handle('set-sound-settings', (event, soundSettings) => {
  const volume = parseFloat(soundSettings.soundVolume);
  settings.soundVolume = !isNaN(volume) ? Math.min(1, Math.max(0, volume)) : 0.3;
  settings.soundType = ['classic', 'chime', 'digital', 'gentle'].includes(soundSettings.soundType)
    ? soundSettings.soundType
    : 'classic';
  saveSettings();
  return settings;
});

ipcMain.handle('test-sound', () => {
  if (mainWindow) {
    const volume = typeof settings.soundVolume === 'number' ? settings.soundVolume : 0.3;
    const soundType = settings.soundType || 'classic';
    mainWindow.webContents.executeJavaScript(buildSoundScript(soundType, volume));
  }
  return { ok: true };
});

// ============ IPC Handlers - Quick Add ============

ipcMain.on('quick-add-reminder', (event, reminder) => {
  reminder.id = Date.now();
  reminder.completed = false;
  reminder.triggered = false;
  reminder.lastNotified = null;
  reminder.discordNotified = null;
  reminders.push(reminder);
  saveReminders();
  
  if (mainWindow) {
    mainWindow.webContents.send('reminders-updated', reminders);
  }
  
  if (quickAddWindow) {
    quickAddWindow.hide();
  }
});

ipcMain.on('close-quick-add', () => {
  if (quickAddWindow) {
    quickAddWindow.hide();
  }
});

ipcMain.on('resize-quick-add', (event, expanded) => {
  if (quickAddWindow) {
    const [x, y] = quickAddWindow.getPosition();
    const currentHeight = quickAddWindow.getSize()[1];
    const newHeight = expanded ? QUICK_ADD_HEIGHT_EXPANDED : QUICK_ADD_HEIGHT;
    quickAddWindow.setSize(QUICK_ADD_WIDTH, newHeight, false);
    // Re-center vertically around the current center
    const diff = newHeight - currentHeight;
    quickAddWindow.setPosition(x, y - diff / 2);
  }
});
