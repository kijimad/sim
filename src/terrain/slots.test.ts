import { describe, it, expect } from "vitest";
import { createContext } from "./context.js";
import {
  SLOT_ORDER,
  MULTI_SLOTS,
  noopStrategy,
  runPipeline,
  type Pipeline,
  type SlotName,
  type Strategy,
} from "./slots.js";

/** 実行順序を記録するフェイクストラテジを作る */
function recordingStrategy(
  slot: SlotName,
  name: string,
  log: string[],
): Strategy {
  return {
    name,
    slot,
    run: () => {
      log.push(`${slot}:${name}`);
    },
  };
}

/** 全スロットを recording で埋めたパイプラインを作る */
function buildRecordingPipeline(log: string[]): Pipeline {
  return {
    name: "recording",
    slots: {
      landmass: recordingStrategy("landmass", "L", log),
      tectonics: recordingStrategy("tectonics", "T", log),
      macroshape: recordingStrategy("macroshape", "M", log),
      climate: recordingStrategy("climate", "C", log),
      hydrology: recordingStrategy("hydrology", "H", log),
      erosion: recordingStrategy("erosion", "E", log),
      features: [
        recordingStrategy("features", "f1", log),
        recordingStrategy("features", "f2", log),
      ],
      biome: recordingStrategy("biome", "B", log),
      biomeFeatures: [
        recordingStrategy("biomeFeatures", "bf1", log),
        recordingStrategy("biomeFeatures", "bf2", log),
      ],
      finalize: recordingStrategy("finalize", "F", log),
    },
  };
}

