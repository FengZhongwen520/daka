package com.daka.serve.domain.model;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record StoredValue(
    UUID id,
    UUID ownerId,
    String namespace,
    String keyHash,
    String encryptedKey,
    String encryptedValue,
    Instant updatedAt
) {
    public StoredValue {
        Objects.requireNonNull(id, "id");
        Objects.requireNonNull(ownerId, "ownerId");
        Objects.requireNonNull(namespace, "namespace");
        Objects.requireNonNull(keyHash, "keyHash");
        Objects.requireNonNull(encryptedKey, "encryptedKey");
        Objects.requireNonNull(encryptedValue, "encryptedValue");
        Objects.requireNonNull(updatedAt, "updatedAt");
    }
}
