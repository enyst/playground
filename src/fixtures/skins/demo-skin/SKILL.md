---
name: qa-demo-skin
description: A local dependency-free skin fixture for verifying the Canvas skin lifecycle.
---

# QA Demo Skin

This fixture serves a local status page at `/skin-app/` and a read-only API at
`/skin-app/api/status`. The page's **Check skin API** button reads that endpoint.
The response contains the fixture revision and local backend URLs, never keys
or secret values. The running process reads `revision.txt` at startup; edit that
file and use the authenticated instance `/skin-api/restart` endpoint to apply it.

Stay within this verification run's skin checkout. No model task, external
service, or external repository write is needed to use this fixture.
