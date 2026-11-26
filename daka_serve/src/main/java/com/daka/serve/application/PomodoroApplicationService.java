package com.daka.serve.application;

import com.daka.serve.domain.exception.ValidationException;
import com.daka.serve.domain.model.PomodoroMode;
import com.daka.serve.domain.model.PomodoroSession;
import com.daka.serve.domain.repository.PomodoroSessionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
public class PomodoroApplicationService {
    private final PomodoroSessionRepository sessions;

    public PomodoroApplicationService(PomodoroSessionRepository sessions) {
        this.sessions = sessions;
    }

    @Transactional
    public PomodoroUpdate get(UUID ownerId, long widgetId) {
        Instant now = Instant.now();
        Normalized normalized = normalize(loadOrCreate(ownerId, widgetId), now);
        return update(normalized.session(), normalized.completed(), now);
    }

    @Transactional
    public PomodoroUpdate start(UUID ownerId, long widgetId) {
        Instant now = Instant.now();
        PomodoroSession session = normalize(loadOrCreate(ownerId, widgetId), now).session();
        if (session.running()) return update(session, false, now);

        int seconds = session.remainingSeconds() > 0
            ? session.remainingSeconds()
            : session.durationSeconds();
        PomodoroSession running = new PomodoroSession(
            session.id(),
            session.ownerId(),
            session.widgetId(),
            session.mode(),
            true,
            session.focusMinutes(),
            session.breakMinutes(),
            seconds,
            now.plusSeconds(seconds),
            session.notificationsEnabled(),
            now
        );
        return update(sessions.save(running), false, now);
    }

    @Transactional
    public PomodoroUpdate pause(UUID ownerId, long widgetId) {
        Instant now = Instant.now();
        PomodoroSession session = normalize(loadOrCreate(ownerId, widgetId), now).session();
        PomodoroSession paused = new PomodoroSession(
            session.id(),
            session.ownerId(),
            session.widgetId(),
            session.mode(),
            false,
            session.focusMinutes(),
            session.breakMinutes(),
            remainingAt(session, now),
            null,
            session.notificationsEnabled(),
            now
        );
        return update(sessions.save(paused), false, now);
    }

    @Transactional
    public PomodoroUpdate reset(UUID ownerId, long widgetId) {
        Instant now = Instant.now();
        PomodoroSession current = normalize(loadOrCreate(ownerId, widgetId), now).session();
        PomodoroSession reset = new PomodoroSession(
            current.id(),
            current.ownerId(),
            current.widgetId(),
            PomodoroMode.FOCUS,
            false,
            current.focusMinutes(),
            current.breakMinutes(),
            current.focusMinutes() * 60,
            null,
            current.notificationsEnabled(),
            now
        );
        return update(sessions.save(reset), false, now);
    }

    @Transactional
    public PomodoroUpdate saveSettings(
        UUID ownerId,
        long widgetId,
        int focusMinutes,
        int breakMinutes
    ) {
        validateDuration(focusMinutes, breakMinutes);
        Instant now = Instant.now();
        PomodoroSession current = normalize(loadOrCreate(ownerId, widgetId), now).session();
        if (current.running()) {
            throw new ValidationException("计时运行中不能修改时长");
        }
        int remaining = current.mode() == PomodoroMode.FOCUS
            ? focusMinutes * 60
            : breakMinutes * 60;
        PomodoroSession updated = new PomodoroSession(
            current.id(),
            current.ownerId(),
            current.widgetId(),
            current.mode(),
            false,
            focusMinutes,
            breakMinutes,
            remaining,
            null,
            current.notificationsEnabled(),
            now
        );
        return update(sessions.save(updated), false, now);
    }

    @Transactional
    public PomodoroUpdate setNotifications(UUID ownerId, long widgetId, boolean enabled) {
        Instant now = Instant.now();
        PomodoroSession current = normalize(loadOrCreate(ownerId, widgetId), now).session();
        PomodoroSession updated = new PomodoroSession(
            current.id(),
            current.ownerId(),
            current.widgetId(),
            current.mode(),
            current.running(),
            current.focusMinutes(),
            current.breakMinutes(),
            remainingAt(current, now),
            current.deadline(),
            enabled,
            now
        );
        return update(sessions.save(updated), false, now);
    }

