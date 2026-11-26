package com.daka.serve.infrastructure.realtime;

import com.daka.serve.domain.exception.UnauthorizedException;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class RealtimeTicketService {
    private static final long TICKET_LIFETIME_SECONDS = 30;
    private final SecureRandom random = new SecureRandom();
    private final Base64.Encoder encoder = Base64.getUrlEncoder().withoutPadding();
    private final Map<String, Ticket> tickets = new ConcurrentHashMap<>();

    public IssuedTicket issue(UUID userId) {
        byte[] bytes = new byte[24];
        random.nextBytes(bytes);
        String ticket = encoder.encodeToString(bytes);
        Instant expiresAt = Instant.now().plusSeconds(TICKET_LIFETIME_SECONDS);
        tickets.put(ticket, new Ticket(userId, expiresAt));
        tickets.entrySet().removeIf(entry -> entry.getValue().expiresAt().isBefore(Instant.now()));
        return new IssuedTicket(ticket, TICKET_LIFETIME_SECONDS);
    }

    public UUID consume(String ticket) {
        if (ticket == null || ticket.isBlank()) throw new UnauthorizedException();
        Ticket value = tickets.remove(ticket);
        if (value == null || value.expiresAt().isBefore(Instant.now())) {
            throw new UnauthorizedException();
        }
        return value.userId();
    }

    private record Ticket(UUID userId, Instant expiresAt) {
    }

    public record IssuedTicket(String ticket, long expiresInSeconds) {
    }
}
