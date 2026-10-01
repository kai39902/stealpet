// server.js - Authoritative Multiplayer Node.js Server for Steal A Pet!
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// State tracking for our 6-player circular island map
let gameState = {
    players: {}, // Tracks position, username, baseLockStatus, heldPet, weapons
    chatLog: [],
    halloweenShopOpen: false,
    halloweenTimer: 1800 // 30 minutes in seconds
};

// 30-Minute Universal Halloween Clock
setInterval(() => {
    if (gameState.halloweenTimer > 0) {
        gameState.halloweenTimer--;
        if (gameState.halloweenTimer === 0) {
            gameState.halloweenShopOpen = true;
            broadcastToAll({ type: 'HALLOWEEN_OPEN' });
            // Keep shop open for exactly 30 seconds
            setTimeout(() => {
                gameState.halloweenShopOpen = false;
                gameState.halloweenTimer = 1800; // Reset to 30 mins
                broadcastToAll({ type: 'HALLOWEEN_CLOSE' });
            }, 30000);
        }
    }
}, 1000);

wss.on('connection', (ws) => {
    let playerId = null;

    ws.on('message', (message) => {
        const data = JSON.parse(message);

        switch (data.type) {
            case 'JOIN_GAME':
                playerId = data.username;
                gameState.players[playerId] = {
                    username: data.username,
                    isGoogleAccount: data.isGoogle,
                    x: 0, z: 0,
                    baseLocked: true,
                    heldPet: null,
                    activeWeapon: 'bat'
                };
                ws.send(JSON.stringify({ type: 'INIT_STATE', state: gameState }));
                broadcastToAll({ type: 'PLAYER_JOINED', player: gameState.players[playerId] });
                break;

            case 'MOVE_PLAYER':
                if (gameState.players[playerId]) {
                    gameState.players[playerId].x = data.x;
                    gameState.players[playerId].z = data.z;
                    broadcastToAll({ type: 'PLAYER_MOVED', id: playerId, x: data.x, z: data.z });
                }
                break;

            case 'TOGGLE_BASE_LOCK':
                if (gameState.players[playerId]) {
                    gameState.players[playerId].baseLocked = data.locked;
                    broadcastToAll({ type: 'BASE_LOCK_CHANGED', id: playerId, locked: data.locked });
                }
                break;

            case 'STEAL_PET_ATTEMPT':
                // Server-side authoritative validation check for the Q key heist
                const targetBase = gameState.players[data.targetId];
                if (targetBase && !targetBase.baseLocked) {
                    gameState.players[playerId].heldPet = data.petData;
                    broadcastToAll({ type: 'PET_STOLEN_SUCCESS', thief: playerId, victim: data.targetId, pet: data.petData });
                }
                break;

            case 'SEND_CHAT':
                const chatMessage = { sender: data.sender, text: data.text, timestamp: Date.now() };
                gameState.chatLog.push(chatMessage);
                if (gameState.chatLog.length > 50) gameState.chatLog.shift();
                broadcastToAll({ type: 'NEW_CHAT', message: chatMessage });
                break;

            case 'ADMIN_FORCE_HALLOWEEN':
                // Explicit secure backend override check for kaiblokhin33@gmail.com
                if (data.email === 'kaiblokhin33@gmail.com') {
                    gameState.halloweenShopOpen = true;
                    gameState.halloweenTimer = 0;
                    broadcastToAll({ type: 'HALLOWEEN_OPEN_FORCED', triggeredBy: 'kaiblokhin33@gmail.com' });
                    
                    setTimeout(() => {
                        gameState.halloweenShopOpen = false;
                        gameState.halloweenTimer = 1800;
                        broadcastToAll({ type: 'HALLOWEEN_CLOSE' });
                    }, 30000);
                }
                break;
        }
    });

    ws.on('close', () => {
        if (playerId && gameState.players[playerId]) {
            delete gameState.players[playerId];
            broadcastToAll({ type: 'PLAYER_LEFT', id: playerId });
        }
    });
});

function broadcastToAll(data) {
    const stringData = JSON.stringify(data);
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(stringData);
        }
    });
}

// Serve front-end assets if bundled
app.use(express.static(path.join(__dirname, 'public')));
server.listen(PORT, () => console.log(`Steal A Pet backend running on port ${PORT}`));


            
