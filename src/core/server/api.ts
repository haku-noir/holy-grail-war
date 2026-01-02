import type { CardId, GameState, BattleResult, BattleEvent } from '../types';

export interface TurnResponse {
  // 相手が出したカード（公開情報）
  opponentCard: CardId;

  // バトル解決結果
  battleResult: BattleResult;

  // アニメーション/ログ用の詳細イベント列
  events: BattleEvent[];

  // 更新後のゲーム状態
  gameState: GameState;
}

export interface ServerAPI {
  // カードをプレイし、ターン解決まで行う
  playCard(playerId: 'p1', cardId: CardId): Promise<TurnResponse>;

  // ゲームリセット
  resetGame(): Promise<GameState>;
}
