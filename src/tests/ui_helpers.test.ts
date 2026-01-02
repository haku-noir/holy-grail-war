import { generateBattleLog } from '../ui_helpers';
import type { BattleResult, CardId } from '../core/types';

// Mock Data
const p1Card: CardId = 1;
const p2Card: CardId = 2;
const turn = 1;

const result: BattleResult = {
  winner: 'p2',
  p1Power: 10,
  p2Power: 20,
  isLowerWinnings: false
};

const logs = generateBattleLog(result, turn, p1Card, p2Card);
console.log('--- UI Helper Logs ---');
logs.forEach(l => console.log(l));

if (!logs.some(l => l.includes('P2 の勝利'))) throw new Error('Log missing winner info');
if (!logs.some(l => l.includes('10) vs P2(20'))) throw new Error('Log missing power info');

console.log('UI Helper Tests Passed!');
