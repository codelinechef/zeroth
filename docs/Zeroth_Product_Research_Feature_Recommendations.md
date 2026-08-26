You are working on the existing **Zeroth** project.

Before implementing any new features, I want you to act as a **senior product strategist, UX researcher, AI product architect, and technical researcher**.

Do NOT blindly implement a predefined list of features.

The goal is to determine what Zeroth should become as a **next-generation interactive research paper platform** that genuinely provides value to:

- Students
- Software engineers
- AI/ML engineers
- Working professionals
- Researchers
- Technical leaders
- People trying to understand complex technical research

The existing UI is minimal, clean, and research-oriented. Preserve this character.

Zeroth should NOT become a generic SaaS dashboard, generic AI chatbot, LMS, or AI wrapper.

---

# 1. First Understand the Existing Product

Before proposing anything:

- Inspect the entire existing codebase.
- Understand the current user journey.
- Understand the existing research-paper structure.
- Understand the current AI/RAG capabilities.
- Understand the existing Learn More/content system.
- Understand the existing About page.
- Understand the current navigation and interaction model.
- Understand the current frontend/backend architecture.
- Understand the current authentication capabilities, if any.
- Understand the current database/persistence layer, if any.
- Understand the existing design system.
- Understand how the application is currently deployed on Netlify.

Do not make assumptions about the existing implementation.

---

# 2. Research the Product Space

Before proposing features, perform focused research into how modern products are helping users consume, understand, explore, and work with technical/research content.

Look at relevant categories such as:

- Interactive research papers
- AI-powered research tools
- Scientific literature platforms
- Technical documentation platforms
- AI research assistants
- Academic discovery tools
- Knowledge-management products
- Technical learning platforms
- Developer-focused AI products
- Modern LLM interfaces
- Research visualization tools

Study what leading products do well and, more importantly:

- What problems they solve
- What users actually need
- Where current products fail
- What workflows remain unnecessarily difficult
- What could be improved with AI
- What could be improved with interaction/visualization
- What would genuinely save researchers and professionals time
- What features are useful versus merely impressive

Do not copy other products.

Use them as references for identifying **user problems, UX patterns, and opportunities**.

---

# 3. Identify Real User Problems

Think from the perspective of the actual Zeroth users.

Identify problems such as:

### Students

- Understanding difficult technical concepts
- Connecting prerequisites with advanced concepts
- Understanding formulas
- Knowing what to learn next
- Converting research into practical understanding

### Working Professionals

- Quickly understanding unfamiliar research
- Determining whether a paper is relevant
- Extracting actionable technical insights
- Comparing approaches
- Understanding implementation implications
- Connecting research to real-world engineering

### Researchers

- Exploring related work
- Understanding citations and research lineage
- Comparing methodologies
- Identifying limitations
- Finding gaps
- Navigating large amounts of technical information
- Connecting concepts across papers

### Engineers

- Understanding how research translates into systems
- Understanding trade-offs
- Comparing architectures
- Understanding implementation details
- Evaluating whether a technique is practical

Do not limit yourself to these examples.

Identify additional high-value problems through your research.

---

# 4. Generate Feature Opportunities

Based on:

1. The existing Zeroth product
2. The target users
3. Your research
4. Current AI capabilities
5. UX opportunities
6. Technical feasibility

generate potential features that could make Zeroth substantially more useful.

Think beyond obvious features like:

- Chat with AI
- Summarize paper
- Ask questions
- Notes
- Bookmarks

Those are baseline capabilities.

Look for **higher-leverage ideas**.

For example, investigate possibilities around:

- Research understanding
- Research comparison
- Research discovery
- Citation relationships
- Concept relationships
- Technical trade-offs
- Methodology analysis
- Research-to-implementation translation
- Interactive mathematics
- Interactive architecture
- Evidence tracing
- Source verification
- Research gaps
- Knowledge graphs
- Personal research context
- AI-assisted critical reading
- Multi-paper reasoning
- Research workflows
- Technical decision support

These are examples of directions to investigate, NOT requirements to implement.

---

# 5. Evaluate Every Proposed Feature

For every feature you propose, evaluate:

### User Value

Who benefits?

- Student
- Engineer
- Researcher
- Working professional
- Multiple groups

### Problem

What concrete problem does it solve?

### Existing Alternatives

How do people solve this today?

### Differentiation

Why would Zeroth be better?

### AI Opportunity

Does AI meaningfully improve this workflow?

### Technical Complexity

Low / Medium / High

### Implementation Requirements

What would be required technically?

### Data Requirements

Does it require:

- Database
- Vector database
- External APIs
- Authentication
- User history
- Additional infrastructure

### Performance Impact

Would it introduce expensive computation, rendering, network requests, or model calls?

### Product Risk

Could it make Zeroth feel cluttered, generic, distracting, or gimmicky?

