import { Resource } from "./economy.js";

// --- 車両タイプ ---

export interface VehicleType {
  /** 一意なID */
  readonly id: string;
  /** 表示名 */
  readonly name: string;
  /** 出力 kW（0 = 動力なし） */
  readonly power: number;
  /** 自重（トン） */
  readonly weight: number;
  /** 最高速度（タイル/秒） */
  readonly maxSpeed: number;
  /** 積載量（0 = 積めない） */
  readonly capacity: number;
  /** 積める貨物種別（null = 全種） */
  readonly cargoType: Resource | null;
  /** 購入費 */
  readonly cost: number;
  /** 運行コスト/秒 */
  readonly runningCost: number;
}

// --- 車両カタログ ---

export const VEHICLE_CATALOG: readonly VehicleType[] = [
  {
    id: "loco_steam",
    name: "蒸気機関車",
    power: 300,
    weight: 80,
    maxSpeed: 4.0,
    capacity: 0,
    cargoType: null,
    cost: 500,
    runningCost: 3,
  },
  {
    id: "loco_diesel",
    name: "ディーゼル機関車",
    power: 500,
    weight: 60,
    maxSpeed: 6.0,
    capacity: 0,
    cargoType: null,
    cost: 800,
    runningCost: 5,
  },
  {
    id: "car_passenger_2nd",
    name: "2等客車",
    power: 0,
    weight: 20,
    maxSpeed: 8.0,
    capacity: 50,
    cargoType: Resource.Passengers,
    cost: 80,
    runningCost: 1,
  },
  {
    id: "car_passenger_1st",
    name: "1等客車",
    power: 0,
    weight: 22,
    maxSpeed: 8.0,
    capacity: 30,
    cargoType: Resource.Passengers,
    cost: 150,
    runningCost: 2,
  },
  {
    id: "car_freight",
    name: "貨車",
    power: 0,
    weight: 15,
    maxSpeed: 5.0,
    capacity: 60,
    cargoType: null,
    cost: 80,
    runningCost: 1,
  },
  {
    id: "loco_express",
    name: "特急機関車",
    power: 600,
    weight: 50,
    maxSpeed: 8.0,
    capacity: 0,
    cargoType: null,
    cost: 1000,
    runningCost: 6,
  },
];

const vehicleMap = new Map<string, VehicleType>();
for (const v of VEHICLE_CATALOG) {
  vehicleMap.set(v.id, v);
}

/** 車両タイプをIDで取得する */
export function getVehicleType(id: string): VehicleType | undefined {
  return vehicleMap.get(id);
}

// --- 編成性能算出 ---

/** 出力/重量比から実効速度を算出する係数 */
const POWER_WEIGHT_FACTOR = 1.5;

export interface ConsistStats {
  /** 最高速度 = 最遅車両の maxSpeed */
  readonly maxSpeed: number;
  /** 出力/重量比を考慮した実効速度 */
  readonly effectiveSpeed: number;
  /** 総出力 kW */
  readonly totalPower: number;
  /** 総重量（トン） */
  readonly totalWeight: number;
  /** 動力車があるか */
  readonly hasPower: boolean;
  /** 貨物種別ごとの容量 */
  readonly capacity: ReadonlyMap<Resource, number>;
  /** 汎用貨車（cargoType=null）の容量 */
  readonly generalCapacity: number;
  /** 全容量の合計 */
  readonly totalCapacity: number;
  /** 購入費合計 */
  readonly purchaseCost: number;
  /** 運行コスト合計/秒 */
  readonly runningCost: number;
  /** 車両数 */
  readonly carCount: number;
}

/** 車両ID配列から編成性能を算出する。不正な場合は null */
export function calcConsistStats(cars: readonly string[]): ConsistStats | null {
  if (cars.length === 0) return null;

  let maxSpeed = Infinity;
  let totalPower = 0;
  let totalWeight = 0;
  let purchaseCost = 0;
  let runningCost = 0;
  const capacity = new Map<Resource, number>();
  let generalCapacity = 0;

  for (const carId of cars) {
    const vt = vehicleMap.get(carId);
    if (vt === undefined) return null;

    maxSpeed = Math.min(maxSpeed, vt.maxSpeed);
    totalPower += vt.power;
    totalWeight += vt.weight;
    purchaseCost += vt.cost;
    runningCost += vt.runningCost;

    if (vt.capacity > 0) {
      if (vt.cargoType !== null) {
        capacity.set(vt.cargoType, (capacity.get(vt.cargoType) ?? 0) + vt.capacity);
      } else {
        generalCapacity += vt.capacity;
      }
    }
  }

  let totalCapacity = generalCapacity;
  for (const v of capacity.values()) {
    totalCapacity += v;
  }

  const hasPower = totalPower > 0;

  // 実効速度: min(最高速度, 出力/重量比 × 係数)
  // 動力なしなら 0
  let effectiveSpeed: number;
  if (!hasPower) {
    effectiveSpeed = 0;
  } else {
    const powerRatio = (totalPower / totalWeight) * POWER_WEIGHT_FACTOR;
    effectiveSpeed = Math.min(maxSpeed, powerRatio);
  }

  return {
    maxSpeed,
    effectiveSpeed,
    totalPower,
    totalWeight,
    hasPower,
    capacity,
    generalCapacity,
    totalCapacity,
    purchaseCost,
    runningCost,
    carCount: cars.length,
  };
}
