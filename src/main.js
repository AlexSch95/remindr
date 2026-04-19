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

// Data
let reminders = [];
let settings = {
  autostart: false,
  hotkey: 'CommandOrControl+Shift+R'
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

// ============ Autostart & Hotkey ============

function setAutostart(enabled) {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: app.getPath('exe')
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
    width: 420,
    height: 260,
    x: Math.round((width - 420) / 2),
    y: Math.round((height - 260) / 2),
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
      Math.round(x + (width - 420) / 2),
      Math.round(y + (height - 260) / 2)
    );
    
    quickAddWindow.show();
    quickAddWindow.focus();
    quickAddWindow.webContents.send('focus-input');
  }
}

// ============ Main Window ============

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 600,
    minWidth: 380,
    minHeight: 500,
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
    mainWindow.webContents.executeJavaScript(`
      (function() {
        try {
          const audioContext = new (window.AudioContext || window.webkitAudioContext)();
          const oscillator = audioContext.createOscillator();
          const gainNode = audioContext.createGain();
          
          oscillator.connect(gainNode);
          gainNode.connect(audioContext.destination);
          
          oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
          oscillator.frequency.setValueAtTime(660, audioContext.currentTime + 0.1);
          oscillator.frequency.setValueAtTime(880, audioContext.currentTime + 0.2);
          
          gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
          
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.3);
        } catch(e) {}
      })();
    `);
  }
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

// ============ IPC Handlers - Quick Add ============

ipcMain.on('quick-add-reminder', (event, reminder) => {
  reminder.id = Date.now();
  reminder.completed = false;
  reminder.triggered = false;
  reminder.lastNotified = null;
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
