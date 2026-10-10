import { RotateCw, WifiOff } from 'lucide-react'
import { Component, type ReactNode } from 'react'
import { Button } from './Button'
import { Card, Empty } from './primitives'

/**
 * Catches a page whose data failed to load and offers a retry. Retrying remounts the
 * children, so every `useLoad` below starts again. Keyed by route in the shell, so moving
 * to another page clears it.
 */
export class LoadBoundary extends Component<{ children: ReactNode }, { error?: unknown; attempt: number }> {
  state: { error?: unknown; attempt: number } = { attempt: 0 }

  static getDerivedStateFromError(error: unknown) {
    return { error }
  }

  componentDidCatch(error: unknown) {
    console.warn('page failed to load', error)
  }

  render() {
    if (this.state.error)
      return (
        <Card>
          <Empty
            icon={<WifiOff size={18} />}
            title="This page could not load"
            body="The data source did not answer. Nothing was changed."
            action={
              <Button variant="secondary" icon={RotateCw} onClick={() => this.setState((s) => ({ error: undefined, attempt: s.attempt + 1 }))}>
                Try again
              </Button>
            }
          />
        </Card>
      )
    return <div key={this.state.attempt}>{this.props.children}</div>
  }
}
