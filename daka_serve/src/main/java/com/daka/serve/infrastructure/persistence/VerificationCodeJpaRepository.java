package com.daka.serve.infrastructure.persistence;

import com.daka.serve.domain.model.VerificationPurpose;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface VerificationCodeJpaRepository extends JpaRepository<VerificationCodeJpaEntity, UUID> {
    Optional<VerificationCodeJpaEntity> findFirstByPurposeAndTargetHashOrderByCreatedAtDesc(
        VerificationPurpose purpose,
        String targetHash
    );
}
