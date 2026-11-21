# Product
<small>Version 1.0</small><br>
<small>Updated Nov 20, 2026 10:33am</small>

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

vinext with Cloudflare Workers; this choice was explicitly requested.

## Users

KR Homebase staff who review call and email log entries from the designated Google Chat space.

## Product Purpose

Read messages from the approved **Phone Call & Email Log** space, stage candidate activities, and let a person review each proposal before any Workstream activity is created.

## Positioning

The tool is a portable SDK tool with its own app, ingestion Worker, D1 intake queue, dependencies, and docs. It does not join the Homebase web/API build or reuse another tool's Worker.

## Operating Context

The source is Google Chat. The initial target is the named Phone Call & Email Log space. The tool is read-only in Chat and may identify zero, one, or several activity proposals from a message. A person must resolve ambiguities and explicitly approve any eventual Workstream entry.

## Capabilities and Constraints

- Use one dedicated Google Chat app/service-account identity and the narrow `chat.app.messages.readonly` scope after Workspace-admin approval.
- The app itself must be a member of the exact source space.
- Do not impersonate a super-admin user, request organization-wide scopes, or post to Chat.
- Store imported messages and proposals in a separate tool-owned D1 intake queue. Pending items are not Workstream activities.
- Use synthetic or redacted examples only with Gemini until the exact API project is verified as a Paid Service and the firm's data-use requirements are confirmed.
- The Chat API resource name, Workspace setup, space membership, retention, Gemini billing, and firm data-use approval remain open until independently verified.
- Homebase ledger creation needs an authorized, idempotent tool route for Workstream activity attribution. That API integration is not implemented in this isolated tool patch.

## Evidence on Hand

The repository has a Gemini Direct model Worker and an SDK for outside tools. These source patterns establish code capability only; they do not establish current Google Cloud, Workspace, billing, or permission settings. This first tool patch is a gated scaffold; live ingestion and extraction are not implemented.

## Product Principles

1. Read only the named Google Chat space.
2. Keep external messages and proposals in the intake queue until human action.
3. Keep every generated fact traceable to its source message.
4. Treat Chat text as untrusted input.
5. Keep the whole tool moveable as one directory.