    @Transactional
    public List<PomodoroUpdate> processTicks(Instant now, boolean includeHeartbeat) {
        List<PomodoroUpdate> updates = new ArrayList<>();
        for (PomodoroSession session : sessions.findAllRunning()) {
            Normalized normalized = normalize(session, now);
            if (normalized.completed() || includeHeartbeat) {
                updates.add(update(normalized.session(), normalized.completed(), now));
            }
        }
        return updates;
    }

    private PomodoroSession loadOrCreate(UUID ownerId, long widgetId) {
        validateWidget(widgetId);
        return sessions.findByOwnerAndWidget(ownerId, widgetId).orElseGet(() -> {
            Instant now = Instant.now();
            PomodoroSession created = new PomodoroSession(
                UUID.randomUUID(),
                ownerId,
                widgetId,
                PomodoroMode.FOCUS,
                false,
                25,
                5,
                25 * 60,
                null,
                true,
                now
            );
            return sessions.save(created);
        });
    }

    private Normalized normalize(PomodoroSession session, Instant now) {
        if (!session.running()) {
            return new Normalized(session, false);
        }
        if (session.deadline() != null && session.deadline().isAfter(now)) {
            return new Normalized(session, false);
        }

        PomodoroMode nextMode = session.mode() == PomodoroMode.FOCUS
            ? PomodoroMode.BREAK
            : PomodoroMode.FOCUS;
        int nextRemaining = (nextMode == PomodoroMode.FOCUS
            ? session.focusMinutes()
            : session.breakMinutes()) * 60;
        PomodoroSession completed = new PomodoroSession(
            session.id(),
            session.ownerId(),
            session.widgetId(),
            nextMode,
            false,
            session.focusMinutes(),
            session.breakMinutes(),
            nextRemaining,
            null,
            session.notificationsEnabled(),
            now
        );
        sessions.save(completed);
        return new Normalized(completed, true);
    }

    private PomodoroView view(PomodoroSession session, Instant now) {
        return new PomodoroView(
            session.widgetId(),
            session.mode().name().toLowerCase(),
            session.running(),
            session.focusMinutes(),
            session.breakMinutes(),
            remainingAt(session, now),
            session.deadline(),
            session.notificationsEnabled(),
            session.updatedAt()
        );
    }

    private PomodoroUpdate update(PomodoroSession session, boolean completed, Instant now) {
        return new PomodoroUpdate(session.ownerId(), view(session, now), completed, now);
    }

    private int remainingAt(PomodoroSession session, Instant now) {
        if (!session.running() || session.deadline() == null) {
            return Math.max(0, session.remainingSeconds());
        }
        long millis = Duration.between(now, session.deadline()).toMillis();
        return (int) Math.max(0, Math.ceil(millis / 1000.0));
    }

    private void validateDuration(int focusMinutes, int breakMinutes) {
        if (focusMinutes < 1 || focusMinutes > 120) {
            throw new ValidationException("专注时长需为 1-120 分钟");
        }
        if (breakMinutes < 1 || breakMinutes > 60) {
            throw new ValidationException("休息时长需为 1-60 分钟");
        }
    }

    private void validateWidget(long widgetId) {
        if (widgetId <= 0) throw new ValidationException("组件 ID 无效");
    }

    public record PomodoroUpdate(
        UUID ownerId,
        PomodoroView state,
        boolean completed,
        Instant serverTime
    ) {
    }

    private record Normalized(PomodoroSession session, boolean completed) {
    }

    public record PomodoroView(
        long widgetId,
        String mode,
        boolean running,
        int focusMinutes,
        int breakMinutes,
        int remainingSeconds,
        Instant deadline,
        boolean notificationsEnabled,
        Instant updatedAt
    ) {
    }
}
