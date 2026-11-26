package com.daka.serve.domain.model;

public record IssuedSession(
    String token,
    UserView user
) {
}