### Strategic Value

Does it strengthen Zeroth's identity as an interactive research platform?

---

# 6. Prioritize the Opportunities

Create a prioritized recommendation.

Categorize features into:

### Tier 1 — Essential

Features that provide very high user value and should strongly be considered.

### Tier 2 — High Value

Features that substantially improve Zeroth but are not foundational.

### Tier 3 — Experimental

Interesting ideas worth experimenting with but requiring validation.

### Reject / Avoid

Features that sound impressive but do not provide enough value relative to their complexity.

Be brutally honest.

If an idea is unnecessary, say so.

---

# 7. Create 3 Product Directions

Instead of giving me one giant feature list, create **three possible product directions** for Zeroth.

For example:

### Direction A — Interactive Research Reader

Focus on making the research paper itself dramatically better to read, understand, navigate, and explore.

### Direction B — AI Research Workspace

Focus on helping professionals and researchers analyze, compare, and work with research.

### Direction C — Research-to-Engineering Platform

Focus on connecting academic research with practical engineering implementation.

These are examples.

Create the directions based on your actual research and understanding of the existing product.

For each direction explain:

- Core idea
- Target users
- Main problems solved
- Key features
- Differentiation
- Technical complexity
- Long-term potential
- Risks
- Why it fits or does not fit Zeroth

---

# 8. Give Me a Selection Matrix

Create a concise comparison matrix containing the strongest proposed features.

Include:

| Feature | Primary User | Problem Solved | User Value | Complexity | Differentiation | Recommendation |
|---|---|---|---|---|---|---|

Use clear recommendations such as:

- **Strongly Recommend**
- **Recommend**
- **Experiment**
- **Avoid**

---

# 9. Do Not Implement Yet

This is critical.

**Do NOT start implementing the new features yet.**

First provide me with:

1. Your understanding of the current Zeroth product.
2. The main user problems you identified.
3. Your research findings.
4. The strongest feature opportunities.
5. The three product directions.
6. The prioritized feature matrix.
7. Your recommended direction.
8. The features you believe should be implemented first.
9. Features you explicitly recommend NOT implementing.
10. Any architectural changes that would be required.

Wait for my selection before making significant implementation changes.

---

# 10. Challenge the Existing Product

Do not assume that everything currently planned is correct.

Explicitly identify:

- Features that are unnecessary
- Features that overlap
- Features that could make the product confusing
- Features that could negatively affect performance
- Features that would require excessive infrastructure
- Features that sound impressive but provide little real value
- UX patterns that could be improved
- Missing capabilities that would significantly increase user value

I want critical product analysis, not validation.

---

# 11. Product Philosophy

The central question should be:

> **How can Zeroth help a technical person understand, evaluate, and use research better than simply reading a PDF or asking a generic AI chatbot?**

Every recommendation should contribute toward answering that question.

Zeroth should feel like:

**Research Paper + Interactive Knowledge Layer + AI-Assisted Critical Thinking + Technical Exploration**

rather than:

**PDF Viewer + Chatbot + Dashboard**

---

# 12. Deployment & Architecture Constraints

The existing Zeroth website is deployed on **Netlify**.

Do not migrate the frontend away from Netlify.

If persistent user functionality is recommended:

- Use **PostgreSQL** for production persistence.
- Do not use SQLite for production persistence.
- Use a Netlify/serverless-compatible PostgreSQL architecture.
- Keep database credentials server-side.
- Never expose database credentials to the frontend.
- Never allow the browser to directly access PostgreSQL.
- Reuse any existing database/backend infrastructure where appropriate.
- Do not introduce infrastructure that is unnecessary for the selected features.

Keep the existing RAG/vector database architecture separate where appropriate.

Do not change existing ports.

Do not unnecessarily change the existing technology stack.

---

# 13. Responsive & Performance Requirements

Any feature eventually selected must work flawlessly across:

- Desktop
- Laptop
- Tablet
- iOS
- Android
- Portrait
- Landscape

The experience must remain:

- Smooth
- Responsive
- Stable
- Accessible
- Touch-friendly
- Free of layout overlaps
- Free of horizontal overflow
- Free of rendering issues
- Free of unnecessary layout shifts

Performance must be treated as a product requirement, not an afterthought.

Avoid unnecessary:

- Re-renders
- Client-side computation
- API calls
- Model calls
- Large bundles
- Heavy animations
- Memory usage
- Expensive visualizations

---

# 14. Final Recommendation

After completing the research and analysis, give me your **strongest recommendation**.

Do not simply list everything that could be built.

Tell me:

> **"If I were building Zeroth today, these are the 5–8 features I would build first, this is why, and these are the features I would deliberately ignore."**

Then wait for my decision.

Only after I select the direction/features should you produce the implementation plan and start modifying the codebase.