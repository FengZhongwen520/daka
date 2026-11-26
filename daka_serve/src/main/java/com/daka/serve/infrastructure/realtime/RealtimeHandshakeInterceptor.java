package com.daka.serve.infrastructure.realtime;

import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.util.MultiValueMap;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;
import org.springframework.web.util.UriComponentsBuilder;

import java.util.Map;
import java.util.UUID;

@Component
public class RealtimeHandshakeInterceptor implements HandshakeInterceptor {
    public static final String USER_ID_ATTRIBUTE = "realtimeUserId";
    private final RealtimeTicketService tickets;

    public RealtimeHandshakeInterceptor(RealtimeTicketService tickets) {
        this.tickets = tickets;
    }

    @Override
    public boolean beforeHandshake(
        ServerHttpRequest request,
        ServerHttpResponse response,
        WebSocketHandler wsHandler,
        Map<String, Object> attributes
    ) {
        MultiValueMap<String, String> query = UriComponentsBuilder.fromUri(request.getURI())
            .build()
            .getQueryParams();
        UUID userId = tickets.consume(query.getFirst("ticket"));
        attributes.put(USER_ID_ATTRIBUTE, userId);
        return true;
    }

    @Override
    public void afterHandshake(
        ServerHttpRequest request,
        ServerHttpResponse response,
        WebSocketHandler wsHandler,
        Exception exception
    ) {
        // No post-handshake work.
    }
}
