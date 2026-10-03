var statusEl = document.getElementById('status')
var actionsNotInstalled = document.getElementById('actions-not-installed')
var actionsInstalled = document.getElementById('actions-installed')
var migrationCopy = document.getElementById('migration-copy')
var installBtn = document.getElementById('install-btn')
var finishBtn = document.getElementById('finish-btn')
var platform = getMigrationPlatform(navigator.userAgent)
var migrationUrl = getMigrationUrl(platform)

installBtn.href = migrationUrl
finishBtn.href = migrationUrl

if (platform === 'chromeos') {
  migrationCopy.textContent = 'ChromeOS no longer launches this old app, so you can remove it now. Choose the 200 OK Android app or ChromeOS Linux setup separately.'
} else if (platform === 'windows' || platform === 'macos' || platform === 'linux') {
  migrationCopy.textContent = 'Chrome no longer runs this old app, so you can remove it now. Install the 200 OK desktop server and its Chrome extension separately.'
}

// Check if new extension is installed
chrome.runtime.sendMessage(NEW_EXTENSION_ID, {type: 'ping'}, function(response) {
  if (chrome.runtime.lastError) {
    statusEl.textContent = '200 OK extension not yet installed'
    statusEl.className = 'status not-installed'
  } else if (response && response.installed) {
    statusEl.textContent = '200 OK extension installed (v' + response.version + ')'
    statusEl.className = 'status installed'
    actionsNotInstalled.classList.add('hidden')
    actionsInstalled.classList.remove('hidden')
  } else {
    statusEl.textContent = '200 OK extension not yet installed'
    statusEl.className = 'status not-installed'
  }
})

document.getElementById('uninstall-btn').addEventListener('click', function() {
  chrome.management.uninstallSelf({ showConfirmDialog: true }, function() {
    if (chrome.runtime.lastError) {
      statusEl.textContent = 'Chrome could not remove this app: ' + chrome.runtime.lastError.message
      statusEl.className = 'status not-installed'
    }
  })
})

document.getElementById('dismiss-btn').addEventListener('click', function() {
  chrome.storage.local.set({
    migrationSnoozedUntil: Date.now() + MIGRATION_REMINDER_MS,
    migrationLastPromptedAt: Date.now()
  }, function() {
    window.close()
  })
})

document.getElementById('stop-btn').addEventListener('click', function() {
  chrome.storage.local.set({ migrationRemindersDisabledAt: Date.now() }, function() {
    chrome.alarms.clear('migration')
    chrome.notifications.clear('deprecation')
    window.close()
  })
})
