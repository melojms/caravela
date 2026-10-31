

---

# Amazon Devices Platform Context


#amazon_devices_get_started.md

## Report Feedback

When a developer wants to give feedback about Amazon Devices Builder Tools MCP — of any kind, including bugs, feature requests, and general comments — follow instructions from 'amazon_devices_builder_tools_mcp_report_feedback.md'.

Do NOT assume a feedback request is directed at ADBT. The developer may have several MCP servers or tools connected, each with its own feedback mechanism, and a request like "I want to provide feedback" does not say which one it is for. Before running the ADBT feedback workflow, confirm the feedback is about Amazon Devices Builder Tools specifically; if it is not clear, ask. If it is directed at a different MCP server, tool, or product, do NOT run the ADBT feedback workflow — let that other mechanism handle it.

## What's New in Amazon Devices Builder Tools

When the user asks what's new, changed, or fixed in Amazon Devices Builder Tools (ADBT), its latest features, or its release notes, call `read_document(document_uri: "amazon_devices_buildertools_mcp_release_notes.md")` and answer from it. Do not answer from other products' release notes, such as the Vega SDK's.

---

## Update Amazon Devices Builder Tools Files

When the user asks to update Amazon Devices Builder Tools (ADBT) or the files it installed (steering doc, skills, the adbt-dev agent, MCP configuration), run this non-interactive command in a terminal. Use the `--agent` value for the host you are running in: `kiro`, `claude-code-cli`, `cursor`, `github-copilot`, `cline`, `opencode`, `codex` or `gemini-cli`.

```
npx -y @amazon-devices/amazon-devices-buildertools-mcp@latest init-context --agent <agent> --update
```

If ADBT was installed through toolbox (the MCP configuration runs `amazon-devices-buildertools-mcp` rather than `npx`), run `amazon-devices-buildertools-mcp init-context --agent <agent> --update` instead. If the project has an ADBT steering doc, add `--context-document-path "<absolute path of the folder containing it>"`. If an ADBT update banner is already in this conversation, run the exact command it gives instead. Do NOT run `init-context` without `--update` for this: without flags it waits for terminal input, and `--force` reinstalls everything and can change the user's setup. The command only refreshes what is already installed; tell the user what it reported.

---

## ADBT MCP Availability (HARD STOP for porting)

Before Step 1, confirm that `list_documents` and `read_document` from the `amazon-devices-buildertools-mcp`
server are in your tool list. A tool that your client lists by name but has not loaded yet counts as present, for example a tool deferred behind tool search. Load it and continue. If the load finds no such tool, the tool is missing.

If either tool is missing, or a call to either tool fails with a transport, connection or timeout error again after one retry:

- **Port or migration request** (porting a TV app to Vega, the `port_tv_app_to_vega` workflow, or the
  `amazon-devices-vega-app-migration` skill): do not start or resume porting. Show the message below, then
  end the turn.
- **Any other request**: this section does not apply. Do the work as usual.

```text
STOP: the Amazon Devices Builder Tools MCP is not available, so porting will not continue.

I cannot reach the Amazon Devices Builder Tools MCP server (server id: amazon-devices-buildertools-mcp). Its tools list_documents and read_document are missing from my tool list, or a call to one of them failed again after one retry. The port uses workflow documents that only this server provides. I will not replace them with local files, memory or guesses.

Reconnect or enable the server in your client's MCP settings, or restart the client. Steps for common clients:
- Claude Code: run /mcp, select amazon-devices-buildertools-mcp, then select Reconnect.
- GitHub Copilot in VS Code: run the "MCP: List Servers" command, select amazon-devices-buildertools-mcp, then select Start or Restart. In the Chat tools picker, make sure its tools are enabled.
- GitHub Copilot CLI: run /mcp to see the server status, then restart the session.
- Kiro IDE: open the MCP Servers view in the Kiro panel, then enable or retry amazon-devices-buildertools-mcp.
- Kiro CLI: run kiro-cli mcp list to confirm that the server is configured, then restart the chat.
- Cursor: open Cursor Settings, find the MCP section, then turn amazon-devices-buildertools-mcp off and on.
- Cline: open MCP Servers > Installed, then restart amazon-devices-buildertools-mcp.
- Codex: run codex mcp list to confirm that the server is configured, then start a new Codex session.
- Gemini CLI: run /mcp to see the server status, then restart Gemini CLI.
- If the server shows as connected but these tools are still missing, check that it is registered under the name amazon-devices-buildertools-mcp, not under a plugin or the old name vega-devtools-mcp.
If the server is not installed, run: npx -y @amazon-devices/amazon-devices-buildertools-mcp@latest init-context

Then reply "continue". If your client started a new session, say "continue the Vega port" instead. If a port was in progress, its progress is in .migration-checkpoint.json. I will reload the workflow documents from the server first, and then resume from the checkpoint.
```

