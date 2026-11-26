package com.daka.serve.domain.service;

import com.daka.serve.domain.model.VerificationPurpose;

public interface MailSender {
    default boolean isConfigured() {
        return true;
    }

    void sendVerificationCode(
        String email,
        VerificationPurpose purpose,
        String code,
        long expiresInSeconds
    );
}
