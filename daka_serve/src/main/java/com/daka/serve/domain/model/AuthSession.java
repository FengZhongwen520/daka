package com.daka.serve.domain.model;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record AuthSession(
    String tokenHash,
    UUID userId,
    Instant createdAt,
    Instant expiresAt
) {
    public AuthSession {
        Objects.requireNonNull(tokenHash, "tokenHash");
        Objects.requireNonNull(userId, "userId");
        Objects.requireNonNull(createdAt, "createdAt");
        Objects.requireNonNull(expiresAt, "expiresAt");
    }

    public boolean isExpired(Instant now) {
        return !expiresAt.isAfter(now);
    }
}
