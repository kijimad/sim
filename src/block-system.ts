import type { Graph } from "./graph.js";
import { NodeKind, SignalLayout } from "./graph.js";

/**
 * 閉塞システム: エッジ（閉塞区間）の予約とノード（閉塞境界）の占有を管理する。
 *
 * 不変条件:
 * - エッジの占有数はエッジの容量を超えない（現在はデフォルト1、将来的に複線対応）
 * - ノードの占有数はノードの容量を超えない
 * - 信号場のレイアウトに応じた方向制約が守られる
 */
export class BlockSystem {
  /** エッジの容量（デフォルト1。複線化で2にする） */
  private edgeCapacity = new Map<number, number>();
  private readonly defaultEdgeCapacity = 1;
  /** edgeId -> Set<trainId> */
  private edgeOccupants = new Map<number, Set<number>>();
  /** nodeId -> Map<trainId, fromEdgeId> */
  private nodeOccupants = new Map<number, Map<number, number>>();

  // --- クエリ ---

  setEdgeCapacity(edgeId: number, capacity: number): void {
    this.edgeCapacity.set(edgeId, capacity);
  }

  getEdgeCapacity(edgeId: number): number {
    return this.edgeCapacity.get(edgeId) ?? this.defaultEdgeCapacity;
  }

  isEdgeFree(edgeId: number, excludeTrainId?: number): boolean {
    const occupants = this.edgeOccupants.get(edgeId);
    if (occupants === undefined || occupants.size === 0) return true;
    const cap = this.getEdgeCapacity(edgeId);
    if (excludeTrainId !== undefined && occupants.has(excludeTrainId)) {
      return occupants.size - 1 < cap;
    }
    return occupants.size < cap;
  }

  canEnterNode(nodeId: number, fromEdgeId: number, graph: Graph): boolean {
    const node = graph.getNode(nodeId);
    if (node === undefined) return false;

    const occupants = this.nodeOccupants.get(nodeId);
    if (occupants === undefined || occupants.size === 0) return true;
    if (occupants.size >= node.capacity) return false;

    // 信号場以外のノードは総容量のみ確認する
    if (node.kind !== NodeKind.SignalStation) return true;

    if (node.signalLayout === SignalLayout.Passing) {
      // 方向ごとに1線路: 同じエッジから来た列車は1台まで
      for (const arrivedFrom of occupants.values()) {
        if (arrivedFrom === fromEdgeId) return false;
      }
      return true;
    }

    // 追い越し: 全占有列車が同じ方向からでなければならない
    for (const arrivedFrom of occupants.values()) {
      if (arrivedFrom !== fromEdgeId) return false;
    }
    return true;
  }

  getNodeTrainCount(nodeId: number): number {
    return this.nodeOccupants.get(nodeId)?.size ?? 0;
  }

  // --- 操作 ---

  /**
   * 列車がノードからエッジへ出発する。
   * エッジ予約 + ノード解放をアトミックに行う。
   * 失敗した場合は何も変更しない。
   */
  tryDepart(trainId: number, nodeId: number, edgeId: number, destNodeId: number, graph: Graph): boolean {
    // エッジが空いているか
    if (!this.isEdgeFree(edgeId, trainId)) return false;
    // 到着先ノードに入れるか
    if (!this.canEnterNode(destNodeId, edgeId, graph)) return false;

    // アトミックに実行
    this.addToEdge(edgeId, trainId);
    this.removeFromNode(nodeId, trainId);
    return true;
  }

  /**
   * 列車がエッジからノードへ到着する。
   * ノード入場 + エッジ解放をアトミックに行う。
   * 失敗した場合は何も変更しない。
   */
  tryArrive(trainId: number, edgeId: number, nodeId: number, graph: Graph): boolean {
    if (!this.canEnterNode(nodeId, edgeId, graph)) return false;

    // アトミックに実行
    this.addToNode(nodeId, trainId, edgeId);
    this.removeFromEdge(edgeId, trainId);
    return true;
  }

  /** スポーン時にノードに配置する */
  placeAtNode(nodeId: number, trainId: number): void {
    this.addToNode(nodeId, trainId, -1);
  }

  /** 列車を完全に削除する */
  removeTrain(trainId: number, state: number, nodeId: number, edgeId: number): void {
    if (state === 0) { // AtNode
      this.removeFromNode(nodeId, trainId);
    } else {
      this.removeFromEdge(edgeId, trainId);
    }
  }

  // --- 不変条件チェック ---

  checkInvariants(graph: Graph): void {
    // 1. エッジ容量を超えていないこと
    for (const [edgeId, occupants] of this.edgeOccupants) {
      const cap = this.getEdgeCapacity(edgeId);
      if (occupants.size > cap) {
        throw new Error(
          `閉塞違反: エッジ${String(edgeId)}(容量${String(cap)})に${String(occupants.size)}台`,
        );
      }
    }

    // 2. ノード容量を超えていないこと
    for (const [nodeId, occupants] of this.nodeOccupants) {
      const node = graph.getNode(nodeId);
      if (node !== undefined && occupants.size > node.capacity) {
        throw new Error(
          `容量違反: ノード${String(nodeId)}(容量${String(node.capacity)})に${String(occupants.size)}台`,
        );
      }
    }
  }

  // --- 内部 ---

  private addToNode(nodeId: number, trainId: number, fromEdgeId: number): void {
    let map = this.nodeOccupants.get(nodeId);
    if (map === undefined) {
      map = new Map();
      this.nodeOccupants.set(nodeId, map);
    }
    map.set(trainId, fromEdgeId);
  }

  private removeFromNode(nodeId: number, trainId: number): void {
    this.nodeOccupants.get(nodeId)?.delete(trainId);
  }

  private addToEdge(edgeId: number, trainId: number): void {
    let set = this.edgeOccupants.get(edgeId);
    if (set === undefined) {
      set = new Set();
      this.edgeOccupants.set(edgeId, set);
    }
    set.add(trainId);
  }

  private removeFromEdge(edgeId: number, trainId: number): void {
    this.edgeOccupants.get(edgeId)?.delete(trainId);
  }
}
