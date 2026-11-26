package com.daka.serve.infrastructure.config;

import com.daka.serve.infrastructure.realtime.RealtimeHandshakeInterceptor;
import com.daka.serve.infrastructure.realtime.RealtimeWebSocketHandler;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

import java.util.Arrays;

@Configuration
@EnableWebSocket
public class RealtimeWebSocketConfiguration implements WebSocketConfigurer {
    private final RealtimeWebSocketHandler handler;
    private final RealtimeHandshakeInterceptor interceptor;
    private final String[] allowedOrigins;

    public RealtimeWebSocketConfiguration(
        RealtimeWebSocketHandler handler,
        RealtimeHandshakeInterceptor interceptor,
        @Value("${daka.cors.allowed-origins:}") String origins
    ) {
        this.handler = handler;
        this.interceptor = interceptor;
        this.allowedOrigins = Arrays.stream(origins.split(","))
            .map(String::trim)
            .filter(origin -> !origin.isBlank())
            .toArray(String[]::new);
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(handler, "/ws/realtime")
            .addInterceptors(interceptor)
            .setAllowedOrigins(allowedOrigins);
    }
}
