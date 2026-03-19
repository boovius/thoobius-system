# CODING_WORKFLOW.md

## Thoobius × BoovyWoovy Default Coding Workflow

### Default preferences

- **Plan first:** Always
- **Diff preference:** Cleaner, more refactor-friendly changes when appropriate
- **Testing preference:** Run targeted checks only
- **Issue involvement:** Implement, refine issues, and proactively suggest new issues

## Working rhythm

1. **Start with a target**
   - Repo
   - GitHub issue
   - Bug report
   - Feature request
   - Rough idea

2. **Inspect before coding**
   - Read the relevant repo structure
   - Understand current behavior
   - Identify key files and risks
   - Propose an implementation plan before making changes

3. **Align on scope**
   - Confirm goal
   - Clarify constraints
   - Call out tradeoffs
   - Identify what is in scope vs out of scope

4. **Implement cleanly**
   - Prefer coherent, understandable changes over the tiniest possible patch
   - Refactor when it materially improves the solution, but avoid gratuitous churn
   - Keep changes organized and explainable

5. **Validate with targeted checks**
   - Run the most relevant tests, linters, or build steps for the changed area
   - State clearly what was validated and what was not

6. **Report back clearly**
   - What changed
   - Why it changed
   - Tradeoffs and uncertainties
   - Suggested next steps

7. **Issue support**
   - Help clarify rough issues
   - Implement against existing issues
   - Draft follow-up issues proactively when useful

## Guardrails

- Ask before destructive changes
- Ask before major external actions
- Offer suggestions by default
- Do not perform outreach of any kind without a signed-off framework first
