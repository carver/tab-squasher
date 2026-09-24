# 006 Outbox

Sparks the Inbox hasn't received yet, saved on the device (CONTEXT.md).

## What to build

- The Outbox lives in `storage.local`. A Spark enters it when a send fails without a 4xx, and leaves it when the server answers 201 or 200.
- Retry when the popup opens, after any successful send, and on a `browser.alarms` alarm every 5 minutes while the Outbox isn't empty. Clear the alarm when it empties. Sends run one at a time and in order.
- The popup lists Outbox Sparks at the bottom with the note or quote start, domain and age. Each one can be edited (reopens the form; same `id`) or deleted with a confirm. An edit can hit a 409: the server may have saved the Spark while its reply got lost. The Outbox then shows "already received, with different content" and offers to delete the local copy, since the Inbox already has the original.
- A 4xx during retry leaves the Spark in the Outbox marked with the server's reason, so you can fix or delete it. Other Sparks keep going.
- Sent Sparks are not kept on the device. Reviewing past Sparks is a later feature built on the Inbox.

## Tests

- Unit: the Outbox as a pure state machine (enqueue, send ok, send 409, other 4xx, network error, edit, delete). A property test over random event sequences: a Spark is never lost unless deleted, never duplicated, and never sent twice after a 201.
- E2E: server down, Send & close, the page closes, Outbox shows 1. Start the server, reopen the popup, and the Outbox shows 0 with one Inbox line.
