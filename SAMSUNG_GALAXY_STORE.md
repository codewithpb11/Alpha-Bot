# Samsung Galaxy Store release pack

This file contains the non-sensitive material needed to create Alpha's Galaxy
Store listing. It does not replace Samsung's seller verification or the final
submission steps.

## Release identity

- **App name:** Alpha – Local Chess Analysis
- **Package ID:** `com.codewithpb11.alphabot`
- **Version:** 1.4.2
- **Version code:** 7
- **Category:** Games / Board
- **Licence:** GPL-3.0-only
- **Listing type:** One-time paid download (not a subscription)
- **Launch base price:** US$1.49
- **India launch price:** ₹149, if this price is available in Seller Portal
- **Privacy-policy URL:**
  `https://github.com/codewithpb11/Alpha-Bot/blob/main/PRIVACY.md`
- **Support URL:** `https://github.com/codewithpb11/Alpha-Bot/issues`

Before submission, add an email address you control to the Seller Portal's
support-email field. Do not put a personal address into this public repository
unless you want it to be public.

## Store copy

### Short description

Local chess analysis, full game review, and private PGN coaching.

### Full description

Alpha is a local-first chess-analysis app for Android. Explore any position,
load PGNs, review complete games, and ask Alpha for engine-backed guidance.

Features:

- Analyze positions with an on-device Stockfish engine at depth 20.
- Compare one to four candidate lines and inspect principal variations.
- Import local PGN files or public Chess.com and Lichess game archives.
- Review every move in a selected game with accuracy, phase, and turning-point
  feedback.
- Build an all-games profile to find opening habits, tactical errors,
  endgame-conversion issues, and progress over time.
- Move pieces by tap or drag, draw right-drag arrows, and customize the board
  and piece style.

Privacy comes first. Alpha has no account, ads, analytics, or tracking. Board
analysis and local PGNs work offline. A public-game import is made only after
you enter a public username and choose to import it; the request goes directly
to Chess.com or Lichess and does not pass through an Alpha server.

Alpha is open source under GPL-3.0. It uses Stockfish 19 in a
single-threaded WebAssembly configuration for on-device analysis.

## Release notes for 1.4.2

- Replaced Alpha's launcher and in-app logo with the official knight mark.
- Added an in-app Privacy & data policy screen.
- Linked the policy from the main chess-analysis screen.
- Kept public-game imports opt-in and direct to the selected service.

## Visual assets still needed

The 512 × 512 app icon is ready at:

`fastlane/metadata/android/en-US/images/icon.png`

Capture at least three genuine Android screenshots from the final signed build:

1. The board with an Alpha analysis and candidate moves.
2. A selected-game review with its per-move verdict.
3. The full-database coach showing a player profile.

Screenshots must show the real app, not a mock-up, and must not expose private
PGNs, emails, passwords, or account details.

## Release workflow

1. Complete Samsung Seller Portal registration and its required seller
   verification yourself.
2. Configure the listing as a **one-time paid app**. Set the base price to
   **US$1.49** and, where Seller Portal permits local prices, set India to
   **₹149**. Check the displayed local-price table before submitting; Samsung
   may calculate a local price from the base price when a manual local price is
   unavailable.
3. Enter your own payout and tax details. These are not part of Alpha's source
   code and must never be committed to Git or sent to support.
4. Build a **signed release APK** from this exact source with Alpha's existing
   private release key. Do not upload a debug APK or a GitHub Actions artifact.
5. Install that APK on a phone and test public-game import, position analysis,
   the game review, and the Privacy & data policy screen.
6. Add the signed APK, listing copy, icon, screenshots, privacy-policy URL,
   and support email in the Seller Portal. Review every field before you submit
   the app for Samsung's review.

The F-Droid submission remains based on the earlier v1.4.0 source tag. Do not
edit its submitted recipe while it is under review; a later F-Droid update can
use this version after the initial inclusion is accepted.
