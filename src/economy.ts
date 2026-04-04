import type { Graph } from "./graph.js";
import type { TileMap } from "./tilemap.js";
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

// --- 貨物（目的地付き） ---

export interface CargoItem {
  readonly resource: Resource;
  readonly destinationNodeId: number;
  amount: number;
}

// --- 駅の貨物 ---

export interface StationCargo {
  waiting: CargoItem[];
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

  /** 駅の待機貨物一覧を返す */
  getWaitingCargo(nodeId: number): readonly CargoItem[] {
    return this.stationCargo.get(nodeId)?.waiting ?? [];
  }

  /** 指定資源の待機量を返す（全目的地合計） */
  getWaiting(nodeId: number, resource: Resource): number {
    const cargo = this.stationCargo.get(nodeId);
    if (cargo === undefined) return 0;
    let total = 0;
    for (const item of cargo.waiting) {
      if (item.resource === resource) total += item.amount;
    }
    return total;
  }

  /** 駅に目的地付き待機貨物を追加する */
  addWaiting(nodeId: number, resource: Resource, amount: number, destinationNodeId: number): void {
    const sc = this.ensureStationCargo(nodeId);
    // 同じ資源・同じ目的地の既存エントリがあれば合算する
    const existing = sc.waiting.find(
      (c) => c.resource === resource && c.destinationNodeId === destinationNodeId,
    );
    if (existing !== undefined) {
      existing.amount += amount;
    } else {
      sc.waiting.push({ resource, destinationNodeId, amount });
    }
  }

  getTotalWaiting(nodeId: number): number {
    const cargo = this.stationCargo.get(nodeId);
    if (cargo === undefined) return 0;
    let total = 0;
    for (const item of cargo.waiting) {
      total += item.amount;
    }
    return total;
  }

  // --- シミュレーションティック ---

  /**
   * @param routeConnections 各駅から路線経由で到達可能な駅IDの集合
   */
  update(dt: number, graph: Graph, map: TileMap, routeConnections: ReadonlyMap<number, readonly number[]>): void {
    this.productionAccumulator += dt;
    this.growthAccumulator += dt;

    if (this.productionAccumulator >= PRODUCTION_INTERVAL) {
      this.productionAccumulator -= PRODUCTION_INTERVAL;
      this.produce(graph, routeConnections);
    }

    if (this.growthAccumulator >= CITY_GROWTH_INTERVAL) {
      this.growthAccumulator -= CITY_GROWTH_INTERVAL;
      this.growCities(map);
    }
  }

