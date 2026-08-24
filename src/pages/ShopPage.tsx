import { balance, buyItem, equip, SHOP_ITEMS } from '../store'
import { showToast } from '../toast'
import type { AppState } from '../types'

export function ShopPage({ state, studentId }: { state: AppState; studentId: string }) {
  const have = state.unlocked[studentId] || []
  const pts = balance(state, studentId)

  function tryBuy(id: string, cost: number) {
    if (pts < cost) {
      showToast(`积分不足，还差 ${cost - pts} 分`)
      return
    }
    void buyItem(studentId, id).then((e) => showToast(e ?? '已兑换', e ? 'err' : 'ok'))
  }

  return (
    <div className="card">
      <h2>商城</h2>
      <p className="shop-balance">养成积分 {pts}</p>
      <p className="meta-copy">
        普通皮肤可兑换，只扣余额、不占每日消耗。稀有皮肤与课桌垫坐骑仅成就/周赛解锁，攒分买不到。禁止付费与赠送。
      </p>
      <div className="grid3">
        {SHOP_ITEMS.map((it) => {
          const owned = have.includes(it.id)
          const lockedRare = it.rare || it.kind === 'mount'
          const unaffordable = !owned && !lockedRare && pts < it.cost
          return (
            <div key={it.id} className={`item ${unaffordable ? 'unaffordable' : ''}`}>
              <strong>{it.name}</strong>
              <div className="meta-copy">
                {it.kind === 'mount' ? '坐骑' : '皮肤'} · {lockedRare ? '成就/周赛解锁' : `${it.cost} 分`} {it.rare ? '· 稀有' : ''}
              </div>
              {owned ? (
                <button type="button" onClick={() => void equip(studentId, it.id).then((e) => showToast(e ?? '已装备'))}>
                  装备
                </button>
              ) : lockedRare ? (
                <span className="meta-copy">攒分买不到：去看「成就」与小队周赛</span>
              ) : (
                <button type="button" disabled={unaffordable} className={unaffordable ? 'unaffordable-btn' : ''} onClick={() => tryBuy(it.id, it.cost)}>
                  {unaffordable ? `再攒 ${it.cost - pts} 分` : '兑换'}
                </button>
              )}
            </div>
          )
        })}
      </div>
      <p className="meta-copy gift-note">赠送与转让：禁止（防代肝、防交易）</p>
    </div>
  )
}
