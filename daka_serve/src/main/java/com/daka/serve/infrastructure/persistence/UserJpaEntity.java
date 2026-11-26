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

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}
