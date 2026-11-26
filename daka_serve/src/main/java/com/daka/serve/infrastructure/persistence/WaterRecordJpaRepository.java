package com.daka.serve.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface WaterRecordJpaRepository extends JpaRepository<WaterRecordJpaEntity, UUID> {
    Optional<WaterRecordJpaEntity> findByOwnerIdAndWidgetIdAndDate(
        UUID ownerId,
        long widgetId,
        LocalDate date
    );

    List<WaterRecordJpaEntity> findAllByOwnerIdAndWidgetIdAndDateBetweenOrderByDateAsc(
        UUID ownerId,
        long widgetId,
        LocalDate from,
        LocalDate to
    );
}