---

## Session Setup (REQUIRED FOR EVERY NEW START OF Amazon Devices Builder Tools MCP — Complete Before Any Requests are made to the MCP server)

**CRITICAL ENFORCEMENT RULE**: You MUST complete all Steps 1–6 below in order before returning any content to the user, calling any tool, executing any prompt, or reading any resource. No step can be skipped or reordered. No exceptions or the server will report an error. The ADBT MCP Availability check above is the only exception to this order: run it first. The skip conditions written inside a step, such as Step 2's, still apply.

  - **Platform-independent intents (catalog / EMBER / CDF)** resolve to `both` at **Step 3a**; all other work — including every other Appstore SDK integration and all app building/testing/shipping — resolves platform normally through **Steps 1–6**. See **Step 3a** for scope and rationale.

**Do not narrate these steps.** Execute them silently. Only speak to the user when: (a) the platform cannot be determined and you must ask, or (b) the user explicitly asks what platform is active.

---

### Step 1: Read .adbt-config.json

Look for `.adbt-config.json` at the project/repo root. If found, parse it as strict JSON and store the full contents in memory for use in Steps 2 and 3.

**Strict parsing requirement:** Validate as `JSON.parse()` semantics — trailing commas, comments, unquoted keys, or any deviation from the JSON spec means the file is **malformed**. Do NOT extract values by pattern-matching the visible text content.

- If the file is **malformed**: note the error, use an empty config in Step 2, and then proceed to **Step 3** for platform detection.
- If the file is **not found**: use an empty config in Step 2, then proceed to **Step 3**.

---

### Step 2: Send Project Context

If `.adbt-config.json` was found and successfully parsed in Step 1, call `set_project_context` **once** with the parsed contents. Also pass `"project_root"`: the absolute path of the folder containing .adbt-config.json (or the workspace root if there is none).

```
set_project_context({ "config": <parsed .adbt-config.json contents>, "project_root": "<absolute path of the folder containing .adbt-config.json>" })
```

If the config was not found or was malformed, call it with an empty config and the workspace root instead:

```
set_project_context({ "config": {}, "project_root": "<absolute path of the workspace root>" })
```

Do not call this tool again in subsequent interactions.

If `set_project_context` alone is missing from your tool list, skip this step. Otherwise, read the result of the call. If a transport, connection or timeout failure repeats after one retry, run the **ADBT MCP Availability** check above and follow its outcome. A normal error result is not MCP loss: go on to Step 3.

---

### Step 3: Detect Platform

Resolve the platform using the first path below that applies: **Step 3a** (platform-independent intent) → config declaration (from Step 1) → deterministic file indicators (**Step 3b**) → ask the user.

**Step 3a: Platform-independent intent resolution**

If the request matches one of the **supported platform-independent use cases** below, resolve the platform to BOTH — `target_platform: {"device_os": ["vega_os", "fire_os"]}` — and do NOT run file-based detection or ask the user which platform. Do NOT pass a single platform or an empty array. Proceed to Step 4 to store `both` (with `resolved_via: "catalog_intent"`).

**Supported platform-independent use cases:**

1. **Catalog ingestion (catalog / EMBER / CDF).** Match on intent, not keywords: any request to get a partner's content, titles, or metadata into Amazon's catalog. E.g. catalog ingestion, catalog feed/file, EMBER (adapter/catalog), CDF, CDF→EMBER migration, catalog adapter generation, uploading/validating a catalog, Gracenote feed, content/metadata feed, or publish/ingest/onboard a catalog.

**Why `both` is the correct result:** catalog/EMBER/CDF work is platform-independent — a partner's catalog repo is a backend CMS or feed pipeline with no Vega or Fire OS indicators, so file-based detection would yield "no indicators" and force an irrelevant platform question. Catalog documents are tagged for both platforms, so `list_documents` and `search_documentation` need `both` to retrieve them. For a catalog/EMBER/CDF (Step 3a) intent, Step 3a resolution takes precedence over the Step 5 OS-name override — keep the platform at `both`.

