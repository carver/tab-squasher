//! tab-squasher server. Listens on loopback only; `tailscale serve` exposes it
//! to the tailnet (issue #3).
//!
//! Environment:
//!   TAB_SQUASHER_INBOX_DIR  where the Inbox year files live (required)
//!   TAB_SQUASHER_PORT       loopback port, default 3816

use std::net::{Ipv4Addr, SocketAddr};
use std::path::PathBuf;
use std::process::ExitCode;

use tab_squasher_server::{SystemClock, app};

const DEFAULT_PORT: u16 = 3816;

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(message) => {
            eprintln!("tab-squasher: {message}");
            ExitCode::FAILURE
        }
    }
}

fn run() -> Result<(), String> {
    let inbox_dir = std::env::var_os("TAB_SQUASHER_INBOX_DIR")
        .map(PathBuf::from)
        .ok_or("TAB_SQUASHER_INBOX_DIR is not set")?;
    let port = match std::env::var("TAB_SQUASHER_PORT") {
        Ok(port) => port
            .parse()
            .map_err(|_| format!("TAB_SQUASHER_PORT {port:?} is not a port number"))?,
        Err(_) => DEFAULT_PORT,
    };
    let router = app(inbox_dir.clone(), SystemClock)
        .map_err(|e| format!("could not open the Inbox at {}: {e}", inbox_dir.display()))?;
    let address = SocketAddr::from((Ipv4Addr::LOCALHOST, port));

    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|e| e.to_string())?;
    runtime.block_on(async {
        let listener = tokio::net::TcpListener::bind(address)
            .await
            .map_err(|e| format!("could not listen on {address}: {e}"))?;
        eprintln!("tab-squasher: listening on {address}, Inbox at {}", inbox_dir.display());
        axum::serve(listener, router)
            .with_graceful_shutdown(shutdown_signal())
            .await
            .map_err(|e| e.to_string())
    })
}

async fn shutdown_signal() {
    use tokio::signal::unix::{SignalKind, signal};
    let mut terminate = signal(SignalKind::terminate()).expect("SIGTERM handler");
    tokio::select! {
        _ = tokio::signal::ctrl_c() => {}
        _ = terminate.recv() => {}
    }
}
