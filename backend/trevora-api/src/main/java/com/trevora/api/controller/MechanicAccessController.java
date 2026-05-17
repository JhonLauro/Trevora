package com.trevora.api.controller;

import com.trevora.api.dto.AccessDecisionResponse;
import com.trevora.api.dto.MechanicAccessRequestResponse;
import com.trevora.api.dto.ServiceHistoryResponse;
import com.trevora.api.service.AccessApprovalService;
import com.trevora.api.service.ServiceHistoryService;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/mechanic-access")
public class MechanicAccessController {
    private final AccessApprovalService accessApprovalService;
    private final ServiceHistoryService serviceHistoryService;

    public MechanicAccessController(AccessApprovalService accessApprovalService, ServiceHistoryService serviceHistoryService) {
        this.accessApprovalService = accessApprovalService;
        this.serviceHistoryService = serviceHistoryService;
    }

    @GetMapping("/requests/pending")
    public List<MechanicAccessRequestResponse> getPendingRequests() {
        return accessApprovalService.getOwnerAccessRequests(AccessApprovalService.REQUEST_PENDING);
    }

    @GetMapping("/requests")
    public List<MechanicAccessRequestResponse> getRequests(@RequestParam(required = false) String status) {
        return accessApprovalService.getOwnerAccessRequests(status);
    }

    @PostMapping("/requests/{requestId}/approve")
    public AccessDecisionResponse approveRequest(@PathVariable UUID requestId) {
        return accessApprovalService.approveRequest(requestId);
    }

    @PostMapping("/requests/{requestId}/deny")
    public AccessDecisionResponse denyRequest(@PathVariable UUID requestId) {
        return accessApprovalService.denyRequest(requestId);
    }

    @GetMapping("/sessions/{sessionId}/history")
    public ServiceHistoryResponse getSessionHistory(@PathVariable UUID sessionId) {
        return serviceHistoryService.getMechanicSessionHistory(sessionId);
    }
}
