// Replace the following placeholders with your actual values

const REDIRECT_URI = chrome.identity.getRedirectURL();


let tokens = null;

/**
 * Launches the OAuth2 web authorization flow and retrieves access tokens.
 */
chrome.identity.launchWebAuthFlow(
    {
        url: `https://accounts.google.com/o/oauth2/auth?client_id=${process.env.CLIENT_ID}&response_type=code&scope=https://www.googleapis.com/auth/calendar.readonly&redirect_uri=${REDIRECT_URI}`,
        interactive: true,
    },
    async (redirectUrl) => {
        if (chrome.runtime.lastError) {
            console.error("OAuth failed:", chrome.runtime.lastError.message);
            return;
        }

        const params = new URLSearchParams(new URL(redirectUrl).search);
        const authCode = params.get("code");

        const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                client_id: CLIENT_ID,
                client_secret: process.env.CLIENT_SECRET,
                code: authCode,
                grant_type: "authorization_code",
                redirect_uri: REDIRECT_URI,
            }),
        });

        tokens = await tokenResponse.json();
        if (!tokens || !tokens.access_token) {
            console.error("Failed to retrieve tokens.");
            return;
        }
        fetchAndScheduleEvents();
    }
);


/**
 * Fetches events from the user's Google Calendar and schedules alarms.
 */
async function fetchAndScheduleEvents() {
    const calendarResponse = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${new Date().toISOString()}`,
        {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
        }
    );

    const data = await calendarResponse.json();
    const events = data.items || [];
    console.log(events);


    events.forEach((event) => {
        let reminderTime = 30;
        if (event.reminders && event.reminders.overrides && event.reminders.overrides.length > 0) {
            const firstReminder = event.reminders.overrides[0];
            reminderTime = parseInt(firstReminder.minutes, 10);
        }
        const eventStart = new Date(event.start.dateTime || event.start.date);
        const alertTime = new Date(eventStart.getTime() - reminderTime * 60 * 1000);

        if (alertTime > new Date()) {
            chrome.alarms.create(`event-${event.id}`, { when: alertTime.getTime() });
            chrome.storage.local.set({ [`event-${event.id}`]: event });
        }
    });
}

// Periodically fetch and schedule events every minute
setInterval(() => {
    if (tokens && tokens.access_token) {
        fetchAndScheduleEvents();
    } else {
        console.error("Access token is not available. Unable to fetch events.");
    }
}, 1 * 60 * 1000);


/**
 * Alarm listener for triggering event reminders.
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
    const eventData = await chrome.storage.local.get(alarm.name);
    const event = eventData[alarm.name];
    console.log("alarm");

    if (!event) {
        console.error(`No event data found for alarm: ${alarm.name}`);
        return;
    }

    const prompt = `Based on the provided event, suggest a practical idea or tips to help efficiently plan or execute it. 
    If the event requires a location or purchase, recommend one clear and relevant option. For example:
    - For a meeting, suggest a suitable venue.
    - For purchasing an item, recommend a store or platform.

    Alternatively, if practical tips are more appropriate, provide concise and actionable advice. For example:
    - For a meeting, give three tips for effective participation.
    - For a long event, suggest preparation ideas like eating or staying hydrated.

    Guidelines for responses:
    1. Provide either **one practical idea** or **up to three concise tips**—not both.
    2. Use clear and readable formatting, ensuring a line break (\\n) after each tip.
    3. Do not include the event title or start time in the response.
    4. Avoid using characters like "*" or referring to yourself as an AI agent.
    5. If suggesting a link, write it in plain text (e.g., "example.com").

    Here is the event:
    Title: ${event.summary}
    Start: ${event.start.dateTime || event.start.date}`;

    const aiResponse = await fetch("http://localhost:3000/generateText", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
    });
    const isoDate = event.start.dateTime || event.start.date;
    const [datePart, timePart] = isoDate.split("T");
    const [year, month, day] = datePart.split("-");
    const [hour, minute] = timePart.split(":");
    const formattedDateTime = `${day}.${month}.${year} ${hour}:${minute}`;

    const responseData = await aiResponse.json();
    const newSuggestion = {
        event: {
            summary: event.summary,
            start: formattedDateTime,
        },
        suggestion: responseData || "No suggestions available.",
    };
    saveSuggestion(newSuggestion);


    chrome.windows.create({
        url: "popup/popup.html",
        type: "popup",
        width: 400,
        height: 600,
    });
});

/**
 * Saves a suggestion to Chrome's local storage.
 * @param {Object} suggestion - The suggestion to save.
 */
function saveSuggestion(suggestion) {
    chrome.storage.local.set({ suggestion }, () => {
        console.log("Suggestion saved to storage:", suggestion);
    });
}



