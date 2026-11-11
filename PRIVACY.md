# Alpha Privacy Policy

**Effective date:** 11 November 2026

Alpha is a local-first chess-analysis application. This policy covers the Android application and the source distribution at [codewithpb11/Alpha-Bot](https://github.com/codewithpb11/Alpha-Bot).

## Summary

Alpha does not require an account, does not ask for Chess.com or Lichess passwords, cookies, or access tokens, and does not contain advertising, tracking, or analytics SDKs. It performs chess analysis on the device. It contacts Chess.com or Lichess only when a user explicitly chooses to import public games for a public username.

## Information Alpha processes

Alpha can process the following information on the device:

- PGN files and chess positions that you choose to import or enter;
- public Chess.com or Lichess usernames that you enter, and the public game records returned for those usernames;
- chess-analysis results derived from those positions and games; and
- local presentation preferences, such as the selected board theme, piece style, and orientation.

Imported games and analysis are held in the active application session. Local presentation preferences are stored in the app's local browser storage so they can be reused on that device. Alpha does not provide an Alpha account, cloud backup, or an Alpha-operated game database.

## Network use

The Android app works offline for board analysis and locally imported PGNs. If you select a public-game import, it makes a direct request from the device to the relevant public service:

- Chess.com: `https://api.chess.com/pub/`
- Lichess: `https://lichess.org/api/`

Those requests contain the public username you entered as part of the request URL. Alpha does not proxy this request through a developer-operated server, and does not send the imported PGNs, engine evaluations, or your chess analysis to an Alpha-operated server.

Chess.com and Lichess process requests under their own terms and privacy policies. Only request public information that you are permitted to access.

The desktop development server described in this repository can make the same public-data requests from the computer running it. It is designed to bind to `127.0.0.1` only.

## Information Alpha does not collect

Alpha does not intentionally collect or transmit to its developer:

- passwords, platform logins, cookies, or personal access tokens;
- payment-card or bank information;
- contacts, photos, precise location, microphone, or camera data;
- advertising identifiers, usage analytics, or crash-reporting telemetry; or
- private Chess.com or Lichess games.

## Retention and deletion

You can remove imported data by closing the active session or using Android's **Settings → Apps → Alpha → Storage → Clear storage**. Uninstalling the app also removes its local application data. Deleting a source checkout or browser site data removes the corresponding local development data.

## Security and support

The source is publicly available under GPL-3.0 so users can inspect how the app works. Please report security or privacy concerns through the [GitHub issue tracker](https://github.com/codewithpb11/Alpha-Bot/issues). Customers may also reply to their Gumroad receipt for product support.

## Changes to this policy

If Alpha's data practices change, this policy will be updated in the public repository with a new effective date. Material changes will also be described in the applicable store listing or release notes.
