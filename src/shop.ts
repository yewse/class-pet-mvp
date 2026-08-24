import { MOUNT_ID, type ShopItem } from './types'

/** 商城目录：客户端与服务端共用。稀有品仅成就/周赛解锁。 */
export const SHOP_ITEMS: ShopItem[] = [
  { id: 'skin_basic_leaf', name: '叶绿围巾', cost: 4, kind: 'skin', rare: false },
  { id: 'skin_basic_cloud', name: '云朵围脖', cost: 4, kind: 'skin', rare: false },
  { id: 'skin_mid_star', name: '星点披风', cost: 8, kind: 'skin', rare: false },
  { id: 'skin_mid_ink', name: '墨纹马甲', cost: 8, kind: 'skin', rare: false },
  { id: 'skin_high_aurora', name: '极光外衣', cost: 12, kind: 'skin', rare: false },
  { id: 'skin_high_festival', name: '节庆花纹', cost: 12, kind: 'skin', rare: false },
  { id: 'skin_rare_week', name: '周赛银辉', cost: 12, kind: 'skin', rare: true },
  { id: 'skin_rare_achieve', name: '成就金纹', cost: 12, kind: 'skin', rare: true },
  { id: MOUNT_ID, name: '课桌垫坐骑', cost: 8, kind: 'mount', rare: true },
]
