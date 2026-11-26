package com.daka.serve.infrastructure.persistence;

import com.daka.serve.domain.model.WaterRecord;
import com.daka.serve.domain.repository.WaterRecordRepository;
import com.daka.serve.domain.service.SecretCipher;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public class JpaWaterRecordRepository implements WaterRecordRepository {
    private final WaterRecordJpaRepository repository;
    private final SecretCipher cipher;
    private final ObjectMapper objectMapper;

    public JpaWaterRecordRepository(
        WaterRecordJpaRepository repository,
        SecretCipher cipher,
        ObjectMapper objectMapper
    ) {
        this.repository = repository;
        this.cipher = cipher;
        this.objectMapper = objectMapper;
    }

    @Override
    public Optional<WaterRecord> find(UUID ownerId, long widgetId, LocalDate date) {
        return repository.findByOwnerIdAndWidgetIdAndDate(ownerId, widgetId, date)
            .map(this::toDomain);
    }

    @Override
    public List<WaterRecord> findRange(
        UUID ownerId,
        long widgetId,
        LocalDate from,
        LocalDate to
    ) {
        return repository
            .findAllByOwnerIdAndWidgetIdAndDateBetweenOrderByDateAsc(ownerId, widgetId, from, to)
            .stream()
            .map(this::toDomain)
            .toList();
    }

    @Override
    public WaterRecord save(WaterRecord record) {
        return toDomain(repository.save(toEntity(record)));
    }

    private WaterRecord toDomain(WaterRecordJpaEntity entity) {
        try {
            Payload payload = objectMapper.readValue(cipher.decrypt(entity.getEncryptedState()), Payload.class);
            return new WaterRecord(
                entity.getId(),
                entity.getOwnerId(),
                entity.getWidgetId(),
                entity.getDate(),
                payload.totalMl(),
                payload.lastDrinkAt(),
                entity.getUpdatedAt()
            );
        } catch (Exception exception) {
            throw new IllegalStateException("饮水记录无法读取", exception);
        }
    }

    private WaterRecordJpaEntity toEntity(WaterRecord record) {
        try {
            WaterRecordJpaEntity entity = new WaterRecordJpaEntity();
            entity.setId(record.id());
            entity.setOwnerId(record.ownerId());
            entity.setWidgetId(record.widgetId());
            entity.setDate(record.date());
            entity.setUpdatedAt(record.updatedAt());
            entity.setEncryptedState(cipher.encrypt(objectMapper.writeValueAsString(
                new Payload(record.totalMl(), record.lastDrinkAt())
            )));
            return entity;
        } catch (Exception exception) {
            throw new IllegalStateException("饮水记录无法保存", exception);
        }
    }

    private record Payload(int totalMl, Instant lastDrinkAt) {
    }
}
