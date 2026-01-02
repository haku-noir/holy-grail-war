import { io, Socket } from 'socket.io-client';
import type { ServerAPI, TurnResponse } from './api';
import type { CardId, GameState } from '../types';

export class SocketClient implements ServerAPI {
  private socket: Socket;
  private currentRoomId: string | null = null;
  private resolveTurnFn: ((response: TurnResponse) => void) | null = null;


  constructor(serverUrl: string = 'http://localhost:3000') {
    this.socket = io(serverUrl);

    this.socket.on('connect', () => {
      console.log('Connected to server:', this.socket.id);
    });

    this.socket.on('turn_result', (response: TurnResponse) => {
      if (this.resolveTurnFn) {
        this.resolveTurnFn(response);
        this.resolveTurnFn = null;
      }
    });

    this.socket.on('disconnect', () => {
        console.log('Disconnected from server');
    });
  }

  // Room Management Methods
  async createRoom(playerName: string): Promise<string> {
    return new Promise((resolve) => {
      this.socket.emit('create_room', playerName);
      this.socket.once('room_created', (roomId: string) => {
        this.currentRoomId = roomId;
        resolve(roomId);
      });
    });
  }

  async listRooms(): Promise<any[]> {
    return new Promise((resolve) => {
      this.socket.emit('list_rooms');
      this.socket.once('room_list', (rooms: any[]) => {
        resolve(rooms);
      });
    });
  }

  joinRoom(roomId: string, playerName: string): void {
      this.socket.emit('join_room', roomId, playerName);
  }

  onGameStart(callback: (data: any) => void) {
      this.socket.on('game_start', (data) => {
          this.currentRoomId = data.roomId; // Ensure room ID is set
          callback(data);
      });
  }

  // Game API
  async playCard(playerId: 'p1', cardId: CardId): Promise<TurnResponse> {
    if (!this.currentRoomId) throw new Error("Not in a room");
    
    return new Promise((resolve) => {
        this.resolveTurnFn = resolve;
        this.socket.emit('play_card', {
            roomId: this.currentRoomId,
            cardId: cardId,
            playerId: playerId
        });
    });
  }

  async resetGame(): Promise<GameState> {
    // Online game reset is handled by server event basically, but for interface consistency:
    return new Promise((resolve) => {
         // TODO: Implement rematch logic
         resolve({} as GameState); // Placeholder
    });
  }
}
