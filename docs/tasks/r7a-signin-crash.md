# Task R7a: app drops to the launcher after signing in

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-r7a (branch `task/r7a-signin-crash`).

**This task has two phases. Phase 1 is investigation only; then stop and wait.** The user's rule: describe the approach and wait for approval before writing code. So after Phase 1, print your findings and the proposed fix, and **wait for the user's (or the orchestrator's) go-ahead in this pane** before changing any source file.

Part of "Plan to v1.0" in `docs/PUBLISHING.md` (Phase 3 smoke pass: "add server, sign in…" is the first thing an Appstore reviewer does). `R7…` tasks fix things that would fail review.

## The problem
After a fresh install, signing in sends the app back to the launcher. Relaunching shows the user signed in, so the sign-in itself works and the app dies (or exits) during the switch from the auth screens to Home. What we know (`docs/HANDOFF.md`, Status / Follow-ups):
- **R4 (2026-10-16), simulator:** every run, signing in as `demo` with an empty password on the **Password** screen after a fresh install (`run-app`) → launcher.
- **11e, simulator:** Settings › Switch user and Quick Connect › Use password sent the app to the launcher every time ("the known screens-library crash").
- An older note: "the simulator crashes (Vega screens library) going from Quick Connect to Home; relaunching works. **Not on the TV.**"
- Another: "twice after a fresh-install password sign-in the app went back to the launcher".
Nobody has confirmed it's the screens library, or checked it on the Fire TV on the current `main`. So the "known" label is unproven.

## Phase 1: reproduce and find the cause (no source changes)
1. Read `src/navigation/RootNavigator.tsx` (how the auth stack and the signed-in stack swap), `src/auth/SessionContext.tsx`, `src/screens/auth/PasswordScreen.tsx`, `QuickConnectScreen.tsx`, `LaunchScreen.tsx`, and the native-stack / screens versions in `package.json`.
2. **Simulator:** `npm ci`, `scripts/setup-shaka.sh /home/melojms/projects/melojms-git/caravela-wt/shaka-build/shaka-rel`, `npm run build:release`, then `vega run-app build/x86_64-release/caravela_x86_64.vpkg com.melojms.caravela.main -d VirtualDevice` (wipes storage). Start the device log **outside** any `flock` (`vega exec vda -s emulator-5554 shell loggingctl log -f > <scratchpad>/sim.log &`, kill it by pid after). Add the demo server `demo.jellyfin.org/stable`, pick `demo`, sign in on Password with an empty password. Note whether it drops, and find the crash in the log: the JS error / native stack, `lcm-server` lines, `crashed with signal …`, `AppNotResponding`. Repeat 2–3 times. Also try the other paths: Quick Connect → Use password → sign in, and Settings › Switch user → pick the user.
3. **Fire TV** (`192.168.50.124:5555`; rules in `docs/HANDOFF.md` "How we work": every install/input/screenshot inside `flock /tmp/caravela-device.lock -c '…'`, log capture outside it, `vega exec vda connect 192.168.50.124:5555` if it's missing): same flow with `build/armv7-release/caravela_armv7.vpkg` and `run-app … -d 192.168.50.124:5555` (this wipes the TV's sign-in; that's expected). Use the demo server and `demo` there too. Record whether it happens on the TV.
4. Find the cause in the code/log (a JS exception, a native crash in react-native-screens when the navigator's screens are swapped, a `BackHandler`/`exitApp` call, an unmount race, etc.). Narrow it down: e.g. does it still happen with a Debug build and Metro (better stack), with a delay before the swap, or with `navigation.reset` instead of swapping navigators? Small throwaway experiments in the worktree are fine; revert them before reporting.
5. **Report and stop:** whether it reproduces (simulator / TV, how often, which paths), the log lines that show the cause, the root cause, and the proposed fix with the files it touches (≤3 source files), plus the test you'd write to reproduce it. Then wait.

## Phase 2: fix (only after approval)
- Write a failing test that reproduces it first (where it's reproducible in Jest), then the fix.
- `npm run lint` (0 errors), `npx tsc --noEmit`, full `npm test` (rerun known flaky specs alone), `npm run build:release`.
- Re-run the sign-in paths from Phase 1 on the simulator **and** the Fire TV, 3 times each for Password sign-in after a fresh install: no drop to the launcher, Home shows. Screenshots and logs in the scratchpad, not the repo (they show server addresses).
- Afterwards leave the Fire TV signed in as `demo` on the demo server (or say what state you left it in).
- Update the HANDOFF Follow-ups notes that this fixes only in your report (the orchestrator edits HANDOFF.md); README only if user-visible.

## Rules
- Phase 1 changes no committed files. Phase 2: only the approved files plus this brief. One commit, no Co-Authored-By or Claude-Session trailers. Don't push, don't merge.
- Never use or ask for `melojms`'s password; sign in as `demo` (empty password). Don't change anything on the demo server.
