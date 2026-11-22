# Standalone SDK Tools
<small>Version 1.1</small><br>
<small>Updated Nov 20, 2026 2:28pm</small>

This folder contains SDK tools developed alongside KR Homebase while remaining portable. Each tool is a self-contained project directory that can be copied to another repository without changing the Homebase workspace.

## Rules

- Each tool owns its package metadata, dependencies, build, Worker, configuration, migrations, docs, and patch list.
- Sequential docs use two-digit order prefixes. Keep the standard root filenames `AGENTS.md`, `README.md`, `PRODUCT.md`, and `DESIGN.md` unchanged.
- Keep a tool's Worker, D1 binding, schema references, and ordered SQL migrations together under `worker-and-d1/`.
- Do not add tools to the root pnpm workspace or root build and deployment scripts.
- A tool must not import code from outside its own directory. Pinned SDK snapshots live inside the tool.
- Read the root `AGENTS.md` and this folder's `AGENTS.md` before tool work. Read the tool's own `AGENTS.md` as well.
- `workers/feedback-viewer` is separate and remains untouched by this folder.

## Tools

| Directory | Purpose | Build |
|---|---|---|
| `google-chat-scraper/` | Read-only Google Chat import staging and human review for Workstream activity proposals. | vinext on Cloudflare Workers; the ingestion Worker and its D1 live inside the tool directory. |

For the first tool's current setup and open requirements, see [`google-chat-scraper/README.md`](google-chat-scraper/README.md).

