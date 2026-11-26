package com.daka.serve.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.UUID;

public interface AuthSessionJpaRepository extends JpaRepository<AuthSessionJpaEntity, String> {
    void deleteByExpiresAtBefore(Instant now);

    void deleteByUserId(UUID userId);
}
