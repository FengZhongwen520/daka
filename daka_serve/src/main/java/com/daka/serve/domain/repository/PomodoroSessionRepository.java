package com.daka.serve.domain.repository;

import com.daka.serve.domain.model.PomodoroSession;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PomodoroSessionRepository {
    Optional<PomodoroSession> findByOwnerAndWidget(UUID ownerId, long widgetId);

    List<PomodoroSession> findAllRunning();

    PomodoroSession save(PomodoroSession session);
}
