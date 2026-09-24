//! HTTP routes. See issue #2 and spec/README.md.

use std::io;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use axum::Router;
use axum::body::Bytes;
use axum::extract::{DefaultBodyLimit, State};
use axum::http::StatusCode;
use axum::http::{HeaderValue, Method, header};
use axum::response::{IntoResponse, Json, Response};
use axum::routing::{get, post};
use serde_json::json;
use tower_http::cors::{AllowOrigin, CorsLayer};

use crate::Clock;
use crate::inbox::{Inbox, Outcome};
use crate::spark::{self, MAX_BODY_BYTES};

struct Shared {
    inbox: Mutex<Inbox>,
    clock: Box<dyn Clock>,
}

pub fn app(inbox_dir: PathBuf, clock: impl Clock) -> io::Result<Router> {
    let shared = Arc::new(Shared {
        inbox: Mutex::new(Inbox::open(inbox_dir)?),
        clock: Box::new(clock),
    });
    Ok(Router::new()
        .route("/sparks", post(post_spark))
        .route("/health", get(health))
        .layer(DefaultBodyLimit::max(MAX_BODY_BYTES))
        .layer(extension_cors())
        .with_state(shared))
}

/// Lets the extension's own pages call the server. The background script
/// doesn't need this (host permission covers it), but a fetch from the
/// popup page shouldn't break. Ordinary web pages get no CORS access.
fn extension_cors() -> CorsLayer {
    CorsLayer::new()
        .allow_origin(AllowOrigin::predicate(|origin: &HeaderValue, _| {
            origin.as_bytes().starts_with(b"moz-extension://")
        }))
        .allow_methods([Method::GET, Method::POST])
        .allow_headers([header::CONTENT_TYPE])
}

async fn health() -> Json<serde_json::Value> {
    Json(json!({"status": "ok", "version": env!("CARGO_PKG_VERSION")}))
}

async fn post_spark(State(shared): State<Arc<Shared>>, body: Bytes) -> Response {
    let spark = match spark::validate(&body) {
        Ok(spark) => spark,
        Err(rejection) => return error(StatusCode::BAD_REQUEST, &rejection.0),
    };
    let id = spark["id"].clone();
    let outcome = shared.inbox.lock().expect("inbox lock").add(spark, shared.clock.now());
    match outcome {
        Ok(Outcome::Added) => (StatusCode::CREATED, Json(json!({"id": id, "status": "inbox"}))).into_response(),
        Ok(Outcome::AlreadyHave) => (StatusCode::OK, Json(json!({"id": id, "status": "inbox"}))).into_response(),
        Ok(Outcome::Conflict) => error(
            StatusCode::CONFLICT,
            "a different Spark with this id is already in the Inbox",
        ),
        Err(e) => {
            eprintln!("tab-squasher: could not write to the Inbox: {e}");
            error(
                StatusCode::INTERNAL_SERVER_ERROR,
                &format!("could not write to the Inbox: {e}"),
            )
        }
    }
}

fn error(status: StatusCode, reason: &str) -> Response {
    (status, Json(json!({"error": reason}))).into_response()
}
