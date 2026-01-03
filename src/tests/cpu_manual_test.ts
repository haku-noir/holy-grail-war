
import { CPU } from '../core/cpu';
import { GameEngine } from '../core/engine';
import { CARDS } from '../core/cards';
import type { CardId, GameState } from '../core/types';

function createTestState(p1Hand: CardId[], p2Hand: CardId[], grails: {p1: number, p2: number} = {p1: 0, p2: 0}): GameState {
  const engine = new GameEngine();
  const state = engine.gameState;
  state.players.p1.hand = p1Hand;
  state.players.p2.hand = p2Hand;
  state.players.p1.grails = grails.p1;
  state.players.p2.grails = grails.p2;
  return state;
}

function runTest() {
  console.log("=== CPU Logic Verification ===");

  // Test Case 1: Level 2 Simple Win
  // P1 has 13 (Power 10). P2 has 12 (Power 5).
  // P1 should pick 13 to win. (Wait, P1 is OPPONENT from CPU perspective (P2))
  // Let's assume we are testing CPU as P2.
  // P2 Hand: [13, 1]
  // P1 Hand: [10] (Power 1)
  // 13 (Power 10) vs 10 (Power 1) -> 13 wins.
  // 1 (Power 13) vs 10 (Power 1) -> 1 wins.
  // Wait, let's make it so only one card wins.
  // P2: [5 (Power 5), 1 (Power 13)]
  // P1: [4 (Power 4)]
  // 5 vs 4 -> 5 wins.
  // 1 vs 4 -> 1 wins.
  // Both win.
  
  // Scenario:
  // P2 Hand: [5 (Power 5), 2 (Power 2)]
  // P1 Hand: [4 (Power 4)]
  // 5 wins against 4.
  // 2 loses against 4.
  // P2 Level 2 MUST pick 5.
  
  console.log("\nTest 1: Level 2 should pick winning card");
  const state1 = createTestState([4], [5, 2]);
  const pick1 = CPU.selectCard(state1, 'p2', 2);
  console.log(`P2 Hand: [5, 2], P1 Hand: [4]`);
  console.log(`Selected: ${pick1} (${CARDS[pick1].name})`);
  if (pick1 === 5) console.log("PASS");
  else console.error("FAIL: Expected 5");

  // Test Case 2: Level 3 End Game Optimization
  // Scenario: Turn 4. 1 turn remaining.
  // P1 Grails: 2, P2 Grails: 0.
  // P2 needs to win grails.
  // P2 Hand: [8 (Palomides, Power 5 -> 13 if losing grails)], [5 (Gawain, Power 5)]
  // P1 Hand: [10 (Galahad, Power 1)]
  // P2 Grails 0 vs P1 Grails 2.
  // If P2 wins with 8, it gets grails? 
  // 8 vs 10 -> 13 vs 1 -> P2 wins. P2 +1 Grail, P1 -1 Grail? (Default reward: P2 +1, Stock -1. Grails: 1 vs 2). Still lose?
  // Wait, Palomides effect is simple power.
  // Let's use Grails transfer logic.
  // If "lower_wins" (Tristan) is involved?
  
  // Simple Scenario:
  // Turn 5.
  // P2 Grails: 0, P1 Grails: 1.
  // P2 Hand: [12 (Lancelot, Power 11)], [1 (Arthur, Power 13)]
  // P1 Hand: [13 (Mordred, Power 10)]
  // 12 vs 13 -> 11 vs 10 -> P2 Win -> P2=1, P1=1. Draw on Grails. Tie breaker Power?
  // 1 vs 13 -> 13 vs 10 -> P2 Win -> P2=1, P1=1.
  // But wait! Mordred (13) vs Arthur (1)?
  // Game logic check:
  // Mordred Effect: (None special vs Arthur in code? Special trigger is usually in events)
  // Wait, Arthur is 1. Mordred is 13.
  // Check engine:
  // 1 vs 13. Power 13 vs 10. P2 wins.
  
  // Let's try a scenario where one card leads to a loss and another to a win.
  // Situation: P1 has 2 Grails, P2 has 1 Grail.
  // P2 needs to win AND steal/gain grail.
  // P1 Hand: [9 (Hector, Power 6)]
  // P2 Hand: [8 (Palomides, Power 5, Cond 13)], [2 (Bors, Power 2)]
  // 8 vs 9: P2 Grails(1) < P1 Grails(2) -> Palomides becomes 13. 13 vs 6 -> P2 Wins.
  // Profit: P2+1, Stock-1 -> P2=2, P1=2. Draw grails.
  // 2 vs 9: 2 vs 6 -> P1 Wins. P1=3. P2 Loses.
  // So P2 Level 2 should pick 8.
  // Level 3 should also pick 8.
  
  console.log("\nTest 2: Level 2/3 Palomides Trigger");
  const state2 = createTestState([9], [8, 2], {p1: 2, p2: 1});
  const pick2_lvl2 = CPU.selectCard(state2, 'p2', 2);
  const pick2_lvl3 = CPU.selectCard(state2, 'p2', 3);
  
  console.log(`Selected Lvl2: ${pick2_lvl2}`);
  console.log(`Selected Lvl3: ${pick2_lvl3}`);
  
  if (pick2_lvl2 === 8 && pick2_lvl3 === 8) console.log("PASS");
  else console.error("FAIL: Expected 8");
}

runTest();
