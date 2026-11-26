package com.daka.serve.domain.model;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record VerificationCode(
    UUID id,
    VerificationPurpose purpose,
    String targetHash,
    String codeHash,
    UUID userId,
    int attempts,
    Instant createdAt,
    Instant expiresAt,
    Instant consumedAt
) {
    public VerificationCode {
        Objects.requireNonNull(id, "id");
        Objects.requireNonNull(purpose, "purpose");
        Objects.requireNonNull(targetHash, "targetHash");
        Objects.requireNonNull(codeHash, "codeHash");
        Objects.requireNonNull(userId, "userId");
        Objects.requireNonNull(createdAt, "createdAt");
        Objects.requireNonNull(expiresAt, "expiresAt");
    }

    public boolean usable(Instant now) {
        return consumedAt == null && attempts < 5 && expiresAt.isAfter(now);
    }
}
