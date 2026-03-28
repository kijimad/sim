import type { Graph } from "./graph.js";
import type { TileMap } from "./tilemap.js";
import { NodeKind } from "./graph.js";
import { Terrain } from "./types.js";

// --- 資源タイプ ---

export const Resource = {
  Passengers: 0,
  Rice: 1,
  Iron: 2,
  Goods: 3,
} as const;

export type Resource = (typeof Resource)[keyof typeof Resource];

export const RESOURCE_NAMES: Record<Resource, string> = {
  [Resource.Passengers]: "Passengers",
  [Resource.Rice]: "Rice",
  [Resource.Iron]: "Iron",
  [Resource.Goods]: "Goods",
};

// --- 建物 ---

export const BuildingType = {
  Residence: 0,
  Commercial: 1,
  Farm: 2,
  Mine: 3,
  Factory: 4,
} as const;

export type BuildingType = (typeof BuildingType)[keyof typeof BuildingType];

export const BUILDING_TYPE_NAMES: Record<BuildingType, string> = {
  [BuildingType.Residence]: "Residence",
  [BuildingType.Commercial]: "Commercial",
  [BuildingType.Farm]: "Farm",
  [BuildingType.Mine]: "Mine",
  [BuildingType.Factory]: "Factory",
};

export interface Building {
  readonly type: BuildingType;
  readonly tileX: number;
  readonly tileY: number;
  /** 住宅の場合は人口、その他は労働者数 */
  population: number;
  /** この建物が生産するもの（住宅の場合はnull） */
  readonly produces: Resource | null;
  /** この建物が消費するもの（なければnull） */
  readonly consumes: Resource | null;
}

// --- 都市（市場エリア） ---

export interface City {
  readonly id: number;
  readonly name: string;
  /** 都市エリアの中心 */
  readonly centerX: number;
  readonly centerY: number;
  /** 都市エリアの半径（タイル単位） */
  readonly radius: number;
}

// --- 駅の貨物 ---

export interface StationCargo {
  waiting: Map<Resource, number>;
}

// --- 経済 ---

const PRODUCTION_INTERVAL = 1.0;
const STATION_RANGE_SQ = 100;
const CITY_GROWTH_INTERVAL = 10.0;

const DELIVERY_REWARD: Record<Resource, number> = {
  [Resource.Passengers]: 10,
  [Resource.Rice]: 5,
  [Resource.Iron]: 8,
  [Resource.Goods]: 15,
};

export class Economy {
  private cities = new Map<number, City>();
  private buildings: Building[] = [];
  private stationCargo = new Map<number, StationCargo>();
  private nextCityId = 1;
  private _money = 0;
  private productionAccumulator = 0;
  private growthAccumulator = 0;

  get money(): number {
    return this._money;
  }

  // --- 都市管理 ---

  addCity(name: string, centerX: number, centerY: number, radius: number, map?: TileMap): City {
    const id = this.nextCityId++;
    const city: City = { id, name, centerX, centerY, radius };
    this.cities.set(id, city);
    if (map !== undefined) {
      this.spawnInitialBuildings(city, map);
    }
    return city;
  }

  private spawnInitialBuildings(city: City, map: TileMap): void {
    // 都市の中心付近に様々な建物を配置する
    const layout: BuildingType[] = [
      BuildingType.Residence,
      BuildingType.Residence,
      BuildingType.Residence,
      BuildingType.Residence,
      BuildingType.Commercial,
    ];

    for (const type of layout) {
      for (let attempt = 0; attempt < 30; attempt++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 1 + Math.random() * (city.radius * 0.6);
        const tx = Math.round(city.centerX + Math.cos(angle) * dist);
        const ty = Math.round(city.centerY + Math.sin(angle) * dist);

        if (!map.inBounds(tx, ty)) continue;
        if (map.get(tx, ty).terrain !== Terrain.Flat) continue;
        if (this.hasBuildingAt(tx, ty)) continue;

        this.buildings.push(this.createBuilding(type, tx, ty));
        break;
      }
    }
  }

