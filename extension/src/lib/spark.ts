// The Spark record format. spec/README.md has the rules; this is the
// extension's copy, tested against the same fixtures as the server.

export const MAX_SPARK_BYTES = 65_536;

export interface Source {
  url: string;
  title: string | null;
  video_seconds: number | null;
}

export interface Spark {
  v: 1;
  id: string;
  destination: "anki";
  note: string | null;
  quote: string | null;
  selection: string | null;
  source: Source;
  captured_at: string;
}

export type Checked = { ok: true; spark: Spark } | { ok: false; problem: string };

const SPARK_KEYS = ["v", "id", "destination", "note", "quote", "selection", "source", "captured_at"];
const SOURCE_KEYS = ["url", "title", "video_seconds"];
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TRIMMED_TEXT = /^\S(?:[\s\S]*\S)?$/;
const HTTP_URL = /^https?:\/\/[^\s/]+/;
const UTC_TIMESTAMP =
  /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,9})?Z$/;

/** Checks a serialized Spark, exactly as it would be sent, against every rule. */
export function validateSparkBody(body: string): Checked {
  const bytes = new TextEncoder().encode(body).length;
  if (bytes > MAX_SPARK_BYTES) {
    const kb = Math.ceil(bytes / 1024);
    return fail(`This Spark is ${kb} KB, over the ${MAX_SPARK_BYTES / 1024} KB limit. Shorten the Quote or Note.`);
  }
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return fail("Not valid JSON");
  }
  const problem = problemWith(value);
  return problem === null ? { ok: true, spark: value as Spark } : fail(problem);
}

function problemWith(value: unknown): string | null {
  if (!isObject(value)) return "A Spark is a JSON object";
  const keysProblem = exactKeys(value, SPARK_KEYS, "Spark");
  if (keysProblem) return keysProblem;
  if (value.v !== 1) return "Unsupported format version";
  if (typeof value.id !== "string" || !UUID_V4.test(value.id)) return "id must be a lowercase UUID v4";
  if (value.destination !== "anki") return "Unknown destination";
  for (const field of ["note", "quote"] as const) {
    if (!isTrimmedTextOrNull(value[field])) return `${field} must be trimmed text or null`;
  }
  if (!(value.selection === null || (typeof value.selection === "string" && /\S/.test(value.selection)))) {
    return "selection must be text or null";
  }
  const sourceProblem = problemWithSource(value.source);
  if (sourceProblem) return sourceProblem;
  if (typeof value.captured_at !== "string" || !UTC_TIMESTAMP.test(value.captured_at)) {
    return "captured_at must be a UTC timestamp ending in Z";
  }
  if (value.note === null && value.quote === null) return "Add a Note or a Quote";
  if ((value.quote === null) !== (value.selection === null)) return "A Selection is kept exactly when there is a Quote";
  return null;
}

function problemWithSource(source: unknown): string | null {
  if (!isObject(source)) return "source must be an object";
  const keysProblem = exactKeys(source, SOURCE_KEYS, "source");
  if (keysProblem) return keysProblem;
  if (typeof source.url !== "string" || !HTTP_URL.test(source.url)) return "Only http and https pages can be Sparked";
  if (!isTrimmedTextOrNull(source.title)) return "source.title must be trimmed text or null";
  const seconds = source.video_seconds;
  if (!(seconds === null || (typeof seconds === "number" && Number.isFinite(seconds) && seconds >= 0))) {
    return "source.video_seconds must be a number of seconds or null";
  }
  return null;
}

function exactKeys(object: Record<string, unknown>, expected: string[], what: string): string | null {
  const missing = expected.filter((key) => !(key in object));
  if (missing.length) return `${what} is missing ${missing.join(", ")}`;
  const unknown = Object.keys(object).filter((key) => !expected.includes(key));
  if (unknown.length) return `${what} has unknown field ${unknown.join(", ")}`;
  return null;
}

function isTrimmedTextOrNull(value: unknown): boolean {
  return value === null || (typeof value === "string" && TRIMMED_TEXT.test(value));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(problem: string): Checked {
  return { ok: false, problem };
}
