package com.daka.serve.domain.service;

public interface PasswordProtector {
    String hash(String password);

    boolean matches(String password, String encodedHash);
}
