import { Server } from 'socket.io';
import { createServer } from 'http';
import { v4 as uuidv4 } from 'uuid';

// Types (to be shared, but redefined here for now to avoid complexity until volume mount works perfectly)
interface Room {
    id: string;
    hostId: string;
    guestId?: string;
    gameState?: any;
}

const httpServer = createServer();
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const rooms: Record<string, Room> = {};

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('create_room', (playerName: string) => {
        const roomId = uuidv4();
        rooms[roomId] = {
            id: roomId,
            hostId: socket.id
        };
        socket.join(roomId);
        socket.emit('room_created', roomId);
        console.log(`Room created: ${roomId} by ${playerName} (${socket.id})`);
    });

    socket.on('list_rooms', () => {
        const availableRooms = Object.values(rooms)
            .filter(r => !r.guestId)
            .map(r => ({ id: r.id, name: `Room ${r.id.substring(0, 4)}` })); // Simplified name
        socket.emit('room_list', availableRooms);
    });

    socket.on('join_room', (roomId: string, playerName: string) => {
        const room = rooms[roomId];
        if (room && !room.guestId) {
            room.guestId = socket.id;
            socket.join(roomId);
            io.to(roomId).emit('game_start', { 
                p1: room.hostId, 
                p2: room.guestId 
            });
            console.log(`Player ${playerName} (${socket.id}) joined room ${roomId}`);
        } else {
            socket.emit('error', 'Room not found or full');
        }
    });

    socket.on('play_card', (data: { roomId: string, cardId: string }) => {
        // TODO: Implement game logic integration
        // For now, just echo
        console.log(`Card played in ${data.roomId}: ${data.cardId}`);
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        // Cleanup rooms logic would go here
    });
});

const PORT = 3000;
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
