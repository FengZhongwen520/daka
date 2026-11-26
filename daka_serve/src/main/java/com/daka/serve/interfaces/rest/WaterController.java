package com.daka.serve.interfaces.rest;

import com.daka.serve.application.WaterApplicationService;
import com.daka.serve.infrastructure.realtime.RealtimePublisher;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/water")
public class WaterController {
    private final WaterApplicationService water;
    private final RealtimePublisher realtime;

    public WaterController(WaterApplicationService water, RealtimePublisher realtime) {
        this.water = water;
        this.realtime = realtime;
    }

    @GetMapping("/{widgetId}")
    public WaterApplicationService.WaterView get(
        @RequestAttribute("authenticatedUserId") UUID userId,
        @PathVariable long widgetId,
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date
    ) {
        return water.get(userId, widgetId, date);
    }

    @GetMapping("/{widgetId}/history")
    public List<WaterApplicationService.WaterView> history(
        @RequestAttribute("authenticatedUserId") UUID userId,
        @PathVariable long widgetId,
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to
    ) {
        return water.history(userId, widgetId, from, to);
    }

    @PostMapping("/{widgetId}/drink")
    public WaterApplicationService.WaterView drink(
        @RequestAttribute("authenticatedUserId") UUID userId,
        @PathVariable long widgetId,
        @Valid @RequestBody DrinkRequest request
    ) {
        WaterApplicationService.WaterView state = water.drink(
            userId,
            widgetId,
            request.date(),
            request.amountMl()
        );
        realtime.send(userId, "water.state", state);
        return state;
    }

    public record DrinkRequest(
        @NotNull @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
        @Min(1) @Max(2000) int amountMl
    ) {
    }
}
