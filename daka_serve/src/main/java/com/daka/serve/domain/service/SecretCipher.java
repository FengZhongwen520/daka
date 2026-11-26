package com.daka.serve.domain.service;

public interface SecretCipher {
    String encrypt(String plaintext);

    String decrypt(String ciphertext);
}
