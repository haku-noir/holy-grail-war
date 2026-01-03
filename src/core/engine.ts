import type { 
  GameState, PlayerId, CardId, 
  BattleContext, BattleResult, CardEffect, RewardTransaction, BattleEvent
} from './types';
import { CARDS, CARD_EFFECTS } from './cards';

// const INITIAL_HAND_SIZE = 5;
const INITIAL_GRAILS = 2;
const MAX_TURNS = 5;

// 配列をシャッフルするヘルパー
function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 無効化されたカード用（トリスタン効果）
const DEFAULT_EFFECT: CardEffect = {
  getPower: (ctx) => CARDS[ctx.isP1 ? ctx.p1Card : ctx.p2Card].basePower,
  checkInstantWin: () => false,
  getRuleModifier: () => null,
  onResolveReward: () => null,
  onTurnEnd: () => {},
};

export class GameEngine {
  gameState: GameState;

  constructor(state?: GameState) {
    if (state) {
      // 状態のディープコピーを作成して、元のオブジェクトに影響を与えないようにする
      this.gameState = JSON.parse(JSON.stringify(state));
    } else {
      this.gameState = this.createInitialState();
    }
  }

  createInitialState(): GameState {
    const deck = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] as CardId[]);

    // 5枚ずつ配布
    const p1Hand = deck.slice(0, 5);
    const p2Hand = deck.slice(5, 10);

    return {
      turn: 1,
      phase: 'selection',
      players: {
        p1: {
          id: 'p1',
          hand: p1Hand,
          grails: INITIAL_GRAILS,
          playedCard: null,
          wonCards: [],
          nextTurnBuff: 0,
        },
        p2: {
          id: 'p2',
          hand: p2Hand,
          grails: INITIAL_GRAILS,
          playedCard: null,
          wonCards: [],
          nextTurnBuff: 0,
        }
      },
      stockGrails: 100,
      logs: [], // 必要に応じてテキスト履歴の保存に使用
      winner: null
    };
  }

  // アクション: カードプレイ (Resolveは呼ばない)
  playCard(playerId: PlayerId, cardId: CardId): void {
    if (this.gameState.phase !== 'selection') return;

    const player = this.gameState.players[playerId];
    if (!player.hand.includes(cardId)) {
      console.error(`Player ${playerId} tried to play invalid card ${cardId}`);
      return;
    }

    player.playedCard = cardId;
    player.hand = player.hand.filter(c => c !== cardId);
  }

  // ターン解決: 明示的に呼び出す
  resolveTurn(): { result: BattleResult, events: BattleEvent[] } {
    this.gameState.phase = 'resolution';
    const events: BattleEvent[] = [];

    // 両者がプレイしたか確認
    if (!this.gameState.players.p1.playedCard || !this.gameState.players.p2.playedCard) {
      throw new Error("Cannot resolve turn: both players must play a card.");
    }

    const p1CardId = this.gameState.players.p1.playedCard!;
    const p2CardId = this.gameState.players.p2.playedCard!;

    events.push({ type: 'battle_start', payload: { turn: this.gameState.turn, p1Card: p1CardId, p2Card: p2CardId } });

    // 1. 効果の有効化判定 (トリスタン処理)
    let p1Effect = CARD_EFFECTS[p1CardId];
    let p2Effect = CARD_EFFECTS[p2CardId];

    if (p2CardId === 6) {
      events.push({ type: 'effect_activation', message: 'P2トリスタンの効果: P1の効果を無効化！', payload: { player: 'p2', card: 6, effect: 'negate' } });
      p1Effect = DEFAULT_EFFECT;
    }
    if (p1CardId === 6) {
      events.push({ type: 'effect_activation', message: 'P1トリスタンの効果: P2の効果を無効化！', payload: { player: 'p1', card: 6, effect: 'negate' } });
      p2Effect = DEFAULT_EFFECT;
    }

    // コンテキスト作成
    const ctxP1: BattleContext = {
      p1Card: p1CardId, p2Card: p2CardId,
      p1State: this.gameState.players.p1, p2State: this.gameState.players.p2,
      gameState: this.gameState, isP1: true
    };
    const ctxP2: BattleContext = { ...ctxP1, isP1: false };

    // 2. パワー計算
    let p1Power = p1Effect.getPower(ctxP1);
    let p2Power = p2Effect.getPower(ctxP2);

    // バフ適用
    p1Power += this.gameState.players.p1.nextTurnBuff;
    p2Power += this.gameState.players.p2.nextTurnBuff;

    // バフのリセット
    this.gameState.players.p1.nextTurnBuff = 0;
    this.gameState.players.p2.nextTurnBuff = 0;

    // 3. 勝利判定
    let winner: PlayerId | 'draw' = 'draw';

    // 特殊勝利チェック
    const p1Instant = p1Effect.checkInstantWin(ctxP1);
    const p2Instant = p2Effect.checkInstantWin(ctxP2);

    if (p1Instant && !p2Instant) winner = 'p1';
    else if (!p1Instant && p2Instant) winner = 'p2';
    else if (p1Instant && p2Instant) winner = 'draw';
    else {
      // 通常比較
      const p1Rule = p1Effect.getRuleModifier(ctxP1);
      const p2Rule = p2Effect.getRuleModifier(ctxP2);

      const lowerWins = (p1Rule === 'lower_wins' || p2Rule === 'lower_wins');

      if (lowerWins) {
        events.push({ type: 'rule_change', message: 'ルール変更: 小さい方が勝つ！', payload: { rule: 'lower_wins' } });
        if (p1Power < p2Power) winner = 'p1';
        else if (p2Power < p1Power) winner = 'p2';
        else winner = 'draw';
      } else {
        if (p1Power > p2Power) winner = 'p1';
        else if (p2Power > p1Power) winner = 'p2';
        else winner = 'draw';
      }
    }

    // 4. 報酬ロジック
    const p1Base = CARDS[p1CardId].basePower;
    const p2Base = CARDS[p2CardId].basePower;

    let isLowerWinnings = false;
    if (winner === 'p1' && p1Base < p2Base) isLowerWinnings = true;
    if (winner === 'p2' && p2Base < p1Base) isLowerWinnings = true;

    if (isLowerWinnings) {
      events.push({ type: 'rule_change', message: '下剋上！(元々の数値が小さい方が勝利)', payload: { rule: 'gekokujo' } });
    }

    const battleResult: BattleResult = {
      winner, p1Power, p2Power, isLowerWinnings
    };

    events.push({ type: 'battle_end', payload: battleResult });

    // 取引（Transaction）計算
    let transaction: RewardTransaction = { p1Change: 0, p2Change: 0, stockChange: 0 };

    if (winner !== 'draw') {
      // 基本報酬
      if (isLowerWinnings) {
        // 下剋上 (強奪: 相手-1, 自分+1)
        if (winner === 'p1') { transaction.p1Change = 1; transaction.p2Change = -1; }
        else { transaction.p2Change = 1; transaction.p1Change = -1; }
      } else {
        // 圧勝 (確保: 場-1, 自分+1)
        if (winner === 'p1') { transaction.p1Change = 1; transaction.stockChange = -1; }
        else { transaction.p2Change = 1; transaction.stockChange = -1; }
      }

      // 効果によるオーバーライド
      const winnerEffect = winner === 'p1' ? p1Effect : p2Effect;
      const winnerCtx = winner === 'p1' ? ctxP1 : ctxP2;

      const winnerOverride = winnerEffect.onResolveReward(winnerCtx, battleResult);
      if (winnerOverride) transaction = winnerOverride;

      const loserEffect = winner === 'p1' ? p2Effect : p1Effect;
      const loserCtx = winner === 'p1' ? ctxP2 : ctxP1;

      const loserOverride = loserEffect.onResolveReward(loserCtx, battleResult);
      if (loserOverride) transaction = loserOverride;
    }

    // 取引実行 & Event生成
    if (transaction.p1Change !== 0) {
      this.gameState.players.p1.grails += transaction.p1Change;
      events.push({ type: 'grail_transfer', payload: { player: 'p1', amount: transaction.p1Change, reason: 'reward' } });
    }
    if (transaction.p2Change !== 0) {
      this.gameState.players.p2.grails += transaction.p2Change;
      events.push({ type: 'grail_transfer', payload: { player: 'p2', amount: transaction.p2Change, reason: 'reward' } });
    }
    if (transaction.stockChange !== 0) {
      this.gameState.stockGrails += transaction.stockChange;
    }

    // 0未満にはならないように制限
    if (this.gameState.players.p1.grails < 0) this.gameState.players.p1.grails = 0;
    if (this.gameState.players.p2.grails < 0) this.gameState.players.p2.grails = 0;

    // 5. ターン終了時フック (ベディヴィアなど) - 必要ならイベント生成？
    p1Effect.onTurnEnd(ctxP1, battleResult);
    p2Effect.onTurnEnd(ctxP2, battleResult);

    // 次ターンのバフをチェックしてイベント発行
    if (this.gameState.players.p1.nextTurnBuff !== 0) {
      events.push({ 
        type: 'buff_gain', 
        payload: { player: 'p1', amount: this.gameState.players.p1.nextTurnBuff } 
      });
    }
    if (this.gameState.players.p2.nextTurnBuff !== 0) {
      events.push({ 
        type: 'buff_gain', 
        payload: { player: 'p2', amount: this.gameState.players.p2.nextTurnBuff } 
      });
    }

    // 勝利カード記録
    if (winner === 'p1') this.gameState.players.p1.wonCards.push(p2CardId);
    if (winner === 'p2') this.gameState.players.p2.wonCards.push(p1CardId);

    // クリーンアップ
    this.gameState.players.p1.playedCard = null;
    this.gameState.players.p2.playedCard = null;

    if (this.gameState.turn >= MAX_TURNS) {
      // 終了判定はUI側/MockServer側で checkGameOver を呼ぶか、あるいはここで呼ぶか。
      // ここではGameEngineは純粋にターンを解決するだけにし、GameOverチェックは呼び出し元が行うのが疎結合。
      // ただし、ターンカウンターは更新するか？
      // 5ターン目終わったらインクリメントせずにそのまま
    } else {
      this.gameState.turn++;
      this.gameState.phase = 'selection';
    }

    return { result: battleResult, events };
  }

  checkGameOver(): PlayerId | 'draw' {
    this.gameState.phase = 'gameover';
    const p1 = this.gameState.players.p1;
    const p2 = this.gameState.players.p2;

    if (p1.grails > p2.grails) this.gameState.winner = 'p1';
    else if (p2.grails > p1.grails) this.gameState.winner = 'p2';
    else {
      // 武勲判定
      const p1Score = p1.wonCards.reduce((sum, id) => sum + CARDS[id].basePower, 0);
      const p2Score = p2.wonCards.reduce((sum, id) => sum + CARDS[id].basePower, 0);

      if (p1Score > p2Score) this.gameState.winner = 'p1';
      else if (p2Score > p1Score) this.gameState.winner = 'p2';
      else this.gameState.winner = 'draw';
    }
    return this.gameState.winner!;
  }
}
