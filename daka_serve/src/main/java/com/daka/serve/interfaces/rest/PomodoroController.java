package com.daka.serve.interfaces.rest;

import com.daka.serve.application.PomodoroApplicationService;
import com.daka.serve.infrastructure.realtime.RealtimePublisher;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/pomodoro")
public class PomodoroController {
    private final PomodoroApplicationService pomodoro;
    private final RealtimePublisher realtime;

    public PomodoroController(
        PomodoroApplicationService pomodoro,
        RealtimePublisher realtime
    ) {
        this.pomodoro = pomodoro;
        this.realtime = realtime;
    }

    @GetMapping("/{widgetId}")
    public PomodoroApplicationService.PomodoroView get(
        @RequestAttribute("authenticatedUserId") UUID userId,
        @PathVariable long widgetId
    ) {
        return pomodoro.get(userId, widgetId).state();
    }

    @PostMapping("/{widgetId}/start")
    public PomodoroApplicationService.PomodoroView start(
        @RequestAttribute("authenticatedUserId") UUID userId,
        @PathVariable long widgetId
    ) {
        return publish(userId, pomodoro.start(userId, widgetId));
    }

    @PostMapping("/{widgetId}/pause")
    public PomodoroApplicationService.PomodoroView pause(
        @RequestAttribute("authenticatedUserId") UUID userId,
        @PathVariable long widgetId
    ) {
        return publish(userId, pomodoro.pause(userId, widgetId));
    }

    @PostMapping("/{widgetId}/reset")
    public PomodoroApplicationService.PomodoroView reset(
        @RequestAttribute("authenticatedUserId") UUID userId,
        @PathVariable long widgetId
    ) {
        return publish(userId, pomodoro.reset(userId, widgetId));
    }

    @PostMapping("/{widgetId}/settings")
    public PomodoroApplicationService.PomodoroView settings(
        @RequestAttribute("authenticatedUserId") UUID userId,
        @PathVariable long widgetId,
        @Valid @RequestBody SettingsRequest request
    ) {
        return publish(userId, pomodoro.saveSettings(
            userId,
            widgetId,
            request.focusMinutes(),
            request.breakMinutes()
        ));
    }

    @PostMapping("/{widgetId}/notifications")
    public PomodoroApplicationService.PomodoroView notifications(
        @RequestAttribute("authenticatedUserId") UUID userId,
        @PathVariable long widgetId,
        @RequestBody NotificationRequest request
    ) {
        return publish(userId, pomodoro.setNotifications(userId, widgetId, request.enabled()));
    }

    private PomodoroApplicationService.PomodoroView publish(
        UUID userId,
        PomodoroApplicationService.PomodoroUpdate update
    ) {
        realtime.send(userId, "pomodoro.state", update);
        return update.state();
    }

    public record SettingsRequest(
        @Min(1) @Max(120) int focusMinutes,
        @Min(1) @Max(60) int breakMinutes
    ) {
    }

    public record NotificationRequest(@NotNull Boolean enabled) {
    }
}