**Scope:** this path applies ONLY to catalog work. Everything else is platform-specific — all other Appstore SDK integrations (e.g. IAP, Content Launcher, Content Personalization, Live TV, Media Controls, Parental Controls) and all app building, testing, or shipping — so resolve those through the config/file-indicator/ask paths below.

The remaining resolution paths apply to everything else:

**If `.adbt-config.json` was found and valid (Step 1 succeeded):**

Use its contents as the authoritative platform declaration:

1. If `"platform.paths"` is present AND the agent is operating on a file matching a path prefix → use the **longest matching prefix** value. If the matched value is `"both"`, use `device_os: ["vega_os", "fire_os"]`.
2. Otherwise → use `"platform.default"`.

**Validation rules for the platform value:**
- `"platform"` (required): must be an object
- `"platform.default"` (required): must be one of `"vega_os"`, `"fire_os"`, or `"both"`
- `"platform.paths"` (optional): each value must be `"vega_os"`, `"fire_os"`, or `"both"`

If the platform fields are missing or invalid, treat as malformed and proceed to Step 3b.

→ If platform resolved from config, proceed to Step 4.

**Step 3b — No config (or malformed): Apply Deterministic File Rules**

> ⚠️ **MECHANICAL CHECK — NO INTERPRETATION**: Literal file-presence checks only. Do NOT reason about whether indicators "make sense" for this type of project. If an indicator matches, it counts. The correct remedy for wrong results is a `.adbt-config.json` override file — not agent judgment.

**Vega indicators:**
- `manifest.toml` exists in project root
- `package.json` has `@amazon-devices/` packages listed in its `dependencies` field (NOT `devDependencies`). Examples: `kepler-ui-components`, `vega-`, `kepler-media-account-login`, `security-manager-lib`. Only runtime dependencies signal a Vega app — build tools or dev tooling in `devDependencies` do not count.

**Fire OS indicators:**
- `build.gradle` exists
- `app/src/main/AndroidManifest.xml` exists


Apply in order:

1. **Vega AND Fire OS indicators exist** → ask the user (see mandatory stop below). Suggest creating `.adbt-config.json` for permanent resolution.
2. **Vega indicators only** → platform is `vega_os`. Proceed to Step 4.
3. **Fire OS indicators only** → platform is `fire_os`. Proceed to Step 4.
4. **No indicators** → ask the user (see mandatory stop below). Suggest creating `.adbt-config.json` so they are not asked again.

> 🛑 **AMBIGUOUS OR UNKNOWN PLATFORM — MANDATORY STOP**: Ask the user "Which platform are you developing for?" with options `["Vega (React Native for Fire TV)", "Fire OS (Android / Fire TV)", "Both Vega and Fire OS"]` before doing anything else. Map answers to `device_os`: Vega → `["vega_os"]`, Fire OS → `["fire_os"]`, Both → `["vega_os", "fire_os"]`. Offer to create a `.adbt-config.json` file so they are not asked again. If they accept, read `adbt_config_file.md` for the format.

---

### Step 4: Store and Use the Platform

Store the detected platform for the entire session, and record how it was resolved: `resolved_via: "catalog_intent" | "config" | "file_indicators" | "user"`. All subsequent `list_documents` and `search_documentation` calls MUST include `target_platform` with `device_os` (array).

- Single platform: `target_platform: {"device_os": ["vega_os"]}` or `target_platform: {"device_os": ["fire_os"]}`
- Both platforms: `target_platform: {"device_os": ["vega_os", "fire_os"]}`

When resuming a compacted session, carry forward the previously detected platform and its `resolved_via` without re-detecting. If session intent shifts (e.g., catalog → app development), re-run Step 3 to re-resolve the platform.

**If `"platform.paths"` is active:** re-resolve the platform each interaction based on the current file context (see Step 3). The resolved value may change between interactions — always pass the current value to every tool call.

---

### Step 5: Manual Override (Ongoing Rule)

A manual override is ONLY triggered when the user message contains the **literal exact phrase** "Fire OS", "Android", or "Vega" as the platform name (case-insensitive substring match).

> **Exception — catalog intent:** If `resolved_via == "catalog_intent"`, do NOT apply this override — keep the platform at `both` (see Step 3a).

> 🛑 **MANDATORY AGENT NOTE**: If the user message does NOT contain one of those exact strings, override is FORBIDDEN regardless of any other reasoning.

**Specifically:**
- "Fire TV", "FireTV", "Fire-TV" do NOT match (Fire TV is the device family, not a platform)
- Topic-based reasoning does NOT trigger override — only an explicit OS name from the user counts
- Use the session platform from Step 4 unchanged

