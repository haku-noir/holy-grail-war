import type { Card, CardEffect, CardId } from './types';

// 基本カード情報を取得するヘルパー
export const CARDS: Record<CardId, Card> = {
  1: { id: 1, name: 'モードレッド', basePower: 1, description: 'アーサー(13)に勝利する。勝利時、聖杯を2つ奪う。' },
  2: { id: 2, name: 'ベディヴィア', basePower: 2, description: '敗北時、次ターンの数値+10。' },
  3: { id: 3, name: 'ガレス', basePower: 3, description: '偶数のカードに勝利する。' },
  4: { id: 4, name: 'ケイ', basePower: 4, description: '勝利時、相手は聖杯を1つ場に捨てる。' },
  5: { id: 5, name: 'ガウェイン', basePower: 5, description: '3ターン目は数値が15になる。' },
  6: { id: 6, name: 'トリスタン', basePower: 6, description: '相手のカード効果を無効化する。' },
  7: { id: 7, name: 'ダゴネット', basePower: 7, description: '「数値が小さい方が勝つ」ルールに変更する。' },
  8: { id: 8, name: 'パロミデス', basePower: 8, description: '聖杯が相手より少ない場合、数値が13になる。' },
  9: { id: 9, name: 'ボース', basePower: 9, description: '勝利時、場から追加で1つ聖杯を得る。' },
  10: { id: 10, name: 'ガラハッド', basePower: 10, description: '敗北し、かつ相手が「強奪」する場合、奪われるのを防ぐ。' },
  11: { id: 11, name: 'パーシヴァル', basePower: 11, description: '勝利時、次ターンの数値-3。' },
  12: { id: 12, name: 'ランスロット', basePower: 12, description: '下剋上で敗北した場合、相手は場から追加で1つ聖杯を得る。' },
  13: { id: 13, name: 'アーサー', basePower: 13, description: '聖杯が相手より多い場合、勝利しても聖杯を得られない。' },
};

// デフォルトのエフェクト実装 (Null Objectパターン)
const defaultEffect: CardEffect = {
  getPower: (ctx) => CARDS[ctx.isP1 ? ctx.p1Card : ctx.p2Card].basePower,
  checkInstantWin: () => false,
  getRuleModifier: () => null,
  onResolveReward: () => null,
  onTurnEnd: () => {},
};

