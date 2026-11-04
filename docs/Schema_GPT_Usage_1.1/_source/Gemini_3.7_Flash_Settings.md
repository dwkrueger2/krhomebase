# Gemini 3.7 Flash Settings Report

Updated: August 31, 2026  
Model: `gemini-3.7-flash`  
Connection: Gemini Direct

## Recommended settings

The M0 Gemini editor exposes only settings that are useful for the direct Gemini API connection:

| Setting | Recommendation | Reason |
| --- | --- | --- |
| Endpoint URL | `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` | Matches the Gemini `generateContent` endpoint and keeps the model identifier explicit. |
| Thinking level | `medium` | This is the documented default for Gemini 3.7 Flash. `low`, `medium`, and `high` are supported. |
| Max output tokens | User-configurable; readiness is fixed at `1024` | Keeps the readiness probe small while allowing normal model work to use a larger limit. |
| Temperature, top P, top K | Not sent for Gemini 3.7 Flash | Gemini 3.7 Flash uses thinking level rather than the legacy sampling controls. |
| Input rate | `$0.75` per 1M tokens through December 31, 2026 | Current Standard paid introductory rate. |
| Cached input rate | `$0.075` per 1M tokens through December 31, 2026 | Current Standard context-cache read rate. |
| Output rate | `$3.75` per 1M tokens through December 31, 2026 | Includes thinking tokens. |

The API key is entered or loaded from a text file in the browser, displayed as a password, and revealed only while the eye control is held. The value is passed through the existing Homebase-to-Worker encrypted save path; it is not returned in the usage report.

Google Cloud project ID is optional and is sent as `x-goog-user-project` when supplied. The endpoint, thinking level, token limit, and rates are non-secret model settings and are stored with the approved application settings.

## Deliberate simplification

The M0 card does not expose generic `Config2`, `Config3`, prompt/response storage, or the disabled Gemini sampling fields. Those can be restored if a future Gemini API feature requires them. Delete and update actions remain on the M0 card because this is the provider-specific connection editor.

## Sources

- [Gemini 3.7 Flash model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.7-flash)
- [Gemini thinking documentation](https://ai.google.dev/gemini-api/docs/thinking)
- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
