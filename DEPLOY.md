# 部署手册（单校私有化）

本系统按「一校一套、数据不出校」设计：一台校内服务器（或教师办公电脑常开）即可承载全校班级。后端 Node + Express，数据库 SQLite（单文件，备份=拷贝）。

## 1. 环境要求

- Node.js 20+（建议 22 LTS），npm
- 500MB 磁盘（含备份）；内存占用约 100–200MB
- 校内局域网；对外不需要公网

## 2. 安装与首次启动

```bash
npm ci                 # 安装依赖
npm run build          # 类型检查 + 构建前端
npm run start          # 启动（默认端口 3050，可用环境变量 PORT 覆盖）
```

首次打开 `http://<服务器IP>:3050` 会进入**安装向导**：填写学校名与管理员账号。此后：

- 班级与教师：管理员登录后在**管理台**创建班级、创建教师账号、分配任教班级、重置教师密码、停用离职教师
- 激励规则：管理台「激励规则」页可调分值/上限/档位/成长节奏等，保存即全校生效并写审计日志
- 学生：班主任在「花名册」逐个添加或批量粘贴导入，系统生成 6 位 PIN，抄发给学生
- 学生首次登录前，班主任必须在花名册登记「监护人同意书已收」，否则登录被拒
- 管理员看不到任何学生过程数据（最小权限设计）

体验演示数据（勿在生产库使用）：`npm run seed:demo`，账号密码会打印并写入 `data/demo-accounts.txt`。

## 3. 以服务方式常驻

Linux（systemd）示例 `/etc/systemd/system/class-pet.service`：

```ini
[Unit]
Description=class-pet
After=network.target

[Service]
WorkingDirectory=/opt/class-pet
ExecStart=/usr/bin/npm run start
Restart=always
Environment=PORT=3050

[Install]
WantedBy=multi-user.target
```

Windows：用 [NSSM](https://nssm.cc/) 或「任务计划程序（登录时启动）」执行 `npm run start`。

## 4. HTTPS（强烈建议）

PIN 与密码不应在校园网明文传输。用 Caddy 反代最省事（自签或校内 CA）：

```
class-pet.school.lan {
    reverse_proxy 127.0.0.1:3050
    tls internal
}
```

或 nginx + 校内证书。会话 Cookie 为 httpOnly + SameSite=Lax。

## 5. 账号运维

日常运维全部在**管理台 UI** 完成（教师账号、班级、激励规则）。服务器命令行仅作恢复通道：

```bash
npm run admin -- list                                # 概览
npm run admin -- reset-password admin 新密码1234ab   # 管理员/教师密码找回
npm run admin -- add-admin 备用管理员 admin2 密码1234ab # 紧急补建管理员
npm run admin -- add-class "初二（5）班"              # 也可在管理台完成
npm run admin -- backup                              # 手动备份
```

学生 PIN 重置由班主任在「花名册」页操作；教师密码重置由管理员在管理台操作。

## 6. 数据与备份

- 数据库：`data/school.db`（WAL 模式）
- 自动备份：每天首个请求触发，写入 `data/backups/school-YYYY-MM-DD.db`，保留 30 份
- 建议每周把 `data/backups/` 拷贝到另一台机器或加密 U 盘
- 迁移服务器：停服 → 拷贝整个 `data/` → 新机启动

## 7. 审计与运营数据

- 全部变更写入 `events` 表（时间、操作者、动作、参数、成败），追加式不修改
- 周报页显示「本周活跃学生数」；更多指标可直接对 `data/school.db` 做只读 SQL

## 8. 升级

```bash
git pull（或替换代码目录）
npm ci && npm run build
重启服务
```

状态结构升级由服务端读取时自动规范化，无需手工迁移。

## 9. 安全边界（如实告知）

- 登录限速：同一来源 15 分钟内 5 次失败锁定
- 密码/PIN 均为 bcrypt 加密存储；会话为服务端随机令牌
- 服务端按角色裁剪数据：学生拿不到他人流水/心情/习惯明细，互评池不含申报者身份
- 未做：邮箱/短信找回（校内场景用 admin/花名册重置）、多校租户、区级只读视图（规划中）
