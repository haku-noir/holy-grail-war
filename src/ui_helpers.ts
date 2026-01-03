import type { BattleResult, CardId } from './core/types';
import { CARDS } from './core/cards';

export function formatCardName(cardId: CardId, actualPower?: number): string {
  const card = CARDS[cardId];
  const powerDisplay = actualPower !== undefined ? actualPower : card.basePower;
  // data-card-id属性を追加してホバー用にする
  // log-card-nameクラスでスタイル適用
  return `<span class="log-card-name" data-card-id="${cardId}">${card.name} (${powerDisplay})</span>`;
}

export function generateBattleLog(
  result: BattleResult, 
  turn: number,
  p1CardId: CardId, 
  p2CardId: CardId
): string[] {
  const logs: string[] = [];

  // 実際の数値を使用してカード名を表示
  const p1Name = formatCardName(p1CardId, result.p1Power);
  const p2Name = formatCardName(p2CardId, result.p2Power);

  logs.push(`ターン ${turn}: P1 ${p1Name} vs P2 ${p2Name}`);

  // パワーの内訳ログは冗長なら削除するか、補足的に表示
  // logs.push(`パワー: P1(${result.p1Power}) vs P2(${result.p2Power})`); 
  // -> すでにカード名行で表示しているので削除しても良いが、比較を明確にするなら残す。
  // ここではシンプルにするため、カード名行に集約されたとみなして削除。

  if (result.isLowerWinnings) {
    logs.push(`<span style="color: var(--accent-red)">[下剋上]</span> 小さい数値が勝利！`);
  }

  const winnerText = result.winner === 'draw' ? '引き分け' 
                   : (result.winner === 'p1' ? 'P1 の勝利' : 'P2 の勝利');
  
  // 勝者には色をつけるなどの装飾も可能
  const winnerHtml = result.winner === 'draw' 
    ? winnerText 
    : `<span style="color: var(--accent-gold); font-weight: bold;">${winnerText}</span>`;

  logs.push(`結果: ${winnerHtml}`);

  return logs;
}
