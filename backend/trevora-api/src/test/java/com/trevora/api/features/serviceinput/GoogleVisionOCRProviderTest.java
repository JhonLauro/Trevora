package com.trevora.api.features.serviceinput;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

class GoogleVisionOCRProviderTest {
    private final GoogleVisionOCRProvider provider = new GoogleVisionOCRProvider(new ObjectMapper(), "test-key");

    @Test
    void dropsBarcodeAndPictureBlocksAndKeepsTextBlocks() {
        String response = """
                {
                  "responses": [
                    {
                      "fullTextAnnotation": {
                        "text": "SHOP RECEIPT\\n1234567890123\\nOil Change PHP 500",
                        "pages": [
                          {
                            "blocks": [
                              {
                                "blockType": "TEXT",
                                "confidence": 0.98,
                                "paragraphs": [
                                  {
                                    "words": [
                                      {
                                        "symbols": [
                                          {"text": "S", "property": {}},
                                          {"text": "H", "property": {}},
                                          {"text": "O", "property": {}},
                                          {"text": "P", "property": {"detectedBreak": {"type": "EOL_SURE_SPACE"}}}
                                        ]
                                      }
                                    ]
                                  }
                                ]
                              },
                              {
                                "blockType": "BARCODE",
                                "confidence": 0.9,
                                "paragraphs": [
                                  {
                                    "words": [
                                      {
                                        "symbols": [
                                          {"text": "1", "property": {}},
                                          {"text": "2", "property": {"detectedBreak": {"type": "EOL_SURE_SPACE"}}}
                                        ]
                                      }
                                    ]
                                  }
                                ]
                              },
                              {
                                "blockType": "TEXT",
                                "confidence": 0.95,
                                "paragraphs": [
                                  {
                                    "words": [
                                      {
                                        "symbols": [
                                          {"text": "O", "property": {}},
                                          {"text": "i", "property": {}},
                                          {"text": "l", "property": {"detectedBreak": {"type": "SPACE"}}},
                                          {"text": "C", "property": {}},
                                          {"text": "h", "property": {}},
                                          {"text": "g", "property": {"detectedBreak": {"type": "EOL_SURE_SPACE"}}}
                                        ]
                                      }
                                    ]
                                  }
                                ]
                              }
                            ]
                          }
                        ]
                      }
                    }
                  ]
                }
                """;

        String result = provider.parseResponse(response);

        assertThat(result).contains("SHOP");
        assertThat(result).contains("Oil Chg");
        assertThat(result).doesNotContain("12");
    }

    @Test
    void dropsLowConfidenceBlocks() {
        String response = """
                {
                  "responses": [
                    {
                      "fullTextAnnotation": {
                        "text": "irrelevant fallback text",
                        "pages": [
                          {
                            "blocks": [
                              {
                                "blockType": "TEXT",
                                "confidence": 0.1,
                                "paragraphs": [
                                  {
                                    "words": [
                                      {
                                        "symbols": [
                                          {"text": "g", "property": {}},
                                          {"text": "a", "property": {}},
                                          {"text": "r", "property": {}},
                                          {"text": "b", "property": {"detectedBreak": {"type": "EOL_SURE_SPACE"}}}
                                        ]
                                      }
                                    ]
                                  }
                                ]
                              }
                            ]
                          }
                        ]
                      }
                    }
                  ]
                }
                """;

        String result = provider.parseResponse(response);

        assertThat(result).doesNotContain("garb");
        assertThat(result).isEqualTo("irrelevant fallback text");
    }

    @Test
    void fallsBackToFullTextWhenNoBlocksPresent() {
        String response = """
                {
                  "responses": [
                    {
                      "fullTextAnnotation": {
                        "text": "Plain fallback receipt text"
                      }
                    }
                  ]
                }
                """;

        String result = provider.parseResponse(response);

        assertThat(result).isEqualTo("Plain fallback receipt text");
    }

    @Test
    void throwsOnVisionErrorResponse() {
        String response = """
                {
                  "responses": [
                    {
                      "error": {"message": "Bad image data."}
                    }
                  ]
                }
                """;

        org.junit.jupiter.api.Assertions.assertThrows(
                ReceiptProcessingException.class,
                () -> provider.parseResponse(response)
        );
    }
}
