package com.daka.serve.infrastructure.persistence;

import com.daka.serve.domain.model.AuthSession;
import com.daka.serve.domain.repository.AuthSessionRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@Repository
public class JpaAuthSessionRepository implements AuthSessionRepository {
    private final AuthSessionJpaRepository repository;

    public JpaAuthSessionRepository(AuthSessionJpaRepository repository) {
        this.repository = repository;
    }

    @Override
    public AuthSession save(AuthSession session) {
        AuthSessionJpaEntity entity = new AuthSessionJpaEntity();
        entity.setTokenHash(session.tokenHash());
        entity.setUserId(session.userId());
        entity.setCreatedAt(session.createdAt());
        entity.setExpiresAt(session.expiresAt());
        repository.save(entity);
        return session;
    }

    @Override
    public Optional<AuthSession> findByTokenHash(String tokenHash) {
        return repository.findById(tokenHash).map(entity -> new AuthSession(
            entity.getTokenHash(),
            entity.getUserId(),
            entity.getCreatedAt(),
            entity.getExpiresAt()
        ));
    }

    @Override
    public void deleteByTokenHash(String tokenHash) {
        repository.findById(tokenHash).ifPresent(repository::delete);
    }

    @Override
    public void deleteExpired(Instant now) {
        repository.deleteByExpiresAtBefore(now);
    }

    @Override
    public void deleteByUserId(UUID userId) {
        repository.deleteByUserId(userId);
    }
}
