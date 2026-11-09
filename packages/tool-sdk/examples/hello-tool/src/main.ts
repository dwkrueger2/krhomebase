// file: examples/hello-tool/src/main.ts
// Connects to KR Homebase, asks who is using the tool, and shows the answer.
import { connectToHost } from '@krhomebase/tool-sdk/frame'
import type { ToolContext } from '@krhomebase/tool-sdk/types'
import { tool } from './tool.ts'

const status = document.getElementById('status')!
const reply = document.getElementById('reply')!
const again = document.getElementById('again') as HTMLButtonElement

async function start(): Promise<void> {
  try {
    const host = await connectToHost({ hostOrigins: tool.hostOrigins })
    host.setTitle('Hello Tool')
    status.textContent = `Connected (${host.mode}).`

    const ask = async () => {
      const answer = await host.api.get<ToolContext>('/v1/tools/context')
      if (answer.ok) {
        const who = answer.data.user
        status.textContent = who ? `Hello, ${who.displayName} (${who.role}).` : 'Connected without a person.'
      } else {
        status.textContent = `KR Homebase refused: ${answer.error.code}`
      }
      reply.textContent = JSON.stringify(answer, null, 2)
    }
    again.disabled = false
    again.addEventListener('click', () => void ask())
    await ask()
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : String(error)
  }
}

void start()
