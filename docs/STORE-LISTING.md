# Store listing

Copy-paste source for the Amazon Developer Console, Phase 4 of "Plan to v1.0" in `docs/PUBLISHING.md`. Drafted 2026-10-19 for v1.0.0, submitted with it on 2026-10-20; v1.0.0 has been live on the Amazon Appstore since 2026-10-26: https://www.amazon.com/dp/B0HNR62RQ9. Keep this file in step with the console when the listing changes, and add release notes for each new version. Rules for every field: don't mention "Vega"; nothing that hints at piracy; Jellyfin's name is fine ("works with Jellyfin"), its logo and wordmark are not.

## Title
Caravela

## Short description
A client for your own Jellyfin media server: browse and play your movies and TV shows on Fire TV.

## Long description
Caravela brings the movies and TV shows on your own Jellyfin server to Fire TV.

You need a Jellyfin server (version 12.0 or later) that you run yourself or that someone shares with you. Caravela doesn't come with any content and doesn't sell or stream anything on its own.

- Sign in with Quick Connect, so you don't type a password with the remote, or with a password. Several servers and users, with auto-login.
- Home shows your libraries, Continue watching, Next up and the latest additions.
- Browse movies and shows with sorting, filters and a letter picker.
- Details pages for movies, series, seasons, episodes and people, with cast, next up and similar titles.
- Plays what your Fire TV supports directly and lets your server convert the rest.
- Subtitles and audio track switching, a seek bar with previews, chapters, playback speed.
- Alexa voice controls: "pause", "play", "skip forward 30 seconds", "rewind 10 seconds".
- Search across your movies, shows and episodes.
- Your progress and watched status stay in sync with your server and your other Jellyfin apps.

Caravela is an unofficial client and is not affiliated with the Jellyfin project. It is free software (GPL-2.0-or-later); the source code is at github.com/melojms/caravela.

Caravela collects nothing: no analytics, no ads, no tracking. It talks only to the server you add.

## Product feature bullets
- Watch the movies and TV shows on your own Jellyfin server
- Quick Connect sign-in, several servers and users
- Subtitles, audio tracks, chapters and seek previews
- Alexa voice controls for playback
- Progress synced with your other Jellyfin apps
- No ads, no tracking, free and open source

## Keywords
jellyfin, media server, home media, movies, tv shows, personal library, self-hosted, open source

## Category and audience
- Category: Video (or Entertainment, whichever the console offers for media players).
- Price: free. No in-app purchases. No ads.
- Target audience: not aimed at children (matches the privacy policy).

## Release notes (1.0.0)
First release.

## Reviewer notes (testing instructions)
Caravela needs a Jellyfin server. Please use Jellyfin's public demo server:

1. Open Caravela. On "Add server", enter `https://demo.jellyfin.org/stable` and press Connect.
2. Pick the user `demo`. The app first offers Quick Connect: choose **Use password** (to the right). The password field opens with the on-screen keyboard; press Back to close it, leave the password empty, then press Down to **Sign in** and select it.
3. Home shows the demo server's movies and the series Pioneer One. Every title on the demo server plays.

Notes:
- The demo server is shared and public; it is occasionally down for maintenance (it then answers with a maintenance page, and Caravela shows "Can't reach Stable Demo"). Please retry a little later.
- The demo server doesn't serve seek-bar preview images (it answers those requests with a bot-check page), so the seek bar shows times without thumbnails there. With a regular Jellyfin server the previews show.
- Disconnecting the display during playback (HDMI unplug, switching TV input, turning the TV off): the operating system closes the app as the display disconnects, before the app is told. When you come back, open Caravela and press Resume on the title: playback continues from where it stopped (within a few seconds).
- Home, another app, the screensaver: playback stops and the position is saved; coming back shows the player paused at the same spot.


## Privacy policy
URL: https://melojms.github.io/caravela/privacy (source `site/privacy/index.html`).

Checked 2026-10-19 against the code: it matches what `src/auth/store.ts` keeps (servers, users with tokens, auto-login choice, device ID), and that library sort/filters are saved on the user's server, not on the device. It names the device name the app sends, "Fire TV" (`DEVICE_NAME` in `src/api/client.ts`; was "Fire TV (Vega)" until R7-l, 2026-10-20). The live page shows the new text (`main` pushed 2026-10-20).

Data-privacy questions in the console: no personal data collected by the developer; data stays on the device and the user's own server.

## Content rating
No content of its own; the user's server provides everything. Answer "none" to violence, sex, language, gambling, etc.; it has unrestricted web access only to the user's server (no browser). If the questionnaire asks about user-generated or streamed content, say the app plays media from the user's own server.

## Images
Confirmed 2026-10-20 against Amazon's [Appstore Details → Images and videos](https://developer.amazon.com/docs/app-submission/appstore-details.html#images-and-videos). Made in S4 (`docs/tasks/s4-store-images.md`); the files are in `../caravela-wt/store-assets/`, outside the repo. `scripts/store-images.sh <dir>` regenerates the icons and the background.

| Asset | Size and rules | File |
|---|---|---|
| Large icon | 512×512 PNG, transparency allowed | `assets/image/app_icon.png` |
| Small icon | 114×114 PNG, transparency allowed | `small-icon-114.png` (the Sail alone; the wordmark is unreadable at that size) |
| Fire TV app icon | 1280×720, no transparency; logo and title inside the centred 882×448 safe area | `firetv-icon-1280x720.png` |
| Fire TV background | 1920×1080 JPG/24-bit PNG, no transparency, no logos or titles; subject inside 1214×830, ideally right | `firetv-background-1920x1080.png` |
| Fire TV screenshots | 3–10 at 1920×1080, JPG/24-bit PNG, no transparency | `screenshot-1-home.png`, `-2-movie-details`, `-3-episode-details`, `-4-player`, `-5-library` |
| Tablet screenshots | 3–10; 1920×1080 is an accepted size | the same five |
| Promotional image (1024×500), video | optional | skipped (the user, 2026-10-20) |

The file extension must match the real type. Screenshots are from the demo server only. Left out on purpose: the user picker (the demo user's avatar is the Jellyfin logo; it still shows ~40 px in Home's toolbar, accepted) and Pioneer One's series page (its overview mentions BitTorrent).
