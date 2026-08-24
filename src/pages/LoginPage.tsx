import { useState } from 'react'
import { doSetup, studentLogin, teacherLogin, type Snapshot } from '../store'

export function LoginPage({ snap }: { snap: Snapshot }) {
  if (snap.phase === 'setup') return <SetupCard />
  return <LoginCard snap={snap} />
}

function SetupCard() {
  const [schoolName, setSchoolName] = useState('')
  const [adminName, setAdminName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  return (
    <div className="card login-card">
      <h1>首次安装</h1>
      <p className="meta-copy">
        创建学校与管理员账号。管理员负责维护教师账号与激励规则；班级与教师进入后在管理台创建。数据保存在本校服务器，不出校。
      </p>
      <label>学校名称</label>
      <input value={schoolName} onChange={(e) => setSchoolName(e.target.value)} maxLength={30} placeholder="如：阳光实验中学" />
      <label>管理员姓名</label>
      <input value={adminName} onChange={(e) => setAdminName(e.target.value)} maxLength={20} placeholder="如：周主任" />
      <label>管理员用户名</label>
      <input value={username} onChange={(e) => setUsername(e.target.value)} maxLength={30} placeholder="字母数字，如 admin" />
      <label>管理员密码（至少 8 位，含字母和数字）</label>
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={72} />
      {err && <p className="err">{err}</p>}
      <button
        className="primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          const e = await doSetup({ schoolName, adminName, username, password })
          setErr(e)
          setBusy(false)
        }}
      >
        {busy ? '创建中…' : '创建并进入管理台'}
      </button>
      <p className="hint">管理员看不到学生过程数据；密码遗失可在服务器用 admin 命令行重置。</p>
    </div>
  )
}

function LoginCard({ snap }: { snap: Snapshot }) {
  const classes = snap.bootstrap?.classes ?? []
  const [mode, setMode] = useState<'student' | 'teacher'>('student')
  const [classId, setClassId] = useState(classes[0]?.id ?? '')
  const [name, setName] = useState('')
  const [studentNo, setStudentNo] = useState('')
  const [pin, setPin] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit() {
    setBusy(true)
    setErr(null)
    const e =
      mode === 'teacher'
        ? await teacherLogin(username.trim(), password)
        : await studentLogin({ classId, name: name.trim(), studentNo: studentNo.trim() || undefined, pin })
    setErr(e)
    setBusy(false)
  }

  return (
    <div className="card login-card">
      <h1>{snap.bootstrap?.schoolName ?? '班级宠物养成'}</h1>
      <p className="meta-copy">{snap.offline ? '连不上服务器，请检查网络后刷新。' : '登录你的账号'}</p>
      <div className="role-cards login-modes">
        <button
          type="button"
          className={`role-card ${mode === 'student' ? 'on primary' : 'secondary'}`}
          onClick={() => setMode('student')}
        >
          <strong>学生</strong>
          <span>班级 + 姓名 + PIN</span>
        </button>
        <button
          type="button"
          className={`role-card ${mode === 'teacher' ? 'on primary' : 'secondary'}`}
          onClick={() => setMode('teacher')}
        >
          <strong>教师 / 管理员</strong>
          <span>用户名 + 密码</span>
        </button>
      </div>

      {mode === 'student' ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <label>班级</label>
          <select value={classId} onChange={(e) => setClassId(e.target.value)}>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <label>姓名</label>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} autoComplete="username" />
          <label>学号（同名同学才需要填）</label>
          <input value={studentNo} onChange={(e) => setStudentNo(e.target.value)} maxLength={10} inputMode="numeric" />
          <label>PIN（6 位数字，老师发给你）</label>
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            maxLength={6}
            inputMode="numeric"
            autoComplete="current-password"
          />
          {err && <p className="err">{err}</p>}
          <button className="primary" type="submit" disabled={busy || !classId || !name.trim() || pin.length < 6}>
            {busy ? '登录中…' : '进入'}
          </button>
          <p className="hint">忘记 PIN 或提示「同意书未登记」：找班主任处理。</p>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <label>用户名</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} maxLength={30} autoComplete="username" />
          <label>密码</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            maxLength={72}
            autoComplete="current-password"
          />
          {err && <p className="err">{err}</p>}
          <button className="primary" type="submit" disabled={busy || !username.trim() || !password}>
            {busy ? '登录中…' : '进入'}
          </button>
        </form>
      )}
      <p className="hint">
        本系统只记录校内学习过程数据：不公开排名、心情仅班主任可见、可随时申请删除。详见校方发放的《隐私告知与监护人同意书》。
      </p>
    </div>
  )
}
