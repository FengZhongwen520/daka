package com.daka.serve.domain.repository;

import com.daka.serve.domain.model.WaterRecord;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface WaterRecordRepository {
    Optional<WaterRecord> find(UUID ownerId, long widgetId, LocalDate date);

    List<WaterRecord> findRange(UUID ownerId, long widgetId, LocalDate from, LocalDate to);

    WaterRecord save(WaterRecord record);
}
