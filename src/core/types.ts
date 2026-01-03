export type PlayerId = 'p1' | 'p2';
export type CardId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

export interface Card {
  id: CardId;
  name: string;
  basePower: number;
  description: string;
}

export interface PlayerState {
  id: PlayerId;
  hand: CardId[];
  grails: number;
  playedCard: CardId | null;
  wonCards: CardId[];
  nextTurnBuff: number; // 次のターンへの数値修正 (ベディヴィア: +, パーシヴァル: -)
}

export type GamePhase = 'selection' | 'resolution' | 'result' | 'gameover';

export interface GameState {
  turn: number; // 1-5
  phase: GamePhase;
  players: Record<PlayerId, PlayerState>;
  stockGrails: number; // 場の聖杯（便宜上無限）
  logs: string[];
  winner: PlayerId | 'draw' | null; // 最終結果用
}

// イベントシステム
export type BattleEventType = 
  | 'text_log' 
  | 'effect_activation' 
  | 'rule_change' 
  | 'grail_transfer'
  | 'buff_gain'
  | 'turn_start'
  | 'battle_start'
  | 'battle_end';

export interface BattleEvent {
  type: BattleEventType;
  message?: string; // テキストログまたはフォールバック用
  payload?: any;    // アニメーション用の柔軟なペイロード
}

// バトル結果
export interface BattleResult {
  winner: PlayerId | 'draw';
  p1Power: number;
  p2Power: number;
  isLowerWinnings: boolean; // "下剋上"
}

export interface RewardTransaction {
  p1Change: number;
  p2Change: number;
  stockChange: number; 
}

// エフェクトシステム型定義
export type RuleModifier = 'lower_wins';

export interface BattleContext {
  p1Card: CardId;
  p2Card: CardId;
  p1State: PlayerState;
  p2State: PlayerState;
  gameState: GameState;
  isP1: boolean;
}

export interface CardEffect {
  // 1. 数値計算
  getPower: (context: BattleContext) => number;

  // 2. 特殊勝利判定
  checkInstantWin: (context: BattleContext) => boolean;

  // 3. ルール変更
  getRuleModifier: (context: BattleContext) => RuleModifier | null;

  // 4. 報酬解決
  onResolveReward: (context: BattleContext, result: BattleResult) => RewardTransaction | null;

  // 5. ターン終了時処理
  onTurnEnd: (context: BattleContext, result: BattleResult) => void;
}
