// file: packages/tool-sdk/src/contractSync.test.ts
/**
 * Keeps the kit and the KR Homebase API in step. The kit cannot depend on `@krhomebase/contracts` (it must
 * install on its own), so its lists and shapes are written out again in `types.ts`. This test fails when the
 * two differ. `@krhomebase/contracts` is a development-only dependency of the kit.
 */
import { checkToolIcon as contractCheckToolIcon, TOOL_HEALTH_PATH as CONTRACT_HEALTH_PATH, ToolIconNames, ToolRoleNames, ToolScopes, WidgetSizes, type ToolContextData, type ToolTokenData, type WidgetDefinition as ContractWidgetDefinition } from '@krhomebase/contracts'
import { describe, expect, it } from 'vitest'
import { checkToolIcon } from './toolIcon.ts'
import { ICON_SAMPLES } from './toolIcon.testdata.ts'
import { TOOL_HEALTH_PATH, TOOL_ICONS, TOOL_ROLES, TOOL_SCOPES, WIDGET_SIZES, type TokenReply, type ToolContext, type WidgetDefinition } from './types.ts'

// Type checks, both ways: `pnpm typecheck` fails if a field is added, removed or changed on either side.
const contextToSdk = (value: ToolContextData): ToolContext => value
const sdkToContext = (value: ToolContext): ToolContextData => value
const tokenToSdk = (value: ToolTokenData): TokenReply => value
const sdkToToken = (value: TokenReply): ToolTokenData => value
const widgetToSdk = (value: ContractWidgetDefinition): WidgetDefinition => value
const sdkToWidget = (value: WidgetDefinition): ContractWidgetDefinition => value

describe('kit and API agree', () => {
  it('on the permission and icon lists', () => {
    expect([...TOOL_SCOPES]).toEqual([...ToolScopes])
    expect([...TOOL_ICONS]).toEqual([...ToolIconNames])
    expect([contextToSdk, sdkToContext, tokenToSdk, sdkToToken, widgetToSdk, sdkToWidget]).toHaveLength(6)
  })

  it('on the widget sizes', () => {
    expect([...WIDGET_SIZES]).toEqual([...WidgetSizes])
  })

  it('on the roles and the health address', () => {
    expect([...TOOL_ROLES]).toEqual([...ToolRoleNames])
    expect(TOOL_HEALTH_PATH).toBe(CONTRACT_HEALTH_PATH)
  })

  it('on every sample tool icon (the check is written out in both packages)', () => {
    for (const sample of ICON_SAMPLES) expect(contractCheckToolIcon(sample), sample).toEqual(checkToolIcon(sample))
  })
})