  getAllCities(): readonly City[] {
    return [...this.cities.values()];
  }

  getAllBuildings(): readonly Building[] {
    return this.buildings;
  }

  /** 都市の総人口を取得する（エリア内の住宅の合計） */
  getCityPopulation(cityId: number): number {
    const city = this.cities.get(cityId);
    if (city === undefined) return 0;

    let pop = 0;
    for (const b of this.buildings) {
      if (b.type !== BuildingType.Residence) continue;
      if (this.isInCity(b.tileX, b.tileY, city)) {
        pop += b.population;
      }
    }
    return pop;
  }

  getTotalPopulation(): number {
    let pop = 0;
    for (const b of this.buildings) {
      if (b.type === BuildingType.Residence) {
        pop += b.population;
      }
    }
    return pop;
  }

  // --- 駅の貨物 ---

  getWaiting(nodeId: number, resource: Resource): number {
    return this.stationCargo.get(nodeId)?.waiting.get(resource) ?? 0;
  }

  getTotalWaiting(nodeId: number): number {
    const cargo = this.stationCargo.get(nodeId);
    if (cargo === undefined) return 0;
    let total = 0;
    for (const amount of cargo.waiting.values()) {
      total += amount;
    }
    return total;
  }

  // --- シミュレーションティック ---

  update(dt: number, graph: Graph, map: TileMap): void {
    this.productionAccumulator += dt;
    this.growthAccumulator += dt;

    if (this.productionAccumulator >= PRODUCTION_INTERVAL) {
      this.productionAccumulator -= PRODUCTION_INTERVAL;
      this.produce(graph);
    }

    if (this.growthAccumulator >= CITY_GROWTH_INTERVAL) {
      this.growthAccumulator -= CITY_GROWTH_INTERVAL;
      this.growCities(map);
    }
  }

  private produce(graph: Graph): void {
    for (const building of this.buildings) {
      if (building.produces === null) continue;

      const stationId = this.findNearestStation(building.tileX, building.tileY, graph);
      if (stationId === undefined) continue;

      const cargo = this.ensureStationCargo(stationId);
      const current = cargo.waiting.get(building.produces) ?? 0;
      // 生産量は建物の人口（労働者数）に比例する
      const amount = building.population * 0.1;
      cargo.waiting.set(building.produces, current + amount);
    }

    // 住宅は旅客を生産する
    for (const building of this.buildings) {
      if (building.type !== BuildingType.Residence) continue;

      const stationId = this.findNearestStation(building.tileX, building.tileY, graph);
      if (stationId === undefined) continue;

      const cargo = this.ensureStationCargo(stationId);
      const current = cargo.waiting.get(Resource.Passengers) ?? 0;
      cargo.waiting.set(Resource.Passengers, current + building.population * 0.05);
    }
  }

  /** 都市は空の平地タイルに新しい建物を生成して成長する */
  private growCities(map: TileMap): void {
    for (const city of this.cities.values()) {
      this.growCity(city, map);
    }
  }

  private growCity(city: City, map: TileMap): void {
    // 都市の中心付近に建物を配置しようとする
    const types: BuildingType[] = [
      BuildingType.Residence,
      BuildingType.Residence,
      BuildingType.Residence,
      BuildingType.Residence,
    ];
    const type = types[Math.floor(Math.random() * types.length)];
    if (type === undefined) return;

    for (let attempt = 0; attempt < 20; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * city.radius;
      const tx = Math.round(city.centerX + Math.cos(angle) * dist);
      const ty = Math.round(city.centerY + Math.sin(angle) * dist);

      if (!map.inBounds(tx, ty)) continue;
      if (map.get(tx, ty).terrain !== Terrain.Flat) continue;
      if (this.hasBuildingAt(tx, ty)) continue;

      const building = this.createBuilding(type, tx, ty);
      this.buildings.push(building);
      return;
    }
  }

