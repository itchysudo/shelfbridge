// ShelfBridge — background service worker.
//
// Only job: open the main app UI in a new tab whenever the user clicks the
// extension's toolbar icon. We deliberately don't use a popup, because the
// app's table view needs more screen real estate than a popup allows.

chrome.action.onClicked.addListener(() => {
    chrome.tabs.create({ url: chrome.runtime.getURL("app/app.html") });
});
