package com.trevora.api.features.serviceinput;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.trevora.api.features.auth.CurrentUserService;
import com.trevora.api.features.vehicle.VehicleService;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * What happens to a receipt's itemised lines when the owner saves a correction.
 *
 * <p>Saving rewrites a draft's items, and the line entries hang off those items
 * with {@code on delete cascade}. So every correction deletes the entire
 * itemised receipt and rebuilds it from the request — which makes what the
 * request says about lines, and what it leaves unsaid, the difference between
 * keeping the breakdown and losing it.
 *
 * <p>This is the case nothing covered while the lines were invisible in the UI.
 * They are visible now, which makes losing them far more expensive.
 */
class DraftItemCorrectionTest {

    private static final UUID DRAFT = UUID.randomUUID();

    private ServiceInputService service;
    private List<ServiceDraftItem> itemRows;
    private List<ServiceDraftLineEntry> entryRows;

    @BeforeEach
    void setUp() {
        itemRows = new ArrayList<>();
        entryRows = new ArrayList<>();

        ServiceDraftItemRepository items = mock(ServiceDraftItemRepository.class);
        ServiceDraftLineEntryRepository entries = mock(ServiceDraftLineEntryRepository.class);

        // Storage-shaped fakes rather than assertions on mock calls: the point
        // is what survives the round trip, which call-order assertions cannot
        // show.
        when(items.save(any(ServiceDraftItem.class))).thenAnswer(invocation -> {
            ServiceDraftItem item = invocation.getArgument(0);
            if (item.getItemId() == null) {
                ReflectionTestUtils.setField(item, "itemId", UUID.randomUUID());
            }
            itemRows.add(item);
            return item;
        });
        when(items.findByDraftIdOrderBySortOrder(any())).thenAnswer(invocation -> itemRows.stream()
                .sorted(Comparator.comparing(ServiceDraftItem::getSortOrder))
                .toList());
        when(entries.save(any(ServiceDraftLineEntry.class))).thenAnswer(invocation -> {
            ServiceDraftLineEntry entry = invocation.getArgument(0);
            ReflectionTestUtils.setField(entry, "entryId", UUID.randomUUID());
            entryRows.add(entry);
            return entry;
        });
        when(entries.findByItemIdInOrderByItemIdAscSortOrderAsc(any())).thenAnswer(invocation -> {
            List<UUID> itemIds = List.copyOf(invocation.getArgument(0));
            return entryRows.stream()
                    .filter(entry -> itemIds.contains(entry.getItemId()))
                    .sorted(Comparator.comparing(ServiceDraftLineEntry::getSortOrder))
                    .toList();
        });
        // The foreign key cascades, so deleting an item takes its lines with it.
        org.mockito.Mockito.doAnswer(invocation -> {
            List<UUID> doomed = itemRows.stream().map(ServiceDraftItem::getItemId).toList();
            entryRows.removeIf(entry -> doomed.contains(entry.getItemId()));
            itemRows.clear();
            return null;
        }).when(items).deleteByDraftId(any());

        service = new ServiceInputService(
                mock(ServiceDraftRepository.class),
                items,
                entries,
                mock(VehicleService.class),
                mock(OCRProcessingService.class),
                mock(VoiceProcessingService.class),
                mock(CurrentUserService.class),
                new ObjectMapper(),
                new ServiceClassificationService()
        );
    }

    @Test
    void everyLineSurvivesACorrectionThatSendsThemBack() {
        UUID itemId = seedBodyAndPaint();
        List<ServiceLineEntryRequest> sameLines = List.of(
                line("OPERATION", "PAINTING JOB", "2500.00"),
                line("PART", "FLOORMAT", "850.00"),
                line("MATERIAL", "TTY-DEGREASER", "285.00")
        );

        service.replaceDraftItems(DRAFT, List.of(item(itemId, "Body and paint", sameLines)), null);

        assertThat(lines()).extracting(ServiceDraftLineEntry::getDescription)
                .containsExactly("PAINTING JOB", "FLOORMAT", "TTY-DEGREASER");
        assertThat(lines()).extracting(ServiceDraftLineEntry::getKind)
                .containsExactly(ServiceLineKind.OPERATION, ServiceLineKind.PART, ServiceLineKind.MATERIAL);
        assertThat(lines()).extracting(entry -> entry.getLineTotal().toPlainString())
                .containsExactly("2500.00", "850.00", "285.00");
    }

    @Test
    void correctingOneLinePriceLeavesTheOthersAlone() {
        UUID itemId = seedBodyAndPaint();

        service.replaceDraftItems(DRAFT, List.of(item(itemId, "Body and paint", List.of(
                line("OPERATION", "PAINTING JOB", "11211.04"),
                line("PART", "FLOORMAT", "850.00"),
                line("MATERIAL", "TTY-DEGREASER", "285.00")
        ))), null);

        assertThat(lines()).extracting(entry -> entry.getLineTotal().toPlainString())
                .containsExactly("11211.04", "850.00", "285.00");
    }

