# lofi lifts

A lofi workout tracker. Log sets, it finds your PRs. Plain HTML/CSS/JS — no build step, no dependencies, no account.

## Run it

Needs Node (any recent version). No install step — there are no dependencies.

```bash
node server.js
```

Prints a `localhost` URL and a `network:` URL. Phone on the same Wi-Fi → open the network one. `Ctrl+C` stops it. Set `PORT` to use something other than 8080.

## Starting five

back squat · bench press · deadlift · overhead press · barbell row

Adding more: append to the `EXERCISES` array at the top of [app.js](app.js). Nothing else needs to change — every view is driven off that list.

## How it works

- **Data lives in the browser's localStorage**, keyed `lofi-lifts.v1`. Per-device: your phone and your laptop keep separate logs. Nothing is sent anywhere.
- **Sets are stored flat** — `{id, date, ex, w, r, u, ts}`. Sessions and PRs are derived by grouping, never stored. Deleting a set recomputes everything cleanly.
- **PRs are estimated 1RM** via Epley (`w × (1 + reps/30)`), normalized to lb so lb/kg sets compare honestly. A set is flagged PR if it beat the running best *at the time it was logged*. The first set of a lift is a baseline, not a record.
- **Units** are stored per set, so switching lb↔kg never rounds your history into drift.

## Features

| | |
|---|---|
| Log tab | exercise chips, hold-to-repeat weight steppers, prefilled with your last session, "top set to beat" reference line, back-date with the arrows |
| PRs tab | top set, est. 1RM, all-time volume per lift |
| History | sessions newest-first, collapsible, PRs highlighted |
| Rest timer | 90s, auto-starts on log, dismissable |
| Export | full JSON dump; "erase everything" wipes the device |

Haptic buzz on log and a longer pattern on a PR (Android/Chrome; iOS Safari ignores `navigator.vibrate`).

## Security posture

Zero third parties. No API keys, no tokens, no accounts, no analytics, no external requests of any kind. The CSP in [index.html](index.html) pins everything to `'self'` with `frame-src 'none'` and `object-src 'none'` — the page cannot reach off-origin even if a future edit tried to.

The server is a read-only static file server bound to the LAN. It stores nothing; all data is per-device localStorage.

### Spotify: evaluated and rejected

A Spotify embed was built and removed. The blocker is that **embeds only play 30-second previews on mobile browsers** — full playback requires Premium *and* a logged-in desktop browser, which is precisely not this app's use case. A preview player that cuts out every 30 seconds mid-set is worse than no player.

If it's ever revisited, the only architecture that yields full tracks on a phone is **Spotify Connect** — the app acts as a remote (now playing / skip / pause) while the native Spotify app produces audio. That requires OAuth, and as of 27 Nov 2025 Spotify [dropped implicit grant and all plain-HTTP redirect URIs](https://developer.spotify.com/blog/2025-02-12-increasing-the-security-requirements-for-integrating-with-spotify) except loopback literals (`http://127.0.0.1`). Serving at `http://<lan-ip>:8080` means Spotify rejects the redirect URI outright, so it would need HTTPS first. Non-negotiables if attempted: Authorization Code **with PKCE**, and never a client secret in client-side code. The Web Playback SDK is not an option — it doesn't run on mobile browsers at all.

## Notes

- Add to Home Screen on iOS gets you a fullscreen icon — but the server has to be running on the laptop for it to load.
- Dark mode follows the system setting.
