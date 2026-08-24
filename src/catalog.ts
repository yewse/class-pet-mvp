import type { MarkingId, PaletteId, SpeciesId } from './types'

export type BasePet = {
  id: string
  name: string
  species: SpeciesId
  palette: PaletteId
  marking: MarkingId
}

export type CosmeticSlot = 'headwear' | 'clothes' | 'shoes'

export type Cosmetic = {
  id: string
  name: string
  slot: CosmeticSlot
  cost: 0 | 4 | 8 | 12
  basic: boolean
}

export const PALETTE_LABEL: Record<PaletteId, string> = {
  chi: '赤焰',
  qing: '晴空',
  mo: '墨玉',
}

export const SPECIES_LABEL: Record<SpeciesId, string> = {
  fox: '狐',
  owl: '猫头鹰',
  otter: '水獭',
  cat: '猫',
  dog: '犬',
  rabbit: '兔',
  panda: '熊猫',
  deer: '小鹿',
  penguin: '企鹅',
  bear: '熊',
}

const SPECIES_ORDER: SpeciesId[] = [
  'fox',
  'owl',
  'otter',
  'cat',
  'dog',
  'rabbit',
  'panda',
  'deer',
  'penguin',
  'bear',
]

const PALETTE_ORDER: PaletteId[] = ['chi', 'qing', 'mo']
const MARK_BY_PALETTE: Record<PaletteId, MarkingId> = {
  chi: 'stripe',
  qing: 'spots',
  mo: 'none',
}

export const BASE_PETS: BasePet[] = SPECIES_ORDER.flatMap((species) =>
  PALETTE_ORDER.map((palette) => ({
    id: `${species}-${palette}`,
    name: `${PALETTE_LABEL[palette]}${SPECIES_LABEL[species]}`,
    species,
    palette,
    marking: MARK_BY_PALETTE[palette],
  })),
)

export const COSMETICS: Cosmetic[] = [
  { id: 'hw_leaf', name: '叶绿发卡', slot: 'headwear', cost: 0, basic: true },
  { id: 'hw_bow', name: '粉结发带', slot: 'headwear', cost: 0, basic: true },
  { id: 'hw_star', name: '星点小冠', slot: 'headwear', cost: 4, basic: false },
  { id: 'hw_hat', name: '学士软帽', slot: 'headwear', cost: 8, basic: false },
  { id: 'hw_crown', name: '节庆金冠', slot: 'headwear', cost: 12, basic: false },
  { id: 'hw_reflect', name: '反思之眼', slot: 'headwear', cost: 0, basic: false },
  { id: 'cl_scarf', name: '叶绿围巾', slot: 'clothes', cost: 0, basic: true },
  { id: 'cl_cloud', name: '云朵围脖', slot: 'clothes', cost: 0, basic: true },
  { id: 'cl_cape', name: '星点披风', slot: 'clothes', cost: 4, basic: false },
  { id: 'cl_vest', name: '墨纹马甲', slot: 'clothes', cost: 8, basic: false },
  { id: 'cl_aurora', name: '极光外衣', slot: 'clothes', cost: 12, basic: false },
  { id: 'sh_none', name: '赤足', slot: 'shoes', cost: 0, basic: true },
  { id: 'sh_socks', name: '云朵袜', slot: 'shoes', cost: 0, basic: true },
  { id: 'sh_boots', name: '小皮靴', slot: 'shoes', cost: 4, basic: false },
  { id: 'sh_star', name: '星点鞋', slot: 'shoes', cost: 8, basic: false },
  { id: 'sh_gold', name: '金纹靴', slot: 'shoes', cost: 12, basic: false },
]

export function cosmeticsOf(slot: CosmeticSlot): Cosmetic[] {
  return COSMETICS.filter((c) => c.slot === slot && c.id !== 'hw_reflect')
}

export function cosmeticById(id: string): Cosmetic | undefined {
  return COSMETICS.find((c) => c.id === id)
}

export function basePetById(id: string): BasePet | undefined {
  return BASE_PETS.find((p) => p.id === id)
}

export function basePetForSpecies(species: SpeciesId): BasePet {
  return BASE_PETS.find((p) => p.species === species) ?? BASE_PETS[0]
}
