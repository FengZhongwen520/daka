package com.daka.serve.application;

import com.daka.serve.domain.exception.AccountAlreadyExistsException;
import com.daka.serve.domain.exception.InvalidCredentialsException;
import com.daka.serve.domain.exception.UnauthorizedException;
import com.daka.serve.domain.exception.ValidationException;
import com.daka.serve.domain.model.AuthSession;
import com.daka.serve.domain.model.IssuedSession;
import com.daka.serve.domain.model.UserAccount;
import com.daka.serve.domain.model.UserView;
import com.daka.serve.domain.repository.AuthSessionRepository;
import com.daka.serve.domain.repository.UserAccountRepository;
import com.daka.serve.domain.service.LookupHasher;
import com.daka.serve.domain.service.PasswordProtector;
import com.daka.serve.domain.service.SecretCipher;
import com.daka.serve.domain.service.TokenFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;

@Service
public class AuthApplicationService {
    private final UserAccountRepository users;
    private final AuthSessionRepository sessions;
    private final PasswordProtector passwords;
    private final SecretCipher cipher;
    private final LookupHasher lookupHasher;
    private final TokenFactory tokens;
    private final Duration sessionLifetime;

    public AuthApplicationService(
        UserAccountRepository users,
        AuthSessionRepository sessions,
        PasswordProtector passwords,
        SecretCipher cipher,
        LookupHasher lookupHasher,
        TokenFactory tokens,
        @Value("${daka.security.session-days:30}") long sessionDays
    ) {
        this.users = users;
        this.sessions = sessions;
        this.passwords = passwords;
        this.cipher = cipher;
        this.lookupHasher = lookupHasher;
        this.tokens = tokens;
        this.sessionLifetime = Duration.ofDays(Math.max(1, sessionDays));
    }

    @Transactional
    public IssuedSession register(String loginId, String password) {
        String normalized = validateAndNormalize(loginId, password);
        String lookup = lookupHasher.hash(normalized);
        if (users.findByLoginLookup(lookup).isPresent()) {
            throw new AccountAlreadyExistsException();
        }

        Instant now = Instant.now();
        UserAccount user = new UserAccount(
            UUID.randomUUID(),
            lookup,
            cipher.encrypt(normalized),
            passwords.hash(password),
            null,
            null,
            null,
            now
        );
        UserAccount saved = users.save(user);
        return issueSession(saved, now);
    }

    @Transactional
    public IssuedSession login(String loginId, String password) {
        String normalized = normalizeLogin(loginId);
        UserAccount user = users.findByLoginLookup(lookupHasher.hash(normalized))
            .orElseThrow(InvalidCredentialsException::new);
        if (!passwords.matches(password == null ? "" : password, user.passwordHash())) {
            throw new InvalidCredentialsException();
        }
        return issueSession(user, Instant.now());
    }

    @Transactional
    public UUID authenticate(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            throw new UnauthorizedException();
        }
        String tokenHash = tokens.hash(rawToken);
        AuthSession session = sessions.findByTokenHash(tokenHash)
            .orElseThrow(UnauthorizedException::new);
        if (session.isExpired(Instant.now())) {
            sessions.deleteByTokenHash(tokenHash);
            throw new UnauthorizedException();
        }
        return session.userId();
    }

    @Transactional(readOnly = true)
    public UserView currentUser(UUID userId) {
        UserAccount user = users.findById(userId).orElseThrow(UnauthorizedException::new);
        return toView(user);
    }

    @Transactional
    public void logout(String rawToken) {
        if (rawToken != null && !rawToken.isBlank()) {
            sessions.deleteByTokenHash(tokens.hash(rawToken));
        }
    }

    private IssuedSession issueSession(UserAccount user, Instant now) {
        sessions.deleteExpired(now);
        TokenFactory.IssuedToken token = tokens.create();
        sessions.save(new AuthSession(
            token.hash(),
            user.id(),
            now,
            now.plus(sessionLifetime)
        ));
        return new IssuedSession(
            token.raw(),
            toView(user)
        );
    }

    private String validateAndNormalize(String loginId, String password) {
        String normalized = normalizeLogin(loginId);
        if (normalized.length() < 3 || normalized.length() > 64) {
            throw new ValidationException("账号长度需为 3-64 个字符");
        }
        if (password == null || password.length() < 8 || password.length() > 128) {
            throw new ValidationException("密码长度需为 8-128 个字符");
        }
        return normalized;
    }

    private String normalizeLogin(String loginId) {
        if (loginId == null || loginId.isBlank()) {
            throw new ValidationException("请输入账号");
        }
        return loginId.trim().toLowerCase(Locale.ROOT);
    }

    private UserView toView(UserAccount user) {
        return new UserView(
            user.id(),
            cipher.decrypt(user.encryptedLogin()),
            user.encryptedEmail() == null ? null : cipher.decrypt(user.encryptedEmail())
        );
    }
}
