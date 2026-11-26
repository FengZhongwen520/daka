package com.daka.serve;

import com.daka.serve.application.PomodoroApplicationService;
import com.daka.serve.domain.model.PomodoroSession;
import com.daka.serve.domain.repository.PomodoroSessionRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class CloudExclusiveFeaturesTest {
    @LocalServerPort
    private int port;

    @Autowired
    private TestRestTemplate rest;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private PomodoroApplicationService pomodoro;

    @Autowired
    private PomodoroSessionRepository pomodoroSessions;

    @Autowired
    private JdbcTemplate jdbc;

    @Test
    void pomodoroAndWaterUseServerStateAndRealtimeWebSocket() throws Exception {
        SessionData session = register();
        String token = session.token();

        String ticket = ticket(token);
        CountDownLatch connected = new CountDownLatch(1);
        CountDownLatch firstTimerPushed = new CountDownLatch(1);
        CountDownLatch periodicTimerPushed = new CountDownLatch(1);
        AtomicInteger timerEvents = new AtomicInteger();
        StandardWebSocketClient client = new StandardWebSocketClient();
        WebSocketSession[] socketRef = new WebSocketSession[1];
        client.execute(new TextWebSocketHandler() {
            @Override
            public void afterConnectionEstablished(WebSocketSession session) {
                socketRef[0] = session;
                connected.countDown();
            }

            @Override
            protected void handleTextMessage(WebSocketSession session, TextMessage message) {
                if (message.getPayload().contains("\"pomodoro.state\"")) {
                    int count = timerEvents.incrementAndGet();
                    if (count >= 1) firstTimerPushed.countDown();
                    if (count >= 2) periodicTimerPushed.countDown();
                }
            }
        }, "ws://127.0.0.1:" + port + "/ws/realtime?ticket=" + ticket).get(5, TimeUnit.SECONDS);

        assertThat(connected.await(3, TimeUnit.SECONDS)).isTrue();

        JsonNode started = request(token, HttpMethod.POST, "/api/pomodoro/7/start", Map.of());
        assertThat(started.path("running").asBoolean()).isTrue();
        assertThat(started.path("mode").asText()).isEqualTo("focus");
        assertThat(firstTimerPushed.await(5, TimeUnit.SECONDS)).isTrue();
        assertThat(periodicTimerPushed.await(7, TimeUnit.SECONDS)).isTrue();

        JsonNode paused = request(token, HttpMethod.POST, "/api/pomodoro/7/pause", Map.of());
        assertThat(paused.path("running").asBoolean()).isFalse();
        assertThat(paused.path("remainingSeconds").asInt()).isBetween(1490, 1500);

        PomodoroSession active = pomodoroSessions.findByOwnerAndWidget(session.userId(), 7).orElseThrow();
        pomodoroSessions.save(new PomodoroSession(
            active.id(), active.ownerId(), active.widgetId(), active.mode(), true,
            active.focusMinutes(), active.breakMinutes(), active.remainingSeconds(),
            Instant.now().minusSeconds(1), active.notificationsEnabled(), Instant.now()
        ));
        var completed = pomodoro.processTicks(Instant.now(), true);
        assertThat(completed).anySatisfy(update -> {
            assertThat(update.completed()).isTrue();
            assertThat(update.state().mode()).isEqualTo("break");
            assertThat(update.state().running()).isFalse();
        });

        JsonNode water = request(token, HttpMethod.POST, "/api/water/8/drink", Map.of(
            "date", "2026-11-26",
            "amountMl", 250
        ));
        assertThat(water.path("totalMl").asInt()).isEqualTo(250);
        JsonNode secondDrink = request(token, HttpMethod.POST, "/api/water/8/drink", Map.of(
            "date", "2026-11-26",
            "amountMl", 250
        ));
        assertThat(secondDrink.path("totalMl").asInt()).isEqualTo(500);

        JsonNode history = request(
            token,
            HttpMethod.GET,
            "/api/water/8/history?from=2026-11-01&to=2026-11-30",
            null
        );
        assertThat(history.isArray()).isTrue();
        assertThat(history.size()).isEqualTo(1);
        assertThat(history.get(0).path("totalMl").asInt()).isEqualTo(500);

        assertThat(jdbc.queryForList(
            "select encrypted_state from pomodoro_session",
            String.class
        )).allSatisfy(value -> {
            assertThat(value).startsWith("v1.");
            assertThat(value).doesNotContain("focus");
        });
        assertThat(jdbc.queryForList(
            "select encrypted_state from water_record",
            String.class
        )).isNotEmpty().allSatisfy(value -> assertThat(value).startsWith("v1."));

        socketRef[0].close(CloseStatus.NORMAL);
    }

    private String ticket(String token) throws Exception {
        JsonNode response = request(token, HttpMethod.POST, "/api/realtime/ticket", Map.of());
        assertThat(response.path("expiresInSeconds").asLong()).isEqualTo(30);
        return response.path("ticket").asText();
    }

    private SessionData register() throws Exception {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        String loginId = "exclusive-" + UUID.randomUUID();
        var response = rest.exchange(
            "/api/auth/register",
            HttpMethod.POST,
            new HttpEntity<>(Map.of("loginId", loginId, "password", "CloudPassword123!"), headers),
            String.class
        );
        JsonNode body = objectMapper.readTree(response.getBody());
        return new SessionData(
            body.path("token").asText(),
            UUID.fromString(body.path("user").path("id").asText())
        );
    }

    private JsonNode request(String token, HttpMethod method, String path, Map<String, ?> body)
        throws Exception {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        if (body != null) headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<?> entity = new HttpEntity<>(body, headers);
        var response = rest.exchange(path, method, entity, String.class);
        assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
        return objectMapper.readTree(response.getBody());
    }

    private record SessionData(String token, UUID userId) {
    }
}
