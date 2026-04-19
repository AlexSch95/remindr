const { ipcRenderer } = require('electron');

// DOM Elements
const reminderForm = document.getElementById('reminder-form');
const reminderDate = document.getElementById('reminder-date');
const reminderTime = document.getElementById('reminder-time');
const reminderText = document.getElementById('reminder-text');
const remindersList = document.getElementById('reminders-list');
const remindersCount = document.getElementById('reminders-count');
const clearBtn = document.getElementById('clear-btn');
const minimizeBtn = document.getElementById('minimize-btn');
const closeBtn = document.getElementById('close-btn');
const quickTimeButtons = document.querySelectorAll('.quick-time-btn[data-minutes]');
const customToggle = document.getElementById('custom-toggle');
const customTimeSection = document.getElementById('custom-time-section');
const selectedDatetimeInput = document.getElementById('selected-datetime');

let selectedMinutes = null;
let useCustomTime = false;

// Set default date to today
function setDefaultDate() {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0];
  reminderDate.value = dateStr;
  
  // Set default time to next hour
  const nextHour = new Date(today.getTime() + 60 * 60 * 1000);
  const hours = String(nextHour.getHours()).padStart(2, '0');
  const minutes = String(Math.ceil(nextHour.getMinutes() / 5) * 5).padStart(2, '0');
  reminderTime.value = `${hours}:${minutes === '60' ? '00' : minutes}`;
}

// Select quick time button
function selectQuickTime(minutes) {
  selectedMinutes = minutes;
  useCustomTime = false;
  
  // Update button states
  quickTimeButtons.forEach(btn => btn.classList.remove('selected'));
  customToggle.classList.remove('selected');
  
  const selectedBtn = document.querySelector(`.quick-time-btn[data-minutes="${minutes}"]`);
  if (selectedBtn) {
    selectedBtn.classList.add('selected');
  }
  
  // Hide custom section
  customTimeSection.classList.remove('visible');
}

// Toggle custom time section
function toggleCustomTime() {
  useCustomTime = !useCustomTime;
  selectedMinutes = null;
  
  // Update button states
  quickTimeButtons.forEach(btn => btn.classList.remove('selected'));
  
  if (useCustomTime) {
    customToggle.classList.add('selected');
    customTimeSection.classList.add('visible');
    setDefaultDate();
  } else {
    customToggle.classList.remove('selected');
    customTimeSection.classList.remove('visible');
  }
}

// Setup quick time buttons
quickTimeButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const minutes = parseInt(btn.dataset.minutes);
    selectQuickTime(minutes);
  });
});

customToggle.addEventListener('click', toggleCustomTime);

// Select default (+1h)
selectQuickTime(60);

// Format datetime for display
function formatDateTime(datetime) {
  const date = new Date(datetime);
  const options = { 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric',
    hour: '2-digit', 
    minute: '2-digit'
  };
  return date.toLocaleString('de-DE', options);
}

// Check if reminder is in the past
function isInPast(datetime) {
  return new Date(datetime) < new Date();
}

