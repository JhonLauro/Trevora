package com.trevora.api.features.concern;

import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Owner-facing concerns, nested under the vehicle they belong to.
 *
 * <p>Mechanics do not reach this controller. Their session is read-only and
 * gets its concerns folded into the history payload it already fetches, so the
 * shared view makes one request rather than two.
 */
@RestController
@RequestMapping("/api/vehicles/{vehicleId}/concerns")
public class ConcernController {
    private final ConcernService concernService;

    public ConcernController(ConcernService concernService) {
        this.concernService = concernService;
    }

    @GetMapping
    public List<ConcernResponse> list(@PathVariable UUID vehicleId) {
        return concernService.listForVehicle(vehicleId).stream()
                .map(ConcernResponse::from)
                .toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ConcernResponse create(
            @PathVariable UUID vehicleId,
            @Valid @RequestBody ConcernRequest request
    ) {
        return ConcernResponse.from(concernService.create(vehicleId, request));
    }

    @PutMapping("/{concernId}")
    public ConcernResponse update(
            @PathVariable UUID vehicleId,
            @PathVariable UUID concernId,
            @Valid @RequestBody ConcernRequest request
    ) {
        return ConcernResponse.from(concernService.updateNote(concernId, request));
    }

    /**
     * Resolve or reopen. A PATCH rather than two verbs because reopening is the
     * same act with the other answer, and an owner who ticked the wrong box on
     * the confirmation screen needs the way back to be as cheap as the way in.
     */
    @PatchMapping("/{concernId}/resolution")
    public ConcernResponse setResolution(
            @PathVariable UUID vehicleId,
            @PathVariable UUID concernId,
            @RequestBody ConcernResolutionRequest request
    ) {
        return ConcernResponse.from(concernService.setResolved(concernId, request.resolved()));
    }

    @DeleteMapping("/{concernId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID vehicleId, @PathVariable UUID concernId) {
        concernService.delete(concernId);
    }
}
