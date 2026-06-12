import { createResource, Show } from 'solid-js'

async function fetchHealth(): Promise<string> {
  const res = await fetch('/api/health')
  if (!res.ok) throw new Error(`API returned ${res.status}`)
  const body = (await res.json()) as { status: string }
  return body.status
}

function HomePage() {
  const [health] = createResource(fetchHealth)

  return (
    <main>
      <h1>TataGereja</h1>
      <p>A church Google Sheet, but cleaner, safer, and easier to use.</p>
      <p>
        API health:{' '}
        <Show when={!health.loading} fallback={<span>checking...</span>}>
          <Show when={!health.error} fallback={<strong>unreachable</strong>}>
            <strong>{health()}</strong>
          </Show>
        </Show>
      </p>
    </main>
  )
}

export default HomePage