**When override IS triggered (literal phrase present):**
- Use the requested platform for that single tool call only
- Do NOT change the session platform
- The next tool call reverts to the session platform

If you find yourself constructing a reason to switch platforms based on the question's subject matter rather than an explicit OS name from the user, **STOP** — use the session platform from Step 4.

---

### Step 6: Load the Platform-Specific Guide

Call `read_document` to load the appropriate development guide. `read_document` takes only `document_uri` (a single string) and does NOT take `target_platform`:

- **If `resolved_via == "catalog_intent"`:** load `read_document(document_uri: "ftv_appstore_sdk_integrations_get_started.md")` DIRECTLY. This is the real destination for catalog/EMBER/CDF work (it is tagged for both platforms), so the platform-specific app-dev guides below are skipped. Do NOT load `react_native_for_vega_get_started.md` or `fire_os_get_started.md` — a catalog task does not need them, and this mirrors how those platform guides themselves hand catalog work off to the integrations guide.
- If platform includes **vega_os**: `read_document(document_uri: "react_native_for_vega_get_started.md")`
- If platform includes **fire_os**: `read_document(document_uri: "fire_os_get_started.md")`
- If both platforms detected (via config or file indicators, not a catalog intent): call `read_document` for **each** guide separately:
  1. `read_document(document_uri: "react_native_for_vega_get_started.md")`
  2. `read_document(document_uri: "fire_os_get_started.md")`

Follow the instructions in the loaded guide for all subsequent interactions.

---

## Workflow Execution Rules (MANDATORY)

When a user requests an action (implement, integrate, set up, configure, test, build, deploy, or submit), you MUST follow these rules:

### Rule 1: Never Skip Steps
Execute each numbered step in the workflow in order. Do not skip steps. You may batch adjacent non-blocking steps (e.g., running two version checks), but never skip a step or jump ahead in the sequence.

### Rule 2: Yield Points Are Mandatory Stops
When a step contains `🛑 YIELD`, you MUST stop and wait for user input. Do not proceed, assume, or simulate the user's response. If the user says "do it later" or "skip", mark that step as PENDING and move to the next step.

### Rule 3: Context Isolation
When a workflow step instructs you to read an external document, extract ONLY the specific information requested, then return to the workflow. Do not follow links, related docs, or tangential instructions from the external document.

### Rule 4: Workflow Chain Compliance
When a workflow specifies "Next Step: proceed to [workflow X]", announce the transition to the user and load the next workflow. Do not skip ahead or combine workflows.

### Rule 5: PENDING Item Tracking
Maintain a visible list of any steps marked PENDING. Remind the user of pending items at the end of each workflow and before submission.

## Document Tools

`list_documents` and `search_documentation` require a `target_platform` parameter:
- `device_os` (required): Array of OS values, e.g. `["vega_os"]`, `["fire_os"]`, or `["vega_os", "fire_os"]`

Always pass the detected platform value(s) from Step 4 to `list_documents` and `search_documentation`.

`read_document` does NOT take `target_platform` — it accepts only `document_uri` (a single string).

**Example tool calls:**
```
list_documents(target_platform: {"device_os": ["vega_os"]})
list_documents(documentType: "KB", target_platform: {"device_os": ["vega_os", "fire_os"]})
search_documentation(query: "IAP setup", target_platform: {"device_os": ["fire_os"]})
read_document(document_uri: "vega_iap_overview.md")
```

If the `target_platform` parameter is empty or missing on `list_documents` or `search_documentation`, the tool will return a `PLATFORM_UNKNOWN` error with instructions. When this happens, ask the user which platform they are developing for and use their response for subsequent calls.

## Debugging and performance requests

Before you name any tool for a debugging or performance problem in a Vega app (re-renders, jank, slow launch, memory, crashes, a blank screen, a page that will not load), `read_document` `react_native_for_vega_debugging_tool_router.md` and follow its Step 0 native-app pre-check first: if the app is native, stop there, do not run the detector, and route to native debugging. Only for a JavaScript (React Native or WebView) app, run the detector yourself (`read_asset` `assets/scripts/detect_vega_app_type.sh`, run the path it returns on the app path, and branch on its exit code); do not decide WebView vs VegaScript by reading `package.json`, `manifest.toml`, or `src/`.

**Document Version**: 10.0.0
**Last Updated**: Oct 20, 2026
**Purpose**: AI Agent Implementation Guide for Amazon Devices app development

---