  private createBuilding(type: BuildingType, tileX: number, tileY: number): Building {
    switch (type) {
      case BuildingType.Residence:
        return { type, tileX, tileY, population: 10, produces: null, consumes: Resource.Passengers };
      case BuildingType.Commercial:
        return { type, tileX, tileY, population: 5, produces: Resource.Goods, consumes: Resource.Rice };
      case BuildingType.Farm:
        return { type, tileX, tileY, population: 3, produces: Resource.Rice, consumes: null };
      case BuildingType.Mine:
        return { type, tileX, tileY, population: 3, produces: Resource.Iron, consumes: null };
      case BuildingType.Factory:
        return { type, tileX, tileY, population: 5, produces: Resource.Goods, consumes: Resource.Iron };
    }
  }

  hasBuildingAt(tileX: number, tileY: number): boolean {
    return this.buildings.some((b) => b.tileX === tileX && b.tileY === tileY);
  }

  addBuilding(type: BuildingType, tileX: number, tileY: number): Building {
    const building = this.createBuilding(type, tileX, tileY);
    this.buildings.push(building);
    return building;
  }

  /**
   * 指定した駅群で消費される資源の種類を返す
   */
  getDemandedResources(nodeIds: readonly number[], graph: Graph): Set<number> {
    const demanded = new Set<number>();
    for (const nodeId of nodeIds) {
      const node = graph.getNode(nodeId);
      if (node === undefined) continue;
      for (const building of this.buildings) {
        if (building.consumes === null) continue;
        const dx = building.tileX - node.tileX;
        const dy = building.tileY - node.tileY;
        if (dx * dx + dy * dy <= STATION_RANGE_SQ) {
          demanded.add(building.consumes);
        }
      }
    }
    return demanded;
  }

  /**
   * 列車が駅に到着した時に呼び出される。
   * demandedResources: この路線の他の停車駅で消費される資源の集合
   */
  trainArrive(
    nodeId: number,
    carrying: Map<number, number>,
    graph: Graph,
    demandedResources: Set<number>,
  ): { earned: number; newCargo: Map<number, number> } {
    let earned = 0;

    const node = graph.getNode(nodeId);
    if (node !== undefined) {
      // 近くの消費する建物に貨物を配達する
      for (const building of this.buildings) {
        if (building.consumes === null) continue;
        const dx = building.tileX - node.tileX;
        const dy = building.tileY - node.tileY;
        if (dx * dx + dy * dy > STATION_RANGE_SQ) continue;

        const consumed = carrying.get(building.consumes) ?? 0;
        if (consumed > 0) {
          earned += consumed * DELIVERY_REWARD[building.consumes];
          building.population += Math.floor(consumed * 0.5);
          carrying.delete(building.consumes);
        }
      }
    }

    this._money += earned;

    // 路線の他の停車駅で需要がある資源のみ積み込む
    const newCargo = new Map<number, number>();
    const stationCargo = this.stationCargo.get(nodeId);
    if (stationCargo !== undefined) {
      for (const [resource, amount] of stationCargo.waiting) {
        if (amount > 0 && demandedResources.has(resource)) {
          newCargo.set(resource, amount);
          stationCargo.waiting.set(resource, 0);
        }
      }
    }

    return { earned, newCargo };
  }

  // --- ヘルパー ---

  /** 都市内の建物から生産品/消費品を収集する */
  getCityResources(cityId: number): { produces: Set<Resource>; consumes: Set<Resource> } {
    const city = this.cities.get(cityId);
    const produces = new Set<Resource>();
    const consumes = new Set<Resource>();
    if (city === undefined) return { produces, consumes };

    produces.add(Resource.Passengers);
    for (const b of this.buildings) {
      if (!this.isInCity(b.tileX, b.tileY, city)) continue;
      if (b.produces !== null) produces.add(b.produces);
      if (b.consumes !== null) consumes.add(b.consumes);
    }
    return { produces, consumes };
  }

  /** 指定座標の建物を返す */
  getBuildingAt(tileX: number, tileY: number): Building | undefined {
    return this.buildings.find((b) => b.tileX === tileX && b.tileY === tileY);
  }

