mod support;

use std::collections::HashMap;

use axum::http::StatusCode;
use proptest::prelude::*;
use serde_json::{Value, json};

use support::{Server, fixture};

const IDS: [&str; 3] = [
    "3f0c1d9e-6a57-4e57-9d64-2b1b4f0f6c11",
    "0b6f8f3c-3a52-4c1e-8f5e-2d7f6a9b1c20",
    "a4e2b9d1-7c3f-4a8e-b1d6-9f0e2c5a7b33",
];
const NOTES: [&str; 2] = ["First version", "Edited version"];

#[derive(Debug, Clone)]
enum Step {
    Send { id: usize, note: usize },
    Restart,
}

fn step() -> impl Strategy<Value = Step> {
    prop_oneof![
        6 => (0..IDS.len(), 0..NOTES.len()).prop_map(|(id, note)| Step::Send { id, note }),
        1 => Just(Step::Restart),
    ]
}

fn spark(id: usize, note: usize) -> Value {
    let mut spark: Value = serde_json::from_str(&fixture("note_only.json")).unwrap();
    spark["id"] = json!(IDS[id]);
    spark["note"] = json!(NOTES[note]);
    spark
}

proptest! {
    /// Whatever order Sparks arrive and restarts happen in, the first
    /// content sent for an id is the one kept: 201 the first time, 200 for
    /// the same content again, 409 for different content. The Inbox ends
    /// with exactly one line per id.
    #[test]
    fn the_inbox_keeps_exactly_the_first_version_of_each_spark(steps in prop::collection::vec(step(), 1..40)) {
        let runtime = tokio::runtime::Builder::new_current_thread().build().unwrap();
        runtime.block_on(async {
            let mut server = Server::at("2026-09-24T03:15:00Z");
            let mut first_note: HashMap<usize, usize> = HashMap::new();
            for step in steps {
                match step {
                    Step::Restart => server = server.restart(),
                    Step::Send { id, note } => {
                        let expected = match first_note.get(&id) {
                            None => StatusCode::CREATED,
                            Some(first) if *first == note => StatusCode::OK,
                            Some(_) => StatusCode::CONFLICT,
                        };
                        first_note.entry(id).or_insert(note);
                        let (status, _) = server.post_spark(&spark(id, note).to_string()).await;
                        assert_eq!(status, expected);
                    }
                }
            }
            let lines = server.inbox_lines("2026");
            assert_eq!(lines.len(), first_note.len());
            for line in lines {
                let id = IDS.iter().position(|id| line["id"] == *id).unwrap();
                assert_eq!(line["note"], json!(NOTES[first_note[&id]]));
            }
        });
    }
}
