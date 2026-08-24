import { useEffect, useState } from 'react'
import {
  adminAddClass,
  adminAddTeacher,
  adminDeleteTeacher,
  adminOverview,
  adminRenameSchool,
  adminResetTeacherPassword,
  adminSaveRules,
  adminSetTeacherActive,
  adminSetTeacherClasses,
  changePassword,
  type AdminOverview,
} from '../store'
import type { ReportCategory, RuleConfig } from '../types'
import { CATEGORY_LABEL } from '../types'
import { showToast } from '../toast'

type AdminTab = 'teachers' | 'rules' | 'school'

function NumField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  hint?: string
}) {
  return (
    <label className="admin-num">
      <span>{label}</span>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && <span className="muted">{hint}</span>}
    </label>
  )
}

export function AdminPage() {
  const [tab, setTab] = useState<AdminTab>('teachers')
  const [data, setData] = useState<AdminOverview | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [rules, setRules] = useState<RuleConfig | null>(null)

  async function reload() {
    const { error, data: d } = await adminOverview()
    setErr(error)
    setData(d)
    if (d) setRules(d.rules)
  }

  useEffect(() => {
    void reload()
  }, [])

  if (err) return <div className="card"><p className="err">{err}</p></div>
  if (!data || !rules) return <div className="card"><p className="meta-copy">加载中…</p></div>

  return (
    <div>
      <nav>
        <button className={tab === 'teachers' ? 'on' : ''} onClick={() => setTab('teachers')}>
          教师与班级
        </button>
        <button className={tab === 'rules' ? 'on' : ''} onClick={() => setTab('rules')}>
          激励规则
        </button>
        <button className={tab === 'school' ? 'on' : ''} onClick={() => setTab('school')}>
          学校设置
        </button>
      </nav>
      {tab === 'teachers' && <TeachersTab data={data} onChanged={reload} />}
      {tab === 'rules' && (
        <RulesTab rules={rules} defaults={data.defaults} onEdit={setRules} onSaved={reload} />
      )}
      {tab === 'school' && <SchoolTab data={data} onChanged={reload} />}
      <p className="muted">
        管理员只维护账号与规则，看不到任何学生过程数据（流水、心情、申报明细）——这是有意的最小权限设计。
      </p>
    </div>
  )
}

