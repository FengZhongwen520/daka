package com.daka.serve.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PomodoroSessionJpaRepository extends JpaRepository<PomodoroSessionJpaEntity, UUID> {
    Optional<PomodoroSessionJpaEntity> findByOwnerIdAndWidgetId(UUID ownerId, long widgetId);

    List<PomodoroSessionJpaEntity> findAllByRunningTrue();
}
