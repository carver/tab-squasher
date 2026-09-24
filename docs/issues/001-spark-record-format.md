# 001 Spark record format

Every other issue tests against this format, so it gets pinned down first as shared fixtures.

## What to build

A JSON Schema at `spec/spark.schema.json` and a set of example files in `spec/fixtures/valid/` and `spec/fixtures/invalid/`. The extension (TypeScript), the server (Rust) and anki-cards (Python) each run their own validation against all of the fixtures in their test suites. That way the three implementations can't drift apart without some test failing.

A Spark as the extension sends it:

```json
{
  "v": 1,
  "id": "3f0c1d9e-6a57-4e57-9d64-2b1b4f0f6c11",
  "destination": "anki",
  "note": "Debezium streams row changes out of Postgres",
  "quote": "Debezium is a set of distributed services ... [that capture] row-level changes",
  "selection": "Debezium is a set of distributed services to capture changes in your databases so that your applications can see those changes and respond to them. Debezium records all row-level changes",
  "source": {
    "url": "https://debezium.io/documentation/reference/stable/architecture.html",
    "title": "Debezium Architecture",
    "video_seconds": null
  },
  "captured_at": "2026-09-24T03:12:45.120Z"
}
```

In the Inbox, the server adds `"received_at"` (RFC 3339, UTC) and changes nothing else.

## Rules

- `v` is 1. Unknown fields are rejected. A new field means bumping `v`.
- `id` is a UUID v4 made by the extension. It's what makes retrying from the Outbox safe.
- `destination` is `"anki"`. It's the only value for now.
- After trimming, `note` or `quote` must be non-empty. Empty strings are stored as `null`.
- `selection` is present exactly when `quote` is. Clearing the Quote drops the Selection.
- `source.url` is `http` or `https`. `source.title` may be `null`.
- `source.video_seconds` is a finite number >= 0, or `null` when the page had no video or the video hadn't started. It's stored for any page with a `<video>`. Consumers add a `t=` link parameter only for YouTube.
- `captured_at` is RFC 3339 UTC, set by the extension when the user presses Send.
- The whole JSON document is at most 64 KB (65,536 bytes) as UTF-8.

## Acceptance

- The schema and at least these fixtures exist. Valid: note only; quote only; both; YouTube with `video_seconds`; non-ASCII text; right at the 64 KB limit. Invalid: neither note nor quote; whitespace-only note; quote without selection; selection without quote; unknown field; `v: 2`; `ftp:` URL; negative or non-finite `video_seconds`; one byte over 64 KB.
- A README in `spec/` states the rules above in one place, and the other issues point to it.
