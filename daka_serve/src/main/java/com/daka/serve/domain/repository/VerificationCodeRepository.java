package com.daka.serve.domain.repository;

import com.daka.serve.domain.model.VerificationCode;
import com.daka.serve.domain.model.VerificationPurpose;

import java.util.Optional;

public interface VerificationCodeRepository {
    Optional<VerificationCode> findLatest(VerificationPurpose purpose, String targetHash);

    VerificationCode save(VerificationCode code);
}
