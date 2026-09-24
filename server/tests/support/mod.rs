//! A server on a temp Inbox dir with a settable clock, driven through HTTP.
#![allow(dead_code)]

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use axum::body::Body;
use axum::http::{Request, StatusCode};
use chrono::{DateTime, Utc};
use http_body_util::BodyExt;
use serde_json::Value;
use tab_squasher_server::{Clock, app};
use tempfile::TempDir;
use tower::ServiceExt;

pub fn fixture(name: &str) -> String {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../spec/fixtures")
        .join(name);
    let path = if path.exists() {
        path
    } else {
        path.parent().unwrap().join("valid").join(name)
    };
    fs::read_to_string(&path).unwrap_or_else(|e| panic!("{}: {e}", path.display()))
}

#[derive(Clone)]
pub struct FakeClock(Arc<Mutex<DateTime<Utc>>>);

impl Clock for FakeClock {
    fn now(&self) -> DateTime<Utc> {
        *self.0.lock().unwrap()
    }
}

pub struct Server {
    dir: TempDir,
    clock: FakeClock,
    router: axum::Router,
}

impl Server {
    pub fn at(time: &str) -> Self {
        let dir = TempDir::new().unwrap();
        let clock = FakeClock(Arc::new(Mutex::new(parse(time))));
        let router = app(dir.path().join("inbox"), clock.clone()).unwrap();
        Server { dir, clock, router }
    }

    /// A fresh server process on the same Inbox dir.
    pub fn restart(self) -> Self {
        let router = app(self.inbox_dir(), self.clock.clone()).unwrap();
        Server { router, ..self }
    }

    pub fn set_time(&self, time: &str) {
        *self.clock.0.lock().unwrap() = parse(time);
    }

    pub fn inbox_dir(&self) -> PathBuf {
        self.dir.path().join("inbox")
    }

    pub async fn post_spark(&self, body: &str) -> (StatusCode, Value) {
        self.send(
            Request::post("/sparks")
                .header("content-type", "application/json")
                .body(Body::from(body.to_owned()))
                .unwrap(),
        )
        .await
    }

    pub async fn send(&self, request: Request<Body>) -> (StatusCode, Value) {
        let response = self.router.clone().oneshot(request).await.unwrap();
        let status = response.status();
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        let body = if bytes.is_empty() {
            Value::Null
        } else {
            serde_json::from_slice(&bytes).unwrap_or(Value::Null)
        };
        (status, body)
    }

    /// The Inbox file for `year`, one parsed JSON value per line.
    pub fn inbox_lines(&self, year: &str) -> Vec<Value> {
        read_lines(&self.inbox_dir().join(format!("{year}.jsonl")))
    }
}

pub fn read_lines(path: &Path) -> Vec<Value> {
    match fs::read_to_string(path) {
        Ok(text) => text.lines().map(|line| serde_json::from_str(line).unwrap()).collect(),
        Err(_) => Vec::new(),
    }
}

fn parse(time: &str) -> DateTime<Utc> {
    time.parse().unwrap()
}

impl Server {
    pub async fn send_raw(&self, request: Request<Body>) -> axum::response::Response {
        self.router.clone().oneshot(request).await.unwrap()
    }
}
