import { MockServer } from './core/server/mock_server';
import { CARDS } from './core/cards';
import type { CardId, BattleEvent } from './core/types';
import { generateBattleLog } from './ui_helpers';

// 状態
let server: MockServer;
let isAnimating = false;

// DOM要素
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

// バトル開始/エフェクト用オーバーレイ（HTMLにない場合は動的に作成）
let battleOverlayText: HTMLElement;

// 初期化
function initGame() {
  server = new MockServer();
  isAnimating = false;
  
  // オーバーレイ要素の存在確認
  if (!document.getElementById('battle-overlay-text')) {
    const el = document.createElement('div');
    el.id = 'battle-overlay-text';
    document.querySelector('.battle-area')!.appendChild(el);
  }
  battleOverlayText = document.getElementById('battle-overlay-text')!;

  gameOverOverlay.classList.add('hidden');
  battleResultText.textContent = '';
  battleResultText.className = 'battle-result-text'; 
  
  // スロットのクリア
  p1SlotEl.innerHTML = '<div class="card-placeholder">Your Slot</div>';
  p2SlotEl.innerHTML = '<div class="card-placeholder">Enemy Slot</div>';
  p1SlotEl.classList.remove('active');
  p2SlotEl.classList.remove('active');

  updateDisplay(server['engine'].gameState); // 初回描画のためにprivateなengine状態にアクセス（実際のアプリではresponse.gameStateを使用）
}

// 描画関数 (更新のみ)
function updateDisplay(state: any) {
  turnCountEl.textContent = state.turn.toString();
  phaseTextEl.textContent = state.phase.toUpperCase();
  p1GrailsEl.textContent = state.players.p1.grails.toString();
  p2GrailsEl.textContent = state.players.p2.grails.toString();

  // P1の手札
  p1HandEl.innerHTML = '';
  state.players.p1.hand.forEach((cardId: CardId) => {
    const cardEl = createCardElement(cardId, true);
    cardEl.onclick = () => onCardClick(cardId, cardEl);
    p1HandEl.appendChild(cardEl);
  });

  // P2の手札（非公開）
  p2HandEl.innerHTML = '';
  state.players.p2.hand.forEach(() => {
    const cardEl = document.createElement('div');
    cardEl.className = 'card face-down';
    cardEl.textContent = '?'; 
    p2HandEl.appendChild(cardEl);
  });
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
  }
  return el;
}

function addLog(message: string, isImportant = false) {
  const div = document.createElement('div');
  div.className = 'log-entry';
  if (isImportant) div.style.color = 'var(--accent-gold)';
  div.textContent = message;
  logContainerEl.insertBefore(div, logContainerEl.firstChild); // Prepend
}

