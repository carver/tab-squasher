# tab-squasher

Turns open browser tabs into follow-up work, so the tab can be closed. Each tab's reason for staying open is captured and sent where it will get acted on.

## Language

**Spark**:
One thing a page inspired, recorded with its Source and sent to a Destination. A single page can yield many Sparks.
_Avoid_: Capture, Clipping, Takeaway, Learning

**Selection**:
The exact page text selected when the Spark was made. Never edited, and kept only alongside a Quote so the Quote can be checked against it.
_Avoid_: Highlight

**Quote**:
The Selection as the user trimmed it for the Spark. Every other change is marked with a Cut or a Rewrite. Optional.
_Avoid_: Excerpt, Snippet

**Cut**:
A stretch removed from inside a Quote, shown as `...`.
_Avoid_: Elision, Omission

**Rewrite**:
The user's rephrasing of a stretch of a Quote, shown in square brackets.
_Avoid_: Interpolation, Paraphrase

**Note**:
The user's own words saying what to remember or do. A Spark needs a Note, a Quote, or both.
_Avoid_: Comment, Description

**Source**:
The page a Spark came from: its URL and title, plus the playback moment when the Spark was made on a video.
_Avoid_: Link, Origin

**Destination**:
Where a Spark gets acted on, e.g. Anki. Each Spark has exactly one.
_Avoid_: Target, Sink

**Inbox**:
tab-squasher's permanent, append-only record of every Spark received. Destinations read their Sparks from it; nothing is pushed to them.
_Avoid_: Log, Queue

**Outbox**:
Sparks saved on the browser that the Inbox hasn't received yet, e.g. because the server was unreachable.
_Avoid_: Queue, Pending, Unsent
