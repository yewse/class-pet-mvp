import { balance, buyItem, equip, SHOP_ITEMS } from '../store'
import { showToast } from '../toast'
import type { AppState } from '../types'

export function ShopPage({ state, studentId }: { state: AppState; studentId: string }) {
  const have = state.unlocked[studentId] || []
  const pts = balance(state, studentId)

  function tryBuy(id: string, cost: number) {
    if (pts < cost) {
      showToast('积分不足，明天再来')
      return
    }
    const e = buyItem(studentId, id)
    showToast(e ?? '已兑换')
  }

  return (
    <div className="card">
      <h2>商城</h2>
      <p className="shop-balance">养成积分 {pts}</p>
      <p className="meta-copy">普通皮肤可兑换。稀有皮肤与课桌垫坐骑仅成就/周赛解锁，不可购买。禁止付费与赠送。</p>
      <div className="grid3">
        {SHOP_ITEMS.map((it) => {
          const owned = have.includes(it.id)
          const lockedRare = it.rare || it.kind === 'mount'
          const unaffordable = !owned && !lockedRare && pts < it.cost
          return (
            <div key={it.id} className={`item ${unaffordable ? 'unaffordable' : ''}`}>
              <strong>{it.name}</strong>
              <div className="meta-copy">
                {it.kind === 'mount' ? '坐骑' : '皮肤'} · {it.cost} 分 {it.rare ? '· 稀有' : ''}
              </div>
              {owned ? (
                <button type="button" onClick={() => showToast(equip(studentId, it.id) ?? '已装备')}>
                  装备
                </button>
              ) : lockedRare ? (
                <span className="meta-copy">{it.rare ? '成就解锁' : '本周活动解锁'}</span>
              ) : it.cost > 6 ? (
                <span className="meta-copy">本周活动解锁</span>
              ) : (
                <button type="button" disabled={unaffordable} className={unaffordable ? 'unaffordable-btn' : ''} onClick={() => tryBuy(it.id, it.cost)}>
                  兑换
                </button>
              )}
            </div>
          )
        })}
      </div>
      <p className="meta-copy gift-note">赠送：禁止赠送</p>
    </div>
  )
}
