const REDIRECT_URI = chrome.identity.getRedirectURL();

let tokens = null;
let CLIENT_ID = null;
let CLIENT_SECRET = null;

/**
 * Fetches secrets from the proxy server.
 */
async function fetchSecrets() {
    const response = await fetch("http://dailyassistantai.de.r.appspot.com/getSecrets");
    if (!response.ok) {
        console.error("Failed to fetch secrets");
        return;
    }
    const { CLIENT_ID: fetchedClientId, CLIENT_SECRET: fetchedClientSecret } = await response.json();
    CLIENT_ID = fetchedClientId;
    CLIENT_SECRET = fetchedClientSecret;
}

/**
 * Launches the OAuth2 web authorization flow and retrieves access tokens.
 */
async function authenticateUser() {
    await fetchSecrets(); // Ensure secrets are loaded before starting OAuth flow
    if (!CLIENT_ID || !CLIENT_SECRET) {
        console.error("CLIENT_ID or CLIENT_SECRET is not available.");
        return;
    }

    chrome.identity.launchWebAuthFlow(
        {
            url: `https://accounts.google.com/o/oauth2/auth?client_id=${CLIENT_ID}&response_type=code&scope=https://www.googleapis.com/auth/calendar.readonly&redirect_uri=${REDIRECT_URI}`,
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
                    client_secret: CLIENT_SECRET,
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
}

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

    if (!event) {
        console.error(`No event data found for alarm: ${alarm.name}`);
        return;
    }

    const prompt = `
    Your task is to provide personalized and highly practical suggestions tailored to the given event details. Focus on delivering ideas, tips, or recommendations that enhance planning, execution, or enjoyment of the event. The suggestions should be relevant to the event type and context, either offering technical, logistical, or creative insights.

    ### Guidelines for Responses:
    1. **Precision and Relevance**:
        - Focus on the specific nature of the event to ensure your suggestions are useful and practical.
        - Avoid generic advice—tailor each response to the context provided.

    2. **Formatting**:
        - Offer **one clear recommendation** or **up to three concise tips**—not both.
        - Ensure each tip is written as a clear and independent statement, with a line break (\\n) after each.

    3. **Style and Tone**:
        - Use a friendly and informative tone.
        - Avoid complex language; keep responses clear and actionable.
        - Refrain from including phrases like "as an AI" or unnecessary self-references.

    4. **Content**:
        - When a location, activity, or purchase is relevant, suggest one suitable and accessible option.
        - If technical or professional events are involved, prioritize actionable advice, resources, or tools for improvement.
        - Inject creativity and thoughtfulness when appropriate, such as suggesting games for social gatherings or motivational tips for challenging events.

    5. **Exclusions**:
        - Do not include the event's title or time in your response.
        - Avoid formatting with symbols (e.g., "*") and include links as plain text (e.g., "example.com").

    ### Examples of Suggestions:
    - **For a dinner with friends**: Recommend a cozy restaurant, suggest a fun group activity (e.g., trivia night), or provide a playful invitation idea to share with the group.
    - **For studying algorithms**: Recommend practice platforms (e.g., leetcode.com), list must-know topics, or offer study tips like breaking problems into smaller parts.
    - **For a long meeting**: Suggest preparation tips like bringing snacks or staying hydrated, or recommend productivity tools like notetaking apps.

    Now, based on this event, provide your response:
    
    Title: ${event.summary}
    Start: ${event.start.dateTime || event.start.date}`;

    const aiResponse = await fetch("http://dailyassistantai.de.r.appspot.com/generateText", {
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
        suggestion: responseData.response || "No suggestions available.",
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

// Initialize the authentication process
authenticateUser();
