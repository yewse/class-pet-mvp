import { useState } from 'react'
import type { Role } from '../types'
import { login } from '../store'

const ROLES: { id: Role; label: string; hint: string }[] = [
  { id: 'student', label: '学生', hint: '林小舟' },
  { id: 'teacher', label: '老师', hint: '叶老师' },
  { id: 'parent', label: '家长', hint: '林妈妈' },
]

export function LoginPage() {
  const [role, setRole] = useState<Role>('student')
  const [name, setName] = useState('林小舟')
  const [err, setErr] = useState<string | null>(null)

  return (
    <div className="card login-card">
      <h1>班级宠物养成</h1>
      <p className="muted">初二（3）班 · 离线演示登入（选角色并填写姓名）</p>
      <label>角色</label>
      <div className="row role-chips">
        {ROLES.map((r) => (
          <button
            key={r.id}
            type="button"
            className={`role-chip ${role === r.id ? 'on' : ''}`}
            onClick={() => {
              setRole(r.id)
              setName(r.hint)
            }}
          >
            <strong>{r.label}</strong>
            <span>{r.hint}</span>
          </button>
        ))}
      </div>
      <label>姓名</label>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="叶老师 / 林小舟 / 林妈妈" />
      {err && <p className="err">{err}</p>}
      <button
        className="primary"
        onClick={() => {
          const e = login(role, name)
          setErr(e)
        }}
      >
        进入
      </button>
      <ul className="hint">
        <li>老师：<strong>叶老师</strong> — 默认进入课堂大屏</li>
        <li>学生：<strong>林小舟</strong>（另有陈安安、周牧野、苏晚晚，或花名册新生）— 无宠物须先领养</li>
        <li>家长：<strong>林妈妈</strong> — 只读林小舟</li>
      </ul>
    </div>
  )
}
