package com.daka.serve.interfaces.rest;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/serve/health")
public class HealthController {
    @GetMapping
    public HealthResponse health() {
        return new HealthResponse("ok", "daka_serve");
    }

    public record HealthResponse(String status, String service) {
    }
}
