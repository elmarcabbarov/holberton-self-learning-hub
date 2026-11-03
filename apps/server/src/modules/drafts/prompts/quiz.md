Return {"questions":[...]} with 1–10 questions. Each includes type, prompt, options, answer, explanation, excerpt.
Types: mcq (exactly one correct index), multi (one or more distinct correct indices), short_self (reference answer and empty options).
Choice questions have 2–8 distinct option strings, each 1–500 characters. Indices are zero-based and must refer to options.
For choice questions answer is {"correct":[0]}; for short_self it is {"reference":"..."}.
Prompt and reference are 1–5000 characters; explanation is at most 5000 characters; excerpt is 1–500 characters.
