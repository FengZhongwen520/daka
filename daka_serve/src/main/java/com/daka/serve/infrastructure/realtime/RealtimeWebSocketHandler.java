package com.daka.serve.infrastructure.realtime;

import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.util.UUID;

@Component
public class RealtimeWebSocketHandler extends TextWebSocketHandler {
    private final RealtimePublisher publisher;

    public RealtimeWebSocketHandler(RealtimePublisher publisher) {
        this.publisher = publisher;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        publisher.register(userId(session), session);
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        if ("ping".equals(message.getPayload())) {
            synchronized (session) {
                session.sendMessage(new TextMessage("{\"event\":\"pong\"}"));
            }
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        publisher.unregister(userId(session), session);
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) throws Exception {
        publisher.unregister(userId(session), session);
        if (session.isOpen()) session.close(CloseStatus.SERVER_ERROR);
    }

    private UUID userId(WebSocketSession session) {
        return (UUID) session.getAttributes().get(RealtimeHandshakeInterceptor.USER_ID_ATTRIBUTE);
    }
}
