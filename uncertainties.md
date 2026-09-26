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

## Knowledge-dump Destination

**Format version.** Options: keep `v` at 1 and add `"knowledge-dump"` to the `destination` enum; bump `v` to 2. Picked: keep 1. The spec bumps `v` for a new field, and this adds no field. Every reader already validates against the one schema file, so none of them sees a shape it doesn't know. The cost: a server built before this change rejects knowledge-dump Sparks with a 400, so the server has to be redeployed before the new extension is installed. The case for bumping: `v` would then say which readers can handle a Spark, and a v1-only reader could skip v2 lines instead of treating them as invalid. That would matter once Destinations live in repos that upgrade on their own schedule.

**Old anki-cards and the new schema.** anki-cards reads the schema from tab-squasher's checkout, so an anki-cards from before this change would accept knowledge-dump Sparks and make cards from them. Options: merge both repos' branches together; make old readers safe somehow. Picked: merge together, before the new extension sends anything. No knowledge-dump Sparks exist until then. The counter-argument: a reader that trusts a schema it doesn't pin will keep hitting this, and pinning the schema per reader would stop it.