// アニメーション付きカードプレイ
async function onCardClick(cardId: CardId, cardEl: HTMLElement) {
  if (isAnimating) return;
  isAnimating = true;

  // 1. P1カードをスロットへ移動
  // アニメーション用の位置を取得
  const rect = cardEl.getBoundingClientRect();
  const slotRect = p1SlotEl.getBoundingClientRect();
  
  // アニメーション用のクローンを作成
  const clone = cardEl.cloneNode(true) as HTMLElement;
  clone.style.position = 'fixed';
  clone.style.left = `${rect.left}px`;
  clone.style.top = `${rect.top}px`;
  clone.style.width = `${rect.width}px`;
  clone.style.height = `${rect.height}px`;
  clone.style.margin = '0';
  clone.classList.add('animating-card');
  document.body.appendChild(clone);

  // 元の要素を隠す
  cardEl.style.opacity = '0';

  // アニメーション
  const tx = slotRect.left - rect.left + (slotRect.width - rect.width) / 2;
  const ty = slotRect.top - rect.top + (slotRect.height - rect.height) / 2;

  clone.style.transform = `translate(${tx}px, ${ty}px)`;

  await new Promise(r => setTimeout(r, 500)); // 移動待ち

  // スロットに配置
  p1SlotEl.innerHTML = '';
  const slotCard = createCardElement(cardId, true);
  p1SlotEl.appendChild(slotCard);
  clone.remove();

  // 2. サーバーリクエスト（P2思考シミュレーション）
  phaseTextEl.textContent = "WAITING...";
  
  const response = await server.playCard('p1', cardId);

  // 3. 敵カード出現（アニメーション）
  const p2CardId = response.opponentCard;
  p2SlotEl.innerHTML = '';
  // 裏向きで開始して表にするか？それとも裏向きで飛んでくるか？
  // P2の手札位置に裏向きカードを生成して飛ばす
  const enemyHandRect = p2HandEl.getBoundingClientRect();
  const enemySlotRect = p2SlotEl.getBoundingClientRect();

  const enemyClone = document.createElement('div');
  enemyClone.className = 'card face-down animating-card';
  enemyClone.textContent = '?';
  enemyClone.style.left = `${enemyHandRect.left + enemyHandRect.width / 2 - 50}px`; // おおよその中心
  enemyClone.style.top = `${enemyHandRect.top}px`;
  enemyClone.style.width = '110px';
  enemyClone.style.height = '170px';
  document.body.appendChild(enemyClone);

  // 敵のアニメーション
  const etx = enemySlotRect.left - parseFloat(enemyClone.style.left);
  const ety = enemySlotRect.top - parseFloat(enemyClone.style.top);
  
  requestAnimationFrame(() => {
      enemyClone.style.transform = `translate(${etx}px, ${ety}px)`;
  });

  await new Promise(r => setTimeout(r, 600));

  // 結果を配置
  p2SlotEl.innerHTML = '';
  const p2SlotCard = createCardElement(p2CardId, true); // 表向きで作成
  p2SlotEl.appendChild(p2SlotCard);
  enemyClone.remove();

  // 4. バトル開始アニメーション
  battleOverlayText.textContent = "BATTLE!";
  battleOverlayText.classList.add('show');
  await new Promise(r => setTimeout(r, 1000));
  battleOverlayText.classList.remove('show');

  // 5. イベントとログの処理
  for (const event of response.events) {
    await processEvent(event);
  }

  // 概要ログの生成
  const logMessages = generateBattleLog(response.battleResult, server['engine'].gameState.turn, cardId, p2CardId);
  logMessages.forEach(msg => addLog(msg));

  // 6. 結果アニメーション
  const winner = response.battleResult.winner;
  battleResultText.textContent = winner === 'draw' ? 'DRAW' : (winner === 'p1' ? 'WIN!' : 'LOSE...');
  battleResultText.className = `battle-result-text ${winner === 'draw' ? 'draw' : (winner === 'p1' ? 'win' : 'lose')} fade-in`;

  await new Promise(r => setTimeout(r, 1500));

  // 7. クリーンアップと次ターン
  battleResultText.classList.remove('fade-in');
  battleResultText.textContent = '';
  p1SlotEl.innerHTML = '<div class="card-placeholder">Your Slot</div>';
  p2SlotEl.innerHTML = '<div class="card-placeholder">Enemy Slot</div>';

  updateDisplay(response.gameState);
  isAnimating = false;

  // ゲーム終了判定（状態または明示的チェック）
  // エンジンは終了時にphase='gameover'を返すが、ここで確認する
  if (response.gameState.phase === 'gameover') {
    await new Promise(r => setTimeout(r, 1000)); // "一泊"
    showGameOver(response.gameState);
  }
}

async function processEvent(event: BattleEvent) {
  // 特定のイベントでの一時停止
  if (event.type === 'effect_activation') {
    addLog(`[EFFECT] ${event.message}`, true);
    p1SlotEl.classList.add('active'); // 点滅
    p2SlotEl.classList.add('active');
    await new Promise(r => setTimeout(r, 500));
    p1SlotEl.classList.remove('active');
    p2SlotEl.classList.remove('active');
  } else if (event.type === 'rule_change') {
    addLog(`[RULE] ${event.message}`, true);
    await new Promise(r => setTimeout(r, 500));
  } else if (event.type === 'grail_transfer') {
    // 聖杯飛行アニメーション
    const targetEl = event.payload.player === 'p1' ? p1GrailsEl : p2GrailsEl;
    const startEl = event.payload.player === 'p1' ? p2SlotEl : p1SlotEl; // 簡易的な位置推定
    flyGrail(startEl, targetEl);
    await new Promise(r => setTimeout(r, 800));
  }
}

function flyGrail(fromEl: HTMLElement, toEl: HTMLElement) {
  const grail = document.createElement('div');
  grail.className = 'flying-grail';
  grail.textContent = '🏆';
  
  const fromRect = fromEl.getBoundingClientRect();
  const toRect = toEl.getBoundingClientRect();

  grail.style.left = `${fromRect.left + 50}px`;
  grail.style.top = `${fromRect.top + 50}px`;
  document.body.appendChild(grail);

  requestAnimationFrame(() => {
    grail.style.top = `${toRect.top}px`;
    grail.style.left = `${toRect.left}px`;
    grail.style.opacity = '0';
  });

  setTimeout(() => grail.remove(), 1000);
}

function showGameOver(state: any) {
  gameOverOverlay.classList.remove('hidden');
  const winner = state.winner === 'draw' ? '引き分け' : (state.winner === 'p1' ? 'あなたの勝利！' : 'あなたの敗北...');
  winnerText.textContent = `${winner} (P1: ${state.players.p1.grails} - P2: ${state.players.p2.grails})`;
}

restartBtn.onclick = () => {
    server.resetGame().then(() => initGame());
};

// Start
initGame();
