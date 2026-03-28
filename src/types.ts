export const Terrain = {
  Flat: 0,
  Mountain: 1,
  Water: 2,
} as const;

export type Terrain = (typeof Terrain)[keyof typeof Terrain];

export interface Tile {
  readonly terrain: Terrain;
}
