-- Full-text index (D-033, D-054). title/body hold search-folded text; raw_* keep the original for snippets.
CREATE VIRTUAL TABLE `notes_fts` USING fts5(title, body, raw_title UNINDEXED, raw_body UNINDEXED, tokenize = 'unicode61 remove_diacritics 0');
