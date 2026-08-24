/**
 * 运维 CLI（在服务器上执行，不经过网络）：
 *   npm run admin -- list
 *   npm run admin -- add-class "初二（5）班"
 *   npm run admin -- add-teacher <姓名> <用户名> <密码> <homeroom|subject> <classId...>
 *   npm run admin -- reset-teacher-password <用户名> <新密码>
 *   npm run admin -- backup
 */
import crypto from 'node:crypto'
import { accountByUsername, allClasses, db, paths, saveClassState, schoolName } from './db'
import { hashCredential, validatePassword, destroyAccountSessions } from './auth'
import { emptyClassState } from './blank'
import type { AppState } from '../src/types'

const [cmd, ...args] = process.argv.slice(2)

function loadRaw(classId: string): AppState | null {
  const row = db.prepare('SELECT json FROM class_state WHERE classId = ?').get(classId) as { json: string } | undefined
  return row ? (JSON.parse(row.json) as AppState) : null
}

switch (cmd) {
  case 'list': {
    console.log(`学校：${schoolName()}`)
    for (const c of allClasses()) {
      const n = (db.prepare("SELECT COUNT(*) AS n FROM accounts WHERE role = 'student' AND classId = ? AND active = 1").get(c.id) as { n: number }).n
      console.log(`  班级 ${c.name}（${c.id}）：学生 ${n} 人`)
    }
    const teachers = db.prepare("SELECT name, username, role, classIds FROM accounts WHERE role != 'student' AND active = 1").all() as {
      name: string
      username: string
      role: string
      classIds: string
    }[]
    for (const t of teachers) console.log(`  教师 ${t.name}（${t.username}，${t.role}）→ ${t.classIds}`)
    break
  }
  case 'add-class': {
    const name = args[0]
    if (!name) {
      console.error('用法：add-class <班级名>')
      process.exit(1)
    }
    const id = `c-${crypto.randomBytes(4).toString('hex')}`
    db.transaction(() => {
      db.prepare('INSERT INTO classes(id, name, createdAt) VALUES (?, ?, ?)').run(id, name, new Date().toISOString())
      saveClassState(id, emptyClassState(id, name, []))
    })()
    console.log(`已创建班级 ${name}（${id}）。用 add-teacher 或改任课教师 classIds 后即可使用。`)
    break
  }
  case 'add-teacher': {
    const [name, username, password, role, ...classIds] = args
    if (!name || !username || !password || (role !== 'homeroom' && role !== 'subject') || !classIds.length) {
      console.error('用法：add-teacher <姓名> <用户名> <密码> <homeroom|subject> <classId...>')
      process.exit(1)
    }
    const pwErr = validatePassword(password)
    if (pwErr) {
      console.error(pwErr)
      process.exit(1)
    }
    for (const cid of classIds) {
      if (!allClasses().some((c) => c.id === cid)) {
        console.error(`班级不存在：${cid}`)
        process.exit(1)
      }
    }
    const id = `t-${crypto.randomBytes(4).toString('hex')}`
    db.transaction(() => {
      db.prepare(
        'INSERT INTO accounts(id, role, name, classId, classIds, username, credHash, active, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)',
      ).run(id, role, name, classIds[0], JSON.stringify(classIds), username, hashCredential(password), new Date().toISOString())
      for (const cid of classIds) {
        const s = loadRaw(cid)
        if (!s) continue
        if (!s.users.some((u) => u.id === id)) {
          s.users = [...s.users, { id, name, role: role as 'homeroom' | 'subject', code: role, classId: cid, classIds, dnd: false }]
          saveClassState(cid, s)
        }
      }
    })()
    console.log(`已创建教师 ${name}（${username}），负责：${classIds.join(', ')}`)
    break
  }
  case 'reset-teacher-password':
  case 'reset-password': {
    const [username, password] = args
    if (!username || !password) {
      console.error('用法：reset-password <用户名> <新密码>（教师或管理员）')
      process.exit(1)
    }
    const pwErr = validatePassword(password)
    if (pwErr) {
      console.error(pwErr)
      process.exit(1)
    }
    const acc = accountByUsername(username)
    if (!acc || acc.role === 'student') {
      console.error('教师/管理员账号不存在')
      process.exit(1)
    }
    db.prepare('UPDATE accounts SET credHash = ? WHERE id = ?').run(hashCredential(password), acc.id)
    destroyAccountSessions(acc.id)
    console.log(`已重置 ${acc.name}（${username}）的密码，并注销其全部会话。`)
    break
  }
  case 'add-admin': {
    const [name, username, password] = args
    if (!name || !username || !password) {
      console.error('用法：add-admin <姓名> <用户名> <密码>')
      process.exit(1)
    }
    const pwErr = validatePassword(password)
    if (pwErr) {
      console.error(pwErr)
      process.exit(1)
    }
    if (accountByUsername(username)) {
      console.error('用户名已存在')
      process.exit(1)
    }
    const id = `a-${crypto.randomBytes(4).toString('hex')}`
    db.prepare(
      'INSERT INTO accounts(id, role, name, username, credHash, active, createdAt) VALUES (?, ?, ?, ?, ?, 1, ?)',
    ).run(id, 'admin', name, username, hashCredential(password), new Date().toISOString())
    console.log(`已创建管理员 ${name}（${username}）。`)
    break
  }
  case 'backup': {
    const target = `${paths.BACKUP_DIR}/school-manual-${Date.now()}.db`
    db.backup(target)
      .then(() => console.log(`已备份到 ${target}`))
      .catch((e) => {
        console.error('备份失败：', e)
        process.exit(1)
      })
    break
  }
  default:
    console.log('可用命令：list / add-class / add-teacher / add-admin / reset-password / backup')
}
