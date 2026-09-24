mod support;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use serde_json::{Value, json};

use support::{Server, fixture};

#[tokio::test]
async fn a_new_spark_is_accepted_and_appended_to_the_inbox() {
    let server = Server::at("2026-09-24T03:15:00.250Z");
    let spark = fixture("note_and_quote.json");

    let (status, body) = server.post_spark(&spark).await;

    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(
        body,
        json!({"id": "3f0c1d9e-6a57-4e57-9d64-2b1b4f0f6c11", "status": "inbox"})
    );
    let mut expected: Value = serde_json::from_str(&spark).unwrap();
    expected["received_at"] = json!("2026-09-24T03:15:00.250Z");
    assert_eq!(server.inbox_lines("2026"), vec![expected]);
}

#[tokio::test]
async fn sending_the_same_spark_again_is_ok_and_writes_nothing() {
    let server = Server::at("2026-09-24T03:15:00Z");
    let spark = fixture("note_and_quote.json");
    server.post_spark(&spark).await;

    let (status, body) = server.post_spark(&spark).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        body,
        json!({"id": "3f0c1d9e-6a57-4e57-9d64-2b1b4f0f6c11", "status": "inbox"})
    );
    assert_eq!(server.inbox_lines("2026").len(), 1);
}

#[tokio::test]
async fn key_order_and_formatting_do_not_make_a_resend_look_different() {
    let server = Server::at("2026-09-24T03:15:00Z");
    let spark: Value = serde_json::from_str(&fixture("note_and_quote.json")).unwrap();
    server.post_spark(&spark.to_string()).await;
    let reordered = format!(
        r#"{{"captured_at":{},"source":{},"selection":{},"quote":{},"note":{},"destination":"anki","id":{},"v":1}}"#,
        spark["captured_at"], spark["source"], spark["selection"], spark["quote"], spark["note"], spark["id"]
    );

    let (status, _) = server.post_spark(&reordered).await;

    assert_eq!(status, StatusCode::OK);
}

#[tokio::test]
async fn a_different_spark_with_a_known_id_conflicts_and_writes_nothing() {
    let server = Server::at("2026-09-24T03:15:00Z");
    server.post_spark(&fixture("note_and_quote.json")).await;
    let mut changed: Value = serde_json::from_str(&fixture("note_and_quote.json")).unwrap();
    changed["note"] = json!("An edited note");

    let (status, body) = server.post_spark(&changed.to_string()).await;

    assert_eq!(status, StatusCode::CONFLICT);
    assert!(body["error"].is_string());
    assert_eq!(server.inbox_lines("2026").len(), 1);
}

#[tokio::test]
async fn an_invalid_spark_is_rejected_with_a_reason_and_writes_nothing() {
    let server = Server::at("2026-09-24T03:15:00Z");

    let (status, body) = server.post_spark(&fixture("invalid/neither_note_nor_quote.json")).await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body, json!({"error": "A Spark needs a Note, a Quote, or both."}));
    assert!(server.inbox_lines("2026").is_empty());
}

#[tokio::test]
async fn a_body_over_the_size_limit_is_refused() {
    let server = Server::at("2026-09-24T03:15:00Z");

    let (status, _) = server.post_spark(&fixture("invalid/one_byte_over_max_size.json")).await;

    assert_eq!(status, StatusCode::PAYLOAD_TOO_LARGE);
    assert!(server.inbox_lines("2026").is_empty());
}

#[tokio::test]
async fn a_body_exactly_at_the_size_limit_is_accepted() {
    let server = Server::at("2026-09-24T03:15:00Z");

    let (status, _) = server.post_spark(&fixture("valid/exactly_max_size.json")).await;

    assert_eq!(status, StatusCode::CREATED);
}

#[tokio::test]
async fn a_restarted_server_still_knows_every_spark_in_the_inbox() {
    let server = Server::at("2026-09-24T03:15:00Z");
    server.post_spark(&fixture("note_and_quote.json")).await;
    let mut changed: Value = serde_json::from_str(&fixture("note_and_quote.json")).unwrap();
    changed["note"] = json!("An edited note");

    let server = server.restart();

    assert_eq!(
        server.post_spark(&fixture("note_and_quote.json")).await.0,
        StatusCode::OK
    );
    assert_eq!(server.post_spark(&changed.to_string()).await.0, StatusCode::CONFLICT);
    assert_eq!(server.inbox_lines("2026").len(), 1);
}

#[tokio::test]
async fn sparks_go_to_the_file_for_the_utc_year_they_are_received_in() {
    let server = Server::at("2026-12-31T23:59:59.999Z");
    server.post_spark(&fixture("note_only.json")).await;
    let mut next: Value = serde_json::from_str(&fixture("quote_only.json")).unwrap();
    next["id"] = json!("0b6f8f3c-3a52-4c1e-8f5e-2d7f6a9b1c20");

    server.set_time("2027-01-01T00:00:00Z");
    server.post_spark(&next.to_string()).await;

    assert_eq!(server.inbox_lines("2026").len(), 1);
    assert_eq!(
        server.inbox_lines("2027"),
        vec![{
            next["received_at"] = json!("2027-01-01T00:00:00.000Z");
            next
        }]
    );
}

