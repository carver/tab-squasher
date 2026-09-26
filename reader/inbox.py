"""Reading the Inbox, for any Destination.

The Inbox is one JSON Lines file per year (`2026.jsonl`, ...), appended to
by the server and never rewritten. Destinations only read it, and each one
remembers which Spark ids it has handled in its own files (ADR 0001).
Every line is checked against spec/spark.schema.json with the same rules
the server enforces.

Destinations import this by putting tab-squasher's reader/ on sys.path:

    from inbox import pending_sparks, spark_problem

It needs jsonschema and regress (see requirements.txt).
"""

import functools
import json
import math
import os
import re

import jsonschema
import regress

SPEC_DIR = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "spec"))
MAX_BODY_BYTES = 65_536
YEAR_FILE = re.compile(r"^\d{4}\.jsonl$")


class _NotASpark(ValueError):
    pass


def _ecma_pattern(validator, pattern, instance, schema):
    """The `pattern` keyword with ECMA-262 semantics, as JSON Schema means.

    Python's re differs where it matters here: `$` also matches before a
    final newline, and `\\d` matches any Unicode digit.
    """
    if validator.is_type(instance, "string") and regress.Regex(pattern).find(instance) is None:
        yield jsonschema.ValidationError(f"{instance!r} does not match {pattern!r}")


@functools.cache
def _schema():
    with open(os.path.join(SPEC_DIR, "spark.schema.json"), encoding="utf-8") as f:
        return json.load(f)


@functools.cache
def _validator():
    ecma = jsonschema.validators.extend(jsonschema.Draft202012Validator, {"pattern": _ecma_pattern})
    return ecma(_schema())


def destinations():
    """Every Destination the schema allows."""
    return tuple(_schema()["properties"]["destination"]["enum"])


def _no_duplicate_keys(pairs):
    obj = {}
    for key, value in pairs:
        if key in obj:
            raise _NotASpark(f"duplicate key {key!r}")
        obj[key] = value
    return obj


def _finite_float(text):
    value = float(text)
    if not math.isfinite(value):
        raise _NotASpark(f"number {text} is out of range")
    return value


def _reject_constant(name):
    raise _NotASpark(f"{name} is not valid JSON")


def _parse(text):
    """JSON, refusing duplicate keys and non-finite numbers like the server does."""
    try:
        return json.loads(
            text, object_pairs_hook=_no_duplicate_keys, parse_float=_finite_float, parse_constant=_reject_constant
        )
    except json.JSONDecodeError as e:
        raise _NotASpark(f"not valid JSON: {e}") from e


def _schema_problem(value):
    error = jsonschema.exceptions.best_match(_validator().iter_errors(value))
    if error is None:
        return None
    where = "/".join(str(part) for part in error.absolute_path)
    return f"at /{where}: {error.message}"[:300]


def spark_problem(body):
    """Why a Spark request body is invalid, or None. See README.md here."""
    size = len(body.encode("utf-8"))
    if size > MAX_BODY_BYTES:
        return f"body is {size} bytes, over the {MAX_BODY_BYTES} byte limit"
    try:
        value = _parse(body)
    except _NotASpark as e:
        return str(e)
    return _schema_problem(value)


def _year_files(inbox_dir):
    try:
        names = os.listdir(inbox_dir)
    except FileNotFoundError:
        return []
    return sorted(name for name in names if YEAR_FILE.match(name))


def _complete_lines(path):
    """Lines that end in a newline, as bytes. A last line without one is still being written.

    Each line is decoded on its own, since a crash can cut a line inside a
    multibyte character.
    """
    with open(path, "rb") as f:
        return f.read().split(b"\n")[:-1]


def _read_line(line):
    """(spark, None) for a valid Spark without received_at, or (None, problem)."""
    try:
        spark = _parse(line.decode("utf-8"))
    except UnicodeDecodeError:
        return None, "not valid UTF-8"
    except _NotASpark as e:
        return None, str(e)
    if isinstance(spark, dict):
        spark.pop("received_at", None)
    problem = _schema_problem(spark)
    return (None, problem) if problem else (spark, None)


def pending_sparks(inbox_dir, done, destination):
    """Sparks for `destination` in the Inbox whose id isn't in `done`, oldest first.

    Returns (sparks, skipped): each Spark without the server's received_at,
    and a message for every line that isn't a valid Spark. Those are
    reported rather than fatal, so one bad line can't block the rest.
    Sparks for other Destinations are neither returned nor reported.
    """
    if destination not in destinations():
        raise ValueError(f"unknown destination {destination!r}; the schema allows {', '.join(destinations())}")
    sparks, skipped = [], []
    for name in _year_files(inbox_dir):
        for number, line in enumerate(_complete_lines(os.path.join(inbox_dir, name)), start=1):
            if not line.strip():
                continue
            spark, problem = _read_line(line)
            if problem:
                skipped.append(f"{name} line {number}: {problem}")
            elif spark["destination"] == destination and spark["id"] not in done:
                sparks.append(spark)
    return sparks, skipped
