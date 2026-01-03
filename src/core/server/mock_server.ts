import type { ServerAPI, TurnResponse } from './api';
import { GameEngine } from '../engine';
import { CPU } from '../cpu';
import type { CardId, GameState } from '../types';

export class MockServer implements ServerAPI {
  private engine: GameEngine;
  private latencyMs: number = 800; // ネットワーク遅延・思考時間のシミュレーション

  constructor() {
    this.engine = new GameEngine();
  }

  async playCard(playerId: 'p1' | 'p2', cardId: CardId): Promise<TurnResponse> {
    // 1. ネットワーク遅延・CPU思考のシミュレーション
    await new Promise(resolve => setTimeout(resolve, this.latencyMs));

    // 2. プレイヤー1のプレイ
    this.engine.playCard(playerId, cardId);

    // 3. CPU（プレイヤー2）のプレイ
    // CPUは現在のゲーム状態を元に決定します
    // 注: CPUロジックが 'selection' フェーズに依存している場合、調整が必要になる可能性があります
    const cpuCard = CPU.selectCard(this.engine.gameState, 'p2');
    this.engine.playCard('p2', cpuCard);

    // 4. ターンの解決
    const resolution = this.engine.resolveTurn();

    // ゲーム終了判定
    // フェーズが 'selection' に戻っていない場合、最大ターンに達したことを意味します
    if (this.engine.gameState.phase !== 'selection') {
      this.engine.checkGameOver();
      // 必要に応じて game_over イベントを追加しますか？
      // クライアント側で phase === 'gameover' をチェックしているので十分と思われます。
    }

    // 5. レスポンスの構築
    return {
      opponentCard: cpuCard,
      battleResult: resolution.result,
      events: resolution.events,
      gameState: this.engine.gameState // 注: 実際のアプリでは、相手の手札を隠すためにサニタイズが必要です
    };
  }

  async resetGame(): Promise<GameState> {
    this.engine = new GameEngine();
    return this.engine.gameState;
  }

  async requestRematch(): Promise<void> {
      // モックでは何もしない
      return;
  }
  
  leaveRoom(): void {
      // モックでは何もしない
  }
}
