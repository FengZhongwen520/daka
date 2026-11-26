package com.daka.serve.infrastructure.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(
    name = "pomodoro_session",
    uniqueConstraints = @UniqueConstraint(
        name = "uk_pomodoro_owner_widget",
        columnNames = {"owner_id", "widget_id"}
    )
)
public class PomodoroSessionJpaEntity {
    @Id
    private UUID id;

    @Column(name = "owner_id", nullable = false)
    private UUID ownerId;

    @Column(name = "widget_id", nullable = false)
    private long widgetId;

    @Column(nullable = false)
    private boolean running;

    @Column(name = "deadline_at")
    private Instant deadline;

    @Lob
    @Column(name = "encrypted_state", nullable = false)
    private String encryptedState;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public UUID getOwnerId() {
        return ownerId;
    }

    public void setOwnerId(UUID ownerId) {
        this.ownerId = ownerId;
    }

    public long getWidgetId() {
        return widgetId;
    }

    public void setWidgetId(long widgetId) {
        this.widgetId = widgetId;
    }

    public boolean isRunning() {
        return running;
    }

    public void setRunning(boolean running) {
        this.running = running;
    }

    public Instant getDeadline() {
        return deadline;
    }

    public void setDeadline(Instant deadline) {
        this.deadline = deadline;
    }

    public String getEncryptedState() {
        return encryptedState;
    }

    public void setEncryptedState(String encryptedState) {
        this.encryptedState = encryptedState;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }
}
