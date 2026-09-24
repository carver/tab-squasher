//! Checking a request body against the Spark format in `spec/`.

use std::sync::LazyLock;

use jsonschema::Validator;
use serde_json::Value;

use crate::strict_json;

/// Largest request body accepted, in bytes. See spec/README.md.
pub const MAX_BODY_BYTES: usize = 65_536;

/// Longest error message returned to a client. Schema errors quote the
/// offending value, which can be most of a 64 KB body.
const MAX_REASON_CHARS: usize = 300;

static SCHEMA_JSON: LazyLock<Value> = LazyLock::new(|| {
    serde_json::from_str(include_str!("../../spec/spark.schema.json")).expect("spec/spark.schema.json is valid JSON")
});

static SCHEMA: LazyLock<Validator> =
    LazyLock::new(|| jsonschema::draft202012::new(&SCHEMA_JSON).expect("spec/spark.schema.json is a valid schema"));

/// Why a body isn't a valid Spark, short enough to send back to the client.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Rejection(pub String);

impl Rejection {
    fn new(reason: impl Into<String>) -> Self {
        let reason: String = reason.into();
        Rejection(match reason.char_indices().nth(MAX_REASON_CHARS) {
            Some((cut, _)) => format!("{}...", &reason[..cut]),
            None => reason,
        })
    }
}

/// Parses and checks one Spark request body. See spec/README.md for the rules.
pub fn validate(body: &[u8]) -> Result<Value, Rejection> {
    if body.len() > MAX_BODY_BYTES {
        return Err(Rejection::new(format!(
            "body is {} bytes, over the {MAX_BODY_BYTES} byte limit",
            body.len()
        )));
    }
    let spark = strict_json::parse(body).map_err(|e| Rejection::new(format!("not valid JSON: {e}")))?;
    match SCHEMA.validate(&spark) {
        Ok(()) => Ok(spark),
        Err(error) => Err(Rejection::new(describe(&error))),
    }
}

/// Words for a schema violation. A failed cross-field rule (an `allOf`
/// entry) is described by that rule's `description` in the schema, since
/// the validator's own message would quote the whole Spark.
fn describe(error: &jsonschema::ValidationError) -> String {
    let schema_path = error.schema_path().to_string();
    let rule = schema_path
        .strip_prefix("/allOf/")
        .and_then(|rest| rest.split('/').next())
        .and_then(|index| SCHEMA_JSON["allOf"].get(index.parse::<usize>().ok()?))
        .and_then(|rule| rule["description"].as_str());
    match rule {
        Some(description) => description.to_owned(),
        None => format!("at {:?}: {error}", error.instance_path().to_string()),
    }
}
