chrome.runtime.getBackgroundPage( function(bg) {
    window.bg = bg;

    document.getElementById('status').innerText = 'OK'
})