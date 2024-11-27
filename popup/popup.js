console.log("popup.js loaded");

document.addEventListener("DOMContentLoaded", () => {
    const titleElement = document.getElementById("event-title");
    const startElement = document.getElementById("event-start");
    const suggestionElement = document.getElementById("event-suggestion");

    // Function to update popup content
    function updatePopupContent(data) {
        if (data) {
            const { event, suggestion } = data;
            titleElement.textContent = event?.summary || "No Title";
            startElement.textContent = event.start;
            suggestionElement.textContent = suggestion || "No Suggestions";
        } else {
            titleElement.textContent = "No Events Found";
            startElement.textContent = "";
            suggestionElement.textContent = "";
        }
    }

    // Fetch the latest suggestion from storage when the popup opens
    chrome.storage.local.get("suggestion", (data) => {
        updatePopupContent(data.suggestion);
    });
});
