package com.trevora.api.features.mechanicaccess;

import com.trevora.api.features.mechanicaccess.MechanicSearchResponse;
import com.trevora.api.features.mechanicaccess.MechanicSharedServiceRecordResponse;
import com.trevora.api.shared.exception.AccessRequestException;
import com.trevora.api.features.mechanicaccess.MechanicAccessSession;
import com.trevora.api.features.servicerecord.ServiceRecord;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MechanicSearchService {
    private final MechanicAccessService mechanicAccessService;

    public MechanicSearchService(MechanicAccessService mechanicAccessService) {
        this.mechanicAccessService = mechanicAccessService;
    }

    @Transactional
    public MechanicSearchResponse searchSharedRecords(UUID sessionId, String query) {
        String normalizedQuery = normalizeQuery(query);
        if (normalizedQuery == null) {
            throw new AccessRequestException("Search query is required.");
        }

        MechanicAccessSession session = mechanicAccessService.requireActiveReadOnlySession(sessionId);
        List<ServiceRecord> records = mechanicAccessService.getSessionRecords(session);
        List<ServiceRecord> matches = findMatches(records, normalizedQuery);
        List<MechanicSharedServiceRecordResponse> sharedMatches = matches.stream()
                .map(mechanicAccessService::toSharedRecord)
                .toList();

        return new MechanicSearchResponse(
                session.getMechanicAccessSessionId(),
                session.getVehicleId(),
                mechanicAccessService.vehicleLabel(session.getVehicleId()),
                normalizedQuery,
                answerFor(normalizedQuery, matches),
                sharedMatches.size(),
                sharedMatches,
                Instant.now()
        );
    }

    private List<ServiceRecord> findMatches(List<ServiceRecord> records, String query) {
        String lowerQuery = query.toLowerCase(Locale.ROOT);
        if (containsAny(lowerQuery, "latest", "most recent", "last service", "recent service")) {
            return records.stream().limit(1).toList();
        }
        return records.stream()
                .filter(record -> matches(record, lowerQuery))
                .toList();
    }

    private boolean matches(ServiceRecord record, String lowercaseQuery) {
        return containsIgnoreCase(record.getServiceType(), lowercaseQuery)
                || containsIgnoreCase(record.getShopName(), lowercaseQuery)
                || containsIgnoreCase(record.getPartsReplaced(), lowercaseQuery)
                || containsIgnoreCase(record.getLaborPerformed(), lowercaseQuery)
                || containsIgnoreCase(record.getRemarks(), lowercaseQuery)
                || semanticMatch(record, lowercaseQuery);
    }

    private boolean semanticMatch(ServiceRecord record, String lowercaseQuery) {
        String searchable = String.join(
                " ",
                valueOrEmpty(record.getServiceType()),
                valueOrEmpty(record.getPartsReplaced()),
                valueOrEmpty(record.getLaborPerformed()),
                valueOrEmpty(record.getRemarks())
        ).toLowerCase(Locale.ROOT);

        if (containsAny(lowercaseQuery, "oil", "filter")) {
            return containsAny(searchable, "oil", "filter");
        }
        if (containsAny(lowercaseQuery, "brake", "stopping")) {
            return containsAny(searchable, "brake", "pad", "rotor");
        }
        if (containsAny(lowercaseQuery, "battery", "start", "electrical")) {
            return containsAny(searchable, "battery", "alternator", "electrical");
        }
        if (containsAny(lowercaseQuery, "tire", "tyre", "wheel")) {
            return containsAny(searchable, "tire", "tyre", "wheel", "alignment");
        }
        return false;
    }

    private String answerFor(String query, List<ServiceRecord> matches) {
        if (matches.isEmpty()) {
            return "No approved shared records matched \"" + query + "\".";
        }

        ServiceRecord first = matches.get(0);
        String date = first.getServiceDate() == null
                ? "an unknown service date"
                : first.getServiceDate().format(DateTimeFormatter.ISO_LOCAL_DATE);
        String shop = first.getShopName() == null || first.getShopName().isBlank()
                ? "shop not provided"
                : first.getShopName();
        String cost = first.getTotalCost() == null ? "cost not provided" : "PHP " + first.getTotalCost();
        if (matches.size() == 1) {
            return "I found 1 approved shared record: "
                    + first.getServiceType()
                    + " on "
                    + date
                    + " at "
                    + shop
                    + " for "
                    + cost
                    + ".";
        }
        return "I found "
                + matches.size()
                + " approved shared records. The most recent match is "
                + first.getServiceType()
                + " on "
                + date
                + " at "
                + shop
                + ".";
    }

    private boolean containsIgnoreCase(String value, String lowercaseNeedle) {
        return value != null && value.toLowerCase(Locale.ROOT).contains(lowercaseNeedle);
    }

    private boolean containsAny(String value, String... needles) {
        for (String needle : needles) {
            if (value.contains(needle)) {
                return true;
            }
        }
        return false;
    }

    private String normalizeQuery(String query) {
        if (query == null || query.isBlank()) {
            return null;
        }
        return query.trim();
    }

    private String valueOrEmpty(String value) {
        return value == null ? "" : value;
    }
}
