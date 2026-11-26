package com.daka.serve.infrastructure.realtime;

import com.daka.serve.application.PomodoroApplicationService;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.concurrent.atomic.AtomicLong;

@Component
public class PomodoroRealtimeScheduler {
    private final PomodoroApplicationService pomodoro;
    private final RealtimePublisher publisher;
    private final AtomicLong ticks = new AtomicLong();

    public PomodoroRealtimeScheduler(
        PomodoroApplicationService pomodoro,
        RealtimePublisher publisher
    ) {
        this.pomodoro = pomodoro;
        this.publisher = publisher;
    }

    @Scheduled(fixedDelay = 1_000)
    public void processCountdowns() {
        long tick = ticks.incrementAndGet();
        boolean heartbeat = tick % 5 == 0;
        for (PomodoroApplicationService.PomodoroUpdate update :
            pomodoro.processTicks(Instant.now(), heartbeat)) {
            publisher.send(
                update.ownerId(),
                "pomodoro.state",
                update
            );
        }
    }
}