  private produce(graph: Graph, routeConnections: ReadonlyMap<number, readonly number[]>): void {
    // 消費建物の最寄り駅をキャッシュする（資源 → 駅ID[]）
    const consumerStations = new Map<Resource, number[]>();
    for (const building of this.buildings) {
      if (building.consumes === null) continue;
      const stationId = this.findNearestStation(building.tileX, building.tileY, graph);
      if (stationId === undefined) continue;
      let list = consumerStations.get(building.consumes);
      if (list === undefined) {
        list = [];
        consumerStations.set(building.consumes, list);
      }
      if (!list.includes(stationId)) {
        list.push(stationId);
      }
    }

    // 生産建物の貨物を目的地付きで生産する
    for (const building of this.buildings) {
      if (building.produces === null) continue;

      const stationId = this.findNearestStation(building.tileX, building.tileY, graph);
      if (stationId === undefined) continue;

      const allDests = consumerStations.get(building.produces);
      if (allDests === undefined || allDests.length === 0) continue;

      // 路線で到達可能な消費先のみに絞る
      const reachable = routeConnections.get(stationId);
      const reachableSet = reachable !== undefined ? new Set(reachable) : new Set<number>();
      const destinations = allDests.filter((d) => reachableSet.has(d));
      if (destinations.length === 0) continue;

      const amount = building.population * 0.1;
      const destIdx = Math.floor(Math.random() * destinations.length);
      const destId = destinations[destIdx];
      if (destId === undefined) continue;
      this.addWaiting(stationId, building.produces, amount, destId);
    }

    // 住宅は旅客を生産する（路線で到達可能な駅のみ）
    for (const building of this.buildings) {
      if (building.type !== BuildingType.Residence) continue;

      const stationId = this.findNearestStation(building.tileX, building.tileY, graph);
      if (stationId === undefined) continue;

      const reachable = routeConnections.get(stationId);
      if (reachable === undefined || reachable.length === 0) continue;

      // 自駅以外で到達可能な駅を目的地候補にする
      const candidates = reachable.filter((id) => id !== stationId);
      if (candidates.length === 0) continue;

      const amount = building.population * 0.05;
      const candIdx = Math.floor(Math.random() * candidates.length);
      const destId = candidates[candIdx];
      if (destId === undefined) continue;
      this.addWaiting(stationId, Resource.Passengers, amount, destId);
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
   * 列車が駅に到着した時に呼び出される。
   * complexNodeIds: 停車駅の複合体に含まれる全ノードID
   * carrying: 列車が積載している貨物（目的地付き）
   * routeStops: 路線の全停車駅ID（積載判定用）
   */
  trainArrive(
    complexNodeIds: readonly number[],
    carrying: CargoItem[],
    _graph: Graph,
    routeStops: readonly number[],
    cargoCapacity: number = Infinity,
  ): { earned: number; newCargo: CargoItem[] } {
    let earned = 0;
    const complexSet = new Set(complexNodeIds);

    // 目的地がこの複合体の駅と一致する貨物を配達する
    const remaining: CargoItem[] = [];
    for (const item of carrying) {
      if (complexSet.has(item.destinationNodeId)) {
        earned += item.amount * DELIVERY_REWARD[item.resource];
      } else {
        remaining.push(item);
      }
    }

    this._money += earned;

    // 現在の積載量を計算する
    let currentLoad = 0;
    for (const item of remaining) {
      currentLoad += item.amount;
    }
    let spaceLeft = cargoCapacity - currentLoad;

    // 複合体内の全駅の待機貨物から、路線上の駅が目的地のものを容量まで積み込む
    const routeSet = new Set(routeStops);
    const newCargo = [...remaining];
    for (const nid of complexNodeIds) {
      const sc = this.stationCargo.get(nid);
      if (sc === undefined) continue;
      const kept: CargoItem[] = [];
      for (const item of sc.waiting) {
        if (spaceLeft <= 0 || item.amount <= 0 || !routeSet.has(item.destinationNodeId)) {
          kept.push(item);
          continue;
        }
        // 積める量を制限する
        const loadAmount = Math.min(item.amount, spaceLeft);
        const existing = newCargo.find(
          (c) => c.resource === item.resource && c.destinationNodeId === item.destinationNodeId,
        );
        if (existing !== undefined) {
          existing.amount += loadAmount;
        } else {
          newCargo.push({ resource: item.resource, destinationNodeId: item.destinationNodeId, amount: loadAmount });
        }
        spaceLeft -= loadAmount;
        // 積み残しがあれば駅に残す
        const leftover = item.amount - loadAmount;
        if (leftover > 0) {
          kept.push({ resource: item.resource, destinationNodeId: item.destinationNodeId, amount: leftover });
        }
      }
      sc.waiting = kept;
    }

    return { earned, newCargo };
  }

  /** 運行コストを差し引く */
  deductRunningCost(amount: number): void {
    this._money -= amount;
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
      cargo = { waiting: [] };
      this.stationCargo.set(nodeId, cargo);
    }
    return cargo;
  }

  private findNearestStation(tileX: number, tileY: number, graph: Graph): number | undefined {
    let bestNodeId: number | undefined;
    let bestDist = Infinity;

    for (const node of graph.getAllNodes()) {
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
