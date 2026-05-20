package com.trevora.api.features.sharing;

import com.trevora.api.features.sharing.CreateMechanicAccessRequest;
import com.trevora.api.features.sharing.CreateQRAccessRequest;
import com.trevora.api.features.sharing.MechanicAccessRequestResponse;
import com.trevora.api.features.sharing.PublicMechanicRequestStatusResponse;
import com.trevora.api.features.sharing.PublicQRAccessRequestResponse;
import com.trevora.api.features.sharing.QRAccessRequestResponse;
import com.trevora.api.features.sharing.QRAccessService;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/qr-access")
public class QRAccessController {
    private final QRAccessService qrAccessService;

    public QRAccessController(QRAccessService qrAccessService) {
        this.qrAccessService = qrAccessService;
    }

    @PostMapping("/requests")
    public QRAccessRequestResponse createAccessRequest(@RequestBody CreateQRAccessRequest request) {
        return qrAccessService.createAccessRequest(request);
    }

    @GetMapping("/requests")
    public List<QRAccessRequestResponse> getVehicleAccessRequests(@RequestParam UUID vehicleProfileId) {
        return qrAccessService.getVehicleAccessRequests(vehicleProfileId);
    }

    @GetMapping("/requests/{token}")
    public PublicQRAccessRequestResponse getPublicRequest(@PathVariable String token) {
        return qrAccessService.getPublicRequest(token);
    }

    @PostMapping("/requests/{token}/mechanic-request")
    public MechanicAccessRequestResponse createMechanicRequest(
            @PathVariable String token,
            @RequestBody CreateMechanicAccessRequest request
    ) {
        return qrAccessService.createMechanicRequest(token, request);
    }

    @GetMapping("/requests/{token}/mechanic-request/status")
    public PublicMechanicRequestStatusResponse getMechanicRequestStatus(@PathVariable String token) {
        return qrAccessService.getMechanicRequestStatus(token);
    }
}
