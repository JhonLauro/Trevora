package com.trevora.api.features.history;

import com.trevora.api.features.history.ServiceHistoryResponse;
import com.trevora.api.features.history.ServiceRecordDetailResponse;
import com.trevora.api.features.history.ServiceHistoryService;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
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

    @DeleteMapping("/{recordId}")
    public ResponseEntity<Void> deleteVehicleHistoryRecord(
            @PathVariable UUID vehicleId,
            @PathVariable UUID recordId
    ) {
        serviceHistoryService.deleteVehicleHistoryRecord(vehicleId, recordId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{recordId}/reviewed")
    public ServiceRecordDetailResponse markRecordReviewed(
            @PathVariable UUID vehicleId,
            @PathVariable UUID recordId
    ) {
        return serviceHistoryService.markRecordReviewed(vehicleId, recordId);
    }
}
