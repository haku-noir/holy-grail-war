import type { 
  GameState, PlayerId, CardId, 
  BattleContext, BattleResult, CardEffect, RewardTransaction 
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

  constructor() {
    this.gameState = this.createInitialState();
  }

  private createInitialState(): GameState {
    const deck = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] as CardId[]);

    // 5枚ずつ配布
    const p1Hand = deck.slice(0, 5);
    const p2Hand = deck.slice(5, 10);

    // 残り3枚は未使用

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
      stockGrails: 100, // Conceptually infinite
      logs: ['Game Start.'],
      winner: null
    };
  }

  // アクション: カードプレイ
  playCard(playerId: PlayerId, cardId: CardId): void {
    if (this.gameState.phase !== 'selection') return;

    const player = this.gameState.players[playerId];
    if (!player.hand.includes(cardId)) {
      console.error(`Player ${playerId} tried to play invalid card ${cardId}`);
      return;
    }

    player.playedCard = cardId;
    player.hand = player.hand.filter(c => c !== cardId);

    // 両者がカードを出したらターン解決へ
    if (this.gameState.players.p1.playedCard && this.gameState.players.p2.playedCard) {
      this.resolveTurn();
    }
  }

  private resolveTurn(): void {
    this.gameState.phase = 'resolution';
    const p1CardId = this.gameState.players.p1.playedCard!;
    const p2CardId = this.gameState.players.p2.playedCard!;

    this.log(`ターン ${this.gameState.turn}: P1は ${CARDS[p1CardId].name}(${p1CardId}) をプレイ vs P2は ${CARDS[p2CardId].name}(${p2CardId}) をプレイ`);

    // 1. 効果の有効化判定 (トリスタン処理)
    let p1Effect = CARD_EFFECTS[p1CardId];
    let p2Effect = CARD_EFFECTS[p2CardId];

    if (p2CardId === 6) {
      this.log('P2トリスタンの効果: P1の効果を無効化！');
      p1Effect = DEFAULT_EFFECT;
    }
    if (p1CardId === 6) {
      this.log('P1トリスタンの効果: P2の効果を無効化！');
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
    // 基本パワー取得
    let p1Power = p1Effect.getPower(ctxP1);
    let p2Power = p2Effect.getPower(ctxP2);

    // バフ適用 (ベディヴィア/パーシヴァル)
    p1Power += this.gameState.players.p1.nextTurnBuff;
    p2Power += this.gameState.players.p2.nextTurnBuff;

    // バフのリセット
    this.gameState.players.p1.nextTurnBuff = 0;
    this.gameState.players.p2.nextTurnBuff = 0;

    this.log(`パワー: P1(${p1Power}) vs P2(${p2Power})`);

    // 3. 勝利判定
    let winner: PlayerId | 'draw' = 'draw';

    // 特殊勝利チェック
    const p1Instant = p1Effect.checkInstantWin(ctxP1);
    const p2Instant = p2Effect.checkInstantWin(ctxP2);

    if (p1Instant && !p2Instant) winner = 'p1';
    else if (!p1Instant && p2Instant) winner = 'p2';
    else if (p1Instant && p2Instant) winner = 'draw'; // Mutual instant win? Draw.
    else {
      // 通常比較
      // ルール変更チェック (ダゴネット)
      const p1Rule = p1Effect.getRuleModifier(ctxP1);
      const p2Rule = p2Effect.getRuleModifier(ctxP2);

      const lowerWins = (p1Rule === 'lower_wins' || p2Rule === 'lower_wins');

      if (lowerWins) {
        this.log('ルール変更: 小さい方が勝つ！');
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

    if (isLowerWinnings) this.log('下剋上！(元々の数値が小さい方が勝利)');

    const battleResult: BattleResult = {
      winner, p1Power, p2Power, isLowerWinnings, history: []
    };

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

      // 効果によるオーバーライド (モードレッド, ケイ, ランスロット等)
      // 勝者の効果と敗者の効果（ペナルティ/防御）を順に適用

      // 勝者の効果チェック
      const winnerEffect = winner === 'p1' ? p1Effect : p2Effect;
      const winnerCtx = winner === 'p1' ? ctxP1 : ctxP2;

      const winnerOverride = winnerEffect.onResolveReward(winnerCtx, battleResult);
      if (winnerOverride) {
        transaction = winnerOverride;
      }

      // 敗者の効果チェック (防御/ペナルティ)
      // 例: ガラハッド, ランスロット
      const loserEffect = winner === 'p1' ? p2Effect : p1Effect;
      const loserCtx = winner === 'p1' ? ctxP2 : ctxP1;

      const loserOverride = loserEffect.onResolveReward(loserCtx, battleResult);
      if (loserOverride) {
        // 敗者の効果があればそれを最終結果とする（防御優先、ペナルティ上書き）
        // 特定の組み合わせで競合する場合、ここでの優先順位が適用される。
        transaction = loserOverride;
      }
    }

    // 取引実行
    this.gameState.players.p1.grails += transaction.p1Change;
    this.gameState.players.p2.grails += transaction.p2Change;
    this.gameState.stockGrails += transaction.stockChange;

    // 0未満にはならないように制限
    if (this.gameState.players.p1.grails < 0) this.gameState.players.p1.grails = 0;
    if (this.gameState.players.p2.grails < 0) this.gameState.players.p2.grails = 0;

    this.log(`結果: ${winner === 'draw' ? '引き分け' : (winner === 'p1' ? 'P1' : 'P2') + ' の勝利!'} 聖杯: P1(${this.gameState.players.p1.grails}) P2(${this.gameState.players.p2.grails})`);

    // 5. ターン終了時フック (ベディヴィアなど)
    p1Effect.onTurnEnd(ctxP1, battleResult);
    p2Effect.onTurnEnd(ctxP2, battleResult);

    // 勝利カード記録 (最終同点時用)
    if (winner === 'p1') this.gameState.players.p1.wonCards.push(p2CardId);
    if (winner === 'p2') this.gameState.players.p2.wonCards.push(p1CardId);

    // クリーンアップ
    this.gameState.players.p1.playedCard = null;
    this.gameState.players.p2.playedCard = null;

    if (this.gameState.turn >= MAX_TURNS) {
      this.checkGameOver();
    } else {
      this.gameState.turn++;
      this.gameState.phase = 'selection';
    }
  }

  private checkGameOver(): void {
    this.gameState.phase = 'gameover';
    const p1 = this.gameState.players.p1;
    const p2 = this.gameState.players.p2;

    this.log('ゲーム終了! 結果判定中...');

    if (p1.grails > p2.grails) this.gameState.winner = 'p1';
    else if (p2.grails > p1.grails) this.gameState.winner = 'p2';
    else {
      // 聖杯数が同じ場合、武勲（倒した相手のカード数値の合計）で判定
      const p1Score = p1.wonCards.reduce((sum, id) => sum + CARDS[id].basePower, 0);
      const p2Score = p2.wonCards.reduce((sum, id) => sum + CARDS[id].basePower, 0);
      this.log(`聖杯同数! 武勲判定: P1(${p1Score}) vs P2(${p2Score})`);

      if (p1Score > p2Score) this.gameState.winner = 'p1';
      else if (p2Score > p1Score) this.gameState.winner = 'p2';
      else this.gameState.winner = 'draw';
    }

    this.log(`最終勝者: ${this.gameState.winner === 'draw' ? '引き分け' : this.gameState.winner?.toUpperCase()}`);
  }

  private log(message: string) {
    this.gameState.logs.push(message);
    // Keep log size managed?
    if (this.gameState.logs.length > 50) this.gameState.logs.shift();
  }
}
