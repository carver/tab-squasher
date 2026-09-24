# 010 Hold before the Inbox (unsend and edit window)

Not in the first milestone. Like "undo send" in email: for about a minute after the server accepts a Spark, you can still edit or unsend it. Only after that does it enter the Inbox.

## Why the server holds it

Mobile Firefox suspends background scripts, so a hold on the device could stretch until Firefox next wakes up. On the server, the Spark is safe off the device right away, the timing is exact, and Destinations keep reading an Inbox of final Sparks only.

## What to build

- States: Outbox (device, not yet accepted), then Hold (server, editable), then Inbox (final). Add **Hold** to CONTEXT.md when this lands, and confirm the name first.
- `POST /sparks` puts a new Spark on Hold and returns 201 `{"id", "status": "held", "editable_until"}`. When the Hold ends, the server appends the Spark to the Inbox with `received_at` set to that moment.
- `GET /sparks/held` lists held Sparks, for the popup's "recently sent" list. `PUT /sparks/{id}` replaces a held Spark (validated like a new one; the Hold timer doesn't restart). `DELETE /sparks/{id}` unsends it. Both return 404 once the Spark has left the Hold. The popup then says it's already in the Inbox.
- A "send now" action ends the Hold early.
- Held Sparks survive a restart. Only the server reads them, so they live off the mount (for example `~/.local/state/tab-squasher/held/`). On startup, Holds that already expired go to the Inbox right away.
- The known-ids check (002) covers held and Inbox ids, so a retry from the Outbox during a Hold still gets 200.
- Hold length is configured on the server, default 60 s. The popup shows the time left from `editable_until`.

## Open questions

- Should editing a held Spark restart its timer?
- Does anything need a per-Spark "no Hold" switch, or is "send now" enough?

## Tests

- A clock-injected property test: for any sequence of POST, PUT, DELETE, send-now and restart, every Spark that wasn't unsent reaches the Inbox exactly once, with its last accepted content. Nothing reaches the Inbox before its Hold ends unless sent early.
