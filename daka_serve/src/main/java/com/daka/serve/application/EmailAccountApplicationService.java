package com.daka.serve.application;

import com.daka.serve.domain.exception.UnauthorizedException;
import com.daka.serve.domain.exception.ValidationException;
import com.daka.serve.domain.model.UserAccount;
import com.daka.serve.domain.model.VerificationCode;
import com.daka.serve.domain.model.VerificationPurpose;
import com.daka.serve.domain.repository.AuthSessionRepository;
import com.daka.serve.domain.repository.UserAccountRepository;
import com.daka.serve.domain.repository.VerificationCodeRepository;
import com.daka.serve.domain.service.LookupHasher;
import com.daka.serve.domain.service.MailSender;
import com.daka.serve.domain.service.PasswordProtector;
import com.daka.serve.domain.service.SecretCipher;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;

@Service
public class EmailAccountApplicationService {
    private static final Pattern EMAIL_PATTERN = Pattern.compile(
        "^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,63}$",
        Pattern.CASE_INSENSITIVE
    );
    private static final Duration RESEND_COOLDOWN = Duration.ofSeconds(60);

    private final UserAccountRepository users;
    private final AuthSessionRepository sessions;
    private final VerificationCodeRepository codes;
    private final SecretCipher cipher;
    private final LookupHasher lookupHasher;
    private final PasswordProtector passwords;
    private final MailSender mail;
    private final long codeTtlSeconds;
    private final SecureRandom random = new SecureRandom();

    public EmailAccountApplicationService(
        UserAccountRepository users,
        AuthSessionRepository sessions,
        VerificationCodeRepository codes,
        SecretCipher cipher,
        LookupHasher lookupHasher,
        PasswordProtector passwords,
        MailSender mail,
        @Value("${daka.mail.code-ttl-seconds:600}") long codeTtlSeconds
    ) {
        this.users = users;
        this.sessions = sessions;
        this.codes = codes;
        this.cipher = cipher;
        this.lookupHasher = lookupHasher;
        this.passwords = passwords;
        this.mail = mail;
        this.codeTtlSeconds = Math.max(120, codeTtlSeconds);
    }

    @Transactional
    public MailDispatch requestEmailBinding(UUID userId, String rawEmail) {
        String email = normalizeEmail(rawEmail);
        UserAccount user = users.findById(userId).orElseThrow(UnauthorizedException::new);
        String emailLookup = lookupHasher.hash(email);
        users.findByEmailLookup(emailLookup)
            .filter(existing -> !existing.id().equals(userId))
            .ifPresent(existing -> {
                throw new ValidationException("该邮箱已绑定其他账号");
            });
        createAndSendCode(user, email, emailLookup, VerificationPurpose.BIND_EMAIL);
        return new MailDispatch(true, codeTtlSeconds, maskEmail(email));
    }

    @Transactional
    public String verifyEmailBinding(UUID userId, String rawEmail, String code) {
        String email = normalizeEmail(rawEmail);
        String emailLookup = lookupHasher.hash(email);
        UserAccount user = users.findById(userId).orElseThrow(UnauthorizedException::new);
        verifyCode(VerificationPurpose.BIND_EMAIL, emailLookup, code, userId);

        UserAccount updated = new UserAccount(
            user.id(),
            user.loginLookup(),
            user.encryptedLogin(),
            user.passwordHash(),
            cipher.encrypt(email),
            emailLookup,
            Instant.now(),
            user.createdAt()
        );
        users.save(updated);
        return email;
    }

    @Transactional
    public MailDispatch requestPasswordReset(String rawEmail) {
        if (!mail.isConfigured()) {
            throw new ValidationException("邮箱服务尚未配置，请联系管理员");
        }
        String email = normalizeEmail(rawEmail);
        users.findByEmailLookup(lookupHasher.hash(email)).ifPresent(user -> {
            try {
                createAndSendCode(
                    user,
                    email,
                    lookupHasher.hash(email),
                    VerificationPurpose.RESET_PASSWORD
                );
            } catch (RuntimeException ignored) {
                // Keep password-recovery responses identical regardless of account or mail state.
            }
        });
        return new MailDispatch(true, codeTtlSeconds, maskEmail(email));
    }

