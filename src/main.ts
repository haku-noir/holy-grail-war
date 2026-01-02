import { MockServer } from './core/server/mock_server';
import { SocketClient } from './core/server/socket_client'; // Import Client
import type { ServerAPI } from './core/server/api';
import { CARDS } from './core/cards';
import type { CardId, BattleEvent } from './core/types';
import { generateBattleLog } from './ui_helpers';

// --- State ---
let server: ServerAPI;
let isAnimating = false;
let playerName = "Player";

// --- Screens ---
const screens = {
  title: document.getElementById('title-screen')!,
  lobby: document.getElementById('lobby-screen')!,
  game: document.getElementById('game-screen')!
};

// --- DOM Elements (Game) ---
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
const returnTitleBtn = document.getElementById('return-title-btn')!; // New
const battleResultText = document.getElementById('battle-result-text')!;

// --- DOM Elements (Menu) ---
const nameInput = document.getElementById('player-name-input') as HTMLInputElement;
const btnCpuBattle = document.getElementById('btn-cpu-battle')!;
const btnOnlineBattle = document.getElementById('btn-online-battle')!;
const btnCreateRoom = document.getElementById('btn-create-room')!;
const btnRefreshRooms = document.getElementById('btn-refresh-rooms')!;
const btnBackTitle = document.getElementById('btn-back-title')!;
const roomListEl = document.getElementById('room-list')!;
const waitingMessage = document.getElementById('waiting-message')!;

// --- Overlay for effects ---
let battleOverlayText: HTMLElement;

// --- Helper: Screen Navigation ---
function showScreen(screenName: keyof typeof screens) {
  Object.values(screens).forEach(el => el.classList.add('hidden'));
  screens[screenName].classList.remove('hidden');
}

// --- Initialization ---
function initApp() {
  // Event Listeners
  btnCpuBattle.onclick = startCpuBattle;
  btnOnlineBattle.onclick = showLobby;
  btnCreateRoom.onclick = createRoom;
  btnRefreshRooms.onclick = refreshRoomList;
  btnBackTitle.onclick = () => showScreen('title');
  
  restartBtn.onclick = () => {
    // For online, this might need a rematch request
    server.resetGame().then(() => initGame());
  };
  
  returnTitleBtn.onclick = () => {
      // Disconnect if needed
      // TODO: Proper disconnect logic
      showScreen('title');
  };

  // Check backend availability for online? (Optional)
}

async function startCpuBattle() {
  playerName = nameInput.value || "Player";
  server = new MockServer();
  await initGame();
  showScreen('game');
}

async function showLobby() {
  playerName = nameInput.value || "Player";
  // Initialize Socket Client if needed
  if (!(server instanceof SocketClient)) {
     server = new SocketClient();
     // Setup global listeners if any
     (server as SocketClient).onGameStart((data) => {
         console.log("Game Start!", data);
         waitingMessage.classList.add('hidden');
         // data should contain initial gameState.
         // If server doesn't send it yet, we might have an issue for online.
         // But for now let's assume data has it or initGame fetches it (which resetGame on socket client returns empty).
         // TODO: Ensure Server sends gameState in game_start
         initGame(data.gameState); 
         showScreen('game');
     });
  }
  showScreen('lobby');
  refreshRoomList();
}

async function refreshRoomList() {
    if (server instanceof SocketClient) {
        roomListEl.innerHTML = '<div class="room-item">Loading...</div>';
        const rooms = await server.listRooms();
        renderRoomList(rooms);
    }
}

function renderRoomList(rooms: any[]) {
    roomListEl.innerHTML = '';
    if (rooms.length === 0) {
        roomListEl.innerHTML = '<div class="room-item empty-message">No rooms found. Create one!</div>';
        return;
    }
    rooms.forEach(room => {
        const item = document.createElement('div');
        item.className = 'room-item';
        item.innerHTML = `
            <span>${room.name}</span>
            <button class="menu-btn small" data-id="${room.id}">Join</button>
        `;
        item.querySelector('button')!.onclick = () => joinRoom(room.id);
        roomListEl.appendChild(item);
    });
}

async function createRoom() {
    if (server instanceof SocketClient) {
        await server.createRoom(playerName);
        waitingMessage.classList.remove('hidden');
        // Disable controls while waiting
    }
}

function joinRoom(roomId: string) {
    if (server instanceof SocketClient) {
        server.joinRoom(roomId, playerName);
    }
}

// --- Game Logic (Refactored) ---
async function initGame(initialState?: any) {
  isAnimating = false;
  
  // ensure overlay
  if (!document.getElementById('battle-overlay-text')) {
    const el = document.createElement('div');
    el.id = 'battle-overlay-text';
    document.querySelector('.battle-area')!.appendChild(el);
  }
  battleOverlayText = document.getElementById('battle-overlay-text')!;

  gameOverOverlay.classList.add('hidden');
  battleResultText.textContent = '';
  battleResultText.className = 'battle-result-text'; 
  
  p1SlotEl.innerHTML = '<div class="card-placeholder">Your Slot</div>';
  p2SlotEl.innerHTML = '<div class="card-placeholder">Enemy Slot</div>';
  p1SlotEl.classList.remove('active');
  p2SlotEl.classList.remove('active');
  
  logContainerEl.innerHTML = ''; // Clear logs on new game

  let state = initialState;
  if (!state) {
      // If no state provided, try to fetch from server (mainly for CPU mode)
      state = await server.resetGame();
  }

  updateDisplay(state); 
}