  /** 指定座標を含む都市を返す */
  getCityAt(tileX: number, tileY: number): City | undefined {
    for (const city of this.cities.values()) {
      if (this.isInCity(tileX, tileY, city)) return city;
    }
    return undefined;
  }

  isInCity(tileX: number, tileY: number, city: City): boolean {
    const dx = tileX - city.centerX;
    const dy = tileY - city.centerY;
    return dx * dx + dy * dy <= city.radius * city.radius;
  }

  private ensureStationCargo(nodeId: number): StationCargo {
    let cargo = this.stationCargo.get(nodeId);
    if (cargo === undefined) {
      cargo = { waiting: new Map() };
      this.stationCargo.set(nodeId, cargo);
    }
    return cargo;
  }

  private findNearestStation(tileX: number, tileY: number, graph: Graph): number | undefined {
    let bestNodeId: number | undefined;
    let bestDist = Infinity;

    for (const node of graph.getAllNodes()) {
      if (node.kind !== NodeKind.Station) continue;
      const dx = node.tileX - tileX;
      const dy = node.tileY - tileY;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist && dist <= STATION_RANGE_SQ) {
        bestDist = dist;
        bestNodeId = node.id;
      }
    }

    return bestNodeId;
  }
}

/**
 * マップ上に初期建物付きの都市を生成する。
 */
export function generateCities(
  map: TileMap,
  economy: Economy,
  count: number,
  seed: number,
): void {
  let state = seed | 0 || 1;
  const rng = (): number => {
    state ^= state << 13;
    state ^= state >> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };

  const names = [
    "Millfield", "Oakridge", "Riverside", "Ironvale",
    "Stonehaven", "Clearwater", "Redhill", "Greenport",
    "Harbortown", "Dustwell", "Brightmoor", "Pinecrest",
  ];

  let placed = 0;
  let attempts = 0;

  while (placed < count && attempts < count * 100) {
    attempts++;
    const x = Math.floor(rng() * map.width);
    const y = Math.floor(rng() * map.height);

    if (map.get(x, y).terrain !== Terrain.Flat) continue;

    let tooClose = false;
    for (const city of economy.getAllCities()) {
      const dx = city.centerX - x;
      const dy = city.centerY - y;
      if (dx * dx + dy * dy < 900) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;

    const name = names[placed % names.length] ?? `City ${String(placed + 1)}`;
    const radius = 5 + Math.floor(rng() * 5);
    economy.addCity(name, x, y, radius, map);
    placed++;
  }

  // 都市の外に特殊な産業建物を配置する
  generateIndustries(map, economy, rng);
}

function generateIndustries(
  map: TileMap,
  economy: Economy,
  rng: () => number,
): void {
  const industries: { type: BuildingType; terrain: Terrain; count: number }[] = [
    { type: BuildingType.Farm, terrain: Terrain.Flat, count: 6 },
    { type: BuildingType.Mine, terrain: Terrain.Mountain, count: 4 },
    { type: BuildingType.Factory, terrain: Terrain.Flat, count: 3 },
    { type: BuildingType.Commercial, terrain: Terrain.Flat, count: 4 },
  ];

  for (const ind of industries) {
    let placed = 0;
    let attempts = 0;
    while (placed < ind.count && attempts < ind.count * 200) {
      attempts++;
      const x = Math.floor(rng() * map.width);
      const y = Math.floor(rng() * map.height);

      if (map.get(x, y).terrain !== ind.terrain) continue;
      if (economy.hasBuildingAt(x, y)) continue;

      // 都市エリア内には配置しない
      let inCity = false;
      for (const city of economy.getAllCities()) {
        const dx = x - city.centerX;
        const dy = y - city.centerY;
        if (dx * dx + dy * dy <= city.radius * city.radius) {
          inCity = true;
          break;
        }
      }
      if (inCity) continue;

      economy.addBuilding(ind.type, x, y);
      placed++;
    }
  }
}
