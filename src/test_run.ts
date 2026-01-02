import { GameEngine } from './core/engine';

const engine = new GameEngine();

console.log('--- Initial State ---');
console.log('Grails:', engine.gameState.players.p1.grails, engine.gameState.players.p2.grails);

// --- Test 1: Tristan(6) vs Gawain(5) ---
engine.gameState.turn = 3;
console.log('\n--- Test 1: Tristan(6) vs Gawain(5) on Turn 3 ---');
// Force cards in hand
engine.gameState.players.p1.hand = [6];
engine.gameState.players.p2.hand = [5];

engine.playCard('p1', 6);
engine.playCard('p2', 5);

console.log('Last Log:', engine.gameState.logs[engine.gameState.logs.length - 1]);
console.log('Result Grails: P1', engine.gameState.players.p1.grails, 'P2', engine.gameState.players.p2.grails);
// Exp: P1 Win (6 > 5). Secure. P1 +1 (3), P2 +0 (2).

// --- Test 2: Dagonet(7) vs Lancelot(12) ---
// Note: Hand is empty now? No, engine removed played card.
engine.gameState.turn = 4;
console.log('\n--- Test 2: Dagonet(7) vs Lancelot(12) ---');
engine.gameState.players.p1.hand = [7];
engine.gameState.players.p2.hand = [12];
// Reset grails to 3, 2
engine.gameState.players.p1.grails = 3;
engine.gameState.players.p2.grails = 2;

engine.playCard('p1', 7);
engine.playCard('p2', 12);

console.log('Last 2 Logs:', engine.gameState.logs.slice(-2));
console.log('Result Grails: P1', engine.gameState.players.p1.grails, 'P2', engine.gameState.players.p2.grails);
// Exp: Dagonet Wins (Lower=True). 7 < 12.
// Reversal? Yes.
// Base: P1 +1, P2 -1.
// Lance Penalty (P2 lost). Opponent (P1) +1 from Stock.
// Total: P1 +2, P2 -1.
// Grails: P1 (3+2=5), P2 (2-1=1).

// --- Test 3: Lancelot(12) vs Dagonet(7) ---
// Swap roles. P1 Lance, P2 Dagonet.
engine.gameState.turn = 5;
console.log('\n--- Test 3: Lancelot(12) vs Dagonet(7) ---');
engine.gameState.players.p1.hand = [12];
engine.gameState.players.p2.hand = [7];
// Reset to 3, 3
engine.gameState.players.p1.grails = 3;
engine.gameState.players.p2.grails = 3;

engine.playCard('p1', 12);
engine.playCard('p2', 7);

console.log('Last 2 Logs:', engine.gameState.logs.slice(-2));
console.log('Result Grails: P1', engine.gameState.players.p1.grails, 'P2', engine.gameState.players.p2.grails);
// Exp: Dagonet (P2) Wins. Lower Wins.
// Reversal? 7 < 12. Yes.
// Base: P2 +1, P1 -1.
// Lance Penalty (P1 lost). Opponent (P2) +1 from Stock.
// Total: P2 +2, P1 -1.
// Grails: P1 (2), P2 (5).
