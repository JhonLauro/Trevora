package com.trevora.api.features.history;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The garage screen's single read.
 *
 * <p>Separate from {@link HistoryController} because that one is mounted under
 * a vehicle (`/api/vehicles/{vehicleId}/history`) and this is deliberately not
 * about one vehicle.
 */
@RestController
@RequestMapping("/api/garage")
public class GarageController {
    private final ServiceHistoryService serviceHistoryService;

    public GarageController(ServiceHistoryService serviceHistoryService) {
        this.serviceHistoryService = serviceHistoryService;
    }

    @GetMapping
    public GarageSummaryResponse summary() {
        return serviceHistoryService.getGarageSummary();
    }
}
