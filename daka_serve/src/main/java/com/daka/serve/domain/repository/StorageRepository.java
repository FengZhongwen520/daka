package com.daka.serve.domain.repository;

import com.daka.serve.domain.model.StoredValue;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface StorageRepository {
    Optional<StoredValue> findByOwnerAndKeyHash(UUID ownerId, String keyHash);

    List<StoredValue> findAllByOwner(UUID ownerId);

    StoredValue save(StoredValue value);

    void delete(UUID ownerId, String keyHash);

    void deleteAll(UUID ownerId);
}
