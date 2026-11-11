# F-Droid submission notes

Alpha is prepared for submission to the official F-Droid repository as the
package `com.codewithpb11.alphabot`.

## What F-Droid builds

F-Droid can rebuild Alpha from the public [`v1.4.0` source tag](https://github.com/codewithpb11/Alpha-Bot/tree/v1.4.0) without access to a developer signing key:

```sh
npm ci
npm run mobile:fdroid
cd android
# Use JDK 21. Alpha's Android wrapper targets Java 21; Gradle 8.14 does not
# support JDK 25.
./gradlew assembleRelease
```

`mobile:fdroid` deliberately avoids the Capacitor CLI. It copies the checked-in
web source and the pinned, freely licensed dependencies into the Android
assets directory, then Gradle creates an unsigned release APK for F-Droid to
sign. The normal `mobile:sync` command remains available for local Capacitor
development.

## Release and metadata files

- Store description and changelog: `fastlane/metadata/android/en-US/`
- Candidate F-Droid build recipe: `fdroid/com.codewithpb11.alphabot.yml`
- Privacy policy: [PRIVACY.md](PRIVACY.md)
- Licence and engine-source record: [LICENSE](LICENSE),
  [OPEN_SOURCE_NOTICES.md](OPEN_SOURCE_NOTICES.md), and
  [THIRD_PARTY_SOURCES.md](THIRD_PARTY_SOURCES.md)

The F-Droid review must build the exact tagged source itself. The metadata
explicitly records the bundled Stockfish.js WebAssembly file and its matching
GPL source so it is not hidden from reviewers. If maintainers require it, the
next step is to rebuild that WebAssembly engine within the F-Droid build
environment using the pinned Stockfish.js source and Emscripten.

## Existing Gumroad installs

F-Droid normally signs releases with its own signing key. Consequently, a
device with the earlier Gumroad-signed Alpha APK may need to uninstall that APK
before installing the first F-Droid version. Users should re-import any PGNs
or game archives they want to keep first. Future updates installed through
F-Droid will update normally.

## Submitting

After the source tag is public, open a merge request to
[`fdroid/fdroiddata`](https://gitlab.com/fdroid/fdroiddata) that adds the
candidate recipe. F-Droid's review can adjust the recipe, especially its
toolchain and engine-rebuild details.
