package com.daka.serve.domain.service;

public interface TokenFactory {
    IssuedToken create();

    String hash(String token);

    record IssuedToken(String raw, String hash) {
    }
}
