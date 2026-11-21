# Google Chat and Gemini Readiness
<small>Version 1.2</small><br>
<small>Updated Nov 20, 2026 2:28pm</small>

## Google Chat API capabilities verified from official documentation

- `spaces.messages.list` supports pagination and `createTime` filters. Its app-auth path supports `chat.app.messages.readonly` after administrator approval, and that scope returns public messages in a space, not private messages. The caller must be a member of the space. [Message listing](https://developers.google.com/workspace/chat/api/reference/rest/v1/spaces.messages/list) · [Authentication and authorization](https://developers.google.com/workspace/chat/authenticate-authorize-chat-app)
- Google documents adding a Chat app to a space through the Chat UI. If adding the calling app through the API, the documented membership creation flow uses user authentication and `chat.memberships.app`; app authentication cannot add a Chat app to a space. [Add a Chat app to a space](https://developers.google.com/workspace/chat/create-members)

## Google Cloud and Workspace settings not yet inspected

- [ ] Confirm the actual Cloud project and enable the Google Chat API.
- [ ] Configure the dedicated Chat app/service-account identity and keep its private credential outside this directory and source control.
- [ ] Confirm Workspace allows this specific app; request administrator approval for `chat.app.messages.readonly` only.
- [ ] Add the Chat app itself to **Phone Call & Email Log** through the Chat UI or another supported setup method.
- [ ] Verify the target API resource name; do not infer it from the display title or URL.
- [ ] Inspect history/retention and prove a recent and an older message are available to the app.
- [ ] Confirm target entries are public space messages and verify sender, timestamp, and text fields.
- [ ] Configure Cloudflare Access for the tool and its reviewer policy before exposing source messages.
- [ ] Set and verify the Access team domain and application audience in the tool Worker; the current Wrangler values are placeholders and fail closed.
- [ ] Create the tool-owned D1, set the chosen database id in the Worker config, apply the tool migration, and verify it read-only.
- [ ] Add a Cloudflare Cron Trigger only after the readiness checks and an owner-approved initial sync window.

## Gemini billing and data-use settings not yet inspected

- [ ] Identify the exact Gemini API Cloud project used by this tool.
- [ ] Verify that project has an active Cloud Billing account and receives Paid Service treatment for Gemini API calls.
- [ ] Confirm the firm's confidentiality/data-use requirements for this provider and use case.
- [ ] Test the initial prompt only with synthetic or redacted examples until both checks are complete. The current UI preview does not call Gemini.
- [ ] Do not implement or enable a Gemini call until the Paid Service project and the firm's data-use requirements are confirmed. No Gemini credential or feature flag is configured by this source tree.

Google's current terms say Gemini API access is a Paid Service only when the request uses a Cloud Project associated with an active billing account. The terms say paid prompts and responses are not used to improve Google products, though they may be retained for a limited time for safety and legal purposes. This documentation does not verify the firm's project or legal requirements. [Gemini API terms](https://ai.google.dev/gemini-api/terms) · [Billing status](https://ai.google.dev/gemini-api/docs/billing)

## Existing repository Gemini path (source review only)

The repository contains a Gemini Direct model Worker under `workers/gpt-workers` that calls the Generative Language API `generateContent` path with a server-side API-key binding. The inspected code supports the basic prompt/system-instruction flow; it does not provide this tool with verified billing evidence or a fixed validated response schema. Project documentation still lists Gemini credential/readiness setup as unfinished. No key, `.env`, `.dev.vars`, or credential file was inspected, and no billing console status was available from an authorized source in this task.

This standalone tool does not bind to that Worker or call Gemini. It uses a fixed synthetic UI sample and an empty synthetic preview response. Before adding any model call, implement a fixed JSON response contract and validation, then verify the exact project's Paid Service status and the firm's data-use approval.

