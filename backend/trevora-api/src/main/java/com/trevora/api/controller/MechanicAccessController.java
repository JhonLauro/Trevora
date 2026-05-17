package com.trevora.api.controller;

import com.trevora.api.dto.AccessDecisionResponse;
import com.trevora.api.dto.MechanicAccessRequestResponse;
import com.trevora.api.dto.MechanicSearchResponse;
import com.trevora.api.dto.MechanicSharedHistoryResponse;
import com.trevora.api.dto.MechanicSharedRecordDetailResponse;
import com.trevora.api.service.AccessApprovalService;
import com.trevora.api.service.MechanicAccessService;
import com.trevora.api.service.MechanicSearchService;
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
    private final MechanicAccessService mechanicAccessService;
    private final MechanicSearchService mechanicSearchService;

    public MechanicAccessController(
            AccessApprovalService accessApprovalService,
            MechanicAccessService mechanicAccessService,
            MechanicSearchService mechanicSearchService
    ) {
        this.accessApprovalService = accessApprovalService;
        this.mechanicAccessService = mechanicAccessService;
        this.mechanicSearchService = mechanicSearchService;
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
    public MechanicSharedHistoryResponse getSessionHistory(@PathVariable UUID sessionId) {
        return mechanicAccessService.getSharedHistory(sessionId);
    }

    @GetMapping("/sessions/{sessionId}/history/search")
    public MechanicSearchResponse searchSessionHistory(
            @PathVariable UUID sessionId,
            @RequestParam String query
    ) {
        return mechanicSearchService.searchSharedRecords(sessionId, query);
    }

    @GetMapping("/sessions/{sessionId}/history/{recordId}")
    public MechanicSharedRecordDetailResponse getSessionRecord(
            @PathVariable UUID sessionId,
            @PathVariable UUID recordId
    ) {
        return mechanicAccessService.getSharedRecord(sessionId, recordId);
    }
}
