// file: packages/tool-sdk/src/version.ts
/**
 * The kit's own version, the same value as `version` in this package's `package.json` (`version.test.ts` checks that
 * they agree). The kit is its own version track (`AGENTS_01_version-procedures.md`, the requester's decision of
 * Nov 20, 2026): this number names the release file (`krhomebase-tool-sdk-<version>.tgz`), the release zip and the
 * release in the krhomebase-sdk repository, and KR Homebase shows it on its Outside tools screen.
 *
 * A developer can print it to say which kit a tool was built with:
 *
 *   import { TOOL_SDK_VERSION } from '@krhomebase/tool-sdk/version'
 */
export const TOOL_SDK_VERSION = '1.2.0'
