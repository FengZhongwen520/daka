package com.daka.serve.interfaces.rest;

import com.daka.serve.application.StorageApplicationService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/storage")
public class StorageController {
    private final StorageApplicationService storage;

    public StorageController(StorageApplicationService storage) {
        this.storage = storage;
    }

    @GetMapping
    public StorageResponse list(@RequestAttribute("authenticatedUserId") UUID userId) {
        List<RecordResponse> records = storage.list(userId).stream()
            .map(RecordResponse::from)
            .toList();
        return new StorageResponse(records);
    }

    @PutMapping
    public RecordResponse save(
        @RequestAttribute("authenticatedUserId") UUID userId,
        @Valid @RequestBody SaveRequest request
    ) {
        return RecordResponse.from(storage.save(userId, request.key(), request.value()));
    }

    @DeleteMapping
    public void delete(
        @RequestAttribute("authenticatedUserId") UUID userId,
        @RequestParam String key
    ) {
        storage.delete(userId, key);
    }

    @DeleteMapping("/all")
    public void deleteAll(@RequestAttribute("authenticatedUserId") UUID userId) {
        storage.deleteAll(userId);
    }

    public record SaveRequest(
        @NotBlank String key,
        String value
    ) {
    }

    public record RecordResponse(String key, String value, Instant updatedAt) {
        static RecordResponse from(StorageApplicationService.StoredItem item) {
            return new RecordResponse(item.key(), item.value(), item.updatedAt());
        }
    }

    public record StorageResponse(List<RecordResponse> records) {
    }
}
