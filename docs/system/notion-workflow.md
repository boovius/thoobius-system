# Notion Workflow Notes

Purpose: document the working local pattern for creating and populating Notion databases through the current API, especially when schema creation behaves inconsistently.

## Current reliable pattern for creating a database with schema

When using the current Notion API, creating a database can succeed visually while still leaving the underlying data source with only the default `Name` property.

The reliable sequence is:

1. **Create the database shell** via `POST /v1/databases`
2. **Read the returned `data_sources[0].id`** from the create response
3. **Patch the schema on the data source itself** via `PATCH /v1/data_sources/{data_source_id}`
4. **Verify the data source properties** via `GET /v1/data_sources/{data_source_id}`
5. **Seed rows/pages** using the database id via `POST /v1/pages`

## Important failure mode

A request can appear to work while the visible Notion database still shows only:
- `Name`

If that happens, the likely issue is:
- the database shell exists
- but the **data source schema never materialized**

Do **not** trust the database object alone. Inspect the data source properties directly.

## Practical heuristics

- If only `Name` appears in Notion UI, check the data source, not just the database object.
- Patching the database shell may appear successful but still fail to create usable columns.
- The safer path is create -> data source patch -> verify -> seed.
- For multi-column trackers, prefer fewer larger writes instead of many tiny edits.

## Worked example from 2026-04-12

While creating the shared movie-watch database for Josh and Clara:

- multiple attempts created databases that looked valid but only showed the `Name` column
- the fix was to patch the schema on the returned **data source id**
- once patched at the data-source layer, the requested columns materialized correctly and the movies could be seeded normally

## Recommended usage going forward

For future Notion database work:

- use this file as the first check before debugging
- treat `GET /v1/data_sources/{id}` as the source of truth for schema confirmation
- if schema materialization keeps causing trouble, consider evolving this into a small local helper script or a stronger Notion-specific workflow note
