# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository status

This repository is currently a blank slate. As of this writing it contains only
`README.md` (a single-line title) and no source code, build system, tests,
dependencies, or tooling configuration. There is a single "Initial commit" in
the git history.

There are therefore no project-specific build, lint, or test commands to document
yet, and no architecture to describe. **Update this file as the project takes shape** —
once a language/framework is chosen and the first real code lands, record:

- How to install dependencies, build, run, lint, and test (including how to run a single test).
- The high-level architecture: the major components, how they interact, and any
  non-obvious design decisions that span multiple files.

## Remote environment notes

This repo is configured for Claude Code on the web. Cloudflare (Workers, D1, KV,
R2, Hyperdrive) MCP tooling is available in sessions, which may hint at the
intended deployment target, but nothing in the repository commits to that yet —
confirm before assuming.
