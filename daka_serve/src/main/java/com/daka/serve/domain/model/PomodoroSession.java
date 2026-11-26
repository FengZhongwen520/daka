package com.daka.serve.domain.model;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record PomodoroSession(
    UUID id,
    UUID ownerId,
    long widgetId,
    PomodoroMode mode,
    boolean running,
    int focusMinutes,
    int breakMinutes,
    int remainingSeconds,
    Instant deadline,
    boolean notificationsEnabled,
    Instant updatedAt
) {
    public PomodoroSession {
        Objects.requireNonNull(id, "id");
        Objects.requireNonNull(ownerId, "ownerId");
        Objects.requireNonNull(mode, "mode");
        Objects.requireNonNull(updatedAt, "updatedAt");
    }

    public int durationSeconds() {
        return (mode == PomodoroMode.FOCUS ? focusMinutes : breakMinutes) * 60;
    }
}
