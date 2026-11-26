package com.daka.serve.infrastructure.security;

import com.daka.serve.domain.service.SecretCipher;
import com.daka.serve.infrastructure.config.DakaSecurityProperties;
import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Base64;

@Component
public class AesGcmSecretCipher implements SecretCipher {
    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;
    private static final Base64.Encoder ENCODER = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder DECODER = Base64.getUrlDecoder();

    private final SecretKeySpec key;
    private final SecureRandom random = new SecureRandom();

    public AesGcmSecretCipher(DakaSecurityProperties properties) {
        byte[] keyBytes;
        try {
            keyBytes = Base64.getDecoder().decode(properties.getEncryptionKey());
        } catch (IllegalArgumentException exception) {
            throw new IllegalStateException("DAKA_ENCRYPTION_KEY 必须是 Base64 编码的 32 字节密钥", exception);
        }
        if (keyBytes.length != 32) {
            throw new IllegalStateException("DAKA_ENCRYPTION_KEY 必须是 32 字节 AES-256 密钥");
        }
        this.key = new SecretKeySpec(keyBytes, "AES");
    }

    @Override
    public String encrypt(String plaintext) {
        try {
            byte[] iv = new byte[IV_BYTES];
            random.nextBytes(iv);
            Cipher encryptor = Cipher.getInstance("AES/GCM/NoPadding");
            encryptor.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            byte[] encrypted = encryptor.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
            return "v1." + ENCODER.encodeToString(iv) + "." + ENCODER.encodeToString(encrypted);
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("敏感数据加密失败", exception);
        }
    }

    @Override
    public String decrypt(String ciphertext) {
        try {
            String[] parts = ciphertext.split("\\.", 3);
            if (parts.length != 3 || !"v1".equals(parts[0])) {
                throw new IllegalArgumentException("Unsupported encrypted payload");
            }
            byte[] iv = DECODER.decode(parts[1]);
            byte[] encrypted = DECODER.decode(parts[2]);
            Cipher decryptor = Cipher.getInstance("AES/GCM/NoPadding");
            decryptor.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            return new String(decryptor.doFinal(encrypted), StandardCharsets.UTF_8);
        } catch (GeneralSecurityException | IllegalArgumentException exception) {
            throw new IllegalStateException("敏感数据解密失败", exception);
        }
    }
}
