package com.daka.serve.infrastructure.persistence;

import com.daka.serve.domain.model.StoredValue;
import com.daka.serve.domain.repository.StorageRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public class JpaStorageRepository implements StorageRepository {
    private final StorageRecordJpaRepository repository;

    public JpaStorageRepository(StorageRecordJpaRepository repository) {
        this.repository = repository;
    }

    @Override
    public Optional<StoredValue> findByOwnerAndKeyHash(UUID ownerId, String keyHash) {
        return repository.findByOwnerIdAndKeyHash(ownerId, keyHash).map(this::toDomain);
    }

    @Override
    public List<StoredValue> findAllByOwner(UUID ownerId) {
        return repository.findAllByOwnerIdOrderByUpdatedAtAsc(ownerId).stream()
            .map(this::toDomain)
            .toList();
    }

    @Override
    public StoredValue save(StoredValue value) {
        return toDomain(repository.save(toEntity(value)));
    }

    @Override
    public void delete(UUID ownerId, String keyHash) {
        repository.deleteByOwnerIdAndKeyHash(ownerId, keyHash);
    }

    @Override
    public void deleteAll(UUID ownerId) {
        repository.deleteByOwnerId(ownerId);
    }

    private StoredValue toDomain(StorageRecordJpaEntity entity) {
        return new StoredValue(
            entity.getId(),
            entity.getOwnerId(),
            entity.getNamespace(),
            entity.getKeyHash(),
            entity.getEncryptedKey(),
            entity.getEncryptedValue(),
            entity.getUpdatedAt()
        );
    }

    private StorageRecordJpaEntity toEntity(StoredValue value) {
        StorageRecordJpaEntity entity = new StorageRecordJpaEntity();
        entity.setId(value.id());
        entity.setOwnerId(value.ownerId());
        entity.setNamespace(value.namespace());
        entity.setKeyHash(value.keyHash());
        entity.setEncryptedKey(value.encryptedKey());
        entity.setEncryptedValue(value.encryptedValue());
        entity.setUpdatedAt(value.updatedAt());
        return entity;
    }
}
