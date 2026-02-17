// Simple y-webrtc signaling server (standalone, no dependencies except ws)
// Usage: node signaling-server.js
// Or:    npx ws && node signaling-server.js

import { WebSocketServer } from "ws";
import http from "http";

const port = process.env.PORT || 4444;
const wss = new WebSocketServer({ noServer: true });

const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("y-webrtc signaling server OK");
});

const topics = new Map();

function send(conn, message) {
    if (conn.readyState !== 0 && conn.readyState !== 1) {
        conn.close();
        return;
    }
    try {
        conn.send(JSON.stringify(message));
    } catch {
        conn.close();
    }
}

function onConnection(conn) {
    const subscribedTopics = new Set();
    let closed = false;
    let pongReceived = true;

    const pingInterval = setInterval(() => {
        if (!pongReceived) {
            conn.close();
            clearInterval(pingInterval);
        } else {
            pongReceived = false;
            try { conn.ping(); } catch { conn.close(); }
        }
    }, 30000);

    conn.on("pong", () => { pongReceived = true; });

    conn.on("close", () => {
        subscribedTopics.forEach((topicName) => {
            const subs = topics.get(topicName);
            if (subs) {
                subs.delete(conn);
                if (subs.size === 0) topics.delete(topicName);
            }
        });
        subscribedTopics.clear();
        closed = true;
        clearInterval(pingInterval);
    });

    conn.on("message", (rawMessage) => {
        let message;
        try {
            message = JSON.parse(typeof rawMessage === "string" ? rawMessage : rawMessage.toString());
        } catch { return; }

        if (!message || !message.type || closed) return;

        switch (message.type) {
            case "subscribe":
                (message.topics || []).forEach((topicName) => {
                    if (typeof topicName === "string") {
                        if (!topics.has(topicName)) topics.set(topicName, new Set());
                        topics.get(topicName).add(conn);
                        subscribedTopics.add(topicName);
                    }
                });
                break;
            case "unsubscribe":
                (message.topics || []).forEach((topicName) => {
                    const subs = topics.get(topicName);
                    if (subs) subs.delete(conn);
                });
                break;
            case "publish":
                if (message.topic) {
                    const receivers = topics.get(message.topic);
                    if (receivers) {
                        message.clients = receivers.size;
                        receivers.forEach((receiver) => send(receiver, message));
                    }
                }
                break;
            case "ping":
                send(conn, { type: "pong" });
                break;
        }
    });
}

wss.on("connection", onConnection);

server.on("upgrade", (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
    });
});

server.listen(port, () => {
    console.log(`Signaling server running on ws://localhost:${port}`);
});
