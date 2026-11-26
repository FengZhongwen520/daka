package com.daka.serve;

import com.daka.serve.domain.model.VerificationPurpose;
import com.daka.serve.domain.service.MailSender;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class EmailRecoveryTest {
    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JdbcTemplate jdbc;

    @MockBean
    private MailSender mailSender;

    @Test
    void bindsEmailAndResetsPasswordWithOneTimeCodes() throws Exception {
        when(mailSender.isConfigured()).thenReturn(true);
        String loginId = "email-" + UUID.randomUUID();
        String email = loginId + "@example.com";
        String oldPassword = "OldPassword123!";
        String newPassword = "NewPassword456!";
        JsonNode registration = postJson(
            "/api/auth/register",
            Map.of("loginId", loginId, "password", oldPassword),
            null
        );
        String token = registration.path("token").asText();

        postJson("/api/auth/email/request", Map.of("email", email), token);
        ArgumentCaptor<String> bindCode = ArgumentCaptor.forClass(String.class);
        verify(mailSender).sendVerificationCode(
            eq(email),
            eq(VerificationPurpose.BIND_EMAIL),
            bindCode.capture(),
            eq(600L)
        );

        postJson(
            "/api/auth/email/verify",
            Map.of("email", email, "code", bindCode.getValue()),
            token
        );
        String encryptedEmail = jdbc.queryForObject(
            "select encrypted_email from user_account order by created_at desc limit 1",
            String.class
        );
        assertThat(encryptedEmail).startsWith("v1.").doesNotContain(email);
        mockMvc.perform(get("/api/auth/me")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.email").value(email));

        clearInvocations(mailSender);
        postJson("/api/auth/password/forgot", Map.of("email", email), null);
        ArgumentCaptor<String> resetCode = ArgumentCaptor.forClass(String.class);
        verify(mailSender).sendVerificationCode(
            eq(email),
            eq(VerificationPurpose.RESET_PASSWORD),
            resetCode.capture(),
            eq(600L)
        );
        String storedCodeHash = jdbc.queryForObject(
            "select code_hash from verification_code where purpose = 'RESET_PASSWORD' order by created_at desc limit 1",
            String.class
        );
        assertThat(storedCodeHash).doesNotContain(resetCode.getValue());

        postJson(
            "/api/auth/password/reset",
            Map.of("email", email, "code", resetCode.getValue(), "newPassword", newPassword),
            null
        );

        mockMvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of(
                    "loginId", loginId,
                    "password", oldPassword
                ))))
            .andExpect(status().isUnauthorized());

        mockMvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of(
                    "loginId", loginId,
                    "password", newPassword
                ))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.user.email").value(email));
    }

    private JsonNode postJson(String path, Map<String, ?> body, String token) throws Exception {
        var request = post(path)
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(body));
        if (token != null) request.header("Authorization", "Bearer " + token);
        String response = mockMvc.perform(request)
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();
        return response.isBlank() ? objectMapper.createObjectNode() : objectMapper.readTree(response);
    }
}
