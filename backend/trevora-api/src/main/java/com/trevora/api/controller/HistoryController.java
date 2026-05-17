package com.trevora.api.controller;

import com.trevora.api.dto.ServiceHistoryResponse;
import com.trevora.api.dto.ServiceRecordDetailResponse;
import com.trevora.api.service.ServiceHistoryService;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/vehicles/{vehicleId}/history")
public class HistoryController {
    private final ServiceHistoryService serviceHistoryService;

    public HistoryController(ServiceHistoryService serviceHistoryService) {
        this.serviceHistoryService = serviceHistoryService;
    }

    @GetMapping
    public ServiceHistoryResponse getVehicleHistory(
            @PathVariable UUID vehicleId,
            @RequestParam(required = false) String sort,
            @RequestParam(required = false) String serviceType,
            @RequestParam(required = false) String keyword
    ) {
        return serviceHistoryService.getVehicleHistory(vehicleId, sort, serviceType, keyword);
    }

    @GetMapping("/{recordId}")
    public ServiceRecordDetailResponse getVehicleHistoryRecord(
            @PathVariable UUID vehicleId,
            @PathVariable UUID recordId
    ) {
        return serviceHistoryService.getVehicleHistoryRecord(vehicleId, recordId);
    }
}