describe("runPipeline", () => {
  it("SLOT_ORDER に従ってストラテジを実行する", () => {
    const log: string[] = [];
    const ctx = createContext(4, 4, 1);
    runPipeline(buildRecordingPipeline(log), ctx);

    expect(log).toEqual([
      "landmass:L",
      "tectonics:T",
      "macroshape:M",
      "climate:C",
      "hydrology:H",
      "erosion:E",
      "features:f1",
      "features:f2",
      "biome:B",
      "biomeFeatures:bf1",
      "biomeFeatures:bf2",
      "finalize:F",
    ]);
  });

  it("配列スロット（features / biomeFeatures）は配列の順序どおりに実行する", () => {
    const log: string[] = [];
    const ctx = createContext(4, 4, 1);
    const pipeline: Pipeline = {
      name: "multi",
      slots: {
        landmass: noopStrategy("landmass"),
        tectonics: noopStrategy("tectonics"),
        macroshape: noopStrategy("macroshape"),
        climate: noopStrategy("climate"),
        hydrology: noopStrategy("hydrology"),
        erosion: noopStrategy("erosion"),
        features: [
          recordingStrategy("features", "a", log),
          recordingStrategy("features", "b", log),
          recordingStrategy("features", "c", log),
        ],
        biome: noopStrategy("biome"),
        biomeFeatures: [],
        finalize: noopStrategy("finalize"),
      },
    };
    runPipeline(pipeline, ctx);
    expect(log).toEqual(["features:a", "features:b", "features:c"]);
  });

  it("配列スロットが空でも動作する", () => {
    const log: string[] = [];
    const ctx = createContext(4, 4, 1);
    const pipeline: Pipeline = {
      name: "empty",
      slots: {
        landmass: recordingStrategy("landmass", "L", log),
        tectonics: noopStrategy("tectonics"),
        macroshape: noopStrategy("macroshape"),
        climate: noopStrategy("climate"),
        hydrology: noopStrategy("hydrology"),
        erosion: noopStrategy("erosion"),
        features: [],
        biome: noopStrategy("biome"),
        biomeFeatures: [],
        finalize: recordingStrategy("finalize", "F", log),
      },
    };
    runPipeline(pipeline, ctx);
    expect(log).toEqual(["landmass:L", "finalize:F"]);
  });

  it("ストラテジが宣言スロットと配置先スロットで不一致なら例外", () => {
    const ctx = createContext(4, 4, 1);
    const mislabeled: Strategy = {
      name: "wrong",
      slot: "erosion", // 宣言は erosion
      run: () => {
        // noop
      },
    };
    const pipeline: Pipeline = {
      name: "bad",
      slots: {
        landmass: mislabeled, // ただし landmass に入れている
        tectonics: noopStrategy("tectonics"),
        macroshape: noopStrategy("macroshape"),
        climate: noopStrategy("climate"),
        hydrology: noopStrategy("hydrology"),
        erosion: noopStrategy("erosion"),
        features: [],
        biome: noopStrategy("biome"),
        biomeFeatures: [],
        finalize: noopStrategy("finalize"),
      },
    };
    expect(() => runPipeline(pipeline, ctx)).toThrow(/landmass/);
  });

  it("配列スロット内の不一致も検出する", () => {
    const ctx = createContext(4, 4, 1);
    const wrongFeature: Strategy = {
      name: "wrong-feature",
      slot: "biomeFeatures",
      run: () => {
        // noop
      },
    };
    const pipeline: Pipeline = {
      name: "bad2",
      slots: {
        landmass: noopStrategy("landmass"),
        tectonics: noopStrategy("tectonics"),
        macroshape: noopStrategy("macroshape"),
        climate: noopStrategy("climate"),
        hydrology: noopStrategy("hydrology"),
        erosion: noopStrategy("erosion"),
        features: [wrongFeature],
        biome: noopStrategy("biome"),
        biomeFeatures: [],
        finalize: noopStrategy("finalize"),
      },
    };
    expect(() => runPipeline(pipeline, ctx)).toThrow(/features/);
  });

  it("ストラテジは ctx を受け取り変更できる", () => {
    const ctx = createContext(4, 4, 1);
    const pipeline: Pipeline = {
      name: "mutate",
      slots: {
        landmass: {
          name: "set-elevation",
          slot: "landmass",
          run: (c) => {
            for (let i = 0; i < c.elevation.length; i++) c.elevation[i] = 0.5;
          },
        },
        tectonics: noopStrategy("tectonics"),
        macroshape: noopStrategy("macroshape"),
        climate: noopStrategy("climate"),
        hydrology: noopStrategy("hydrology"),
        erosion: noopStrategy("erosion"),
        features: [],
        biome: noopStrategy("biome"),
        biomeFeatures: [],
        finalize: noopStrategy("finalize"),
      },
    };
    runPipeline(pipeline, ctx);
    expect(ctx.elevation[0]).toBe(0.5);
    expect(ctx.elevation[15]).toBe(0.5);
  });
});

describe("SLOT_ORDER", () => {
  it("SlotName を全て含み、重複しない", () => {
    const expectedSlots: SlotName[] = [
      "landmass",
      "tectonics",
      "macroshape",
      "climate",
      "hydrology",
      "erosion",
      "features",
      "biome",
      "biomeFeatures",
      "finalize",
    ];
    expect([...SLOT_ORDER].sort()).toEqual([...expectedSlots].sort());
    expect(new Set(SLOT_ORDER).size).toBe(SLOT_ORDER.length);
  });

  it("MULTI_SLOTS は features と biomeFeatures のみ", () => {
    expect(MULTI_SLOTS.has("features")).toBe(true);
    expect(MULTI_SLOTS.has("biomeFeatures")).toBe(true);
    expect(MULTI_SLOTS.size).toBe(2);
  });
});

describe("noopStrategy", () => {
  it("指定したスロットに属する何もしないストラテジを返す", () => {
    const s = noopStrategy("erosion");
    expect(s.slot).toBe("erosion");
    expect(s.name).toBe("none");
    // 実行しても例外を出さない
    const ctx = createContext(2, 2, 1);
    s.run(ctx);
  });

  it("カスタム名を指定できる", () => {
    const s = noopStrategy("tectonics", "skip-uplift");
    expect(s.name).toBe("skip-uplift");
  });
});
