# Uncertainties

Decisions made while implementing without the user around. Each lists the options considered, the pick, and why. Revisit any of them; none is hard to change yet.

## Server (#2)

**Remembering what's in the Inbox.** Options: keep every Spark in memory; keep a SHA-256 of each Spark's content keyed by id; re-read the files per request. Picked: id to SHA-256, built at startup from every year file present. That's about 100 bytes per Spark. The hash covers the content minus `received_at`, with keys sorted, so a resend with different key order or whitespace still counts as the same Spark.

## Extension skeleton (#4)

**Saving an address when the server is down.** Options: refuse to save until /health answers; save any well-formed address and report health separately. Picked: save and report. The laptop may simply be asleep while you set up the phone.

## Host install (#3)

**systemd hardening.** Options: `ProtectSystem=strict`, `PrivateTmp` and friends; only `NoNewPrivileges`. Picked: only `NoNewPrivileges`. Several sandboxing options need user namespaces in user units and fail to start on some kernels, and I can't test it here. Worth tightening once it runs on the laptop.

## Signing (#8)

**Updates.** Options: reinstall by hand; have the tab-squasher server host an `update_url` manifest so Firefox updates itself. Picked: by hand for now. An `update_url` would put a fixed tailnet address into the signed build.
