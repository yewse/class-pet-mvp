import { useState } from 'react'
import type { Role } from '../types'
import { login } from '../store'

const ROLES: { id: Role; label: string; hint: string }[] = [
  { id: 'homeroom', label: '班主任', hint: '叶老师' },
  { id: 'subject', label: '任课教师', hint: '王老师' },
  { id: 'student', label: '学生', hint: '林小舟' },
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
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="叶老师 / 王老师 / 林小舟" />
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
        <li>班主任：<strong>叶老师</strong> — 课堂大屏、抽查、目标、花名册、小队；可改花名册与班级目标、发放集体奖励、重置演示</li>
        <li>任课教师：<strong>王老师</strong> — 仅课堂大屏与抽查；可核验、未完成、特别突破、上课中</li>
        <li>学生：<strong>林小舟</strong>（另有陈安安、周牧野、苏晚晚，或花名册新生）— 无宠物须先领养</li>
      </ul>
    </div>
  )
}
