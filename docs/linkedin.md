# LinkedIn — post and article

Two pieces for Zeroth. Both are written from measured figures only; every
number below appears on the site and traces to a committed file.

**Honesty constraint applied throughout:** no retrieval quality metrics are
claimed, because none are published yet. The hook is the access-control
finding, which is measured against exact search and therefore stands on its
own. Do not add a faithfulness or NDCG number to either piece until the golden
set supports one.

---

## PART 1 — THE POST

Aim: one specific, surprising, checkable number. Roughly 250 words, which is
where LinkedIn truncates on mobile at about line 3 — so the hook has to land in
the first two lines.

---

I gave a retrieval system row-level security, then measured what it cost.

A role that can see all 47 tenants recalls 0.850 of what exact search returns.

A role that can see one recalls 0.300.

Worse: for 6 of 12 queries it returns nothing at all — on queries that exact
search, under the identical policy, answers fine. The documents exist. The role
is allowed to read them. The index simply never reached them.

Here is the mechanism. An approximate index (HNSW) returns its nearest
neighbours by distance. Only then does the access policy discard the rows this
role may not see. Nothing refills the empty slots. The narrower the permissions,
the more of your top-10 is spent on rows the user will never be shown.

The obvious fix is to search wider and let the filter discard more. I measured
that too. Going from ef_search 40 to 800 — twenty times the work — moves the
single-tenant role from 0.300 to 0.667. It plateaus, well below the
unrestricted ceiling, and you pay the latency on every query.

Partitioning removes the problem instead of mitigating it: the index contains
only permitted rows, so there is nothing to post-filter away.

If you are building RAG over multi-tenant data, your recall number was almost
certainly measured as an admin. Your users are not admins.

Corpus, method and per-role numbers are public. Link in comments.

---

### Post variant B — for a security-leaning audience

Swap the opening if the feed you are posting into skews security rather than ML.

---

Most RAG access-control bugs are not leaks. They are silent under-retrieval.

I measured it. Same corpus, same queries, same index — only the permissions
change:

47 of 47 tenants visible → recall 0.850
12 of 47 → 0.667
1 of 47 → 0.300, and 6 of 12 queries return nothing at all

Nothing errors. Nobody sees data they should not. The system just quietly stops
finding things, and the only symptom is a user saying "it used to work."

The cause is ordering: an approximate index picks nearest neighbours first, the
policy filters second, and nothing backfills. Widening the search recovers part
of it and then plateaus — 20× the search width bought 0.300 → 0.667.

I also enforced the policy in the database rather than the application, which
means a bug in my code cannot skip it. 246 red-team cases check that, including
15 that re-run the retrieval query with the application's own tenant filter
removed. They still pass, which is the point: if removing the application filter
had leaked, the filter — not the database — was the boundary.

Numbers, corpus and method are public.

---

### Comment to post underneath (either variant)

Post this yourself as the first comment. LinkedIn suppresses reach on posts with
outbound links in the body.

    Full write-up, per-role numbers and the corpus manifest:
    <SITE URL>

    Two things I would flag before anyone cites this: it is 12 queries, so the
    shape of the result is trustworthy and the third decimal is not. And HNSW
    graph construction is non-deterministic, so re-running moves the figures by
    a few points.

---

## PART 2 — THE ARTICLE

Aim: 1,100–1,300 words. LinkedIn articles are read by a narrower, more technical
slice of your network, so this can carry the method and the caveats the post
cannot.

---

### Title

**What access control costs your retrieval system**

### Subtitle

I rebuilt a production RAG pipeline over public documents to measure the thing
nobody publishes: what happens to recall when the user cannot see everything.

---

Every RAG benchmark you have read was measured by an omniscient user.

The evaluation harness connects to the index, runs the query set, and computes
recall. It sees every document. Real users do not — they see their tenant, their
team, their clearance. And the number you shipped was not measured under those
conditions.

I wanted to know how much that mattered, so I built a system where I could
measure it.

#### The setup

Zeroth is an open reconstruction of a production confidential-document retrieval
platform, rebuilt from scratch over public documents so the architecture can be
inspected and argued with. The corpus is 662 documents and 51,310 chunks across
24,155 pages, drawn from SEC EDGAR filings, the CUAD contract set and IETF RFCs,
partitioned into 47 tenants.

The pipeline is conventional and deliberately so: BM25 and dense retrieval in
parallel, fused by reciprocal rank, reordered by a cross-encoder, then
schema-constrained generation with citation resolution and quote verification.
None of that is novel and I do not claim it is.

The part worth measuring is where the access control sits. It is enforced inside
the retrieval query, as PostgreSQL row-level security, under a role created
NOSUPERUSER NOBYPASSRLS. Not in application code. That distinction matters more
than it sounds, and I will come back to it.

#### What I measured

Recall here does not mean "did it find the right answer." It means: **what did
the approximate index lose, compared to exact search under the identical
policy?**

