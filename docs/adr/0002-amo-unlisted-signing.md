# Sign the extension as unlisted on AMO

Release Firefox on Android only keeps an extension installed if Mozilla signed it. Without signing, the only option is `web-ext run` over adb, which is temporary and needs the phone plugged in. We sign through AMO as unlisted. That gives a private .xpi that installs permanently on desktop and Android and never appears in the public listing. It costs a Mozilla account and API keys, plus a signing step in the release flow.
