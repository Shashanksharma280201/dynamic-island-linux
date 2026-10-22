# Contributing to Dynamic Island

Thanks for helping. Bug reports, ideas, docs fixes and code are all welcome.

## Reporting a bug or asking for something

Open an [issue](https://github.com/shashanksharma280201/dynamic-island-linux/issues/new/choose).
For a bug, say which system you're on (Ubuntu 24.04 on X11, macOS 15 on Apple
silicon…), what you did, what you expected and what happened. The log helps:
start the island from a terminal (`dynamic-island-linux`) and copy what it
prints.

Found a security problem? Please don't open an issue; see [SECURITY.md](SECURITY.md).

## Setting up

You need Node.js 22 and, for the end-to-end tests on Linux, `xvfb`, `dbus` and
`gdbus` (`sudo apt install xvfb dbus libglib2.0-bin`).

```bash
git clone https://github.com/shashanksharma280201/dynamic-island-linux.git
cd dynamic-island-linux
npm ci
npm run dev          # the app with hot reloading
```

## Before you open a pull request

```bash
npm run check        # typecheck, unit tests and a build
npm run test:e2e     # the real app under Xvfb (Linux)
```

- Keep a change to one thing, and add or update a test for it: unit tests for
  logic in `shared/` and `electron/`, an e2e check in `e2e/` for what you can
  see and click.
- Match the code around you: its naming, comments and the plain wording of the
  UI ("Couldn't convert it", not "Error: conversion failed").
- Say in the pull request what changed and how you checked it. Screenshots help
  for anything visual.
- New features go in [docs/features.md](docs/features.md) (and the README's short list if they're big), and in `CHANGELOG.md` under the next version.

## Branches

`main` is the Linux app and where pull requests go. The `mac` and `windows`
branches carry what's different on those systems (packaging, paths, a few
platform pieces) and are kept in sync by merging `main` into them. If your change
is specific to macOS or Windows, open the pull request against that branch.

## Where things are

[docs/development.md](docs/development.md) describes the code (its
[project layout](docs/development.md#project-layout) and
[how it works](docs/development.md#how-it-works)) and what the tests cover.

By contributing you agree that your work is released under the
[MIT License](LICENSE), and to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
