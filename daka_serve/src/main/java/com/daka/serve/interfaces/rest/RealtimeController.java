package com.daka.serve.interfaces.rest;

import com.daka.serve.infrastructure.realtime.RealtimeTicketService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/realtime")
public class RealtimeController {
    private final RealtimeTicketService tickets;

    public RealtimeController(RealtimeTicketService tickets) {
        this.tickets = tickets;
    }

    @PostMapping("/ticket")
    public RealtimeTicketService.IssuedTicket ticket(
        @RequestAttribute("authenticatedUserId") UUID userId
    ) {
        return tickets.issue(userId);
    }
}