function TeachersTab({ data, onChanged }: { data: AdminOverview; onChanged: () => Promise<void> }) {
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'homeroom' | 'subject'>('homeroom')
  const [classIds, setClassIds] = useState<string[]>([])
  const [newClass, setNewClass] = useState('')
  const [editClasses, setEditClasses] = useState<Record<string, string[]>>({})
  const [pwDraft, setPwDraft] = useState<Record<string, string>>({})

  const classNameOf = (id: string) => data.classes.find((c) => c.id === id)?.name ?? id

  function toggle(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
  }

  return (
    <div>
      <div className="card">
        <h2>班级</h2>
        <div className="row wrap">
          {data.classes.map((c) => (
            <span key={c.id} className="hint">{c.name}</span>
          ))}
          {data.classes.length === 0 && <span className="muted">还没有班级，先创建一个。</span>}
        </div>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault()
            void adminAddClass(newClass).then(async (err) => {
              showToast(err ?? `已创建班级 ${newClass.trim()}`, err ? 'err' : 'ok')
              if (!err) {
                setNewClass('')
                await onChanged()
              }
            })
          }}
        >
          <input
            value={newClass}
            onChange={(e) => setNewClass(e.target.value)}
            placeholder="班级名（如 初二（5）班）"
            maxLength={20}
            style={{ maxWidth: 260 }}
          />
          <button type="submit" className="primary" disabled={newClass.trim().length < 2}>
            创建班级
          </button>
        </form>
      </div>

      <div className="card">
        <h2>教师账号</h2>
        <table className="school-table">
          <thead>
            <tr>
              <th>姓名</th>
              <th>用户名</th>
              <th>角色</th>
              <th>任教班级</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {data.teachers.map((t) => {
              const editing = editClasses[t.id]
              return (
                <tr key={t.id} className={t.active ? '' : 'placing-row'}>
                  <td>{t.name}{t.active ? '' : '（已停用）'}</td>
                  <td>{t.username}</td>
                  <td>{t.role === 'homeroom' ? '班主任' : '任课教师'}</td>
                  <td>
                    {editing ? (
                      <div className="row wrap">
                        {data.classes.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className={editing.includes(c.id) ? 'on' : ''}
                            onClick={() => setEditClasses((m) => ({ ...m, [t.id]: toggle(editing, c.id) }))}
                          >
                            {c.name}
                          </button>
                        ))}
                        <button
                          type="button"
                          className="primary"
                          disabled={editing.length === 0}
                          onClick={() =>
                            void adminSetTeacherClasses(t.id, editing).then(async (err) => {
                              showToast(err ?? '已更新任教班级', err ? 'err' : 'ok')
                              if (!err) {
                                setEditClasses((m) => {
                                  const next = { ...m }
                                  delete next[t.id]
                                  return next
                                })
                                await onChanged()
                              }
                            })
                          }
                        >
                          保存
                        </button>
                      </div>
                    ) : (
                      <span>
                        {t.classIds.map(classNameOf).join('、') || '—'}{' '}
                        <button type="button" onClick={() => setEditClasses((m) => ({ ...m, [t.id]: t.classIds }))}>
                          调整
                        </button>
                      </span>
                    )}
                  </td>
                  <td>
                    <div className="row">
                      <input
                        type="password"
                        value={pwDraft[t.id] ?? ''}
                        onChange={(e) => setPwDraft((m) => ({ ...m, [t.id]: e.target.value }))}
                        placeholder="新密码"
                        style={{ maxWidth: 140, margin: 0 }}
                        aria-label={`${t.name} 的新密码`}
                      />
                      <button
                        type="button"
                        disabled={!(pwDraft[t.id] ?? '').length}
                        onClick={() =>
                          void adminResetTeacherPassword(t.id, pwDraft[t.id] ?? '').then((err) => {
                            showToast(err ?? `已重置 ${t.name} 的密码并注销其会话`, err ? 'err' : 'ok')
                            if (!err) setPwDraft((m) => ({ ...m, [t.id]: '' }))
                          })
                        }
                      >
                        重置密码
                      </button>
                      <button
                        type="button"
                        className={t.active ? 'danger' : 'primary'}
                        onClick={() =>
                          void adminSetTeacherActive(t.id, !t.active).then(async (err) => {
                            showToast(err ?? (t.active ? `已停用 ${t.name}` : `已启用 ${t.name}`), err ? 'err' : 'ok')
                            if (!err) await onChanged()
                          })
                        }
                      >
                        {t.active ? '停用' : '启用'}
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => {
                          if (window.confirm(`确认删除教师 ${t.name}？账号立即失效`)) {
                            void adminDeleteTeacher(t.id).then(async (err) => {
                              showToast(err ?? `已删除 ${t.name}`, err ? 'err' : 'ok')
                              if (!err) await onChanged()
                            })
                          }
                        }}
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <h3>新增教师</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void adminAddTeacher({ name, username, password, role, classIds }).then(async (err) => {
              showToast(err ?? `已创建教师 ${name.trim()}`, err ? 'err' : 'ok')
              if (!err) {
                setName('')
                setUsername('')
                setPassword('')
                setClassIds([])
                await onChanged()
              }
            })
          }}
        >
          <div className="row wrap">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="姓名" maxLength={20} style={{ maxWidth: 140 }} />
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="登录用户名" maxLength={30} style={{ maxWidth: 180 }} />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="初始密码（≥8 位含字母数字）"
              maxLength={72}
              style={{ maxWidth: 220 }}
            />
            <select value={role} onChange={(e) => setRole(e.target.value as 'homeroom' | 'subject')}>
              <option value="homeroom">班主任</option>
              <option value="subject">任课教师</option>
            </select>
          </div>
          <div className="row wrap">
            <span className="muted">任教班级：</span>
            {data.classes.map((c) => (
              <button
                key={c.id}
                type="button"
                className={classIds.includes(c.id) ? 'on' : ''}
                onClick={() => setClassIds((list) => toggle(list, c.id))}
              >
                {c.name}
              </button>
            ))}
          </div>
          <button
            type="submit"
            className="primary"
            disabled={!name.trim() || !username.trim() || !password || classIds.length === 0}
          >
            创建教师账号
          </button>
        </form>
        <p className="muted">教师首次登录后可在「抽查」页自行改密码。学生账号由各班班主任在「花名册」维护。</p>
      </div>
    </div>
  )
}

