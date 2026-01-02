import type { BattleResult, CardId } from './core/types';
import { CARDS } from './core/cards';

export function formatCardName(cardId: CardId): string {
  const card = CARDS[cardId];
  return `${card.name} (${card.basePower})`;
}

export function generateBattleLog(
  result: BattleResult, 
  turn: number,
  p1CardId: CardId, 
  p2CardId: CardId
): string[] {
  const logs: string[] = [];

  logs.push(`ターン ${turn}: P1は ${formatCardName(p1CardId)} をプレイ vs P2は ${formatCardName(p2CardId)} をプレイ`);

  // パワーの比較は通常、元のエンジン処理中にログ記録されますが、
  // ここでは詳細なログのためにイベントに依存するか、概要をまとめる形にします。
  // このヘルパーは結果の概要ログを生成します。

  logs.push(`パワー: P1(${result.p1Power}) vs P2(${result.p2Power})`);

  if (result.isLowerWinnings) {
    logs.push(`下剋上！(元々の数値が小さい方が勝利)`);
  }

  const winnerText = result.winner === 'draw' ? '引き分け' 
                   : (result.winner === 'p1' ? 'P1' : 'P2') + ' の勝利!';

  logs.push(`結果: ${winnerText}`);

  return logs;
}
