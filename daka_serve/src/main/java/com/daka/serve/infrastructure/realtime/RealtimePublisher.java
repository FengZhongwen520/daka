package com.daka.serve.infrastructure.realtime;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArraySet;

@Component
public class RealtimePublisher {
    private static final Logger LOGGER = LoggerFactory.getLogger(RealtimePublisher.class);
    private final Map<UUID, Set<WebSocketSession>> sessions = new ConcurrentHashMap<>();
    private final ObjectMapper objectMapper;

    public RealtimePublisher(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public void register(UUID userId, WebSocketSession session) {
        sessions.computeIfAbsent(userId, ignored -> new CopyOnWriteArraySet<>()).add(session);
        sendTo(userId, "realtime.connected", Map.of("userId", userId.toString()));
    }

    public void unregister(UUID userId, WebSocketSession session) {
        Set<WebSocketSession> userSessions = sessions.get(userId);
        if (userSessions == null) return;
        userSessions.remove(session);
        if (userSessions.isEmpty()) sessions.remove(userId);
    }

    public void send(UUID userId, String event, Object data) {
        sendTo(userId, event, data);
    }

    private void sendTo(UUID userId, String event, Object data) {
        Set<WebSocketSession> userSessions = sessions.get(userId);
        if (userSessions == null || userSessions.isEmpty()) return;
        try {
            String json = objectMapper.writeValueAsString(Map.of(
                "event", event,
                "data", data,
                "sentAt", Instant.now()
            ));
            for (WebSocketSession session : userSessions) {
                if (!session.isOpen()) {
                    unregister(userId, session);
                    continue;
                }
                try {
                    synchronized (session) {
                        session.sendMessage(new TextMessage(json));
                    }
                } catch (IOException exception) {
                    LOGGER.warn("Realtime send failed for user {}", userId, exception);
                    unregister(userId, session);
                    try {
                        session.close();
                    } catch (IOException ignored) {
                        // The broken connection is already removed from the registry.
                    }
                }
            }
        } catch (Exception exception) {
            LOGGER.error("Could not serialize realtime event {}", event, exception);
        }
    }
}
