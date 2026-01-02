import type { GameState, CardId } from './types';
// import { CARDS } from './cards';

export class CPU {
  static selectCard(gameState: GameState, myId: 'p2'): CardId {
    const me = gameState.players[myId];
    // MVP用シンプルロジック: ランダムに選択
    // 将来的には、手札内容や点差に基づくヒューリスティクスを実装可能

    const randomIndex = Math.floor(Math.random() * me.hand.length);
    return me.hand[randomIndex];
  }
}
