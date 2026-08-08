-- Flags a receipt's format (printed/handwritten/unsupported/unknown) so
-- handwritten or unsupported receipts get distinct, visible manual-review
-- attention beyond the routine "OCR is assistive, always verify" note that
-- already applies to every receipt. See lib/providers/ocr/types.ts's
-- needsSpecialReceiptReview() and lib/domain/job.ts's ReceiptFormat.
--
-- Also backfills two columns that DumpReceiptRecord (lib/domain/job.ts)
-- always carried (ocrProvider, ocrExtractedText) but migration
-- 00000000000007 never gave a home in the schema — a gap found while
-- adding this one, fixed here rather than left for later.

create type receipt_format as enum ('printed', 'handwritten', 'unsupported', 'unknown');

alter table job_completions
  add column receipt_format receipt_format,
  add column ocr_provider text,
  add column ocr_raw_text text;

create index job_completions_receipt_format_idx
  on job_completions (receipt_format)
  where receipt_format in ('handwritten', 'unsupported');