That definition is doing real work. It needs no human relevance judgments,
because exact search is its own ground truth — run the same query without the
approximation, under the same permissions, and compare. So this result stands
even though the project's relevance-judgment set is still incomplete.

Same corpus, same 12 queries, same index. The only variable is how many of the
47 tenants the querying role may read.

| tenants visible | recall@10 vs exact | queries returning nothing |
|---|---|---|
| 47 of 47 | 0.850 | 0 of 12 |
| 35 of 47 | 0.842 | 0 of 12 |
| 12 of 47 | 0.667 | 2 of 12 |
| 3 of 47 | 0.500 | 5 of 12 |
| 1 of 47 | 0.300 | 6 of 12 |

The last column is the one that should worry you. A single-tenant role gets an
empty result set for half the queries — queries that exact search, under exactly
the same policy, answers completely. The documents exist. The role is entitled
to them. The index never reached them.

#### Why it happens

An HNSW index is a graph you walk toward the nearest neighbours of your query
vector. It returns the closest k it found. Then the access policy runs and
discards the rows this role may not see.

Nothing refills the discarded slots.

If you asked for 10 and 7 of them belonged to tenants you cannot read, you get 3.
The narrower the role, the larger the fraction of the search budget spent on
rows that will be thrown away.

#### The obvious fix, and its ceiling

Search wider. Ask the index for far more candidates so that after filtering you
still have ten.

I measured that across a sweep of ef_search values. For the single-tenant role:

    ef_search    40 → recall 0.300
                100 → 0.608
                200 → 0.650
                400 → 0.658
                800 → 0.667

Twenty times the search width buys you from 0.300 to 0.667, and then it
plateaus — still well short of the 0.850 an unrestricted role gets, and you are
now paying that latency on every query in the system.

Partitioning removes the problem rather than mitigating it. One partition and
one index per tenant means the index contains only permitted rows, so there is
nothing to post-filter away. The cost moves from query time to build time, which
is where you want it.

#### The result I got wrong first

An earlier version of this measurement, on a synthetic corpus, found that
widening the search changed nothing at all. Recall stayed flat from ef_search 40
to 800.

That did not replicate on real documents, and the reason is instructive.

The synthetic corpus had generated tenant clusters that were almost perfectly
separated — inter-tenant cosine similarity of 0.014. A restricted role's nearest
neighbours were *entirely* other tenants at any search width, so widening the
search reached nothing new.

Real documents share vocabulary, boilerplate and structure. Contracts look like
other contracts. Tenant regions in the embedding space overlap, and that overlap
is exactly what a wider search exploits.

The synthetic result was not wrong; it was the worst case reported as the
typical one. If you are benchmarking multi-tenant retrieval on generated data,
you are probably measuring the pathological end of the distribution.

#### Enforcing the policy where a bug cannot skip it

The reason the access control lives in the database rather than the application:
an application-level filter is a control that a code path can forget.

The retrieval query does carry an explicit tenant predicate, but as a
performance hint — it lets Postgres prune partitions instead of scanning all 47
and applying the policy per row. It is not the security boundary.

To prove that, the red-team suite runs the real retrieval shapes with the
application's tenant predicate **removed**, leaving only the policy. If anything
leaked, the filter was doing the work and the database was not. Those 15 cases
pass, alongside 231 others covering cross-tenant reads, forged role values,
prompt injection, citation forgery and abstention bypass — 246 in total.

I also mutation-test the suite: deliberately break the policy three ways and
confirm it goes red. One of those mutations was not detected on the first run,
which told me the suite had a gap, and closing it added nine configuration
checks.

#### What this does not establish

It does not say the answers were worse. It measures what the index lost, not
whether the lost chunk mattered — that question needs relevance judgments, and I
have not published any.

It does not transfer. It is a property of this corpus, this tenant assignment
and this index configuration. A corpus whose tenants overlap more would lose
less.

And it is 12 queries. The shape of the result is stable. The third decimal is
not — HNSW graph construction is non-deterministic, and re-running moves these
figures by a few points.

#### The practical version

If you are building retrieval over data with per-user permissions:

Measure recall as your most restricted role, not as an admin. The gap is not a
rounding error.

Check for empty result sets specifically. They are the failure mode that does
not look like one — no error, no leak, just a user who says the search stopped
working.

Do not tune your way out of it. Widening the search is a partial, expensive
mitigation with a ceiling.

Partition if you can. Filtering after retrieval is the wrong order and no
parameter fixes an ordering problem.

And be careful benchmarking on synthetic tenants — you may be measuring the
worst case and shipping it as the average.

---

Full method, per-query numbers, the corpus manifest and the red-team results are
public at <SITE URL>. The evaluation harness is built but the quality metrics
are not published yet: the relevance-judgment set is incomplete, and five
queries produce confidence intervals half a point wide, which is not a result.

---

## Placeholders to fill before posting

- `<SITE URL>` — appears 3 times. Use the live address.
- Decide post variant A (ML audience) or B (security audience).
- The comment block goes in as the first comment, not in the post body.
