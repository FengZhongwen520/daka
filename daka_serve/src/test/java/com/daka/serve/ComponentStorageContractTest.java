package com.daka.serve;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class ComponentStorageContractTest {
    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JdbcTemplate jdbc;

    @Test
    void everyWidgetPayloadRoundTripsThroughTheEncryptedStore() throws Exception {
        String token = register();
        Map<String, String> samples = componentSamples();
        assertThat(samples).hasSize(19);

        int sequence = 0;
        for (Map.Entry<String, String> sample : samples.entrySet()) {
            String value = "{\"private-marker\":\"nested-secret-" + sequence++ + "\",\"data\":" + sample.getValue() + "}";
            mockMvc.perform(put("/api/storage")
                    .header("Authorization", "Bearer " + token)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsString(Map.of("key", sample.getKey(), "value", value))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.key").value(sample.getKey()));
        }

        MvcResult result = mockMvc.perform(get("/api/storage")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andReturn();
        JsonNode records = objectMapper.readTree(result.getResponse().getContentAsString()).path("records");
        Map<String, String> restored = new LinkedHashMap<>();
        records.forEach(record -> restored.put(record.path("key").asText(), record.path("value").asText()));

        assertThat(restored).containsOnlyKeys(samples.keySet());
        for (String key : samples.keySet()) {
            assertThat(restored.get(key)).contains("nested-secret-");
        }

        List<String> encryptedValues = jdbc.queryForList(
            "select encrypted_value from storage_record",
            String.class
        );
        assertThat(encryptedValues).isNotEmpty();
        assertThat(encryptedValues).allSatisfy(value -> {
            assertThat(value).doesNotContain("nested-secret-");
            assertThat(value).startsWith("v1.");
        });
    }

    @Test
    void accountsAreIsolatedAndLogoutInvalidatesTheSession() throws Exception {
        String first = register();
        String second = register();

        mockMvc.perform(put("/api/storage")
                .header("Authorization", "Bearer " + first)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of(
                    "key", "sticky-text-9",
                    "value", "{\"text\":\"only-first-user\"}"
                ))))
            .andExpect(status().isOk());

        MvcResult secondList = mockMvc.perform(get("/api/storage")
                .header("Authorization", "Bearer " + second))
            .andExpect(status().isOk())
            .andReturn();
        assertThat(secondList.getResponse().getContentAsString()).doesNotContain("only-first-user");

        mockMvc.perform(post("/api/auth/logout")
                .header("Authorization", "Bearer " + first))
            .andExpect(status().isOk());
        mockMvc.perform(get("/api/storage")
                .header("Authorization", "Bearer " + first))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void deletingOneRecordAndClearingAllOnlyAffectsTheCurrentUser() throws Exception {
        String token = register();
        saveRecord(token, "todo-1-items", "{\"items\":[{\"id\":1,\"text\":\"keep\"}]}");
        saveRecord(token, "water-2026-11-26-1", "{\"total\":250}");

        mockMvc.perform(delete("/api/storage")
                .param("key", "water-2026-11-26-1")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk());
        mockMvc.perform(get("/api/storage")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.records.length()").value(1))
            .andExpect(jsonPath("$.records[0].key").value("todo-1-items"));

        mockMvc.perform(delete("/api/storage/all")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk());
        mockMvc.perform(get("/api/storage")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.records.length()").value(0));
    }

    @Test
    void passwordAndAccountIdentifiersAreNotStoredAsPlainText() throws Exception {
        String loginId = "privacy-" + UUID.randomUUID();
        register(loginId, "VerySecretPassword123!");

        Map<String, Object> row = jdbc.queryForMap(
            "select encrypted_login, password_hash from user_account where login_lookup = (select login_lookup from user_account order by created_at desc limit 1)"
        );
        assertThat(row.get("encrypted_login").toString()).doesNotContain(loginId);
        assertThat(row.get("encrypted_login").toString()).startsWith("v1.");
        assertThat(row.get("password_hash").toString()).startsWith("pbkdf2-sha256$");
        assertThat(row.get("password_hash").toString()).doesNotContain("VerySecretPassword123!");
    }

    private String register() throws Exception {
        return register("user-" + UUID.randomUUID(), "CloudPassword123!");
    }

    private String register(String loginId, String password) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of(
                    "loginId", loginId,
                    "password", password
                ))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.user.loginId").value(loginId))
            .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).path("token").asText();
    }

    private void saveRecord(String token, String key, String value) throws Exception {
        mockMvc.perform(put("/api/storage")
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("key", key, "value", value))))
            .andExpect(status().isOk());
    }

    private Map<String, String> componentSamples() {
        Map<String, String> samples = new LinkedHashMap<>();
        samples.put("bookmarks-sites-1-custom", "[{\"id\":1,\"url\":\"https://example.com\",\"title\":\"Example\"}]");
        samples.put("bookmarks-sites-1-imported", "[{\"id\":2,\"url\":\"https://imported.example\",\"title\":\"Imported\"}]");
        samples.put("daka-weather-cache-v5", "{\"temp\":28,\"code\":2,\"humidity\":60,\"location\":\"深圳\"}");
        samples.put("news-config-1", "{\"tabs\":[{\"id\":\"ai\",\"name\":\"AI\"}],\"activeTabId\":\"ai\"}");
        samples.put("clock-mode", "analog");
        samples.put("cal-checkins-1", "[\"2026-11-26\",\"2026-11-25\"]");
        samples.put("cal-events-1", "{\"2026-11-26\":[{\"id\":1,\"text\":\"完成契约测试\",\"done\":false}]}");
        samples.put("pomodoro-state-1", "{\"remaining\":1500,\"running\":false,\"mode\":\"focus\"}");
        samples.put("domain:memos", "[{\"id\":1,\"memoKey\":\"memo-1\",\"text\":\"便签内容\",\"bgColor\":\"#fff385\"}]");
        samples.put("sticky-text-1", "{\"text\":\"便利贴内容\"}");
        samples.put("todo-1-items", "[{\"id\":1,\"text\":\"待办事项\",\"status\":\"doing\"}]");
        samples.put("domain:diary-entries", "[{\"id\":1,\"widgetId\":1,\"date\":\"2026-11-26\",\"title\":\"私密日记\",\"content\":\"正文\"}]");
        samples.put("calc-pos-1", "{\"x\":500,\"y\":100}");
        samples.put("se-1-history", "[{\"query\":\"daka\",\"engine\":\"bing\",\"time\":1760000000000}]");
        samples.put("tr-1-title", "\"中文翻译\"");
        samples.put("water-2026-11-26-1", "{\"total\":750,\"lastDrink\":1760000000000,\"lastNotify\":0}");
        samples.put("whitenoise-pos-1", "{\"x\":20,\"y\":300}");
        samples.put("domain:photos", "[{\"id\":1,\"position\":\"photo-1\",\"dataUrl\":\"data:image/png;base64,AA==\"}]");
        samples.put("fan-state-1", "{\"powered\":true,\"speed\":2}");
        return samples;
    }
}
