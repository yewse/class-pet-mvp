import { useEffect, useState } from 'react'
import { AdoptPage } from './pages/AdoptPage'
import { ClassroomBoard } from './pages/ClassroomBoard'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { ParentPage } from './pages/ParentPage'
import { ReportPage } from './pages/ReportPage'
import { ShopPage } from './pages/ShopPage'
import { SquadPage } from './pages/SquadPage'
import { TeacherPage } from './pages/TeacherPage'
import { RosterPage } from './pages/RosterPage'
import { GoalsPage } from './pages/GoalsPage'
import { VisitPage } from './pages/VisitPage'
import { getState, logout, resetDemo, subscribe } from './store'
import { subscribeToast } from './toast'
import type { AppState } from './types'

type Tab = 'home' | 'adopt' | 'report' | 'visit' | 'squad' | 'shop' | 'teacher' | 'parent' | 'board' | 'roster' | 'goals'

const ROLE_ZH: Record<string, string> = {
  student: '学生',
  teacher: '老师',
  parent: '家长',
  school: '教务/校长',
}

function defaultTabForRole(role: string): Tab {
  if (role === 'teacher') return 'board'
  if (role === 'parent') return 'parent'
  return 'home'
}

function tabsAllowed(role: string): Tab[] {
  if (role === 'teacher') return ['board', 'teacher', 'squad', 'roster', 'goals']
  if (role === 'parent') return ['parent']
  return ['home', 'adopt', 'report', 'visit', 'squad', 'shop']
}

function tabStorageKey(userId: string) {
  return `class-pet-tab-${userId}`
}

function readSavedTab(userId: string, role: string): Tab {
  try {
    const raw = sessionStorage.getItem(tabStorageKey(userId)) as Tab | null
    if (raw && tabsAllowed(role).includes(raw)) return raw
  } catch {
    /* ignore */
  }
  return defaultTabForRole(role)
}

export default function App() {
  const [state, setState] = useState<AppState>(getState())
  const [tab, setTab] = useState<Tab>(() => {
    const s = getState()
    const u = s.session ? s.users.find((x) => x.id === s.session!.userId) : null
    return u ? readSavedTab(u.id, u.role) : 'home'
  })
  const [ritualHold, setRitualHold] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => subscribe(() => setState(getState())), [])
  useEffect(() => subscribeToast(setToast), [])

  const session = state.session ? state.users.find((u) => u.id === state.session!.userId) : null

  useEffect(() => {
    if (!session) return
    const allowed = tabsAllowed(session.role)
    setTab((cur) => {
      const next = allowed.includes(cur) ? cur : readSavedTab(session.id, session.role)
      try {
        sessionStorage.setItem(tabStorageKey(session.id), next)
      } catch {
        /* ignore */
      }
      return next
    })
  }, [session?.id, session?.role])

  function goTab(id: Tab) {
    setTab(id)
    if (session) {
      try {
        sessionStorage.setItem(tabStorageKey(session.id), id)
      } catch {
        /* ignore */
      }
    }
  }

  const needAdopt = !!session && session.role === 'student' && !state.pets.some((p) => p.ownerId === session.id)
  const stayOnAdopt = needAdopt || ritualHold

  useEffect(() => {
    if (!session) setRitualHold(false)
    else if (needAdopt) setRitualHold(true)
  }, [needAdopt, session?.id])

  if (!session) return <LoginPage />

  const studentId = session.role === 'student' ? session.id : session.studentId ?? ''
  const cls = state.classes?.find((c) => c.id === 'c1')
  const headerTitle = cls?.name ?? state.className ?? '初二（3）班'
  const boardOn = session.role === 'teacher' && tab === 'board'

  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: 'home', label: '宠物主页', show: session.role === 'student' },
    { id: 'adopt', label: '领养', show: session.role === 'student' },
    { id: 'report', label: '申报', show: session.role === 'student' },
    { id: 'visit', label: '宠物互访', show: session.role === 'student' },
    { id: 'squad', label: '小队周赛', show: session.role === 'student' || session.role === 'teacher' },
    { id: 'shop', label: '商城', show: session.role === 'student' },
    { id: 'board', label: '课堂大屏', show: session.role === 'teacher' },
    { id: 'teacher', label: '老师抽查', show: session.role === 'teacher' },
    { id: 'roster', label: '花名册', show: session.role === 'teacher' },
    { id: 'goals', label: '目标', show: session.role === 'teacher' },
    { id: 'parent', label: '家长只读', show: session.role === 'parent' },
  ]

  function confirmReset() {
    if (!window.confirm('确认重置演示？本地进度将恢复为初始样例。')) return
    resetDemo()
  }

  return (
    <div className={boardOn ? 'app app-board' : 'app'}>
      <header>
        <strong>{headerTitle}</strong>
        <span>
          {session.name} · {ROLE_ZH[session.role] ?? session.role}
        </span>
        <div className="header-actions">
          <button type="button" onClick={logout}>
            退出
          </button>
          {session.role === 'teacher' && (
            <button type="button" onClick={confirmReset}>
              重置演示
            </button>
          )}
        </div>
      </header>
      {!stayOnAdopt && session.role !== 'parent' && (
      <nav>
        {tabs
          .filter((t) => t.show)
          .map((t) => (
            <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => goTab(t.id)}>
              {t.label}
            </button>
          ))}
      </nav>
      )}
      <main className={boardOn ? 'main-board' : undefined}>
        {stayOnAdopt && session.role === 'student' && (
          <AdoptPage
            state={state}
            studentId={studentId}
            studentName={session.name}
            onAdopted={() => {
              setRitualHold(false)
              goTab('home')
            }}
          />
        )}
        {!stayOnAdopt && tab === 'home' && session.role === 'student' && (
          <HomePage key={studentId} state={state} studentId={studentId} studentName={session.name} />
        )}
        {!stayOnAdopt && tab === 'adopt' && session.role === 'student' && (
          <AdoptPage state={state} studentId={studentId} studentName={session.name} />
        )}
        {!stayOnAdopt && tab === 'report' && session.role === 'student' && (
          <ReportPage key={studentId} state={state} studentId={studentId} />
        )}
        {!stayOnAdopt && tab === 'visit' && session.role === 'student' && (
          <VisitPage key={studentId} state={state} meId={studentId} />
        )}
        {!stayOnAdopt && tab === 'squad' && (session.role === 'student' || session.role === 'teacher') && (
          <SquadPage state={state} meId={session.id} isTeacher={session.role === 'teacher'} />
        )}
        {!stayOnAdopt && tab === 'shop' && session.role === 'student' && (
          <ShopPage key={studentId} state={state} studentId={studentId} />
        )}
        {tab === 'board' && session.role === 'teacher' && <ClassroomBoard state={state} />}
        {tab === 'teacher' && session.role === 'teacher' && <TeacherPage state={state} classId="c1" />}
        {tab === 'roster' && session.role === 'teacher' && <RosterPage state={state} />}
        {tab === 'goals' && session.role === 'teacher' && <GoalsPage state={state} />}
        {tab === 'parent' && session.role === 'parent' && <ParentPage state={state} parent={session} />}
      </main>
      {toast && <div className="app-toast" role="status">{toast}</div>}
    </div>
  )
}
