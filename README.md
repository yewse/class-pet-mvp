# 班级宠物养成

离线中文教室：例外式全班基础达标、周目标努力勾选、集体奖励。存储键 `class-pet-mvp-v12`（会读 v11 / v10 / v9）。无云同步。

登录：叶老师 / 林小舟 / 陈安安 / 林妈妈。重置演示用老师账号。

## 演示

1. 叶老师 → 课堂大屏：座位宠物为素颜 idle，不戴装扮。点「全班基础达标」。点座位只见「未完成 / 特别突破」。走神提醒只出老师 toast，大屏不出现红色减分或「疲惫」。
2. 林小舟主页：轻点 / 抚摸 / 喂食均 0 养成积分，都会写 lastCare、清零想念值。久未照料出现表情 missSoft 与文案「有点想你」，不会病死。外形按成长点分幼 / 少 / 成。
3. 班级周 KR ≥ 80% 后发放集体奖励。林小舟目标含「订正」，特别突破后解锁「反思之眼」。
4. 荣誉橱窗本周最多 6 席（历年累计不占坑），连续上墙 ≤ 2。学习闭环成就只计已入账 / 超时入账的申报。驳回不占当日申报条数。超时入账记原日期，不吃次日入账帽。
5. 个人贡献只看确认过的努力勾选。课堂若仍有 classScores，随周 id 清零，不公开累计分。

不设末位小组 KR，不加云同步。

## 主要改动文件

- `src/types.ts` — lastCareAt、now、classScoreWeek
- `src/rules.ts` — 周荣誉帽、入账成就、超时入账、宠物生命、申报帽
- `src/store.ts` — v12、免费照料、周积分重置
- `src/components/PetSvg.tsx` — 幼/少/成缩放与想念表情
- `src/pages/ClassroomBoard.tsx` — 素颜大屏、老师走神 toast
- `src/pages/HomePage.tsx` — 免费照料与想念文案
- `src/pages/SquadPage.tsx` / `SchoolHomePage.tsx` — 本周荣誉
- `src/seed.ts` — lastCareAt
