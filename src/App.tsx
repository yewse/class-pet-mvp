import { useEffect, useState } from 'react'
import { AdoptPage } from './pages/AdoptPage'
import { ClassroomBoard } from './pages/ClassroomBoard'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { ReportPage } from './pages/ReportPage'
import { ShopPage } from './pages/ShopPage'
import { SquadPage } from './pages/SquadPage'
import { TeacherPage } from './pages/TeacherPage'
import { RosterPage } from './pages/RosterPage'
import { GoalsPage } from './pages/GoalsPage'
import { VisitPage } from './pages/VisitPage'
import { WeeklyReportPage } from './pages/WeeklyReportPage'
import { AdminPage } from './pages/AdminPage'
import { getSnapshot, initStore, logout, refreshState, setActiveClass, subscribe } from './store'
import { subscribeToast, type ToastPayload } from './toast'
import { ROLE_ZH, isHomeroomRole, isStaffRole } from './types'

type Tab = 'home' | 'adopt' | 'report' | 'visit' | 'squad' | 'shop' | 'teacher' | 'board' | 'roster' | 'goals' | 'week'

const POLL_MS = 8000

function defaultTabForRole(role: string): Tab {
  if (isStaffRole(role)) return 'board'
  return 'home'
}

function tabsAllowed(role: string): Tab[] {
  if (role === 'homeroom') return ['board', 'teacher', 'goals', 'week', 'roster', 'squad']
  if (role === 'subject') return ['board', 'teacher']
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
  const [snap, setSnap] = useState(getSnapshot())
  const [tab, setTab] = useState<Tab>('home')
  const [ritualHold, setRitualHold] = useState(false)
  const [toast, setToast] = useState<ToastPayload>(null)

  useEffect(() => subscribe(() => setSnap(getSnapshot())), [])
  useEffect(() => subscribeToast(setToast), [])
  useEffect(() => {
    void initStore()
  }, [])

  /* 轮询：课堂里多端同时操作时保持大屏与学生端新鲜 */
  useEffect(() => {
    if (snap.phase !== 'ready') return
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshState()
    }, POLL_MS)
    const onFocus = () => void refreshState()
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [snap.phase])

  const me = snap.me
  const state = snap.state

  useEffect(() => {
    if (!me) return
    const allowed = tabsAllowed(me.role)
    setTab((cur) => {
      const next = allowed.includes(cur) ? cur : readSavedTab(me.id, me.role)
      try {
        sessionStorage.setItem(tabStorageKey(me.id), next)
      } catch {
        /* ignore */
      }
      return next
    })
  }, [me?.id, me?.role])

  function goTab(id: Tab) {
    setTab(id)
    if (me) {
      try {
        sessionStorage.setItem(tabStorageKey(me.id), id)
      } catch {
        /* ignore */
      }
    }
  }

  if (snap.phase === 'loading') {
    return (
      <div className="card login-card">
        <h1>班级宠物养成</h1>
        <p className="meta-copy">正在连接服务器…</p>
      </div>
    )
  }

  if (snap.phase === 'setup' || snap.phase === 'anon' || !me) {
    return <LoginPage snap={snap} />
  }

  if (me.role === 'admin') {
    return (
      <div className="app">
        <header>
          <strong>{me.schoolName}</strong>
          <span>
            {me.name} · {ROLE_ZH[me.role]}
          </span>
          <div className="header-actions">
            <button type="button" onClick={() => void logout()}>
              退出
            </button>
          </div>
        </header>
        <main>
          <AdminPage />
        </main>
        {toast && (
          <div className={`app-toast toast-${toast.kind}`} role="status">
            {toast.text}
          </div>
        )}
      </div>
    )
  }

  if (!state) {
    return (
      <div className="card login-card">
        <h1>班级宠物养成</h1>
        <p className="meta-copy">正在加载班级数据…</p>
      </div>
    )
  }

  const needAdopt = me.role === 'student' && !state.pets.some((p) => p.ownerId === me.id)
  const stayOnAdopt = needAdopt || ritualHold
  const studentId = me.role === 'student' ? me.id : ''
  const staff = isStaffRole(me.role)
  const homeroom = isHomeroomRole(me.role)
  const boardOn = staff && tab === 'board'
  const headerTitle = state.className || me.schoolName

  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: 'home', label: '宠物主页', show: me.role === 'student' },
    { id: 'adopt', label: '领养', show: me.role === 'student' && needAdopt },
    { id: 'report', label: '申报', show: me.role === 'student' },
    { id: 'visit', label: '宠物互访', show: me.role === 'student' },
    { id: 'squad', label: '小队周赛', show: me.role === 'student' || homeroom },
    { id: 'shop', label: '商城', show: me.role === 'student' },
    { id: 'board', label: '课堂大屏', show: staff },
    { id: 'teacher', label: '抽查', show: staff },
    { id: 'goals', label: '目标', show: homeroom },
    { id: 'week', label: '周报', show: homeroom },
    { id: 'roster', label: '花名册', show: homeroom },
  ]

  return (
    <div className={boardOn ? 'app app-board' : 'app'}>
      <header>
        <strong>{headerTitle}</strong>
        <span>
          {me.name} · {ROLE_ZH[me.role] ?? me.role}
          {snap.offline ? ' · 离线，重连中…' : ''}
        </span>
        <div className="header-actions">
          {staff && me.classes.length > 1 && (
            <select
              value={snap.activeClassId ?? ''}
              onChange={(e) => void setActiveClass(e.target.value)}
              aria-label="切换班级"
            >
              {me.classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <button type="button" onClick={() => void logout()}>
            退出
          </button>
        </div>
      </header>
      {!stayOnAdopt && (
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
        {stayOnAdopt && me.role === 'student' && (
          <AdoptPage
            state={state}
            studentId={studentId}
            studentName={me.name}
            onAdopted={() => {
              setRitualHold(false)
              goTab('home')
            }}
          />
        )}
        {!stayOnAdopt && tab === 'home' && me.role === 'student' && (
          <HomePage key={studentId} state={state} studentId={studentId} studentName={me.name} />
        )}
        {!stayOnAdopt && tab === 'adopt' && me.role === 'student' && (
          <AdoptPage state={state} studentId={studentId} studentName={me.name} />
        )}
        {!stayOnAdopt && tab === 'report' && me.role === 'student' && (
          <ReportPage key={studentId} state={state} studentId={studentId} />
        )}
        {!stayOnAdopt && tab === 'visit' && me.role === 'student' && (
          <VisitPage key={studentId} state={state} meId={studentId} />
        )}
        {!stayOnAdopt && tab === 'squad' && (me.role === 'student' || homeroom) && (
          <SquadPage state={state} meId={me.id} isTeacher={homeroom} />
        )}
        {!stayOnAdopt && tab === 'shop' && me.role === 'student' && (
          <ShopPage key={studentId} state={state} studentId={studentId} />
        )}
        {tab === 'board' && staff && <ClassroomBoard state={state} meRole={me.role} />}
        {tab === 'teacher' && staff && <TeacherPage state={state} meId={me.id} />}
        {tab === 'goals' && homeroom && <GoalsPage state={state} meId={me.id} />}
        {tab === 'week' && homeroom && <WeeklyReportPage state={state} />}
        {tab === 'roster' && homeroom && <RosterPage state={state} />}
      </main>
      {toast && (
        <div className={`app-toast toast-${toast.kind}`} role="status">
          {toast.text}
        </div>
      )}
    </div>
  )
}
