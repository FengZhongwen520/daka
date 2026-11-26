package com.daka.serve.infrastructure.security;

import com.daka.serve.domain.service.LookupHasher;
import com.daka.serve.infrastructure.config.DakaSecurityProperties;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.util.Base64;

@Component
public class HmacLookupHasher implements LookupHasher {
    private final SecretKeySpec key;

    public HmacLookupHasher(DakaSecurityProperties properties) {
        byte[] keyBytes;
        try {
            keyBytes = Base64.getDecoder().decode(properties.getLookupPepper());
        } catch (IllegalArgumentException exception) {
            throw new IllegalStateException("DAKA_LOOKUP_PEPPER 必须是 Base64 编码的密钥", exception);
        }
        if (keyBytes.length < 32) {
            throw new IllegalStateException("DAKA_LOOKUP_PEPPER 至少需要 32 字节");
        }
        this.key = new SecretKeySpec(keyBytes, "HmacSHA256");
    }

    @Override
    public String hash(String value) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(key);
            return Base64.getUrlEncoder().withoutPadding()
                .encodeToString(mac.doFinal(value.getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("查询索引生成失败", exception);
        }
    }
}
