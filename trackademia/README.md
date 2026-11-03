# Trackademia: Wireframe & Interactive Prototype

Trackademia is a smart note-taking app for students. You write notes naturally, Trackademia
spots dates, times, and events ("Dentist appointment tomorrow at 10am"), highlights them inline,
and offers to turn them into Google Calendar reminders that you can review, edit, or remove.

This repository is a **frontend prototype**. It runs entirely in the browser, keeps data in
LocalStorage, and **simulates** Google sign-in and Google Calendar. No real Google account is
contacted and no real calendar event is created.

---

## Quick start

ES modules don't load from `file://` URLs, so serve the folder over HTTP.

**VS Code Live Server**

1. Open the `trackademia/` folder in VS Code.
2. Install the *Live Server* extension (Ritwick Dey).
3. Right-click `index.html` and choose **Open with Live Server**.

**Or use any static server from the `trackademia/` folder:**

```bash
python3 -m http.server 8000      # then open http://localhost:8000
# or
npx serve .                      # then open the URL it prints
```

`index.html` is the entry point. It shows all six screens in a responsive grid, an annotation
legend, and links to each standalone page. Use **Open the app** to start at the sign-in screen.

Tailwind CSS loads from its CDN, so the first load needs an internet connection. The layout itself
comes from the local CSS files, so screens stay usable if the CDN is unreachable.

---

## Folder structure

```
trackademia/
├── index.html                    Presentation page (grid of all screens + legend)
├── onboarding.html               01 Onboarding / sign-in
├── notes.html                    02 Home / notes list
├── new-note.html                 03 New note / capture
├── reminder-confirmation.html    04 Reminder confirmation
├── calendar-success.html         05 Calendar sync success
├── note-detail.html              06 Note detail / manage reminder
├── README.md
├── assets/
│   ├── icons/icons.svg           SVG sprite (all icons, no icon library)
│   └── images/.gitkeep
├── css/
│   ├── styles.css                Design tokens, typography, global styles
│   ├── components.css            Buttons, inputs, cards, badges, toast, modal, bottom sheet
│   ├── layouts.css               Device frame, screen layouts, responsive presentation grid
│   └── wireframes.css            Annotation markers and placeholder styling
└── js/
    ├── app.js                    Screen bootstrap: storage mode, state, device frame, global listeners
    ├── router.js                 URL building and page navigation
    ├── state.js                  Centralized state + sample data
    ├── tailwind-config.js        Shared Tailwind CDN config (classic script)
    ├── components/
    │   ├── status-bar.js         Live clock, signal, Wi-Fi, battery
    │   ├── navbar.js             Back, title or wordmark, search, avatar, more
    │   ├── note-card.js          Note summary card with optional reminder badge
    │   ├── reminder-card.js      Linked reminder display
    │   ├── bottom-sheet.js       Drag handle, header, content, actions, dismiss
    │   ├── toast.js              Success/info/error toast with optional undo
    │   ├── modal.js              Confirm/cancel dialog (returns a Promise)
    │   ├── button.js             Button, icon button, loading state
    │   ├── annotation.js         Numbered markers + per-screen annotation map
    │   ├── note-editor.js        Text area with inline highlight layer
    │   └── reminder-form.js      Title, date, time, calendar fields
    ├── features/
    │   ├── notes.js              Create, update, delete, titles, snippets
    │   ├── reminders.js          Reminder drafts, confirm, edit, remove, formatting
    │   ├── date-detection.js     Deterministic date/time parser
    │   ├── calendar-sync.js      Connection status + reminder ↔ calendar bridge
    │   └── search.js             Note filtering
    ├── services/
    │   ├── storage.js            LocalStorage persistence (trackademia_* keys)
    │   ├── google-calendar.js    Simulated Google OAuth + Calendar API
    │   └── api.js                Simulated network layer (latency, structured responses)
    ├── utils/
    │   ├── date-utils.js         Date math and formatting
    │   ├── validation.js         Reminder, note, and sign-up validation
    │   └── helpers.js            IDs, escaping, icons, DOM helpers
    └── pages/                    One controller per HTML page
        ├── presentation.js  onboarding.js  home.js  new-note.js
        └── reminder-confirmation.js  calendar-success.js  note-detail.js
```

The `js/pages/`, `note-editor.js`, `reminder-form.js` and `tailwind-config.js` files extend the
requested structure. They keep each page's wiring out of the HTML and avoid duplicating the
editor and reminder form across screens.

---

## Technology stack

- HTML5, one file per screen
- Tailwind CSS (Play CDN, preflight disabled) plus local CSS with custom-property design tokens
- Vanilla JavaScript ES modules, no framework and no third-party JS libraries
- Inline SVG icons from a local sprite
- LocalStorage for persistence

---

## Screens

