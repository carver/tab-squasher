# Issues

First milestone: capture a Spark in Firefox on desktop or Android, store it in the Inbox on the host, and see it turn into an Anki card with a link back to its Source.

Vocabulary is in [CONTEXT.md](../../CONTEXT.md), and the big decisions are in [docs/adr](../adr). The Android and desktop spike lives on branch `spike/android-popup`; its commit message holds the verdict.

| # | Issue | Needs |
|---|-------|-------|
| 001 | [Spark record format](001-spark-record-format.md) | |
| 002 | [Server receives Sparks into the Inbox](002-server-inbox.md) | 001 |
| 003 | [Run the server on the host behind tailscale serve](003-host-install.md) | 002 |
| 004 | [Extension skeleton](004-extension-skeleton.md) | |
| 005 | [Popup writes and sends a Spark](005-popup-send.md) | 001, 004 |
| 006 | [Outbox](006-outbox.md) | 005 |
| 007 | [Entry points: right-click and Android chip](007-entry-points.md) | 005 |
| 008 | [Sign on AMO and install on both devices](008-amo-signing.md) | 005 |
| 009 | [anki-cards pulls Sparks from the Inbox](009-anki-pull.md) | 001 |

The first usable end-to-end run needs 003 and 005. 002, 004 and 009 can proceed in parallel.
