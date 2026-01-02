import { GameEngine } from '../core/engine';
import type { CardId } from '../core/types';

const engine = new GameEngine();

console.log('--- Initial State ---');
console.log('Grails:', engine.gameState.players.p1.grails, engine.gameState.players.p2.grails);

// Helper to reset hands for testing
function setHands(p1Card: CardId, p2Card: CardId) {
  engine.gameState.players.p1.hand = [p1Card];
  engine.gameState.players.p2.hand = [p2Card];
  engine.gameState.players.p1.playedCard = null;
  engine.gameState.players.p2.playedCard = null;
}

// --- Test 1: Tristan(6) vs Gawain(5) ---
engine.gameState.turn = 1;
console.log('\n--- Test 1: Tristan(6) vs Gawain(5) ---');
setHands(6, 5);

engine.playCard('p1', 6);
engine.playCard('p2', 5);

const result1 = engine.resolveTurn();
console.log('Events:', result1.events.map(e => e.type));
console.log('Winner:', result1.result.winner);
console.log('Grails:', engine.gameState.players.p1.grails, engine.gameState.players.p2.grails);
// Exp: P1 Win (6 > 5). P1=3, P2=2.

if (result1.result.winner !== 'p1') throw new Error('Test 1 Failed: Winner should be p1');
if (engine.gameState.players.p1.grails !== 3) throw new Error('Test 1 Failed: P1 grails should be 3');


// --- Test 2: Dagonet(7) vs Lancelot(12) ---
engine.gameState.turn = 2;
console.log('\n--- Test 2: Dagonet(7) vs Lancelot(12) ---');
setHands(7, 12);
engine.gameState.players.p1.grails = 3;
engine.gameState.players.p2.grails = 2;

engine.playCard('p1', 7);
engine.playCard('p2', 12);

const result2 = engine.resolveTurn();
const ruleChange = result2.events.find(e => e.type === 'rule_change');
console.log('Rule Change:', ruleChange?.message);

console.log('Winner:', result2.result.winner);
// Exp: Dagonet Wins (Lower=True). 7 < 12.
// Reward logic:
// Base: P1 +1, P2 -1 (Gekokujo logic? No wait. 
// Dagonet(7) vs Lancelot(12). Lower wins rule active. 7 < 12, so P1 wins.
// Is LowerWinnings (Gekokujo) active?
// Winner(P1) has 7, Loser(P2) has 12. 7 < 12. Yes.
// So Base Reward: P1 +1, P2 -1.
// Effects?
// Winner(P1) is Dagonet. No special reward effect.
// Loser(P2) is Lancelot. Penalty: If lost, opponent gains 1 from stock.
// Total: P1 gets +1 (steal) + 1 (Lancelot penalty) = +2.
// P2 gets -1 (stolen).
// Final: P1 (3+2=5), P2 (2-1=1).

console.log('Grails:', engine.gameState.players.p1.grails, engine.gameState.players.p2.grails);

if (result2.result.winner !== 'p1') throw new Error('Test 2 Failed: Winner should be p1');
if (engine.gameState.players.p1.grails !== 5) throw new Error(`Test 2 Failed: P1 grails should be 5, got ${engine.gameState.players.p1.grails}`);
if (engine.gameState.players.p2.grails !== 1) throw new Error(`Test 2 Failed: P2 grails should be 1, got ${engine.gameState.players.p2.grails}`);

console.log('\nAll Logic Tests Passed!');
