# Tablet navigation evidence — refreshed 2026-10-09

- Before: main `553d4519113192a80fb18376fdb6c1e39fa06387`.
- After: UI commit `c0ed95678dda7baddcdb1eee16dee0611d8b9beb`. Later commits only attach/remove review artifacts.
- Production frontend builds driven through `verify-openhands` against fresh, isolated Local Agent Server/SDK 1.53.0 and automation 1.19.0.
- Chrome 155, 820×1180, English, OpenHands-Neutral, expanded primary sidebar in both runs. No LLM calls.
- MCP compares closed controls; Settings and Skills show the new open choices. The additional LLM pair uses `/settings/llm/` to show the corrected selector and heading.
- Video: 21.2 seconds, 820×1180, 10fps. Captured with main's unchanged `browser record start/stop --gif` workflow. Keyboard MCP → Skills; Plugins → Apps → MCP; Settings → Secrets → browser Back; Escape with focus return; trailing-slash LLM selector.
- Captures were visually inspected. They show fresh local test state and public catalogs. Credential values are never displayed; the Secrets page shows a generated local key's name/description only. No browser profiles, runtime logs or credentials are included.
- Skills cards remain narrow beside the facet column at this width in both versions; this PR does not change that layout.

## Verification

44 focused navigation/route tests passed; the new slash cases failed before the matching fix. `npm run lint` passed (0 errors, 523 existing warnings), `npm run build` and `npm run build:lib` passed. Feature-map check: 27 families, 745 subfeatures. The branch has no diff from main in the verification harness or recording skill instructions.

The live pass checks every Settings/Customize destination, keyboard selection/Escape, outside dismissal, browser Back, phone hubs/Back, desktop links, trailing-slash selection/heading, and the 390/767/768/820/1023/1024/1440px boundaries. Cloud-specific destinations/filtering have component coverage; no live Cloud account or physical touch device was used.

## SHA-256 (unaltered captures)

| File | SHA-256 |
| --- | --- |
| `before-tablet-mcp.png` | `f437e9ffcd9ff867759e684a6d44ccaf807ccc040425384df35017866a237cac` |
| `before-tablet-settings.png` | `897adce3363931238e5d528a021a7fb9a50f6e3b7177b9a20e36753c172c9295` |
| `before-tablet-skills.png` | `98c3def3a479f83734ea66bd25994de4e1938bfb407571c7d57d7cfb3d5f6fa8` |
| `after-tablet-mcp.png` | `83753cb625673732ab541e42ff5e25de0d8fb37916bc2c5093d84752d445d56b` |
| `after-tablet-settings.png` | `d337867696a490ea2492ba4474e03da2a330f857e5867f5576db6b0337b75ddf` |
| `after-tablet-skills.png` | `6437e0e6d5c3bc58270090546cb2d1786095e01bb5c9eec0ed85972d594ff8ac` |
| `before-trailing-slash.png` | `7af7cd001b83971f4c007ea551e2c3716f6327ef44f43ff31a5f5c749ce07743` |
| `after-trailing-slash.png` | `a05fc27191ca4ff7ebf9f5768d3a4b344f69e1805a1bb4e0704d1fc0f865e64d` |
| `tablet-navigation.mp4` | `2c08e753cb7ae920a4d333705c8bfee04704d82e5a96b1d6f78001ff98c8bd40` |
| `tablet-navigation.gif` | `e13cae8ff95b77dbc37082e344bf6858cb2b10ccaf346e0e8101bc1747d302fe` |
