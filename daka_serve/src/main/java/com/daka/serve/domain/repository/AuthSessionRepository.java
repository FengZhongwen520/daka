package com.daka.serve.domain.repository;

import com.daka.serve.domain.model.AuthSession;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface AuthSessionRepository {
    AuthSession save(AuthSession session);

    Optional<AuthSession> findByTokenHash(String tokenHash);

    void deleteByTokenHash(String tokenHash);

    void deleteExpired(Instant now);

    void deleteByUserId(UUID userId);
}
