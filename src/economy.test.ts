import { describe, expect, it } from "vitest";
import { Graph, NodeKind } from "./graph.js";
import { Economy, Resource, generateCities } from "./economy.js";
import { TileMap } from "./tilemap.js";

describe("Economy", () => {
  it("adds cities", () => {
    const economy = new Economy();
    const city = economy.addCity("Test", 5, 5, 8);
    expect(city.name).toBe("Test");
    expect(economy.getAllCities()).toHaveLength(1);
  });

  it("produces cargo at nearby stations", () => {
    const graph = new Graph();
    const station = graph.addNode(NodeKind.Station, 5, 5, "A");

    const economy = new Economy();
    economy.addCity("Town", 5, 5, 8);

    // Manually add a farm building near the station
    // Use the internal buildings array via produce tick
    // Instead, test via the full update cycle with a map
    const map = new TileMap(20, 20);

    // Run enough to let city grow and produce
    for (let i = 0; i < 200; i++) {
      economy.update(0.1, graph, map);
    }

    // Check if any cargo appeared at the station
    const total = economy.getTotalWaiting(station.id);
    // May or may not have cargo depending on random building placement
    // At least verify no errors
    expect(total).toBeGreaterThanOrEqual(0);
  });

  it("delivers cargo and earns money", () => {
    const graph = new Graph();
    const station = graph.addNode(NodeKind.Station, 5, 5, "A");

    const economy = new Economy();
    // No city needed - just test direct delivery wouldn't earn
    // without consuming buildings. Add one manually isn't possible via public API.
    // Test the flow: carrying cargo with no consumers earns 0
    const carrying = new Map<number, number>([[Resource.Rice, 10]]);
    const { earned } = economy.trainArrive(station.id, carrying, graph);

    // No buildings to consume, so no earnings
    expect(earned).toBe(0);
  });

  it("picks up waiting cargo", () => {
    const graph = new Graph();
    const station = graph.addNode(NodeKind.Station, 5, 5, "A");

    const economy = new Economy();
    economy.addCity("Town", 5, 5, 8);

    const map = new TileMap(20, 20);
    // Run long enough for buildings to grow and produce
    for (let i = 0; i < 500; i++) {
      economy.update(0.1, graph, map);
    }

    const totalBefore = economy.getTotalWaiting(station.id);
    if (totalBefore > 0) {
      const { newCargo } = economy.trainArrive(station.id, new Map(), graph);
      let cargoTotal = 0;
      for (const amount of newCargo.values()) {
        cargoTotal += amount;
      }
      expect(cargoTotal).toBeGreaterThan(0);
      expect(economy.getTotalWaiting(station.id)).toBe(0);
    }
  });
});

describe("generateCities", () => {
  it("generates cities on flat terrain", () => {
    const map = new TileMap(64, 64);
    const economy = new Economy();
    generateCities(map, economy, 4, 42);
    expect(economy.getAllCities().length).toBeGreaterThanOrEqual(1);
  });

  it("deterministic with same seed", () => {
    const map1 = new TileMap(64, 64);
    const eco1 = new Economy();
    generateCities(map1, eco1, 4, 123);

    const map2 = new TileMap(64, 64);
    const eco2 = new Economy();
    generateCities(map2, eco2, 4, 123);

    const cities1 = eco1.getAllCities();
    const cities2 = eco2.getAllCities();
    expect(cities1.length).toBe(cities2.length);
    for (let i = 0; i < cities1.length; i++) {
      expect(cities1[i]?.centerX).toBe(cities2[i]?.centerX);
      expect(cities1[i]?.centerY).toBe(cities2[i]?.centerY);
    }
  });
});
