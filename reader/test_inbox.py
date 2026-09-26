"""Tests for inbox.py: checking Spark bodies against the fixtures, and
reading one Destination's Sparks out of an Inbox in a temp dir."""

import json
import os

import pytest
from hypothesis import given
from hypothesis import strategies as st

import inbox

FIXTURES = os.path.join(inbox.SPEC_DIR, "fixtures")


def fixtures(kind):
    folder = os.path.join(FIXTURES, kind)
    return [(name, open(os.path.join(folder, name), encoding="utf-8").read()) for name in sorted(os.listdir(folder))]


def fixture_spark(name="note_and_quote.json"):
    return json.loads(open(os.path.join(FIXTURES, "valid", name), encoding="utf-8").read())


class TestSparkProblem:
    @pytest.mark.parametrize("name,body", fixtures("valid"))
    def test_accepts_valid_fixture(self, name, body):
        assert inbox.spark_problem(body) is None

    @pytest.mark.parametrize("name,body", fixtures("invalid"))
    def test_rejects_invalid_fixture(self, name, body):
        assert inbox.spark_problem(body)


def inbox_line(spark, received_at="2026-09-24T03:15:00.000Z"):
    return json.dumps({**spark, "received_at": received_at}, ensure_ascii=False) + "\n"


def with_id(spark, n):
    return {**spark, "id": f"00000000-0000-4000-8000-{n:012d}"}


def pending_for_anki(inbox_dir, done=frozenset()):
    return inbox.pending_sparks(str(inbox_dir), done=set(done), destination="anki")


class TestPendingSparks:
    def test_reads_sparks_oldest_year_first_skipping_done_ones(self, tmp_path):
        a, b, c = (with_id(fixture_spark(), n) for n in (1, 2, 3))
        (tmp_path / "2027.jsonl").write_text(inbox_line(c))
        (tmp_path / "2026.jsonl").write_text(inbox_line(a) + inbox_line(b))

        pending, skipped = pending_for_anki(tmp_path, done={b["id"]})

        assert [s["id"] for s in pending] == [a["id"], c["id"]]
        assert skipped == []

    def test_returns_the_spark_without_received_at(self, tmp_path):
        spark = fixture_spark()
        (tmp_path / "2026.jsonl").write_text(inbox_line(spark))

        assert pending_for_anki(tmp_path)[0] == [spark]

    def test_a_last_line_still_being_written_is_left_for_later(self, tmp_path):
        a, b = with_id(fixture_spark(), 1), with_id(fixture_spark(), 2)
        (tmp_path / "2026.jsonl").write_text(inbox_line(a) + inbox_line(b).rstrip("\n"))

        pending, skipped = pending_for_anki(tmp_path)

        assert [s["id"] for s in pending] == [a["id"]]
        assert skipped == []

    def test_a_broken_or_invalid_line_is_reported_and_skipped(self, tmp_path):
        good = with_id(fixture_spark(), 1)
        bad = {**with_id(fixture_spark(), 2), "note": None, "quote": None, "selection": None}
        (tmp_path / "2026.jsonl").write_text('{"cut short\n' + inbox_line(bad) + inbox_line(good))

        pending, skipped = pending_for_anki(tmp_path)

        assert [s["id"] for s in pending] == [good["id"]]
        assert len(skipped) == 2
        assert all(message.startswith("2026.jsonl line ") for message in skipped)

    def test_a_line_cut_inside_a_multibyte_character_is_skipped_not_fatal(self, tmp_path):
        good = with_id(fixture_spark("non_ascii.json"), 1)
        torn = inbox_line(with_id(fixture_spark("non_ascii.json"), 2)).encode()
        cut = next(i for i, b in enumerate(torn) if b >= 0x80) + 1
        (tmp_path / "2026.jsonl").write_bytes(torn[:cut] + b"\n" + inbox_line(good).encode())

        pending, skipped = pending_for_anki(tmp_path)

        assert [s["id"] for s in pending] == [good["id"]]
        assert skipped == ["2026.jsonl line 1: not valid UTF-8"]

    def test_a_missing_inbox_is_empty(self, tmp_path):
        assert pending_for_anki(tmp_path / "nowhere") == ([], [])

    def test_ignores_files_that_are_not_year_files(self, tmp_path):
        (tmp_path / "notes.jsonl").write_text(inbox_line(fixture_spark()))
        (tmp_path / "2026.jsonl.gz").write_bytes(b"\x1f\x8b")

        assert pending_for_anki(tmp_path) == ([], [])


class TestDestinations:
    def test_the_schema_names_both_destinations(self):
        assert inbox.destinations() == ("anki", "knowledge-dump")

    def test_each_destination_gets_only_its_own_sparks_and_no_word_of_the_others(self, tmp_path):
        card = with_id(fixture_spark(), 1)
        dump = with_id(fixture_spark("knowledge_dump_destination.json"), 2)
        (tmp_path / "2026.jsonl").write_text(inbox_line(card) + inbox_line(dump))

        for destination, expected in (("anki", card), ("knowledge-dump", dump)):
            assert inbox.pending_sparks(str(tmp_path), set(), destination) == ([expected], [])

    def test_an_invalid_line_is_reported_to_every_destination(self, tmp_path):
        (tmp_path / "2026.jsonl").write_text("not json\n")

        for destination in inbox.destinations():
            assert len(inbox.pending_sparks(str(tmp_path), set(), destination)[1]) == 1

    def test_an_unknown_destination_is_an_error_not_an_empty_inbox(self, tmp_path):
        with pytest.raises(ValueError, match="knowledge_dump"):
            inbox.pending_sparks(str(tmp_path), set(), "knowledge_dump")


# An Inbox as (destination, already done?) per Spark, in the order received.
inboxes = st.lists(st.tuples(st.sampled_from(["anki", "knowledge-dump"]), st.booleans()), max_size=12)


@given(entries=inboxes, destination=st.sampled_from(["anki", "knowledge-dump"]))
def test_returns_exactly_the_not_done_sparks_for_the_destination_in_order(tmp_path_factory, entries, destination):
    folder = tmp_path_factory.mktemp("inbox")
    sparks = [{**with_id(fixture_spark(), n), "destination": dest} for n, (dest, _) in enumerate(entries)]
    (folder / "2026.jsonl").write_text("".join(inbox_line(spark) for spark in sparks))
    done = {spark["id"] for spark, (_, is_done) in zip(sparks, entries) if is_done}

    pending, skipped = inbox.pending_sparks(str(folder), done, destination)

    assert pending == [s for s in sparks if s["destination"] == destination and s["id"] not in done]
    assert skipped == []