function updateDisplay(state: any) {
  turnCountEl.textContent = state.turn.toString();
  phaseTextEl.textContent = state.phase.toUpperCase();
  p1GrailsEl.textContent = state.players.p1.grails.toString();
  p2GrailsEl.textContent = state.players.p2.grails.toString();

  // P1 Hand
  p1HandEl.innerHTML = '';
  state.players.p1.hand.forEach((cardId: CardId) => {
    const cardEl = createCardElement(cardId, true);
    cardEl.onclick = () => onCardClick(cardId, cardEl);
    p1HandEl.appendChild(cardEl);
  });

  // P2 Hand
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
  logContainerEl.insertBefore(div, logContainerEl.firstChild);
}

// --- Card Interaction ---
async function onCardClick(cardId: CardId, cardEl: HTMLElement) {
  if (isAnimating) return;
  isAnimating = true;

  // 1. Animate to Slot
  const rect = cardEl.getBoundingClientRect();
  const slotRect = p1SlotEl.getBoundingClientRect();
  
  const clone = cardEl.cloneNode(true) as HTMLElement;
  clone.style.position = 'fixed';
  clone.style.left = `${rect.left}px`;
  clone.style.top = `${rect.top}px`;
  clone.style.width = `${rect.width}px`;
  clone.style.height = `${rect.height}px`;
  clone.style.margin = '0';
  clone.classList.add('animating-card');
  document.body.appendChild(clone);

  cardEl.style.opacity = '0';

  const tx = slotRect.left - rect.left + (slotRect.width - rect.width) / 2;
  const ty = slotRect.top - rect.top + (slotRect.height - rect.height) / 2;

  clone.style.transform = `translate(${tx}px, ${ty}px)`;

  await new Promise(r => setTimeout(r, 500));

  p1SlotEl.innerHTML = '';
  const slotCard = createCardElement(cardId, true);
  p1SlotEl.appendChild(slotCard);
  clone.remove();

  // 2. Server Request
  phaseTextEl.textContent = "WAITING...";
  
  const response = await server.playCard('p1', cardId);

  // 3. Opponent Animation
  const p2CardId = response.opponentCard;
  p2SlotEl.innerHTML = '';
  
  const enemyHandRect = p2HandEl.getBoundingClientRect();
  const enemySlotRect = p2SlotEl.getBoundingClientRect();

  const enemyClone = document.createElement('div');
  enemyClone.className = 'card face-down animating-card';
  enemyClone.textContent = '?';
  enemyClone.style.left = `${enemyHandRect.left + enemyHandRect.width / 2 - 50}px`; 
  enemyClone.style.top = `${enemyHandRect.top}px`;
  enemyClone.style.width = '110px';
  enemyClone.style.height = '170px';
  document.body.appendChild(enemyClone);

  const etx = enemySlotRect.left - parseFloat(enemyClone.style.left);
  const ety = enemySlotRect.top - parseFloat(enemyClone.style.top);
  
  requestAnimationFrame(() => {
      enemyClone.style.transform = `translate(${etx}px, ${ety}px)`;
  });

  await new Promise(r => setTimeout(r, 600));

  p2SlotEl.innerHTML = '';
  const p2SlotCard = createCardElement(p2CardId, true);
  p2SlotEl.appendChild(p2SlotCard);
  enemyClone.remove();

  // 4. Battle Start
  battleOverlayText.textContent = "BATTLE!";
  battleOverlayText.classList.add('show');
  await new Promise(r => setTimeout(r, 1000));
  battleOverlayText.classList.remove('show');

  // 5. Events
  for (const event of response.events) {
    await processEvent(event);
  }

  // Logs
  const logMessages = generateBattleLog(response.battleResult, server instanceof MockServer ? server['engine'].gameState.turn : response.gameState.turn, cardId, p2CardId);
  logMessages.forEach(msg => addLog(msg));

  // 6. Result
  const winner = response.battleResult.winner;
  battleResultText.textContent = winner === 'draw' ? 'DRAW' : (winner === 'p1' ? 'WIN!' : 'LOSE...');
  battleResultText.className = `battle-result-text ${winner === 'draw' ? 'draw' : (winner === 'p1' ? 'win' : 'lose')} fade-in`;

  await new Promise(r => setTimeout(r, 1500));

  // 7. Cleanup
  battleResultText.classList.remove('fade-in');
  battleResultText.textContent = '';
  p1SlotEl.innerHTML = '<div class="card-placeholder">Your Slot</div>';
  p2SlotEl.innerHTML = '<div class="card-placeholder">Enemy Slot</div>';

  updateDisplay(response.gameState);
  isAnimating = false;

  if (response.gameState.phase === 'gameover') {
    await new Promise(r => setTimeout(r, 1000));
    showGameOver(response.gameState);
  }
}

async function processEvent(event: BattleEvent) {
  if (event.type === 'effect_activation') {
    addLog(`[EFFECT] ${event.message}`, true);
    p1SlotEl.classList.add('active');
    p2SlotEl.classList.add('active');
    await new Promise(r => setTimeout(r, 500));
    p1SlotEl.classList.remove('active');
    p2SlotEl.classList.remove('active');
  } else if (event.type === 'rule_change') {
    addLog(`[RULE] ${event.message}`, true);
    await new Promise(r => setTimeout(r, 500));
  } else if (event.type === 'grail_transfer') {
    const targetEl = event.payload.player === 'p1' ? p1GrailsEl : p2GrailsEl;
    const startEl = event.payload.player === 'p1' ? p2SlotEl : p1SlotEl;
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

// Start
initApp();

