package com.daka.serve.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface StorageRecordJpaRepository extends JpaRepository<StorageRecordJpaEntity, UUID> {
    Optional<StorageRecordJpaEntity> findByOwnerIdAndKeyHash(UUID ownerId, String keyHash);

    List<StorageRecordJpaEntity> findAllByOwnerIdOrderByUpdatedAtAsc(UUID ownerId);

    void deleteByOwnerIdAndKeyHash(UUID ownerId, String keyHash);

    void deleteByOwnerId(UUID ownerId);
}
