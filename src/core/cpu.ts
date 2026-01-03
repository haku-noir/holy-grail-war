import type { GameState, CardId, CpuLevel, PlayerId } from './types';
import { GameEngine } from './engine';
import { CARDS } from './cards';

// import { CARDS } from './cards';

export class CPU {
  static selectCard(gameState: GameState, myId: 'p2', level: CpuLevel): CardId {
    if (level === 2) {
      return this.selectCardLevel2(gameState, myId);
    } else if (level === 3) {
      return this.selectCardLevel3(gameState, myId);
    }
    // Level 1: Random
    return this.selectCardRandom(gameState, myId);
  }

  private static selectCardRandom(gameState: GameState, myId: PlayerId): CardId {
    const me = gameState.players[myId];
    const randomIndex = Math.floor(Math.random() * me.hand.length);
    return me.hand[randomIndex];
  }

  // Level 2: ターン最適 (相手の手札に対して最も勝率が高い手を選ぶ)
  private static selectCardLevel2(gameState: GameState, myId: PlayerId): CardId {
    const me = gameState.players[myId];
    const opponentId = myId === 'p1' ? 'p2' : 'p1';
    const opponent = gameState.players[opponentId];

    let bestCard: CardId = me.hand[0];
    let besWinCount = -1;

    // 自分の全ての手札候補について
    for (const myCard of me.hand) {
      let winCount = 0;
      
      // 相手の全ての手札候補についてシミュレーション
      for (const oppCard of opponent.hand) {
        // シミュレーション用のエンジンを作成
        const engine = new GameEngine(gameState);
        
        // カードをセット
        engine.playCard(myId, myCard);
        engine.playCard(opponentId, oppCard);
        
        // 解決
        const result = engine.resolveTurn().result;
        
        if (result.winner === myId) {
          winCount++;
        } else if (result.winner === 'draw') {
          winCount += 0.5; // 引き分けは0.5勝扱い
        }
      }

      if (winCount > besWinCount) {
        besWinCount = winCount;
        bestCard = myCard;
      }
    }
    
    return bestCard;
  }

  // Level 3: ゲーム最適 (minimax法による全探索)
  private static selectCardLevel3(gameState: GameState, myId: PlayerId): CardId {
    const me = gameState.players[myId];
    // 手札が1枚なら思考不要
    if (me.hand.length === 1) return me.hand[0];

    let bestCard: CardId = me.hand[0];
    let maxMinScore = -Infinity;

    // 自分の手札（候補手）
    for (const myCard of me.hand) {
      // この手を選んだ時の「最悪ケース」のスコアを探す（相手は自分にとって最悪の手＝相手にとって最善の手を選ぶと仮定）
      let minScore = Infinity;

      const opponentId = myId === 'p1' ? 'p2' : 'p1';
      const opponent = gameState.players[opponentId];

      for (const oppCard of opponent.hand) {
        // シミュレーション
        const engine = new GameEngine(gameState);
        engine.playCard(myId, myCard);
        engine.playCard(opponentId, oppCard);
        engine.resolveTurn();

        // 次の状態（再帰）のスコアを取得
        // ゲーム終了ならスコア計算、そうでなければ再帰
        const score = this.evaluateGameTree(engine.gameState, myId);

        if (score < minScore) {
          minScore = score;
        }
      }

      // マキシミン: 最悪ケース（相手の最善手）の中での最大値を選ぶ
      if (minScore > maxMinScore) {
        maxMinScore = minScore;
        bestCard = myCard;
      }
    }

    return bestCard;
  }

  // 再帰的な評価関数
  // 返り値: myIdにとっての有利度（大きいほど良い）
  private static evaluateGameTree(gameState: GameState, myId: PlayerId): number {
    // 終局判定
    if (gameState.phase === 'gameover' || gameState.turn > 5) { // 5ターン終了あるいはゲームオーバー
       return this.calculateScore(gameState, myId);
    }
    
    // まだ続く場合: 全探索
    const opponentId = myId === 'p1' ? 'p2' : 'p1';
    const me = gameState.players[myId];
    const opponent = gameState.players[opponentId];

    // キャッシュ（メモ化）を入れると高速化できるが、手札枚数的に不要かもしれない
    // 5x5 -> 4x4 -> 3x3 -> 2x2 -> 1x1 
    // State space is small enough.

    let maxMinScore = -Infinity;

    for (const myCard of me.hand) {
      let minScore = Infinity;
      for (const oppCard of opponent.hand) {
        const engine = new GameEngine(gameState);
        engine.playCard(myId, myCard);
        engine.playCard(opponentId, oppCard);
        engine.resolveTurn();

        const score = this.evaluateGameTree(engine.gameState, myId);
        if (score < minScore) minScore = score;
      }
      if (minScore > maxMinScore) maxMinScore = minScore;
    }

    return maxMinScore;
  }

  // スコア計算
  private static calculateScore(state: GameState, myId: PlayerId): number {
    const opponentId = myId === 'p1' ? 'p2' : 'p1';
    const myGrails = state.players[myId].grails;
    const oppGrails = state.players[opponentId].grails;

    // 勝利条件ベースのスコア
    // 1. 聖杯数が多い方が勝ち
    if (myGrails > oppGrails) return 1000 + (myGrails - oppGrails) * 10;
    if (oppGrails > myGrails) return -1000 + (myGrails - oppGrails) * 10;

    // 2. 聖杯数が同じなら武勲判定
    const myWon = state.players[myId].wonCards;
    const oppWon = state.players[opponentId].wonCards;
    
    // wonCards は CardId[] なので、CARDSからパワーを取得して合計
    const myPower = myWon.reduce((sum, id) => sum + CARDS[id].basePower, 0);
    const oppPower = oppWon.reduce((sum, id) => sum + CARDS[id].basePower, 0);

    if (myPower > oppPower) return 500 + (myPower - oppPower);
    if (oppPower > myPower) return -500 + (myPower - oppPower);

    return 0; // 引き分け
  }
}

