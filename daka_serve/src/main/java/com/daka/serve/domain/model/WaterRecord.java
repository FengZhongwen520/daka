package com.daka.serve.domain.model;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Objects;
import java.util.UUID;

public record WaterRecord(
    UUID id,
    UUID ownerId,
    long widgetId,
    LocalDate date,
    int totalMl,
    Instant lastDrinkAt,
    Instant updatedAt
) {
    public WaterRecord {
        Objects.requireNonNull(id, "id");
        Objects.requireNonNull(ownerId, "ownerId");
        Objects.requireNonNull(date, "date");
        Objects.requireNonNull(updatedAt, "updatedAt");
    }
}
