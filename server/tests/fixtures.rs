use std::fs;
use std::path::PathBuf;

use tab_squasher_server::spark::validate;

fn fixtures(kind: &str) -> Vec<(String, Vec<u8>)> {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../spec/fixtures")
        .join(kind);
    let mut cases: Vec<_> = fs::read_dir(&dir)
        .unwrap_or_else(|e| panic!("reading {}: {e}", dir.display()))
        .map(|entry| {
            let path = entry.unwrap().path();
            let name = path.file_name().unwrap().to_string_lossy().into_owned();
            (name, fs::read(&path).unwrap())
        })
        .collect();
    cases.sort();
    assert!(!cases.is_empty(), "no fixtures in {}", dir.display());
    cases
}

#[test]
fn accepts_every_valid_fixture() {
    let rejected: Vec<_> = fixtures("valid")
        .into_iter()
        .filter_map(|(name, body)| validate(&body).err().map(|e| format!("{name}: {}", e.0)))
        .collect();
    assert!(rejected.is_empty(), "valid fixtures rejected:\n{}", rejected.join("\n"));
}

#[test]
fn rejects_every_invalid_fixture() {
    let accepted: Vec<_> = fixtures("invalid")
        .into_iter()
        .filter(|(_, body)| validate(body).is_ok())
        .map(|(name, _)| name)
        .collect();
    assert!(accepted.is_empty(), "invalid fixtures accepted: {accepted:?}");
}

fn reason_for(kind: &str, name: &str) -> String {
    let (_, body) = fixtures(kind).into_iter().find(|(n, _)| n == name).unwrap();
    validate(&body).unwrap_err().0
}

#[test]
fn cross_field_rules_are_explained_in_words() {
    assert_eq!(
        reason_for("invalid", "neither_note_nor_quote.json"),
        "A Spark needs a Note, a Quote, or both."
    );
    assert_eq!(
        reason_for("invalid", "selection_without_quote.json"),
        "A Selection is kept exactly when there is a Quote."
    );
}

#[test]
fn reasons_stay_short_even_when_the_body_is_huge() {
    let mut spark: serde_json::Value = serde_json::from_slice(
        &fixtures("valid")
            .into_iter()
            .find(|(n, _)| n == "note_only.json")
            .unwrap()
            .1,
    )
    .unwrap();
    spark["note"] = " ".repeat(40_000).into();
    let reason = validate(spark.to_string().as_bytes()).unwrap_err().0;
    assert!(reason.chars().count() <= 303, "{} chars", reason.chars().count());
}
