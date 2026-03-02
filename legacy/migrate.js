// IMPORTANT: This file has a twin in ~/code/jstorrent/archive/legacy-app/migrate.js
// Any changes here should almost certainly be mirrored there (and vice versa). Ask before proceeding.

var NEW_EXTENSION_ID = 'lpkjdhnmgkhaabhimpdinmdgejoaejic'
var statusEl = document.getElementById('status')
var actionsNotInstalled = document.getElementById('actions-not-installed')
var actionsInstalled = document.getElementById('actions-installed')

// Check if new extension is installed
chrome.runtime.sendMessage(NEW_EXTENSION_ID, {type: 'ping'}, function(response) {
  if (chrome.runtime.lastError) {
    statusEl.textContent = 'New extension not yet installed'
    statusEl.className = 'status not-installed'
  } else {
    statusEl.textContent = 'New extension installed (v' + response.version + ')'
    statusEl.className = 'status installed'
    actionsNotInstalled.classList.add('hidden')
    actionsInstalled.classList.remove('hidden')
  }
})

document.getElementById('uninstall-btn').addEventListener('click', function() {
  chrome.management.uninstallSelf({ showConfirmDialog: true })
})

document.getElementById('dismiss-btn').addEventListener('click', function() {
  chrome.runtime.getBackgroundPage(function(bg) {
    var snoozeMs = (bg.MIGRATE_SNOOZE_HOURS || 24) * 60 * 60 * 1000
    chrome.storage.local.set({ migrationSnoozedUntil: Date.now() + snoozeMs }, function() {
      window.close()
    })
  })
})

document.getElementById('keep-btn').addEventListener('click', function() {
  window.close()
})
