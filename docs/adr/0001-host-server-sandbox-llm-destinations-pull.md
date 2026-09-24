# Server on the host, LLM work in the sandbox, Destinations pull

The server has to receive Sparks while the sandbox is closed, so it runs on the host as a systemd user service. Anything that calls an LLM, like turning Sparks into Anki cards, runs as its own process inside the sandbox. The two sides share files over a virtiofs mount, and file locks between host and sandbox aren't reliable there. So every file has exactly one writer. The server appends to the Inbox and never writes into another project. Each Destination reads the Inbox and tracks the Spark ids it has already handled in its own files.

## Considered Options

- Server inside the sandbox, published with `sbx ports` (the rental-finder setup). Rejected because it stops receiving whenever the sandbox is down.
- Server appends to `anki-cards/card-prompts.jsonl`. Rejected because the sandbox generator rewrites that file to clear processed prompts, and with two writers on different sides of the mount a Spark can get lost.

## Consequences

The Inbox is one file per year, `data/inbox/<YYYY>.jsonl`. The year is the UTC year the server received the Spark, not when it was captured, so a Spark held in an Outbox over New Year still lands in a file readers haven't finished with. The server never renames or moves a file. Old years may later be compressed or moved off the mount, so readers must handle a past year's file being gone.
