# Classification criteria for rows of `docs/decisions.md` (project owner's rule, 2026-10-05)

The owner's rule, verbatim (Arabic is authoritative):

> decisions.md للقرارات وحدَها.
> ١. القرار: حكمٌ يغيّر ما يُبنى أو كيف يعمل أو ما يُسمح به، ويبقى ساريًا بعد انتهاء المهمّة. ومنه: أحكامُ صاحب المشروع · وقواعدُ العمل الدائمة · وقراراتُ التصميم التي لا تُعكس.
> ٢. ما ليس قرارًا لا يدخله أبدًا، ومكانُه ملفُّ الوقائع: المهامُّ والطلباتُ التشغيلية · وإعدادُ الأجهزة والبرامج · والقياسُ والفحص · والدمجُ والحذفُ والنسخ · وكلُّ شأنٍ شخصيٍّ لصاحب المشروع خارج المشروع.
> ٣. الاختبارُ قبل أيّ صفٍّ جديد: «لو انتهت هذه المهمّة، أيبقى هذا ساريًا؟» فإن كان الجوابُ لا، فهو وقيعةٌ لا قرار.
> ٥. واحذف الآن كلَّ صفٍّ سُجّل لمهمّةٍ لا لقرار.

## Verdicts

**KEEP** (a decision): it changes what is built, how something works, or what is allowed, and it stays in force after the task that produced it ended. This includes:
* rulings by the project owner or the administration (often marked ⚖️, «بحكم صاحب المشروع», «قرار المالك»), including approvals of nominations and deferrals («يُؤجَّل», «لا يُبنى», «مرفوض»);
* standing work rules and quality rules (how to work, gates, testing discipline, what a report must contain, how to measure before fixing, naming rules);
* design and architecture decisions (data model, accounting treatment, tax treatment, isolation, numbering, which component owns what), whether built or not; a status like «مبنيّ · #123» on such a row means the decision was built, still KEEP;
* scope decisions and prohibitions, and regulatory interpretations adopted as a binding constraint on what is built.

**REMOVE** (not a decision): the row records a task or an event, and nothing in it stays in force after the task ended:
* directive rows: what a session was asked to do («توجيهُ الجلسة N», «الكتلة N: …» when it only lists tasks, «▶️ …» assignment rows);
* results rows: what a session did («✅ نتائجُ توجيه N», «ما وقع: …»);
* research assignments and research write ups whose only content is findings or a pointer to a document (no rule adopted in the row);
* measurements, audits, counts, inventories («قِيس», «عدٌّ», «جرد»);
* operational acts: merging, deleting branches or files, copying, backups taken, deployments, server actions, sending files to the owner, cleanup, device or software setup;
* personal matters of the owner outside the project.
* temporary holds that were later lifted («موقوف حتى …» that a later row lifted) count as task content.

**Mixed rows**: if a row is a directive or results row but ALSO contains a ruling or rule that is still in force and that is NOT recorded in its own separate row, the verdict is **KEEP** with kind `mixed`. If the row itself points to the separate rows holding its rulings (for example «أحكامُه في ق-X إلى ق-Y»), the directive row is **REMOVE**.

**When in doubt: KEEP** with kind `doubt`. Deleting a real decision is worse than keeping a task row.

## Output

For every row in the batch, one object, in the same order:

```json
{"line": 1234, "id": "١٦٢٨", "verdict": "KEEP", "kind": "ruling", "reason": "short reason, at most 15 words, English"}
```

`kind` is one of: `ruling` · `rule` · `design` · `scope` · `mixed` · `doubt` (for KEEP) and `directive` · `results` · `research` · `measurement` · `operation` · `personal` (for REMOVE).

Write the whole array as valid JSON (UTF8) to the output path you are given, using the Write tool. Do not modify any other file. Do not run git. Your final message: only the counts (KEEP total, REMOVE total, and per kind) and up to five rows you were least sure about (line and id).
