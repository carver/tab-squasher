#!/usr/bin/env python3
"""Regenerate spec/fixtures from the cases below.

Each fixture file is an exact request body. Every validator (server,
extension, anki-cards) must accept everything in valid/ and reject
everything in invalid/. Run this after changing a case, and commit the
output alongside it.
"""

import copy
import json
import shutil
from pathlib import Path

HERE = Path(__file__).parent
MAX_BYTES = 65_536

BASE = {
    "v": 1,
    "id": "3f0c1d9e-6a57-4e57-9d64-2b1b4f0f6c11",
    "destination": "anki",
    "note": "Debezium streams row changes out of Postgres",
    "quote": "Debezium is a set of distributed services ... [that capture] row-level changes",
    "selection": (
        "Debezium is a set of distributed services to capture changes in your "
        "databases so that your applications can see those changes and respond "
        "to them. Debezium records all row-level changes"
    ),
    "source": {
        "url": "https://debezium.io/documentation/reference/stable/architecture.html",
        "title": "Debezium Architecture",
        "video_seconds": None,
    },
    "captured_at": "2026-09-24T03:12:45.120Z",
}


def spark(**changes):
    """BASE with top-level or dotted `source.x` fields replaced; DELETE drops one."""
    doc = copy.deepcopy(BASE)
    for key, value in changes.items():
        target, name = (doc["source"], key[len("source__"):]) if key.startswith("source__") else (doc, key)
        if value is DELETE:
            del target[name]
        else:
            target[name] = value
    return doc


DELETE = object()


def pretty(doc):
    return json.dumps(doc, indent=2, ensure_ascii=False) + "\n"


def sized(total_bytes):
    """A valid Spark whose compact JSON is exactly total_bytes long.

    The padding is two-byte UTF-8, so a validator that counts characters
    instead of bytes accepts the oversized one and fails the test.
    """
    doc = spark(note=None, quote="x", selection="x")
    base = len(json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode())
    room = total_bytes - base
    doc["quote"] = "x" + "é" * (room // 2) + "x" * (room % 2)
    body = json.dumps(doc, ensure_ascii=False, separators=(",", ":"))
    assert len(body.encode()) == total_bytes, len(body.encode())
    return body


VALID = {
    "note_and_quote.json": pretty(BASE),
    "note_only.json": pretty(spark(quote=None, selection=None)),
    "quote_only.json": pretty(spark(note=None)),
    "youtube_with_video_seconds.json": pretty(spark(
        note="The talk's point about backpressure",
        quote=None,
        selection=None,
        source__url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        source__title="Backpressure explained",
        source__video_seconds=754.38,
    )),
    "video_at_zero_seconds.json": pretty(spark(source__video_seconds=0)),
    "no_title.json": pretty(spark(source__title=None)),
    "selection_with_surrounding_whitespace.json": pretty(spark(selection="\n  " + BASE["selection"] + " \n")),
    "multiline_note.json": pretty(spark(note="First line\n\nSecond line")),
    "non_ascii.json": pretty(spark(
        note="漢字の読み方を覚える",
        quote="Ärger über Straße ... [naïve] café",
        selection="Ärger über Straße und naïve café 🙂",
    )),
    "http_url.json": pretty(spark(source__url="http://example.com/page")),
    "timestamp_without_fraction.json": pretty(spark(captured_at="2026-09-24T03:12:45Z")),
    "exactly_max_size.json": sized(MAX_BYTES),
}

INVALID = {
    "neither_note_nor_quote.json": pretty(spark(note=None, quote=None, selection=None)),
    "empty_string_note.json": pretty(spark(note="", quote=None, selection=None)),
    "whitespace_only_note.json": pretty(spark(note="  \n ", quote=None, selection=None)),
    "untrimmed_note.json": pretty(spark(note=" padded note ")),
    "untrimmed_quote.json": pretty(spark(quote="Debezium ")),
    "quote_without_selection.json": pretty(spark(selection=None)),
    "selection_without_quote.json": pretty(spark(quote=None)),
    "whitespace_only_selection.json": pretty(spark(selection="   ")),
    "missing_field.json": pretty(spark(note=DELETE)),
    "missing_source_field.json": pretty(spark(source__title=DELETE)),
    "unknown_field.json": pretty(spark(tags=["db"])),
    "unknown_source_field.json": pretty(spark(source__favicon="https://debezium.io/favicon.ico")),
    "version_2.json": pretty(spark(v=2)),
    "version_as_string.json": pretty(spark(v="1")),
    "other_destination.json": pretty(spark(destination="notes")),
    "uppercase_id.json": pretty(spark(id=BASE["id"].upper())),
    "non_v4_id.json": pretty(spark(id="3f0c1d9e-6a57-1e57-9d64-2b1b4f0f6c11")),
    "ftp_url.json": pretty(spark(source__url="ftp://example.com/file")),
    "relative_url.json": pretty(spark(source__url="/docs/page")),
    "empty_title.json": pretty(spark(source__title="")),
    "negative_video_seconds.json": pretty(spark(source__video_seconds=-1)),
    "video_seconds_as_string.json": pretty(spark(source__video_seconds="12")),
    "timestamp_with_offset.json": pretty(spark(captured_at="2026-09-24T05:12:45.120+02:00")),
    "timestamp_without_zone.json": pretty(spark(captured_at="2026-09-24T03:12:45.120")),
    "one_byte_over_max_size.json": sized(MAX_BYTES + 1),
    # Not expressible through spark(): raw bodies.
    "video_seconds_overflow.json": pretty(BASE).replace('"video_seconds": null', '"video_seconds": 1e400'),
    "not_json.json": "note=hello\n",
    "array_instead_of_object.json": json.dumps([BASE]) + "\n",
    "duplicate_key.json": pretty(BASE).replace('"v": 1,', '"v": 1,\n  "note": null,', 1),
}


def main():
    for kind, cases in (("valid", VALID), ("invalid", INVALID)):
        out = HERE / "fixtures" / kind
        shutil.rmtree(out, ignore_errors=True)
        out.mkdir(parents=True)
        for name, body in cases.items():
            (out / name).write_text(body, encoding="utf-8")
    print(f"wrote {len(VALID)} valid and {len(INVALID)} invalid fixtures")


if __name__ == "__main__":
    main()
