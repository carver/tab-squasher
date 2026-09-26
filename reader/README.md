# Inbox reader

`inbox.py` is the Python reader every Destination shares (anki-cards, knowledge-dump). It reads the Inbox and checks each line against [spec/spark.schema.json](../spec/spark.schema.json) with the same rules the server enforces.

- `pending_sparks(inbox_dir, done, destination)` returns that Destination's Sparks not yet in `done`, oldest first, plus a message for each line that isn't a valid Spark.
- `spark_problem(body)` says why one request body isn't a valid Spark, or returns `None`.

A Destination puts this folder on `sys.path` and does `from inbox import pending_sparks, spark_problem`. It needs the packages in `requirements.txt`.

Tests run against the fixtures in `spec/`: `python3 -m pytest reader`.
