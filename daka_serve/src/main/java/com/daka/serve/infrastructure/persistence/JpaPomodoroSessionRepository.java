package com.daka.serve.infrastructure.persistence;

import com.daka.serve.domain.model.PomodoroMode;
import com.daka.serve.domain.model.PomodoroSession;
import com.daka.serve.domain.repository.PomodoroSessionRepository;
import com.daka.serve.domain.service.SecretCipher;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public class JpaPomodoroSessionRepository implements PomodoroSessionRepository {
    private final PomodoroSessionJpaRepository repository;
    private final SecretCipher cipher;
    private final ObjectMapper objectMapper;

    public JpaPomodoroSessionRepository(
        PomodoroSessionJpaRepository repository,
        SecretCipher cipher,
        ObjectMapper objectMapper
    ) {
        this.repository = repository;
        this.cipher = cipher;
        this.objectMapper = objectMapper;
    }

    @Override
    public Optional<PomodoroSession> findByOwnerAndWidget(UUID ownerId, long widgetId) {
        return repository.findByOwnerIdAndWidgetId(ownerId, widgetId).map(this::toDomain);
    }

    @Override
    public List<PomodoroSession> findAllRunning() {
        return repository.findAllByRunningTrue().stream().map(this::toDomain).toList();
    }

    @Override
    public PomodoroSession save(PomodoroSession session) {
        return toDomain(repository.save(toEntity(session)));
    }

    private PomodoroSession toDomain(PomodoroSessionJpaEntity entity) {
        try {
            Payload payload = objectMapper.readValue(cipher.decrypt(entity.getEncryptedState()), Payload.class);
            return new PomodoroSession(
                entity.getId(),
                entity.getOwnerId(),
                entity.getWidgetId(),
                PomodoroMode.valueOf(payload.mode()),
                entity.isRunning(),
                payload.focusMinutes(),
                payload.breakMinutes(),
                payload.remainingSeconds(),
                entity.getDeadline(),
                payload.notificationsEnabled(),
                entity.getUpdatedAt()
            );
        } catch (Exception exception) {
            throw new IllegalStateException("番茄钟状态无法读取", exception);
        }
    }

    private PomodoroSessionJpaEntity toEntity(PomodoroSession session) {
        try {
            PomodoroSessionJpaEntity entity = new PomodoroSessionJpaEntity();
            entity.setId(session.id());
            entity.setOwnerId(session.ownerId());
            entity.setWidgetId(session.widgetId());
            entity.setRunning(session.running());
            entity.setDeadline(session.deadline());
            entity.setUpdatedAt(session.updatedAt());
            entity.setEncryptedState(cipher.encrypt(objectMapper.writeValueAsString(new Payload(
                session.mode().name(),
                session.focusMinutes(),
                session.breakMinutes(),
                session.remainingSeconds(),
                session.notificationsEnabled()
            ))));
            return entity;
        } catch (Exception exception) {
            throw new IllegalStateException("番茄钟状态无法保存", exception);
        }
    }

    private record Payload(
        String mode,
        int focusMinutes,
        int breakMinutes,
        int remainingSeconds,
        boolean notificationsEnabled
    ) {
    }
}