    @Transactional
    public void resetPassword(String rawEmail, String code, String newPassword) {
        String email = normalizeEmail(rawEmail);
        if (newPassword == null || newPassword.length() < 8 || newPassword.length() > 128) {
            throw new ValidationException("密码长度需为 8-128 个字符");
        }
        String emailLookup = lookupHasher.hash(email);
        UserAccount user = users.findByEmailLookup(emailLookup)
            .orElseThrow(() -> new ValidationException("验证码错误或已过期"));
        verifyCode(VerificationPurpose.RESET_PASSWORD, emailLookup, code, user.id());

        UserAccount updated = new UserAccount(
            user.id(),
            user.loginLookup(),
            user.encryptedLogin(),
            passwords.hash(newPassword),
            user.encryptedEmail(),
            user.emailLookup(),
            user.emailVerifiedAt(),
            user.createdAt()
        );
        users.save(updated);
        sessions.deleteByUserId(user.id());
    }

    private void createAndSendCode(
        UserAccount user,
        String email,
        String emailLookup,
        VerificationPurpose purpose
    ) {
        Instant now = Instant.now();
        codes.findLatest(purpose, emailLookup).ifPresent(previous -> {
            if (Duration.between(previous.createdAt(), now).compareTo(RESEND_COOLDOWN) < 0) {
                throw new ValidationException("验证码发送过于频繁，请稍后再试");
            }
        });

        String rawCode = String.format(Locale.ROOT, "%06d", random.nextInt(1_000_000));
        VerificationCode verification = new VerificationCode(
            UUID.randomUUID(),
            purpose,
            emailLookup,
            codeHash(purpose, emailLookup, rawCode),
            user.id(),
            0,
            now,
            now.plusSeconds(codeTtlSeconds),
            null
        );
        codes.save(verification);
        mail.sendVerificationCode(email, purpose, rawCode, codeTtlSeconds);
    }

    private void verifyCode(
        VerificationPurpose purpose,
        String emailLookup,
        String rawCode,
        UUID expectedUserId
    ) {
        if (rawCode == null || !rawCode.matches("\\d{6}")) {
            throw new ValidationException("请输入 6 位验证码");
        }
        Instant now = Instant.now();
        VerificationCode verification = codes.findLatest(purpose, emailLookup)
            .orElseThrow(() -> new ValidationException("验证码错误或已过期"));
        if (!verification.userId().equals(expectedUserId) || !verification.usable(now)) {
            throw new ValidationException("验证码错误或已过期");
        }

        String actualHash = codeHash(purpose, emailLookup, rawCode);
        if (!MessageDigest.isEqual(
            verification.codeHash().getBytes(java.nio.charset.StandardCharsets.UTF_8),
            actualHash.getBytes(java.nio.charset.StandardCharsets.UTF_8)
        )) {
            codes.save(new VerificationCode(
                verification.id(),
                verification.purpose(),
                verification.targetHash(),
                verification.codeHash(),
                verification.userId(),
                verification.attempts() + 1,
                verification.createdAt(),
                verification.expiresAt(),
                verification.consumedAt()
            ));
            throw new ValidationException("验证码错误或已过期");
        }

        codes.save(new VerificationCode(
            verification.id(),
            verification.purpose(),
            verification.targetHash(),
            verification.codeHash(),
            verification.userId(),
            verification.attempts(),
            verification.createdAt(),
            verification.expiresAt(),
            now
        ));
    }

    private String codeHash(VerificationPurpose purpose, String emailLookup, String code) {
        return lookupHasher.hash(purpose.name() + ":" + emailLookup + ":" + code);
    }

    private String normalizeEmail(String rawEmail) {
        if (rawEmail == null) throw new ValidationException("请输入邮箱");
        String email = rawEmail.trim().toLowerCase(Locale.ROOT);
        if (email.length() > 254 || !EMAIL_PATTERN.matcher(email).matches()) {
            throw new ValidationException("邮箱格式不正确");
        }
        return email;
    }

    private String maskEmail(String email) {
        int at = email.indexOf('@');
        String name = email.substring(0, at);
        String domain = email.substring(at);
        String masked = name.length() <= 2
            ? name.substring(0, 1) + "*"
            : name.substring(0, 2) + "***";
        return masked + domain;
    }

    public record MailDispatch(boolean accepted, long expiresInSeconds, String maskedEmail) {
    }
}
