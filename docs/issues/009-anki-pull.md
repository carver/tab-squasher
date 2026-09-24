# 009 anki-cards pulls Sparks from the Inbox

This work happens in `../anki-cards`. Per tab-squasher's ADR 0001, Destinations read the Inbox, and tab-squasher never writes into anki-cards.

## What to build

- `generate_cards.py` also reads `../tab-squasher/data/inbox/*.jsonl` (path configurable). It keeps Sparks with `destination: "anki"` whose `id` isn't in a new committed file, `spark-ledger.json`. It skips a last line with no trailing newline, and a missing year file isn't an error.
- One batch, one LLM call, same as today. The prompt lists every hand-written line from `card-prompts.txt` and every pending Spark as numbered prompts. A Spark prompt shows its Note, its Quote (with an explanation of `...` and `[..]`) and its Source title and URL. The model must put `"prompt": <n>` on every card. Reject the whole batch if any card has a missing or unknown number (the existing all-or-nothing rule).
- For cards from a Spark, the script, not the model, appends the Source link to `back`: `<br><small><a href="URL">Title</a></small>`. That's the Source title, or the domain when there's no title, HTML-escaped. For YouTube with `video_seconds`, the URL gets `t=<seconds>s`.
- After cards are appended, add the batch's Spark ids to `spark-ledger.json` and commit it with `cards.jsonl`. Order matters for crash safety: cards first, then ledger. Front-dedupe already handles a rerun after a crash between the two.
- A Spark that yields no card still goes in the ledger, so it isn't retried forever. The run log says so.
- `card-prompts.txt` keeps working exactly as before.

## Tests

- Validation runs against the 001 fixtures (valid ones parse, invalid ones are skipped with a logged reason, not fatal).
- Prompt building, prompt-number validation, link building (escaping, domain fallback, YouTube `t=`), partial last line, missing year, ledger skip, and mixed txt + Spark batches. All run with the LLM call stubbed.
