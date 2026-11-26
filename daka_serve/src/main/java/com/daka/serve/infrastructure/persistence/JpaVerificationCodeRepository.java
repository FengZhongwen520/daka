package com.daka.serve.infrastructure.persistence;

import com.daka.serve.domain.model.VerificationCode;
import com.daka.serve.domain.model.VerificationPurpose;
import com.daka.serve.domain.repository.VerificationCodeRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public class JpaVerificationCodeRepository implements VerificationCodeRepository {
    private final VerificationCodeJpaRepository repository;

    public JpaVerificationCodeRepository(VerificationCodeJpaRepository repository) {
        this.repository = repository;
    }

    @Override
    public Optional<VerificationCode> findLatest(
        VerificationPurpose purpose,
        String targetHash
    ) {
        return repository
            .findFirstByPurposeAndTargetHashOrderByCreatedAtDesc(purpose, targetHash)
            .map(this::toDomain);
    }

    @Override
    public VerificationCode save(VerificationCode code) {
        return toDomain(repository.save(toEntity(code)));
    }

    private VerificationCode toDomain(VerificationCodeJpaEntity entity) {
        return new VerificationCode(
            entity.getId(),
            entity.getPurpose(),
            entity.getTargetHash(),
            entity.getCodeHash(),
            entity.getUserId(),
            entity.getAttempts(),
            entity.getCreatedAt(),
            entity.getExpiresAt(),
            entity.getConsumedAt()
        );
    }

    private VerificationCodeJpaEntity toEntity(VerificationCode code) {
        VerificationCodeJpaEntity entity = new VerificationCodeJpaEntity();
        entity.setId(code.id());
        entity.setPurpose(code.purpose());
        entity.setTargetHash(code.targetHash());
        entity.setCodeHash(code.codeHash());
        entity.setUserId(code.userId());
        entity.setAttempts(code.attempts());
        entity.setCreatedAt(code.createdAt());
        entity.setExpiresAt(code.expiresAt());
        entity.setConsumedAt(code.consumedAt());
        return entity;
    }
}