    @Test
    void lineOrderFollowsTheOrderTheySentRatherThanTheOldOne() {
        UUID itemId = seedBodyAndPaint();

        service.replaceDraftItems(DRAFT, List.of(item(itemId, "Body and paint", List.of(
                line("PART", "FLOORMAT", "850.00"),
                line("OPERATION", "PAINTING JOB", "2500.00")
        ))), null);

        assertThat(lines()).extracting(ServiceDraftLineEntry::getDescription)
                .containsExactly("FLOORMAT", "PAINTING JOB");
        assertThat(lines()).extracting(ServiceDraftLineEntry::getSortOrder)
                .containsExactly(0, 1);
    }

    /**
     * The failure this contract exists to prevent. A client that knows nothing
     * about line entries — an older build, another caller — sends the fields it
     * does know and would otherwise delete the whole itemised receipt.
     */
    @Test
    void aRequestSilentAboutLinesKeepsTheOnesAlreadyThere() {
        UUID itemId = seedBodyAndPaint();

        service.replaceDraftItems(DRAFT, List.of(
                new ServiceItemRequest(itemId, "Body and paint", null, null, null, null)), null);

        assertThat(lines()).extracting(ServiceDraftLineEntry::getDescription)
                .containsExactly("PAINTING JOB", "FLOORMAT", "TTY-DEGREASER");
        assertThat(lines()).extracting(ServiceDraftLineEntry::getKind)
                .containsExactly(ServiceLineKind.OPERATION, ServiceLineKind.PART, ServiceLineKind.MATERIAL);
    }

    @Test
    void anEmptyListIsHowYouClearTheLines() {
        UUID itemId = seedBodyAndPaint();

        service.replaceDraftItems(DRAFT, List.of(item(itemId, "Body and paint", List.of())), null);

        assertThat(lines()).isEmpty();
    }

    @Test
    void aNewlyAddedServiceHasNoLinesToInherit() {
        seedBodyAndPaint();

        service.replaceDraftItems(DRAFT, List.of(
                new ServiceItemRequest(null, "Wheel alignment", null, null, null, null)), null);

        assertThat(lines()).isEmpty();
    }

    @Test
    void aBlankDescriptionIsDroppedRatherThanStored() {
        UUID itemId = seedBodyAndPaint();

        service.replaceDraftItems(DRAFT, List.of(item(itemId, "Body and paint", List.of(
                line("PART", "FLOORMAT", "850.00"),
                line("PART", "   ", "100.00")
        ))), null);

        assertThat(lines()).extracting(ServiceDraftLineEntry::getDescription).containsExactly("FLOORMAT");
    }

    @Test
    void anUnrecognisedKindLandsOnTheKindThatClaimsLeast() {
        UUID itemId = seedBodyAndPaint();

        service.replaceDraftItems(DRAFT, List.of(item(itemId, "Body and paint", List.of(
                line("SOMETHING_ELSE", "MYSTERY CHARGE", "50.00")
        ))), null);

        assertThat(lines()).singleElement()
                .extracting(ServiceDraftLineEntry::getKind)
                .isEqualTo(ServiceLineKind.MATERIAL);
    }

    @Test
    void linesFollowTheServiceTheyBelongToWhenThereAreSeveral() {
        UUID itemId = seedBodyAndPaint();

        service.replaceDraftItems(DRAFT, List.of(
                item(itemId, "Body and paint", List.of(line("OPERATION", "PAINTING JOB", "2500.00"))),
                item(null, "Oil change", List.of(
                        line("OPERATION", "CHANGE OIL", "300.00"),
                        line("PART", "OIL FILTER", "450.00")))
        ), null);

        List<ServiceDraftItem> saved = service.getItemsForDraft(DRAFT);
        assertThat(saved).extracting(ServiceDraftItem::getServiceType)
                .containsExactly("Body and paint", "Oil change");
        assertThat(saved.get(0).getLineEntries()).extracting(ServiceDraftLineEntry::getDescription)
                .containsExactly("PAINTING JOB");
        assertThat(saved.get(1).getLineEntries()).extracting(ServiceDraftLineEntry::getDescription)
                .containsExactly("CHANGE OIL", "OIL FILTER");
    }

    // ---- fixtures --------------------------------------------------------

    /** The Toyota body-and-paint invoice: an operation, a part, a consumable. */
    private UUID seedBodyAndPaint() {
        service.replaceDraftItems(DRAFT, List.of(item(null, "Body and paint", List.of(
                line("OPERATION", "PAINTING JOB", "2500.00"),
                line("PART", "FLOORMAT", "850.00"),
                line("MATERIAL", "TTY-DEGREASER", "285.00")
        ))), null);
        return service.getItemsForDraft(DRAFT).get(0).getItemId();
    }

    private ServiceItemRequest item(UUID itemId, String serviceType, List<ServiceLineEntryRequest> lines) {
        return new ServiceItemRequest(itemId, serviceType, null, null, null, lines);
    }

    private ServiceLineEntryRequest line(String kind, String description, String lineTotal) {
        return new ServiceLineEntryRequest(kind, description, null, null, null, new BigDecimal(lineTotal));
    }

    private List<ServiceDraftLineEntry> lines() {
        return service.getItemsForDraft(DRAFT).stream()
                .flatMap(item -> item.getLineEntries().stream())
                .toList();
    }
}
