# Social Health

A privacy-preserving personal social graph with an interpretable Social Health score: an
Android app for reflecting on social connectedness. Everything stays on the device in an
encrypted database; there is no server or account. CSM500 MSc project.

## Layout

```
apps/mobile             Expo / React Native app (Android): graph, screens, encrypted storage
packages/score-engine   Pure TypeScript scoring model (no React Native imports)
packages/synth          Synthetic scenarios, scenario builder and fast-check arbitraries
scripts/                Helper scripts (e.g. scenario avatars)
docs/model-spec.md      Scoring formula, properties, orderings and reference values
docs/threat-model.md    Assets, actors, threats and mitigations
docs/evaluation/        Sensitivity and ablation analysis (generated)
docs/report/            Final report (final/report.html) and scenario screenshots
```

## Requirements

- Node.js 22 and npm
- JDK 17 (Android Studio's bundled JDK works)
- Android SDK with platform 36 and build tools (installed with Android Studio)
- `adb` and `emulator` on the `PATH`

```sh
export ANDROID_HOME="$HOME/Library/Android/sdk"     # macOS default
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
```

## Install and test

```sh
npm install
npm test                # 284 unit, property and scenario tests
npm run typecheck
npm run sensitivity     # regenerates docs/evaluation/score-sensitivity.md
```

## Building the Android app

The app uses native modules (SQLCipher, Skia, quick-crypto), so it runs as a development or
release build, not in Expo Go. Generate the native project from `apps/mobile/app.json`:

```sh
cd apps/mobile
npx expo prebuild --platform android      # (re)generates apps/mobile/android
```

Re-run `prebuild` after changing the app name, icon or native settings in `app.json`.

### Release APK (recommended for testing)

```sh
cd apps/mobile/android
./gradlew assembleRelease
# output: app/build/outputs/apk/release/app-release.apk
```

If a build reuses an old JavaScript bundle (for example after changing only `packages/*`),
force a full rebuild with `./gradlew assembleRelease --rerun-tasks`.

### Install on a physical phone or tablet

1. On the device, enable **Developer options** (tap *Build number* seven times under
   *Settings → About*) and turn on **USB debugging**.
2. Connect it by USB and accept the "Allow USB debugging" prompt.
3. Find its serial and install; `-r` keeps the existing app data:

```sh
adb devices
adb -s <serial> install -r apps/mobile/android/app/build/outputs/apk/release/app-release.apk
```

Some phones also ask you to approve the install on screen.

### Install on an emulator

Create a virtual device in Android Studio (*Device Manager → Create device*), for example a
Pixel Tablet with an Android 16 (API 36) image, then:

```sh
emulator -list-avds
emulator -avd <name> &
adb wait-for-device
adb -s emulator-5554 install -r apps/mobile/android/app/build/outputs/apk/release/app-release.apk
```

Useful settings while testing:

```sh
adb -s emulator-5554 shell cmd uimode night yes             # dark mode
adb -s emulator-5554 shell cmd window user-rotation lock 0  # natural orientation
```

If a tablet emulator shows the app rotated inside a landscape screen, check `hw.lcd.width`
and `hw.lcd.height` in `~/.android/avd/<name>.avd/config.ini` (portrait: width 1600,
height 2560) and cold-boot it with `emulator -avd <name> -no-snapshot-load`.

### Development build with live reload

```sh
cd apps/mobile
npm run android         # builds and installs a debug app on the connected device or emulator
npm start               # Metro bundler for an installed debug build
```

## Trying it with sample data

Open **People and score → Engine preview (synthetic scenarios)**, pick a scenario and, on an
empty install, use it as your data. Scenarios can also be viewed without touching your data:

```sh
adb shell am start -a android.intent.action.VIEW -d "socialgraph://graph?scenario=parentOfThree"
adb shell am start -a android.intent.action.VIEW -d "socialgraph://score?scenario=parentOfThree"
```

Scenario ids include `doctor`, `teacher`, `waitress`, `lawyer`, `careHome`, `student`,
`parentOfThree`, `newInTown` and `circles`.

## Method

The score's properties and scenario orderings were committed before the formula (see the
first commit) and act as its specification. If a candidate formula fails one, the formula is
changed rather than the test.
