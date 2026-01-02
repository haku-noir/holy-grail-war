import { GameEngine } from './core/engine';
import { CARDS } from './core/cards';
import type { CardId } from './core/types';
import { CPU } from './core/cpu';

// State
let engine: GameEngine;
let isAnimating = false;

// DOM Elements
const p1HandEl = document.getElementById('p1-hand')!;
const p2HandEl = document.getElementById('p2-hand')!;
const p1SlotEl = document.getElementById('p1-slot')!;
const p2SlotEl = document.getElementById('p2-slot')!;
const p1GrailsEl = document.getElementById('p1-grails')!;
const p2GrailsEl = document.getElementById('p2-grails')!;
const turnCountEl = document.getElementById('turn-count')!;
const phaseTextEl = document.getElementById('phase-text')!;
const logContainerEl = document.getElementById('log-container')!;
const gameOverOverlay = document.getElementById('game-over-overlay')!;
const winnerText = document.getElementById('winner-text')!;
const restartBtn = document.getElementById('restart-btn')!;
const battleResultText = document.getElementById('battle-result-text')!;

// 初期化
function initGame() {
  engine = new GameEngine();
  isAnimating = false;
  gameOverOverlay.classList.add('hidden');
  battleResultText.textContent = '';
  render();
}

// 描画関数
function render() {
  const state = engine.gameState;

  // 情報更新
  turnCountEl.textContent = state.turn.toString();
  phaseTextEl.textContent = state.phase.toUpperCase();
  p1GrailsEl.textContent = state.players.p1.grails.toString();
  p2GrailsEl.textContent = state.players.p2.grails.toString();

  // ログ表示
  logContainerEl.innerHTML = state.logs.map(log => `<div class="log-entry">${log}</div>`).reverse().join('');

  // プレイヤー手札
  p1HandEl.innerHTML = '';
  state.players.p1.hand.forEach(cardId => {
    const cardEl = createCardElement(cardId, true);
    cardEl.onclick = () => onCardClick(cardId);
    p1HandEl.appendChild(cardEl);
  });

  // 相手の手札 (裏向き)
  p2HandEl.innerHTML = '';
  state.players.p2.hand.forEach(() => {
    const cardEl = document.createElement('div');
    cardEl.className = 'card face-down';
    cardEl.textContent = '?'; 
    p2HandEl.appendChild(cardEl);
  });

  // バトルエリア (スロット)
  // P1の出したカード
  if (state.players.p1.playedCard) {
    p1SlotEl.innerHTML = '';
    const cardEl = createCardElement(state.players.p1.playedCard, true);
    p1SlotEl.appendChild(cardEl);
  } else {
    p1SlotEl.innerHTML = '<div class="card-placeholder">Your Slot</div>';
  }

  // P2の出したカード
  if (state.players.p2.playedCard) {
    p2SlotEl.innerHTML = '';
    // 解決フェーズ以降なら表向きにする（MVPでは即時解決のため常に表でよい）
    const cardEl = createCardElement(state.players.p2.playedCard, true); 
    p2SlotEl.appendChild(cardEl);
  } else {
    p2SlotEl.innerHTML = '<div class="card-placeholder">Enemy Slot</div>';
  }

  // ゲーム終了処理
  if (state.phase === 'gameover') {
    gameOverOverlay.classList.remove('hidden');
    const winner = state.winner === 'draw' ? '引き分け' : (state.winner === 'p1' ? 'あなたの勝利！' : 'あなたの敗北...');
    winnerText.textContent = winner;
  }
}

function createCardElement(cardId: CardId, faceUp: boolean): HTMLElement {
  const cardData = CARDS[cardId];
  const el = document.createElement('div');
  el.className = `card ${faceUp ? 'face-up' : 'face-down'}`;

  if (faceUp) {
    el.innerHTML = `
      <div class="card-rank">${cardData.basePower}</div>
      <div class="card-name">${cardData.name}</div>
      <div class="card-desc">${cardData.description}</div>
    `;
    // Add tooltip or click handler
  }
  return el;
}

// インタラクション
function onCardClick(cardId: CardId) {
  if (isAnimating || engine.gameState.phase !== 'selection') return;

  // 1. プレイヤーのアクション
  engine.playCard('p1', cardId);

  // 2. CPUのレスポンス (即時)
  const cpuCard = CPU.selectCard(engine.gameState, 'p2');
  engine.playCard('p2', cpuCard);

  // 3. エンジンによる解決（自動）
  render();

  // TODO: アニメーション待ちなどの処理をここに追加可能
}

restartBtn.onclick = initGame;

// Start
initGame();