export const CARD_EFFECTS: Record<CardId, CardEffect> = {
  1: { // Mordred
    ...defaultEffect,
    checkInstantWin: (ctx) => {
      const enemyCard = ctx.isP1 ? ctx.p2Card : ctx.p1Card;
      return enemyCard === 13;
    },
    onResolveReward: (ctx, result) => {
      // If Mordred won, he steals +1 extra (Total 2 stolen if Reversal, or 1 taken if ensuring win rule allows?)
      // Rules say: "Steal(1) + Extra Steal(1) = 2"
      // Note: Mordred is 1. He usually wins by "Lower wins" or "Instant Win against 13".
      // If Instant Win vs 13: 1 vs 13.
      // 1 < 13. This is technically "Lower < Upper". So it's a Reversal (Gekokujo).
      // Reversal default is Steal 1. Mordred adds +1 Steal.
      // So returns { p1: 2, p2: -2 } (relative to winner)
      if (result.winner === (ctx.isP1 ? 'p1' : 'p2')) {
         // Logic is handled in engine, but here we specify "Extra" logic?
         // Actually, let's make onResolveReward return the *Modification* to the standard reward?
         // Or return the *Full* transaction overriding standard?
         // Let's go with Overriding/Modifying.
         // Let's implement it as: Engine calculates base reward, then calls this to modify?
         // Or just let this return the Transaction if it wants to override?
         // Let's say: if this returns non-null, use this.

         // Logic for Mordred winning:
         // Vs Arthur(13) -> Instant Win. 1 < 13 -> Reversal (Steal).
         // Standard Reversal: +1 / -1.
         // Mordred Effect: +1 Steal. Total +2 / -2.

         // const isReversal = result.isLowerWinnings;
         // Usually Mordred wins by Reversal (1 vs 13, 1 vs 7 lower wins).
         // But even if not reversal?
         // Text: "Win -> Steal 1 + Extra 1 = 2".
         // It seems robust to say: Steal 2.

         // Directional logic:
         if (ctx.isP1) {
            // I am P1. I won. P1 gets +2, P2 gets -2.
            return { p1Change: 2, p2Change: -2, stockChange: 0 };
         } else {
            // I am P2. I won. P2 gets +2, P1 gets -2.
            return { p2Change: 2, p1Change: -2, stockChange: 0 };
         }
         // 1 < 7. Reversal. Steal 1.
         // Mordred text: "Vs Arthur: Win. Win brings Steal(1)+Extra(1)."
         // "Always 2 steals?" No, text says "Vs Arthur ... Win -> Steal 2".
         // Text also says: "Wins vs Arthur(13) ONLY. (Loses to others?)" -> No, "Vs Arthur ... Win ... Steal 2".
         // Wait, the rule says: "Vs Arthur(13) only wins (loses to others)."
         // AND "When winning, Steal 1 + Extra 1".
         // Since he only wins vs Arthur, this applies only vs Arthur.
         // But what about Dagonet(7)? Dagonet makes "Lower wins".
         // 1 < 7. Mordred *should* win by Dagonet's rule.
         // But Mordred's text says "Vs Arthur ONLY wins".
         // Specific vs General?
         // "Vs Arthur ONLY wins" implies he implies he loses to everyone else (even 2?).
         // 1 vs 2. 1 < 2. Lower. Normally 2 wins.
         // So Mordred loses to 2. Correct.
         // 1 vs 7 (Dagonet). Dagonet rule: Lower wins. 1 is lower.
         // DOES Mordred win? "Vs Arthur ONLY wins" might be a flavor text for his ability being focused on Arthur,
         // but if Dagonet changes the rules, does Mordred lose?
         // Interpretation: "Vs Arthur Only" is about the *Instant Win* capability or his power being 1.
         // Usually 1 loses to everything.
         // If Dagonet makes Lower Win, 1 should win.
         // DOES Mordred steal 2 vs Dagonet?
         // Rule text: "Victory: Steal(1) + Extra(1) = 2".
         // This is under "Mordred" section.
         // "Wins vs Arthur only. When winning, Steal 2."
         // Likely: If he wins (by any means, e.g. Dagonet), he steals 2.
         // Or is the "Steal 2" conditional on "Vs Arthur"?
         // Let's assume: If Mordred Wins, he Steals 2.
         // Because base power 1 is very weak, winning is rare.

         return { p1Change: 2, p2Change: -2, stockChange: 0 };
      }
      return null;
    }
  },
  2: { // Bedivere
    ...defaultEffect,
    onTurnEnd: (ctx, result) => {
      // 敗北時、次ターン+10
      const myId = ctx.isP1 ? 'p1' : 'p2';
      if (result.winner !== 'draw' && result.winner !== myId) {
        // 負け
        ctx.gameState.players[myId].nextTurnBuff += 10;
      }
    }
  },
  3: { // Gareth
    ...defaultEffect,
    checkInstantWin: (ctx) => {
      // 偶数の基本数値を持つ相手に勝利
      const enemyCardId = ctx.isP1 ? ctx.p2Card : ctx.p1Card;
      const enemyBase = CARDS[enemyCardId].basePower;
      return enemyBase % 2 === 0;
    }
  },
  4: { // Kay
    ...defaultEffect,
    onResolveReward: (ctx, result) => {
      const myId = ctx.isP1 ? 'p1' : 'p2';
      if (result.winner === myId) {
        const isReversal = result.isLowerWinnings;
        // let gain = 1; 
        // if (isReversal) gain = 1; // 1奪取 (相手 -1, 自分 +1)

        // ケイ: 相手は聖杯を1つ場に捨てる (Opponent -1, Stock +1)
        // 下剋上(強奪)の場合: 自分+1, 相手-1 (基本) + 相手-1 (効果) = 自分+1, 相手-2, 場+1
        // 確保の場合: 自分+1, 場-1 (基本) + 相手-1, 場+1 (効果) = 自分+1, 相手-1, 場0

        if (myId === 'p1') {
           return isReversal 
             ? { p1Change: 1, p2Change: -2, stockChange: 1 }
             : { p1Change: 1, p2Change: -1, stockChange: 0 };
        } else {
           return isReversal 
             ? { p2Change: 1, p1Change: -2, stockChange: 1 }
             : { p2Change: 1, p1Change: -1, stockChange: 0 };
        }
      }
      return null;
    }
  },
  5: { // Gawain
    ...defaultEffect,
    getPower: (ctx) => {
      if (ctx.gameState.turn === 3) return 15;
      return 5;
    }
  },
  6: { // Tristan
    ...defaultEffect,
    // ロジックはEngineで行う（無効化フェーズ）
  },
  7: { // Dagonet
    ...defaultEffect,
    getRuleModifier: () => 'lower_wins'
  },
  8: { // Palomides
    ...defaultEffect,
    getPower: (ctx) => {
       const myId = ctx.isP1 ? 'p1' : 'p2';
       const oppId = ctx.isP1 ? 'p2' : 'p1';
       if (ctx.gameState.players[myId].grails < ctx.gameState.players[oppId].grails) {
         return 13;
       }
       return 8;
    }
  },
  9: { // Bors
    ...defaultEffect,
    onResolveReward: (ctx, result) => {
      const myId = ctx.isP1 ? 'p1' : 'p2';
      if (result.winner === myId) {
        // ボース: 勝利時、場から追加で+1
        // 下剋上: 強奪(1) + 追加(1) -> 自分+2, 相手-1, 場-1
        // 確保: 確保(1) + 追加(1) -> 自分+2, 場-2

        const isReversal = result.isLowerWinnings;

        if (myId === 'p1') {
           return isReversal
             ? { p1Change: 2, p2Change: -1, stockChange: -1 }
             : { p1Change: 2, p2Change: 0, stockChange: -2 };
        } else {
           return isReversal
             ? { p2Change: 2, p1Change: -1, stockChange: -1 }
             : { p2Change: 2, p1Change: 0, stockChange: -2 };
        }
      }
      return null;
    }
  },
  10: { // Galahad
    ...defaultEffect,
    // 効果: 自分が負けて、かつそれが「強奪(下剋上)」であれば、強奪を防ぐ。
    // 代わりに相手は場から得る。
    // 防御的な効果なので、相手が勝利した際の報酬計算フェーズで介入する想定。
    onResolveReward: (ctx, result) => {
      const myId = ctx.isP1 ? 'p1' : 'p2';
      if (result.winner !== 'draw' && result.winner !== myId) {
         // I Lost.
         if (result.isLowerWinnings) {
            // Reversal against me (Steal). 
            // Galahad: Prevent Steal. Enemy takes from Stock instead.
            // If I am P1. I lost. Winner P2.
            // Std: P2 +1, P1 -1.
            // Galahad: P2 +1, P1 0, Stock -1. 

            if (myId === 'p1') return { p1Change: 0, p2Change: 1, stockChange: -1 };
            if (myId === 'p2') return { p2Change: 0, p1Change: 1, stockChange: -1 };
         }
      }
      return null;
    }
  },
  11: { // Percival
    ...defaultEffect,
    onTurnEnd: (ctx, result) => {
      const myId = ctx.isP1 ? 'p1' : 'p2';
      if (result.winner === myId) {
        // 勝利: 次ターン -3
        ctx.gameState.players[myId].nextTurnBuff -= 3;
      }
    }
  },
  12: { // Lancelot
    ...defaultEffect,
    onResolveReward: (ctx, result) => {
      const myId = ctx.isP1 ? 'p1' : 'p2';
      if (result.winner !== 'draw' && result.winner !== myId) {
         // I Lost.
         if (result.isLowerWinnings) {
            // Reversal against me.
            // Std: Winner +1, Me -1.
            // Lancelot: Winner +1 (Stock extra). Winner +1 (Steal). Me -1.
            // Total: Winner +2, Me -1, Stock -1.

            if (myId === 'p1') return { p1Change: -1, p2Change: 2, stockChange: -1 };
            if (myId === 'p2') return { p2Change: -1, p1Change: 2, stockChange: -1 };
         }
      }
      return null;
    }
  },
  13: { // Arthur
    ...defaultEffect,
    onResolveReward: (ctx, result) => {
      const myId = ctx.isP1 ? 'p1' : 'p2';
      const oppId = ctx.isP1 ? 'p2' : 'p1';

      if (result.winner === myId) {
        // 勝利時、自分が聖杯リードしているなら聖杯を得ない
        if (ctx.gameState.players[myId].grails > ctx.gameState.players[oppId].grails) {
           // リード時、勝利しても0を得る。
           return { p1Change: 0, p2Change: 0, stockChange: 0 };
        }
      }
      return null;
    }
  }
};
