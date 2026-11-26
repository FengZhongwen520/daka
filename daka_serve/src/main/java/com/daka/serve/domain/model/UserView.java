package com.daka.serve.domain.model;

import java.util.UUID;

public record UserView(
    UUID id,
    String loginId
) {
}