#[tokio::test]
async fn sparks_from_earlier_years_still_count_after_a_restart() {
    let server = Server::at("2026-12-31T23:00:00Z");
    server.post_spark(&fixture("note_only.json")).await;
    server.set_time("2027-02-01T00:00:00Z");

    let server = server.restart();

    assert_eq!(server.post_spark(&fixture("note_only.json")).await.0, StatusCode::OK);
    assert!(server.inbox_lines("2027").is_empty());
}

#[tokio::test]
async fn a_missing_past_year_is_not_an_error() {
    let server = Server::at("2027-02-01T00:00:00Z");
    server.post_spark(&fixture("note_only.json")).await;
    std::fs::rename(
        server.inbox_dir().join("2027.jsonl"),
        server.inbox_dir().join("..").join("moved.jsonl"),
    )
    .unwrap();

    let server = server.restart();

    assert_eq!(
        server.post_spark(&fixture("quote_only.json")).await.0,
        StatusCode::CREATED
    );
}

#[tokio::test]
async fn a_line_cut_short_by_a_crash_is_ignored_and_kept_apart_from_new_lines() {
    let server = Server::at("2026-09-24T03:15:00Z");
    std::fs::create_dir_all(server.inbox_dir()).unwrap();
    let fragment = &fixture("note_only.json").replace('\n', "")[..80];
    std::fs::write(server.inbox_dir().join("2026.jsonl"), fragment).unwrap();

    let server = server.restart();
    let (status, _) = server.post_spark(&fixture("note_only.json")).await;

    assert_eq!(status, StatusCode::CREATED, "the fragment's id must not count as known");
    let text = std::fs::read_to_string(server.inbox_dir().join("2026.jsonl")).unwrap();
    let lines: Vec<_> = text.lines().collect();
    assert_eq!(lines.len(), 2);
    assert_eq!(lines[0], fragment);
    assert!(serde_json::from_str::<Value>(lines[1]).is_ok());
}

#[tokio::test]
async fn health_reports_ok_and_the_server_version() {
    let server = Server::at("2026-09-24T03:15:00Z");

    let (status, body) = server.send(Request::get("/health").body(Body::empty()).unwrap()).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, json!({"status": "ok", "version": env!("CARGO_PKG_VERSION")}));
}

fn preflight(origin: &str) -> Request<Body> {
    Request::options("/sparks")
        .header("origin", origin)
        .header("access-control-request-method", "POST")
        .header("access-control-request-headers", "content-type")
        .body(Body::empty())
        .unwrap()
}

#[tokio::test]
async fn extension_pages_may_call_the_server_cross_origin() {
    let server = Server::at("2026-09-24T03:15:00Z");
    let origin = "moz-extension://6f1c7e0a-2b1d-4c1e-9a3e-5d2f8b7c4e10";

    let response = server.send_raw(preflight(origin)).await;

    assert_eq!(response.headers().get("access-control-allow-origin").unwrap(), origin);
}

#[tokio::test]
async fn ordinary_web_pages_may_not_call_the_server_cross_origin() {
    let server = Server::at("2026-09-24T03:15:00Z");

    let response = server.send_raw(preflight("https://example.com")).await;

    assert!(response.headers().get("access-control-allow-origin").is_none());
}

#[tokio::test]
async fn a_crash_that_cut_a_multibyte_character_does_not_stop_the_server_starting() {
    let server = Server::at("2026-09-24T03:15:00Z");
    server.post_spark(&fixture("non_ascii.json")).await;
    let path = server.inbox_dir().join("2026.jsonl");
    let mut bytes = std::fs::read(&path).unwrap();
    let cut = bytes.iter().position(|&b| b >= 0x80).unwrap() + 1; // inside a UTF-8 sequence
    let fragment = bytes[..cut].to_vec();
    bytes.extend_from_slice(&fragment);
    std::fs::write(&path, &bytes).unwrap();

    let server = server.restart();

    assert_eq!(server.post_spark(&fixture("non_ascii.json")).await.0, StatusCode::OK);
    assert_eq!(
        server.post_spark(&fixture("note_only.json")).await.0,
        StatusCode::CONFLICT
    );
}

#[tokio::test]
async fn a_failed_write_is_a_server_error_that_does_not_reveal_local_paths() {
    use std::os::unix::fs::PermissionsExt;
    let server = Server::at("2026-09-24T03:15:00Z");
    std::fs::set_permissions(server.inbox_dir(), std::fs::Permissions::from_mode(0o555)).unwrap();

    let (status, body) = server.post_spark(&fixture("note_only.json")).await;

    std::fs::set_permissions(server.inbox_dir(), std::fs::Permissions::from_mode(0o755)).unwrap();
    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
    assert_eq!(body, json!({"error": "could not write to the Inbox"}));
}
