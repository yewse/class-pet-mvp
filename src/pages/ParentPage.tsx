import { HomePage } from './HomePage'
import type { AppState, User } from '../types'
import { parentChild } from '../rules'

export function ParentPage({ state, parent }: { state: AppState; parent: User }) {
  const child = parentChild(state, parent)
  if (!child) return <p>未绑定孩子</p>
  return (
    <div className="parent-wrap">
      <p className="muted parent-line">只读 · {child.name}</p>
      <HomePage state={state} studentId={child.id} readonly />
    </div>
  )
}
