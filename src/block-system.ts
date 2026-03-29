import type { Graph } from "./graph.js";
import { sectionKey } from "./graph.js";

/**
 * キューベースの閉塞システム（複線専用）。
 *
 * ノード・エッジ（セクション）は全てキュー。
 * 列車は拒否されず必ずキューに入る。
 * 容量 = 同時に出発/通行できる列車数。
 */
export class BlockSystem {
  /** sectionKey -> trainId[]（先頭が最も前） */
  private sectionQueues = new Map<string, number[]>();
  /** nodeId -> trainId[]（先頭がスロット内、後方が待機列） */
  private nodeQueues = new Map<number, number[]>();

  /** キューを取得または作成してtrainIdを追加する */
  private static pushToQueue<K>(map: Map<K, number[]>, key: K, trainId: number): void {
    let q = map.get(key);
    if (q === undefined) {
      q = [];
      map.set(key, q);
    }
    q.push(trainId);
  }

  // --- ノード ---

  /** ノードキューに列車を追加（常に成功） */
  enqueueNode(nodeId: number, trainId: number): void {
    BlockSystem.pushToQueue(this.nodeQueues, nodeId, trainId);
  }

  /** ノードキューから列車を除去 */
  dequeueNode(nodeId: number, trainId: number): void {
    const q = this.nodeQueues.get(nodeId);
    if (q === undefined) return;
    const idx = q.indexOf(trainId);
    if (idx !== -1) q.splice(idx, 1);
  }

  /** 列車がノードのスロット内にいるか（出発可能か） */
  isInSlot(nodeId: number, trainId: number, graph: Graph): boolean {
    const node = graph.getNode(nodeId);
    if (node === undefined) return false;
    const q = this.nodeQueues.get(nodeId);
    if (q === undefined) return false;
    const idx = q.indexOf(trainId);
    return idx >= 0 && idx < node.capacity;
  }

  /** キュー内での列車の位置（0が先頭） */
  getQueuePosition(nodeId: number, trainId: number): number {
    const q = this.nodeQueues.get(nodeId);
    if (q === undefined) return 0;
    const idx = q.indexOf(trainId);
    return idx >= 0 ? idx : 0;
  }

  getNodeTrainCount(nodeId: number): number {
    return this.nodeQueues.get(nodeId)?.length ?? 0;
  }

  getNodeSlotCount(nodeId: number, graph: Graph): number {
    const node = graph.getNode(nodeId);
    if (node === undefined) return 0;
    const q = this.nodeQueues.get(nodeId);
    if (q === undefined) return 0;
    return Math.min(q.length, node.capacity);
  }

  getNodeWaitCount(nodeId: number, graph: Graph): number {
    const node = graph.getNode(nodeId);
    if (node === undefined) return 0;
    const q = this.nodeQueues.get(nodeId);
    if (q === undefined) return 0;
    return Math.max(0, q.length - node.capacity);
  }

  // --- セクション ---

  /** セクションキューに列車を追加（常に成功） */
  enqueueSection(edgeId: number, section: number, forward: boolean, trainId: number): void {
    BlockSystem.pushToQueue(this.sectionQueues, sectionKey(edgeId, section, forward), trainId);
  }

  /** セクションキューから列車を除去 */
  dequeueSection(edgeId: number, section: number, forward: boolean, trainId: number): void {
    const key = sectionKey(edgeId, section, forward);
    const q = this.sectionQueues.get(key);
    if (q === undefined) return;
    const idx = q.indexOf(trainId);
    if (idx !== -1) q.splice(idx, 1);
  }

  /** セクションが通行可能か（先頭1台のみ通行可能） */
  canMoveInSection(edgeId: number, section: number, forward: boolean, trainId: number): boolean {
    const key = sectionKey(edgeId, section, forward);
    const q = this.sectionQueues.get(key);
    if (q === undefined || q.length === 0) return true;
    return q[0] === trainId;
  }

  /** セクションが空いているか（新しい列車が入れるか） */
  isSectionEmpty(edgeId: number, section: number, forward: boolean): boolean {
    const key = sectionKey(edgeId, section, forward);
    const q = this.sectionQueues.get(key);
    return q === undefined || q.length === 0;
  }

  // --- 遷移操作 ---

  /** ノード → セクションへ出発。スロット内かつセクション空きなら成功 */
  tryDepart(trainId: number, nodeId: number, edgeId: number, section: number, forward: boolean, graph: Graph): boolean {
    if (!this.isInSlot(nodeId, trainId, graph)) return false;
    if (!this.isSectionEmpty(edgeId, section, forward)) return false;

    this.dequeueNode(nodeId, trainId);
    this.enqueueSection(edgeId, section, forward, trainId);
    return true;
  }

  /** セクション → ノードへ到着。常に成功（キューなので拒否しない） */
  arrive(trainId: number, edgeId: number, section: number, forward: boolean, nodeId: number): void {
    this.dequeueSection(edgeId, section, forward, trainId);
    this.enqueueNode(nodeId, trainId);
  }

  /** セクション間移動。次セクションが空なら成功 */
  tryAdvanceSection(trainId: number, edgeId: number, fromSection: number, toSection: number, forward: boolean): boolean {
    if (!this.isSectionEmpty(edgeId, toSection, forward)) return false;

    this.dequeueSection(edgeId, fromSection, forward, trainId);
    this.enqueueSection(edgeId, toSection, forward, trainId);
    return true;
  }

  /** スポーン */
  placeAtNode(nodeId: number, trainId: number): void {
    this.enqueueNode(nodeId, trainId);
  }

  /** 列車を削除 */
  removeTrain(trainId: number, isAtNode: boolean, nodeId: number, edgeId: number, section: number, forward: boolean): void {
    if (isAtNode) {
      this.dequeueNode(nodeId, trainId);
    } else {
      this.dequeueSection(edgeId, section, forward, trainId);
    }
  }

  // --- 不変条件チェック ---

  checkInvariants(): void {
    // セクション: 各セクションに1台以下
    for (const [key, q] of this.sectionQueues) {
      if (q.length > 1) {
        throw new Error(`閉塞違反: セクション${key}に${String(q.length)}台`);
      }
    }

    // ノード: 重複なし
    for (const [nodeId, q] of this.nodeQueues) {
      const unique = new Set(q);
      if (unique.size !== q.length) {
        throw new Error(`重複違反: ノード${String(nodeId)}に同一列車が複数回`);
      }
    }
  }
}
