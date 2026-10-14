# Local demo skin fixture

This dependency-free Node app is a reviewed fixture for real installed-skin
verification. It serves `/skin-app/` and `/skin-app/api/status`, listens on
`OPENHANDS_SKIN_PORT`, and reads the local Agent Server and automation URLs from
`AGENT_SERVER_URL` and `AUTOMATION_URL`. It never exposes session keys or secret
values and makes no external requests.

Copy the directory into an isolated verification run, initialize a Git checkout,
and create a run-owned bare Git remote. Install that local remote through
Settings → Skin with auto-push initially disabled. Change `revision.txt` in the
skin checkout to prove restart/push; change it in the fixture's source checkout
and push to its bare remote to prove pull. All Git writes stay inside the run.

`skin.yaml` declares a distinct theme and portable configuration metadata: an
offline provider and LLM profile, agent profile, MCP secret reference, language
preference and active pointers. The loopback port 9 URLs are intentionally
unreachable; verification stores this configuration without invoking the model
or MCP server. Supply disposable `QA_SKIN_TOKEN` and `QA_SKIN_PROVIDER_KEY`
values in the guided form. No secret values are present in this fixture.

The reviewed managed skill under `skills/qa-skin-knowledge` is imported through a
package-relative manifest source. Each backend resolves that path inside its own
skin checkout. The second backend can therefore prove managed skill restoration
without depending on the first instance's files, fetching a remote repository,
or invoking a model.

The sample automation is imported disabled and inactive. Its reviewed tarball
contains only `main.py`, which prints `QA_SKIN_AUTOMATION_OK`. Regenerate it with:

```sh
tar --sort=name --mtime='@0' --owner=0 --group=0 --numeric-owner \
  -czf automations/qa-skin-schedule/automation.tar.gz \
  -C automations/qa-skin-schedule main.py
```

Export safety treats archives as needing review, so automatic export pushes may
be blocked. Inspect the tarball and changed files before approving a manual push
to the run-owned Git remote. Keep the committed fixture free of keys,
conversation data and machine-specific paths.
