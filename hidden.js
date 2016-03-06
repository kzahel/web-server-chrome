document.addEventListener("DOMContentLoaded",function(){
    document.getElementById('configure').addEventListener('click',function(){
        chrome.runtime.getBackgroundPage(function(bg){
            bg.hidden_click_configure()
            //chrome.app.window.current().close()
        })
    })
})