| # | Page | What you can do |
|---|------|-----------------|
| 01 | `onboarding.html` | **Continue with Google** simulates OAuth and connects the calendar. **Sign up with Email** opens a validated name and email form. Both continue to Home. |
| 02 | `notes.html` | Search notes, open the profile sheet (calendar connect/disconnect, annotation toggle, load sample notes, clear all notes, sign out), open a note, create a note with the FAB. Shows an empty state when there are no notes. |
| 03 | `new-note.html` | Type freely. Dates and times are detected as you type, underlined in yellow, and summarized in a "Reminder detected" banner. The microphone simulates dictation, the paperclip adds placeholder attachments, and Save stores the note and opens the confirmation sheet when a reminder is found. `?id=` edits an existing note. |
| 04 | `reminder-confirmation.html` | The New Note screen behind a dimmed overlay with a bottom sheet. Edit the title, date, and time, pick a calendar, then **Add to Google Calendar** or **Dismiss** (button, overlay tap, drag down, or Esc). |
| 05 | `calendar-success.html` | Success toast "Added to Google Calendar" with **Undo**. The note stays editable with the highlight intact, and Save opens Note Detail. |
| 06 | `note-detail.html` | Note body with highlights, metadata, and the linked reminder card. **Edit Reminder** opens a form sheet, **Delete Reminder** confirms and offers undo, and **Open in Google Calendar** asks before opening the event's day in a new tab. Notes without a reminder offer "Review detected reminder" or "Add reminder". |

Every screen shows numbered annotation markers. The legend at the bottom of `index.html`
explains each number, and you can hide the markers with the **Show annotations** toggle
(on the presentation page or in the Home profile sheet).

### Presentation mode vs. app mode

- **App mode** (opening a page directly): data lives in `localStorage` and persists across reloads.
- **Presentation mode** (frames on `index.html`, URL has `?embed=1`): each frame is a fully
  interactive screen, but it uses a `sessionStorage` sandbox so playing with the wireframes never
  changes your app data. The sandbox resets each time `index.html` loads, or when you click
  **Restart wireframes**. The frames share the sandbox, so a note created in one frame shows up
  in the Home frame.

---

## JavaScript architecture

Dependencies only point downward:

```
HTML page → js/pages/*.js → app.js / router.js → features/ → state.js → services/ → utils/
                         ↘ components/ (presentational, reused everywhere) → utils/
```

- **state.js** holds the current user, notes, selected note, active reminder draft, connected
  calendar, connection status, search query, current screen, and UI settings. `setState()`
  persists the changed slices and notifies subscribers. `initState()` restores everything after a
  reload and seeds the three sample notes on first run.
- **features/** hold business logic with no DOM access. For example, `reminders.confirmReminder()`
  validates the draft, calls `calendar-sync`, and writes the linked reminder back onto its note.
- **components/** render UI and receive already-formatted values. They never touch storage.
- **services/** are the only modules that talk to storage or "external" systems.

### Date detection (`features/date-detection.js`)

`detectReminder(text)` returns:

```js
{
  found: true,
  date: '2026-11-04', time: '10:00',
  title: 'Dentist appointment',          // words around the date
  expression: 'tomorrow at 10am',
  ranges: [{ start: 20, end: 36, text: 'tomorrow at 10am' }],  // for highlighting
  hasDate: true, hasTime: true, confidence: 0.9, matches: [...]
}
```

It understands `today`, `tonight`, `tomorrow`, `day after tomorrow`, `in 3 days`, `in 2 weeks`,
weekdays (`Friday`, `on Friday`, `next Monday`), `November 10`, `Nov 10th`, `10 November`,
`11/10`, and times like `10am`, `3:30 pm`, `at 14:30`, `noon`, and `midnight`. A bare weekday
means its next occurrence including today, and `next <weekday>` means the first one after today.
To swap in an AI extraction service later, keep the same return shape and replace the function body.

### Simulated Google Calendar (`services/google-calendar.js`)

| Function | Future real call |
|----------|------------------|
| `connectAccount()` | Google Identity Services OAuth (`calendar.events` scope) |
| `listCalendars()` | `GET /users/me/calendarList` |
| `createEvent(reminder)` | `POST /calendars/{id}/events` |
| `updateEvent(id, reminder)` | `PATCH /calendars/{id}/events/{eventId}` |
| `deleteEvent(id)` | `DELETE /calendars/{id}/events/{eventId}` |
| `openEvent(reminder)` | The event's `htmlLink` |

Each function resolves through `services/api.js` after a short artificial delay, with the shape
`{ ok, data, error, meta: { simulated: true, label, latency, timestamp } }`. The UI always labels
these actions as simulated.

### Storage keys

| Key | Contents |
|-----|----------|
| `trackademia_notes` | Array of notes (each may embed a `reminder`) |
| `trackademia_reminders` | Derived index of reminders with their `noteId` |
| `trackademia_user` | Signed-in user |
| `trackademia_settings` | Selected note, reminder draft, calendar, connection status, search query, annotation toggle, one-time flash message |

To start over, use **Reset app data** on `index.html`, or clear these keys in DevTools.

---

## Extending the prototype

- **Real Google Calendar**: implement the functions in `services/google-calendar.js` with Google
  Identity Services and Calendar API v3, and keep the response shape. Nothing else needs to change.
- **AI date extraction**: replace the body of `detectReminder()` (it can become async; update the
  two call sites in `pages/new-note.js` to `await`).
- **Backend persistence**: move `services/storage.js` to `fetch` calls through `services/api.js`.
- **A new screen**: add `my-screen.html` (copy the head of any page), a controller in `js/pages/`
  that calls `bootstrapScreen('myScreen', render)`, a route in `router.js`, and an entry in
  `ANNOTATIONS` in `components/annotation.js`. The legend picks it up automatically if you also add
  it to `SCREENS` in `pages/presentation.js`.
- **Design changes**: edit the tokens at the top of `css/styles.css`.