// Render reminders
function renderReminders(reminders) {
  // Sort by datetime
  const sorted = [...reminders].sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
  
  // Separate completed and pending
  const pending = sorted.filter(r => !r.completed);
  const completed = sorted.filter(r => r.completed);
  
  remindersCount.textContent = `(${pending.length})`;
  
  if (sorted.length === 0) {
    remindersList.innerHTML = `
      <div class="empty-state">
        <span class="material-icons">notifications_none</span>
        <p>Keine Reminder vorhanden</p>
      </div>
    `;
    return;
  }
  
  // Combine with pending first, then completed
  const allReminders = [...pending, ...completed];
  
  remindersList.innerHTML = allReminders.map(reminder => {
    const isTriggered = reminder.triggered && !reminder.completed;
    const isCompleted = reminder.completed;
    
    return `
    <div class="reminder-item ${isCompleted ? 'completed' : ''} ${isTriggered ? 'triggered' : ''}">
      <div class="reminder-top">
        <div class="reminder-content">
          <div class="reminder-text">${escapeHtml(reminder.text)}</div>
          <div class="reminder-datetime">
            <span class="material-icons">schedule</span>
            ${formatDateTime(reminder.datetime)}
          </div>
          ${isCompleted ? `
            <div class="reminder-status">
              <span class="material-icons">check_circle</span>
              Erledigt
            </div>
          ` : ''}
          ${isTriggered ? `
            <div class="reminder-actions">
              <button class="btn-complete" onclick="completeReminder(${reminder.id})">
                <span class="material-icons">check</span>
                Abhaken
              </button>
              <button class="btn-snooze" onclick="snoozeReminder(${reminder.id}, 15)">
                <span class="material-icons">snooze</span>
                +15m
              </button>
              <button class="btn-snooze" onclick="snoozeReminder(${reminder.id}, 30)">
                <span class="material-icons">snooze</span>
                +30m
              </button>
            </div>
          ` : ''}
        </div>
        <button class="reminder-delete" onclick="deleteReminder(${reminder.id})">
          <span class="material-icons">delete</span>
        </button>
      </div>
    </div>
  `;
  }).join('');
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Add reminder
async function addReminder(e) {
  e.preventDefault();
  
  const text = reminderText.value.trim();
  if (!text) return;
  
  let datetime;
  
  if (useCustomTime) {
    // Use custom date/time
    if (!reminderDate.value || !reminderTime.value) {
      alert('Bitte Datum und Uhrzeit auswählen');
      return;
    }
    datetime = `${reminderDate.value}T${reminderTime.value}`;
  } else if (selectedMinutes) {
    // Calculate time from now
    const targetTime = new Date(Date.now() + selectedMinutes * 60 * 1000);
    datetime = targetTime.toISOString();
  } else {
    alert('Bitte eine Zeit auswählen');
    return;
  }
  
  const reminder = {
    datetime,
    text
  };
  
  const reminders = await ipcRenderer.invoke('add-reminder', reminder);
  renderReminders(reminders);
  
  // Reset form
  reminderText.value = '';
  selectQuickTime(60); // Reset to +1h
  reminderText.focus();
}

// Delete reminder
window.deleteReminder = async function(id) {
  const reminders = await ipcRenderer.invoke('delete-reminder', id);
  renderReminders(reminders);
};

// Complete reminder (abhaken)
window.completeReminder = async function(id) {
  const reminders = await ipcRenderer.invoke('complete-reminder', id);
  renderReminders(reminders);
};

// Snooze reminder
window.snoozeReminder = async function(id, minutes) {
  const reminders = await ipcRenderer.invoke('snooze-reminder', { id, minutes });
  renderReminders(reminders);
};

// Clear completed reminders
async function clearCompleted() {
  const reminders = await ipcRenderer.invoke('clear-completed');
  renderReminders(reminders);
}

// Window controls
minimizeBtn.addEventListener('click', () => {
  ipcRenderer.send('minimize-window');
});

closeBtn.addEventListener('click', () => {
  ipcRenderer.send('close-window');
});

// Event listeners
reminderForm.addEventListener('submit', addReminder);
clearBtn.addEventListener('click', clearCompleted);

// Listen for updates from main process
ipcRenderer.on('reminders-updated', (event, reminders) => {
  renderReminders(reminders);
});

// Initialize
async function init() {
  selectQuickTime(60); // Default to +1h
  const reminders = await ipcRenderer.invoke('get-reminders');
  renderReminders(reminders);
  await loadSettings();
}

init();

// ============ SETTINGS ============

const settingsBtn = document.getElementById('settings-btn');
const settingsOverlay = document.getElementById('settings-overlay');
const settingsClose = document.getElementById('settings-close');
const autostartToggle = document.getElementById('autostart-toggle');
const hotkeyInput = document.getElementById('hotkey-input');
const hotkeyClear = document.getElementById('hotkey-clear');

let isRecordingHotkey = false;

// Load settings
async function loadSettings() {
  const settings = await ipcRenderer.invoke('get-settings');
  autostartToggle.checked = settings.autostart;
  hotkeyInput.value = formatHotkey(settings.hotkey);
}

// Format hotkey for display
function formatHotkey(hotkey) {
  if (!hotkey) return '';
  return hotkey
    .replace('CommandOrControl', 'Ctrl')
    .replace('Control', 'Ctrl')
    .replace('+', ' + ');
}

// Open/close settings
settingsBtn.addEventListener('click', () => {
  settingsOverlay.classList.add('visible');
});

settingsClose.addEventListener('click', () => {
  settingsOverlay.classList.remove('visible');
});

settingsOverlay.addEventListener('click', (e) => {
  if (e.target === settingsOverlay) {
    settingsOverlay.classList.remove('visible');
  }
});

// Autostart toggle
autostartToggle.addEventListener('change', async () => {
  await ipcRenderer.invoke('set-autostart', autostartToggle.checked);
});

// Hotkey recording
hotkeyInput.addEventListener('focus', () => {
  isRecordingHotkey = true;
  hotkeyInput.value = 'Drücke Tastenkombination...';
});

hotkeyInput.addEventListener('blur', async () => {
  isRecordingHotkey = false;
  const settings = await ipcRenderer.invoke('get-settings');
  hotkeyInput.value = formatHotkey(settings.hotkey);
});

hotkeyInput.addEventListener('keydown', async (e) => {
  if (!isRecordingHotkey) return;
  
  e.preventDefault();
  
  // Build hotkey string
  const parts = [];
  if (e.ctrlKey) parts.push('CommandOrControl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  
  // Get the key (ignore modifier keys alone)
  const key = e.key;
  if (!['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
    parts.push(key.length === 1 ? key.toUpperCase() : key);
    
    if (parts.length >= 2) {
      const hotkey = parts.join('+');
      await ipcRenderer.invoke('set-hotkey', hotkey);
      hotkeyInput.value = formatHotkey(hotkey);
      hotkeyInput.blur();
    }
  }
});

// Clear hotkey
hotkeyClear.addEventListener('click', async () => {
  await ipcRenderer.invoke('set-hotkey', '');
  hotkeyInput.value = '';
});
