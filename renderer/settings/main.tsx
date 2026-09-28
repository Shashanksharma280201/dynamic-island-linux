import { Component, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { Settings } from './Settings'
import { SettingsProblem } from './Problem'

/** If anything in Settings fails to render, say so instead of showing a blank window. */
class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error) {
    console.error('[settings]', error)
  }
  render() {
    if (!this.state.error) return this.props.children
    return <SettingsProblem detail={this.state.error.message} />
  }
}

createRoot(document.getElementById('root')!).render(
  <Boundary>
    <Settings />
  </Boundary>,
)
