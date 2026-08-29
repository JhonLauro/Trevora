package com.trevora.api.features.serviceinput;

/**
 * A receipt upload the caller got wrong -- too many pages, so far. Distinct
 * from {@link ReceiptProcessingException}, which means OCR itself failed:
 * that one is our problem and answers 500, this one is the request's and
 * answers 400.
 */
public class ReceiptUploadException extends RuntimeException {
    public ReceiptUploadException(String message) {
        super(message);
    }
}
