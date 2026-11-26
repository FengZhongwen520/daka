package com.daka.serve.domain.model;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record UserAccount(
    UUID id,
    String loginLookup,
    String encryptedLogin,
    String passwordHash,
    String encryptedEmail,
    String emailLookup,
    Instant emailVerifiedAt,
    Instant createdAt
) {
    public UserAccount {
        Objects.requireNonNull(id, "id");
        Objects.requireNonNull(loginLookup, "loginLookup");
        Objects.requireNonNull(encryptedLogin, "encryptedLogin");
        Objects.requireNonNull(passwordHash, "passwordHash");
        Objects.requireNonNull(createdAt, "createdAt");
    }
}
