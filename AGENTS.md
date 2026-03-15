# AGENTS.md

## Purpose

This repository is a **collection of separate MVPs / prototypes / technical experiments**.

It is **not** a single unified application.
Do not assume one global runtime, one global dependency graph, or one root-level test command that applies to every folder.

## How to work in this repo

### 1. Treat each top-level sample directory as its own project
Examples:
- `nestjs-go-export-excel-wasm/`

Before making changes:
- identify the target sample directory;
- read that sample's local `README.md`;
- read that sample's local `AGENTS.md` if present.

### 2. Prefer local context over repo-wide assumptions
When editing or running commands:
- run install/build/test commands inside the relevant sample directory;
- avoid inventing root-level workflows if the sample is self-contained;
- avoid changing unrelated samples.

### 3. Keep documentation layered
- root `README.md` = repo-level orientation for humans;
- root `AGENTS.md` = repo-level navigation rules for LLMs/agents;
- nested `README.md` = sample-specific docs for humans;
- nested `AGENTS.md` = sample-specific implementation guidance for agents.

If you add a new sample, add both local docs.

### 4. Delete stale paths instead of preserving dead code
This repo should favor **current, runnable samples**.

If an old route, controller, script, or binary mirror is no longer part of the active solution:
- remove it;
- update docs/tests accordingly;
- do not keep non-working legacy paths "just in case".

### 5. Be explicit about experiment status
Samples here can be experimental, but should still be:
- reproducible;
- runnable;
- documented;
- testable where practical.

If something is intentionally limited, say so plainly in docs.

## Editing rules

### Safe assumptions
You may generally:
- add or improve local README files;
- add or improve AGENTS.md files;
- update CI for a specific sample;
- add tests that match actual live routes and behavior;
- remove dead code after confirming it is not wired into the current sample.

### Avoid
- creating fake root-level monorepo conventions that do not exist;
- claiming endpoints/scripts are supported if they are not registered or tested;
- duplicating binaries or mirrored artifacts unless there is a real runtime need;
- mixing unrelated samples into one shared runtime.

## Preferred workflow for agents

When asked to work on a sample:
1. locate the target folder;
2. inspect local docs and package/build files;
3. verify what is actually wired into the app;
4. update code, docs, tests together;
5. run the sample's real verification commands;
6. report what is confirmed vs what is only intended.

## Current known sample

### `nestjs-go-export-excel-wasm`
A NestJS sample comparing two Excel export strategies:
- `exceljs`
- Go/WASM

Backed by SQLite + Prisma in the current branch evolution.

For implementation details, see:
- `nestjs-go-export-excel-wasm/README.md`
- `nestjs-go-export-excel-wasm/AGENTS.md`