function RulesTab({
  rules,
  defaults,
  onEdit,
  onSaved,
}: {
  rules: RuleConfig
  defaults: RuleConfig
  onEdit: (r: RuleConfig) => void
  onSaved: () => Promise<void>
}) {
  const set = (patch: Partial<RuleConfig>) => onEdit({ ...rules, ...patch })
  const setPoint = (k: ReportCategory, v: number) =>
    onEdit({ ...rules, categoryPoints: { ...rules.categoryPoints, [k]: v } })

  return (
    <div>
      <div className="card">
        <h2>激励规则</h2>
        <p className="meta-copy">
          全校生效，保存即时应用。以下内容<strong>不可配置</strong>（产品宪法）：不设任何公开排名与垫底名单；
          「未完成/豁免」只进教师端；学生心情永不影响宠物与奖励；积分不可转让、学生零付费。
        </p>

        <h3>申报积分与每日上限</h3>
        <div className="row wrap">
          {(Object.keys(CATEGORY_LABEL) as ReportCategory[]).map((k) => (
            <NumField key={k} label={`${CATEGORY_LABEL[k]}分值`} value={rules.categoryPoints[k]} onChange={(v) => setPoint(k, v)} hint="0–5" />
          ))}
        </div>
        <div className="row wrap">
          <NumField label="每日入账上限" value={rules.dailyEarnCap} onChange={(v) => set({ dailyEarnCap: v })} hint="2–30，反肝" />
          <NumField label="每日社交消耗上限" value={rules.dailySpendCap} onChange={(v) => set({ dailySpendCap: v })} hint="0–30" />
          <NumField label="每日申报上限" value={rules.dailyReportCap} onChange={(v) => set({ dailyReportCap: v })} hint="1–10" />
          <NumField label="每日互评上限" value={rules.dailyReviewCap} onChange={(v) => set({ dailyReviewCap: v })} hint="1–10" />
          <NumField label="证据最少字数" value={rules.evidenceMinLen} onChange={(v) => set({ evidenceMinLen: v })} hint="0–20" />
        </div>

        <h3>抽查队列</h3>
        <div className="row wrap">
          <NumField label="每日下限" value={rules.auditMin} onChange={(v) => set({ auditMin: v })} hint="存疑必进" />
          <NumField label="每日上限" value={rules.auditMax} onChange={(v) => set({ auditMax: v })} hint="教师负担帽" />
        </div>

        <h3>荣誉与小队</h3>
        <div className="row wrap">
          <NumField label="荣誉橱窗每周席位" value={rules.honorWallMax} onChange={(v) => set({ honorWallMax: v })} />
          <NumField label="连续上墙上限" value={rules.honorStreakMax} onChange={(v) => set({ honorStreakMax: v })} hint="防垄断" />
          <NumField label="铜档阈值" value={rules.squadBronze} onChange={(v) => set({ squadBronze: v })} />
          <NumField label="银档阈值" value={rules.squadSilver} onChange={(v) => set({ squadSilver: v })} />
          <NumField label="金档阈值" value={rules.squadGold} onChange={(v) => set({ squadGold: v })} />
          <NumField label="连携加分" value={rules.squadComboBonus} onChange={(v) => set({ squadComboBonus: v })} />
          <NumField label="小队周互助点上限" value={rules.squadWeeklyCap} onChange={(v) => set({ squadWeeklyCap: v })} />
        </div>

        <h3>成长与周期</h3>
        <div className="row wrap">
          <NumField label="照料成长" value={rules.growthCare} onChange={(v) => set({ growthCare: v })} hint="每日一次" />
          <NumField label="确认打钩成长" value={rules.growthTick} onChange={(v) => set({ growthTick: v })} hint="每日首次" />
          <NumField label="周复盘成长" value={rules.growthRetro} onChange={(v) => set({ growthRetro: v })} hint="奖励挂过程" />
          <NumField label="默认周格子数" value={rules.defaultKrTarget} onChange={(v) => set({ defaultKrTarget: v })} hint="1–12" />
          <NumField label="集体奖励阈值 %" value={rules.perkThresholdPct} onChange={(v) => set({ perkThresholdPct: v })} hint="50–100" />
          <NumField label="错题重测间隔天数" value={rules.retestDelayDays} onChange={(v) => set({ retestDelayDays: v })} hint="1–14" />
        </div>

        <div className="row">
          <button
            type="button"
            className="primary"
            onClick={() =>
              void adminSaveRules(rules).then(async (err) => {
                showToast(err ?? '激励规则已保存，全校即时生效', err ? 'err' : 'ok')
                if (!err) await onSaved()
              })
            }
          >
            保存规则
          </button>
          <button type="button" className="secondary" onClick={() => onEdit(defaults)}>
            恢复默认值
          </button>
        </div>
        <p className="muted">
          改动建议与班主任商量后再动：日上限调太高会诱发刷分，档位阈值调太低会让荣誉贬值。所有改动记录在审计日志。
        </p>
      </div>
    </div>
  )
}

function SchoolTab({ data, onChanged }: { data: AdminOverview; onChanged: () => Promise<void> }) {
  const [name, setName] = useState(data.schoolName)
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')

  return (
    <div className="card">
      <h2>学校设置</h2>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault()
          void adminRenameSchool(name).then(async (err) => {
            showToast(err ?? '已更新校名', err ? 'err' : 'ok')
            if (!err) await onChanged()
          })
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} style={{ maxWidth: 260 }} aria-label="学校名称" />
        <button type="submit" className="primary">保存校名</button>
      </form>
      <h3>修改我的登录密码</h3>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault()
          void changePassword(oldPw, newPw).then((err) => {
            showToast(err ?? '密码已修改', err ? 'err' : 'ok')
            if (!err) {
              setOldPw('')
              setNewPw('')
            }
          })
        }}
      >
        <input type="password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} placeholder="原密码" style={{ maxWidth: 180 }} />
        <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="新密码（≥8 位含字母数字）" style={{ maxWidth: 220 }} />
        <button type="submit" className="primary" disabled={!oldPw || !newPw}>修改</button>
      </form>
      <p className="muted">
        管理员密码遗失时，可在服务器上执行 npm run admin -- reset-password 找回；紧急恢复用 add-admin。
      </p>
    </div>
  )
}
