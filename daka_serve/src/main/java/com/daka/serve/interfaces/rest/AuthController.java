package com.daka.serve.interfaces.rest;

import com.daka.serve.application.AuthApplicationService;
import com.daka.serve.application.EmailAccountApplicationService;
import com.daka.serve.domain.model.IssuedSession;
import com.daka.serve.domain.model.UserView;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AuthApplicationService auth;
    private final EmailAccountApplicationService emailAccounts;

    public AuthController(
        AuthApplicationService auth,
        EmailAccountApplicationService emailAccounts
    ) {
        this.auth = auth;
        this.emailAccounts = emailAccounts;
    }

    @PostMapping("/register")
    public AuthResponse register(@Valid @RequestBody AuthRequest request) {
        return AuthResponse.from(auth.register(request.loginId(), request.password()));
    }

    @PostMapping("/login")
    public AuthResponse login(@Valid @RequestBody AuthRequest request) {
        return AuthResponse.from(auth.login(request.loginId(), request.password()));
    }

    @GetMapping("/me")
    public UserResponse me(@RequestAttribute("authenticatedUserId") UUID userId) {
        UserView user = auth.currentUser(userId);
        return new UserResponse(user.id().toString(), user.loginId(), user.email());
    }

    @PostMapping("/logout")
    public void logout(@RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization) {
        auth.logout(extractBearer(authorization));
    }

    @PostMapping("/email/request")
    public EmailAccountApplicationService.MailDispatch requestEmailBinding(
        @RequestAttribute("authenticatedUserId") UUID userId,
        @Valid @RequestBody EmailRequest request
    ) {
        return emailAccounts.requestEmailBinding(userId, request.email());
    }

    @PostMapping("/email/verify")
    public EmailBindingResponse verifyEmailBinding(
        @RequestAttribute("authenticatedUserId") UUID userId,
        @Valid @RequestBody EmailVerifyRequest request
    ) {
        String email = emailAccounts.verifyEmailBinding(userId, request.email(), request.code());
        return new EmailBindingResponse(email);
    }

    @PostMapping("/password/forgot")
    public EmailAccountApplicationService.MailDispatch forgotPassword(
        @Valid @RequestBody EmailRequest request
    ) {
        return emailAccounts.requestPasswordReset(request.email());
    }

    @PostMapping("/password/reset")
    public void resetPassword(@Valid @RequestBody PasswordResetRequest request) {
        emailAccounts.resetPassword(request.email(), request.code(), request.newPassword());
    }

    private String extractBearer(String authorization) {
        if (authorization == null || !authorization.startsWith("Bearer ")) return null;
        return authorization.substring(7).trim();
    }

    public record AuthRequest(
        @NotBlank String loginId,
        @NotBlank String password
    ) {
    }

    public record EmailRequest(@NotBlank String email) {
    }

    public record EmailVerifyRequest(
        @NotBlank String email,
        @NotBlank String code
    ) {
    }

    public record PasswordResetRequest(
        @NotBlank String email,
        @NotBlank String code,
        @NotBlank String newPassword
    ) {
    }

    public record EmailBindingResponse(String email) {
    }

    public record UserResponse(String id, String loginId, String email) {
    }

    public record AuthResponse(String token, UserResponse user) {
        static AuthResponse from(IssuedSession session) {
            return new AuthResponse(
                session.token(),
                new UserResponse(
                    session.user().id().toString(),
                    session.user().loginId(),
                    session.user().email()
                )
            );
        }
    }
}
