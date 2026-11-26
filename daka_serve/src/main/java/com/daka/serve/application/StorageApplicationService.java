package com.daka.serve.application;

import com.daka.serve.domain.exception.ValidationException;
import com.daka.serve.domain.model.StoredValue;
import com.daka.serve.domain.repository.StorageRepository;
import com.daka.serve.domain.service.LookupHasher;
import com.daka.serve.domain.service.SecretCipher;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
public class StorageApplicationService {
    private final StorageRepository storage;
    private final SecretCipher cipher;
    private final LookupHasher lookupHasher;
    private final int maxValueBytes;

    public StorageApplicationService(
        StorageRepository storage,
        SecretCipher cipher,
        LookupHasher lookupHasher,
        @Value("${daka.storage.max-value-bytes:12582912}") int maxValueBytes
    ) {
        this.storage = storage;
        this.cipher = cipher;
        this.lookupHasher = lookupHasher;
        this.maxValueBytes = maxValueBytes;
    }

    @Transactional(readOnly = true)
    public List<StoredItem> list(UUID ownerId) {
        return storage.findAllByOwner(ownerId).stream()
            .map(value -> new StoredItem(
                cipher.decrypt(value.encryptedKey()),
                cipher.decrypt(value.encryptedValue()),
                value.updatedAt()
            ))
            .toList();
    }

    @Transactional
    public StoredItem save(UUID ownerId, String key, String value) {
        validateKey(key);
        if (value == null) {
            throw new ValidationException("存储值不能为空");
        }
        if (value.getBytes(StandardCharsets.UTF_8).length > maxValueBytes) {
            throw new ValidationException("单条数据超过服务端限制");
        }

        String keyHash = lookupHasher.hash(key);
        Instant now = Instant.now();
        StoredValue existing = storage.findByOwnerAndKeyHash(ownerId, keyHash).orElse(null);
        StoredValue saved = storage.save(new StoredValue(
            existing == null ? UUID.randomUUID() : existing.id(),
            ownerId,
            namespaceOf(key),
            keyHash,
            cipher.encrypt(key),
            cipher.encrypt(value),
            now
        ));
        return new StoredItem(key, cipher.decrypt(saved.encryptedValue()), saved.updatedAt());
    }

    @Transactional
    public void delete(UUID ownerId, String key) {
        validateKey(key);
        storage.delete(ownerId, lookupHasher.hash(key));
    }

    @Transactional
    public void deleteAll(UUID ownerId) {
        storage.deleteAll(ownerId);
    }

    private void validateKey(String key) {
        if (key == null || key.isBlank() || key.length() > 256) {
            throw new ValidationException("存储键无效");
        }
    }

    private String namespaceOf(String key) {
        if (key.startsWith("domain:")) return "domain";
        int separator = key.indexOf('-');
        if (separator <= 0) separator = key.indexOf(':');
        return separator > 0 ? key.substring(0, separator) : "app";
    }

    public record StoredItem(String key, String value, Instant updatedAt) {
    }
}
