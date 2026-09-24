# Spark record format

The one place the rules for a Spark are written down. The extension builds Sparks, the server checks them before they enter the Inbox, and anki-cards reads them back out. Each one tests against the fixtures here, so they can't drift apart without a test failing. Vocabulary is in [CONTEXT.md](../CONTEXT.md).

- `spark.schema.json` is the machine-readable form. The server validates every request against it at runtime.
- `fixtures/valid/` and `fixtures/invalid/` hold exact request bodies. Every validator accepts all of `valid/` and rejects all of `invalid/`.
- `make_fixtures.py` generates the fixtures. Edit a case there, rerun it and commit both.

## A Spark

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

In the Inbox, the server adds `received_at`, the time the Spark entered the Inbox, in the same format as `captured_at`. It changes nothing else.

## Rules

- Every field is present. Absent text is `null`, never omitted and never `""`.
- `v` is the number 1. Unknown fields, including inside `source`, are rejected. Adding a field means bumping `v`.
- `id` is a lowercase UUID v4 made by the extension. Retrying from the Outbox reuses it, which is what makes retries safe.
- `destination` is `"anki"`, the only one so far.
- `note` and `quote` are `null` or trimmed text: no leading or trailing whitespace, and not empty. At least one of them is text.
- `selection` is text exactly when `quote` is. It's the raw page selection, so it isn't trimmed, but it can't be only whitespace. Clearing the Quote drops the Selection.
- `source.url` starts with `http://` or `https://`. `source.title` is `null` or trimmed text.
- `source.video_seconds` is `null` or a finite number >= 0. It's filled for any page with a `<video>` that has started. Consumers add a `t=` link parameter for YouTube only.
- `captured_at` is UTC with a `Z` suffix, as `Date.prototype.toISOString()` writes it. The fraction is optional.
- The whole request body is at most 65,536 bytes of UTF-8. That's bytes, not characters: the size fixtures pad with two-byte characters to catch the difference.
- A body with a duplicated key is rejected, since parsers disagree about which value wins. Validators that only ever check JSON they produced themselves (the extension) may skip that one fixture.
