// file: packages/tool-sdk/src/contractSync.test.ts
/**
 * Keeps the kit and the KR Homebase API in step. The kit cannot depend on `@krhomebase/contracts` (it must
 * install on its own), so its lists and shapes are written out again in `types.ts`. This test fails when the
 * two differ. `@krhomebase/contracts` is a development-only dependency of the kit.
 */
import { ToolIconNames, ToolScopes, WidgetSizes, type ToolContextData, type ToolTokenData, type WidgetDefinition as ContractWidgetDefinition } from '@krhomebase/contracts'
import { describe, expect, it } from 'vitest'
import { TOOL_ICONS, TOOL_SCOPES, WIDGET_SIZES, type TokenReply, type ToolContext, type WidgetDefinition } from './types.ts'

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
})
