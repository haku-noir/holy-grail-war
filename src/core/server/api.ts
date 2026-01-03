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
  playCard(playerId: 'p1' | 'p2', cardId: CardId): Promise<TurnResponse>;

  // ゲームリセット (再戦リクエスト)
  // ゲームリセット (再戦リクエスト)
  resetGame(): Promise<GameState>;

  // 再戦リクエスト（より明示的なメソッド）
  requestRematch(): Promise<void>;

  createRoom(playerName: string, isHandOpen: boolean): Promise<string>; // Room ID
  joinRoom(roomId: string, playerName: string): Promise<void>;

  // 退出
  leaveRoom(): void;
}
