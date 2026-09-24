//! The Inbox: one append-only JSON Lines file per UTC year, `<dir>/<YYYY>.jsonl`.
//!
//! This process is the only writer (ADR 0001). It never renames, moves or
//! rewrites a file, so readers on the other side of the sandbox mount can
//! read at any time. Past years may be compressed or moved away later, so a
//! missing year is normal.

use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};

use chrono::{DateTime, Datelike, SecondsFormat, Utc};
use serde_json::Value;
use sha2::{Digest, Sha256};

type Fingerprint = [u8; 32];

pub struct Inbox {
    dir: PathBuf,
    /// Every Spark id in the Inbox, with a fingerprint of its content.
    known: HashMap<String, Fingerprint>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Outcome {
    Added,
    /// Same id and same content as a Spark already in the Inbox.
    AlreadyHave,
    /// Same id as a Spark already in the Inbox, but different content.
    Conflict,
}

impl Inbox {
    pub fn open(dir: PathBuf) -> io::Result<Self> {
        fs::create_dir_all(&dir)?;
        let mut known = HashMap::new();
        for path in year_files(&dir)? {
            for spark in read_sparks(&path)? {
                if let Some(id) = spark["id"].as_str() {
                    known.insert(id.to_owned(), fingerprint(&spark));
                }
            }
        }
        Ok(Inbox { dir, known })
    }

    /// Adds a validated Spark, unless its id is already in the Inbox.
    pub fn add(&mut self, spark: Value, received_at: DateTime<Utc>) -> io::Result<Outcome> {
        let id = spark["id"].as_str().expect("validated Spark has an id").to_owned();
        let print = fingerprint(&spark);
        match self.known.get(&id) {
            Some(existing) if *existing == print => return Ok(Outcome::AlreadyHave),
            Some(_) => return Ok(Outcome::Conflict),
            None => {}
        }
        let mut line = spark;
        line["received_at"] = received_at.to_rfc3339_opts(SecondsFormat::Millis, true).into();
        append_line(&self.dir.join(format!("{}.jsonl", received_at.year())), &line)?;
        self.known.insert(id, print);
        Ok(Outcome::Added)
    }
}

/// Fingerprint of a Spark's content, ignoring `received_at` and key order.
fn fingerprint(spark: &Value) -> Fingerprint {
    let mut content = spark.clone();
    if let Some(object) = content.as_object_mut() {
        object.remove("received_at");
    }
    // serde_json's Map is sorted by key, so this serialization is canonical.
    Sha256::digest(serde_json::to_vec(&content).expect("a Value serializes")).into()
}

fn year_files(dir: &Path) -> io::Result<Vec<PathBuf>> {
    let mut files = Vec::new();
    for entry in fs::read_dir(dir)? {
        let path = entry?.path();
        let is_year = path.extension().is_some_and(|ext| ext == "jsonl")
            && path
                .file_stem()
                .and_then(|stem| stem.to_str())
                .is_some_and(|stem| stem.parse::<i32>().is_ok());
        if is_year {
            files.push(path);
        }
    }
    Ok(files)
}

/// Every complete, parseable line. A line cut short by a crash is skipped.
fn read_sparks(path: &Path) -> io::Result<Vec<Value>> {
    let text = fs::read_to_string(path)?;
    Ok(text
        .lines()
        .filter_map(|line| serde_json::from_str(line).ok())
        .collect())
}

/// Appends one line with a single write, then flushes it to disk.
///
/// If a crash left the file without a final newline, the new line starts
/// with one, so the cut-off fragment stays a line of its own.
fn append_line(path: &Path, line: &Value) -> io::Result<()> {
    let mut bytes = Vec::new();
    if !ends_with_newline_or_empty(path)? {
        bytes.push(b'\n');
    }
    serde_json::to_writer(&mut bytes, line)?;
    bytes.push(b'\n');
    let mut file = OpenOptions::new().create(true).append(true).open(path)?;
    file.write_all(&bytes)?;
    file.sync_data()
}

fn ends_with_newline_or_empty(path: &Path) -> io::Result<bool> {
    use std::io::{Read, Seek, SeekFrom};
    let mut file = match File::open(path) {
        Ok(file) => file,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(true),
        Err(e) => return Err(e),
    };
    if file.metadata()?.len() == 0 {
        return Ok(true);
    }
    file.seek(SeekFrom::End(-1))?;
    let mut last = [0u8];
    file.read_exact(&mut last)?;
    Ok(last[0] == b'\n')
}
