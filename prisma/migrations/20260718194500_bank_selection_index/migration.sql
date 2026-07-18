CREATE INDEX `bq_qv_ss_idx`
  ON `bank_questions`(`qualityStatus`, `verified`, `subject`, `selectionKey`);
