var NEW_EXTENSION_ID = 'lpkjdhnmgkhaabhimpdinmdgejoaejic'
var MIGRATION_URL_BASE = 'https://ok200.app/migrate'
var MIGRATION_REMINDER_DAYS = 7
var MIGRATION_REMINDER_MS = MIGRATION_REMINDER_DAYS * 24 * 60 * 60 * 1000
var MIGRATION_ALARM_MINUTES = MIGRATION_REMINDER_DAYS * 24 * 60

function getMigrationPlatform(userAgent) {
    var agent = userAgent || ''
    if (/CrOS/i.test(agent)) return 'chromeos'
    if (/Android/i.test(agent)) return 'android'
    if (/Windows/i.test(agent)) return 'windows'
    if (/Macintosh|Mac OS X/i.test(agent)) return 'macos'
    if (/Linux|X11/i.test(agent)) return 'linux'
    return 'other'
}

function getMigrationUrl(platform) {
    var value = platform || 'other'
    return MIGRATION_URL_BASE + '?ref=legacy-app&platform=' + encodeURIComponent(value)
}

function getMigrationNotificationCopy(platform, extensionInstalled) {
    if (extensionInstalled) {
        return {
            title: 'Remove the old Web Server app',
            message: '200 OK extension found. Remove this old app now. Finish setup: ok200.app/migrate'
        }
    }

    if (platform === 'chromeos') {
        return {
            title: 'Web Server for Chrome has ended',
            message: 'This old app no longer launches. Remove it now. Set up 200 OK: ok200.app/migrate'
        }
    }

    if (platform === 'windows' || platform === 'macos' || platform === 'linux') {
        return {
            title: 'Web Server for Chrome has ended',
            message: 'Chrome no longer runs this old app. Remove it now. Set up 200 OK: ok200.app/migrate'
        }
    }

    return {
        title: 'Web Server for Chrome has ended',
        message: 'Remove this old app now. Set up 200 OK Web Server: ok200.app/migrate'
    }
}

function isMigrationReminderDue(lastPromptedAt, snoozedUntil, now) {
    var currentTime = now || Date.now()
    if (snoozedUntil && currentTime < snoozedUntil) return false
    if (!lastPromptedAt) return true
    return currentTime - lastPromptedAt >= MIGRATION_REMINDER_MS
}
