package com.daka.serve.infrastructure.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "user_account")
public class UserJpaEntity {
    @Id
    private UUID id;

    @Column(name = "login_lookup", nullable = false, unique = true, length = 128)
    private String loginLookup;

    @Column(name = "encrypted_login", nullable = false, length = 1024)
    private String encryptedLogin;

    @Column(name = "password_hash", nullable = false, length = 512)
    private String passwordHash;

    @Column(name = "encrypted_email", length = 1024)
    private String encryptedEmail;

    @Column(name = "email_lookup", unique = true, length = 128)
    private String emailLookup;

    @Column(name = "email_verified_at")
    private Instant emailVerifiedAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public String getLoginLookup() {
        return loginLookup;
    }

    public void setLoginLookup(String loginLookup) {
        this.loginLookup = loginLookup;
    }

    public String getEncryptedLogin() {
        return encryptedLogin;
    }

    public void setEncryptedLogin(String encryptedLogin) {
        this.encryptedLogin = encryptedLogin;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public void setPasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    public String getEncryptedEmail() {
        return encryptedEmail;
    }

    public void setEncryptedEmail(String encryptedEmail) {
        this.encryptedEmail = encryptedEmail;
    }

    public String getEmailLookup() {
        return emailLookup;
    }

    public void setEmailLookup(String emailLookup) {
        this.emailLookup = emailLookup;
    }

    public Instant getEmailVerifiedAt() {
        return emailVerifiedAt;
    }

    public void setEmailVerifiedAt(Instant emailVerifiedAt) {
        this.emailVerifiedAt = emailVerifiedAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}
