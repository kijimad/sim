import { describe, expect, it } from "vitest";
import {
  VEHICLE_CATALOG,
  getVehicleType,
  calcConsistStats,
} from "./vehicle.js";
import { Resource } from "./economy.js";

describe("Vehicle - カタログ", () => {
  it("全車両タイプが取得できる", () => {
    expect(getVehicleType("loco_steam")).toBeDefined();
    expect(getVehicleType("loco_diesel")).toBeDefined();
    expect(getVehicleType("car_passenger_2nd")).toBeDefined();
    expect(getVehicleType("car_passenger_1st")).toBeDefined();
    expect(getVehicleType("car_freight")).toBeDefined();
    expect(getVehicleType("loco_express")).toBeDefined();
  });

  it("存在しない車両タイプは undefined", () => {
    expect(getVehicleType("nonexistent")).toBeUndefined();
  });

  it("カタログに6種類ある", () => {
    expect(VEHICLE_CATALOG.length).toBe(6);
  });
});

describe("Vehicle - 性能算出", () => {
  it("機関車+客車2両の編成", () => {
    const stats = calcConsistStats(["loco_steam", "car_passenger_2nd", "car_passenger_2nd"]);
    expect(stats).not.toBeNull();
    const s = stats!;

    // 最高速度 = min(4.0, 8.0, 8.0) = 4.0
    expect(s.maxSpeed).toBe(4.0);
    // 総出力 = 300
    expect(s.totalPower).toBe(300);
    // 総重量 = 80 + 20 + 20 = 120
    expect(s.totalWeight).toBe(120);
    // 容量 = 50 + 50 = 100（旅客）
    expect(s.capacity.get(Resource.Passengers)).toBe(100);
    // 購入費 = 500 + 80 + 80 = 660
    expect(s.purchaseCost).toBe(660);
    // 運行費 = 3 + 1 + 1 = 5
    expect(s.runningCost).toBe(5);
    // 動力あり
    expect(s.hasPower).toBe(true);
  });

  it("ディーゼル機関車+貨車3両の編成", () => {
    const stats = calcConsistStats(["loco_diesel", "car_freight", "car_freight", "car_freight"]);
    expect(stats).not.toBeNull();
    const s = stats!;

    // 最高速度 = min(6.0, 5.0, 5.0, 5.0) = 5.0
    expect(s.maxSpeed).toBe(5.0);
    // 総出力 = 500
    expect(s.totalPower).toBe(500);
    // 総重量 = 60 + 15*3 = 105
    expect(s.totalWeight).toBe(105);
    // 汎用貨車は cargoType=null → 全種積載可能として容量計算
    expect(s.totalCapacity).toBe(180);
  });

  it("特急機関車+1等客車の編成", () => {
    const stats = calcConsistStats(["loco_express", "car_passenger_1st", "car_passenger_1st"]);
    expect(stats).not.toBeNull();
    const s = stats!;

    expect(s.hasPower).toBe(true);
    // 出力 = 600
    expect(s.totalPower).toBe(600);
    // 最高速度 = min(8.0, 8.0, 8.0) = 8.0
    expect(s.maxSpeed).toBe(8.0);
    // 容量 = 30 + 30 = 60（旅客）
    expect(s.capacity.get(Resource.Passengers)).toBe(60);
    // 重量 = 50 + 22 + 22 = 94
    expect(s.totalWeight).toBe(94);
  });

  it("動力車なしの編成は hasPower=false", () => {
    const stats = calcConsistStats(["car_passenger_2nd", "car_freight"]);
    expect(stats).not.toBeNull();
    const s = stats!;

    expect(s.hasPower).toBe(false);
    expect(s.totalPower).toBe(0);
  });

  it("空の編成は null を返す", () => {
    expect(calcConsistStats([])).toBeNull();
  });

  it("不正な車両IDを含む編成は null を返す", () => {
    expect(calcConsistStats(["loco_steam", "nonexistent"])).toBeNull();
  });

  it("実効速度は出力/重量比で制限される", () => {
    // 機関車1両+貨車1両 vs 機関車1両+貨車5両
    const light = calcConsistStats(["loco_steam", "car_freight"])!;
    const heavy = calcConsistStats([
      "loco_steam", "car_freight", "car_freight", "car_freight", "car_freight", "car_freight",
    ])!;

    // 重い編成のほうが実効速度が遅い
    expect(heavy.effectiveSpeed).toBeLessThan(light.effectiveSpeed);
    // どちらも最高速度以下
    expect(light.effectiveSpeed).toBeLessThanOrEqual(light.maxSpeed);
    expect(heavy.effectiveSpeed).toBeLessThanOrEqual(heavy.maxSpeed);
    // 0 より大きい
    expect(heavy.effectiveSpeed).toBeGreaterThan(0);
  });
});
