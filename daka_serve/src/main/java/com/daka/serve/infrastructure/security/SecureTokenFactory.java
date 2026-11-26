package com.daka.serve.infrastructure.security;

import com.daka.serve.domain.service.TokenFactory;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;

@Component
public class SecureTokenFactory implements TokenFactory {
    private final SecureRandom random = new SecureRandom();
    private final Base64.Encoder encoder = Base64.getUrlEncoder().withoutPadding();

    @Override
    public IssuedToken create() {
        byte[] token = new byte[32];
        random.nextBytes(token);
        String raw = encoder.encodeToString(token);
        return new IssuedToken(raw, hash(raw));
    }

    @Override
    public String hash(String token) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                .digest(token.getBytes(StandardCharsets.UTF_8));
            return encoder.encodeToString(digest);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("令牌哈希算法不可用", exception);
        }
    }
}
